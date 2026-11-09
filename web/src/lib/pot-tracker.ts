import { potionById, mesoCost, type Potion } from '../data/potions';
import { totalsByItem, type UseTabReading } from './detect/inventory.ts';

/**
 * Pot use from scans of the Use tab. The player opens their Use tab; each tracked item gets a baseline the
 * first time its total can be read, and every later read updates "now". Use is the net fall in an item's
 * total since its baseline, so pots bought or picked up in between make it look smaller (a rise is shown
 * as 0 used, never negative). The tracker can't tell a pot drunk from one traded away or dropped.
 *
 * Items are independent: a stack whose count can't be read leaves out only that item (it keeps its last
 * good figure, flagged), and every other pot carries on.
 *
 * Only what is visible is counted: the tab scrolls, so a reading taken at a different scroll position is
 * a different page and is never compared with the baseline.
 */

export interface PotTrackerState {
  /** When counting started (the first scan with a readable item), or null before that. */
  readonly since: number | null;
  /** The scrollbar position the counts were taken at; a scan only counts at the same spot. */
  readonly scroll: number | null;
  /** Each item's total when it was first read. */
  readonly baseline: ReadonlyMap<number, number>;
  /** Each item's last good total. */
  readonly latest: ReadonlyMap<number, number>;
  /** Items whose count couldn't be read in the latest scan. */
  readonly unreadable: ReadonlySet<number>;
  /** The Use tab is open but scrolled away from where counting started. */
  readonly scrolledAway: boolean;
}

export const startPotTracking = (): PotTrackerState => ({
  since: null,
  scroll: null,
  baseline: new Map(),
  latest: new Map(),
  unreadable: new Set(),
  scrolledAway: false,
});

/** Folds one frame's Use-tab reading (null when the Use tab isn't showing) into the tracker. */
export function observePots(state: PotTrackerState, reading: UseTabReading | null, nowMs: number): PotTrackerState {
  if (reading === null) return state;
  const { totals, unreadable } = totalsByItem(reading);
  const started = state.since !== null;
  if (!started && totals.size === 0) return { ...state, unreadable };
  if (started && reading.scroll !== state.scroll) return { ...state, scrolledAway: true };

  // An item seen for the first time gets its baseline now; one that was baselined but is gone has been used up.
  const latest = new Map<number, number>();
  for (const id of state.baseline.keys()) latest.set(id, unreadable.has(id) ? (state.latest.get(id) ?? 0) : (totals.get(id) ?? 0));
  const baseline = new Map(state.baseline);
  for (const [id, total] of totals) {
    if (!baseline.has(id)) baseline.set(id, total);
    latest.set(id, total);
  }
  return {
    since: state.since ?? nowMs,
    scroll: started ? state.scroll : reading.scroll,
    baseline,
    latest,
    unreadable,
    scrolledAway: false,
  };
}

/** Starts counting again from the latest figures (e.g. after restocking). */
export function rescanPots(state: PotTrackerState): PotTrackerState {
  return state.since === null ? state : { ...state, baseline: new Map(state.latest), scrolledAway: false };
}

export interface PotRow {
  readonly id: number;
  readonly name: string;
  readonly before: number;
  readonly now: number;
  /** The count couldn't be read in the latest scan, so `now` is the last good figure. */
  readonly stale: boolean;
  readonly used: number;
  /** Mesos at the NPC price, or null when no NPC sells it. */
  readonly mesos: number | null;
  /** HP/MP restored by what was used; null for a percentage potion (it depends on max HP/MP). */
  readonly hp: number | null;
  readonly mp: number | null;
}

export interface PotTotals {
  readonly used: number;
  /** Mesos for the items that have an NPC price. */
  readonly mesos: number;
  /** Items used that have no NPC price, so `mesos` is a floor. */
  readonly mesosUnknownFor: number;
  readonly hp: number;
  readonly mp: number;
  /** Percentage potions used, whose HP/MP is not in `hp`/`mp`. */
  readonly percentItemsUsed: number;
}

export interface PotView {
  readonly rows: readonly PotRow[];
  readonly totals: PotTotals;
  readonly scrolledAway: boolean;
  /** Names of tracked items on screen whose count couldn't be read, so they aren't (all) counted. */
  readonly unreadable: readonly string[];
  /** When counting started. */
  readonly since: number;
}

function restoreOf(potion: Potion, used: number, flat: 'hp' | 'mp', percent: 'hpPercent' | 'mpPercent'): number | null {
  if (potion[flat] !== undefined) return (potion[flat] ?? 0) * used;
  return potion[percent] !== undefined ? null : 0;
}

function rowFor(id: number, before: number, now: number, stale: boolean): PotRow | null {
  const potion = potionById(id);
  if (!potion || (before === 0 && now === 0)) return null;
  const used = Math.max(0, before - now);
  return {
    id,
    name: potion.name,
    before,
    now,
    stale,
    used,
    mesos: used === 0 ? 0 : mesoCost(potion, used),
    hp: restoreOf(potion, used, 'hp', 'hpPercent'),
    mp: restoreOf(potion, used, 'mp', 'mpPercent'),
  };
}

/** What the overview shows, or null until a pot has been read. */
export function buildPotView(state: PotTrackerState): PotView | null {
  if (state.since === null) return null;

  const rows = [...state.baseline]
    .map(([id, before]) => rowFor(id, before, state.latest.get(id) ?? 0, state.unreadable.has(id)))
    .filter((row): row is PotRow => row !== null)
    .sort((a, b) => Number(b.used > 0) - Number(a.used > 0) || a.name.localeCompare(b.name));

  const usedRows = rows.filter((row) => row.used > 0);
  const totals: PotTotals = {
    used: rows.reduce((sum, row) => sum + row.used, 0),
    mesos: rows.reduce((sum, row) => sum + (row.mesos ?? 0), 0),
    mesosUnknownFor: usedRows.filter((row) => row.mesos === null).length,
    hp: rows.reduce((sum, row) => sum + (row.hp ?? 0), 0),
    mp: rows.reduce((sum, row) => sum + (row.mp ?? 0), 0),
    percentItemsUsed: usedRows.filter((row) => row.hp === null || row.mp === null).length,
  };
  const unreadable = [...state.unreadable].map((id) => potionById(id)?.name).filter((name): name is string => name !== undefined).sort();
  return { rows, totals, scrolledAway: state.scrolledAway, unreadable, since: state.since };
}
