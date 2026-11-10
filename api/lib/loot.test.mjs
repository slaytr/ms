import { describe, expect, it } from 'vitest';

import { applyBuy, applyMove, applyOpen, freshState, lootView, BAG_SIZE } from './loot.mjs';

const CRATE_PRICE = 3500;

describe('freshState', () => {
  it('is an empty bag with nothing spent', () => {
    const state = freshState();
    expect(state.bag).toHaveLength(BAG_SIZE);
    expect(state.bag.every((slot) => slot === null)).toBe(true);
    expect(state).toMatchObject({ spent: 0, opened: 0, lastOpen: [] });
  });
});

describe('applyBuy', () => {
  it('spends NX and puts the crates in the first free slots', () => {
    const result = applyBuy(freshState(), 1, 0);
    expect(result.error).toBeUndefined();
    expect(result.state.spent).toBe(CRATE_PRICE);
    expect(result.state.bag[0]).toEqual({ kind: 'crate' });
    expect(result.state.bag[1]).toBeNull();
  });

  it('charges the bundle price for 11 and fills 11 slots', () => {
    const result = applyBuy(freshState(), 11, 200_000); // 42,000 NX earned
    expect(result.state.spent).toBe(35_000);
    expect(result.state.bag.filter((slot) => slot !== null)).toHaveLength(11);
  });

  it('refuses a purchase the balance cannot cover', () => {
    const broke = { ...freshState(), spent: 7_000 };
    const result = applyBuy(broke, 1, 0);
    expect(result.error).toMatchObject({ status: 409 });
    expect(result.state).toBeUndefined();
  });

  it('lets 7,000 NX buy two single crates but not 11', () => {
    expect(applyBuy(freshState(), 11, 0).error).toMatchObject({ status: 409 });
    const first = applyBuy(freshState(), 1, 0);
    expect(applyBuy(first.state, 1, 0).error).toBeUndefined();
  });

  it('keeps spent NX when more EXP is earned later', () => {
    const spent = applyBuy(freshState(), 1, 0).state;
    const later = applyBuy(spent, 1, 200_000);
    expect(later.state.spent).toBe(CRATE_PRICE * 2);
  });

  it('refuses when the bag has no room, without charging', () => {
    const full = { ...freshState(), bag: Array.from({ length: BAG_SIZE }, () => ({ kind: 'crate' })) };
    const result = applyBuy(full, 1, 1_000_000);
    expect(result.error).toMatchObject({ status: 409 });
  });

  it('only sells 1 or 11', () => {
    expect(applyBuy(freshState(), 5, 1_000_000).error).toMatchObject({ status: 400 });
    expect(applyBuy(freshState(), 0, 1_000_000).error).toMatchObject({ status: 400 });
  });
});

describe('applyOpen', () => {
  /** `count` crates in the bag, bought one at a time (the shop sells only 1 or 11) with plenty of NX. */
  const withCrates = (count) => Array.from({ length: count }).reduce((state) => applyBuy(state, 1, 10_000_000).state, freshState());

  it('turns the crate into an item in the first free slot and records it', () => {
    const result = applyOpen(withCrates(1), [0], () => 0);
    expect(result.error).toBeUndefined();
    expect(result.state.bag[0]).toMatchObject({ kind: 'item', item: { name: 'Woodsman Hat' } });
    expect(result.state.opened).toBe(1);
    expect(result.state.lastOpen).toEqual([1007074]);
  });

  it('opens several crates in order', () => {
    const result = applyOpen(withCrates(3), [0, 1, 2], () => 0);
    expect(result.state.bag.slice(0, 3).every((slot) => slot?.kind === 'item')).toBe(true);
    expect(result.state.opened).toBe(3);
    expect(result.state.lastOpen).toHaveLength(3);
  });

  it('ignores repeated slot numbers and slots that are not crates', () => {
    const result = applyOpen(withCrates(2), [1, 1, 7], () => 0);
    expect(result.state.opened).toBe(1);
    expect(result.state.bag[0]).toEqual({ kind: 'crate' });
    expect(result.state.bag[1].kind).toBe('item');
  });

  it('refuses when none of the slots hold a crate', () => {
    expect(applyOpen(freshState(), [0], () => 0).error).toMatchObject({ status: 409 });
  });
});

describe('applyMove', () => {
  const twoCrates = () => applyBuy(applyBuy(freshState(), 1, 0).state, 1, 0).state;

  it('moves a crate to an empty slot and remembers it there', () => {
    const result = applyMove(twoCrates(), 0, 40);
    expect(result.error).toBeUndefined();
    expect(result.state.bag[0]).toBeNull();
    expect(result.state.bag[40]).toEqual({ kind: 'crate' });
    expect(lootView(result.state, 0).bag[40]).toBe('c');
  });

  it('swaps a crate with an item', () => {
    const opened = applyOpen(twoCrates(), [0], () => 0).state; // slot 0 an item, slot 1 a crate
    const result = applyMove(opened, 0, 1);
    expect(result.state.bag[0]).toEqual({ kind: 'crate' });
    expect(result.state.bag[1]).toMatchObject({ kind: 'item' });
  });

  it('does not change NX, the opened count or the last opening', () => {
    const opened = applyOpen(twoCrates(), [0], () => 0).state;
    const moved = applyMove(opened, 0, 9).state;
    expect(moved).toMatchObject({ spent: opened.spent, opened: opened.opened, lastOpen: opened.lastOpen });
  });

  it('refuses to move an empty slot or to a slot outside the bag', () => {
    expect(applyMove(twoCrates(), 5, 0).error).toMatchObject({ status: 409 });
    expect(applyMove(twoCrates(), 0, BAG_SIZE).error).toMatchObject({ status: 409 });
  });
});

describe('lootView', () => {
  it('reports NX, the stored bag and the last opening', () => {
    const bought = applyBuy(freshState(), 1, 0).state;
    const opened = applyOpen(bought, [0], () => 0).state;
    const view = lootView(opened, 250_000);
    expect(view.nx).toMatchObject({ earned: 42_000, spent: 3_500, balance: 38_500, expToNext: 150_000 });
    expect(view.bag[0]).toBe(1007074);
    expect(view.bag).toHaveLength(BAG_SIZE);
    expect(view).toMatchObject({ opened: 1, lastOpen: [1007074] });
  });
});
