import { describe, expect, it } from 'vitest';

import type { Detection } from './detect/detect.ts';
import { assessDetection, coreReady } from './health';

const base: Detection = {
  meso: null,
  exp: 17_691,
  expPct: 2.7,
  level: 49,
  found: { exp: true, level: true, mesos: false, minimap: true, character: true },
  character: { fingerprint: 'abc', name: 'PayYoBills', job: 'Wizard (Ice,Lightning)' },
  map: { street: 'Victoria Road', name: 'The Forest North of Ellinia' },
  state: { exp: { x: 1, y: 1 }, level: { x: 1, y: 1 }, mesos: null, minimap: { x: 8, y: 40 } },
};

describe('assessDetection', () => {
  it('reports nothing confirmed before the first frame', () => {
    expect(assessDetection(null)).toEqual({ window: 'missing', character: 'missing', level: 'missing', exp: 'missing', meso: 'missing' });
  });

  it('confirms the core data and leaves meso missing while the inventory is closed', () => {
    expect(assessDetection(base)).toEqual({ window: 'ok', character: 'ok', level: 'ok', exp: 'ok', meso: 'missing' });
  });

  it('separates "on screen but not readable" from "not on screen"', () => {
    const h = assessDetection({ ...base, exp: null, level: null, found: { ...base.found, mesos: true } });
    expect([h.level, h.exp, h.meso]).toEqual(['unreadable', 'unreadable', 'unreadable']);
  });

  it('flags an unreadable name unless the player typed one', () => {
    const unnamed = { ...base, character: { ...base.character, name: null } };
    expect(assessDetection(unnamed).character).toBe('unreadable');
    expect(assessDetection(unnamed, 'Typed').character).toBe('ok');
  });
});

describe('coreReady', () => {
  it('needs the character, level and EXP, and not meso or a readable name', () => {
    expect(coreReady(base)).toBe(true);
    expect(coreReady({ ...base, character: { ...base.character, name: null } })).toBe(true);
    expect(coreReady({ ...base, level: null })).toBe(false);
    expect(coreReady({ ...base, exp: null })).toBe(false);
    expect(coreReady({ ...base, found: { ...base.found, character: false } })).toBe(false);
    expect(coreReady(null)).toBe(false);
  });
});
