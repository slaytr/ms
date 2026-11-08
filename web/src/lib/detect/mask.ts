import type { Bitmap, Frame, Polarity, Rect } from './types.ts';

export const light = (threshold: number): Polarity => ({ light: true, threshold });
export const dark = (threshold: number): Polarity => ({ light: false, threshold });

export const isOn = (value: number, polarity: Polarity): boolean =>
  polarity.light ? value > polarity.threshold : value < polarity.threshold;

/** One luma byte per pixel (integer approximation of 0.299R + 0.587G + 0.114B). */
export function toLuma(frame: Frame): Uint8Array {
  const out = new Uint8Array(frame.width * frame.height);
  const d = frame.data;
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
  }
  return out;
}

/** The rect clipped to a width x height image, or null if nothing is left. */
export function clipRect(rect: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const w = Math.min(width, rect.x + rect.w) - x;
  const h = Math.min(height, rect.y + rect.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

export function extractBitmap(luma: Uint8Array, width: number, rect: Rect, polarity: Polarity): Bitmap {
  const rows: string[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    let row = '';
    for (let x = rect.x; x < rect.x + rect.w; x++) row += isOn(luma[y * width + x], polarity) ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

export interface Glyph {
  /** Absolute x of the glyph's first column. */
  readonly x: number;
  readonly bitmap: Bitmap;
}

/**
 * Splits `rect` into glyphs at fully-empty pixel columns. Every glyph spans
 * the full rect height, so vertical position (baseline) is part of its shape.
 */
export function segmentGlyphs(luma: Uint8Array, width: number, rect: Rect, polarity: Polarity): Glyph[] {
  const bitmap = extractBitmap(luma, width, rect, polarity);
  const columnHasInk = (col: number) => bitmap.some((row) => row[col] === '#');

  const glyphs: Glyph[] = [];
  let start = -1;
  for (let col = 0; col <= rect.w; col++) {
    const ink = col < rect.w && columnHasInk(col);
    if (ink && start < 0) start = col;
    if (!ink && start >= 0) {
      glyphs.push({ x: rect.x + start, bitmap: bitmap.map((row) => row.slice(start, col)) });
      start = -1;
    }
  }
  return glyphs;
}

/** Tight bounding box of foreground pixels inside `rect`, or null if there are none. */
export function inkBounds(luma: Uint8Array, width: number, rect: Rect, polarity: Polarity): Rect | null {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -1, -1];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (!isOn(luma[y * width + x], polarity)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
