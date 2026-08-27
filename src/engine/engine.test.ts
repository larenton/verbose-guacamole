import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type Assignment,
  type Month,
  type Person,
  type Plan,
  type Product,
} from '../model/types';
import {
  allocated,
  averageFte,
  byProduct,
  capacity,
  costByProduct,
  daysTo,
  dailyRate,
  headroom,
  indexPlan,
  personTotals,
  pinchPoints,
  pinchSummary,
  portfolioByMonth,
  toDays,
  utilBand,
  utilisation,
  yearGroupsOf,
} from './index';

// ── A small, hand-built plan with known answers ──────────────────────────────
//
// Ann: 1.0 FTE, $220k → $1000/day, cap 20/month.
// Bob: 0.5 FTE, $110k → $500/day, cap 10/month.
// Months M1, M2 (20 working days each).
// Products PA (real), XX (admin).

function makePerson(over: Partial<Person> & Pick<Person, 'id' | 'name' | 'annualCost' | 'fteAvailability' | 'order'>): Person {
  return {
    role: 'Role',
    pool: 'Pool',
    fundingTreatment: 'Portfolio-funded',
    active: true,
    ...over,
  };
}

function makeProduct(id: string, order: number, isProduct: boolean): Product {
  return { id, code: id as Product['code'], name: id, colour: '#000', isProduct, order };
}

function month(id: string, order: number, workingDays = 20): Month {
  const [y, m] = id.split('-');
  return { id, label: id, year: Number(y), monthNo: Number(m), workingDays, order };
}

function makePlan(): Plan {
  const people: Person[] = [
    makePerson({ id: 'ann', name: 'Ann', annualCost: 220000, fteAvailability: 1, order: 0 }),
    makePerson({ id: 'bob', name: 'Bob', annualCost: 110000, fteAvailability: 0.5, order: 1 }),
  ];
  const products: Product[] = [makeProduct('PA', 0, true), makeProduct('XX', 1, false)];
  const months: Month[] = [month('2026-01', 0), month('2026-02', 1)];
  const a = (id: string, personId: string, productId: string, monthId: string, days: number): Assignment => ({
    id, personId, productId, monthId, days,
  });
  const assignments: Assignment[] = [
    a('1', 'ann', 'PA', '2026-01', 10),
    a('2', 'ann', 'XX', '2026-01', 4), // Ann M1: 14/20 → 70% util
    a('3', 'ann', 'PA', '2026-02', 22), // Ann M2: 22/20 → 110% (tolerance)
    a('4', 'bob', 'PA', '2026-01', 12), // Bob M1: 12/10 → 120% (breach)
  ];
  return {
    people,
    products,
    months,
    assignments,
    focusByLine: {},
    settings: { ...DEFAULT_SETTINGS },
    meta: { schemaVersion: 1 },
  };
}

describe('unit conversion', () => {
  it('derives the daily rate from annual cost ÷ 220', () => {
    expect(dailyRate(220000, 220)).toBe(1000);
    expect(dailyRate(180000, 220)).toBeCloseTo(818.1818, 4);
  });

  it('re-expresses days as FTE and dollars', () => {
    expect(daysTo(10, 'days', { workingDays: 20, ratePerDay: 1000 })).toBe(10);
    expect(daysTo(10, 'fte', { workingDays: 20, ratePerDay: 1000 })).toBe(0.5);
    expect(daysTo(10, 'dollars', { workingDays: 20, ratePerDay: 1000 })).toBe(10000);
  });

  it('converts a typed FTE/$ value back to days (round-trip)', () => {
    expect(toDays(0.5, 'fte', { workingDays: 20, ratePerDay: 1000 })).toBe(10);
    expect(toDays(10000, 'dollars', { workingDays: 20, ratePerDay: 1000 })).toBe(10);
    // round-trip within no drift
    const ctx = { workingDays: 20, ratePerDay: 818.1818181818181 };
    expect(toDays(daysTo(7, 'dollars', ctx), 'dollars', ctx)).toBeCloseTo(7, 9);
    expect(toDays(daysTo(7, 'fte', ctx), 'fte', ctx)).toBeCloseTo(7, 9);
  });

  it('averages FTE as total days ÷ total working days', () => {
    expect(averageFte(20, 40)).toBe(0.5);
    expect(averageFte(111, 360)).toBeCloseTo(0.30833, 5);
    expect(averageFte(0, 0)).toBe(0);
  });

  it('guards divide-by-zero', () => {
    expect(daysTo(5, 'fte', { workingDays: 0, ratePerDay: 1000 })).toBe(0);
    expect(toDays(5, 'dollars', { workingDays: 20, ratePerDay: 0 })).toBe(0);
  });
});

