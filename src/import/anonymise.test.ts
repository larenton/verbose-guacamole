import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Plan } from '../model/types';
import { applyInitials, defaultInitialsMap, deriveInitials } from './anonymise';

// Fictional names only — no real staff names may live in the repo, even in tests.
describe('deriveInitials', () => {
  it('takes the first letter of up to three words', () => {
    expect(deriveInitials('Jamie Rivera')).toBe('JR');
    expect(deriveInitials('Priya Nair-Watson')).toBe('PNW');
    expect(deriveInitials('Alex Okafor')).toBe('AO');
  });

  it('drops parentheticals like "(TBC name)"', () => {
    expect(deriveInitials('Program Lead - Health (TBC)')).toBe('PLH');
    expect(deriveInitials('Business Analyst - AP (TBC name)')).toBe('BAA');
  });

  it('never returns lowercase and always returns something', () => {
    expect(deriveInitials('jamie rivera')).toBe('JR');
    expect(deriveInitials('')).not.toBe('');
  });
});

function samplePlan(): Plan {
  return {
    people: [
      { id: 'jamie-rivera', name: 'Jamie Rivera', role: 'SPM', pool: 'PS', annualCost: 220000, fteAvailability: 1, fundingTreatment: 'Portfolio', active: true, order: 0 },
      { id: 'priya-nair-watson', name: 'Priya Nair-Watson', role: 'CM', pool: 'PS', annualCost: 180000, fteAvailability: 1, fundingTreatment: 'Portfolio', active: true, order: 1 },
    ],
    products: [{ id: 'H1', code: 'H1', name: 'H1', colour: '#000', isProduct: true, order: 0 }],
    months: [{ id: '2026-07', label: 'Jul-26', year: 2026, monthNo: 7, workingDays: 20, order: 0 }],
    assignments: [
      { id: 'a1', personId: 'jamie-rivera', productId: 'H1', monthId: '2026-07', days: 10 },
      { id: 'a2', personId: 'priya-nair-watson', productId: 'H1', monthId: '2026-07', days: 8 },
    ],
    focusByLine: { 'jamie-rivera::H1': 'Run-off delivery' },
    settings: { ...DEFAULT_SETTINGS },
    meta: { schemaVersion: 1 },
  };
}

describe('applyInitials', () => {
  it('replaces names and ids, remapping assignments and focus', () => {
    const plan = samplePlan();
    const map = defaultInitialsMap(plan); // { 'jamie-rivera': 'JR', 'priya-nair-watson': 'PNW' }
    const out = applyInitials(plan, map);

    expect(out.people.map((p) => p.name)).toEqual(['JR', 'PNW']);
    // ids are re-derived from initials, not the original name-slug
    expect(out.people[0]!.id).toBe('jr');
    expect(out.people[1]!.id).toBe('pnw');
    // assignments follow the new ids
    expect(out.assignments.find((a) => a.id === 'a1')!.personId).toBe('jr');
    expect(out.assignments.find((a) => a.id === 'a2')!.personId).toBe('pnw');
    // focus map re-keyed
    expect(out.focusByLine['jr::H1']).toBe('Run-off delivery');
  });

  it('leaks NO full name anywhere in the resulting plan (the privacy guarantee)', () => {
    const plan = samplePlan();
    const out = applyInitials(plan, defaultInitialsMap(plan));
    const blob = JSON.stringify(out).toLowerCase();
    for (const fragment of ['jamie', 'rivera', 'priya', 'nair', 'watson']) {
      expect(blob).not.toContain(fragment);
    }
  });

  it('disambiguates colliding initials into unique ids', () => {
    const plan = samplePlan();
    const out = applyInitials(plan, { 'jamie-rivera': 'JR', 'priya-nair-watson': 'JR' });
    expect(out.people[0]!.id).toBe('jr');
    expect(out.people[1]!.id).toBe('jr-2');
    expect(new Set(out.people.map((p) => p.id)).size).toBe(2);
  });

  it('falls back to derived initials when a mapping entry is blank', () => {
    const plan = samplePlan();
    const out = applyInitials(plan, { 'jamie-rivera': '   ', 'priya-nair-watson': 'PNW' });
    expect(out.people[0]!.name).toBe('JR');
  });
});
