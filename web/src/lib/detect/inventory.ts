import type { Bitmap, Frame, Point } from './types.ts';

/**
 * Reads the Use tab of the Item Inventory window: which slot holds which consumable and how many.
 *
 * The window is movable, but everything in it is at a fixed offset from the "MESOS" label (the same
 * anchor the meso reading uses), so it is found wherever the player puts it. A slot's item is
 * matched against icon templates of the items we track; its stack count is a proportional pixel
 * font drawn over the icon (white fill, black outline), read by exact glyph shape. Anything that
 * does not match with certainty is left null, never guessed.
 */

export const INVENTORY = {
  /** Top-left of slot (0, 0), relative to the MESOS anchor. */
  slot0: { dx: -164, dy: -222 },
  pitchX: 36,
  pitchY: 34,
  size: 32,
  cols: 5,
  /** Rows visible at once; the tab scrolls for more. */
  rows: 6,
  /** The "Use" tab's head turns pink when it is the selected tab (the other tabs are grey). */
  useTabPixel: { dx: -122, dy: -247 },
  /** A column through the scrollbar track, to find the thumb. */
  scroll: { dx: 24, fromDy: -205, toDy: -25 },
  /** An empty slot is this flat colour. */
  emptyColor: { r: 225, g: 223, b: 213 },
  emptyTolerance: 8,
  /** The stack count's white fill sits in these rows of the slot, from the slot's left edge. */
  digits: { top: 21, height: 8, width: 27 },
  /** Icon pixels this close to the digits are ignored when matching an icon (the count is drawn over it). */
  digitsMask: { top: 19, width: 26 },
} as const;

/** A tracked item's icon: its opaque pixels (alpha 255) as RGB, trimmed to its bounding box. */
export interface IconTemplate {
  readonly id: number;
  readonly w: number;
  readonly h: number;
  /** w*h*4 bytes of RGBA, base64. */
  readonly rgba: string;
}

export interface InventoryTemplates {
  readonly version: 1;
  /** Stack-count digits: each character's known white-fill renderings (rows of '#' and '.'). */
  readonly digits: Readonly<Record<string, readonly Bitmap[]>>;
  readonly icons: readonly IconTemplate[];
  /** The same, for the stack counts on the quick-slot bar: same font, but the shading and background differ, so they are learned separately. */
  readonly quickDigits: Readonly<Record<string, readonly Bitmap[]>>;
  /**
   * Remnants seen right after the last digit of a labelled quick-slot count that are harmless icon highlights, not a
   * damaged digit (each icon draws the same ones every time). The strict reader ignores one it has seen before.
   */
  readonly quickTails: readonly Bitmap[];
}

export const EMPTY_INVENTORY_TEMPLATES: InventoryTemplates = { version: 1, digits: {}, icons: [], quickDigits: {}, quickTails: [] };

export interface SlotReading {
  readonly row: number;
  readonly col: number;
  readonly empty: boolean;
  /** The tracked item in this slot, or null for an empty slot or an item we don't track. */
  readonly itemId: number | null;
  /** Stack size, or null when empty or its digits couldn't be read for certain. */
  readonly quantity: number | null;
}

export interface UseTabReading {
  /** Where the scrollbar thumb sits (rows below the anchor), or null if it wasn't found. A change means the player scrolled. */
  readonly scroll: number | null;
  readonly slots: readonly SlotReading[];
}

/** Everything read from one frame's inventory, or null when the Use tab isn't open. */
export type UseTab = UseTabReading | null;

const PIXEL = 4;

