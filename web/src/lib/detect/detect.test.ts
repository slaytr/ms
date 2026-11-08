import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { detectFrame, INITIAL_STATE } from './detect.ts';
import { FIXTURES_DIR, listFixtures, loadFrame } from './fixture-io.ts';
import { parseExp, parseExpPoints, parseMeso, resolveLookalikes, resolveMapLookalikes } from './readers.ts';
import { EMPTY_TEMPLATES, type Frame } from './types.ts';

interface Label {
  exp: string;
  level: string;
  meso?: string;
  name: string;
  job: string;
  street: string;
  map: string;
}

/** Labels mark pixel quirks ({ab} touching letters, ~b~ a letter drawn in two pieces); the screen text has neither. */
const plain = (text: string) => text.replace(/[{}~]/g, '');

/** Ground truth typed by a human in fixtures/labels.json; each frame is checked against its own values. */
const labels = JSON.parse(readFileSync(join(FIXTURES_DIR, 'labels.json'), 'utf8')) as Record<string, Label | string>;
const fixtures = listFixtures().filter((f) => typeof labels[f] === 'object');
const closed = fixtures.filter((f) => f.startsWith('inventory-closed'));
const open = fixtures.filter((f) => f.startsWith('inventory-open'));

function truth(file: string) {
  const label = labels[file] as Label;
  const [, rawExp, pct] = label.exp.match(/^(.*)\[(\d+\.\d+)%\]$/)!;
  return {
    exp: Number(rawExp.replace(/[,.]/g, '')),
    expPct: Number(pct),
    level: Number(label.level),
    meso: label.meso ? Number(label.meso.replace(/,/g, '')) : null,
    name: label.name.replace(/[{}]/g, ''),
    job: label.job,
    street: plain(label.street),
    map: plain(label.map),
  };
}

