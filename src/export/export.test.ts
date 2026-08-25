import fs from 'node:fs';
import path from 'node:path';
import * as XLSXR from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import { parsePlan } from '../import/parseWorkbook';
import { buildWorkbook } from './workbook';

// ─────────────────────────────────────────────────────────────────────────────
// Export round-trip fidelity (§7 acceptance): import v3, export immediately, and
// every By Product / Cost by Product total must match the source cell-for-cell.
// Also asserts the computed sheets are LIVE FORMULAS referencing the Team
// Schedule with no external links. Skips in CI where the seed is absent.
// ─────────────────────────────────────────────────────────────────────────────

const FILE = path.resolve(process.cwd(), 'H2_Team_Schedule_Resourcing_v3.xlsx');
const suite = fs.existsSync(FILE) ? describe : describe.skip;

type Row = (string | number | null)[];
const rowsOf = (wb: XLSXR.WorkBook, name: string): Row[] =>
  XLSXR.utils.sheet_to_json<Row>(wb.Sheets[name]!, { header: 1, raw: true, defval: null });
const numAt = (v: unknown): number => (typeof v === 'number' ? v : 0);

suite('export round-trip fidelity', () => {
  let source: XLSXR.WorkBook;
  let exported: XLSXR.WorkBook;

  beforeAll(() => {
    source = XLSXR.readFile(FILE);
    const { plan } = parsePlan(source);
    const buf = buildWorkbook(plan);
    // Read back WITH formulas preserved (cellFormula:true) and values.
    exported = XLSXR.read(buf, { type: 'array', cellFormula: true });
  });

  it('has all five sheets', () => {
    for (const s of ['Read Me', 'People & Rates', 'Team Schedule', 'By Product', 'Cost by Product']) {
      expect(exported.SheetNames).toContain(s);
    }
  });

  it('reproduces By Product days cell-for-cell vs the source', () => {
    const src = rowsOf(source, 'By Product');
    const out = rowsOf(exported, 'By Product');
    // Source: products rows 4..10, TOTAL row 11; months in cols B..AE (1..30).
    // Export: title/blank/subtitle/header then products from row 4 (0-idx 4).
    for (let p = 0; p < 7; p++) {
      const srcRow = src[4 + p]!;
      const outRow = out[4 + p]!;
      for (let m = 1; m <= 30; m++) {
        expect(numAt(outRow[m]), `product ${p} month ${m}`).toBe(numAt(srcRow[m]));
      }
    }
    // TOTAL DAYS row
    for (let m = 1; m <= 30; m++) {
      expect(numAt(out[11]![m])).toBe(numAt(src[11]![m]));
    }
  });

  it('reproduces Cost by Product within $1 incl. grand total', () => {
    const src = rowsOf(source, 'Cost by Product');
    const out = rowsOf(exported, 'Cost by Product');
    // Source products rows 4..10, TOTAL row 11. Export header at row 4 (0-idx 3),
    // products from row 5 (0-idx 4), TOTAL after.
    for (let p = 0; p < 7; p++) {
      const srcRow = src[4 + p]!;
      const outRow = out[4 + p]!;
      for (let m = 1; m <= 30; m++) {
        expect(numAt(outRow[m]), `cost product ${p} month ${m}`).toBeCloseTo(numAt(srcRow[m]), 0);
      }
    }
    // Grand total: source TOTAL row 11 col AI (34) = 3,177,781.82
    const outTotalRow = out[11]!;
    let outGrand = 0;
    for (let m = 1; m <= 30; m++) outGrand += numAt(outTotalRow[m]);
    expect(outGrand).toBeCloseTo(3177781.82, 0);
  });

  it('By Product / Cost cells are live formulas referencing Team Schedule, no external links', () => {
    const bp = exported.Sheets['By Product']!;
    const cost = exported.Sheets['Cost by Product']!;
    // B5 on By Product (first product, first month) must be a SUMIF over Team Schedule.
    const bpCell = bp['B5'] as XLSXR.CellObject;
    expect(bpCell.f).toBeTruthy();
    expect(bpCell.f).toContain('Team Schedule');
    expect(bpCell.f).toContain('SUMIF');
    // Cost B5 must be a SUMPRODUCT over Team Schedule.
    const costCell = cost['B5'] as XLSXR.CellObject;
    expect(costCell.f).toBeTruthy();
    expect(costCell.f).toContain('SUMPRODUCT');
    expect(costCell.f).toContain('Team Schedule');
    // No external-workbook references (square brackets) anywhere in the formulas.
    for (const sheet of ['By Product', 'Cost by Product', 'Team Schedule', 'People & Rates']) {
      const ws = exported.Sheets[sheet]!;
      for (const addr of Object.keys(ws)) {
        if (addr.startsWith('!')) continue;
        const cell = ws[addr] as XLSXR.CellObject;
        if (cell.f) expect(cell.f, `${sheet}!${addr}`).not.toMatch(/\[/);
      }
    }
  });

  it('Team Schedule day inputs round-trip to the source person totals', () => {
    // Sum every TOTAL DAYS across the exported Team Schedule and compare to the
    // sum of the source TOTAL DAYS rows.
    const srcRows = rowsOf(source, 'Team Schedule');
    let srcTotal = 0;
    for (const r of srcRows) {
      if (r[0] === 'TOTAL DAYS') for (let c = 3; c <= 32; c++) srcTotal += numAt(r[c]);
    }
    const outRows = rowsOf(exported, 'Team Schedule');
    let outTotal = 0;
    for (const r of outRows) {
      if (r[0] === 'TOTAL DAYS') for (let c = 3; c <= 32; c++) outTotal += numAt(r[c]);
    }
    expect(outTotal).toBe(srcTotal);
  });
});
