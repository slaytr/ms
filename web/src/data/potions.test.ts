import { describe, expect, it } from 'vitest';

import { mesoCost, potionById, POTIONS, restoredBy } from './potions';

describe('POTIONS', () => {
  it('has unique ids and names', () => {
    expect(new Set(POTIONS.map((p) => p.id)).size).toBe(POTIONS.length);
    expect(new Set(POTIONS.map((p) => p.name)).size).toBe(POTIONS.length);
  });

  it('gives every item something it restores', () => {
    for (const p of POTIONS) {
      const restores = [p.hp, p.mp, p.hpPercent, p.mpPercent].some((v) => v !== undefined);
      expect(restores, p.name).toBe(true);
    }
  });

  it('is cheapest at the lowest shop that has no citizenship requirement', () => {
    for (const p of POTIONS) {
      if (p.shops.length === 0) {
        expect(p.buyPrice, p.name).toBeNull();
        continue;
      }
      const open = p.shops.filter((s) => !s.note);
      const pool = open.length > 0 ? open : p.shops;
      expect(p.buyPrice, p.name).toBe(Math.min(...pool.map((s) => s.price)));
    }
  });

  it('matches the figures the guide and the item pages agree on', () => {
    expect(potionById(2000000)).toMatchObject({ name: 'Red Potion', hp: 100, buyPrice: 50, sellPrice: 5 });
    expect(potionById(2000002)).toMatchObject({ name: 'White Potion', hp: 500, buyPrice: 350 });
    expect(potionById(2000003)).toMatchObject({ name: 'Blue Potion', mp: 200, buyPrice: 220 });
    expect(potionById(2000004)).toMatchObject({ name: 'Elixir', hpPercent: 35, mpPercent: 35, buyPrice: 3000 });
    // Sold at 1,000 in three shops and 1,800 in one: the lowest is what the player can pay.
    expect(potionById(2022003)).toMatchObject({ name: 'Unagi', hp: 1000, buyPrice: 1000 });
  });
});

describe('potionById', () => {
  it('returns null for an id we do not know', () => {
    expect(potionById(1)).toBeNull();
  });
});

describe('restoredBy', () => {
  const red = potionById(2000000)!;
  const blue = potionById(2000003)!;
  const elixir = potionById(2000004)!;

  it('multiplies a flat restore by how many were used', () => {
    expect(restoredBy(red, 10)).toEqual({ hp: 1000, mp: null });
    expect(restoredBy(blue, 3)).toEqual({ hp: null, mp: 600 });
  });

  it('works a percentage potion out from max HP/MP, and says null rather than guess without them', () => {
    expect(restoredBy(elixir, 2, 1000, 500)).toEqual({ hp: 700, mp: 350 });
    expect(restoredBy(elixir, 2)).toEqual({ hp: null, mp: null });
  });
});

describe('mesoCost', () => {
  it('is price times count, or null when no NPC sells it', () => {
    expect(mesoCost(potionById(2000000)!, 10)).toBe(500);
    expect(mesoCost(potionById(2000006)!, 1)).toBeNull();
  });
});
