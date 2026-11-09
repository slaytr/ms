import { matchIcon, readQuantity, type IconMatchOptions, type InventoryTemplates } from './inventory.ts';
import type { Frame, Point } from './types.ts';

/**
 * Reads the quick-slot bar (the 2 x 4 grid of hotkeyed items, bottom right): which tracked item is in each
 * slot and how many of it the player has IN TOTAL. A hotkeyed item shows its count across every stack and
 * every page of the inventory, so unlike the Use tab this needs no inventory window, no scrolling and no
 * summing, and it is on screen all the time.
 *
 * The bar sits at a fixed offset from the EXP label (the status bar and the quick slots move together), so
 * it is found at any window width. Icons are matched against the same templates as the Use tab (the key
 * name drawn across the top of each slot is ignored); counts are the same font, learned separately because
 * its shading and background differ. As everywhere in the detector, a count is right or null, never guessed.
 */

export const QUICK = {
  /** Top-left of slot (0, 0), relative to the EXP label's anchor. */
  slot0: { dx: 218, dy: -107 },
  /** Left edge of each column, from slot (0, 0): the pitch is 35 and a third, so it is not constant. */
  columnX: [0, 35, 71, 106],
  pitchY: 34,
  cols: 4,
  rows: 2,
} as const;

/** The key name ("Shift", "Space") sits over the icon's top, and the icon is a little looser than in the inventory. */
const ICON_OPTIONS: IconMatchOptions = { maxDifference: 34, margin: 8, skipTop: 11 };

export interface QuickSlotReading {
  readonly row: number;
  readonly col: number;
  /** The tracked item in this slot, or null for an empty slot, a skill, or an item we don't track. */
  readonly itemId: number | null;
  /** The item's total count, or null when the slot has no tracked item or its digits couldn't be read for certain. */
  readonly quantity: number | null;
}

export type QuickSlots = readonly QuickSlotReading[];

export function quickSlotOrigin(exp: Point, row: number, col: number): Point {
  return { x: exp.x + QUICK.slot0.dx + QUICK.columnX[col], y: exp.y + QUICK.slot0.dy + row * QUICK.pitchY };
}

const inside = (frame: Frame, x: number, y: number) => x >= 0 && y >= 0 && x < frame.width && y < frame.height;

/** Reads all eight slots, or null when the bar isn't within the frame. `exp` is the EXP label's position. */
export function readQuickSlots(frame: Frame, exp: Point, templates: InventoryTemplates): QuickSlots | null {
  const first = quickSlotOrigin(exp, 0, 0);
  const last = quickSlotOrigin(exp, QUICK.rows - 1, QUICK.cols - 1);
  if (!inside(frame, first.x, first.y) || !inside(frame, last.x + 32, last.y + 32)) return null;

  const slots: QuickSlotReading[] = [];
  for (let row = 0; row < QUICK.rows; row++) {
    for (let col = 0; col < QUICK.cols; col++) {
      const origin = quickSlotOrigin(exp, row, col);
      const itemId = matchIcon(frame, origin, templates.icons, ICON_OPTIONS);
      // Only a tracked item has a count we care about, and skills have none.
      const quantity = itemId === null ? null : readQuantity(frame, origin, templates.quickDigits, { strictTail: true, tails: templates.quickTails });
      slots.push({ row, col, itemId, quantity });
    }
  }
  return slots;
}

export interface QuickTotals {
  /** Each tracked item's total, for items whose count could be read. */
  readonly totals: ReadonlyMap<number, number>;
  /** Tracked items on the bar whose count couldn't be read, or that two slots disagree about. */
  readonly unreadable: ReadonlySet<number>;
}

/**
 * One total per tracked item. The same item in two slots shows the same total twice, so it is counted once;
 * if the two disagree one of them was misread and the item is reported unreadable instead of guessed.
 */
export function quickTotals(slots: QuickSlots): QuickTotals {
  const seen = new Map<number, number>();
  const unreadable = new Set<number>();
  for (const slot of slots) {
    if (slot.itemId === null) continue;
    if (slot.quantity === null) {
      unreadable.add(slot.itemId);
      continue;
    }
    const known = seen.get(slot.itemId);
    if (known !== undefined && known !== slot.quantity) unreadable.add(slot.itemId);
    else seen.set(slot.itemId, slot.quantity);
  }
  return { totals: new Map([...seen].filter(([id]) => !unreadable.has(id))), unreadable };
}
