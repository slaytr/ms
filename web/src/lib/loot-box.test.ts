import { describe, expect, it } from 'vitest';

import { CRATES, MYSTERY_FASHION_CRATE } from '../data/crates';
import { nxCost, openCrates, rollItem, tallyById, type CrateItem } from './loot-box';

const items: readonly CrateItem[] = [
  { id: 1, name: 'Common', rate: 70 },
  { id: 2, name: 'Rare', rate: 25 },
  { id: 3, name: 'Epic', rate: 5 },
];

describe('rollItem', () => {
  it('picks by cumulative rate', () => {
    expect(rollItem(items, () => 0).name).toBe('Common');
    expect(rollItem(items, () => 0.699).name).toBe('Common');
    expect(rollItem(items, () => 0.7).name).toBe('Rare');
    expect(rollItem(items, () => 0.949).name).toBe('Rare');
    expect(rollItem(items, () => 0.95).name).toBe('Epic');
    expect(rollItem(items, () => 0.999999).name).toBe('Epic');
  });

  it('copes with rates that do not add to 100 (the published ones are rounded)', () => {
    const odd: readonly CrateItem[] = [
      { id: 1, name: 'A', rate: 1 },
      { id: 2, name: 'B', rate: 1 },
    ];
    expect(rollItem(odd, () => 0.49).name).toBe('A');
    expect(rollItem(odd, () => 0.5).name).toBe('B');
  });

  it('refuses an empty crate or one with no positive rate', () => {
    expect(() => rollItem([], () => 0.5)).toThrow();
    expect(() => rollItem([{ id: 1, name: 'x', rate: 0 }], () => 0.5)).toThrow();
  });

  it('lands on each item about as often as its rate says', () => {
    // A small seeded generator, so the check is repeatable.
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts = new Map<number, number>();
    const draws = 100_000;
    for (let i = 0; i < draws; i += 1) {
      const item = rollItem(items, random);
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    }
    expect((counts.get(1) ?? 0) / draws).toBeCloseTo(0.7, 1);
    expect((counts.get(2) ?? 0) / draws).toBeCloseTo(0.25, 1);
    expect((counts.get(3) ?? 0) / draws).toBeCloseTo(0.05, 1);
  });
});

describe('openCrates', () => {
  it('rolls once per crate, in order', () => {
    const rolls = [0, 0.8, 0.99];
    let i = 0;
    const result = openCrates(items, 3, () => rolls[i++]);
    expect(result.map((item) => item.name)).toEqual(['Common', 'Rare', 'Epic']);
  });

  it('opens nothing for zero or a bad count', () => {
    expect(openCrates(items, 0)).toEqual([]);
    expect(openCrates(items, -2)).toEqual([]);
    expect(openCrates(items, 1.5)).toEqual([]);
  });
});

describe('tallyById', () => {
  it('counts repeats of the same item', () => {
    const [a, b] = items;
    expect([...tallyById([a, b, a, a])]).toEqual([[1, 3], [2, 1]]);
    expect(tallyById([]).size).toBe(0);
  });
});

describe('nxCost', () => {
  const { price1, price11 } = MYSTERY_FASHION_CRATE;

  it('charges the bundle price for every 11, and the single price for the rest', () => {
    expect(nxCost(MYSTERY_FASHION_CRATE, 1)).toBe(price1);
    expect(nxCost(MYSTERY_FASHION_CRATE, 11)).toBe(price11);
    expect(nxCost(MYSTERY_FASHION_CRATE, 12)).toBe(price11 + price1);
    expect(nxCost(MYSTERY_FASHION_CRATE, 22)).toBe(price11 * 2);
    expect(nxCost(MYSTERY_FASHION_CRATE, 0)).toBe(0);
  });
});

describe('the Mystery Fashion Crate data', () => {
  const crate = MYSTERY_FASHION_CRATE;

  it('lists the 50 published items with unique ids and names', () => {
    expect(crate.items).toHaveLength(50);
    expect(new Set(crate.items.map((item) => item.id)).size).toBe(50);
    expect(new Set(crate.items.map((item) => item.name)).size).toBe(50);
  });

  it('has rates that add up to the published 100%', () => {
    const total = crate.items.reduce((sum, item) => sum + item.rate, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('uses the published prices: 3,500 NX each, or 11 for 35,000 NX', () => {
    expect(crate.price1).toBe(3500);
    expect(crate.price11).toBe(35_000);
  });

  it('has an icon file for the crate and every item', async () => {
    const { existsSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const ids = [crate.iconId, ...crate.items.map((item) => item.id)];
    const missing = ids.filter((id) => !existsSync(fileURLToPath(new URL(`../../public/nx/${id}.png`, import.meta.url))));
    expect(missing).toEqual([]);
  });

  it('is registered in the crate list', () => {
    expect(CRATES).toContain(crate);
  });
});
