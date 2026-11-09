import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { withDrafts } from './draft-glyphs.ts';
import { DRAFT_MAP_GLYPHS } from './draft-map-glyphs.ts';
import { bitmapDistance, classify } from './glyph.ts';
import { GLYPH_TOLERANCE } from './layout.ts';
import raw from './templates.json';
import { parseTemplates } from './templates.ts';
import type { Bitmap } from './types.ts';

const HARVESTED = parseTemplates(raw).fonts.map;

const variants = (set: Readonly<Record<string, readonly Bitmap[]>>) =>
  Object.entries(set).flatMap(([char, list]) => list.map((bitmap, index) => ({ char, index, bitmap })));

describe('draft map glyphs', () => {
  it('are well-formed cells the segmenter could produce', () => {
    for (const { char, index, bitmap } of variants(DRAFT_MAP_GLYPHS)) {
      const label = `${char}#${index}`;
      expect(bitmap.length, label).toBe(14);
      const width = bitmap[0].length;
      expect(bitmap.every((row) => row.length === width && /^[#.]+$/.test(row)), label).toBe(true);
      // Glyphs are cut at the ink's left and right edges, so both edge columns must hold ink.
      expect(bitmap.some((row) => row[0] === '#'), `${label} left edge`).toBe(true);
      expect(bitmap.some((row) => row[width - 1] === '#'), `${label} right edge`).toBe(true);
    }
  });

  it('keep ink inside the font\'s rows: nothing above row 3 or below row 13', () => {
    for (const { char, index, bitmap } of variants(DRAFT_MAP_GLYPHS)) {
      expect(bitmap.slice(0, 3).every((row) => !row.includes('#')), `${char}#${index} top`).toBe(true);
    }
  });

  it('never read as a different character, even one pixel off', () => {
    // Matching tolerates GLYPH_TOLERANCE wrong pixels. Two templates for different characters closer than
    // twice that can both be within reach of one real glyph, and the wrong one may win. Pairs of harvested
    // glyphs are real and not ours to judge.
    const drafted = variants(DRAFT_MAP_GLYPHS);
    const all = variants({ ...DRAFT_MAP_GLYPHS, ...HARVESTED });
    const clashes: string[] = [];
    for (const a of drafted) {
      for (const b of all) {
        if (a.char === b.char) continue;
        if (b.char in DRAFT_MAP_GLYPHS && a.char > b.char) continue;
        const distance = bitmapDistance(a.bitmap, b.bitmap);
        if (distance <= 2 * GLYPH_TOLERANCE) clashes.push(`${a.char}#${a.index} vs ${b.char}#${b.index}: ${distance}px apart`);
      }
    }
    expect(clashes).toEqual([]);
  });

  /** Drafts that actually ship: a character with a harvested glyph uses that, not its draft. */
  const live = () => variants(DRAFT_MAP_GLYPHS).filter(({ char }) => !(char in HARVESTED));

  it('read back as themselves', () => {
    for (const { char, bitmap } of live()) {
      expect(classify(bitmap, withDrafts(HARVESTED, DRAFT_MAP_GLYPHS), GLYPH_TOLERANCE)).toBe(char);
    }
  });

  it('read with one wrong pixel', () => {
    const set = withDrafts(HARVESTED, DRAFT_MAP_GLYPHS);
    for (const { char, bitmap } of live()) {
      // Flip a pixel on the first ink row: the one a compressed edge is most likely to nibble.
      const top = bitmap.findIndex((row) => row.includes('#'));
      const flipped = bitmap.map((row, y) => (y === top ? (row[0] === '#' ? '.' : '#') + row.slice(1) : row));
      expect(classify(flipped, set, GLYPH_TOLERANCE), `${char} with a flipped pixel`).toBe(char);
    }
  });

  it('never replace a harvested glyph', () => {
    const merged = withDrafts(HARVESTED, { R: [DRAFT_MAP_GLYPHS.O[0]], J: DRAFT_MAP_GLYPHS.J });
    expect(merged.R).toBe(HARVESTED.R);
    expect(merged.J).toBe(DRAFT_MAP_GLYPHS.J);
  });

  it('are what the shipped templates use for characters nobody has harvested', () => {
    expect(DEFAULT_TEMPLATES.fonts.map.Z).toEqual(DRAFT_MAP_GLYPHS.Z);
    expect(DEFAULT_TEMPLATES.fonts.map.R).toEqual(HARVESTED.R);
  });

  it('cover every letter and digit the map font still lacks, apart from the l that I stands for', () => {
    const covered = new Set([...Object.keys(HARVESTED), ...Object.keys(DRAFT_MAP_GLYPHS)]);
    const missing = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].filter((c) => !covered.has(c) && c !== 'l');
    expect(missing).toEqual([]);
  });
});
