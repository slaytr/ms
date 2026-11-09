import { describe, expect, it } from 'vitest';

import type { SlotReading, UseTabReading } from './detect/inventory.ts';
import { buildPotView, observePots, rescanPots, startPotTracking } from './pot-tracker';

const RED = 2000000;
const BLUE = 2000003;
const ELIXIR = 2000004;
const MANA_ELIXIR = 2000006;

let nextSlot = 0;
const slot = (itemId: number | null, quantity: number | null): SlotReading => {
  const index = nextSlot++ % 30;
  return { row: Math.floor(index / 5), col: index % 5, empty: itemId === null && quantity === null, itemId, quantity };
};
const tab = (slots: SlotReading[], scroll: number | null = -164): UseTabReading => ({ scroll, slots });
const of = (...stacks: Array<[number, number | null]>) => tab(stacks.map(([id, qty]) => slot(id, qty)));

const feed = (readings: Array<UseTabReading | null>) =>
  readings.reduce((state, reading, i) => observePots(state, reading, 1000 * (i + 1)), startPotTracking());

const row = (state: ReturnType<typeof feed>, id: number) => buildPotView(state)?.rows.find((r) => r.id === id);

describe('observePots', () => {
  it('shows nothing until an item has been read', () => {
    expect(buildPotView(feed([null, null]))).toBeNull();
    // A stack whose count could not be read gives no total for that item.
    expect(buildPotView(feed([of([RED, null])]))).toBeNull();
  });

  it('takes the first read of an item as its baseline and reports no use yet', () => {
    const view = buildPotView(feed([of([RED, 100], [BLUE, 50])]));
    expect(view?.rows.map((r) => [r.id, r.before, r.now, r.used])).toEqual([
      [BLUE, 50, 50, 0],
      [RED, 100, 100, 0],
    ]);
  });

  it('adds up stacks of the same item', () => {
    expect(row(feed([of([BLUE, 100], [BLUE, 100], [BLUE, 98])]), BLUE)?.before).toBe(298);
  });

  it('counts the fall in total as pots used', () => {
    expect(row(feed([of([RED, 100]), of([RED, 93])]), RED)).toMatchObject({ before: 100, now: 93, used: 7 });
  });

  it('counts an item whose stack disappeared entirely as fully used', () => {
    expect(row(feed([of([RED, 5], [BLUE, 50]), of([BLUE, 50])]), RED)).toMatchObject({ now: 0, used: 5 });
  });

  it('treats a rise in total as pots picked up or bought, not negative use', () => {
    expect(row(feed([of([RED, 10]), of([RED, 60])]), RED)).toMatchObject({ before: 10, now: 60, used: 0 });
  });

  it('keeps counting the other pots when one stack cannot be read', () => {
    // Blue has a stack that will not read; Red is fine and must still be tracked.
    const state = feed([of([RED, 100], [BLUE, 50], [BLUE, null]), of([RED, 90], [BLUE, 50], [BLUE, null])]);
    const view = buildPotView(state)!;
    expect(view.rows.map((r) => r.id)).toEqual([RED]);
    expect(row(state, RED)?.used).toBe(10);
    expect(view.unreadable).toEqual(['Blue Potion']);
  });

  it('starts counting an item the first time it reads, however late', () => {
    const state = feed([of([RED, 100], [BLUE, null]), of([RED, 95], [BLUE, 40]), of([RED, 90], [BLUE, 38])]);
    expect(row(state, BLUE)).toMatchObject({ before: 40, now: 38, used: 2 });
    expect(row(state, RED)).toMatchObject({ before: 100, now: 90, used: 10 });
  });

  it('keeps an item\'s last good figure, flagged, when its count stops reading', () => {
    const state = feed([of([RED, 100]), of([RED, 90]), of([RED, null])]);
    expect(row(state, RED)).toMatchObject({ now: 90, used: 10, stale: true });
    expect(buildPotView(state)?.unreadable).toEqual(['Red Potion']);
  });

  it('recovers when the count reads again', () => {
    const state = feed([of([RED, 100]), of([RED, null]), of([RED, 92])]);
    expect(row(state, RED)).toMatchObject({ now: 92, used: 8, stale: false });
    expect(buildPotView(state)?.unreadable).toEqual([]);
  });

  it('does not compare across a scroll: a different page shows different slots', () => {
    const state = feed([of([RED, 100]), tab([slot(RED, 40)], -120)]);
    expect(buildPotView(state)?.scrolledAway).toBe(true);
    expect(row(state, RED)?.used).toBe(0);
  });

  it('carries on once the tab is back where counting started', () => {
    const state = feed([of([RED, 100]), tab([slot(RED, 40)], -120), of([RED, 96])]);
    expect(buildPotView(state)?.scrolledAway).toBe(false);
    expect(row(state, RED)?.used).toBe(4);
  });

  it('keeps tracking while the inventory is closed or on another tab', () => {
    expect(row(feed([of([RED, 100]), null, of([RED, 95])]), RED)?.used).toBe(5);
  });
});

describe('rescanPots', () => {
  it('starts again from the latest figures', () => {
    const state = rescanPots(feed([of([RED, 100]), of([RED, 90])]));
    expect(row(state, RED)).toMatchObject({ before: 90, now: 90, used: 0 });
  });

  it('does nothing before anything has been read', () => {
    expect(buildPotView(rescanPots(startPotTracking()))).toBeNull();
  });
});

describe('buildPotView', () => {
  it('works out meso spent and HP/MP recovered from the potion data', () => {
    // 10 Red Potions (100 HP, 50 mesos) and 4 Blue Potions (200 MP, 220 mesos) used.
    const view = buildPotView(feed([of([RED, 100], [BLUE, 50]), of([RED, 90], [BLUE, 46])]))!;
    expect(view.totals).toMatchObject({ used: 14, mesos: 10 * 50 + 4 * 220, hp: 1000, mp: 800, mesosUnknownFor: 0 });
    expect(view.rows.find((r) => r.id === RED)).toMatchObject({ mesos: 500, hp: 1000, mp: 0 });
  });

  it('says cost is unknown for an item no NPC sells, rather than making a figure up', () => {
    const view = buildPotView(feed([of([MANA_ELIXIR, 30]), of([MANA_ELIXIR, 28])]))!;
    expect(view.rows[0]).toMatchObject({ id: MANA_ELIXIR, used: 2, mesos: null });
    expect(view.totals.mesosUnknownFor).toBe(1);
  });

  it('leaves out HP/MP for percentage potions, which depend on max HP and MP', () => {
    const view = buildPotView(feed([of([ELIXIR, 15]), of([ELIXIR, 14])]))!;
    expect(view.rows[0]).toMatchObject({ used: 1, hp: null, mp: null });
    expect(view.totals.percentItemsUsed).toBe(1);
  });

  it('lists items with use first, then the rest by name', () => {
    const view = buildPotView(feed([of([RED, 10], [BLUE, 10], [ELIXIR, 10]), of([RED, 10], [BLUE, 9], [ELIXIR, 10])]))!;
    expect(view.rows.map((r) => r.name)).toEqual(['Blue Potion', 'Elixir', 'Red Potion']);
  });

  it('ignores items that are not in the potion data', () => {
    expect(buildPotView(feed([of([999999, 100], [RED, 10])]))!.rows.map((r) => r.id)).toEqual([RED]);
  });
});
