import { classify, UNKNOWN } from './glyph.ts';
import { CHARACTER, EXP, GLYPH_TOLERANCE, LEVEL, MAP, MESO } from './layout.ts';
import { clipRect, extractBitmap, segmentGlyphs, type Glyph } from './mask.ts';
import type { Bitmap, GlyphSet, Point, Polarity, Rect } from './types.ts';

const bandAt = (origin: Point, band: { dx: number; dy: number; w: number; h: number }): Rect => ({
  x: origin.x + band.dx,
  y: origin.y + band.dy,
  w: band.w,
  h: band.h,
});

// ---------------------------------------------------------------------
// Glyph extraction (shared with scripts/harvest-templates.mjs)
// ---------------------------------------------------------------------

export function expGlyphs(luma: Uint8Array, width: number, height: number, origin: Point): Bitmap[] {
  const band = clipRect(bandAt(origin, EXP.band), width, height);
  return band ? segmentGlyphs(luma, width, band, EXP.textPolarity).map((g) => g.bitmap) : [];
}

/** True when columns [x0, x1) are blank white field with the field's border lines intact above and below. */
function isFieldGap(luma: Uint8Array, width: number, origin: Point, band: Rect, x0: number, x1: number): boolean {
  const { top, bottom } = MESO.borderRows;
  // Skip the outer columns: anti-aliasing from the neighbouring digits can tint them.
  for (let x = x0 + 1; x < x1 - 1; x++) {
    for (let y = band.y; y < band.y + band.h; y++) if (luma[y * width + x] < MESO.paperLuma) return false;
    if (luma[(origin.y + top) * width + x] >= MESO.textPolarity.threshold) return false;
    if (luma[(origin.y + bottom) * width + x] >= MESO.textPolarity.threshold) return false;
  }
  return true;
}

/** Index of the first glyph belonging to the number: right of the nearest verified blank gap, else 0. */
function numberStart(luma: Uint8Array, width: number, origin: Point, band: Rect, glyphs: readonly Glyph[]): number {
  for (let i = glyphs.length - 1; i > 0; i--) {
    const gapStart = glyphs[i - 1].x + glyphs[i - 1].bitmap[0].length;
    const gapEnd = glyphs[i].x;
    if (gapEnd - gapStart >= MESO.fieldGap && isFieldGap(luma, width, origin, band, gapStart, gapEnd)) return i;
  }
  return 0;
}

/** The meso number's glyphs, with anything occluding the left of the field cut off. */
export function mesoGlyphs(luma: Uint8Array, width: number, height: number, origin: Point): Bitmap[] {
  const band = clipRect(bandAt(origin, MESO.band), width, height);
  if (!band) return [];
  const { top, bottom } = MESO.borderRows;
  if (origin.y + top < 0 || origin.y + bottom >= height) return [];

  const glyphs = segmentGlyphs(luma, width, band, MESO.textPolarity);
  return glyphs.slice(numberStart(luma, width, origin, band, glyphs)).map((g) => g.bitmap);
}

const TILE_MIN_FILL = 0.5;
const TILE_EDGE_MAX_FILL = 0.2;

/** Fraction of `box` whose luma sits in the orange range. */
function tileFill(luma: Uint8Array, width: number, box: Rect): number {
  let hits = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const v = luma[y * width + x];
      if (v >= LEVEL.tileLuma.min && v <= LEVEL.tileLuma.max) hits++;
    }
  }
  return hits / (box.w * box.h);
}

/** The cream digit shape inside each orange level tile, left to right. */
export function levelTiles(luma: Uint8Array, width: number, height: number, origin: Point): Bitmap[] {
  const { tile, tileScan } = LEVEL;
  const top = origin.y + tile.dy;
  if (top < 0 || top + tile.h > height) return [];

  const boxAt = (x: number): Rect => ({ x, y: top, w: tile.w, h: tile.h });
  const inBounds = (x: number) => x >= 0 && x + tile.w <= width;

  let first = -1;
  for (let offset = 0; offset < tileScan; offset++) {
    const x = origin.x + tile.dx + offset;
    if (!inBounds(x - 1) || !inBounds(x)) continue;
    const edge: Rect = { x: x - 1, y: top, w: 1, h: tile.h };
    if (tileFill(luma, width, boxAt(x)) >= TILE_MIN_FILL && tileFill(luma, width, edge) < TILE_EDGE_MAX_FILL) {
      first = x;
      break;
    }
  }
  if (first < 0) return [];

  const tiles: Bitmap[] = [];
  for (let i = 0; i < tile.maxTiles; i++) {
    const x = first + i * tile.pitch;
    if (!inBounds(x) || tileFill(luma, width, boxAt(x)) < TILE_MIN_FILL) break;
    tiles.push(extractBitmap(luma, width, boxAt(x), LEVEL.glyphPolarity));
  }
  return tiles;
}

