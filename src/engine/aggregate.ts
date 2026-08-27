import type { Month } from '../model/types';
import {
  allocated,
  assignmentCost,
  capacity,
  personProductMonthDays,
  productMonthDays,
  type PlanIndex,
} from './calc';
import { averageFte } from './units';

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation at every level of the plan: person totals, per-product demand,
// per-product cost, and portfolio rollups — over any month range and any
// product subset. These reproduce the seed workbook's By Product and
// Cost by Product sheets cell-for-cell (see engine.golden.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve an inclusive month-id range to the ordered months it covers. */
export function monthsInRange(idx: PlanIndex, fromId?: string, toId?: string): Month[] {
  const from = fromId ? idx.monthById.get(fromId)?.order : undefined;
  const to = toId ? idx.monthById.get(toId)?.order : undefined;
  const lo = from ?? 0;
  const hi = to ?? idx.months.length - 1;
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  return idx.months.filter((m) => m.order >= a && m.order <= b);
}

export interface RowSummary {
  days: number;
  cost: number;
  workingDays: number;
  /** Average FTE across the covered months (days ÷ workingDays). */
  avgFte: number;
}

/** Days on one person-product line across a set of months. */
export function lineDays(
  idx: PlanIndex,
  personId: string,
  productId: string,
  months: Month[],
): number {
  let sum = 0;
  for (const m of months) sum += personProductMonthDays(idx, personId, productId, m.id);
  return sum;
}

/**
 * Totals for a person across a set of months and a product subset.
 * `productIds` omitted → all products the person is on.
 */
export function personTotals(
  idx: PlanIndex,
  personId: string,
  months: Month[],
  productIds?: Set<string>,
): RowSummary {
  let days = 0;
  let cost = 0;
  let workingDays = 0;
  const rate = idx.ratePerDay.get(personId) ?? 0;
  for (const m of months) {
    workingDays += m.workingDays;
    if (productIds) {
      for (const pid of productIds) {
        const d = personProductMonthDays(idx, personId, pid, m.id);
        days += d;
        cost += d * rate;
      }
    } else {
      const d = allocated(idx, personId, m.id);
      days += d;
      cost += d * rate;
    }
  }
  return { days, cost, workingDays, avgFte: averageFte(days, workingDays) };
}

/** Capacity for a person across a set of months (in days). */
export function personCapacityDays(idx: PlanIndex, personId: string, months: Month[]): number {
  let sum = 0;
  for (const m of months) sum += capacity(idx, personId, m.id);
  return sum;
}

// ── By Product ───────────────────────────────────────────────────────────────

export interface ProductRow {
  productId: string;
  /** Days per month, aligned to `months`. */
  daysByMonth: number[];
  /** FTE per month = days ÷ workingDays. */
  fteByMonth: number[];
  totalDays: number;
}

export interface ByProductResult {
  months: Month[];
  rows: ProductRow[];
  totalDaysByMonth: number[];
  totalFteByMonth: number[];
  grandTotalDays: number;
}

/**
 * Demand by product. Pass the ordered product ids to include — for the seed
 * workbook's By Product sheet that is every product except XX (PF included).
 */
export function byProduct(
  idx: PlanIndex,
  productIds: string[],
  months: Month[],
): ByProductResult {
  const rows: ProductRow[] = productIds.map((productId) => {
    const daysByMonth = months.map((m) => productMonthDays(idx, productId, m.id));
    const fteByMonth = daysByMonth.map((d, i) => {
      const wd = months[i]!.workingDays;
      return wd === 0 ? 0 : d / wd;
    });
    const totalDays = daysByMonth.reduce((s, d) => s + d, 0);
    return { productId, daysByMonth, fteByMonth, totalDays };
  });

  const totalDaysByMonth = months.map((_, i) =>
    rows.reduce((s, r) => s + r.daysByMonth[i]!, 0),
  );
  const totalFteByMonth = months.map((m, i) =>
    m.workingDays === 0 ? 0 : totalDaysByMonth[i]! / m.workingDays,
  );
  const grandTotalDays = totalDaysByMonth.reduce((s, d) => s + d, 0);

  return { months, rows, totalDaysByMonth, totalFteByMonth, grandTotalDays };
}

