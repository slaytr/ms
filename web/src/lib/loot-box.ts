/** One thing a crate can hold, with its published drop rate in percent. */
export interface CrateItem {
  /** The game's item id; also the name of its icon file. */
  readonly id: number;
  readonly name: string;
  readonly rate: number;
}

/** A cash-shop crate and what it can drop. */
export interface Crate {
  /** The crate's own item id (its icon is `/nx/<iconId>.png`). */
  readonly iconId: number;
  readonly name: string;
  /** NX for one crate. */
  readonly price1: number;
  /** NX for a bundle of 11 (the eleventh is effectively free). */
  readonly price11: number;
  readonly items: readonly CrateItem[];
}

const BUNDLE = 11;

/**
 * Picks one item by drop rate. Published rates are rounded and need not add to exactly 100, so the pick
 * is weighted by each rate over the actual total. `random` returns [0, 1) and is injectable for tests.
 */
export function rollItem(items: readonly CrateItem[], random: () => number = Math.random): CrateItem {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.rate), 0);
  if (items.length === 0 || total <= 0) throw new Error('A crate needs at least one item with a drop rate.');

  const target = random() * total;
  let upTo = 0;
  for (const item of items) {
    upTo += Math.max(0, item.rate);
    if (target < upTo) return item;
  }
  return items[items.length - 1]; // only reachable through floating-point rounding at the very top
}

/** Opens `count` crates, one independent roll each. A count that is not a whole number above zero opens nothing. */
export function openCrates(items: readonly CrateItem[], count: number, random: () => number = Math.random): readonly CrateItem[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  return Array.from({ length: count }, () => rollItem(items, random));
}

/** NX for `count` crates, buying in bundles of 11 where possible. */
export function nxCost(crate: Pick<Crate, 'price1' | 'price11'>, count: number): number {
  if (!Number.isInteger(count) || count <= 0) return 0;
  return Math.floor(count / BUNDLE) * crate.price11 + (count % BUNDLE) * crate.price1;
}

/** How many of each item id appear in `items`, in first-seen order. */
export function tallyById(items: readonly CrateItem[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const item of items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return counts;
}
