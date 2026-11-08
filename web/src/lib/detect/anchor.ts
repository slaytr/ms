import { clipRect, isOn } from './mask.ts';
import type { Bitmap, Point, Polarity, Rect } from './types.ts';

interface Probe {
  readonly dx: number;
  readonly dy: number;
}

interface CompiledAnchor {
  readonly width: number;
  readonly height: number;
  /** Foreground first: they are sparse, so a wrong position is rejected within a few probes. */
  readonly ink: readonly Probe[];
  readonly paper: readonly Probe[];
}

const compiled = new WeakMap<Bitmap, CompiledAnchor>();

function compile(bitmap: Bitmap): CompiledAnchor {
  const cached = compiled.get(bitmap);
  if (cached) return cached;

  const ink: Probe[] = [];
  const paper: Probe[] = [];
  bitmap.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) (row[dx] === '#' ? ink : paper).push({ dx, dy });
  });
  const result = { width: bitmap[0]?.length ?? 0, height: bitmap.length, ink, paper };
  compiled.set(bitmap, result);
  return result;
}

/** Mismatching probes allowed for a position to still count as a match. */
export interface AnchorOptions {
  readonly polarity: Polarity;
  readonly tolerance: number;
}

function matchesAt(
  luma: Uint8Array,
  width: number,
  anchor: CompiledAnchor,
  x: number,
  y: number,
  { polarity, tolerance }: AnchorOptions,
): boolean {
  let misses = 0;
  for (const { dx, dy } of anchor.ink) {
    if (!isOn(luma[(y + dy) * width + x + dx], polarity) && ++misses > tolerance) return false;
  }
  for (const { dx, dy } of anchor.paper) {
    if (isOn(luma[(y + dy) * width + x + dx], polarity) && ++misses > tolerance) return false;
  }
  return true;
}

/**
 * Finds the top-left of `bitmap` inside `search`. Checks `hint` first (the
 * previous tick's position), so the steady state costs one comparison and the
 * full scan only runs when the thing has moved or appeared.
 */
export function findAnchor(
  luma: Uint8Array,
  width: number,
  height: number,
  bitmap: Bitmap,
  search: Rect,
  options: AnchorOptions,
  hint?: Point | null,
): Point | null {
  const anchor = compile(bitmap);
  if (anchor.width === 0) return null;

  const fits = (x: number, y: number) => x >= 0 && y >= 0 && x + anchor.width <= width && y + anchor.height <= height;
  if (hint && fits(hint.x, hint.y) && matchesAt(luma, width, anchor, hint.x, hint.y, options)) return hint;

  const area = clipRect(search, width, height);
  if (!area) return null;
  const lastX = area.x + area.w - anchor.width;
  const lastY = area.y + area.h - anchor.height;
  for (let y = area.y; y <= lastY; y++) {
    for (let x = area.x; x <= lastX; x++) {
      if (matchesAt(luma, width, anchor, x, y, options)) return { x, y };
    }
  }
  return null;
}
