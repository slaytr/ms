import type { GlyphSet, Templates } from './types.ts';

/** One place on the game's screen we read characters from, and how much of its font we have measured. */
export interface AreaCoverage {
  readonly id: string;
  readonly label: string;
  /** Where it is on screen, in the player's words. */
  readonly where: string;
  /** Read from a real frame: trusted. */
  readonly real: readonly string[];
  /** Only a hand-drawn guess so far: it may read, but it was never measured. */
  readonly drafted: readonly string[];
  /** Nothing at all: a frame showing it reads as unreadable (null) until one is harvested. */
  readonly missing: readonly string[];
  /** Fonts that can show any letter (names, maps) never finish; the digits and symbols do. */
  readonly openEnded: boolean;
}

const chars = (text: string): readonly string[] => [...text];
const DIGITS = '0123456789';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** No lowercase l: the font draws it as the capital I bar, so the detector tells them apart by position, not by template. */
const LOWER = 'abcdefghijkmnopqrstuvwxyz';

/** The characters each font should be able to show. Letters that touch are stored as pairs (`Vi`), which count as extras. */
export const EXPECTED = {
  level: chars(DIGITS),
  exp: chars(`${DIGITS},.%[]`),
  meso: chars(`${DIGITS},`),
  map: chars(`${UPPER}${LOWER}${DIGITS},<>-:'`),
  text: chars(`${UPPER}${LOWER}${DIGITS}(),-`),
  /** Stack counts on item icons (Use tab and quick slots). */
  count: chars(DIGITS),
} as const;

/** How one font splits into real, drafted-only and missing characters. */
export function fontCoverage(expected: readonly string[], harvested: GlyphSet, merged: GlyphSet): Pick<AreaCoverage, 'real' | 'drafted' | 'missing'> {
  const has = (set: GlyphSet, char: string) => (set[char]?.length ?? 0) > 0;
  return {
    real: expected.filter((c) => has(harvested, c)),
    drafted: expected.filter((c) => !has(harvested, c) && has(merged, c)),
    missing: expected.filter((c) => !has(merged, c)),
  };
}

/** The glyph sets of the inventory templates that read stack counts: `digits` (Use tab) and `quickDigits` (quick slots). */
export interface CountTemplates {
  readonly digits: GlyphSet;
  readonly quickDigits: GlyphSet;
}

/**
 * Coverage of every font the detector reads. `harvested` is what real frames taught, `merged` what ships
 * (harvested plus hand-drawn drafts), so the difference is exactly the guesses still standing in.
 */
export function detectionCoverage(harvested: Templates, merged: Templates, counts: CountTemplates): readonly AreaCoverage[] {
  const font = (id: string, label: string, where: string, expected: readonly string[], name: keyof Templates['fonts'], openEnded = false): AreaCoverage => ({
    id,
    label,
    where,
    openEnded,
    ...fontCoverage(expected, harvested.fonts[name], merged.fonts[name]),
  });
  const count = (id: string, label: string, where: string, set: GlyphSet): AreaCoverage => ({
    id,
    label,
    where,
    openEnded: false,
    ...fontCoverage(EXPECTED.count, set, set),
  });
  return [
    font('level', 'Level digits', 'Orange tiles next to LV. in the status bar', EXPECTED.level, 'level'),
    font('exp', 'EXP bar', 'The EXP. number and percent in the status bar', EXPECTED.exp, 'exp'),
    font('meso', 'Meso', 'The meso amount at the bottom of the open inventory', EXPECTED.meso, 'meso'),
    font('map', 'Map name', 'Street and map under MINI MAP, top left', EXPECTED.map, 'map', true),
    font('text', 'Name and job', 'Character name and job beside the level', EXPECTED.text, 'text', true),
    count('use-counts', 'Use-tab stack counts', 'Numbers over item icons in the inventory Use tab', counts.digits),
    count('quick-counts', 'Quick-slot counts', 'Numbers over the hotkey bar items', counts.quickDigits),
  ];
}

/** Totals across the areas that have a fixed character list, for the summary line. */
export function coverageTotals(areas: readonly AreaCoverage[]): { readonly real: number; readonly drafted: number; readonly missing: number } {
  return areas.reduce(
    (total, a) => ({ real: total.real + a.real.length, drafted: total.drafted + a.drafted.length, missing: total.missing + a.missing.length }),
    { real: 0, drafted: 0, missing: 0 },
  );
}
