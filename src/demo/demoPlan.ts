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
// Fictional demo dataset — entirely invented people and numbers, safe to commit
// and to serve on a public URL. It exists so the deployed site isn't blank for
// anyone who stumbles on it, and to show what the tool does. Not real data.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildMonths(startYear: number, startMonth: number, count: number): Month[] {
  const months: Month[] = [];
  let y = startYear;
  let m = startMonth; // 1-based
  for (let i = 0; i < count; i++) {
    months.push({
      id: `${y}-${String(m).padStart(2, '0')}`,
      label: `${MONTH_NAMES[m - 1]}-${String(y).slice(2)}`,
      year: y,
      monthNo: m,
      workingDays: 20,
      order: i,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

function buildProducts(months: Month[]): Product[] {
  const byLabel = new Map(months.map((m) => [m.label, m.id]));
  return PRODUCT_CODES.map((code) => {
    const meta = PRODUCT_META[code];
    const product: Product = {
      id: code,
      code,
      name: meta.name,
      colour: meta.colour,
      isProduct: meta.isProduct,
      order: meta.order,
    };
    if (meta.intakeLabel) {
      const intake = byLabel.get(meta.intakeLabel);
      if (intake) product.intakeMonthId = intake;
    }
    return product;
  });
}

interface DemoPerson {
  id: string;
  name: string; // already initials — fictional
  role: string;
  pool: string;
  annualCost: number;
  fte: number;
  funding: string;
}

const DEMO_PEOPLE: DemoPerson[] = [
  { id: 'am', name: 'AM', role: 'Programme Manager', pool: 'Project Services', annualCost: 210000, fte: 1, funding: 'Portfolio-funded' },
  { id: 'bk', name: 'BK', role: 'Lead Learning Designer', pool: 'Product Development', annualCost: 150000, fte: 1, funding: 'Portfolio-funded' },
  { id: 'cl', name: 'CL', role: 'Learning Designer', pool: 'Product Development', annualCost: 130000, fte: 1, funding: 'Portfolio-funded' },
  { id: 'dp', name: 'DP', role: 'Business Analyst', pool: 'Project Services', annualCost: 140000, fte: 1, funding: 'Portfolio-funded' },
  { id: 'en', name: 'EN', role: 'Programme Lead (fractional)', pool: 'Product-dedicated', annualCost: 200000, fte: 0.2, funding: 'Absorbed in academic budget' },
  { id: 'fr', name: 'FR', role: 'Programme Lead (TBC)', pool: 'Product-dedicated', annualCost: 200000, fte: 1, funding: 'To be requested in business case' },
];

// A compact assignment pattern per person: [productCode, focus, monthly days pattern].
// `days` is applied across all 30 months unless a start index is given.
interface Line {
  code: ProductCode;
  focus: string;
  days: number;
  from?: number; // start month index (inclusive)
  to?: number; // end month index (inclusive)
}

const DEMO_LINES: Record<string, Line[]> = {
  am: [
    { code: 'H1', focus: 'Run-off delivery oversight', days: 10, to: 8 },
    { code: 'ES', focus: 'Energy Systems governance', days: 6, from: 6 },
    { code: 'PF', focus: 'Portfolio / playbook', days: 1 },
    { code: 'XX', focus: 'Admin / L&T / General', days: 4 },
  ],
  bk: [
    { code: 'H1', focus: 'QA & LD oversight', days: 6, to: 7 },
    { code: 'ES', focus: 'LD oversight (16 courses)', days: 5, from: 6, to: 20 },
    // Deliberate tolerance pinch: heavy overlap mid-plan.
    { code: 'CD', focus: 'Cyber build oversight', days: 9, from: 10, to: 18 },
    { code: 'HM', focus: 'Health build oversight', days: 8, from: 12, to: 22 },
    { code: 'XX', focus: 'Admin / L&T / General', days: 4 },
  ],
  cl: [
    { code: 'H1', focus: 'Business programme LD', days: 15, to: 7 },
    { code: 'ES', focus: 'Energy Systems LD', days: 16, from: 8, to: 20 },
    { code: 'DM', focus: 'Digital Media LD', days: 14, from: 21 },
    { code: 'XX', focus: 'Admin / L&T / General', days: 4 },
  ],
  dp: [
    { code: 'H1', focus: 'Enrolment / process mapping', days: 8, to: 9 },
    { code: 'ES', focus: 'B2B process design', days: 10, from: 8, to: 22 },
    { code: 'PF', focus: 'Process library', days: 1 },
    { code: 'XX', focus: 'Admin / L&T / General', days: 4 },
  ],
  en: [
    { code: 'CD', focus: 'Academic lead (fractional)', days: 3, from: 4 },
    { code: 'XX', focus: 'Admin (~20% of 0.2 FTE)', days: 1, from: 4 },
  ],
  fr: [
    { code: 'DM', focus: 'Digital Media programme lead', days: 15, from: 14 },
    { code: 'XX', focus: 'Admin / L&T / General', days: 4, from: 14 },
  ],
};

/** Build the fictional demo plan. */
export function buildDemoPlan(): Plan {
  const months = buildMonths(2026, 7, 30);
  const products = buildProducts(months);

  const people: Person[] = DEMO_PEOPLE.map((d, i) => ({
    id: d.id,
    name: d.name,
    role: d.role,
    pool: d.pool,
    annualCost: d.annualCost,
    fteAvailability: d.fte,
    fundingTreatment: d.funding,
    active: true,
    order: i,
  }));

  const assignments: Assignment[] = [];
  const focusByLine: Record<string, string> = {};
  let seq = 0;
  for (const person of people) {
    for (const line of DEMO_LINES[person.id] ?? []) {
      focusByLine[lineKey(person.id, line.code)] = line.focus;
      const from = line.from ?? 0;
      const to = line.to ?? months.length - 1;
      for (let i = from; i <= to && i < months.length; i++) {
        assignments.push({
          id: `d${seq++}`,
          personId: person.id,
          productId: line.code,
          monthId: months[i]!.id,
          days: line.days,
        });
      }
    }
  }

  return {
    people,
    products,
    months,
    assignments,
    focusByLine,
    settings: { ...DEFAULT_SETTINGS },
    meta: { schemaVersion: SCHEMA_VERSION, importedAt: new Date().toISOString(), sourceFile: 'demo (fictional)' },
  };
}
