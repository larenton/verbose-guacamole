import type { WorkBook } from 'xlsx';
import * as XLSX from 'xlsx';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  lineKey,
  type Assignment,
  type Month,
  type Person,
  type Plan,
  type Product,
  type ProductCode,
} from '../model/types';
import { PRODUCT_CODES, PRODUCT_META } from '../model/products';

// ─────────────────────────────────────────────────────────────────────────────
// One-time migration: read H2_Team_Schedule_Resourcing_v3.xlsx into a normalised
// Plan. After import, the app is the source of truth and Excel is export-only.
//
// Sheet geometry (v3):
//   People & Rates : data rows 4+ (0-idx 3+), cols A..G
//   Team Schedule  : month labels row 4 (0-idx 3), working days row 5 (0-idx 4),
//                    person blocks from row 7 (0-idx 6); product code in col B,
//                    months in cols D:AG (0-idx 3..32), TOTAL/CAPACITY rows end
//                    each block.
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_PEOPLE = 'People & Rates';
const SHEET_SCHEDULE = 'Team Schedule';

const FIRST_MONTH_COL = 3; // column D
const LAST_MONTH_COL = 32; // column AG

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface ParseReport {
  peopleCount: number;
  assignmentCount: number;
  monthCount: number;
  productCount: number;
  /** Human-readable notes about anything skipped or defaulted. */
  skipped: string[];
  warnings: string[];
  /** Workbook TOTAL DAYS row per person, aligned to month order — for verification. */
  personTotalDaysRow: Record<string, number[]>;
  /** Workbook CAPACITY (days) row per person, aligned to month order. */
  personCapacityRow: Record<string, number[]>;
}

export interface ParseResult {
  plan: Plan;
  report: ParseReport;
}

type Row = (string | number | null)[];

