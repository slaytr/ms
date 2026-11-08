import { describe, expect, it } from 'vitest';

import { expToNext } from '../data/expTable';
import type { Detection } from './detect/detect.ts';
import { inferLevel, levelCandidates, withInferredLevel } from './level-infer';

const base: Detection = {
  meso: null,
  exp: 72_825,
  expPct: 11.11,
  level: null,
  found: { exp: true, level: true, mesos: false, minimap: true, character: true },
  character: { fingerprint: 'abc', name: 'PayYoBills', job: 'Wizard (Ice,Lightning)' },
  map: { street: 'Victoria Road', name: 'The Forest North of Ellinia' },
  state: { exp: { x: 1, y: 1 }, level: { x: 1, y: 1 }, mesos: null, minimap: { x: 8, y: 40 } },
};

/** What the game would show for this much EXP at this level. */
const shownPct = (exp: number, level: number) => Math.round((exp / expToNext(level)!) * 10_000) / 100;

describe('inferLevel', () => {
  it('matches the real frames we captured at level 49', () => {
    expect(inferLevel(72_825, 11.11)).toBe(49);
    expect(inferLevel(72_573, 11.08)).toBe(49);
    expect(inferLevel(28_464, 4.34)).toBe(49);
    expect(inferLevel(17_691, 2.7)).toBe(49);
  });

  it('works at levels whose digits have no template yet', () => {
    expect(inferLevel(100_000, shownPct(100_000, 50))).toBe(50);
    expect(inferLevel(700_000, shownPct(700_000, 63))).toBe(63);
  });

  it('works on the huge post-90 levels', () => {
    expect(inferLevel(1_000_000_000, shownPct(1_000_000_000, 97))).toBe(97);
  });

  it('returns null when EXP and percent are not both known', () => {
    expect(inferLevel(null, 11.11)).toBeNull();
    expect(inferLevel(72_825, null)).toBeNull();
  });

  it('returns null when no level fits, instead of guessing', () => {
    expect(inferLevel(72_825, 55.55)).toBeNull();
    expect(inferLevel(999_999_999_999, 10)).toBeNull();
  });

  it('refuses to guess among several fits without a hint', () => {
    expect(levelCandidates(0, 0).length).toBeGreaterThan(1);
    expect(inferLevel(0, 0)).toBeNull();
  });

  it('uses the last known level to break a tie, including a level-up', () => {
    expect(inferLevel(0, 0, 30)).toBe(30);
    expect(inferLevel(0, 0, 200)).toBeNull();
    // 4 EXP into level 7 is 0.71%: only level 7 fits, so a stale hint of 6 doesn't matter.
    expect(inferLevel(4, shownPct(4, 7), 6)).toBe(7);
  });
});

describe('withInferredLevel', () => {
  it('fills in a missing level and marks it as inferred', () => {
    const result = withInferredLevel(base, null);
    expect(result.level).toBe(49);
    expect(result.levelInferred).toBe(true);
  });

  it('never overrides a level that was actually read', () => {
    const read = { ...base, level: 48 };
    expect(withInferredLevel(read, null)).toBe(read);
  });

  it('leaves the detection alone when the level cannot be worked out', () => {
    const unknown = { ...base, expPct: null };
    expect(withInferredLevel(unknown, null)).toBe(unknown);
  });
});
