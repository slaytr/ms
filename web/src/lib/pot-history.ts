import type { PotView } from './pot-tracker.ts';

/** One point on a potion's running total: milliseconds since the session's first reading, and pots used by then. */
export interface PotSample {
  readonly elapsedMs: number;
  readonly used: number;
}

/** Running pots-used per item id, for charting. A sample is only kept when the total changes (or the item first appears). */
export interface PotHistory {
  readonly series: ReadonlyMap<number, readonly PotSample[]>;
}

export const emptyPotHistory: PotHistory = Object.freeze({ series: new Map<number, readonly PotSample[]>() });

/**
 * Folds the current pot view into the history. Returns the same object when nothing changed, so a watcher
 * on it only fires on real changes. `originMs` is the session's first reading, so the x axis lines up
 * with the EXP chart.
 */
export function recordPotHistory(history: PotHistory, view: PotView | null, originMs: number, nowMs: number): PotHistory {
  if (view === null) return history;
  let series: Map<number, readonly PotSample[]> | null = null;
  for (const row of view.rows) {
    const samples = history.series.get(row.id) ?? [];
    const last = samples[samples.length - 1];
    if (last && last.used === row.used) continue;
    series ??= new Map(history.series);
    series.set(row.id, [...samples, { elapsedMs: Math.max(0, nowMs - originMs), used: row.used }]);
  }
  return series ? { series } : history;
}