// ── Cost by Product ──────────────────────────────────────────────────────────

export interface CostRow {
  productId: string;
  costByMonth: number[];
  /** Cost grouped by calendar year, aligned to `yearGroups`. */
  costByYear: number[];
  totalCost: number;
}

export interface YearGroup {
  year: number;
  label: string;
  monthIndexes: number[];
}

export interface CostByProductResult {
  months: Month[];
  yearGroups: YearGroup[];
  rows: CostRow[];
  totalCostByMonth: number[];
  totalCostByYear: number[];
  grandTotalCost: number;
}

/** Group month indexes by calendar year, for the yearly rollup columns. */
export function yearGroupsOf(months: Month[]): YearGroup[] {
  const groups = new Map<number, number[]>();
  months.forEach((m, i) => {
    const arr = groups.get(m.year) ?? [];
    arr.push(i);
    groups.set(m.year, arr);
  });
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, monthIndexes]) => {
      // Label a partial leading year (e.g. 2026 starting Jul) with its month span.
      const first = months[monthIndexes[0]!]!;
      const last = months[monthIndexes[monthIndexes.length - 1]!]!;
      const isPartial = monthIndexes.length < 12;
      const label = isPartial
        ? `${year} (${first.label.slice(0, 3)}-${last.label.slice(0, 3)})`
        : `${year}`;
      return { year, label, monthIndexes };
    });
}

/**
 * Indicative people cost by product (days × daily rate), with per-month and
 * per-calendar-year rollups. Costs sum each person's contribution at their own
 * rate, so multi-person products aggregate correctly.
 */
export function costByProduct(
  idx: PlanIndex,
  productIds: string[],
  months: Month[],
): CostByProductResult {
  const yearGroups = yearGroupsOf(months);

  const rows: CostRow[] = productIds.map((productId) => {
    const costByMonth = months.map((m) => {
      let cost = 0;
      for (const person of idx.people) {
        const d = personProductMonthDays(idx, person.id, productId, m.id);
        if (d) cost += assignmentCost(idx, person.id, d);
      }
      return cost;
    });
    const costByYear = yearGroups.map((g) =>
      g.monthIndexes.reduce((s, i) => s + costByMonth[i]!, 0),
    );
    const totalCost = costByMonth.reduce((s, c) => s + c, 0);
    return { productId, costByMonth, costByYear, totalCost };
  });

  const totalCostByMonth = months.map((_, i) =>
    rows.reduce((s, r) => s + r.costByMonth[i]!, 0),
  );
  const totalCostByYear = yearGroups.map((_, gi) =>
    rows.reduce((s, r) => s + r.costByYear[gi]!, 0),
  );
  const grandTotalCost = totalCostByMonth.reduce((s, c) => s + c, 0);

  return {
    months,
    yearGroups,
    rows,
    totalCostByMonth,
    totalCostByYear,
    grandTotalCost,
  };
}

// ── Portfolio-wide rollups ───────────────────────────────────────────────────

export interface PortfolioMonth {
  monthId: string;
  capacity: number;
  allocated: number;
  headroom: number;
  utilisation: number;
}

/** Team-wide capacity / allocated / headroom per month. */
export function portfolioByMonth(idx: PlanIndex, months: Month[]): PortfolioMonth[] {
  return months.map((m) => {
    let cap = 0;
    let alloc = 0;
    for (const person of idx.people) {
      cap += capacity(idx, person.id, m.id);
      alloc += allocated(idx, person.id, m.id);
    }
    return {
      monthId: m.id,
      capacity: cap,
      allocated: alloc,
      headroom: cap - alloc,
      utilisation: cap === 0 ? 0 : alloc / cap,
    };
  });
}
