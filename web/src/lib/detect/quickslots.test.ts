import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POTIONS } from '../../data/potions.ts';
import { DEFAULT_INVENTORY_TEMPLATES } from './default-inventory-templates.ts';
import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { detectFrame } from './detect.ts';
import { FIXTURES_DIR, loadFrame } from './fixture-io.ts';
import { quickSlotOrigin, quickTotals, readQuickSlots, type QuickSlots } from './quickslots.ts';
import type { Frame } from './types.ts';

const labels = JSON.parse(readFileSync(join(FIXTURES_DIR, 'labels.json'), 'utf8')) as Record<string, { quickSlots?: string[][]; scaled?: boolean }>;
/** Scaled frames need unscaling first; unscale-frame.test.ts covers them. */
const labelled = Object.keys(labels).filter((file) => labels[file].quickSlots && !labels[file].scaled);
const idByName = new Map(POTIONS.map((p) => [p.name, p.id]));
const expOf = (frame: Frame) => detectFrame(frame, DEFAULT_TEMPLATES).state.exp;

/** Reading a frame takes ~60ms; every labelled frame is read once here and shared by the checks below. */
const readings = new Map<string, QuickSlots | null>();
const readFrame = (file: string): QuickSlots | null => {
  if (!readings.has(file)) {
    const frame = loadFrame(file);
    const exp = expOf(frame);
    readings.set(file, exp ? readQuickSlots(frame, exp, DEFAULT_INVENTORY_TEMPLATES) : null);
  }
  return readings.get(file) ?? null;
};

describe('readQuickSlots on real Classic client captures', () => {
  it('has labelled frames, at more than one window width', () => {
    expect(labelled.length).toBeGreaterThanOrEqual(15);
    const widths = new Set(labelled.map((file) => file.match(/_(\d+)x\d+_/)?.[1]));
    expect(widths.size).toBeGreaterThanOrEqual(3);
  });

  it.each(labelled)('finds the bar and reads every slot right, or says it cannot: %s', (file) => {
    const slots = readFrame(file);
    expect(slots, 'the bar should be found').not.toBeNull();
    const grid = labels[file].quickSlots!;
    for (const slot of slots!) {
      const [name, count] = grid[slot.row][slot.col].split(':');
      const label = `[${slot.row},${slot.col}] ${grid[slot.row][slot.col]}`;
      // A skill, an empty slot or an item we don't track is never mistaken for a potion, and a potion is never missed.
      expect(slot.itemId, `${label} item`).toBe(idByName.get(name) ?? null);
      // A count is right or null, never wrong.
      if (slot.quantity !== null) expect(slot.quantity, `${label} count`).toBe(Number(count));
      if (slot.itemId === null) expect(slot.quantity, `${label} has no count`).toBeNull();
    }
  });

  it('reads the large majority of tracked counts (a few with a hard-to-tell 7 may stay unreadable)', () => {
    let tracked = 0;
    let read = 0;
    for (const file of labelled) {
      for (const slot of readFrame(file) ?? []) {
        if (slot.itemId === null) continue;
        tracked += 1;
        if (slot.quantity !== null) read += 1;
      }
    }
    expect(tracked).toBeGreaterThanOrEqual(25);
    expect(read / tracked).toBeGreaterThan(0.8);
  });

  it.each(['other_1026x800_1794190544334.png', 'other_1282x752_1794190536307.png'])(
    'finds the bar in a window of a different width, hanging off the EXP label: %s',
    (file) => {
      const blue = readFrame(file)!.find((slot) => slot.itemId === idByName.get('Blue Potion'));
      expect(blue?.quantity).toBe(464);
    },
  );

  it('reads the same counts as the Use tab for the same moment, and more where stacks were off screen', () => {
    // In this frame the Use tab shows 5 stacks of Blue Potion (500) but two more are on another page.
    const slots = readFrame('inventory-open_1368x800_1794216557845.png')!;
    const blue = slots.find((s) => s.itemId === idByName.get('Blue Potion'))!;
    expect(blue.quantity).toBe(502);
  });
});

describe('quickTotals', () => {
  const bar = (...stacks: Array<[number | null, number | null]>): QuickSlots =>
    stacks.map(([itemId, quantity], i) => ({ row: Math.floor(i / 4), col: i % 4, itemId, quantity }));

  it('gives one total per tracked item and ignores everything else', () => {
    const { totals, unreadable } = quickTotals(bar([2000000, 100], [null, null], [2000003, 50]));
    expect([...totals]).toEqual([[2000000, 100], [2000003, 50]]);
    expect(unreadable.size).toBe(0);
  });

  it('reports an item whose count could not be read, rather than a total', () => {
    const { totals, unreadable } = quickTotals(bar([2000000, null]));
    expect(totals.size).toBe(0);
    expect([...unreadable]).toEqual([2000000]);
  });

  it('counts an item hotkeyed twice once, and calls it unreadable if the two slots disagree', () => {
    expect([...quickTotals(bar([2000000, 100], [2000000, 100])).totals]).toEqual([[2000000, 100]]);
    const clash = quickTotals(bar([2000000, 100], [2000000, 90]));
    expect(clash.totals.size).toBe(0);
    expect([...clash.unreadable]).toEqual([2000000]);
  });
});

describe('quickSlotOrigin', () => {
  it('puts the columns 35 or 36 pixels apart and the rows 34', () => {
    const exp = { x: 723, y: 767 };
    expect(quickSlotOrigin(exp, 0, 0)).toEqual({ x: 941, y: 660 });
    expect(quickSlotOrigin(exp, 0, 1)).toEqual({ x: 976, y: 660 });
    expect(quickSlotOrigin(exp, 0, 2)).toEqual({ x: 1012, y: 660 });
    expect(quickSlotOrigin(exp, 1, 3)).toEqual({ x: 1047, y: 694 });
  });

  it('returns null when the bar would fall outside the frame', () => {
    const frame: Frame = { width: 200, height: 200, data: new Uint8ClampedArray(200 * 200 * 4) };
    expect(readQuickSlots(frame, { x: 100, y: 190 }, DEFAULT_INVENTORY_TEMPLATES)).toBeNull();
  });
});