describe('capacity − allocated = headroom', () => {
  const idx = indexPlan(makePlan());

  it('capacity = workingDays × fteAvailability', () => {
    expect(capacity(idx, 'ann', '2026-01')).toBe(20);
    expect(capacity(idx, 'bob', '2026-01')).toBe(10);
  });

  it('allocated sums all products including admin', () => {
    expect(allocated(idx, 'ann', '2026-01')).toBe(14); // 10 PA + 4 XX
    expect(allocated(idx, 'ann', '2026-02')).toBe(22);
    expect(allocated(idx, 'bob', '2026-01')).toBe(12);
  });

  it('headroom is the signed difference', () => {
    expect(headroom(idx, 'ann', '2026-01')).toBe(6); // surplus
    expect(headroom(idx, 'ann', '2026-02')).toBe(-2); // over-allocated
    expect(headroom(idx, 'bob', '2026-01')).toBe(-2);
  });

  it('the identity holds everywhere', () => {
    for (const p of ['ann', 'bob']) {
      for (const m of ['2026-01', '2026-02']) {
        expect(capacity(idx, p, m) - allocated(idx, p, m)).toBe(headroom(idx, p, m));
      }
    }
  });

  it('utilisation = allocated ÷ capacity', () => {
    expect(utilisation(idx, 'ann', '2026-01')).toBeCloseTo(0.7, 9);
    expect(utilisation(idx, 'ann', '2026-02')).toBeCloseTo(1.1, 9);
    expect(utilisation(idx, 'bob', '2026-01')).toBeCloseTo(1.2, 9);
  });
});

describe('utilisation bands and tolerance ceiling', () => {
  const ceil = 1.15;
  it('classifies each band relative to the 115% ceiling', () => {
    expect(utilBand(0, 0, ceil)).toBe('unassigned');
    expect(utilBand(0.5, 5, ceil)).toBe('under');
    expect(utilBand(0.8, 16, ceil)).toBe('healthy');
    expect(utilBand(0.98, 19, ceil)).toBe('full');
    expect(utilBand(1.0, 20, ceil)).toBe('full');
    expect(utilBand(1.1, 22, ceil)).toBe('tolerance');
    expect(utilBand(1.15, 23, ceil)).toBe('tolerance'); // exactly at the ceiling
    expect(utilBand(1.2, 24, ceil)).toBe('breach');
  });

  it('115% is within tolerance, not a breach (the LD2 case)', () => {
    expect(utilBand(23 / 20, 23, ceil)).toBe('tolerance');
    expect(utilBand(23.5 / 20, 23.5, ceil)).toBe('breach');
  });
});

describe('pinch points', () => {
  const idx = indexPlan(makePlan());
  const points = pinchPoints(idx);

  it('finds every month over 100% capacity', () => {
    expect(points).toHaveLength(2);
  });

  it('sorts by severity (worst first) and bands correctly', () => {
    expect(points[0]).toMatchObject({ personId: 'bob', band: 'breach' });
    expect(points[1]).toMatchObject({ personId: 'ann', band: 'tolerance' });
    expect(points[0]!.headroom).toBe(-2);
  });

  it('summarises tolerance vs breach', () => {
    expect(pinchSummary(points)).toEqual({ tolerance: 1, breach: 1, total: 2 });
  });
});

describe('aggregation at every level', () => {
  const idx = indexPlan(makePlan());
  const months = idx.months;

  it('person totals sum days, cost, and average FTE across months', () => {
    const ann = personTotals(idx, 'ann', months);
    expect(ann.days).toBe(36); // 14 + 22
    expect(ann.cost).toBe(36000); // 36 × $1000
    expect(ann.workingDays).toBe(40);
    expect(ann.avgFte).toBeCloseTo(0.9, 9);
  });

  it('by-product demand aggregates across people', () => {
    const res = byProduct(idx, ['PA'], months);
    expect(res.rows[0]!.daysByMonth).toEqual([22, 22]); // M1: 10+12, M2: 22
    expect(res.rows[0]!.fteByMonth[0]).toBeCloseTo(1.1, 9);
    expect(res.totalDaysByMonth).toEqual([22, 22]);
    expect(res.grandTotalDays).toBe(44);
  });

  it('cost-by-product sums each person at their own rate', () => {
    const res = costByProduct(idx, ['PA'], months);
    // M1: Ann 10×1000 + Bob 12×500 = 16000; M2: Ann 22×1000 = 22000
    expect(res.rows[0]!.costByMonth).toEqual([16000, 22000]);
    expect(res.grandTotalCost).toBe(38000);
    expect(res.totalCostByMonth).toEqual([16000, 22000]);
  });

  it('groups cost by calendar year', () => {
    const groups = yearGroupsOf(months);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.year).toBe(2026);
    const res = costByProduct(idx, ['PA'], months);
    expect(res.totalCostByYear).toEqual([38000]);
  });

  it('portfolio rollup gives team capacity/allocated/headroom per month', () => {
    const port = portfolioByMonth(idx, months);
    expect(port[0]).toMatchObject({ capacity: 30, allocated: 26, headroom: 4 }); // M1: cap 20+10, alloc 14+12
    expect(port[1]).toMatchObject({ capacity: 30, allocated: 22, headroom: 8 });
  });
});
