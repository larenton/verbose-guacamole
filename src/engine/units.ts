import type { Unit } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// Unit conversion. Every figure in the app is the same number expressed three
// ways. Days is the planning currency and the only editable unit; FTE and $ are
// re-expressions of it.
//
//   Days : raw day value
//   FTE  : days ÷ working_days_in_month
//   $    : days × daily_rate,  where daily_rate = annualCost ÷ workingDaysPerYear
// ─────────────────────────────────────────────────────────────────────────────

/** Daily rate from a fully-loaded annual cost. Basis: 220 working days/year. */
export function dailyRate(annualCost: number, workingDaysPerYear: number): number {
  return annualCost / workingDaysPerYear;
}

/**
 * Convert a single cell value expressed in DAYS to the target unit, for a
 * specific person-month context.
 *
 * - `workingDays` is that month's working days (for FTE).
 * - `ratePerDay` is that person's daily rate (for $).
 */
export function daysTo(
  days: number,
  unit: Unit,
  ctx: { workingDays: number; ratePerDay: number },
): number {
  switch (unit) {
    case 'days':
      return days;
    case 'fte':
      return ctx.workingDays === 0 ? 0 : days / ctx.workingDays;
    case 'dollars':
      return days * ctx.ratePerDay;
  }
}

/**
 * Convert a value the user typed in the given unit back into DAYS, for a
 * specific person-month context. Editing is only ever committed in days; this
 * is how an FTE or $ entry is interpreted when the user is in that mode.
 */
export function toDays(
  value: number,
  unit: Unit,
  ctx: { workingDays: number; ratePerDay: number },
): number {
  switch (unit) {
    case 'days':
      return value;
    case 'fte':
      return value * ctx.workingDays;
    case 'dollars':
      return ctx.ratePerDay === 0 ? 0 : value / ctx.ratePerDay;
  }
}

/**
 * Average FTE across a set of months: total days ÷ total working days over
 * those months. This is the correct way to aggregate FTE over a horizon
 * (a straight sum of monthly FTE would be meaningless). Matches the seed
 * workbook's "Avg FTE (active)" when the month set is the active months.
 */
export function averageFte(totalDays: number, totalWorkingDays: number): number {
  return totalWorkingDays === 0 ? 0 : totalDays / totalWorkingDays;
}

export const UNIT_LABEL: Record<Unit, string> = {
  days: 'Days',
  fte: 'FTE',
  dollars: '$',
};
