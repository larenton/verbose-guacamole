// ─────────────────────────────────────────────────────────────────────────────
// Domain model — Applied Programs H2 Resourcing Dashboard
//
// Six stored entities (Person, Product, Month, Assignment, Scenario, Setting).
// Everything else — capacity, allocated, headroom, utilisation, cost — is
// DERIVED and never stored. See src/engine.
// ─────────────────────────────────────────────────────────────────────────────

/** The eight product codes used across the plan. */
export type ProductCode = 'H1' | 'ES' | 'CD' | 'HM' | 'ID' | 'DM' | 'PF' | 'XX';

/** The single global unit every figure can be re-expressed in. */
export type Unit = 'days' | 'fte' | 'dollars';

export interface Person {
  id: string;
  name: string;
  role: string;
  /** "Project Services" | "Product Development" | "Product-dedicated" */
  pool: string;
  /** Fully-loaded annual cost in $. */
  annualCost: number;
  /** Availability to the portfolio as a fraction of 1.0 FTE (Alan Hatem = 0.2). */
  fteAvailability: number;
  fundingTreatment: string;
  active: boolean;
  /**
   * Optional planned start / end for future hires. When unset the person is
   * available across the whole horizon (matches the seed workbook, where
   * CAPACITY runs flat and allocation simply starts at the hire month).
   * Reserved for scenario work; the importer does not set these.
   */
  startMonthId?: string;
  endMonthId?: string;
  /** Display order as imported. */
  order: number;
}

export interface Product {
  id: string;
  code: ProductCode;
  /** Base name without the trailing "(CODE)". */
  name: string;
  /** Semantic identity colour (hex). Never decorative. */
  colour: string;
  /** Intake month id, if this product has a delivery intake (ES/CD/HM/ID/DM). */
  intakeMonthId?: string;
  status?: string;
  /**
   * True for the six real products (H1, ES, CD, HM, ID, DM). False for PF
   * (portfolio/BAU) and XX (admin) — these consume real capacity but are not
   * products, so the product views can filter them out.
   */
  isProduct: boolean;
  order: number;
}

export interface Month {
  /** Stable id "YYYY-MM", e.g. "2026-07". */
  id: string;
  /** Human label "Jul-26". */
  label: string;
  year: number;
  /** 1-12. */
  monthNo: number;
  /** Working days at 1.0 FTE for this month. Default 20, editable per month. */
  workingDays: number;
  /** 0-based position across the horizon. */
  order: number;
}

export interface Assignment {
  id: string;
  personId: string;
  productId: string;
  monthId: string;
  /** Working days on this product in this month. The planning currency. */
  days: number;
  note?: string;
}

export interface Scenario {
  id: string;
  name: string;
  baseScenarioId?: string;
  createdAt: string;
}

export interface Settings {
  /** Working days per year for the daily-rate basis. Default 220. */
  workingDaysPerYear: number;
  /** Accepted planning ceiling as a fraction of capacity. Default 1.15 (115%). */
  toleranceCeiling: number;
  /** Default working days per month for new months. Default 20. */
  defaultWorkingDaysPerMonth: number;
}

/**
 * A full plan document — the normalised store. This is what autosaves to
 * IndexedDB and what "Save to file" writes as JSON.
 */
export interface Plan {
  people: Person[];
  products: Product[];
  months: Month[];
  assignments: Assignment[];
  /**
   * Per person×product "focus / project" text from the traffic sheet's column C.
   * Keyed by `${personId}::${productId}`. UI/label metadata, not a core entity.
   */
  focusByLine: Record<string, string>;
  settings: Settings;
  /**
   * Plan-level UI annotations that should travel with the plan (saved to file
   * and IndexedDB). Not a core entity — kept separate from the six.
   */
  annotations?: {
    /** One-line rationale per pinch point, keyed by `${personId}|${monthId}`. */
    pinchRationales?: Record<string, string>;
  };
  meta: {
    schemaVersion: number;
    importedAt?: string;
    sourceFile?: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  workingDaysPerYear: 220,
  toleranceCeiling: 1.15,
  defaultWorkingDaysPerMonth: 20,
};

export const SCHEMA_VERSION = 1;

/** Key for the per-line focus map. */
export function lineKey(personId: string, productId: string): string {
  return `${personId}::${productId}`;
}
