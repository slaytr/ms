import type { Bitmap, GlyphSet } from './types.ts';

/** Marks a glyph that matched no known character. Never a valid output character. */
export const UNKNOWN = '?';

export function bitmapDistance(a: Bitmap, b: Bitmap): number {
  if (a.length !== b.length || (a[0]?.length ?? 0) !== (b[0]?.length ?? 0)) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let y = 0; y < a.length; y++) {
    for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) distance++;
  }
  return distance;
}

/**
 * The character whose template is closest to `bitmap`, or UNKNOWN. Refuses to
 * guess when two different characters tie, since a confident wrong digit is
 * worse than a missing reading.
 */
export function classify(bitmap: Bitmap, glyphs: GlyphSet, tolerance = 0): string {
  let best = { char: UNKNOWN, distance: Number.POSITIVE_INFINITY };
  let tied = false;
  for (const [char, variants] of Object.entries(glyphs)) {
    for (const template of variants) {
      const distance = bitmapDistance(bitmap, template);
      if (distance < best.distance) {
        best = { char, distance };
        tied = false;
      } else if (distance === best.distance && char !== best.char) {
        tied = true;
      }
    }
  }
  return best.distance <= tolerance && !tied ? best.char : UNKNOWN;
}
