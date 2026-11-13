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
  /** Some of `expGained` is estimated from the EXP bar's percent (the game hides raw EXP at high levels). */
  readonly expEstimated: boolean;
  readonly expPerHour: number;
  readonly expPctGained: number;
  readonly expPctPerHour: number;
}

/** A stretch the player paused tracking: from when they paused until they resumed (null while still paused). */
export interface Pause {
  readonly from: number;
  readonly to: number | null;
}

/** Milliseconds of [a, b] that fall inside a pause. A pause with no end yet runs to the end of the span. */
export function pausedWithin(pauses: readonly Pause[], a: number, b: number): number {
  return pauses.reduce((total, p) => total + Math.max(0, Math.min(b, p.to ?? b) - Math.max(a, p.from)), 0);
}

/** Did a pause fall between two readings? No reading is taken while paused, so the gap holds nothing earned. */
function pausedBetween(pauses: readonly Pause[], a: number, b: number): boolean {
  return pauses.some((p) => p.from < b && (p.to ?? Number.POSITIVE_INFINITY) > a);
}

const HOUR_MS = 3_600_000;
/** A percent drop bigger than this with no level reading is assumed to be a level-up wrap. */
const LEVEL_UP_DROP_THRESHOLD = 50;
/** Readings are ~3s apart; closer together than this, a level label rising while EXP keeps climbing is a relabel, not a level-up. */
const RELABEL_WINDOW_MS = 30_000;
/** Below this percent, raw/percent is too coarse (two decimals) to estimate a level's size. */
const MIN_PCT_FOR_LEVEL_SIZE = 1;

const ZERO: Rates = { elapsedMs: 0, mesoGained: 0, mesoPerHour: 0, expGained: 0, expEstimated: false, expPerHour: 0, expPctGained: 0, expPctPerHour: 0 };

function perHour(amount: number, elapsedMs: number): number {
  return elapsedMs > 0 ? (amount / elapsedMs) * HOUR_MS : 0;
}

/** Pairs each reading having `pick` with the previous one that also had it, skipping failed reads. */
function consecutive<T extends Reading>(
  readings: readonly T[],
  pick: (r: T) => number | null,
  pauses: readonly Pause[] = [],
): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  let prev: T | null = null;
  for (const current of readings) {
    if (pick(current) === null) continue;
    // A pair that straddles a pause is skipped: whatever changed meanwhile was not earned while tracking.
    if (prev && !pausedBetween(pauses, prev.takenAt, current.takenAt)) pairs.push([prev, current]);
    prev = current;
  }
  return pairs;
}

