/**
 * Frames from windows taller than the client's native 768 rows come back with the whole UI scaled up,
 * so exact-pixel templates stop matching. This works out how the native client maps into the captured
 * frame (a `View`) and undoes the scaling.
 *
 * The client scales its fixed-size UI with a plain bilinear upscale, to a size set by the window alone
 * (scale = client height / 768, client = frame minus title bar and borders). A separable bilinear
 * upscale can be inverted: the native pixels are the least-squares solution of a tridiagonal system
 * along each axis, which recovers the original glyph bitmaps (to within 8-bit rounding) so the exact
 * templates still apply. Sampling the frame instead (nearest or bilinear) only ever gets a blurred copy.
 *
 * Fitting is therefore a choice between a few layouts: which window decorations the capture has, and
 * how many native columns the client rounded its width to. The right one is whichever inverts to a
 * frame where the status-bar anchors match.
 */

import { ANCHOR_HOME, ANCHOR_SOURCES, NATIVE, WINDOW_FRAMES } from './layout.ts';
import type { Bitmap, Polarity, Rect, Templates } from './types.ts';

/** How the native client sits in the captured frame: its rectangle there, and the native size it was scaled from. */
export interface View {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** The client rectangle inside the frame (the frame minus title bar and borders). */
  readonly left: number;
  readonly top: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  /** Native client size: always NATIVE.height tall, as wide as the window's aspect ratio leaves. */
  readonly width: number;
  readonly height: number;
}

/** A fit worse than this many mismatching anchor pixels (of ~630) is not a real fit; right layouts score ~0, wrong ones 50+. */
const MAX_FIT_MISS = 20;
/** Frames this close to native size are not scaled; the plain detector handles them. */
const MIN_SCALE = 1.03;
const MAX_SCALE = 4;
/** Native pixels solved beyond the wanted region, so the free edges of a partial solve stay out of it. */
const SOLVE_MARGIN = 8;
/** Keeps the normal equations well-posed at the edges of a partial solve (negligible against the data). */
const RIDGE = 1e-6;

/** Longest bottom margin (shadow, border) tried below a client whose title bar was found in the frame. */
const MAX_BOTTOM_MARGIN = 24;
/** A title bar is a flat band at least this tall, much taller than any line of game art. */
const TITLE_BAR_MIN_ROWS = 16;
/** Only the top of the frame is searched for the title bar. */
const TITLE_BAR_SEARCH_ROWS = 120;

const FIT_ANCHORS = ['exp', 'level'] as const;

// ---------------------------------------------------------------------
// Inverting the upscale, one axis at a time
// ---------------------------------------------------------------------

/**
 * One axis of the upscale: `size` native pixels stretched over `extent` frame pixels. Frame pixel k's
 * centre lands at native coordinate p = (k + 0.5) / scale - 0.5 and takes the blend of native pixels
 * floor(p) and floor(p) + 1 (edge pixels extend outwards).
 */
class Axis {
  readonly size: number;
  readonly extent: number;
  readonly first: Int32Array;
  readonly weight: Float64Array;

  constructor(size: number, extent: number) {
    this.size = size;
    this.extent = extent;
    const scale = extent / size;
    this.first = new Int32Array(extent);
    this.weight = new Float64Array(extent);
    for (let k = 0; k < extent; k++) {
      const p = Math.min(Math.max((k + 0.5) / scale - 0.5, 0), size - 1);
      const i = Math.min(Math.floor(p), size - 2);
      this.first[k] = i;
      this.weight[k] = p - i;
    }
  }

  /** First and last+1 frame pixel whose value depends on native pixels [n0, n1). */
  footprint(n0: number, n1: number): readonly [number, number] {
    let k0 = 0;
    while (k0 < this.extent && this.first[k0] + 1 < n0) k0++;
    let k1 = this.extent;
    while (k1 > k0 && this.first[k1 - 1] >= n1) k1--;
    return [k0, k1];
  }
}