function pixel(frame: Frame, x: number, y: number): readonly [number, number, number] {
  const i = (y * frame.width + x) * PIXEL;
  return [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
}

const inside = (frame: Frame, x: number, y: number) => x >= 0 && y >= 0 && x < frame.width && y < frame.height;

/** The Use tab is the open tab: its head is pink (paler or deeper depending on hover), where the others are plain grey. */
export function useTabSelected(frame: Frame, mesos: Point): boolean {
  const x = mesos.x + INVENTORY.useTabPixel.dx;
  const y = mesos.y + INVENTORY.useTabPixel.dy;
  if (!inside(frame, x, y)) return false;
  const [r, g, b] = pixel(frame, x, y);
  return r >= 190 && r - g >= 20 && r - b >= 15;
}

/** Top of the scrollbar thumb, as rows below the anchor, or null when no thumb is found. The thumb is a blue block on a light track. */
export function scrollThumbTop(frame: Frame, mesos: Point): number | null {
  const { dx, fromDy, toDy } = INVENTORY.scroll;
  const x = mesos.x + dx;
  for (let dy = fromDy; dy <= toDy; dy++) {
    const y = mesos.y + dy;
    if (!inside(frame, x, y)) return null;
    const [r, , b] = pixel(frame, x, y);
    if (r < 130 && b - r >= 40) return dy;
  }
  return null;
}

export function slotOrigin(mesos: Point, row: number, col: number): Point {
  return { x: mesos.x + INVENTORY.slot0.dx + col * INVENTORY.pitchX, y: mesos.y + INVENTORY.slot0.dy + row * INVENTORY.pitchY };
}

function isEmptyColor([r, g, b]: readonly [number, number, number], t: number = INVENTORY.emptyTolerance): boolean {
  const { r: er, g: eg, b: eb } = INVENTORY.emptyColor;
  return Math.abs(r - er) <= t && Math.abs(g - eg) <= t && Math.abs(b - eb) <= t;
}

/** An empty slot is flat background all over; a selected slot only has its orange border changed, so the middle is checked. */
function slotIsEmpty(frame: Frame, origin: Point): boolean {
  let plain = 0;
  let total = 0;
  for (let y = origin.y + 3; y < origin.y + INVENTORY.size - 3; y++) {
    for (let x = origin.x + 3; x < origin.x + INVENTORY.size - 3; x++) {
      total += 1;
      if (isEmptyColor(pixel(frame, x, y))) plain += 1;
    }
  }
  return plain / total > 0.97;
}

const luma = ([r, g, b]: readonly [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;
/** Bright and colourless, but not the flat slot background (which also shows through the inside of a 0). Video compression dims some blocks of the white, hence the low bar. */
const isWhite = (rgb: readonly [number, number, number]) => {
  const tint = Math.max(...rgb) - Math.min(...rgb);
  const l = luma(rgb);
  // Very bright pixels can carry more tint: the count is white over a yellow icon at times (255, 255, 211).
  const colourless = l >= 235 ? tint < 60 : l >= 190 && tint < 40;
  return colourless && !isEmptyColor(rgb, 12);
};
const isBlack = (rgb: readonly [number, number, number]) => luma(rgb) < 70;

/**
 * The pure-white fill of the stack count, as rows of '#'. Each stroke of a digit is white with a black
 * outline on both sides, so a white run only counts when it is bordered by black at both ends: that
 * leaves out the white highlights in the item's own icon, which are not.
 */
export function digitMask(frame: Frame, origin: Point): Bitmap {
  const { top, height, width } = INVENTORY.digits;
  const rows: string[] = [];
  for (let y = origin.y + top; y < origin.y + top + height; y++) {
    const row = Array.from({ length: width }, () => '.');
    let x = origin.x;
    while (x < origin.x + width) {
      if (!isWhite(pixel(frame, x, y))) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < origin.x + width && isWhite(pixel(frame, end, y))) end += 1;
      const bordered = x > 0 && end < frame.width && isBlack(pixel(frame, x - 1, y)) && isBlack(pixel(frame, end, y));
      if (bordered) for (let i = x; i < end; i++) row[i - origin.x] = '#';
      x = end;
    }
    rows.push(row.join(''));
  }
  return rows;
}

interface PlacedGlyph {
  readonly x: number;
  readonly bitmap: Bitmap;
}

/** Splits the mask into glyphs at empty columns, remembering where each starts. */
function splitColumns(mask: Bitmap): PlacedGlyph[] {
  const width = mask[0]?.length ?? 0;
  const glyphs: PlacedGlyph[] = [];
  let start = -1;
  for (let col = 0; col <= width; col++) {
    const ink = col < width && mask.some((row) => row[col] === '#');
    if (ink && start < 0) start = col;
    if (!ink && start >= 0) {
      glyphs.push({ x: start, bitmap: mask.map((row) => row.slice(start, col)) });
      start = -1;
    }
  }
  return glyphs;
}

const inkRows = (bitmap: Bitmap) => bitmap.filter((row) => row.includes('#')).length;
const columns = (glyph: PlacedGlyph) => glyph.bitmap[0].length;

/** A glyph this narrow is probably half of a digit whose top or bottom bar was lost to compression. */
const NARROW = 2;
const DIGIT_MAX_WIDTH = 6;
/** Digits are packed closer than this; the next ink further away belongs to the icon, not the count. */
const MAX_GAP = 4;
const MIN_INK_ROWS = 5;
/** The count starts at the slot's left edge. */
const MAX_START = 5;

function joinGlyphs(a: PlacedGlyph, b: PlacedGlyph, height: number): PlacedGlyph {
  const gap = b.x - (a.x + columns(a));
  const rows = Array.from({ length: height }, (_, y) => a.bitmap[y] + '.'.repeat(gap) + b.bitmap[y]);
  return { x: a.x, bitmap: rows };
}

/**
 * The glyphs of the count, left to right: strays (white bits of the icon itself) removed, a digit that
 * came apart put back together, and everything after the first big gap dropped.
 */
export function splitDigitGlyphs(mask: Bitmap): Bitmap[] {
  const height = mask.length;
  const placed = splitColumns(mask);
  const merged: PlacedGlyph[] = [];
  for (const glyph of placed) {
    const last = merged[merged.length - 1];
    const together = last && columns(last) <= NARROW && columns(glyph) <= NARROW && glyph.x + columns(glyph) - last.x <= DIGIT_MAX_WIDTH;
    if (last && together) merged[merged.length - 1] = joinGlyphs(last, glyph, height);
    else merged.push(glyph);
  }
  const kept: PlacedGlyph[] = [];
  for (const glyph of merged.filter((g) => inkRows(g.bitmap) >= MIN_INK_ROWS)) {
    const last = kept[kept.length - 1];
    if (!last && glyph.x > MAX_START) break;
    if (last && glyph.x - (last.x + columns(last)) > MAX_GAP) break;
    kept.push(glyph);
  }
  return kept.map((g) => g.bitmap);
}

/** The glyphs of the white stack-count fill in a slot, split at empty columns (for learning templates from labelled frames). */
export function digitGlyphs(frame: Frame, origin: Point): Bitmap[] {
  return splitDigitGlyphs(digitMask(frame, origin));
}

/** Pixels that differ between a digit template and the mask when the template starts at column `start`, counted inside the template only. */
export function mismatchAt(mask: Bitmap, start: number, template: Bitmap): number {
  let diff = 0;
  for (let y = 0; y < template.length; y++) {
    for (let x = 0; x < template[y].length; x++) if ((mask[y]?.[start + x] ?? '.') !== template[y][x]) diff += 1;
  }
  return diff;
}

/** Blank columns before a template's first ink (a '1' that lost its flag is a stem with two blank columns before it). */
const leadOf = (template: Bitmap): number => {
  const width = template[0].length;
  for (let col = 0; col < width; col++) if (template.some((row) => row[col] === '#')) return col;
  return 0;
};

/** Pixels allowed to differ inside a digit's footprint (compression nibbles an edge now and then). */
const DIGIT_TOLERANCE = 2;
/** The best digit must beat every other digit by this many pixels, or it isn't called. */
const DIGIT_MARGIN = 3;

interface DigitHit {
  readonly digit: string;
  /** Column just past the digit's last template column. */
  readonly end: number;
}

/** The digit whose first ink is at column `at`, if exactly one fits clearly. */
function digitAt(mask: Bitmap, at: number, digits: InventoryTemplates['digits']): DigitHit | null {
  const fits: { digit: string; end: number; diff: number }[] = [];
  for (const [digit, renderings] of Object.entries(digits)) {
    for (const bitmap of renderings) {
      const start = at - leadOf(bitmap);
      if (start < 0) continue;
      fits.push({ digit, end: start + bitmap[0].length, diff: mismatchAt(mask, start, bitmap) });
    }
  }
  fits.sort((p, q) => p.diff - q.diff);
  const [best] = fits;
  if (!best || best.diff > DIGIT_TOLERANCE) return null;
  const other = fits.find((fit) => fit.digit !== best.digit);
  return other && other.diff - best.diff < DIGIT_MARGIN ? null : { digit: best.digit, end: best.end };
}

const hasInk = (mask: Bitmap, col: number) => mask.some((row) => row[col] === '#');

/** The first column at or after `from` that has ink, or null if the next ink is further than `within` columns away. */
function nextInk(mask: Bitmap, from: number, within: number): number | null {
  for (let col = from; col < Math.min(mask[0].length, from + within + 1); col++) if (hasInk(mask, col)) return col;
  return null;
}

/** The widest a digit is. */
const DIGIT_WINDOW = 7;
/** A digit has ink on at least this many rows, and a stroke at least this tall. */
const DIGIT_MIN_ROWS = 5;
const DIGIT_MIN_STROKE = 4;

/**
 * Whether the ink starting at column `at` is shaped like a digit: tall enough, with a vertical stroke.
 * A stray pixel, or a thin bar from the icon's edge, is not. This is what lets the reader stop at noise
 * after the count but still refuse (return null) when a real digit it doesn't know comes next.
 */
function looksLikeDigit(mask: Bitmap, at: number): boolean {
  const rows = mask.filter((row) => row.slice(at, at + DIGIT_WINDOW).includes('#')).length;
  if (rows < DIGIT_MIN_ROWS) return false;
  for (let col = at; col < Math.min(mask[0].length, at + DIGIT_WINDOW); col++) {
    if (mask.filter((row) => row[col] === '#').length >= DIGIT_MIN_STROKE) return true;
  }
  return false;
}

/** Width of the window after the last digit that is kept as a known harmless remnant. */
export const TAIL_WIDTH = 8;

/** The mask after the last digit (from column `from`) looks like a remnant already known to be harmless (give or take a column and a pixel). */
function isKnownTail(mask: Bitmap, from: number, tails: readonly Bitmap[] = []): boolean {
  return tails.some((tail) => [-1, 0, 1].some((shift) => from + shift >= 0 && mismatchAt(mask, from + shift, tail) <= 1));
}

/** Ink starting within this many columns of the previous digit's end is where the next digit would be. */
const NEXT_DIGIT_REACH = 3;
/** How much ink right after a digit makes it a damaged digit rather than the icon's noise. */
const DAMAGED_MIN = { columns: 3, rows: 4, pixels: 6 } as const;

/**
 * Ink right where the next digit would sit that is wide and tall enough to be a (damaged) digit. A half-hidden
 * last digit leaves such a remnant; if the reader treated it as noise it would return the shorter number
 * ("50" for "502"). The icon's own highlights are usually thinner than this, or further away.
 */
function looksLikeDamagedDigit(mask: Bitmap, at: number): boolean {
  const end = Math.min(mask[0].length, at + DIGIT_WINDOW);
  let pixels = 0;
  let columns = 0;
  for (let col = at; col < end; col++) {
    const here = mask.filter((row) => row[col] === '#').length;
    pixels += here;
    if (here > 0) columns += 1;
  }
  const rows = mask.filter((row) => row.slice(at, end).includes('#')).length;
  return columns >= DAMAGED_MIN.columns && rows >= DAMAGED_MIN.rows && pixels >= DAMAGED_MIN.pixels;
}

type Next = { readonly at: number; readonly hit: DigitHit } | 'unknown' | null;

/**
 * The next digit within `within` columns of `from`. A highlight can sit just before a digit, so every
 * column with ink in that window is tried. Null when nothing digit-shaped is there (the count is over);
 * 'unknown' when something digit-shaped is there but matches no known digit.
 */
function nextDigit(mask: Bitmap, from: number, within: number, digits: InventoryTemplates['digits'], options: QuantityOptions): Next {
  const first = nextInk(mask, from, within);
  if (first === null) return null;
  for (let col = first; col <= Math.min(mask[0].length - 1, from + within); col++) {
    if (!hasInk(mask, col)) continue;
    const hit = digitAt(mask, col, digits);
    if (hit) return { at: col, hit };
  }
  // A remnant already learned as harmless (a labelled count ended in exactly this) is the icon, even when it is digit-shaped.
  if (options.strictTail && from > 0 && first - from <= NEXT_DIGIT_REACH && isKnownTail(mask, from, options.tails)) return null;
  if (looksLikeDigit(mask, first)) return 'unknown';
  // Right after a digit already read, a remnant that wide and tall is a damaged digit, not the icon's noise.
  if (options.strictTail && from > 0 && first - from <= NEXT_DIGIT_REACH && looksLikeDamagedDigit(mask, first) && !isKnownTail(mask, from, options.tails)) return 'unknown';
  return null;
}

/**
 * The stack size drawn on a slot, or null when nothing is drawn or any digit isn't recognised for
 * certain. Digits are matched left to right by their exact shape. Ink after the count that is not
 * digit-shaped (the icon's own highlights) is ignored; digit-shaped ink that matches nothing makes the
 * whole reading null, so an unknown digit is never dropped or guessed.
 */
export interface QuantityOptions {
  /**
   * Give up (null) when ink that could be a damaged digit sits right after the last one read, instead of treating it
   * as the icon's noise. Safer against a half-hidden last digit ("50" for "502"), at the price of more unreadable
   * counts; the quick slots use it, the Use tab (whose counts are a net change, not a running total) does not.
   */
  readonly strictTail?: boolean;
  /** With strictTail: remnants known to be harmless (see InventoryTemplates.quickTails), ignored when seen again. */
  readonly tails?: readonly Bitmap[];
}

export function readQuantity(frame: Frame, origin: Point, digits: InventoryTemplates['digits'], options: QuantityOptions = {}): number | null {
  const mask = digitMask(frame, origin);
  let text = '';
  let from = 0;
  let within = MAX_START;
  while (text.length < 4) {
    const next = nextDigit(mask, from, within, digits, options);
    if (next === 'unknown') return null;
    if (next === null) break;
    text += next.hit.digit;
    from = next.hit.end;
    within = MAX_GAP;
  }
  return text === '' ? null : Number(text);
}

interface DecodedIcon {
  readonly id: number;
  readonly w: number;
  readonly h: number;
  /** [x, y, r, g, b] for each fully opaque pixel. */
  readonly opaque: readonly (readonly [number, number, number, number, number])[];
}

const decodedCache = new WeakMap<readonly IconTemplate[], readonly DecodedIcon[]>();

function decodeIcons(icons: readonly IconTemplate[]): readonly DecodedIcon[] {
  const cached = decodedCache.get(icons);
  if (cached) return cached;
  const decoded = icons.map(({ id, w, h, rgba }): DecodedIcon => {
    const bytes = Uint8Array.from(atob(rgba), (c) => c.charCodeAt(0));
    const opaque: [number, number, number, number, number][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (bytes[i + 3] === 255) opaque.push([x, y, bytes[i], bytes[i + 1], bytes[i + 2]]);
      }
    }
    return { id, w, h, opaque };
  });
  decodedCache.set(icons, decoded);
  return decoded;
}

/** Mean per-channel colour difference of an icon laid at (ox, oy), skipping the pixels the stack count covers. Stops early once it can't beat `limit`. */
function iconDifference(frame: Frame, icon: DecodedIcon, ox: number, oy: number, origin: Point, limit: number, skipTop: number): number {
  const maskTop = origin.y + INVENTORY.digitsMask.top;
  const skipAbove = origin.y + skipTop;
  const maskRight = origin.x + INVENTORY.digitsMask.width;
  let sum = 0;
  let counted = 0;
  const cap = limit * icon.opaque.length * 3;
  for (const [x, y, r, g, b] of icon.opaque) {
    const fx = ox + x;
    const fy = oy + y;
    if (fy < skipAbove || (fy >= maskTop && fx < maskRight)) continue;
    const [pr, pg, pb] = pixel(frame, fx, fy);
    sum += Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
    counted += 1;
    if (sum > cap) return Number.POSITIVE_INFINITY;
  }
  return counted < 40 ? Number.POSITIVE_INFINITY : sum / (counted * 3);
}

/** A template matches a slot when its best offset is at most this different per colour channel... */
const ICON_MAX_DIFFERENCE = 18;
/** ...and the next-best template is at least this much worse, so two similar icons are never confused. */
const ICON_MIN_MARGIN = 4;
/** Icons are drawn centred across and bottom-aligned, give or take a few pixels. */
const SEARCH = { across: 3, down: 3, up: 1 } as const;

/** The tracked item whose icon is in this slot, or null if none matches clearly. */
export interface IconMatchOptions {
  /** Largest colour difference (per channel, 0-255) a match may have. */
  readonly maxDifference?: number;
  /** How much better than the runner-up the best match must be. */
  readonly margin?: number;
  /** Rows at the top of the slot to ignore (the quick slots draw their key name there). */
  readonly skipTop?: number;
}

export function matchIcon(frame: Frame, origin: Point, icons: readonly IconTemplate[], options: IconMatchOptions = {}): number | null {
  const { maxDifference = ICON_MAX_DIFFERENCE, margin = ICON_MIN_MARGIN, skipTop = 0 } = options;
  const scores: { id: number; diff: number }[] = [];
  for (const icon of decodeIcons(icons)) {
    const baseX = origin.x + Math.ceil((INVENTORY.size - icon.w) / 2);
    const baseY = origin.y + (INVENTORY.size - icon.h);
    let best = Number.POSITIVE_INFINITY;
    for (let dy = -SEARCH.down; dy <= SEARCH.up; dy++) {
      for (let dx = -SEARCH.across; dx <= SEARCH.across; dx++) {
        best = Math.min(best, iconDifference(frame, icon, baseX + dx, baseY + dy, origin, Math.min(best, 60), skipTop));
      }
    }
    scores.push({ id: icon.id, diff: best });
  }
  scores.sort((a, b) => a.diff - b.diff);
  const [first, second] = scores;
  if (!first || first.diff > maxDifference) return null;
  return second && second.diff - first.diff < margin ? null : first.id;
}

function readSlot(frame: Frame, mesos: Point, row: number, col: number, templates: InventoryTemplates): SlotReading {
  const origin = slotOrigin(mesos, row, col);
  if (slotIsEmpty(frame, origin)) return { row, col, empty: true, itemId: null, quantity: null };
  return {
    row,
    col,
    empty: false,
    itemId: matchIcon(frame, origin, templates.icons),
    quantity: readQuantity(frame, origin, templates.digits),
  };
}

/**
 * Reads every visible slot of the Use tab, or null when that tab isn't the one showing (or the window
 * isn't where the anchor says it is). `mesos` is the MESOS label's position.
 */
export function readUseTab(frame: Frame, mesos: Point, templates: InventoryTemplates): UseTab {
  if (!useTabSelected(frame, mesos)) return null;
  const first = slotOrigin(mesos, 0, 0);
  const last = slotOrigin(mesos, INVENTORY.rows - 1, INVENTORY.cols - 1);
  if (!inside(frame, first.x, first.y) || !inside(frame, last.x + INVENTORY.size, last.y + INVENTORY.size)) return null;

  const slots: SlotReading[] = [];
  for (let row = 0; row < INVENTORY.rows; row++) {
    for (let col = 0; col < INVENTORY.cols; col++) slots.push(readSlot(frame, mesos, row, col, templates));
  }
  return { scroll: scrollThumbTop(frame, mesos), slots };
}

export interface UseTabTotals {
  /** Total count per tracked item across the visible stacks, for items whose every stack could be read. */
  readonly totals: ReadonlyMap<number, number>;
  /** Tracked items with at least one stack whose count couldn't be read, so their total is unknown. */
  readonly unreadable: ReadonlySet<number>;
  /** True when every tracked item's count was read. */
  readonly complete: boolean;
}

/** Adds up the visible stacks of each tracked item. An item with any unreadable stack gets no total (never a short one). */
export function totalsByItem(reading: UseTabReading): UseTabTotals {
  const sums = new Map<number, number>();
  const unreadable = new Set<number>();
  for (const slot of reading.slots) {
    if (slot.itemId === null) continue;
    if (slot.quantity === null) unreadable.add(slot.itemId);
    else sums.set(slot.itemId, (sums.get(slot.itemId) ?? 0) + slot.quantity);
  }
  const totals = new Map([...sums].filter(([id]) => !unreadable.has(id)));
  return { totals, unreadable, complete: unreadable.size === 0 };
}