/** Sum of positive meso deltas between consecutive successful reads (spending is ignored). */
function sumMesoGain(readings: readonly Reading[], pauses: readonly Pause[]): number {
  return consecutive(readings, (r) => r.meso, pauses).reduce((total, [a, b]) => total + Math.max(0, b.meso! - a.meso!), 0);
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

/**
 * EXP gained between two readings worked out from the EXP bar's percent alone, for when the game shows
 * no raw EXP (it hides it once a level needs more than a million). The share of the level gained times
 * the EXP that level needs, from the table. Across a level-up it is the rest of the old level plus the
 * start of the new one. `levelAt` is the level each reading is sized by: its own when it was read, else the
 * nearest known one. With no level known anywhere there is nothing to scale by, so it counts for nothing.
 */
function pctExpDelta(prev: Reading, current: Reading, levelAt: ReadonlyMap<Reading, number | null>): number {
  const sizeOf = (level: number | null | undefined) => (level == null ? null : expToNext(level));
  const before = sizeOf(levelAt.get(prev) ?? levelAt.get(current));
  if (leveledUp(prev, current)) {
    const after = sizeOf(levelAt.get(current) ?? levelAt.get(prev));
    if (before === null || after === null) return 0;
    return ((100 - prev.expPct!) / 100) * before + (current.expPct! / 100) * after;
  }
  if (before === null) return 0;
  return (Math.max(0, current.expPct! - prev.expPct!) / 100) * before;
}

/**
 * The level to size each reading by. A tick whose level digits didn't read takes the last level that did
 * (a character stays at its level until it levels up, and a level-up is spotted from the bar wrapping), and
 * a reading before the first known level takes the first one.
 */
function levelsByReading(sorted: readonly Reading[]): ReadonlyMap<Reading, number | null> {
  const known = sorted.find((r) => r.level !== null)?.level ?? null;
  let last: number | null = known;
  const levels = new Map<Reading, number | null>();
  for (const r of sorted) {
    last = r.level ?? last;
    levels.set(r, last);
  }
  return levels;
}

/** One stretch of EXP gain, ending at reading `to`. */
interface GainStep {
  readonly to: Reading;
  readonly gain: number;
  readonly estimated: boolean;
}

/**
 * Every EXP gain in the session, in time order. Where raw EXP was read it is exact. Before the first raw
 * reading and after the last one (all of it, when the game never shows raw EXP) the gain is estimated from
 * the percent. Inside the raw span the exact figures already cover everything, so nothing is added twice.
 */
function expGainSteps(sorted: readonly Reading[], pauses: readonly Pause[]): readonly GainStep[] {
  const steps: GainStep[] = consecutive(sorted, (r) => r.exp, pauses).map(([a, b]) => ({ to: b, gain: expDelta(a, b), estimated: false }));
  const raw = sorted.filter((r) => r.exp !== null);
  const firstRaw = raw[0]?.takenAt ?? null;
  const lastRaw = raw[raw.length - 1]?.takenAt ?? null;
  const levelAt = levelsByReading(sorted);
  for (const [a, b] of consecutive(sorted, (r) => r.expPct, pauses)) {
    const outsideRaw = firstRaw === null || lastRaw === null || b.takenAt <= firstRaw || a.takenAt >= lastRaw;
    if (outsideRaw) steps.push({ to: b, gain: pctExpDelta(a, b, levelAt), estimated: true });
  }
  return steps.sort((x, y) => x.to.takenAt - y.to.takenAt);
}

function sumExpPctGain(readings: readonly Reading[], pauses: readonly Pause[]): number {
  return consecutive(readings, (r) => r.expPct, pauses).reduce((total, [a, b]) => {
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
export function expGainSeries(readings: readonly Reading[], pauses: readonly Pause[] = []): readonly ExpGainPoint[] {
  const sorted = [...readings].sort((a, b) => a.takenAt - b.takenAt);
  const first = sorted.find((r) => r.exp !== null || r.expPct !== null);
  if (!first) return [];

  const steps = expGainSteps(sorted, pauses);
  const gainTo = new Map<Reading, number>();
  for (const step of steps) gainTo.set(step.to, (gainTo.get(step.to) ?? 0) + step.gain);

  const start = first.takenAt;
  const points: ExpGainPoint[] = [{ elapsedMs: 0, gained: 0 }];
  let total = 0;
  for (const r of sorted) {
    if (r === first || r.takenAt < start) continue;
    // One point per raw EXP reading, plus one wherever an estimated gain ended.
    if (r.exp === null && !gainTo.has(r)) continue;
    total += gainTo.get(r) ?? 0;
    points.push({ elapsedMs: r.takenAt - start - pausedWithin(pauses, start, r.takenAt), gained: total });
  }
  return points;
}

/**
 * Totals and per-hour rates for a session. Pass `nowMs` (the wall clock) to measure elapsed time up to
 * now instead of up to the last reading: the clock keeps running and the rates keep projecting
 * (gained so far / time so far) even when a stretch of frames couldn't be read.
 * Time the player paused tracking counts for nothing: it is left out of the elapsed time, and nothing
 * gained across it is added.
 */
export function computeRates(readings: readonly Reading[], nowMs?: number, pauses: readonly Pause[] = []): Rates {
  if (readings.length === 0 || (readings.length < 2 && nowMs === undefined)) return ZERO;
  const sorted = [...readings].sort((a, b) => a.takenAt - b.takenAt);
  const endMs = Math.max(sorted[sorted.length - 1].takenAt, nowMs ?? 0);
  const elapsedMs = Math.max(0, endMs - sorted[0].takenAt - pausedWithin(pauses, sorted[0].takenAt, endMs));
  const mesoGained = sumMesoGain(sorted, pauses);
  const steps = expGainSteps(sorted, pauses);
  const expGained = steps.reduce((total, s) => total + s.gain, 0);
  const expPctGained = sumExpPctGain(sorted, pauses);
  return {
    elapsedMs,
    mesoGained,
    mesoPerHour: perHour(mesoGained, elapsedMs),
    expGained,
    expEstimated: steps.some((s) => s.estimated && s.gain > 0),
    expPerHour: perHour(expGained, elapsedMs),
    expPctGained,
    expPctPerHour: perHour(expPctGained, elapsedMs),
  };
}
