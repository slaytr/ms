import { describe, expect, it } from 'vitest';

import { findByName, searchCatalog } from './merch-catalog';
import {
  loadMerch,
  parseMeso,
  parseMerch,
  parseQty,
  positionOf,
  saveMerch,
  totalsOf,
  tradeProblem,
  withTrade,
  withoutItem,
  withoutLastTrade,
  type MerchItem,
  type Trade,
} from './merch';

const trade = (kind: 'buy' | 'sell', qty: number, price: number): Trade => ({ id: `${kind}${qty}${price}`, kind, qty, price, at: 1 });
const ref = { name: 'White Potion', catalogId: 272 };

describe('positionOf', () => {
  it('averages cost across buys', () => {
    const p = positionOf([trade('buy', 10, 100), trade('buy', 10, 200)]);
    expect(p).toMatchObject({ held: 20, avgCost: 150, heldCost: 3000, bought: 20, spent: 3000, profit: 0, margin: null });
  });

  it('books profit against average cost and keeps the average for what is left', () => {
    const p = positionOf([trade('buy', 10, 100), trade('buy', 10, 200), trade('sell', 5, 300)]);
    expect(p.held).toBe(15);
    expect(p.avgCost).toBe(150);
    expect(p.profit).toBe(750); // 5 x (300 - 150)
    expect(p.revenue).toBe(1500);
    expect(p.margin).toBe(0.5);
  });

  it('shows a loss as negative profit and margin', () => {
    const p = positionOf([trade('buy', 4, 1000), trade('sell', 4, 800)]);
    expect(p).toMatchObject({ held: 0, avgCost: 0, heldCost: 0, profit: -800, revenue: 3200 });
    expect(p.margin).toBeCloseTo(-0.25);
  });

  it('has no margin before anything is sold', () => {
    expect(positionOf([trade('buy', 1, 5)]).margin).toBeNull();
  });
});

describe('tradeProblem', () => {
  const held: MerchItem = { key: 'c:272', name: 'White Potion', catalogId: 272, trades: [trade('buy', 3, 100)] };

  it('needs a quantity and a price', () => {
    expect(tradeProblem(null, 'buy', null, 5)).toMatch(/quantity/);
    expect(tradeProblem(null, 'buy', 1, null)).toMatch(/price/);
  });

  it('refuses to sell more than is held', () => {
    expect(tradeProblem(held, 'sell', 4, 100)).toMatch(/only hold 3/);
    expect(tradeProblem(null, 'sell', 1, 100)).toMatch(/none/);
    expect(tradeProblem(held, 'sell', 3, 100)).toBeNull();
  });
});

describe('withTrade', () => {
  it('creates an item on its first buy and never mutates the old ledger', () => {
    const before: readonly MerchItem[] = [];
    const after = withTrade(before, ref, 'buy', 10, 300, 1000);
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ key: 'c:272', name: 'White Potion', catalogId: 272 });
  });

  it('appends to an existing item and ignores a sell that is not covered', () => {
    const one = withTrade([], ref, 'buy', 10, 300, 1000);
    const two = withTrade(one, ref, 'sell', 4, 350, 2000);
    expect(positionOf(two[0].trades).held).toBe(6);
    expect(withTrade(two, ref, 'sell', 7, 350, 3000)).toBe(two);
    expect(withTrade([], ref, 'sell', 1, 350, 3000)).toHaveLength(0);
  });

  it('keeps custom items apart by name, ignoring case', () => {
    const a = withTrade([], { name: 'Mystery Box', catalogId: null }, 'buy', 1, 10, 1);
    const b = withTrade(a, { name: 'mystery box', catalogId: null }, 'buy', 1, 10, 2);
    expect(b).toHaveLength(1);
    expect(b[0].trades).toHaveLength(2);
  });
});

describe('removing', () => {
  it('undoes the latest trade, dropping an item whose only trade it was', () => {
    const items = withTrade(withTrade([], ref, 'buy', 10, 300, 1), ref, 'sell', 2, 400, 2);
    expect(withoutLastTrade(items, 'c:272')[0].trades).toHaveLength(1);
    expect(withoutLastTrade(withoutLastTrade(items, 'c:272'), 'c:272')).toHaveLength(0);
    expect(withoutItem(items, 'c:272')).toHaveLength(0);
  });
});

describe('totalsOf', () => {
  it('adds up profit, revenue and what is still tied up in stock', () => {
    let items = withTrade([], ref, 'buy', 10, 100, 1);
    items = withTrade(items, ref, 'sell', 4, 150, 2);
    items = withTrade(items, { name: 'Elixir', catalogId: 1 }, 'buy', 2, 500, 3);
    const t = totalsOf(items);
    expect(t).toMatchObject({ profit: 200, revenue: 600, heldCost: 1600, itemsHeld: 2 });
    expect(t.margin).toBeCloseTo(1 / 3);
  });
});

describe('parsing input', () => {
  it('reads meso the way players write it', () => {
    expect(parseMeso('1500')).toBe(1500);
    expect(parseMeso('1,500')).toBe(1500);
    expect(parseMeso('12k')).toBe(12_000);
    expect(parseMeso('1.5m')).toBe(1_500_000);
    expect(parseMeso('2B')).toBe(2_000_000_000);
  });

  it('rejects nonsense, zero and negatives', () => {
    for (const bad of ['', 'abc', '0', '-5', '1.5.2', '12kk', '0.0001k']) expect(parseMeso(bad)).toBeNull();
  });

  it('reads a whole-number quantity', () => {
    expect(parseQty('1,200')).toBe(1200);
    for (const bad of ['', '0', '1.5', '-2', 'x']) expect(parseQty(bad)).toBeNull();
  });
});

describe('storage', () => {
  const fakeStore = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('round-trips a ledger', () => {
    const store = fakeStore();
    const items = withTrade(withTrade([], ref, 'buy', 10, 300, 1), ref, 'sell', 3, 350, 2);
    expect(saveMerch(items, store)).toBe(true);
    expect(loadMerch(store)).toEqual(items);
  });

  it('survives corrupt, blocked and hostile data', () => {
    expect(loadMerch({ getItem: () => '{nope', setItem: () => undefined })).toEqual([]);
    expect(loadMerch(null)).toEqual([]);
    expect(saveMerch([], { getItem: () => null, setItem: () => { throw new Error('full'); } })).toBe(false);
    expect(parseMerch('x')).toEqual([]);
    expect(parseMerch([{ name: 'A', trades: [{ kind: 'sell', qty: 5, price: 1 }] }, { name: '', trades: [] }, 7])).toEqual([]);
  });

  it('drops a saved sell that exceeds what was held', () => {
    const raw = [{ name: 'A', catalogId: null, trades: [{ kind: 'buy', qty: 2, price: 5, at: 1 }, { kind: 'sell', qty: 3, price: 9, at: 2 }] }];
    expect(parseMerch(raw)[0].trades).toHaveLength(1);
  });
});

describe('catalog', () => {
  it('bundles the cozy.markets items', () => {
    expect(findByName('  white   POTION ')).toMatchObject({ id: 272, name: 'White Potion' });
    expect(findByName('not a real item')).toBeNull();
  });

  it('ranks an exact name first and requires every word', () => {
    expect(searchCatalog('white potion')[0].name).toBe('White Potion');
    expect(searchCatalog('potion white').map((i) => i.name)).toContain('White Potion');
    expect(searchCatalog('')).toEqual([]);
    expect(searchCatalog('zzzzqqq')).toEqual([]);
  });
});