describe('detectFrame on real Classic client captures', () => {
  it('has fixtures to test against', () => {
    expect(closed.length).toBeGreaterThan(0);
    expect(open.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('reads raw EXP, EXP% and level from %s', (file) => {
    const result = detectFrame(loadFrame(file), DEFAULT_TEMPLATES);
    expect(result.found.exp).toBe(true);
    expect(result.found.level).toBe(true);
    const expected = truth(file);
    expect(result.exp).toBe(expected.exp);
    expect(result.expPct).toBe(expected.expPct);
    expect(result.level).toBe(expected.level);
  });

  it.each(open)('reads meso from %s, wherever the inventory was dragged to', (file) => {
    const result = detectFrame(loadFrame(file), DEFAULT_TEMPLATES);
    expect(result.found.mesos).toBe(true);
    expect(result.meso).toBe(truth(file).meso);
  });

  it.each(closed)('reports no meso, not a wrong one, when the inventory is closed (%s)', (file) => {
    const result = detectFrame(loadFrame(file), DEFAULT_TEMPLATES);
    expect(result.found.mesos).toBe(false);
    expect(result.meso).toBeNull();
  });

  it('finds the inventory at different positions across frames (it is movable)', () => {
    const positions = open.map((f) => detectFrame(loadFrame(f), DEFAULT_TEMPLATES).state.mesos);
    expect(positions.every((p) => p !== null)).toBe(true);
    expect(new Set(positions.map((p) => `${p!.x},${p!.y}`)).size).toBeGreaterThan(1);
  });

  it('still reads meso when another window overlaps the left of the field (world map frame)', () => {
    const covered = open.find((f) => f.endsWith('1794120030427.png'));
    expect(covered).toBeDefined();
    expect(detectFrame(loadFrame(covered!), DEFAULT_TEMPLATES).meso).toBe(truth(covered!).meso);
  });

  it('reuses the previous position and gives the same answer', () => {
    const frame = loadFrame(open[0]);
    const first = detectFrame(frame, DEFAULT_TEMPLATES);
    const second = detectFrame(frame, DEFAULT_TEMPLATES, first.state);
    expect(second.state).toEqual(first.state);
    expect(second.meso).toBe(truth(open[0]).meso);
  });

  it('recovers when the cached position is stale', () => {
    const frame = loadFrame(open[0]);
    const stale = { exp: { x: 5, y: 5 }, level: { x: 9, y: 9 }, mesos: { x: 1, y: 1 }, minimap: { x: 3, y: 3 } };
    expect(detectFrame(frame, DEFAULT_TEMPLATES, stale).meso).toBe(truth(open[0]).meso);
  });
});

describe('character plate (name + job)', () => {
  it.each(fixtures)('reads the name and job from %s', (file) => {
    const { character, found } = detectFrame(loadFrame(file), DEFAULT_TEMPLATES);
    expect(found.character).toBe(true);
    expect(character.name).toBe(truth(file).name);
    expect(character.job).toBe(truth(file).job);
  });

  it('gives the same fingerprint in every frame, whether or not the inventory is open', () => {
    const prints = new Set(fixtures.map((f) => detectFrame(loadFrame(f), DEFAULT_TEMPLATES).character.fingerprint));
    expect(prints.size).toBe(1);
    expect([...prints][0]).toBeTruthy();
  });

  it('changes the fingerprint when the name pixels change (a different character)', () => {
    const frame = loadFrame(open[0]);
    const base = detectFrame(frame, DEFAULT_TEMPLATES).character.fingerprint;

    const data = new Uint8ClampedArray(frame.data);
    // Add one stray bright pixel inside the name line, as a different name would.
    const at = (790 * frame.width + 372) * 4;
    data.set([255, 255, 255, 255], at);
    const changed = detectFrame({ ...frame, data }, DEFAULT_TEMPLATES).character.fingerprint;

    expect(changed).toBeTruthy();
    expect(changed).not.toBe(base);
  });

  it('still identifies the character, but reports no name, when letters have no template', () => {
    const noText = { ...DEFAULT_TEMPLATES, fonts: { ...DEFAULT_TEMPLATES.fonts, text: {} } };
    const { character } = detectFrame(loadFrame(open[0]), noText);
    expect(character.name).toBeNull();
    expect(character.job).toBeNull();
    expect(character.fingerprint).toBeTruthy();
  });

  it('has no character on a screen without the status bar', () => {
    const blank: Frame = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4).fill(255) };
    const { character } = detectFrame(blank, DEFAULT_TEMPLATES);
    expect(character).toEqual({ fingerprint: null, name: null, job: null });
  });
});

describe('map name (minimap title, top left)', () => {
  it.each(fixtures)('reads the street and map name from %s', (file) => {
    const result = detectFrame(loadFrame(file), DEFAULT_TEMPLATES);
    expect(result.found.minimap).toBe(true);
    expect(result.map).toEqual({ street: truth(file).street, name: truth(file).map });
  });

  it('reads three different maps, so the width of the panel is not what makes it work', () => {
    const maps = new Set(fixtures.map((f) => detectFrame(loadFrame(f), DEFAULT_TEMPLATES).map.name));
    expect(maps).toEqual(new Set(['Line 1 <Area 1>', 'Tree Dungeon, Forest Up North VIII', 'The Forest North of Ellinia']));
  });

  it('keeps a roman numeral as capital I\'s but reads the same bar as l inside a word', () => {
    expect(resolveMapLookalikes('Tree Dungeon, Forest Up North VIII')).toBe('Tree Dungeon, Forest Up North VIII');
    expect(resolveMapLookalikes('The Forest North of EIIinia')).toBe('The Forest North of Ellinia');
    expect(resolveMapLookalikes('Area II')).toBe('Area II');
    expect(resolveMapLookalikes('Ice Cave')).toBe('Ice Cave');
  });

  it('follows the minimap when it is not in the usual spot (it is movable)', () => {
    const file = fixtures.find((f) => f.startsWith('inventory-closed'))!;
    const source = loadFrame(file);
    const [dx, dy] = [37, 23];
    const width = source.width + dx;
    const height = source.height + dy;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < source.height; y++) {
      const from = y * source.width * 4;
      data.set(source.data.subarray(from, from + source.width * 4), ((y + dy) * width + dx) * 4);
    }
    const shifted = detectFrame({ width, height, data }, DEFAULT_TEMPLATES);
    expect(shifted.map).toEqual({ street: truth(file).street, name: truth(file).map });
  });

  it('reports no map, not a wrong one, when the minimap is hidden behind something', () => {
    const file = fixtures[0];
    const frame = loadFrame(file);
    const data = new Uint8ClampedArray(frame.data);
    for (let y = 30; y < 190; y++) data.fill(60, (y * frame.width + 0) * 4, (y * frame.width + 300) * 4);
    const result = detectFrame({ ...frame, data }, DEFAULT_TEMPLATES);
    expect(result.found.minimap).toBe(false);
    expect(result.map).toEqual({ street: null, name: null });
  });

  it('finds the panel but reports no name when a letter has no template yet', () => {
    const noMapFont = { ...DEFAULT_TEMPLATES, fonts: { ...DEFAULT_TEMPLATES.fonts, map: {} } };
    const result = detectFrame(loadFrame(fixtures[0]), noMapFont);
    expect(result.found.minimap).toBe(true);
    expect(result.map).toEqual({ street: null, name: null });
  });

  it('reads the street even if the map line has an unknown letter', () => {
    const withoutA = Object.fromEntries(Object.entries(DEFAULT_TEMPLATES.fonts.map).filter(([char]) => char !== 'A'));
    const result = detectFrame(loadFrame(closed[0]), { ...DEFAULT_TEMPLATES, fonts: { ...DEFAULT_TEMPLATES.fonts, map: withoutA } });
    expect(result.map.street).toBe('Kerning City Subway');
    expect(result.map.name).toBeNull();
  });
});

