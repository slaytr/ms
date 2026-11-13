import { describe, expect, it } from 'vitest';

import { DRAFT_TEXT_GLYPHS, withDrafts } from './draft-glyphs.ts';
import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { GLYPH_TOLERANCE } from './layout.ts';
import { bitmapDistance, classify } from './glyph.ts';
import { parseTemplates } from './templates.ts';
import raw from './templates.json';
import type { Bitmap } from './types.ts';

const HARVESTED = parseTemplates(raw).fonts.text;

const variants = (set: Readonly<Record<string, readonly Bitmap[]>>) =>
  Object.entries(set).flatMap(([char, list]) => list.map((bitmap, index) => ({ char, index, bitmap })));

/** The drafts the shipped templates still use: once a letter is harvested its draft is dropped, so it is no longer read. */
const STILL_DRAFTED: Readonly<Record<string, readonly Bitmap[]>> = Object.fromEntries(
  Object.entries(DRAFT_TEXT_GLYPHS).filter(([char]) => !(char in HARVESTED)),
);

describe('draft text glyphs', () => {
  it('are well-formed cells the segmenter could produce', () => {
    for (const { char, index, bitmap } of variants(DRAFT_TEXT_GLYPHS)) {
      const label = `${char}#${index}`;
      expect(bitmap.length, label).toBe(13);
      const width = bitmap[0].length;
      expect(bitmap.every((row) => row.length === width && /^[#.]+$/.test(row)), label).toBe(true);
      // Glyphs are cut at the ink's left and right edges, so both edge columns must hold ink.
      expect(bitmap.some((row) => row[0] === '#'), `${label} left edge`).toBe(true);
      expect(bitmap.some((row) => row[width - 1] === '#'), `${label} right edge`).toBe(true);
    }
  });

  it('never read as a different letter, even one pixel off', () => {
    // Matching tolerates GLYPH_TOLERANCE wrong pixels. Two templates for different letters closer than
    // twice that can both be within reach of one real glyph, and the wrong one may win. Pairs of
    // harvested glyphs are real and not ours to judge (I and i are 1px apart in the game's font).
    const drafted = variants(DRAFT_TEXT_GLYPHS);
    const all = variants({ ...DRAFT_TEXT_GLYPHS, ...HARVESTED });
    const clashes: string[] = [];
    for (const a of drafted) {
      for (const b of all) {
        if (a.char === b.char) continue;
        if (b.char in DRAFT_TEXT_GLYPHS && a.char > b.char) continue;
        const distance = bitmapDistance(a.bitmap, b.bitmap);
        if (distance <= 2 * GLYPH_TOLERANCE) clashes.push(`${a.char}#${a.index} vs ${b.char}#${b.index}: ${distance}px apart`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('read back as themselves', () => {
    for (const { char, bitmap } of variants(STILL_DRAFTED)) {
      expect(classify(bitmap, withDrafts(HARVESTED), GLYPH_TOLERANCE)).toBe(char);
    }
  });

  it('read with one wrong pixel', () => {
    const set = withDrafts(HARVESTED);
    for (const { char, bitmap } of variants(STILL_DRAFTED)) {
      const flipped = bitmap.map((row, y) => (y === 5 ? (row[0] === '#' ? '.' : '#') + row.slice(1) : row));
      expect(classify(flipped, set, GLYPH_TOLERANCE), `${char} with a flipped pixel`).toBe(char);
    }
  });

  it('never replace a harvested glyph', () => {
    const merged = withDrafts(HARVESTED, { P: [DRAFT_TEXT_GLYPHS.O[0]], Q: DRAFT_TEXT_GLYPHS.Q });
    expect(merged.P).toBe(HARVESTED.P);
    expect(merged.Q).toBe(DRAFT_TEXT_GLYPHS.Q);
  });

  it('are what the shipped templates use for letters nobody has harvested', () => {
    const [drafted] = Object.keys(STILL_DRAFTED);
    expect(DEFAULT_TEMPLATES.fonts.text[drafted]).toEqual(DRAFT_TEXT_GLYPHS[drafted]);
    expect(DEFAULT_TEMPLATES.fonts.text.P).toEqual(HARVESTED.P);
  });
});
