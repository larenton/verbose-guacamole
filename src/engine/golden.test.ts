import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import { parsePlan, type ParseResult } from '../import/parseWorkbook';
import {
  allocated,
  byProduct,
  capacity,
  costByProduct,
  indexPlan,
  pinchPoints,
  utilisation,
  type PlanIndex,
} from './index';

// ─────────────────────────────────────────────────────────────────────────────
// Migration-fidelity golden test. Reads the real seed workbook (gitignored — it
// holds salary data), parses it, and asserts the engine reproduces every total
// in `By Product` and `Cost by Product` cell-for-cell, plus each person's
// TOTAL DAYS / CAPACITY rows and the known LD2 tolerance pinch.
//
// The workbook is not committed, so in CI (where it is absent) this suite skips.
// Run it locally with the seed present to satisfy the acceptance criterion.
// ─────────────────────────────────────────────────────────────────────────────

const FILE = path.resolve(process.cwd(), 'H2_Team_Schedule_Resourcing_v3.xlsx');
const hasFile = fs.existsSync(FILE);
const suite = hasFile ? describe : describe.skip;

if (!hasFile) {
  // eslint-disable-next-line no-console
  console.warn(
    `\n[golden] seed workbook not found at ${FILE} — skipping migration-fidelity tests.\n`,
  );
}

type Row = (string | number | null)[];
function sheetRows(wb: XLSX.WorkBook, name: string): Row[] {
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[name]!, { header: 1, raw: true, defval: null });
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

// Product order as laid out in the By Product / Cost by Product sheets (XX excluded).
const SHEET_PRODUCTS = ['H1', 'ES', 'CD', 'HM', 'ID', 'DM', 'PF'];
const FIRST = 1; // column B — first month in the computed sheets

suite('migration fidelity: seed workbook v3', () => {
  let wb: XLSX.WorkBook;
  let parsed: ParseResult;
  let idx: PlanIndex;

  beforeAll(() => {
    wb = XLSX.readFile(FILE);
    parsed = parsePlan(wb);
    idx = indexPlan(parsed.plan);
  });

  it('parses the expected shape (13 people, 30 months, 8 products)', () => {
    expect(parsed.report.peopleCount).toBe(13);
    expect(parsed.report.monthCount).toBe(30);
    expect(parsed.report.productCount).toBe(8);
    expect(parsed.report.assignmentCount).toBeGreaterThan(0);
    expect(parsed.report.skipped).toEqual([]);
  });

  it('reproduces the By Product days table cell-for-cell', () => {
    const rows = sheetRows(wb, 'By Product');
    const res = byProduct(idx, SHEET_PRODUCTS, idx.months);

    SHEET_PRODUCTS.forEach((_code, ri) => {
      const sheetRow = rows[4 + ri]!;
      const engineRow = res.rows[ri]!;
      idx.months.forEach((_m, mi) => {
        expect(engineRow.daysByMonth[mi]).toBe(num(sheetRow[FIRST + mi]));
      });
    });

    // TOTAL DAYS row (sheet row index 11)
    const totalRow = rows[11]!;
    idx.months.forEach((_m, mi) => {
      expect(res.totalDaysByMonth[mi]).toBe(num(totalRow[FIRST + mi]));
    });
  });

  it('reproduces the By Product FTE table (≤ 0.01 drift)', () => {
    const rows = sheetRows(wb, 'By Product');
    const res = byProduct(idx, SHEET_PRODUCTS, idx.months);

    SHEET_PRODUCTS.forEach((_code, ri) => {
      const sheetRow = rows[15 + ri]!; // FTE table starts at row 15
      const engineRow = res.rows[ri]!;
      idx.months.forEach((_m, mi) => {
        expect(engineRow.fteByMonth[mi]).toBeCloseTo(num(sheetRow[FIRST + mi]), 6);
      });
    });

    const totalFteRow = rows[22]!;
    idx.months.forEach((_m, mi) => {
      expect(res.totalFteByMonth[mi]).toBeCloseTo(num(totalFteRow[FIRST + mi]), 6);
    });
  });

  it('reproduces the Cost by Product table (≤ $1 drift) incl. yearly + grand totals', () => {
    const rows = sheetRows(wb, 'Cost by Product');
    const res = costByProduct(idx, SHEET_PRODUCTS, idx.months);

    // Per-month costs
    SHEET_PRODUCTS.forEach((_code, ri) => {
      const sheetRow = rows[4 + ri]!;
      const engineRow = res.rows[ri]!;
      idx.months.forEach((_m, mi) => {
        expect(engineRow.costByMonth[mi]).toBeCloseTo(num(sheetRow[FIRST + mi]), 0);
      });
      // Yearly columns AF/AG/AH (indexes 31/32/33) and Total AI (34)
      expect(engineRow.costByYear[0]).toBeCloseTo(num(sheetRow[31]), 0); // 2026
      expect(engineRow.costByYear[1]).toBeCloseTo(num(sheetRow[32]), 0); // 2027
      expect(engineRow.costByYear[2]).toBeCloseTo(num(sheetRow[33]), 0); // 2028
      expect(engineRow.totalCost).toBeCloseTo(num(sheetRow[34]), 0);
    });

    // TOTAL row (sheet row index 11) and grand total
    const totalRow = rows[11]!;
    idx.months.forEach((_m, mi) => {
      expect(res.totalCostByMonth[mi]).toBeCloseTo(num(totalRow[FIRST + mi]), 0);
    });
    expect(res.grandTotalCost).toBeCloseTo(num(totalRow[34]), 0);
    // Sanity anchor against the visible grand total.
    expect(res.grandTotalCost).toBeCloseTo(3177781.82, 0);
  });

  it('reproduces every person TOTAL DAYS and CAPACITY row', () => {
    for (const person of idx.people) {
      const totalRow = parsed.report.personTotalDaysRow[person.id];
      const capRow = parsed.report.personCapacityRow[person.id];
      expect(totalRow, `TOTAL DAYS for ${person.name}`).toBeDefined();
      expect(capRow, `CAPACITY for ${person.name}`).toBeDefined();

      idx.months.forEach((m, mi) => {
        // allocated (all products incl. XX) must equal the sheet's TOTAL DAYS
        expect(allocated(idx, person.id, m.id)).toBe(totalRow![mi]);
        // capacity must equal the sheet's CAPACITY row
        expect(capacity(idx, person.id, m.id)).toBe(capRow![mi]);
      });
    }
  });

  it('flags Learning Designer 2 at 115% Jul-27→Jan-28 as within tolerance, not breach', () => {
    const ld2 = idx.people.find((p) => p.name.startsWith('Learning Designer 2'))!;
    expect(ld2).toBeDefined();

    // Jul-27 = 2027-07: 23 allocated / 20 capacity = 115% exactly.
    expect(allocated(idx, ld2.id, '2027-07')).toBe(23);
    expect(utilisation(idx, ld2.id, '2027-07')).toBeCloseTo(1.15, 9);

    const ld2Pinches = pinchPoints(idx).filter((p) => p.personId === ld2.id);
    expect(ld2Pinches.length).toBeGreaterThan(0);
    // The deliberate pinch is within tolerance — no month tips into breach.
    expect(ld2Pinches.every((p) => p.band === 'tolerance')).toBe(true);
    const jul27 = ld2Pinches.find((p) => p.monthId === '2027-07')!;
    expect(jul27.band).toBe('tolerance');
  });
});
