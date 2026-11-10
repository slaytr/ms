import { describe, expect, it } from 'vitest';

import { dayGain, formatSeen, richest, specLeaders, rankCharacters, type CharacterEntry, type LevelPoint } from './characters';

const entry = (name: string, level: number, expPct: number | null, lastSeenAt = 0): CharacterEntry => ({
  playerKey: name,
  name,
  job: null,
  level,
  expPct,
  lastSeenAt,
  dayFrom: null,
  dayTo: null,
  meso: null,
  mesoAt: null,
});

describe('richest', () => {
  const rich = (name: string, meso: number | null) => ({ ...entry(name, 50, 0), meso, mesoAt: meso === null ? null : 1 });

  it('takes the top 3 by latest meso and skips characters with no reading', () => {
    const input = [rich('a', 5), rich('b', null), rich('c', 900), rich('d', 70), rich('e', 0), rich('f', 400)];
    expect(richest(input).map((c) => c.name)).toEqual(['c', 'f', 'd']);
    expect(input.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('is empty when nobody has a meso reading', () => {
    expect(richest([rich('a', null)])).toEqual([]);
  });
});

describe('rankCharacters', () => {
  it('orders by level, then EXP into the level, then recency', () => {
    const ranked = rankCharacters([entry('c', 50, 10, 1), entry('a', 60, 5), entry('b', 50, 40), entry('d', 50, 10, 9)]);
    expect(ranked.map((c) => c.name)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('puts an unread EXP% after a read one at the same level, and does not mutate the input', () => {
    const input = [entry('x', 40, null), entry('y', 40, 0)];
    expect(rankCharacters(input).map((c) => c.name)).toEqual(['y', 'x']);
    expect(input.map((c) => c.name)).toEqual(['x', 'y']);
  });
});

describe('formatSeen', () => {
  it('uses the coarsest unit that fits', () => {
    expect(formatSeen(1000, 1000)).toBe('just now');
    expect(formatSeen(0, 5 * 60_000)).toBe('5m ago');
    expect(formatSeen(0, 3 * 3_600_000)).toBe('3h ago');
    expect(formatSeen(0, 2 * 86_400_000)).toBe('2d ago');
  });
});

const point = (at: number, level: number, exp: number, expPct: number | null): LevelPoint => ({ at, level, exp, expPct });

describe('dayGain', () => {
  it('is the difference between the earliest and latest reading', () => {
    expect(dayGain({ dayFrom: point(0, 50, 1000, 10), dayTo: point(1, 50, 5000, 12) })).toEqual({ exp: 4000, pct: 2 });
  });

  it('carries across a level-up using the EXP table', () => {
    // Level 50 needs 709716 to level up: 700000 -> 9716 to go, then 300 into level 51.
    const gain = dayGain({ dayFrom: point(0, 50, 700000, 98.6), dayTo: point(1, 51, 300, 0.1) });
    expect(gain?.exp).toBe(10016);
    expect(gain?.pct).toBeCloseTo(1.5, 5);
  });

  it('can be negative after a death, and leaves the percentage out when it was not read', () => {
    expect(dayGain({ dayFrom: point(0, 50, 5000, null), dayTo: point(1, 50, 4000, 3) })).toEqual({ exp: -1000, pct: null });
  });

  it('is null without two distinct readings or for a level outside the table', () => {
    expect(dayGain({ dayFrom: null, dayTo: null })).toBeNull();
    expect(dayGain({ dayFrom: point(5, 50, 1, 1), dayTo: point(5, 50, 9, 2) })).toBeNull();
    expect(dayGain({ dayFrom: point(0, 500, 1, 1), dayTo: point(1, 500, 9, 2) })).toBeNull();
  });
});

describe('specLeaders', () => {
  const make = (name: string, job: string | null, level: number): CharacterEntry => ({
    playerKey: name, name, job, level, expPct: 10, lastSeenAt: 0, dayFrom: null, dayTo: null, meso: null, mesoAt: null,
  });

  it('puts the highest level of each spec in its slot, in spec order', () => {
    const slots = specLeaders(
      [make('a', 'Wizard (Ice,Lightning)', 50), make('b', 'Bandit', 60), make('c', 'Wizard (Ice, Lightning)', 55), make('d', null, 99)],
      ['Bandit', 'Wizard (Ice,Lightning)'],
    );
    expect(slots.map((s) => [s.spec, s.leader?.name, s.count])).toEqual([['Bandit', 'b', 1], ['Wizard (Ice,Lightning)', 'c', 2]]);
  });

  it('leaves a spec nobody plays blank', () => {
    expect(specLeaders([make('a', 'Bandit', 5)], ['Bandit', 'Cleric'])[1]).toEqual({ spec: 'Cleric', leader: null, count: 0 });
  });
});