// ---------------------------------------------------------------------
// Character plate (job + name): proportional text with word spaces
// ---------------------------------------------------------------------

export interface TextGlyph {
  readonly bitmap: Bitmap;
  /** Blank pixels between this glyph and the previous one (0 for the first). */
  readonly gapBefore: number;
}

export type TextLine = 'job' | 'name';

/** A line's glyphs left to right, each with the blank pixels before it. */
function glyphRun(luma: Uint8Array, width: number, band: Rect, polarity: Polarity): TextGlyph[] {
  let previousEnd: number | null = null;
  return segmentGlyphs(luma, width, band, polarity).map((glyph) => {
    const gapBefore = previousEnd === null ? 0 : glyph.x - previousEnd;
    previousEnd = glyph.x + glyph.bitmap[0].length;
    return { bitmap: glyph.bitmap, gapBefore };
  });
}

export function textGlyphs(luma: Uint8Array, width: number, height: number, origin: Point, line: TextLine): TextGlyph[] {
  const band = clipRect(bandAt(origin, CHARACTER[line]), width, height);
  return band ? glyphRun(luma, width, band, CHARACTER.polarity) : [];
}

/**
 * A bar is a capital I when it starts a word ("Ice", "(Ice") or sits among capitals ("ARIKADOU": the nearest
 * letters either side are capitals, or it ends the word after one), and a lowercase l anywhere else ("Bills", "Elle").
 */
