import { describe, expect, it } from 'vitest';

import { addCrates, crateIndexes, emptyBag, freeSlots, moveSlot, openCratesInBag, parseBag, serializeBag, type Bag } from './bag';
import type { CrateItem } from './loot-box';

const hat: CrateItem = { id: 1, name: 'Hat', rate: 3 };
const coat: CrateItem = { id: 2, name: 'Coat', rate: 2 };
const shoes: CrateItem = { id: 3, name: 'Shoes', rate: 1 };

const kinds = (bag: Bag) => bag.map((entry) => (entry === null ? '.' : entry.kind === 'crate' ? 'C' : entry.item.name[0]));

describe('emptyBag / freeSlots', () => {
  it('starts with every slot free', () => {
    expect(emptyBag(8)).toHaveLength(8);
    expect(freeSlots(emptyBag(8))).toBe(8);
  });
});

describe('addCrates', () => {
  it('puts each crate in its own slot, left to right, top to bottom', () => {
    const bag = addCrates(emptyBag(8), 3)!;
    expect(kinds(bag)).toEqual(['C', 'C', 'C', '.', '.', '.', '.', '.']);
    expect(freeSlots(bag)).toBe(5);
  });

  it('fills the first gaps before the end', () => {
    const start: Bag = [{ kind: 'crate' }, null, { kind: 'crate' }, null];
    expect(kinds(addCrates(start, 2)!)).toEqual(['C', 'C', 'C', 'C']);
  });

  it('is all or nothing when the bag is too full', () => {
    const bag = addCrates(emptyBag(4), 3)!;
    expect(addCrates(bag, 2)).toBeNull();
    expect(addCrates(bag, 1)).not.toBeNull();
  });

  it('adds nothing for a bad count, and does not change the original', () => {
    const bag = emptyBag(4);
    expect(addCrates(bag, 0)).toEqual(bag);
    expect(addCrates(bag, -1)).toBeNull();
    addCrates(bag, 2);
    expect(freeSlots(bag)).toBe(4);
  });
});

describe('crateIndexes', () => {
  it('lists crate slots in order', () => {
    const bag: Bag = [{ kind: 'item', item: hat }, { kind: 'crate' }, null, { kind: 'crate' }];
    expect(crateIndexes(bag)).toEqual([1, 3]);
  });
});

describe('openCratesInBag', () => {
  it('turns each opened crate into its item, in the first free slot', () => {
    const bag = addCrates(emptyBag(8), 3)!;
    const { bag: next, placed } = openCratesInBag(bag, [0, 1, 2], [hat, coat, shoes]);
    expect(kinds(next)).toEqual(['H', 'C', 'S', '.', '.', '.', '.', '.']);
    expect(placed).toEqual([0, 1, 2]);
  });

  it('puts an item in the earliest free slot even when it is before the crate', () => {
    const bag: Bag = [null, { kind: 'item', item: coat }, { kind: 'crate' }, null];
    const { bag: next, placed } = openCratesInBag(bag, [2], [hat]);
    expect(kinds(next)).toEqual(['H', 'C', '.', '.']);
    expect(placed).toEqual([0]);
  });

  it('opens one crate and leaves the rest', () => {
    const bag = addCrates(emptyBag(6), 3)!;
    const { bag: next } = openCratesInBag(bag, [1], [hat]);
    expect(kinds(next)).toEqual(['C', 'H', 'C', '.', '.', '.']);
  });

  it('ignores a slot that holds no crate, and does not change the original', () => {
    const bag = addCrates(emptyBag(4), 1)!;
    const { bag: next, placed } = openCratesInBag(bag, [3, 0], [hat, coat]);
    expect(placed).toEqual([0]);
    expect(kinds(next)).toEqual(['H', '.', '.', '.']);
    expect(kinds(bag)).toEqual(['C', '.', '.', '.']);
  });
});

describe('serializeBag / parseBag', () => {
  const items = [hat, coat, shoes];

  it('round-trips crates, items and gaps', () => {
    const bag: Bag = [{ kind: 'crate' }, { kind: 'item', item: coat }, null, { kind: 'item', item: hat }];
    const stored = serializeBag(bag);
    expect(stored).toEqual(['c', 2, null, 1]);
    expect(parseBag(stored, items, 4)).toEqual(bag);
  });

  it('pads or trims to the requested size', () => {
    expect(parseBag(['c'], items, 3)).toEqual([{ kind: 'crate' }, null, null]);
    expect(parseBag(['c', 'c', 'c'], items, 2)).toHaveLength(2);
  });

  it('turns anything unrecognised into an empty slot', () => {
    expect(parseBag(['x', 999, {}, -1, 'c'], items, 5)).toEqual([null, null, null, null, { kind: 'crate' }]);
    expect(parseBag('nope', items, 2)).toEqual([null, null]);
    expect(parseBag(null, items, 2)).toEqual([null, null]);
  });
});

describe('moveSlot', () => {
  // Hat, crate, empty, Shoes ('H', 'C', '.', 'S').
  const bag: Bag = [{ kind: 'item', item: hat }, { kind: 'crate' }, null, { kind: 'item', item: shoes }];

  it('moves an item into an empty slot, leaving its old slot empty', () => {
    expect(kinds(moveSlot(bag, 0, 2)!)).toEqual(['.', 'C', 'H', 'S']);
  });

  it('swaps places when the target is filled', () => {
    expect(kinds(moveSlot(bag, 0, 3)!)).toEqual(['S', 'C', '.', 'H']);
    expect(kinds(moveSlot(bag, 1, 0)!)).toEqual(['C', 'H', '.', 'S']);
  });

  it('can move a crate as well as an item', () => {
    expect(kinds(moveSlot(bag, 1, 2)!)).toEqual(['H', '.', 'C', 'S']);
  });

  it('does nothing when dropped on its own slot', () => {
    expect(moveSlot(bag, 1, 1)).toBe(bag);
  });

  it('refuses an empty source or a slot outside the bag', () => {
    expect(moveSlot(bag, 2, 0)).toBeNull();
    expect(moveSlot(bag, 9, 0)).toBeNull();
    expect(moveSlot(bag, 0, 9)).toBeNull();
    expect(moveSlot(bag, -1, 0)).toBeNull();
    expect(moveSlot(bag, 0.5, 1)).toBeNull();
  });

  it('keeps every item and does not change the original', () => {
    const next = moveSlot(bag, 0, 3)!;
    expect(next.filter((slot) => slot !== null)).toHaveLength(3);
    expect(kinds(bag)).toEqual(['H', 'C', '.', 'S']);
  });
});
