import type { Bitmap, GlyphSet } from './types.ts';

/**
 * Hand-drawn candidates for the level digits nobody has harvested yet (2, 6, 7 and 8), so a level
 * like 62 can read. Same idea as draft-glyphs.ts and draft-map-glyphs.ts, and the same rules:
 *
 *  - NOT measured from the game. Each is drawn in the style of the real tiles (a 7-wide, 7-tall digit
 *    centred in the 11 x 13 tile cell, strokes 2px thick), with a few variants per digit because one
 *    pixel can differ from what the game draws. Matching tolerates one wrong pixel.
 *  - A harvested digit always wins (see `withDrafts`): labelling a real frame with that digit in its
 *    level replaces the guess, and a wrong draft simply never matches.
 *  - draft-level-glyphs.test.ts rejects any draft within matching range of a different digit.
 *
 * If one of these never reads in practice, harvest a real frame at a level containing it; don't tweak the draft.
 *
 * 6 and 2 were checked against a scaled-up screenshot of a level 62 character (not native size, so it can't be
 * harvested). Each variant was drawn at the screenshot's scale, blurred, and compared with the pixels: the first
 * variant of each fitted clearly best (a squared error a fifth to a third lower than the others), and letting single
 * pixels flip only chased compression noise, so the shapes stayed as drawn. That is evidence, not a measurement.
 */

/** The digit's 7 ink rows, centred in the 11 x 13 level tile cell (3 blank rows above and below, 2 blank columns each side). */
function tile(rows: readonly string[]): Bitmap {
  const blank = '.'.repeat(11);
  const pad = (row: string) => `..${row}..`;
  return [blank, blank, blank, ...rows.map(pad), blank, blank, blank];
}

export const DRAFT_LEVEL_GLYPHS: GlyphSet = {
  '2': [
    tile(['.#####.', '##...##', '.....##', '..####.', '.##....', '##.....', '#######']),
    tile(['.#####.', '##...##', '.....##', '...###.', '..##...', '.##....', '#######']),
    tile(['.#####.', '##...##', '.....##', '....##.', '..##...', '##.....', '#######']),
  ],
  '6': [
    tile(['.#####.', '##...##', '##.....', '######.', '##...##', '##...##', '.#####.']),
    tile(['..####.', '.##....', '##.....', '######.', '##...##', '##...##', '.#####.']),
    tile(['.#####.', '##.....', '##.....', '######.', '##...##', '##...##', '.#####.']),
  ],
  '7': [
    tile(['#######', '.....##', '....##.', '...##..', '..##...', '..##...', '..##...']),
    tile(['#######', '##...##', '.....##', '....##.', '...##..', '...##..', '...##..']),
    tile(['#######', '.....##', '....##.', '....##.', '...##..', '...##..', '...##..']),
  ],
  '8': [
    tile(['.#####.', '##...##', '##...##', '.#####.', '##...##', '##...##', '.#####.']),
    tile(['.#####.', '##...##', '##...##', '..###..', '##...##', '##...##', '.#####.']),
  ],
};
