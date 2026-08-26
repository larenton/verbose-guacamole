import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Plan } from '../model/types';
import { applyInitials, defaultInitialsMap, deriveInitials } from './anonymise';

describe('deriveInitials', () => {
  it('takes the first letter of up to three words', () => {
    expect(deriveInitials('Luke Renton')).toBe('LR');
    expect(deriveInitials('Holly Keeling-James')).toBe('HKJ');
    expect(deriveInitials('Alan Hatem')).toBe('AH');
  });

  it('drops parentheticals like "(TBC name)"', () => {
    expect(deriveInitials('Program Lead - Health (TBC)')).toBe('PLH');
    expect(deriveInitials('Business Analyst - AP (TBC name)')).toBe('BAA');
  });

  it('never returns lowercase and always returns something', () => {
    expect(deriveInitials('luke renton')).toBe('LR');
    expect(deriveInitials('')).not.toBe('');
  });
});

function samplePlan(): Plan {
  return {
    people: [
      { id: 'luke-renton', name: 'Luke Renton', role: 'SPM', pool: 'PS', annualCost: 220000, fteAvailability: 1, fundingTreatment: 'Portfolio', active: true, order: 0 },
      { id: 'holly-keeling-james', name: 'Holly Keeling-James', role: 'CM', pool: 'PS', annualCost: 180000, fteAvailability: 1, fundingTreatment: 'Portfolio', active: true, order: 1 },
    ],
    products: [{ id: 'H1', code: 'H1', name: 'H1', colour: '#000', isProduct: true, order: 0 }],
    months: [{ id: '2026-07', label: 'Jul-26', year: 2026, monthNo: 7, workingDays: 20, order: 0 }],
    assignments: [
      { id: 'a1', personId: 'luke-renton', productId: 'H1', monthId: '2026-07', days: 10 },
      { id: 'a2', personId: 'holly-keeling-james', productId: 'H1', monthId: '2026-07', days: 8 },
    ],
    focusByLine: { 'luke-renton::H1': 'Run-off delivery' },
    settings: { ...DEFAULT_SETTINGS },
    meta: { schemaVersion: 1 },
  };
}

describe('applyInitials', () => {
  it('replaces names and ids, remapping assignments and focus', () => {
    const plan = samplePlan();
    const map = defaultInitialsMap(plan); // { 'luke-renton': 'LR', 'holly-keeling-james': 'HKJ' }
    const out = applyInitials(plan, map);

    expect(out.people.map((p) => p.name)).toEqual(['LR', 'HKJ']);
    // ids are re-derived from initials, not the original name-slug
    expect(out.people[0]!.id).toBe('lr');
    expect(out.people[1]!.id).toBe('hkj');
    // assignments follow the new ids
    expect(out.assignments.find((a) => a.id === 'a1')!.personId).toBe('lr');
    expect(out.assignments.find((a) => a.id === 'a2')!.personId).toBe('hkj');
    // focus map re-keyed
    expect(out.focusByLine['lr::H1']).toBe('Run-off delivery');
  });

  it('leaks NO full name anywhere in the resulting plan (the privacy guarantee)', () => {
    const plan = samplePlan();
    const out = applyInitials(plan, defaultInitialsMap(plan));
    const blob = JSON.stringify(out).toLowerCase();
    for (const fragment of ['luke', 'renton', 'holly', 'keeling', 'james']) {
      expect(blob).not.toContain(fragment);
    }
  });

  it('disambiguates colliding initials into unique ids', () => {
    const plan = samplePlan();
    const out = applyInitials(plan, { 'luke-renton': 'LR', 'holly-keeling-james': 'LR' });
    expect(out.people[0]!.id).toBe('lr');
    expect(out.people[1]!.id).toBe('lr-2');
    expect(new Set(out.people.map((p) => p.id)).size).toBe(2);
  });

  it('falls back to derived initials when a mapping entry is blank', () => {
    const plan = samplePlan();
    const out = applyInitials(plan, { 'luke-renton': '   ', 'holly-keeling-james': 'HKJ' });
    expect(out.people[0]!.name).toBe('LR');
  });
});
