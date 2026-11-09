import { potionById, mesoCost, type Potion } from '../data/potions';
import { totalsByItem, type UseTabReading } from './detect/inventory.ts';
import { quickTotals, type QuickSlots } from './detect/quickslots.ts';

/**
 * Pot use, from two places on screen.
 *
 * QUICK SLOTS (preferred). A hotkeyed item shows its total count across every stack and page, on screen
 * all the time, so no inventory window or scrolling is needed. Use is counted as the fall between one good
 * reading and the next; a rise (buying, looting) is ignored, so restocking never distorts it.
 *
 * USE TAB (for pots that aren't in the quick slots). The player opens their Use tab; each item gets a
 * baseline the first time its total can be read, and use is the net fall since, so pots bought or picked up
 * in between make it look smaller (a rise is shown as 0 used, never negative). Only the visible page is
 * counted, and a reading at a different scroll position is never compared with the baseline.
 *
 * An item in the quick slots is counted from there, and the Use tab is ignored for it. Items are
 * independent: a count that can't be read leaves out only that item (it keeps its last good figure), and
 * every other pot carries on. Neither source can tell a pot drunk from one traded away or dropped.
 *
 * Repotting: pausing banks what has been used so far and freezes counting, so the inventory changing while
 * the player restocks (or sells loot) isn't mistaken for anything. On resume every item starts from a fresh
 * reading and use keeps adding to the banked total.
 */

/**
 * The most pots that can plausibly be drunk between two readings (~3s apart). A bigger fall is a misread count
 * or a bulk sale/drop, not drinking, so it isn't counted as use (the new figure still becomes the reference).
 */
export const MAX_USE_PER_READING = 25;

/** One item counted from the quick slots: its total when first seen, its latest total, and what has fallen since. */
export interface QuickItem {
  readonly start: number;
  readonly last: number;
  readonly used: number;
}

export interface PotTrackerState {
  /** When counting started (the first readable item), or null before that. */
  readonly since: number | null;
  /** The scrollbar position the Use-tab counts were taken at; a scan only counts at the same spot. */
  readonly scroll: number | null;
  /** Use tab: each item's total when it was first read (since the last pause). */
  readonly baseline: ReadonlyMap<number, number>;
  /** Use tab: each item's last good total. */
  readonly latest: ReadonlyMap<number, number>;
  /** Use tab: items whose count couldn't be read in the latest scan. */
  readonly unreadable: ReadonlySet<number>;
  /** The Use tab is open but scrolled away from where counting started. */
  readonly scrolledAway: boolean;
  /** Quick slots: the items counted from there. */
  readonly quick: ReadonlyMap<number, QuickItem>;
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
  quick: new Map(),
  paused: false,
  carried: new Map(),
});

const tabUsed = (state: PotTrackerState, id: number) => Math.max(0, (state.baseline.get(id) ?? 0) - (state.latest.get(id) ?? 0));

/** Folds one frame's quick-slot reading (null when the bar isn't on screen) into the tracker. */
export function observeQuick(state: PotTrackerState, slots: QuickSlots | null, nowMs: number): PotTrackerState {
  if (slots === null || state.paused) return state;
  const { totals } = quickTotals(slots);
  if (totals.size === 0) return state;

  const quick = new Map(state.quick);
  const carried = new Map(state.carried);
  const baseline = new Map(state.baseline);
  const latest = new Map(state.latest);
  for (const [id, total] of totals) {
    const known = quick.get(id);
    if (known) {
      const fall = known.last - total;
      quick.set(id, { start: known.start, last: total, used: known.used + (fall > 0 && fall <= MAX_USE_PER_READING ? fall : 0) });
      continue;
    }
    // The quick slots take over this item: what the Use tab counted so far is banked, and its tab baseline retired.
    if (baseline.has(id)) carried.set(id, (carried.get(id) ?? 0) + tabUsed(state, id));
    baseline.delete(id);
    latest.delete(id);
    quick.set(id, { start: total, last: total, used: 0 });
  }
  return { ...state, since: state.since ?? nowMs, quick, carried, baseline, latest };
}

/** Folds one frame's Use-tab reading (null when the Use tab isn't showing) into the tracker. */
export function observePots(state: PotTrackerState, reading: UseTabReading | null, nowMs: number): PotTrackerState {
  if (reading === null || state.paused) return state;
  const fromTab = totalsByItem(reading);
  // The quick slots own any item they show, so the tab is ignored for it.
  const totals = new Map([...fromTab.totals].filter(([id]) => !state.quick.has(id)));
  const unreadable = new Set([...fromTab.unreadable].filter((id) => !state.quick.has(id)));
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
    ...state,
    since: state.since ?? nowMs,
    scroll: started ? state.scroll : reading.scroll,
    baseline,
    latest,
    unreadable,
    scrolledAway: false,
  };
}

