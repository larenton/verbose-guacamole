import { PRODUCT_META } from '../../model/products';
import type { Month, ProductCode } from '../../model/types';
import { personProductMonthDays, type PlanIndex } from '../../engine';
import { lineKey } from '../../model/types';

// Derived, render-time structures for the grid: which product lines a person
// has, quarter groupings for the header, and intake markers.

/** Ordered product ids a person has a line for (any assignment, or a focus row). */
export function personLines(idx: PlanIndex, personId: string): string[] {
  return idx.products
    .filter((product) => {
      if (idx.plan.focusByLine[lineKey(personId, product.id)] !== undefined) return true;
      return idx.months.some((m) => personProductMonthDays(idx, personId, product.id, m.id) > 0);
    })
    .sort((a, b) => a.order - b.order)
    .map((p) => p.id);
}

export interface QuarterSpan {
  label: string;
  startIndex: number;
  span: number;
}

/** Group consecutive months into calendar quarters for the header markers. */
export function quarterSpans(months: Month[]): QuarterSpan[] {
  const out: QuarterSpan[] = [];
  months.forEach((m, i) => {
    const q = Math.floor((m.monthNo - 1) / 3) + 1;
    const label = `Q${q} ${m.year}`;
    const last = out[out.length - 1];
    if (last && last.label === label) last.span += 1;
    else out.push({ label, startIndex: i, span: 1 });
  });
  return out;
}

export interface IntakeMarker {
  monthIndex: number;
  codes: ProductCode[];
  label: string;
}

/** Intake markers above the month header (e.g. "ES & CD intake Jan-28"). */
export function intakeMarkers(idx: PlanIndex): IntakeMarker[] {
  const byMonth = new Map<string, ProductCode[]>();
  for (const product of idx.products) {
    if (!product.intakeMonthId) continue;
    const arr = byMonth.get(product.intakeMonthId) ?? [];
    arr.push(product.code);
    byMonth.set(product.intakeMonthId, arr);
  }
  const markers: IntakeMarker[] = [];
  for (const [monthId, codes] of byMonth) {
    const monthIndex = idx.months.findIndex((m) => m.id === monthId);
    if (monthIndex === -1) continue;
    const month = idx.months[monthIndex]!;
    markers.push({
      monthIndex,
      codes,
      label: `${codes.join(' & ')} intake ${month.label}`,
    });
  }
  return markers.sort((a, b) => a.monthIndex - b.monthIndex);
}

export const PRODUCT_LABEL = (code: ProductCode): string => PRODUCT_META[code].name;
