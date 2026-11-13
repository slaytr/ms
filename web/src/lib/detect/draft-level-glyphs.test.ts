import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { withDrafts } from './draft-glyphs.ts';
import { DRAFT_LEVEL_GLYPHS } from './draft-level-glyphs.ts';
import { bitmapDistance, classify } from './glyph.ts';
import { GLYPH_TOLERANCE } from './layout.ts';
import raw from './templates.json';
import { parseTemplates } from './templates.ts';
import type { Bitmap } from './types.ts';

const HARVESTED = parseTemplates(raw).fonts.level;

const variants = (set: Readonly<Record<string, readonly Bitmap[]>>) =>
  Object.entries(set).flatMap(([char, list]) => list.map((bitmap, index) => ({ char, index, bitmap })));

describe('draft level glyphs', () => {
  it('are 11 x 13 tiles like the harvested digits', () => {
    const real = HARVESTED['0'][0];
    for (const { char, index, bitmap } of variants(DRAFT_LEVEL_GLYPHS)) {
      expect(bitmap.length, `${char}#${index}`).toBe(real.length);
      expect(bitmap.every((row) => row.length === real[0].length && /^[#.]+$/.test(row)), `${char}#${index}`).toBe(true);
    }
  });

  it('only draw digits no real frame has taught us yet', () => {
    for (const char of Object.keys(DRAFT_LEVEL_GLYPHS)) expect(char in HARVESTED, char).toBe(false);
  });

  it('never read as a different digit, even one pixel off', () => {
    // Matching tolerates GLYPH_TOLERANCE wrong pixels, so two digits closer than twice that could both be
    // within reach of one real tile and the wrong one might win.
    const drafted = variants(DRAFT_LEVEL_GLYPHS);
    const all = variants({ ...DRAFT_LEVEL_GLYPHS, ...HARVESTED });
    const clashes: string[] = [];
    for (const a of drafted) {
      for (const b of all) {
        if (a.char === b.char) continue;
        if (b.char in DRAFT_LEVEL_GLYPHS && a.char > b.char) continue;
        const distance = bitmapDistance(a.bitmap, b.bitmap);
        if (distance <= 2 * GLYPH_TOLERANCE) clashes.push(`${a.char}#${a.index} vs ${b.char}#${b.index}: ${distance}px apart`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('read back as themselves, also with one wrong pixel', () => {
    const set = withDrafts(HARVESTED, DRAFT_LEVEL_GLYPHS);
    for (const { char, bitmap } of variants(DRAFT_LEVEL_GLYPHS)) {
      expect(classify(bitmap, set, GLYPH_TOLERANCE)).toBe(char);
      const flipped = bitmap.map((row, y) => (y === 5 ? (row[2] === '#' ? '.' : '#') + row.slice(1) : row));
      expect(classify(flipped, set, GLYPH_TOLERANCE), `${char} with a flipped pixel`).toBe(char);
    }
  });

  it('are part of the shipped templates, with real digits kept as they are', () => {
    for (const char of ['2', '6', '7', '8']) expect(DEFAULT_TEMPLATES.fonts.level[char], char).toBeDefined(); // 2, 6 and 7 are real now, 8 is drafted
    expect(DEFAULT_TEMPLATES.fonts.level['5']).toEqual(HARVESTED['5']);
  });
});