/**
 * Least-squares solver for the native pixels [n0, n1) of one line, given the frame pixels [k0, k1) that
 * were bilinearly upscaled from them. The normal equations of a bilinear upscale are tridiagonal, so the
 * factorisation is built once per (axis, window) and reused for every line.
 */
class LineSolver {
  readonly count: number;
  private readonly axis: Axis;
  private readonly n0: number;
  private readonly k0: number;
  private readonly k1: number;
  private readonly sub: Float64Array;
  private readonly upper: Float64Array;
  private readonly pivot: Float64Array;
  private readonly rhs: Float64Array;
  private readonly forward: Float64Array;

  constructor(axis: Axis, n0: number, n1: number, k0: number, k1: number) {
    this.axis = axis;
    this.n0 = n0;
    this.k0 = k0;
    this.k1 = k1;
    this.count = n1 - n0;
    const diagonal = new Float64Array(this.count).fill(RIDGE);
    this.sub = new Float64Array(Math.max(this.count - 1, 0));
    for (let k = k0; k < k1; k++) {
      const j = axis.first[k] - n0;
      const w1 = axis.weight[k];
      const w0 = 1 - w1;
      if (j >= 0 && j < this.count) diagonal[j] += w0 * w0;
      if (j + 1 >= 0 && j + 1 < this.count) diagonal[j + 1] += w1 * w1;
      if (j >= 0 && j + 1 < this.count) this.sub[j] += w0 * w1;
    }
    // Thomas algorithm, forward sweep: pivots and scaled upper diagonal.
    this.pivot = new Float64Array(this.count);
    this.upper = new Float64Array(Math.max(this.count - 1, 0));
    this.pivot[0] = diagonal[0];
    for (let i = 1; i < this.count; i++) {
      this.upper[i - 1] = this.sub[i - 1] / this.pivot[i - 1];
      this.pivot[i] = diagonal[i] - this.sub[i - 1] * this.upper[i - 1];
    }
    this.rhs = new Float64Array(this.count);
    this.forward = new Float64Array(this.count);
  }

  /** Solves one line. Frame pixel k's value is `data[base + (k - k0) * stride]`; native pixel i goes to `out[outBase + (i - n0) * outStride]`. */
  solve(data: ArrayLike<number>, base: number, stride: number, out: Float32Array, outBase: number, outStride: number): void {
    const { axis, n0, count, rhs, forward, sub, upper, pivot } = this;
    rhs.fill(0);
    for (let k = this.k0; k < this.k1; k++) {
      const j = axis.first[k] - n0;
      const w1 = axis.weight[k];
      const value = data[base + (k - this.k0) * stride];
      if (j >= 0 && j < count) rhs[j] += (1 - w1) * value;
      if (j + 1 >= 0 && j + 1 < count) rhs[j + 1] += w1 * value;
    }
    forward[0] = rhs[0] / pivot[0];
    for (let i = 1; i < count; i++) forward[i] = (rhs[i] - sub[i - 1] * forward[i - 1]) / pivot[i];
    let next = forward[count - 1];
    out[outBase + (count - 1) * outStride] = next;
    for (let i = count - 2; i >= 0; i--) {
      next = forward[i] - upper[i] * next;
      out[outBase + i * outStride] = next;
    }
  }
}

/**
 * The native pixels of `region` (native client coordinates, clipped to the client) recovered from the
 * frame, one luma byte each. Solves a little beyond the region and crops, so partial regions are as
 * exact as the whole.
 */
