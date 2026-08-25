import XLSX from 'xlsx-js-style';
import type { Plan } from '../model/types';
import { PRODUCT_CODES, PRODUCT_META } from '../model/products';
import {
  allocated,
  capacity,
  indexPlan,
  personProductMonthDays,
  productMonthDays,
  type PlanIndex,
} from '../engine';

// ─────────────────────────────────────────────────────────────────────────────
// Export the full workbook. The app is the master; Excel stays downstream for
// SteerCo packs, Finance and business-case appendices — so the export must be
// genuinely good: By Product and Cost by Product are LIVE FORMULAS over the
// Team Schedule (Finance sees the working), with no external links.
//
// Formula cells also carry a cached value (the engine's number) so the workbook
// reads correctly the instant it opens and still recalculates when edited.
//
// Colour conventions (as in the source): blue = input, green = cross-sheet link,
// black = formula, yellow fill = key inputs, red fill = over-allocation.
// ─────────────────────────────────────────────────────────────────────────────

const BLUE = { font: { color: { rgb: '0000CC' } } };
const GREEN = { font: { color: { rgb: '008000' } } };
const BLACK = { font: { color: { rgb: '000000' } } };
const BOLD = { font: { bold: true } };
const HEADER = { font: { bold: true, color: { rgb: '1F2937' } }, fill: { fgColor: { rgb: 'F1F5F9' } } };
const YELLOW = { fill: { fgColor: { rgb: 'FFF9C4' } } };
const RED = { fill: { fgColor: { rgb: 'FFCDD2' } } };
const TITLE = { font: { bold: true, sz: 13 } };

type Style = Record<string, unknown>;
interface Cell {
  v?: string | number;
  f?: string;
  t?: 's' | 'n';
  s?: Style;
}

const col = (i: number) => XLSX.utils.encode_col(i);
const S = (a: Style, b: Style): Style => ({ ...a, ...b, font: { ...(a.font as object), ...(b.font as object) } });

const txt = (v: string, s?: Style): Cell => ({ v, t: 's', s });
const num = (v: number, s?: Style): Cell => ({ v, t: 'n', s });
/** A formula cell with a cached numeric value. */
const f = (formula: string, value: number, s?: Style): Cell => ({ f: formula, v: value, t: 'n', s: s ?? BLACK });
const EMPTY: Cell = {};

function gridToSheet(grid: Cell[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxCol = 0;
  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell == null || (cell.v === undefined && cell.f === undefined)) return;
      ws[XLSX.utils.encode_cell({ r, c })] = cell as XLSX.CellObject;
      if (c > maxCol) maxCol = c;
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, grid.length - 1), c: maxCol } });
  return ws;
}

// ── People & Rates ────────────────────────────────────────────────────────────

function peopleSheet(plan: Plan): XLSX.WorkSheet {
  const wdy = plan.settings.workingDaysPerYear;
  const grid: Cell[][] = [];
  grid.push([txt('People, Rates, Availability and Funding', TITLE)]);
  grid.push([]);
  grid.push(
    ['Person', 'Role', 'Pool / Type', 'Annual cost ($, fully loaded)', 'Daily rate ($)', 'Availability to portfolio (FTE)', 'Funding treatment'].map(
      (h) => txt(h, HEADER),
    ),
  );
  plan.people.forEach((p) => {
    const rowNo = grid.length + 1;
    grid.push([
      txt(p.name),
      txt(p.role),
      txt(p.pool),
      num(p.annualCost, S(BLUE, YELLOW)),
      f(`D${rowNo}/${wdy}`, p.annualCost / wdy, BLACK),
      num(p.fteAvailability, S(BLUE, YELLOW)),
      txt(p.fundingTreatment),
    ]);
  });
  grid.push([]);
  grid.push([txt(`Costs are planning placeholders (align with Finance). Daily rate assumes ${wdy} working days p.a.`)]);
  const ws = gridToSheet(grid);
  ws['!cols'] = [{ wch: 30 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 34 }];
  return ws;
}

// ── Team Schedule ─────────────────────────────────────────────────────────────
// Layout: A person, B code, C focus, D..(D+29) months, Total, Daily rate.

