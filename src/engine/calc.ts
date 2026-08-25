import type {
  Assignment,
  Month,
  Person,
  Plan,
  Product,
  ProductCode,
  Settings,
} from '../model/types';
import { dailyRate } from './units';

// ─────────────────────────────────────────────────────────────────────────────
// Derived calculations. The identity the whole app is built on:
//
//     capacity − allocated = headroom
//
// Positive headroom is surplus (bench); negative is over-allocation (the pinch).
// Everything here is pure and cheap; the store memoises the index.
// ─────────────────────────────────────────────────────────────────────────────

const sep = '|';
const pmKey = (personId: string, monthId: string) => personId + sep + monthId;
const ppmKey = (personId: string, productId: string, monthId: string) =>
  personId + sep + productId + sep + monthId;
const prmKey = (productId: string, monthId: string) => productId + sep + monthId;

/**
 * A precomputed, indexed view of a plan. Build once per plan snapshot; all
 * selectors read from it in O(1). Rebuilding for ~13×8×30 cells is sub-millisecond.
 */
export interface PlanIndex {
  plan: Plan;
  settings: Settings;
  people: Person[];
  products: Product[];
  months: Month[];
  personById: Map<string, Person>;
  productById: Map<string, Product>;
  monthById: Map<string, Month>;
  productByCode: Map<ProductCode, Product>;
  /** personId -> daily rate ($/day). */
  ratePerDay: Map<string, number>;
  /** `${personId}|${monthId}` -> allocated days. */
  daysByPersonMonth: Map<string, number>;
  /** `${personId}|${productId}|${monthId}` -> days. */
  daysByPersonProductMonth: Map<string, number>;
  /** `${productId}|${monthId}` -> days across all people. */
  daysByProductMonth: Map<string, number>;
  /** `${personId}|${productId}|${monthId}` -> the assignment (if present). */
  assignmentByKey: Map<string, Assignment>;
}

export function indexPlan(plan: Plan): PlanIndex {
  const people = [...plan.people].sort((a, b) => a.order - b.order);
  const products = [...plan.products].sort((a, b) => a.order - b.order);
  const months = [...plan.months].sort((a, b) => a.order - b.order);

  const personById = new Map(people.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const monthById = new Map(months.map((m) => [m.id, m]));
  const productByCode = new Map(products.map((p) => [p.code, p]));

  const ratePerDay = new Map<string, number>();
  for (const person of people) {
    ratePerDay.set(person.id, dailyRate(person.annualCost, plan.settings.workingDaysPerYear));
  }

  const daysByPersonMonth = new Map<string, number>();
  const daysByPersonProductMonth = new Map<string, number>();
  const daysByProductMonth = new Map<string, number>();
  const assignmentByKey = new Map<string, Assignment>();

  for (const a of plan.assignments) {
    if (!a.days) continue;
    const pm = pmKey(a.personId, a.monthId);
    daysByPersonMonth.set(pm, (daysByPersonMonth.get(pm) ?? 0) + a.days);

    const ppm = ppmKey(a.personId, a.productId, a.monthId);
    daysByPersonProductMonth.set(ppm, (daysByPersonProductMonth.get(ppm) ?? 0) + a.days);
    assignmentByKey.set(ppm, a);

    const prm = prmKey(a.productId, a.monthId);
    daysByProductMonth.set(prm, (daysByProductMonth.get(prm) ?? 0) + a.days);
  }

  return {
    plan,
    settings: plan.settings,
    people,
    products,
    months,
    personById,
    productById,
    monthById,
    productByCode,
    ratePerDay,
    daysByPersonMonth,
    daysByPersonProductMonth,
    daysByProductMonth,
    assignmentByKey,
  };
}

// ── Per person-month primitives ──────────────────────────────────────────────

/** capacity = workingDays × fteAvailability. */
export function capacity(idx: PlanIndex, personId: string, monthId: string): number {
  const person = idx.personById.get(personId);
  const month = idx.monthById.get(monthId);
  if (!person || !month) return 0;
  return month.workingDays * person.fteAvailability;
}

/** allocated = Σ assignment.days across products for this person-month. */
export function allocated(idx: PlanIndex, personId: string, monthId: string): number {
  return idx.daysByPersonMonth.get(pmKey(personId, monthId)) ?? 0;
}

/** headroom = capacity − allocated. Positive = surplus, negative = over-allocation. */
export function headroom(idx: PlanIndex, personId: string, monthId: string): number {
  return capacity(idx, personId, monthId) - allocated(idx, personId, monthId);
}

/** utilisation = allocated ÷ capacity. Undefined capacity → 0. */
export function utilisation(idx: PlanIndex, personId: string, monthId: string): number {
  const cap = capacity(idx, personId, monthId);
  if (cap === 0) return 0;
  return allocated(idx, personId, monthId) / cap;
}

/** Days for a specific person-product-month (0 if no assignment). */
export function personProductMonthDays(
  idx: PlanIndex,
  personId: string,
  productId: string,
  monthId: string,
): number {
  return idx.daysByPersonProductMonth.get(ppmKey(personId, productId, monthId)) ?? 0;
}

/** Total product demand (all people) for a product-month. */
export function productMonthDays(idx: PlanIndex, productId: string, monthId: string): number {
  return idx.daysByProductMonth.get(prmKey(productId, monthId)) ?? 0;
}

// ── Cost ─────────────────────────────────────────────────────────────────────

/** cost = days × person.annualCost ÷ workingDaysPerYear. */
export function assignmentCost(idx: PlanIndex, personId: string, days: number): number {
  return days * (idx.ratePerDay.get(personId) ?? 0);
}

// ── Utilisation bands ────────────────────────────────────────────────────────

export type UtilBand =
  | 'unassigned' // no allocation at all
  | 'under' // < 70% — a lot of headroom
  | 'healthy' // 70–95%
  | 'full' // 95–100%
  | 'tolerance' // 100–115% — the agreed tolerance band
  | 'breach'; // > 115% — not deliverable as drawn

/**
 * Classify a utilisation ratio into a semantic band. `toleranceCeiling` (default
 * 1.15) is the top of the accepted planning band; above it is a breach.
 */
export function utilBand(util: number, allocatedDays: number, toleranceCeiling: number): UtilBand {
  if (allocatedDays === 0) return 'unassigned';
  if (util < 0.7) return 'under';
  if (util < 0.95) return 'healthy';
  if (util <= 1.0 + 1e-9) return 'full';
  if (util <= toleranceCeiling + 1e-9) return 'tolerance';
  return 'breach';
}

/** Convenience: band for a person-month straight from the index. */
export function personMonthBand(idx: PlanIndex, personId: string, monthId: string): UtilBand {
  const alloc = allocated(idx, personId, monthId);
  return utilBand(utilisation(idx, personId, monthId), alloc, idx.settings.toleranceCeiling);
}
