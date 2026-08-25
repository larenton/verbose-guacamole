import type { UtilBand } from '../engine/calc';

// ─────────────────────────────────────────────────────────────────────────────
// Semantic colour. Colour never decorates — hue is reserved entirely for the
// utilisation scale and product identity. Tints are pale so tabular figures stay
// legible when projected.
//
//   < 70%      cool/quiet   — a lot of headroom (not necessarily good)
//   70–95%     neutral      — healthy
//   95–100%    full
//   100–115%   amber        — the agreed tolerance band
//   > 115%     red          — breach; not deliverable as drawn
//   unassigned near-blank
// ─────────────────────────────────────────────────────────────────────────────

export interface BandStyle {
  /** Cell background tint. */
  bg: string;
  /** Text colour for figures on that tint. */
  fg: string;
  /** A stronger accent (rails, chips, badges). */
  accent: string;
  label: string;
}

export const BAND_STYLE: Record<UtilBand, BandStyle> = {
  unassigned: { bg: '#ffffff', fg: '#cbd5e1', accent: '#e2e8f0', label: 'Unassigned' },
  under: { bg: '#eff6ff', fg: '#1e40af', accent: '#60a5fa', label: 'Under 70%' },
  healthy: { bg: '#f4faf6', fg: '#166534', accent: '#4ade80', label: '70–95%' },
  full: { bg: '#ecfdf5', fg: '#065f46', accent: '#10b981', label: '95–100%' },
  tolerance: { bg: '#fef6e7', fg: '#92400e', accent: '#f59e0b', label: '100–115% (tolerance)' },
  breach: { bg: '#fdecec', fg: '#991b1b', accent: '#ef4444', label: 'Over 115% (breach)' },
};

export const BAND_ORDER: UtilBand[] = [
  'unassigned',
  'under',
  'healthy',
  'full',
  'tolerance',
  'breach',
];

/** Headroom rail colours: surplus above the centreline, deficit below. */
export const RAIL_SURPLUS = '#93c5fd'; // cool — bench/room
export const RAIL_DEFICIT = '#f59e0b'; // amber — pinch
export const RAIL_BREACH = '#ef4444'; // red — breach
export const RAIL_CENTRE = '#cbd5e1';
