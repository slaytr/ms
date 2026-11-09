/**
 * Geometry of the MapleStory Classic client UI, measured from real 1368x800
 * window captures (title bar included). Every position is an offset from the
 * top-left of an anchor template (a tiny, distinctive label found by pixel
 * matching), so nothing depends on window size and the movable inventory is
 * tracked wherever the user puts it.
 *
 * If the client ever renders differently, re-measure with
 * scripts/probe-glyphs.mjs and re-run scripts/harvest-templates.mjs.
 */

import { dark, light } from './mask.ts';
import type { AnchorName, Rect } from './types.ts';

/** Rects (absolute, in the reference fixture) the anchor bitmaps are cut from. Tight ink bounds, padded by ANCHOR_PAD. */
export const ANCHOR_SOURCES = {
  exp: { rect: { x: 722, y: 766, w: 26, h: 14 }, polarity: light(120) },
  level: { rect: { x: 288, y: 770, w: 38, h: 22 }, polarity: light(170) },
  mesos: { rect: { x: 865, y: 447, w: 35, h: 12 }, polarity: light(215) },
  /** The "MINI MAP" title (dark on the panel's white title bar); the map name sits just below it. */
  minimap: { rect: { x: 5, y: 38, w: 60, h: 10 }, polarity: dark(128) },
} as const;

/** Rings of guaranteed-background pixels kept around each anchor so a bright blob can't match it. */
export const ANCHOR_PAD = 1;

/** Mismatching pixels tolerated when locating an anchor. */
export const ANCHOR_TOLERANCE = 2;

/** Mismatching pixels tolerated when classifying a glyph. */
export const GLYPH_TOLERANCE = 1;

/**
 * The client draws its UI at a fixed 1366x768 and scales it up to the window by height (a bilinear
 * upscale, so glyphs are no longer exact bitmaps). Frames from larger windows have the scaling undone
 * first (see view.ts). That recovers the native pixels to within 8-bit rounding, but at fractional
 * scales an occasional pixel lands on the wrong side of a threshold, so those frames get a little more
 * slack than native ones: 4 and 2 read every real capture we have, 2 and 1 (the native values) missed
 * the raw EXP in the 16:10 one.
 */
export const NATIVE = { width: 1366, height: 768 } as const;
export const SCALED_ANCHOR_TOLERANCE = 4;
export const SCALED_GLYPH_TOLERANCE = 2;

/**
 * Where the client area sits inside the captured frame: a windowed capture has a title bar and a 1px
 * border, a borderless/fullscreen one has neither. `top` is the title bar height, `border` the width
 * of the side and bottom edges. The reference fixtures (and so every position in this file) are the
 * windowed case; REFERENCE_CLIENT is where the client's own top-left was in them.
 */
export const WINDOW_FRAMES = [
  { top: 31, border: 1 },
  { top: 0, border: 0 },
  { top: 32, border: 0 },
  { top: 31, border: 0 },
] as const;
export const REFERENCE_CLIENT = { x: 1, y: 31 } as const;

/**
 * Where the anchors the view fit leans on sit in the native 1366x768 client of the reference fixtures
 * (a test checks these against a real frame). The status bar is centred, so on a wider or narrower
 * client they shift by half the difference in width.
 */
export const ANCHOR_HOME = {
  exp: { x: 722, y: 736 },
  level: { x: 295, y: 743 },
} as const;

/** exp/level live in the bottom status bar; only this many bottom rows are searched for them. */
export const STATUS_BAR_SEARCH_HEIGHT = 140;

export const EXP = {
  anchorPolarity: ANCHOR_SOURCES.exp.polarity,
  textPolarity: light(120),
  /** "17.691[2.70%]" starts here; reading stops at the closing bracket (the Cash Shop button borders the band). */
  band: { dx: 25, dy: 3, w: 116, h: 9 },
} as const;

