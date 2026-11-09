import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POTIONS } from '../../data/potions.ts';
import { DEFAULT_INVENTORY_TEMPLATES } from './default-inventory-templates.ts';
import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { detectFrame } from './detect.ts';
import { FIXTURES_DIR, loadFrame } from './fixture-io.ts';
import { INVENTORY, readQuantity, readUseTab, scrollThumbTop, slotOrigin, totalsByItem, useTabSelected } from './inventory.ts';
import type { Frame } from './types.ts';

const labels = JSON.parse(readFileSync(join(FIXTURES_DIR, 'labels.json'), 'utf8')) as Record<string, { useTab?: string[][] }>;
const labelled = Object.keys(labels).filter((file) => labels[file].useTab);
const idByName = new Map(POTIONS.map((p) => [p.name, p.id]));

const mesosOf = (frame: Frame) => detectFrame(frame, DEFAULT_TEMPLATES).state.mesos;

describe('readUseTab on real Classic client captures', () => {
  it('has labelled frames to test against', () => {
    expect(labelled.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of labelled) {
    describe(file, () => {
      const frame = loadFrame(file);
      const mesos = mesosOf(frame);
      const reading = mesos ? readUseTab(frame, mesos, DEFAULT_INVENTORY_TEMPLATES) : null;
      const grid = labels[file].useTab!;

      it('finds the open Use tab', () => {
        expect(reading).not.toBeNull();
      });

      it('never reads a slot wrong: the item is right, and a count is either right or left null', () => {
        for (const slot of reading!.slots) {
          const [name, count] = grid[slot.row][slot.col].split(':');
          if (name === '-') {
            expect(slot.empty, `[${slot.row},${slot.col}] should be empty`).toBe(true);
            continue;
          }
          expect(slot.empty, `[${slot.row},${slot.col}] should not be empty`).toBe(false);
          expect(slot.itemId, `[${slot.row},${slot.col}] item`).toBe(name === '?' ? null : idByName.get(name));
          if (slot.quantity !== null) expect(slot.quantity, `[${slot.row},${slot.col}] count`).toBe(Number(count));
        }
      });

      it('reads nearly every count (a stack whose 1 lost its flag to compression may stay unreadable)', () => {
        const filled = reading!.slots.filter((s) => !s.empty);
        expect(filled.filter((s) => s.quantity === null).length).toBeLessThanOrEqual(1);
      });

      it('totals the visible stacks of each tracked item, leaving out an item with a stack it couldn\'t read', () => {
        const expected = new Map<number, number>();
        for (const cell of grid.flat()) {
          const [name, count] = cell.split(':');
          const id = idByName.get(name);
          if (id !== undefined) expected.set(id, (expected.get(id) ?? 0) + Number(count));
        }
        const { totals, unreadable, complete } = totalsByItem(reading!);
        for (const [id, total] of totals) expect(total, `item ${id}`).toBe(expected.get(id));
        // Every tracked item is either totalled or reported unreadable, never silently short.
        for (const id of expected.keys()) expect(totals.has(id) || unreadable.has(id), `item ${id}`).toBe(true);
        expect(complete).toBe(unreadable.size === 0);
        expect(totals.size).toBeGreaterThanOrEqual(expected.size - 1);
      });
    });
  }

  it('finds the grid wherever the window is (the frames put it at several places)', () => {
    const anchors = new Set(labelled.map((file) => JSON.stringify(mesosOf(loadFrame(file)))));
    expect(anchors.size).toBeGreaterThanOrEqual(3);
  });

  it('returns null when the inventory is open on another tab or not at all', () => {
    const frame = loadFrame('inventory-open_1368x800_1794120030427.png');
    const mesos = mesosOf(frame);
    expect(mesos).not.toBeNull();
    expect(readUseTab(frame, mesos!, DEFAULT_INVENTORY_TEMPLATES)).toBeNull();
  });

  it('reports a scroll position, and the same one for frames of the same inventory', () => {
    const byInventory = new Map<string, Set<number | null>>();
    for (const file of labelled) {
      const frame = loadFrame(file);
      const key = JSON.stringify(labels[file].useTab);
      byInventory.set(key, (byInventory.get(key) ?? new Set()).add(scrollThumbTop(frame, mesosOf(frame)!)));
    }
    for (const tops of byInventory.values()) {
      expect(tops.size).toBe(1);
      expect([...tops][0]).not.toBeNull();
    }
  });
});

/** A small frame with a count drawn the way the game draws one: white fill with a black outline either side. */
function frameWithCount(bitmaps: readonly string[][], extra: (white: (x: number, y: number) => void) => void = () => undefined) {
  const width = 80;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    const i = (y * width + x) * 4;
    [data[i], data[i + 1], data[i + 2], data[i + 3]] = [r, g, b, 255];
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) paint(x, y, [225, 223, 213]);
  const origin = { x: 10, y: 10 };
  const top = origin.y + INVENTORY.digits.top;
  const white = (x: number, y: number) => {
    paint(origin.x + x - 1, top + y, [0, 0, 0]);
    paint(origin.x + x + 1, top + y, [0, 0, 0]);
  };
  const fill = (x: number, y: number) => paint(origin.x + x, top + y, [255, 255, 255]);
  let at = 1;
  for (const bitmap of bitmaps) {
    bitmap.forEach((row, y) => [...row].forEach((c, x) => c === '#' && white(at + x, y)));
    bitmap.forEach((row, y) => [...row].forEach((c, x) => c === '#' && fill(at + x, y)));
    at += bitmap[0].length + 2;
  }
  extra((x, y) => {
    white(x, y);
    fill(x, y);
  });
  return { frame: { width, height, data } as Frame, origin };
}

describe('readQuantity', () => {
  const { digits } = DEFAULT_INVENTORY_TEMPLATES;
  const one = digits['1'][0] as string[];
  const five = digits['5'][0] as string[];

  it('reads digits drawn the way the game draws them', () => {
    const { frame, origin } = frameWithCount([one, five]);
    expect(readQuantity(frame, origin, digits)).toBe(15);
  });

  it('ignores a stray highlight after the count', () => {
    const { frame, origin } = frameWithCount([one, five], (white) => {
      white(23, 4);
      white(25, 4);
    });
    expect(readQuantity(frame, origin, digits)).toBe(15);
  });

  it('returns null, never a shorter number, when a digit it has no template for follows', () => {
    const without5 = Object.fromEntries(Object.entries(digits).filter(([d]) => d !== '5'));
    const { frame, origin } = frameWithCount([one, five]);
    expect(readQuantity(frame, origin, without5)).toBeNull();
  });

  it('returns null when nothing is drawn', () => {
    const { frame, origin } = frameWithCount([]);
    expect(readQuantity(frame, origin, digits)).toBeNull();
  });
});

describe('useTabSelected', () => {
  it('is true for a pink tab head, in either shade, and false for a grey one', () => {
    const mesos = { x: 200, y: 300 };
    const at = { x: mesos.x + INVENTORY.useTabPixel.dx, y: mesos.y + INVENTORY.useTabPixel.dy };
    const frameWith = (rgb: [number, number, number]): Frame => {
      const data = new Uint8ClampedArray(320 * 400 * 4);
      const i = (at.y * 320 + at.x) * 4;
      [data[i], data[i + 1], data[i + 2], data[i + 3]] = [...rgb, 255];
      return { width: 320, height: 400, data };
    };
    expect(useTabSelected(frameWith([245, 217, 221]), mesos)).toBe(true);
    expect(useTabSelected(frameWith([210, 146, 157]), mesos)).toBe(true);
    expect(useTabSelected(frameWith([187, 189, 189]), mesos)).toBe(false);
  });
});

describe('slotOrigin', () => {
  it('steps 36px across and 34px down from the first slot', () => {
    const mesos = { x: 422, y: 481 };
    expect(slotOrigin(mesos, 0, 0)).toEqual({ x: 258, y: 259 });
    expect(slotOrigin(mesos, 1, 3)).toEqual({ x: 366, y: 293 });
  });
});