interface ScheduleLayout {
  ws: XLSX.WorkSheet;
  monthCols: number[];
  totalCol: number;
  rateCol: number;
  dataFirstRow: number;
  dataLastRow: number;
}

function scheduleSheet(idx: PlanIndex): ScheduleLayout {
  const plan = idx.plan;
  const months = idx.months;
  const FIRST = 3;
  const monthCols = months.map((_, i) => FIRST + i);
  const totalCol = FIRST + months.length;
  const rateCol = totalCol + 1;

  const peopleRateRow: Record<string, number> = {};
  plan.people.forEach((p, i) => (peopleRateRow[p.id] = 4 + i));

  const grid: Cell[][] = [];
  grid.push([txt('Team Schedule — days per person per product per month', TITLE)]);
  grid.push([txt('Blue = editable days. Person blocks end with TOTAL vs CAPACITY; red = over-allocated.')]);

  const header: Cell[] = [txt('Person', HEADER), txt('Prod', HEADER), txt('Project / focus', HEADER)];
  months.forEach((m) => header.push(txt(m.label, HEADER)));
  header.push(txt('Total days', HEADER), txt('Daily rate ($)', HEADER));
  grid.push(header);

  const wdRow: Cell[] = [txt('Working days per month (1.0 FTE)'), EMPTY, EMPTY];
  months.forEach((m) => wdRow.push(num(m.workingDays, BLUE)));
  grid.push(wdRow);

  let dataFirstRow = Infinity;
  let dataLastRow = 0;

  for (const person of idx.people) {
    grid.push([txt(person.name, BOLD), EMPTY, txt(person.role, { font: { italic: true, color: { rgb: '64748B' } } })]);
    const blockHeaderRow = grid.length;

    const lines = idx.products
      .filter(
        (product) =>
          idx.months.some((m) => personProductMonthDays(idx, person.id, product.id, m.id) > 0) ||
          plan.focusByLine[`${person.id}::${product.id}`] !== undefined,
      )
      .sort((a, b) => a.order - b.order);

    for (const product of lines) {
      const rowNo = grid.length + 1;
      dataFirstRow = Math.min(dataFirstRow, rowNo);
      dataLastRow = Math.max(dataLastRow, rowNo);
      const focus = plan.focusByLine[`${person.id}::${product.id}`] ?? PRODUCT_META[product.code].name;
      const row: Cell[] = [txt(person.name), txt(product.code), txt(focus)];
      let lineTotal = 0;
      months.forEach((m) => {
        const d = personProductMonthDays(idx, person.id, product.id, m.id);
        lineTotal += d;
        row.push(d ? num(d, BLUE) : EMPTY);
      });
      row.push(f(`SUM(${col(monthCols[0]!)}${rowNo}:${col(monthCols[months.length - 1]!)}${rowNo})`, lineTotal, BLACK));
      row.push(f(`'People & Rates'!E${peopleRateRow[person.id]}`, idx.ratePerDay.get(person.id) ?? 0, GREEN));
      grid.push(row);
    }

    const firstAssignRow = blockHeaderRow + 1;
    const lastAssignRow = grid.length;

    const totalRow: Cell[] = [txt('TOTAL DAYS', BOLD), EMPTY, EMPTY];
    let personTotalDays = 0;
    months.forEach((m, i) => {
      const c = col(monthCols[i]!);
      const alloc = allocated(idx, person.id, m.id);
      personTotalDays += alloc;
      const over = alloc > capacity(idx, person.id, m.id);
      totalRow.push(f(`SUM(${c}${firstAssignRow}:${c}${lastAssignRow})`, alloc, over ? S(BOLD, RED) : BOLD));
    });
    totalRow.push(f(`SUM(${col(totalCol)}${firstAssignRow}:${col(totalCol)}${lastAssignRow})`, personTotalDays, BOLD));
    grid.push(totalRow);

    const capRow: Cell[] = [txt('CAPACITY (days)'), EMPTY, EMPTY];
    months.forEach((m, i) => {
      const c = col(monthCols[i]!);
      capRow.push(f(`${c}4*${person.fteAvailability}`, capacity(idx, person.id, m.id), BLACK));
    });
    capRow.push(EMPTY);
    grid.push(capRow);

    grid.push([]);
  }

  const ws = gridToSheet(grid);
  ws['!cols'] = [{ wch: 28 }, { wch: 6 }, { wch: 40 }, ...months.map(() => ({ wch: 6 })), { wch: 10 }, { wch: 12 }];
  return { ws, monthCols, totalCol, rateCol, dataFirstRow, dataLastRow };
}

