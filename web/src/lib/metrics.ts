import { expToNext } from '../data/expTable';

export interface Reading {
  /** Epoch milliseconds the frame was captured. */
  readonly takenAt: number;
  readonly meso: number | null;
  /** Raw EXP points (a whole number). Primary XP metric; expPct is a coarse cross-check. */
  readonly exp: number | null;
  readonly expPct: number | null;
  readonly level: number | null;
}

export interface Rates {
  readonly elapsedMs: number;
  readonly mesoGained: number;
  readonly mesoPerHour: number;
  readonly expGained: number;
  readonly expPerHour: number;
  readonly expPctGained: number;
  readonly expPctPerHour: number;
}

const HOUR_MS = 3_600_000;
/** A percent drop bigger than this with no level reading is assumed to be a level-up wrap. */
const LEVEL_UP_DROP_THRESHOLD = 50;
/** Readings are ~3s apart; closer together than this, a level label rising while EXP keeps climbing is a relabel, not a level-up. */
const RELABEL_WINDOW_MS = 30_000;
/** Below this percent, raw/percent is too coarse (two decimals) to estimate a level's size. */
const MIN_PCT_FOR_LEVEL_SIZE = 1;

const ZERO: Rates = { elapsedMs: 0, mesoGained: 0, mesoPerHour: 0, expGained: 0, expPerHour: 0, expPctGained: 0, expPctPerHour: 0 };

function perHour(amount: number, elapsedMs: number): number {
  return elapsedMs > 0 ? (amount / elapsedMs) * HOUR_MS : 0;
}

/** Pairs each reading having `pick` with the previous one that also had it, skipping failed reads. */
function consecutive<T extends Reading>(readings: readonly T[], pick: (r: T) => number | null): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  let prev: T | null = null;
  for (const current of readings) {
    if (pick(current) === null) continue;
    if (prev) pairs.push([prev, current]);
    prev = current;
  }
  return pairs;
}

/** Sum of positive meso deltas between consecutive successful reads (spending is ignored). */
function sumMesoGain(readings: readonly Reading[]): number {
  return consecutive(readings, (r) => r.meso).reduce((total, [a, b]) => total + Math.max(0, b.meso! - a.meso!), 0);
}

/** Did the EXP bar wrap (a drop of more than half a level)? That only happens on a level-up, whatever the level label says. */
function barWrapped(prev: Reading, current: Reading): boolean {
  return prev.expPct !== null && current.expPct !== null && current.expPct - prev.expPct < -LEVEL_UP_DROP_THRESHOLD;
}

/** True when the raw counter (else the percent) carried on climbing from `prev` to `current`, which a level-up never does. */
function keptClimbing(prev: Reading, current: Reading): boolean {
  if (prev.exp !== null && current.exp !== null) return current.exp >= prev.exp;
  if (prev.expPct !== null && current.expPct !== null) return current.expPct >= prev.expPct;
  return false;
}

/**
 * Did the character level up between two readings?
 *
 * A wrapped EXP bar is a level-up regardless of the label (the label can lag it by a tick: level
 * digits we have no template for are inferred from EXP, and just after a level-up EXP is so small
 * that the old level still fits). A rising label is a level-up too, except when the readings are
 * seconds apart and EXP kept climbing: then the label was only catching up to a level-up we already
 * counted, and counting it again would add a whole level's EXP. Across a long gap (alt-tabbed,
 * unreadable) EXP can legitimately end higher in the new level, so the label is trusted there.
 */
function leveledUp(prev: Reading, current: Reading): boolean {
  if (barWrapped(prev, current)) return true;
  if (prev.level === null || current.level === null || current.level <= prev.level) return false;
  const shortGap = current.takenAt - prev.takenAt <= RELABEL_WINDOW_MS;
  return !(shortGap && keptClimbing(prev, current));
}

/**
 * Raw EXP gained between two readings. Within a level that's the plain delta
 * (a drop is a death penalty, not negative income). Across a level-up the raw
 * counter resets, so the EXP left in the old level is estimated from the last
 * reading's raw/percent; if that can't be estimated, the gap is skipped
 * rather than invented.
 */
function expDelta(prev: Reading, current: Reading): number {
  if (!leveledUp(prev, current)) return Math.max(0, current.exp! - prev.exp!);

  const levelSize = levelSizeAt(prev);
  if (levelSize === null) return 0;
  return Math.max(0, levelSize - prev.exp!) + current.exp!;
}

/** EXP needed to clear `reading`'s level: exact from the EXP table, else estimated from raw / percent. */
function levelSizeAt(reading: Reading): number | null {
  const exact = reading.level === null ? null : expToNext(reading.level);
  if (exact !== null) return exact;

  const pct = reading.expPct;
  if (pct === null || pct < MIN_PCT_FOR_LEVEL_SIZE) return null;
  return reading.exp! / (pct / 100);
}

function sumExpGain(readings: readonly Reading[]): number {
  return consecutive(readings, (r) => r.exp).reduce((total, [a, b]) => total + expDelta(a, b), 0);
}

function sumExpPctGain(readings: readonly Reading[]): number {
  return consecutive(readings, (r) => r.expPct).reduce((total, [a, b]) => {
    if (leveledUp(a, b)) return total + (100 - a.expPct! + b.expPct!);
    return total + Math.max(0, b.expPct! - a.expPct!);
  }, 0);
}

export interface ExpGainPoint {
  /** Milliseconds since the first EXP reading of the session. */
  readonly elapsedMs: number;
  /** Total EXP gained since that first reading, across level-ups. Never goes down. */
  readonly gained: number;
}

/**
 * The running total of EXP gained over the session, one point per EXP reading, for charting.
 * Uses the same level-up handling as `computeRates`, so the last point equals `expGained`.
 */
export function expGainSeries(readings: readonly Reading[]): readonly ExpGainPoint[] {
  const withExp = [...readings].filter((r) => r.exp !== null).sort((a, b) => a.takenAt - b.takenAt);
  if (withExp.length === 0) return [];

  const start = withExp[0].takenAt;
  const points: ExpGainPoint[] = [{ elapsedMs: 0, gained: 0 }];
  let total = 0;
  for (let i = 1; i < withExp.length; i += 1) {
    total += expDelta(withExp[i - 1], withExp[i]);
    points.push({ elapsedMs: withExp[i].takenAt - start, gained: total });
  }
  return points;
}

/**
 * Totals and per-hour rates for a session. Pass `nowMs` (the wall clock) to measure elapsed time up to
 * now instead of up to the last reading: the clock keeps running and the rates keep projecting
 * (gained so far / time so far) even when a stretch of frames couldn't be read.
 */
export function computeRates(readings: readonly Reading[], nowMs?: number): Rates {
  if (readings.length === 0 || (readings.length < 2 && nowMs === undefined)) return ZERO;
  const sorted = [...readings].sort((a, b) => a.takenAt - b.takenAt);
  const endMs = Math.max(sorted[sorted.length - 1].takenAt, nowMs ?? 0);
  const elapsedMs = endMs - sorted[0].takenAt;
  const mesoGained = sumMesoGain(sorted);
  const expGained = sumExpGain(sorted);
  const expPctGained = sumExpPctGain(sorted);
  return {
    elapsedMs,
    mesoGained,
    mesoPerHour: perHour(mesoGained, elapsedMs),
    expGained,
    expPerHour: perHour(expGained, elapsedMs),
    expPctGained,
    expPctPerHour: perHour(expPctGained, elapsedMs),
  };
}