export function unscaleRegion(luma: Uint8Array, width: number, view: View, region: Rect): { rect: Rect; pixels: Uint8Array } | null {
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const x1 = Math.min(view.width, region.x + region.w);
  const y1 = Math.min(view.height, region.y + region.h);
  if (x1 <= x0 || y1 <= y0) return null;

  const wx0 = Math.max(0, x0 - SOLVE_MARGIN);
  const wx1 = Math.min(view.width, x1 + SOLVE_MARGIN);
  const wy0 = Math.max(0, y0 - SOLVE_MARGIN);
  const wy1 = Math.min(view.height, y1 + SOLVE_MARGIN);

  const horizontal = new Axis(view.width, view.clientWidth);
  const vertical = new Axis(view.height, view.clientHeight);
  const [kx0, kx1] = horizontal.footprint(wx0, wx1);
  const [ky0, ky1] = vertical.footprint(wy0, wy1);
  const cols = wx1 - wx0;
  const rows = wy1 - wy0;

  // Horizontal pass: every frame row that feeds the window, reduced to native columns.
  const across = new LineSolver(horizontal, wx0, wx1, kx0, kx1);
  const between = new Float32Array((ky1 - ky0) * cols);
  for (let ky = ky0; ky < ky1; ky++) {
    const rowStart = (view.top + ky) * width + view.left + kx0;
    across.solve(luma, rowStart, 1, between, (ky - ky0) * cols, 1);
  }

  // Vertical pass: each native column, reduced to native rows.
  const down = new LineSolver(vertical, wy0, wy1, ky0, ky1);
  const solved = new Float32Array(rows * cols);
  for (let i = 0; i < cols; i++) down.solve(between, i, cols, solved, i, cols);

  const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const pixels = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const v = solved[(y0 - wy0 + y) * cols + (x0 - wx0 + x)];
      pixels[y * rect.w + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return { rect, pixels };
}

/** The whole native client recovered from the frame (one luma byte per pixel, view.width by view.height). */
export function unscaleView(luma: Uint8Array, width: number, view: View): Uint8Array {
  const whole = unscaleRegion(luma, width, view, { x: 0, y: 0, w: view.width, h: view.height });
  return whole?.pixels ?? new Uint8Array(view.width * view.height);
}

// ---------------------------------------------------------------------
// Fitting
// ---------------------------------------------------------------------

interface FitAnchor {
  readonly bitmap: Bitmap;
  readonly polarity: Polarity;
  /** Where the anchor sits in native client coordinates when the client is exactly 1366 wide. */
  readonly home: { readonly x: number; readonly y: number };
}

/** Least mismatching pixels of `anchor` among the native positions near where it should be in `pixels` (a native-coordinate crop). */
function anchorMisses(pixels: Uint8Array, rect: Rect, anchor: FitAnchor, centreShift: number): number {
  const { bitmap, polarity } = anchor;
  const height = bitmap.length;
  const width = bitmap[0].length;
  let best = Number.POSITIVE_INFINITY;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const px = Math.round(anchor.home.x + centreShift) + dx - rect.x;
      const py = anchor.home.y + dy - rect.y;
      if (px < 0 || py < 0 || px + width > rect.w || py + height > rect.h) continue;
      let misses = 0;
      for (let y = 0; y < height && misses < best; y++) {
        for (let x = 0; x < width; x++) {
          const v = pixels[(py + y) * rect.w + px + x];
          const on = polarity.light ? v > polarity.threshold : v < polarity.threshold;
          if (on !== (bitmap[y][x] === '#')) misses++;
        }
      }
      if (misses < best) best = misses;
    }
  }
  return best;
}

interface Fit {
  readonly misses: number;
  readonly view: View;
}

/** How well `view` explains the status bar: unscale just the strip around the two anchors and count mismatches. */
function fitMisses(luma: Uint8Array, width: number, view: View, anchors: readonly FitAnchor[]): number {
  const centreShift = view.width / 2 - NATIVE.width / 2;
  const xs = anchors.map((a) => a.home.x + centreShift);
  const strip = {
    x: Math.floor(Math.min(...xs)) - 6,
    y: Math.min(...anchors.map((a) => a.home.y)) - 6,
    w: Math.ceil(Math.max(...xs)) - Math.floor(Math.min(...xs)) + 70,
    h: NATIVE.height,
  };
  const solved = unscaleRegion(luma, width, view, strip);
  if (!solved) return Number.POSITIVE_INFINITY;
  return anchors.reduce((sum, anchor) => sum + anchorMisses(solved.pixels, solved.rect, anchor, centreShift), 0);
}