/**
 * Freezes counting for a restock and banks what has been used so far. Readings are ignored until
 * `resumePots`; nothing that happens in the inventory or quick slots while paused counts.
 */
export function pausePots(state: PotTrackerState): PotTrackerState {
  if (state.since === null || state.paused) return state;
  const carried = new Map(state.carried);
  for (const id of state.baseline.keys()) carried.set(id, (carried.get(id) ?? 0) + tabUsed(state, id));
  for (const [id, item] of state.quick) carried.set(id, (carried.get(id) ?? 0) + item.used);
  return { ...state, paused: true, carried, baseline: new Map(), latest: new Map(), unreadable: new Set(), quick: new Map(), scrolledAway: false };
}

/** Counting carries on: the next reading becomes the new starting point for every item. */
export function resumePots(state: PotTrackerState): PotTrackerState {
  return state.paused ? { ...state, paused: false } : state;
}

/** Starts counting again from the latest figures (and forgets what was banked), e.g. for a new stretch of grinding. */
export function rescanPots(state: PotTrackerState): PotTrackerState {
  if (state.since === null) return state;
  if (state.paused) return startPotTracking();
  const quick = new Map([...state.quick].map(([id, item]) => [id, { start: item.last, last: item.last, used: 0 }]));
  return { ...state, baseline: new Map(state.latest), quick, carried: new Map(), scrolledAway: false, paused: false };
}

export interface PotRow {
  readonly id: number;
  readonly name: string;
  /** Where the count comes from: the quick-slot bar, or the Use tab. */
  readonly source: 'quick' | 'tab';
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
  /** Mesos worth of the change in stock (now minus start) at the NPC price: negative when the bag lost value, positive after restocking. Null when no NPC sells it or a count is unknown. */
  readonly netMesos: number | null;
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
  /** Sum of the rows' net mesos (items with no price or unknown counts add nothing). */
  readonly netMesos: number;
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
  /** Any item is counted from the Use tab (so only the visible page counts and the scroll position matters). */
  readonly usesTab: boolean;
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
  const quick = state.quick.get(id);
  const before = quick ? quick.start : (state.baseline.get(id) ?? null);
  const now = quick ? quick.last : (state.latest.get(id) ?? (before === null ? null : 0));
  const used = (state.carried.get(id) ?? 0) + (quick ? quick.used : tabUsed(state, id));
  if (used === 0 && (before ?? 0) === 0 && (now ?? 0) === 0) return null;
  return {
    id,
    name: potion.name,
    source: quick ? 'quick' : 'tab',
    before,
    now,
    stale: quick ? false : state.unreadable.has(id),
    used,
    mesos: used === 0 ? 0 : mesoCost(potion, used),
    netMesos: before === null || now === null ? null : mesoCost(potion, now - before),
    hp: restoreOf(potion, used, 'hp', 'hpPercent'),
    mp: restoreOf(potion, used, 'mp', 'mpPercent'),
  };
}

/** What the overview shows, or null until a pot has been read. */
export function buildPotView(state: PotTrackerState): PotView | null {
  if (state.since === null) return null;

  const ids = new Set([...state.baseline.keys(), ...state.quick.keys(), ...state.carried.keys()]);
  const rows = [...ids]
    .map((id) => rowFor(state, id))
    .filter((row): row is PotRow => row !== null)
    .sort((a, b) => Number(b.used > 0) - Number(a.used > 0) || a.name.localeCompare(b.name));

  const usedRows = rows.filter((row) => row.used > 0);
  const totals: PotTotals = {
    used: rows.reduce((sum, row) => sum + row.used, 0),
    mesos: rows.reduce((sum, row) => sum + (row.mesos ?? 0), 0),
    netMesos: rows.reduce((sum, row) => sum + (row.netMesos ?? 0), 0),
    mesosUnknownFor: usedRows.filter((row) => row.mesos === null).length,
    hp: rows.reduce((sum, row) => sum + (row.hp ?? 0), 0),
    mp: rows.reduce((sum, row) => sum + (row.mp ?? 0), 0),
    percentItemsUsed: usedRows.filter((row) => row.hp === null || row.mp === null).length,
  };
  const unreadable = [...state.unreadable].map((id) => potionById(id)?.name).filter((name): name is string => name !== undefined).sort();
  return {
    rows,
    totals,
    scrolledAway: state.scrolledAway,
    paused: state.paused,
    unreadable,
    usesTab: rows.some((row) => row.source === 'tab'),
    since: state.since,
  };
}
