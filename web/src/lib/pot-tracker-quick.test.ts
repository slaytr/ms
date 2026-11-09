import { describe, expect, it } from 'vitest';

import type { SlotReading, UseTabReading } from './detect/inventory.ts';
import type { QuickSlots } from './detect/quickslots.ts';
import { buildPotView, MAX_USE_PER_READING, observePots, observeQuick, pausePots, rescanPots, resumePots, startPotTracking } from './pot-tracker';

const RED = 2000000;
const BLUE = 2000003;

/** Quick-slot bar contents: [item id, count] per slot, in order (a null count is an item whose digits could not be read). */
const bar = (...stacks: Array<[number | null, number | null]>): QuickSlots =>
  stacks.map(([itemId, quantity], i) => ({ row: Math.floor(i / 4), col: i % 4, itemId, quantity }));

const watch = (readings: Array<QuickSlots | null>) =>
  readings.reduce((state, reading, i) => observeQuick(state, reading, 1000 * (i + 1)), startPotTracking());

const slot = (itemId: number, quantity: number, i: number): SlotReading => ({ row: Math.floor(i / 5), col: i % 5, empty: false, itemId, quantity });
const tab = (...stacks: Array<[number, number]>): UseTabReading => ({ scroll: -164, slots: stacks.map(([id, qty], i) => slot(id, qty, i)) });

const row = (state: ReturnType<typeof watch>, id: number) => buildPotView(state)?.rows.find((r) => r.id === id);

describe('quick slots as the source of truth', () => {
  it('starts counting without the Use tab ever being opened', () => {
    const view = buildPotView(watch([bar([RED, 100], [BLUE, 50])]));
    expect(view?.rows.map((r) => [r.id, r.source, r.before, r.now, r.used])).toEqual([
      [BLUE, 'quick', 50, 50, 0],
      [RED, 'quick', 100, 100, 0],
    ]);
  });

  it('counts each fall between readings as pots used', () => {
    const state = watch([bar([RED, 100]), bar([RED, 98]), bar([RED, 95])]);
    expect(row(state, RED)).toMatchObject({ before: 100, now: 95, used: 5 });
  });

  it('ignores a rise, so buying or looting pots never distorts the count', () => {
    // 100 -> 90 (10 used), restock to 300 (ignored), then 300 -> 290 (10 more used).
    const state = watch([bar([RED, 100]), bar([RED, 90]), bar([RED, 300]), bar([RED, 290])]);
    expect(row(state, RED)).toMatchObject({ before: 100, now: 290, used: 20 });
  });

  it('keeps the last good figure through a tick where the count cannot be read', () => {
    const state = watch([bar([RED, 100]), bar([RED, 96]), bar([RED, null]), bar([RED, 90])]);
    expect(row(state, RED)).toMatchObject({ now: 90, used: 10, stale: false });
  });

  it('does nothing when the bar is not on screen, or shows no tracked item', () => {
    expect(buildPotView(watch([null, bar([null, null], [null, null])]))).toBeNull();
    expect(row(watch([bar([RED, 100]), null, bar([RED, 97])]), RED)?.used).toBe(3);
  });

  it('reports one total for an item hotkeyed twice, and skips a tick where the two slots disagree', () => {
    expect(row(watch([bar([RED, 100], [RED, 100]), bar([RED, 90], [RED, 90])]), RED)?.used).toBe(10);
    // One of the two was misread: that tick is skipped, not guessed.
    expect(row(watch([bar([RED, 100], [RED, 100]), bar([RED, 90], [RED, 77])]), RED)?.used).toBe(0);
  });

  it('takes over from the Use tab for an item in both, banking what the tab counted', () => {
    let state = observePots(observePots(startPotTracking(), tab([RED, 100], [BLUE, 50]), 1000), tab([RED, 90], [BLUE, 50]), 2000); // 10 Red used
    state = observeQuick(state, bar([RED, 500]), 5000); // Red goes in the quick slots
    expect(row(state, RED)).toMatchObject({ source: 'quick', used: 10, before: 500, now: 500 });
    state = observeQuick(state, bar([RED, 495]), 6000);
    expect(row(state, RED)).toMatchObject({ source: 'quick', used: 15, now: 495 });
    // The tab no longer counts Red whatever it shows; Blue still comes from the tab.
    state = observePots(state, tab([RED, 1], [BLUE, 45]), 7000);
    expect(row(state, RED)).toMatchObject({ source: 'quick', used: 15, now: 495 });
    expect(row(state, BLUE)).toMatchObject({ source: 'tab', used: 5 });
  });

  it('mixes sources: quick-slot pots keep counting with the inventory closed, others wait for the tab', () => {
    let state = observePots(startPotTracking(), tab([BLUE, 100]), 1000);
    state = observeQuick(state, bar([RED, 100]), 4000);
    state = observeQuick(state, bar([RED, 92]), 5000);
    const view = buildPotView(state)!;
    expect(view.usesTab).toBe(true);
    expect(view.rows.find((r) => r.id === RED)).toMatchObject({ source: 'quick', used: 8 });
    expect(view.rows.find((r) => r.id === BLUE)).toMatchObject({ source: 'tab', used: 0 });
  });

  it('does not count an implausible fall in one reading as pots drunk (a misread, or a bulk sale)', () => {
    // 502 read as 50, then 502 again: nothing was drunk, and the dip must not count as 452 used.
    const truncated = watch([bar([RED, 502]), bar([RED, 50]), bar([RED, 502])]);
    expect(row(truncated, RED)).toMatchObject({ now: 502, used: 0 });
    // A real run of drinking still counts, up to the limit per reading.
    const drinking = watch([bar([RED, 100]), bar([RED, 100 - MAX_USE_PER_READING])]);
    expect(row(drinking, RED)?.used).toBe(MAX_USE_PER_READING);
    const tooMany = watch([bar([RED, 100]), bar([RED, 100 - MAX_USE_PER_READING - 1])]);
    expect(row(tooMany, RED)?.used).toBe(0);
  });

  it('says no tab is involved when every counted pot is in the quick slots', () => {
    expect(buildPotView(watch([bar([RED, 100])]))?.usesTab).toBe(false);
  });

  it('banks use at a repot pause, ignores the bar while paused, and starts fresh on resume', () => {
    let state = pausePots(watch([bar([RED, 100]), bar([RED, 90])]));
    state = observeQuick(state, bar([RED, 400]), 9000); // ignored while paused
    state = observeQuick(resumePots(state), bar([RED, 400]), 10_000); // the restocked count is the new start
    state = observeQuick(state, bar([RED, 390]), 11_000);
    expect(row(state, RED)).toMatchObject({ before: 400, now: 390, used: 20 });
  });

  it('restart count starts over from the current counts', () => {
    const state = rescanPots(watch([bar([RED, 100]), bar([RED, 90])]));
    expect(row(state, RED)).toMatchObject({ before: 90, now: 90, used: 0 });
  });
});