/**
 * The title bar of a window capture: the flat band of one colour that sits above the client, found down the
 * middle of the frame. Its left and right ends are the client's edges and its bottom is the client's top.
 * Null when the frame has no such band.
 */
export function findTitleBar(luma: Uint8Array, width: number, height: number): { left: number; top: number; width: number } | null {
  const mid = width >> 1;
  const at = (x: number, y: number) => luma[y * width + x];
  const limit = Math.min(height, TITLE_BAR_SEARCH_ROWS);
  let runStart = 0;
  let found: { start: number; end: number } | null = null;
  for (let y = 1; y <= limit; y++) {
    if (y < limit && at(mid, y) === at(mid, y - 1)) continue;
    if (y - runStart >= TITLE_BAR_MIN_ROWS && !found) found = { start: runStart, end: y };
    runStart = y;
  }
  if (!found) return null;
  // A row just above the band's bottom clears the title text, the window buttons and the rounded top corners.
  const y = found.end - 3;
  const colour = at(mid, y);
  let left = mid;
  while (left > 0 && at(left - 1, y) === colour) left--;
  let right = mid;
  while (right < width - 1 && at(right + 1, y) === colour) right++;
  return { left, top: found.end, width: right - left + 1 };
}

/**
 * Works out how a frame from a window taller than native maps onto the native client, or null if it
 * doesn't look like the Classic client at any known scale (or the status bar isn't visible to fit against).
 */
export function fitView(luma: Uint8Array, width: number, height: number, templates: Templates): View | null {
  const anchors = FIT_ANCHORS.flatMap((name) => {
    const bitmap = templates.anchors[name];
    return bitmap ? [{ bitmap, polarity: ANCHOR_SOURCES[name].polarity, home: ANCHOR_HOME[name] }] : [];
  });
  if (anchors.length < FIT_ANCHORS.length) return null;

  let best: Fit | null = null;
  const tryClient = (left: number, top: number, clientWidth: number, clientHeight: number) => {
    const scale = clientHeight / NATIVE.height;
    if (clientWidth <= 0 || scale < MIN_SCALE || scale > MAX_SCALE) return;
    // The native width is whatever the window's aspect ratio leaves, rounded by the client; try the neighbours.
    const exact = clientWidth / scale;
    const widths = new Set([Math.floor(exact) - 1, Math.floor(exact), Math.ceil(exact), Math.ceil(exact) + 1]);
    for (const nativeWidth of widths) {
      const view: View = { sourceWidth: width, sourceHeight: height, left, top, clientWidth, clientHeight, width: nativeWidth, height: NATIVE.height };
      const misses = fitMisses(luma, width, view, anchors);
      if (best === null || misses < best.misses) best = { misses, view };
    }
  };

  for (const { top, border } of WINDOW_FRAMES) tryClient(border, top, width - 2 * border, height - top - border);
  if (best !== null && (best as Fit).misses <= MAX_FIT_MISS) return (best as Fit).view;

  // Not a frame we know: the capture may include margins (a window shadow, display scaling), so find the
  // client from the title bar's flat band and try each bottom margin.
  const bar = findTitleBar(luma, width, height);
  if (bar) for (let bottom = 0; bottom <= MAX_BOTTOM_MARGIN; bottom++) tryClient(bar.left, bar.top, bar.width, height - bar.top - bottom);
  return best !== null && (best as Fit).misses <= MAX_FIT_MISS ? (best as Fit).view : null;
}

/** True when `view` was fitted to frames of this size (a resized window needs a new fit). */
export const viewFits = (view: View, width: number, height: number): boolean =>
  view.sourceWidth === width && view.sourceHeight === height;
