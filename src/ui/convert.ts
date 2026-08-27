import type { Unit } from '../model/types';
import { daysTo, type PlanIndex } from '../engine';
import type { RowSummary } from '../engine/aggregate';

// ─────────────────────────────────────────────────────────────────────────────
// Display-side conversion helpers that bind engine figures to the current unit.
// Editing is always in days; these are read-only re-expressions.
// ─────────────────────────────────────────────────────────────────────────────

/** A person-month cell value (days) re-expressed in the active unit. */
export function cellValue(
  idx: PlanIndex,
  unit: Unit,
  personId: string,
  monthId: string,
  days: number,
): number {
  const workingDays = idx.monthById.get(monthId)?.workingDays ?? 0;
  const ratePerDay = idx.ratePerDay.get(personId) ?? 0;
  return daysTo(days, unit, { workingDays, ratePerDay });
}

/** A product-month demand value (days, summed across people) in the active unit. */
export function productCellValue(
  idx: PlanIndex,
  unit: Unit,
  monthId: string,
  days: number,
  cost: number,
): number {
  const workingDays = idx.monthById.get(monthId)?.workingDays ?? 0;
  switch (unit) {
    case 'days':
      return days;
    case 'fte':
      return workingDays === 0 ? 0 : days / workingDays;
    case 'dollars':
      return cost;
  }
}

/** A row/horizon summary re-expressed in the active unit. */
export function summaryValue(summary: RowSummary, unit: Unit): number {
  switch (unit) {
    case 'days':
      return summary.days;
    case 'fte':
      return summary.avgFte;
    case 'dollars':
      return summary.cost;
  }
}
