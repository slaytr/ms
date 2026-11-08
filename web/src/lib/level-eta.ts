import { expToNext } from '../data/expTable';

const HOUR_MS = 3_600_000;

/** A rate from the first few kills is noise. Wait this long before promising a time. */
export const MIN_ELAPSED_FOR_ETA_MS = 120_000;
/** Beyond this the estimate is meaningless; show a cap instead of a huge number. */
const MAX_DISPLAY_HOURS = 100;

export interface LevelProgress {
  readonly level: number;
  readonly exp: number;
  /** EXP needed to clear this level, from the Classic EXP table. */
  readonly need: number;
  readonly remaining: number;
  /** 0 to 1. */
  readonly fraction: number;
}

/** Where the player is within their current level. Null if the level or EXP is unknown, or off the table. */
export function levelProgress(level: number | null, exp: number | null): LevelProgress | null {
  if (level === null || exp === null || exp < 0) return null;
  const need = expToNext(level);
  if (need === null) return null;
  const clamped = Math.min(exp, need); // EXP past the bar means a level-up we haven't seen yet
  return { level, exp, need, remaining: need - clamped, fraction: clamped / need };
}

export type Eta =
  | { readonly state: 'ready'; readonly ms: number }
  /** Not enough play yet to trust a rate. */
  | { readonly state: 'calculating' }
  /** Enough play, but no EXP gained. */
  | { readonly state: 'stalled' }
  /** Level or EXP not readable yet. */
  | { readonly state: 'unknown' };

/**
 * Time to level at the current EXP-per-hour. The rate is the session's live average, so the
 * estimate moves as the rate does; after a level-up `progress` is for the new level.
 */
export function estimateEta(progress: LevelProgress | null, expPerHour: number, elapsedMs: number): Eta {
  if (progress === null) return { state: 'unknown' };
  if (progress.remaining === 0) return { state: 'ready', ms: 0 };
  if (elapsedMs < MIN_ELAPSED_FOR_ETA_MS) return { state: 'calculating' };
  if (!Number.isFinite(expPerHour) || expPerHour <= 0) return { state: 'stalled' };
  return { state: 'ready', ms: (progress.remaining / expPerHour) * HOUR_MS };
}

/** "2h 14m", "38m", "<1m", or "Now". Rounded to the nearest minute. */
export function formatEta(ms: number): string {
  if (ms <= 0) return 'Now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '<1m';
  const hours = Math.floor(minutes / 60);
  if (hours >= MAX_DISPLAY_HOURS) return `${MAX_DISPLAY_HOURS}h+`;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes % 60}m`;
}
