import type { Bitmap, GlyphSet } from './types.ts';

/**
 * Hand-drawn candidates for the level digits nobody has harvested yet (only 8 now), so a level like 68
 * can read. Same idea as draft-glyphs.ts and draft-map-glyphs.ts, and the same rules:
 *
 *  - NOT measured from the game. Drawn in the style of the real tiles (a 7-wide, 7-tall digit centred in the
 *    11 x 13 tile cell, strokes 2px thick), with a few variants because one pixel can differ from what the
 *    game draws. Matching tolerates one wrong pixel.
 *  - A harvested digit always wins (see `withDrafts`): labelling a real frame with that digit in its level
 *    replaces the guess, and a wrong draft simply never matches.
 *  - draft-level-glyphs.test.ts rejects any draft within matching range of a different digit.
 *
 * If the 8 never reads in practice, harvest a real frame at a level containing it; don't tweak the draft.
 *
 * Track record: 2, 6 and 7 were drafted the same way and later harvested. The drafts for 2 and 6 matched the
 * real tiles exactly (they had been fitted against a scaled-up screenshot first), the 7 was 2px off, which
 * is outside the tolerance, so it would not have read. Treat a draft as a good bet, not a measurement.
 */

/** The digit's 7 ink rows, centred in the 11 x 13 level tile cell (3 blank rows above and below, 2 blank columns each side). */
function tile(rows: readonly string[]): Bitmap {
  const blank = '.'.repeat(11);
  const pad = (row: string) => `..${row}..`;
  return [blank, blank, blank, ...rows.map(pad), blank, blank, blank];
}

export const DRAFT_LEVEL_GLYPHS: GlyphSet = {
  '8': [
    tile(['.#####.', '##...##', '##...##', '.#####.', '##...##', '##...##', '.#####.']),
    tile(['.#####.', '##...##', '##...##', '..###..', '##...##', '##...##', '.#####.']),
  ],
};
