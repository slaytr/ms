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
 * Repotting: pausing banks what has been used so far and freezes counting, so buying a stack of pots isn't
 * mistaken for anything. On resume every item gets a fresh baseline from the restocked inventory and use
 * keeps adding to the banked total.
 *
 * Only what is visible is counted: the tab scrolls, so a reading taken at a different scroll position is
 * a different page and is never compared with the baseline.
 */

export interface PotTrackerState {
  /** When counting started (the first scan with a readable item), or null before that. */
  readonly since: number | null;
  /** The scrollbar position the counts were taken at; a scan only counts at the same spot. */
  readonly scroll: number | null;
  /** Each item's total when it was first read (since the last pause). */
  readonly baseline: ReadonlyMap<number, number>;
  /** Each item's last good total. */
  readonly latest: ReadonlyMap<number, number>;
  /** Items whose count couldn't be read in the latest scan. */
  readonly unreadable: ReadonlySet<number>;
  /** The Use tab is open but scrolled away from where counting started. */
  readonly scrolledAway: boolean;
  /** Counting is frozen while the player restocks. */
  readonly paused: boolean;
  /** Pots used before the last pause(s), per item. */
  readonly carried: ReadonlyMap<number, number>;
}

export const startPotTracking = (): PotTrackerState => ({
  since: null,
  scroll: null,
  baseline: new Map(),
  latest: new Map(),
  unreadable: new Set(),
  scrolledAway: false,
  paused: false,
  carried: new Map(),
});

/** Folds one frame's Use-tab reading (null when the Use tab isn't showing) into the tracker. */
export function observePots(state: PotTrackerState, reading: UseTabReading | null, nowMs: number): PotTrackerState {
  if (reading === null || state.paused) return state;
  const { totals, unreadable } = totalsByItem(reading);
  // Counting has begun once something has a baseline; after a pause the baselines start over.
  const started = state.baseline.size > 0;
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
    paused: false,
    carried: state.carried,
  };
}

const usedIn = (state: PotTrackerState, id: number) => Math.max(0, (state.baseline.get(id) ?? 0) - (state.latest.get(id) ?? 0));

/**
 * Freezes counting for a restock and banks what has been used so far. Scans are ignored until
 * `resumePots`; nothing that happens in the inventory while paused counts.
 */
export function pausePots(state: PotTrackerState): PotTrackerState {
  if (state.since === null || state.paused) return state;
  const carried = new Map(state.carried);
  for (const id of state.baseline.keys()) carried.set(id, (carried.get(id) ?? 0) + usedIn(state, id));
  return { ...state, paused: true, carried, baseline: new Map(), latest: new Map(), unreadable: new Set(), scrolledAway: false };
}

/** Counting carries on: the next scan becomes the new baseline for every item. */
export function resumePots(state: PotTrackerState): PotTrackerState {
  return state.paused ? { ...state, paused: false } : state;
}

/** Starts counting again from the latest figures (and forgets what was banked), e.g. for a new session of grinding. */
export function rescanPots(state: PotTrackerState): PotTrackerState {
  if (state.since === null) return state;
  if (state.paused) return { ...startPotTracking() };
  return { ...state, baseline: new Map(state.latest), carried: new Map(), scrolledAway: false, paused: false };
}

export interface PotRow {
  readonly id: number;
  readonly name: string;
  /** Count when the current stretch of counting began, or null if it hasn't been read since a pause. */
  readonly before: number | null;
  /** Latest count, or null if it hasn't been read since a pause. */
  readonly now: number | null;
  /** The count couldn't be read in the latest scan, so `now` is the last good figure. */
  readonly stale: boolean;
  /** Used in total: banked from before any pause plus this stretch. */
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
  /** Counting is frozen for a restock. */
  readonly paused: boolean;
  /** Names of tracked items on screen whose count couldn't be read, so they aren't (all) counted. */
  readonly unreadable: readonly string[];
  /** When counting started. */
  readonly since: number;
}

function restoreOf(potion: Potion, used: number, flat: 'hp' | 'mp', percent: 'hpPercent' | 'mpPercent'): number | null {
  if (potion[flat] !== undefined) return (potion[flat] ?? 0) * used;
  return potion[percent] !== undefined ? null : 0;
}

function rowFor(state: PotTrackerState, id: number): PotRow | null {
  const potion = potionById(id);
  if (!potion) return null;
  const before = state.baseline.get(id) ?? null;
  const now = state.latest.get(id) ?? (before === null ? null : 0);
  const used = (state.carried.get(id) ?? 0) + usedIn(state, id);
  if (used === 0 && (before ?? 0) === 0 && (now ?? 0) === 0) return null;
  return {
    id,
    name: potion.name,
    before,
    now,
    stale: state.unreadable.has(id),
    used,
    mesos: used === 0 ? 0 : mesoCost(potion, used),
    hp: restoreOf(potion, used, 'hp', 'hpPercent'),
    mp: restoreOf(potion, used, 'mp', 'mpPercent'),
  };
}

/** What the overview shows, or null until a pot has been read. */
export function buildPotView(state: PotTrackerState): PotView | null {
  if (state.since === null) return null;

  const ids = new Set([...state.baseline.keys(), ...state.carried.keys()]);
  const rows = [...ids]
    .map((id) => rowFor(state, id))
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
  return { rows, totals, scrolledAway: state.scrolledAway, paused: state.paused, unreadable, since: state.since };
}
