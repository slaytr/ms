import { describe, expect, it } from 'vitest';

import type { Detection } from './detect/detect.ts';
import { createMissGate, describeDetection, findMisses, gameSeen, missSignature } from './miss-capture';

const everythingRead: Detection = {
  meso: null,
  exp: 463_716,
  expPct: 70.77,
  level: 49,
  found: { exp: true, level: true, mesos: false, minimap: true, character: true },
  character: { fingerprint: 'abc', name: 'PayYoBills', job: 'Wizard' },
  map: { street: 'Victoria Road', name: 'Lith Harbor' },
  state: { exp: null, level: null, mesos: null, minimap: null },
};
const detection = (over: Partial<Detection> = {}): Detection => ({ ...everythingRead, ...over });

describe('findMisses', () => {
  it('finds nothing when everything readable was read (meso is optional while the inventory is closed)', () => {
    expect(findMisses(everythingRead)).toEqual([]);
  });

  it('flags a map whose name could not be read', () => {
    expect(findMisses(detection({ map: { street: 'Victoria Road', name: null } }))).toEqual(['map']);
    expect(findMisses(detection({ map: { street: null, name: null } }))).toEqual(['map']);
  });

  it('flags level digits we could not read even when the level was inferred from EXP', () => {
    expect(findMisses(detection({ level: 50, levelInferred: true }))).toEqual(['level']);
  });

  it('flags an EXP bar that was found but not read, and one that was not found', () => {
    expect(findMisses(detection({ exp: null, expPct: null }))).toEqual(['exp']);
    expect(findMisses(detection({ exp: null, expPct: null, found: { ...everythingRead.found, exp: false } }))).toEqual(['exp']);
  });

  it('does not flag an EXP bar that shows only a percent (the game hides raw EXP at high levels)', () => {
    expect(findMisses(detection({ exp: null }))).toEqual([]);
  });

  it('flags meso only when its label was found but the digits were not recognised', () => {
    expect(findMisses(detection({ found: { ...everythingRead.found, mesos: true }, meso: null }))).toEqual(['meso']);
    expect(findMisses(detection({ found: { ...everythingRead.found, mesos: false }, meso: null }))).toEqual([]);
  });

  it('flags a character whose name letters are unknown, and a minimap that is not there', () => {
    expect(findMisses(detection({ character: { fingerprint: 'abc', name: null, job: null } }))).toEqual(['character']);
    expect(findMisses(detection({ found: { ...everythingRead.found, minimap: false } }))).toEqual(['minimap']);
  });

  it('does not also report the map when the minimap itself was not found', () => {
    const none = detection({ found: { ...everythingRead.found, minimap: false }, map: { street: null, name: null } });
    expect(findMisses(none)).toEqual(['minimap']);
  });
});

describe('gameSeen', () => {
  it('is true once any game element was located, false for a frame with none (e.g. some other window)', () => {
    expect(gameSeen(everythingRead)).toBe(true);
    const nothing = detection({ found: { exp: false, level: false, mesos: false, minimap: false, character: false } });
    expect(gameSeen(nothing)).toBe(false);
  });

  it('does not count the meso label alone, which could appear on any page', () => {
    const onlyMeso = detection({ found: { exp: false, level: false, mesos: true, minimap: false, character: false } });
    expect(gameSeen(onlyMeso)).toBe(false);
  });
});

describe('missSignature', () => {
  it('is the same for the same kind of miss, whatever order the fields came in', () => {
    const a = missSignature(['map', 'level'], detection({ level: 50 }), 1368, 800);
    const b = missSignature(['level', 'map'], detection({ level: 50 }), 1368, 800);
    expect(a).toBe(b);
  });

  it('differs by level, map and window size, so a new level or map gets its own screenshot', () => {
    const base = missSignature(['level'], detection({ level: 50 }), 1368, 800);
    expect(missSignature(['level'], detection({ level: 51 }), 1368, 800)).not.toBe(base);
    expect(missSignature(['level'], detection({ level: 50, map: { street: 'X', name: 'Y' } }), 1368, 800)).not.toBe(base);
    expect(missSignature(['level'], detection({ level: 50 }), 1922, 1232)).not.toBe(base);
  });
});

describe('describeDetection', () => {
  it('keeps what was read and located, and leaves out the internal anchor positions', () => {
    const sent = describeDetection(detection({ levelInferred: true }));
    expect(sent).toMatchObject({ exp: 463_716, level: 49, levelInferred: true, found: { minimap: true } });
    expect(sent).not.toHaveProperty('state');
  });
});

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('createMissGate', () => {
  it('lets a new kind of miss through once, then not again this run', () => {
    const gate = createMissGate({ storage: null });
    expect(gate.allow('a', 0)).toBe(true);
    gate.record('a', 0);
    expect(gate.allow('a', 10 * 60_000)).toBe(false);
  });

  it('spaces uploads out so a stuck frame does not send one every tick', () => {
    const gate = createMissGate({ storage: null, minIntervalMs: 45_000 });
    gate.record('a', 0);
    expect(gate.allow('b', 3_000)).toBe(false);
    expect(gate.allow('b', 45_000)).toBe(true);
  });

  it('stops after the per-run limit', () => {
    const gate = createMissGate({ storage: null, maxPerRun: 2, minIntervalMs: 0 });
    gate.record('a', 0);
    gate.record('b', 1);
    expect(gate.allow('c', 2)).toBe(false);
  });

  it('lets a failed upload be tried again', () => {
    const gate = createMissGate({ storage: null, minIntervalMs: 0 });
    gate.record('a', 0);
    gate.forget('a');
    expect(gate.allow('a', 1)).toBe(true);
  });

  it('remembers a signature across runs for a day, then forgets it', () => {
    const storage = memory();
    createMissGate({ storage, memoryMs: 1000 }).record('a', 0);
    const later = createMissGate({ storage, memoryMs: 1000 });
    expect(later.allow('a', 500)).toBe(false);
    expect(later.allow('a', 1500)).toBe(true);
  });

  it('works without storage, or with storage that throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const gate = createMissGate({ storage: broken });
    expect(gate.allow('a', 0)).toBe(true);
    expect(() => gate.record('a', 0)).not.toThrow();
  });

  it('starts fresh on reset', () => {
    const gate = createMissGate({ storage: null, maxPerRun: 1, minIntervalMs: 0 });
    gate.record('a', 0);
    gate.reset();
    expect(gate.allow('b', 1)).toBe(true);
  });
});