export function resolveLookalikes(text: string): string {
  return text.replace(/(?<=[^\s(\[{'"-])I/g, (bar, offset: number, whole: string) => {
    const before = whole.slice(0, offset).replace(/I+$/, '').match(/[A-Za-z]$/)?.[0] ?? null;
    const after = whole.slice(offset + 1).replace(/^I+/, '').match(/^[A-Za-z]/)?.[0] ?? null;
    const amongCapitals = before !== null && /[A-Z]/.test(before) && (after === null || /[A-Z]/.test(after));
    return amongCapitals ? bar : 'l';
  });
}

/**
 * Map names, same bar ambiguity, plus roman numerals: a word made only of I, V and X
 * ("VIII") keeps its capital I's, where "Ellinia" needs lowercase l's.
 */
export function resolveMapLookalikes(text: string): string {
  return text
    .split(' ')
    .map((word) => (/^[IVX]+$/.test(word) ? word : resolveLookalikes(word)))
    .join(' ');
}

interface LineStyle {
  readonly spaceGap: number;
  readonly resolve: (text: string) => string;
}

const CHARACTER_STYLE: LineStyle = { spaceGap: CHARACTER.spaceGap, resolve: resolveLookalikes };
const MAP_STYLE: LineStyle = { spaceGap: MAP.spaceGap, resolve: resolveMapLookalikes };

/** The widest blank gap between the two halves of a letter this font draws in two pieces ("h", "b"). */
const MAX_SPLIT_GAP = 2;

/**
 * Joins a letter drawn as two separate pieces (a stem and its bowl or arch, split by the
 * stem's one-pixel shadow column) into one bitmap, keeping the blank column(s) between them.
 * Shared with scripts/harvest-templates.mjs, which learns the joined shape.
 */
export function joinGlyphs(left: TextGlyph, right: TextGlyph): Bitmap {
  const blank = '.'.repeat(right.gapBefore);
  return left.bitmap.map((row, y) => row + blank + right.bitmap[y]);
}

/** The character at glyphs[i], and how many glyphs it used: a joined pair if one is a known letter, else just glyphs[i]. */
function classifyAt(glyphs: readonly TextGlyph[], i: number, set: GlyphSet, tolerance: number): { token: string; used: number } {
  const next = glyphs[i + 1];
  if (next && next.gapBefore <= MAX_SPLIT_GAP) {
    const joined = classify(joinGlyphs(glyphs[i], next), set, tolerance);
    if (joined !== UNKNOWN) return { token: joined, used: 2 };
  }
  return { token: classify(glyphs[i].bitmap, set, tolerance), used: 1 };
}

function readLine(glyphs: readonly TextGlyph[], set: GlyphSet, style: LineStyle, tolerance: number): string | null {
  if (glyphs.length === 0) return null;
  let text = '';
  for (let i = 0; i < glyphs.length; ) {
    const { token, used } = classifyAt(glyphs, i, set, tolerance);
    if (token === UNKNOWN) return null;
    text += (glyphs[i].gapBefore >= style.spaceGap ? ' ' : '') + token;
    i += used;
  }
  return style.resolve(text);
}

/** The line's text, or null if it is empty or any glyph (or merged pair of letters) has no template yet. */
export function readTextLine(glyphs: readonly TextGlyph[], set: GlyphSet, tolerance = GLYPH_TOLERANCE): string | null {
  return readLine(glyphs, set, CHARACTER_STYLE, tolerance);
}

// ---------------------------------------------------------------------
// Minimap title (street + map name)
// ---------------------------------------------------------------------

export type MapLine = 'street' | 'map';

/** Where the panel's flat background ends along the blank row above the text (its right border). */
function panelEdge(luma: Uint8Array, width: number, height: number, origin: Point, startX: number): number {
  const y = origin.y + MAP.ruler.dy;
  if (y < 0 || y >= height) return startX;
  let x = startX;
  while (x < width && Math.abs(luma[y * width + x] - MAP.ruler.luma) <= MAP.ruler.tolerance) x++;
  return x;
}

export function mapGlyphs(luma: Uint8Array, width: number, height: number, origin: Point, line: MapLine): TextGlyph[] {
  const { dx, dy, h } = MAP[line];
  const x = origin.x + dx;
  const room = Math.min(MAP.maxWidth, panelEdge(luma, width, height, origin, x) - x);
  const band = clipRect({ x, y: origin.y + dy, w: room, h }, width, height);
  return band ? glyphRun(luma, width, band, MAP.polarity) : [];
}

/** One line of the minimap title, or null if it is empty or any glyph has no template yet. */
export function readMapLine(glyphs: readonly TextGlyph[], set: GlyphSet, tolerance = GLYPH_TOLERANCE): string | null {
  return readLine(glyphs, set, MAP_STYLE, tolerance);
}

/** 53-bit string hash (cyrb53): tiny, dependency-free, and stable across browsers and Node. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Identity of whatever is drawn on this line: a hash of its exact pixels.
 * The same character name always renders identically, so this identifies a
 * character even when we have no template for some of its letters.
 */
export function textFingerprint(glyphs: readonly TextGlyph[]): string | null {
  if (glyphs.length === 0) return null;
  return hash53(glyphs.map((g) => `${g.gapBefore}:${g.bitmap.join('/')}`).join('|')).toString(36);
}

// ---------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------

export interface ExpReading {
  /** The percentage inside the brackets, e.g. 2.7. Null when it could not be read with certainty. */
  readonly pct: number | null;
  /** Raw EXP points left of the bracket, e.g. 17691 from "17,691". Always an integer; null if unreadable. */
  readonly exp: number | null;
}

/** Classifies glyphs left to right and stops after the closing bracket, ignoring anything drawn beyond it. */
function classifyUntilBracket(glyphs: readonly Bitmap[], set: GlyphSet, tolerance: number): string {
  let text = '';
  for (const glyph of glyphs) {
    const char = classify(glyph, set, tolerance);
    text += char;
    if (char === ']') break;
  }
  return text;
}

/**
 * Raw EXP is a whole number. Any separator in it is a thousands separator
 * (never a decimal point), so both "17,691" and "17.691" mean 17691, and
 * groups must be exactly three digits.
 */
export function parseExpPoints(text: string): number | null {
  if (!/^\d{1,3}([,.]\d{3})*$/.test(text)) return null;
  const value = Number(text.replace(/[,.]/g, ''));
  return Number.isSafeInteger(value) ? value : null;
}

export function parseExp(text: string): ExpReading {
  const match = text.match(/^(.*?)\[(\d{1,3}\.\d{2})%\]$/);
  if (!match) return { pct: null, exp: null };
  return { pct: Number(match[2]), exp: parseExpPoints(match[1]) };
}

export function readExp(glyphs: readonly Bitmap[], set: GlyphSet, tolerance = GLYPH_TOLERANCE): ExpReading {
  return parseExp(classifyUntilBracket(glyphs, set, tolerance));
}

export function parseMeso(text: string): number | null {
  if (!/^\d{1,3}(,\d{3})*$/.test(text)) return null;
  const value = Number(text.replaceAll(',', ''));
  return Number.isSafeInteger(value) ? value : null;
}

export function readMeso(glyphs: readonly Bitmap[], set: GlyphSet, tolerance = GLYPH_TOLERANCE): number | null {
  if (glyphs.length === 0) return null;
  const text = glyphs.map((glyph) => classify(glyph, set, tolerance)).join('');
  return text.includes(UNKNOWN) ? null : parseMeso(text);
}

export function readLevel(tiles: readonly Bitmap[], set: GlyphSet, tolerance = GLYPH_TOLERANCE): number | null {
  if (tiles.length === 0) return null;
  const text = tiles.map((tile) => classify(tile, set, tolerance)).join('');
  if (text.includes(UNKNOWN)) return null;
  const level = Number(text);
  return level >= 1 && level <= 300 ? level : null;
}

