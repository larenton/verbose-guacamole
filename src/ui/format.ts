import type { Unit } from '../model/types';

// ─────────────────────────────────────────────────────────────────────────────
// Display formatting. Numbers must align in columns, so formatting is fixed-width
// per unit. Days: up to 1 dp. FTE: 2 dp. $: whole dollars with thousands.
// ─────────────────────────────────────────────────────────────────────────────

const dollarsFmt = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

const dollarsCompact = new Intl.NumberFormat('en-AU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Format a value that is already expressed in the target unit. */
export function formatUnit(value: number, unit: Unit, opts: { compact?: boolean } = {}): string {
  switch (unit) {
    case 'days':
      return formatDays(value);
    case 'fte':
      return value.toFixed(2);
    case 'dollars':
      if (opts.compact) return dollarsCompact.format(value);
      return dollarsFmt.format(Math.round(value));
  }
}

/** Days: integers show as integers; fractional shows one decimal. */
export function formatDays(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/** Signed value with an explicit + for positive (headroom rails, diffs). */
export function formatSigned(value: number, unit: Unit): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const body = formatUnit(Math.abs(value), unit);
  return value === 0 ? body : `${sign}${body}`;
}

export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Compact $ for tight summary cells. */
export function formatDollarsCompact(value: number): string {
  return dollarsCompact.format(value);
}

/** A short "empty" glyph for unassigned cells — near-blank, not grey noise. */
export const EMPTY_CELL = '·';
