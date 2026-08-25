import type { Assignment, Plan } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// Pure, immutable plan mutations. Each returns a new Plan (structurally shared
// where cheap). The store wraps these with history + autosave.
// ─────────────────────────────────────────────────────────────────────────────

let idCounter = 0;
function newAssignmentId(): string {
  idCounter += 1;
  return `a-${Date.now().toString(36)}-${idCounter}`;
}

/** Set the days on a person-product-month cell. 0 / NaN removes the assignment. */
export function setDays(
  plan: Plan,
  personId: string,
  productId: string,
  monthId: string,
  days: number,
): Plan {
  const clean = Number.isFinite(days) ? Math.max(0, days) : 0;
  const i = plan.assignments.findIndex(
    (a) => a.personId === personId && a.productId === productId && a.monthId === monthId,
  );

  let assignments: Assignment[];
  if (clean === 0) {
    if (i === -1) return plan; // nothing to remove
    assignments = plan.assignments.filter((_, idx) => idx !== i);
  } else if (i === -1) {
    assignments = [
      ...plan.assignments,
      { id: newAssignmentId(), personId, productId, monthId, days: clean },
    ];
  } else {
    if (plan.assignments[i]!.days === clean) return plan; // no change
    assignments = plan.assignments.slice();
    assignments[i] = { ...assignments[i]!, days: clean };
  }
  return { ...plan, assignments };
}

export interface CellEdit {
  personId: string;
  productId: string;
  monthId: string;
  days: number;
}

/** Apply many cell edits at once (drag-fill, paste). */
export function setManyDays(plan: Plan, edits: CellEdit[]): Plan {
  let next = plan;
  for (const e of edits) next = setDays(next, e.personId, e.productId, e.monthId, e.days);
  return next;
}

/** Ensure a person-product line exists (so an empty editable row can be added). */
export function ensureLine(plan: Plan, personId: string, productId: string): Plan {
  const key = `${personId}::${productId}`;
  if (plan.focusByLine[key] !== undefined) return plan;
  const hasAssignment = plan.assignments.some(
    (a) => a.personId === personId && a.productId === productId,
  );
  if (hasAssignment) return plan;
  return { ...plan, focusByLine: { ...plan.focusByLine, [key]: '' } };
}

export function setPersonRate(plan: Plan, personId: string, annualCost: number): Plan {
  return {
    ...plan,
    people: plan.people.map((p) =>
      p.id === personId ? { ...p, annualCost: Math.max(0, annualCost) } : p,
    ),
  };
}

export function setPersonFte(plan: Plan, personId: string, fteAvailability: number): Plan {
  return {
    ...plan,
    people: plan.people.map((p) =>
      p.id === personId ? { ...p, fteAvailability: Math.max(0, fteAvailability) } : p,
    ),
  };
}

export function setMonthWorkingDays(plan: Plan, monthId: string, workingDays: number): Plan {
  return {
    ...plan,
    months: plan.months.map((m) =>
      m.id === monthId ? { ...m, workingDays: Math.max(0, workingDays) } : m,
    ),
  };
}

export function setPinchRationale(
  plan: Plan,
  personId: string,
  monthId: string,
  text: string,
): Plan {
  const key = `${personId}|${monthId}`;
  const pinchRationales = { ...(plan.annotations?.pinchRationales ?? {}) };
  if (text.trim()) pinchRationales[key] = text;
  else delete pinchRationales[key];
  return { ...plan, annotations: { ...plan.annotations, pinchRationales } };
}
