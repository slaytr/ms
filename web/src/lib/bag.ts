import type { CrateItem } from './loot-box';

/** What fills one inventory slot: an unopened crate, or an item that came out of one. */
export type BagEntry = { readonly kind: 'crate' } | { readonly kind: 'item'; readonly item: CrateItem };

/** The inventory, slot by slot in reading order (left to right, top to bottom). A null is an empty slot. */
export type Bag = readonly (BagEntry | null)[];

export const emptyBag = (size: number): Bag => Array.from({ length: size }, () => null);

export const freeSlots = (bag: Bag): number => bag.filter((entry) => entry === null).length;

/** Slot numbers holding an unopened crate, in order. */
export const crateIndexes = (bag: Bag): readonly number[] =>
  bag.flatMap((entry, index) => (entry?.kind === 'crate' ? [index] : []));

/** A copy of `bag` with `entry` in its first free slot, or null when the bag is full. */
function place(bag: Bag, entry: BagEntry): { bag: Bag; index: number } | null {
  const index = bag.indexOf(null);
  if (index === -1) return null;
  return { bag: bag.map((slot, i) => (i === index ? entry : slot)), index };
}

/**
 * Puts `count` crates into the first free slots, one slot each. All or nothing: null when they will not
 * all fit (or the count is negative), so a purchase never half happens.
 */
export function addCrates(bag: Bag, count: number): Bag | null {
  if (!Number.isInteger(count) || count < 0 || count > freeSlots(bag)) return null;
  let next = bag;
  for (let i = 0; i < count; i += 1) {
    const placed = place(next, { kind: 'crate' });
    if (!placed) return null;
    next = placed.bag;
  }
  return next;
}

/**
 * Opens the crates at `indexes`, in order, handing each the matching item from `items`. A crate's slot
 * empties first, so its item lands in the first free slot, which is that same slot unless an earlier one
 * is free. Slots that hold no crate are skipped. Returns the new bag and where each item went.
 */
export function openCratesInBag(
  bag: Bag,
  indexes: readonly number[],
  items: readonly CrateItem[],
): { readonly bag: Bag; readonly placed: readonly number[] } {
  let next = bag;
  const placed: number[] = [];
  let used = 0;
  for (const index of indexes) {
    const item = items[used];
    if (item === undefined || next[index]?.kind !== 'crate') continue;
    const emptied = next.map((slot, i) => (i === index ? null : slot));
    const result = place(emptied, { kind: 'item', item });
    if (!result) continue; // cannot happen: the crate's own slot is free
    next = result.bag;
    placed.push(result.index);
    used += 1;
  }
  return { bag: next, placed };
}

/** One slot as stored: null (empty), "c" (an unopened crate) or the id of an item that came out of one. */
export type StoredSlot = null | 'c' | number;

export const serializeBag = (bag: Bag): readonly StoredSlot[] =>
  bag.map((entry) => (entry === null ? null : entry.kind === 'crate' ? 'c' : entry.item.id));

/**
 * Rebuilds a bag from its stored form, `size` slots long. Anything unrecognised (a corrupt value, an item
 * id no longer on sale) becomes an empty slot rather than breaking the whole bag.
 */
export function parseBag(raw: unknown, items: readonly CrateItem[], size: number): Bag {
  const stored = Array.isArray(raw) ? raw : [];
  const byId = new Map(items.map((item) => [item.id, item]));
  return Array.from({ length: size }, (_, index): BagEntry | null => {
    const value: unknown = stored[index];
    if (value === 'c') return { kind: 'crate' };
    const item = typeof value === 'number' ? byId.get(value) : undefined;
    return item ? { kind: 'item', item } : null;
  });
}

/**
 * Moves what is in slot `from` to slot `to`. An empty target just receives it; a filled one swaps places,
 * as the game does. Returns null when there is nothing to move (an empty or out-of-range source, or a
 * target outside the bag), and the same bag when `from` and `to` are the same slot.
 */
export function moveSlot(bag: Bag, from: number, to: number): Bag | null {
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < bag.length;
  if (!inRange(from) || !inRange(to) || bag[from] === null) return null;
  if (from === to) return bag;
  return bag.map((slot, index) => (index === from ? bag[to] : index === to ? bag[from] : slot));
}