// ── By Product (live formulas + cached values) ────────────────────────────────

function byProductSheet(idx: PlanIndex, layout: ScheduleLayout): XLSX.WorkSheet {
  const months = idx.months;
  const TS = "'Team Schedule'";
  const codes = PRODUCT_CODES.filter((c) => c !== 'XX');
  const grid: Cell[][] = [];
  grid.push([txt('Demand by product (computed from Team Schedule)', TITLE)]);
  grid.push([]);
  grid.push([txt('Days by product', BOLD)]);

  const header: Cell[] = [txt('Product', HEADER)];
  months.forEach((m) => header.push(txt(m.label, HEADER)));
  grid.push(header);

  const daysFirstRow = grid.length + 1;
  codes.forEach((code) => {
    const meta = PRODUCT_META[code];
    const row: Cell[] = [txt(`${meta.name} (${code})`)];
    months.forEach((m, i) => {
      const sc = col(layout.monthCols[i]!);
      row.push(f(`SUMIF(${TS}!$B:$B,"${code}",${TS}!${sc}:${sc})`, productMonthDays(idx, code, m.id), GREEN));
    });
    grid.push(row);
  });
  const daysTotalNo = grid.length + 1;
  const totalRow: Cell[] = [txt('TOTAL DAYS', BOLD)];
  months.forEach((m, i) => {
    const c = col(1 + i);
    const total = codes.reduce((s, code) => s + productMonthDays(idx, code, m.id), 0);
    totalRow.push(f(`SUM(${c}${daysFirstRow}:${c}${daysTotalNo - 1})`, total, BOLD));
  });
  grid.push(totalRow);

  grid.push([]);
  grid.push([txt('FTE by product (days ÷ working days)', BOLD)]);
  const fteHeader: Cell[] = [txt('Product', HEADER)];
  months.forEach((m) => fteHeader.push(txt(m.label, HEADER)));
  grid.push(fteHeader);
  const fteFirstRow = grid.length + 1;
  codes.forEach((code, ci) => {
    const meta = PRODUCT_META[code];
    const row: Cell[] = [txt(`${meta.name} (${code})`)];
    months.forEach((m, i) => {
      const c = col(1 + i);
      const daysRow = daysFirstRow + ci;
      const wdCell = `${TS}!${col(layout.monthCols[i]!)}4`;
      const val = m.workingDays === 0 ? 0 : productMonthDays(idx, code, m.id) / m.workingDays;
      row.push(f(`${c}${daysRow}/${wdCell}`, val, BLACK));
    });
    grid.push(row);
  });
  const fteTotalNo = grid.length + 1;
  const fteTotal: Cell[] = [txt('TOTAL FTE', BOLD)];
  months.forEach((m, i) => {
    const c = col(1 + i);
    const total = codes.reduce(
      (s, code) => s + (m.workingDays === 0 ? 0 : productMonthDays(idx, code, m.id) / m.workingDays),
      0,
    );
    fteTotal.push(f(`SUM(${c}${fteFirstRow}:${c}${fteTotalNo - 1})`, total, BOLD));
  });
  grid.push(fteTotal);

  const ws = gridToSheet(grid);
  ws['!cols'] = [{ wch: 42 }, ...months.map(() => ({ wch: 8 }))];
  return ws;
}

// ── Cost by Product (live formulas + cached values) ───────────────────────────