export const LEVEL = {
  anchorPolarity: ANCHOR_SOURCES.level.polarity,
  /** Digits are cream glyphs inside orange tiles. */
  glyphPolarity: light(200),
  tile: { dx: 34, dy: 1, w: 11, h: 13, pitch: 12, maxTiles: 3 },
  /** Orange tile body luma range, used to tell a tile from empty status bar. */
  tileLuma: { min: 140, max: 199 },
  /** How far right of tile.dx the first tile may sit (single-digit levels may shift it). */
  tileScan: 28,
} as const;

export const MESO = {
  anchorPolarity: ANCHOR_SOURCES.mesos.polarity,
  /** Black digits on the white field, right-aligned, ending just left of the "MESOS" label. */
  textPolarity: dark(128),
  band: { dx: -147, dy: -2, w: 141, h: 12 },
  /**
   * The number is read right to left and stops at a gap of blank white field at
   * least this wide (real digits are never >2px apart). Everything left of such
   * a gap is other UI overlapping the field, and no digit can hide beyond it.
   */
  fieldGap: 6,
  /** The field's dark top/bottom border rows (offsets from the anchor's y); they must be intact across a gap. */
  borderRows: { top: -5, bottom: 10 },
  /** Luma at/above which a pixel counts as the field's white background. */
  paperLuma: 190,
} as const;

/**
 * The two-line character plate next to the level: job on top ("Wizard
 * (Ice,Lightning)"), name below ("PayYoBills"). One proportional pixel font,
 * with the same baseline offset on both lines so they share templates. The
 * band stops short of the status bar's vertical divider.
 */
export const CHARACTER = {
  polarity: light(140),
  job: { dx: 71, dy: -6, w: 126, h: 13 },
  name: { dx: 71, dy: 8, w: 126, h: 13 },
  /** A gap at least this wide (px) between glyphs is a word space; letters are 1-2px apart. */
  spaceGap: 4,
  /**
   * Letters this font draws with identical pixels: they share one template,
   * stored under the canonical character. Capital "I" and lowercase "l" are
   * the same vertical bar, so templates and labels use "I", and readTextLine
   * turns a bar back into "l" unless it starts a word.
   */
  lookalikes: { l: 'I' } as Readonly<Record<string, string>>,
} as const;

/**
 * The minimap panel's two-line title: the street ("Victoria Road") above the
 * map ("Tree Dungeon, Forest Up North VIII"). Bold white pixel font on the
 * panel's flat blue-grey, shared by both lines because their baselines sit the
 * same distance below each band's top. Offsets are from the "MINI MAP" anchor.
 * The panel is as wide as its longest line, so the bands stop at its right edge
 * instead of running into the game scene.
 */
export const MAP = {
  /** Strokes are ~250 but their anti-aliased curves are 190-230; the panel is a flat 179, so 188 keeps curves joined. */
  polarity: light(188),
  street: { dx: 44, dy: 18, h: 14 },
  map: { dx: 44, dy: 32, h: 14 },
  /** Never read further right than this, even if the panel edge can't be found. */
  maxWidth: 360,
  /** A blank row above the first line, used to find where the panel's flat background ends. */
  ruler: { dy: 19, luma: 179, tolerance: 10 },
  /**
   * A gap at least this wide (px) between glyphs is a word space. Letters are 1px apart (2px
   * beside "<" and ">"), but a space after an overhanging letter ("f", "y") can be as narrow as 3.
   */
  spaceGap: 3,
} as const;

/** The minimap sits in the top-left of the game window, so only that corner is searched. */
const MINIMAP_SEARCH = { w: 600, h: 300 } as const;

export const SEARCH: Readonly<Record<AnchorName, (width: number, height: number) => Rect>> = {
  minimap: () => ({ x: 0, y: 0, ...MINIMAP_SEARCH }),
  exp: (width, height) => ({ x: 0, y: height - STATUS_BAR_SEARCH_HEIGHT, w: width, h: STATUS_BAR_SEARCH_HEIGHT }),
  level: (width, height) => ({ x: 0, y: height - STATUS_BAR_SEARCH_HEIGHT, w: width, h: STATUS_BAR_SEARCH_HEIGHT }),
  mesos: (width, height) => ({ x: 0, y: 0, w: width, h: height }),
};