function rowsOf(wb: WorkBook, sheet: string): Row[] {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Missing sheet: "${sheet}"`);
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null });
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // drop parentheticals like "(TBC name)"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

/** Parse a "Jul-26" label into a Month (order assigned by caller). */
function parseMonthLabel(label: string, order: number, workingDays: number): Month | null {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const monthNo = MONTH_NAMES.indexOf(m[1]!) + 1;
  if (monthNo === 0) return null;
  const year = 2000 + parseInt(m[2]!, 10);
  const id = `${year}-${String(monthNo).padStart(2, '0')}`;
  return { id, label: label.trim(), year, monthNo, workingDays, order };
}

// ── People ───────────────────────────────────────────────────────────────────

function parsePeople(rows: Row[], report: ParseReport): Person[] {
  const people: Person[] = [];
  const usedIds = new Set<string>();
  let order = 0;

  for (let r = 3; r < rows.length; r++) {
    const row = rows[r]!;
    const name = asText(row[0]);
    const annualCost = asNumber(row[3]);
    if (!name || annualCost == null) continue; // header note / blank rows

    let id = slug(name);
    if (usedIds.has(id)) id = `${id}-${order}`;
    usedIds.add(id);

    const fte = asNumber(row[5]);
    if (fte == null) {
      report.warnings.push(`Person "${name}" has no FTE availability; defaulting to 1.0.`);
    }

    people.push({
      id,
      name,
      role: asText(row[1]),
      pool: asText(row[2]),
      annualCost,
      fteAvailability: fte ?? 1,
      fundingTreatment: asText(row[6]),
      active: true,
      order: order++,
    });
  }

  report.peopleCount = people.length;
  return people;
}

// ── Months + products ────────────────────────────────────────────────────────

function parseMonths(scheduleRows: Row[], report: ParseReport): Month[] {
  const labelRow = scheduleRows[3] ?? [];
  const workingRow = scheduleRows[4] ?? [];
  const months: Month[] = [];
  let order = 0;

  for (let c = FIRST_MONTH_COL; c <= LAST_MONTH_COL; c++) {
    const label = asText(labelRow[c]);
    if (!label) continue;
    const wd = asNumber(workingRow[c]) ?? DEFAULT_SETTINGS.defaultWorkingDaysPerMonth;
    const month = parseMonthLabel(label, order, wd);
    if (!month) {
      report.warnings.push(`Could not parse month label "${label}" at column ${c}.`);
      continue;
    }
    months.push(month);
    order++;
  }

  report.monthCount = months.length;
  return months;
}

function buildProducts(months: Month[], report: ParseReport): Product[] {
  const byLabel = new Map(months.map((m) => [m.label, m.id]));
  const products = PRODUCT_CODES.map((code) => {
    const meta = PRODUCT_META[code];
    const product: Product = {
      id: code, // product ids are the codes themselves — stable and readable
      code,
      name: meta.name,
      colour: meta.colour,
      isProduct: meta.isProduct,
      order: meta.order,
    };
    if (meta.intakeLabel) {
      const intakeId = byLabel.get(meta.intakeLabel);
      if (intakeId) product.intakeMonthId = intakeId;
      else report.warnings.push(`Intake month "${meta.intakeLabel}" for ${code} not in horizon.`);
    }
    return product;
  });
  report.productCount = products.length;
  return products;
}

// ── Team Schedule blocks ─────────────────────────────────────────────────────

function parseSchedule(
  rows: Row[],
  people: Person[],
  months: Month[],
  report: ParseReport,
): { assignments: Assignment[]; focusByLine: Record<string, string> } {
  const nameToId = new Map(people.map((p) => [p.name, p.id]));
  const validCodes = new Set<string>(PRODUCT_CODES);
  const assignments: Assignment[] = [];
  const focusByLine: Record<string, string> = {};
  let currentPersonId: string | null = null;
  let currentPersonName = '';
  let seq = 0;

  for (let r = 6; r < rows.length; r++) {
    const row = rows[r]!;
    const colA = asText(row[0]);
    const colB = asText(row[1]);

    if (colA === 'TOTAL DAYS') {
      if (currentPersonId) {
        report.personTotalDaysRow[currentPersonId] = months.map(
          (_, i) => asNumber(row[FIRST_MONTH_COL + i]) ?? 0,
        );
      }
      continue;
    }
    if (colA.startsWith('CAPACITY')) {
      if (currentPersonId) {
        report.personCapacityRow[currentPersonId] = months.map(
          (_, i) => asNumber(row[FIRST_MONTH_COL + i]) ?? 0,
        );
      }
      continue;
    }

    // Block header: a known person name with no product code in col B.
    if (colA && !colB && nameToId.has(colA)) {
      currentPersonId = nameToId.get(colA)!;
      currentPersonName = colA;
      continue;
    }

    // Assignment line: a product code in col B.
    if (colB) {
      if (!currentPersonId) {
        report.warnings.push(`Assignment "${colB}" at row ${r + 1} before any person block; skipped.`);
        continue;
      }
      if (!validCodes.has(colB)) {
        report.skipped.push(`Unknown product code "${colB}" for ${currentPersonName} (row ${r + 1}).`);
        continue;
      }
      const productId = colB as ProductCode;
      const focus = asText(row[2]);
      if (focus) focusByLine[lineKey(currentPersonId, productId)] = focus;

      for (let i = 0; i < months.length; i++) {
        const days = asNumber(row[FIRST_MONTH_COL + i]);
        if (days == null || days === 0) continue;
        assignments.push({
          id: `a${seq++}`,
          personId: currentPersonId,
          productId,
          monthId: months[i]!.id,
          days,
        });
      }
    }
  }

  report.assignmentCount = assignments.length;
  return { assignments, focusByLine };
}

// ── Public entry ─────────────────────────────────────────────────────────────

export function parsePlan(wb: WorkBook, sourceFile = 'H2_Team_Schedule_Resourcing_v3.xlsx'): ParseResult {
  const report: ParseReport = {
    peopleCount: 0,
    assignmentCount: 0,
    monthCount: 0,
    productCount: 0,
    skipped: [],
    warnings: [],
    personTotalDaysRow: {},
    personCapacityRow: {},
  };

  const peopleRows = rowsOf(wb, SHEET_PEOPLE);
  const scheduleRows = rowsOf(wb, SHEET_SCHEDULE);

  const people = parsePeople(peopleRows, report);
  const months = parseMonths(scheduleRows, report);
  const products = buildProducts(months, report);
  const { assignments, focusByLine } = parseSchedule(scheduleRows, people, months, report);

  const plan: Plan = {
    people,
    products,
    months,
    assignments,
    focusByLine,
    settings: { ...DEFAULT_SETTINGS },
    meta: {
      schemaVersion: SCHEMA_VERSION,
      importedAt: new Date().toISOString(),
      sourceFile,
    },
  };

  return { plan, report };
}

/** Convenience for the browser importer: parse straight from a File's bytes. */
export function parsePlanFromArrayBuffer(buf: ArrayBuffer, sourceFile?: string): ParseResult {
  const wb = XLSX.read(buf, { type: 'array' });
  return parsePlan(wb, sourceFile);
}
