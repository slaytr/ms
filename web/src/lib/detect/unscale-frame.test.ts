import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POTIONS } from '../../data/potions.ts';
import { DEFAULT_INVENTORY_TEMPLATES } from './default-inventory-templates.ts';
import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { detectFrame } from './detect.ts';
import { FIXTURES_DIR, loadFrame } from './fixture-io.ts';
import { readUseTab } from './inventory.ts';
import { readPots } from './read-pots.ts';
import { readQuickSlots } from './quickslots.ts';
import { borderless, upscaleCapture, windowed } from './scale-fixture.ts';
import { quickSlotRegion, unscaleColourRegions, useTabRegion } from './unscale-frame.ts';

type Labels = Record<string, { quickSlots?: string[][]; useTab?: string[][] }>;
const labels = JSON.parse(readFileSync(join(FIXTURES_DIR, 'labels.json'), 'utf8')) as Labels;
const idByName = new Map(POTIONS.map((p) => [p.name, p.id]));
/** Only 1368x800 windowed captures of the native client can be re-rendered as a taller window. */
const native = (file: string) => /_1368x800_/.test(file);
const quickFrames = Object.keys(labels).filter((f) => labels[f].quickSlots && native(f)).slice(0, 5);
const useTabFrames = Object.keys(labels).filter((f) => labels[f].useTab && native(f)).slice(0, 3);

const LAYOUTS = [
  ['borderless 2560x1440 (1.875x)', borderless(1440, 2560, 1366)],
  ['windowed 1920x1080 client (1.41x)', windowed(1080, 1920, 1366)],
] as const;

describe.each(LAYOUTS)('pots read through a %s window', (_name, layout) => {
  it.each(quickFrames)('reads the quick-slot bar, right or null, never wrong: %s', (file) => {
    const frame = upscaleCapture(loadFrame(file), layout);
    const { state } = detectFrame(frame, DEFAULT_TEMPLATES);
    expect(state.view, 'the window should be fitted').toBeDefined();
    const unscaled = unscaleColourRegions(frame, state.view!, [quickSlotRegion(state.exp!)]);
    const slots = readQuickSlots(unscaled, state.exp!, DEFAULT_INVENTORY_TEMPLATES)!;
    expect(slots).not.toBeNull();
    const grid = labels[file].quickSlots!;
    let read = 0;
    let tracked = 0;
    for (const slot of slots) {
      const [name, count] = grid[slot.row][slot.col].split(':');
      expect(slot.itemId, `[${slot.row},${slot.col}] ${grid[slot.row][slot.col]}`).toBe(idByName.get(name) ?? null);
      if (slot.itemId !== null) tracked += 1;
      if (slot.quantity !== null) {
        expect(slot.quantity).toBe(Number(count));
        read += 1;
      }
    }
    expect(read, 'every tracked count should read').toBe(tracked);
  });

  it.each(useTabFrames)('reads the Use tab, right or null, never wrong: %s', (file) => {
    const frame = upscaleCapture(loadFrame(file), layout);
    const { state } = detectFrame(frame, DEFAULT_TEMPLATES);
    const unscaled = unscaleColourRegions(frame, state.view!, [useTabRegion(state.mesos!)]);
    const tab = readUseTab(unscaled, state.mesos!, DEFAULT_INVENTORY_TEMPLATES);
    expect(tab, 'the Use tab should be open').not.toBeNull();
    const grid = labels[file].useTab!;
    let read = 0;
    for (const slot of tab!.slots) {
      const [name, count] = grid[slot.row][slot.col].split(':');
      expect(slot.itemId, `[${slot.row},${slot.col}] ${grid[slot.row][slot.col]}`).toBe(idByName.get(name) ?? null);
      if (slot.quantity !== null) {
        expect(slot.quantity).toBe(Number(count));
        read += 1;
      }
    }
    expect(read).toBeGreaterThan(0);
  });
});

describe('a real 2560x1440 capture (the client scales its UI up, so the pots need unscaling)', () => {
  it('reads every quick-slot count, which the native-size path never saw', () => {
    const frame = loadFrame('other_2560x1440_1794302247807.png');
    const { state } = detectFrame(frame, DEFAULT_TEMPLATES);
    const { quickSlots } = readPots(frame, state);
    expect(quickSlots?.map((s) => [s.itemId, s.quantity])).toEqual([
      [idByName.get('Blue Potion'), 248],
      [idByName.get('Orange Potion'), 478],
      [idByName.get('Pure Water'), 246],
      [null, null],
      [idByName.get('White Potion'), 157],
      [idByName.get('Lemon'), 770],
      [idByName.get('Meat'), 4],
      [null, null],
    ]);
  });

  it('reads the Use tab as closed when another tab (Etc here) is showing', () => {
    const frame = loadFrame('other_2560x1440_1794302247807.png');
    expect(readPots(frame, detectFrame(frame, DEFAULT_TEMPLATES).state).useTab).toBeNull();
  });
});