function costByProductSheet(idx: PlanIndex, layout: ScheduleLayout): XLSX.WorkSheet {
  const months = idx.months;
  const TS = "'Team Schedule'";
  const codes = PRODUCT_CODES.filter((c) => c !== 'XX');
  const r0 = layout.dataFirstRow;
  const r1 = layout.dataLastRow;
  const rateCol = col(layout.rateCol);

  const costFor = (code: string, monthId: string): number => {
    let cost = 0;
    for (const person of idx.people) {
      const d = personProductMonthDays(idx, person.id, code, monthId);
      if (d) cost += d * (idx.ratePerDay.get(person.id) ?? 0);
    }
    return cost;
  };

  const grid: Cell[][] = [];
  grid.push([txt('Indicative people cost by product (days × daily rate)', TITLE)]);
  grid.push([txt('Live formulas over the Team Schedule — no external links.')]);
  grid.push([]);

  const header: Cell[] = [txt('Product', HEADER)];
  months.forEach((m) => header.push(txt(m.label, HEADER)));
  header.push(txt('Total', HEADER));
  grid.push(header);

  const firstProdRow = grid.length + 1;
  codes.forEach((code) => {
    const meta = PRODUCT_META[code];
    const row: Cell[] = [txt(`${meta.name} (${code})`)];
    let rowTotal = 0;
    months.forEach((m, i) => {
      const mc = col(layout.monthCols[i]!);
      const val = costFor(code, m.id);
      rowTotal += val;
      row.push(
        f(
          `SUMPRODUCT((${TS}!$B$${r0}:$B$${r1}="${code}")*(${TS}!${mc}$${r0}:${mc}$${r1})*(${TS}!$${rateCol}$${r0}:$${rateCol}$${r1}))`,
          val,
          GREEN,
        ),
      );
    });
    const rowNo = grid.length + 1;
    row.push(f(`SUM(${col(1)}${rowNo}:${col(months.length)}${rowNo})`, rowTotal, BOLD));
    grid.push(row);
  });
  const totalNo = grid.length + 1;
  const totalRow: Cell[] = [txt('TOTAL', BOLD)];
  months.forEach((m, i) => {
    const c = col(1 + i);
    const total = codes.reduce((s, code) => s + costFor(code, m.id), 0);
    totalRow.push(f(`SUM(${c}${firstProdRow}:${c}${totalNo - 1})`, total, BOLD));
  });
  const totCol = col(months.length + 1);
  const grand = months.reduce((s, m) => s + codes.reduce((ss, code) => ss + costFor(code, m.id), 0), 0);
  totalRow.push(f(`SUM(${totCol}${firstProdRow}:${totCol}${totalNo - 1})`, grand, BOLD));
  grid.push(totalRow);

  const ws = gridToSheet(grid);
  ws['!cols'] = [{ wch: 42 }, ...months.map(() => ({ wch: 10 })), { wch: 12 }];
  return ws;
}

function readmeSheet(plan: Plan): XLSX.WorkSheet {
  const grid: Cell[][] = [
    [txt('Applied Programs — H2 Team Schedule (exported from the Resourcing Dashboard)', TITLE)],
    [],
    [txt('Team Schedule is the source (blue = input days). By Product and Cost by Product are live formulas — do not edit.')],
    [txt('Legend: blue = input; black = formula; green = link to another sheet; yellow = key inputs; red = over-allocation.')],
    [txt(`Tolerance: up to ${Math.round(plan.settings.toleranceCeiling * 100)}% of capacity is an accepted planning position.`)],
    [txt(`Daily rate basis: fully-loaded annual cost ÷ ${plan.settings.workingDaysPerYear} working days.`)],
    [txt(`Exported ${new Date().toLocaleString('en-AU')}.`)],
  ];
  const ws = gridToSheet(grid);
  ws['!cols'] = [{ wch: 120 }];
  return ws;
}

/** Build the full workbook and return it as an ArrayBuffer (xlsx). */
export function buildWorkbook(plan: Plan): ArrayBuffer {
  const idx = indexPlan(plan);
  const wb = XLSX.utils.book_new();
  const layout = scheduleSheet(idx);
  XLSX.utils.book_append_sheet(wb, readmeSheet(plan), 'Read Me');
  XLSX.utils.book_append_sheet(wb, peopleSheet(plan), 'People & Rates');
  XLSX.utils.book_append_sheet(wb, layout.ws, 'Team Schedule');
  XLSX.utils.book_append_sheet(wb, byProductSheet(idx, layout), 'By Product');
  XLSX.utils.book_append_sheet(wb, costByProductSheet(idx, layout), 'Cost by Product');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/** Trigger a browser download of the exported workbook. */
export function downloadWorkbook(plan: Plan, filename = 'H2_Team_Schedule_Resourcing_export.xlsx'): void {
  const buf = buildWorkbook(plan);
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