describe('detectFrame never guesses', () => {
  it('returns nothing found on a blank frame', () => {
    const blank: Frame = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4).fill(255) };
    const result = detectFrame(blank, DEFAULT_TEMPLATES, INITIAL_STATE);
    expect(result.found).toEqual({ exp: false, level: false, mesos: false, minimap: false, character: false });
    expect([result.meso, result.exp, result.expPct, result.level]).toEqual([null, null, null, null]);
  });

  it('locates the UI but reads null when it has no digit templates', () => {
    const noFonts = { ...DEFAULT_TEMPLATES, fonts: EMPTY_TEMPLATES.fonts };
    const result = detectFrame(loadFrame(open[0]), noFonts);
    expect(result.found).toEqual({ exp: true, level: true, mesos: true, minimap: true, character: true });
    expect([result.meso, result.exp, result.expPct, result.level]).toEqual([null, null, null, null]);
  });

  it('survives a frame smaller than the layout without throwing', () => {
    const tiny: Frame = { width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4) };
    expect(() => detectFrame(tiny, DEFAULT_TEMPLATES)).not.toThrow();
  });
});

describe('parsers', () => {
  it('parseMeso enforces real thousands grouping', () => {
    expect(parseMeso('721,592')).toBe(721_592);
    expect(parseMeso('0')).toBe(0);
    expect(parseMeso('9,999,999,999')).toBe(9_999_999_999);
    expect(parseMeso('7215,92')).toBeNull();
    expect(parseMeso('21,59')).toBeNull();
    expect(parseMeso('')).toBeNull();
    expect(parseMeso('72?,592')).toBeNull();
  });

  it('parseExpPoints treats every separator as thousands, never a decimal', () => {
    expect(parseExpPoints('17,691')).toBe(17_691);
    expect(parseExpPoints('17.691')).toBe(17_691);
    expect(parseExpPoints('1,234,567')).toBe(1_234_567);
    expect(parseExpPoints('999')).toBe(999);
    expect(parseExpPoints('0')).toBe(0);
    expect(parseExpPoints('17,69')).toBeNull();
    expect(parseExpPoints('1769,1')).toBeNull();
    expect(parseExpPoints('17,?91')).toBeNull();
    expect(parseExpPoints('')).toBeNull();
  });

  it('parseExp reads the percent even if the raw part has an unreadable glyph', () => {
    expect(parseExp('17,691[2.70%]')).toEqual({ pct: 2.7, exp: 17_691 });
    expect(parseExp('17,?91[2.70%]')).toEqual({ pct: 2.7, exp: null });
    expect(parseExp('17,691[2.?0%]').pct).toBeNull();
    expect(parseExp('17,691[2.70%').pct).toBeNull();
  });
});

describe('resolveLookalikes', () => {
  it('reads a bar as capital I only at the start of a word', () => {
    expect(resolveLookalikes('Ice')).toBe('Ice');
    expect(resolveLookalikes('PayYoBiIIs')).toBe('PayYoBills');
    expect(resolveLookalikes('Wizard (Ice,Lightning)')).toBe('Wizard (Ice,Lightning)');
    expect(resolveLookalikes('Magician Ill')).toBe('Magician Ill');
    expect(resolveLookalikes('(Ice')).toBe('(Ice');
  });
});
