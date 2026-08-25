import {
  allocated,
  capacity,
  utilBand,
  utilisation,
  type PlanIndex,
  type UtilBand,
} from './calc';

// ─────────────────────────────────────────────────────────────────────────────
// Pinch points: every person-month where utilisation exceeds 100%. The evidence
// base for resourcing requests. Distinguish within-tolerance (100–115%) from a
// breach (>115%).
// ─────────────────────────────────────────────────────────────────────────────

export interface PinchPoint {
  personId: string;
  monthId: string;
  allocated: number;
  capacity: number;
  /** Negative — the size of the over-allocation in days. */
  headroom: number;
  utilisation: number;
  /** 'tolerance' (100–115%) or 'breach' (>115%). */
  band: Extract<UtilBand, 'tolerance' | 'breach'>;
}

/**
 * All pinch points across the plan, sorted by severity (highest utilisation
 * first). A month is a pinch when allocated > capacity.
 */
export function pinchPoints(idx: PlanIndex): PinchPoint[] {
  const ceiling = idx.settings.toleranceCeiling;
  const out: PinchPoint[] = [];

  for (const person of idx.people) {
    for (const month of idx.months) {
      const cap = capacity(idx, person.id, month.id);
      const alloc = allocated(idx, person.id, month.id);
      if (cap <= 0) continue;
      if (alloc <= cap + 1e-9) continue; // within capacity — not a pinch

      const util = utilisation(idx, person.id, month.id);
      const band = utilBand(util, alloc, ceiling);
      // band is 'tolerance' or 'breach' here (alloc > cap guarantees util > 1).
      out.push({
        personId: person.id,
        monthId: month.id,
        allocated: alloc,
        capacity: cap,
        headroom: cap - alloc,
        utilisation: util,
        band: band === 'breach' ? 'breach' : 'tolerance',
      });
    }
  }

  out.sort(
    (a, b) => b.utilisation - a.utilisation || a.personId.localeCompare(b.personId),
  );
  return out;
}

/** Count of pinch points split by band — for the diff ribbon and summaries. */
export function pinchSummary(points: PinchPoint[]): {
  tolerance: number;
  breach: number;
  total: number;
} {
  let tolerance = 0;
  let breach = 0;
  for (const p of points) {
    if (p.band === 'breach') breach += 1;
    else tolerance += 1;
  }
  return { tolerance, breach, total: points.length };
}
