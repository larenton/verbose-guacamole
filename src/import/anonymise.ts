import type { Assignment, Plan } from '../model/types';
import { lineKey } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// Privacy: real names must never leave the browser. At import time the user maps
// each person to initials (e.g. "Luke Renton" → "LR"). The mapping is applied
// BEFORE anything touches IndexedDB or the UI, so only initials are ever stored,
// exported, or displayed. Person ids are re-derived from the initials too, so no
// full name survives anywhere in the persisted plan.
// ─────────────────────────────────────────────────────────────────────────────

/** Derive default initials from a name: first letter of up to three words. */
export function deriveInitials(name: string): string {
  const cleaned = name.replace(/\([^)]*\)/g, ' '); // drop "(TBC name)" etc.
  const words = cleaned
    .split(/[\s.\-/]+/)
    .map((w) => w.trim())
    .filter((w) => /[A-Za-z0-9]/.test(w));
  const letters = words.slice(0, 3).map((w) => w[0]!.toUpperCase());
  const initials = letters.join('');
  return initials || name.trim().slice(0, 2).toUpperCase() || 'P';
}

/** Build the default name→initials mapping for a parsed plan (keyed by person id). */
export function defaultInitialsMap(plan: Plan): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of plan.people) map[p.id] = deriveInitials(p.name);
  return map;
}

function slugId(initials: string, taken: Set<string>): string {
  const base = initials.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'p';
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

/**
 * Replace every person's name AND id with initials-derived values, remapping
 * assignments and the focus map. `initialsMap` is keyed by the ORIGINAL person id.
 * Empty/blank initials fall back to the derived default so no full name leaks.
 */
export function applyInitials(plan: Plan, initialsMap: Record<string, string>): Plan {
  const takenIds = new Set<string>();
  const idRemap: Record<string, string> = {};

  const people = plan.people.map((p) => {
    const initials = (initialsMap[p.id]?.trim() || deriveInitials(p.name)).slice(0, 6);
    const newId = slugId(initials, takenIds);
    idRemap[p.id] = newId;
    return { ...p, id: newId, name: initials };
  });

  const assignments: Assignment[] = plan.assignments.map((a) => ({
    ...a,
    personId: idRemap[a.personId] ?? a.personId,
  }));

  const focusByLine: Record<string, string> = {};
  for (const [key, value] of Object.entries(plan.focusByLine)) {
    const [oldPersonId, productId] = key.split('::');
    const newPersonId = idRemap[oldPersonId ?? ''] ?? oldPersonId ?? '';
    focusByLine[lineKey(newPersonId, productId ?? '')] = value;
  }

  return { ...plan, people, assignments, focusByLine };
}
