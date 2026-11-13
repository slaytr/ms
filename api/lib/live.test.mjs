import { describe, expect, it } from 'vitest';

import { expToNext } from '../../web/src/data/expTable.ts';
import { MIN_RATE_SECONDS, shapeLive } from './live.mjs';

const row = (over) => ({
  id: 'a',
  player: 'Ann',
  job: 'Spearman',
  playerKey: 'ann',
  expGained: 100,
  expPctGained: 0,
  seconds: 3600,
  startedAt: 1,
  ...over,
});
const latest = (entries) => new Map(Object.entries(entries));

describe('shapeLive', () => {
  it('joins each session with its latest level and percent', () => {
    const out = shapeLive([row({ id: 's1' })], latest({ s1: { level: 34, pct: 12.5 } }));
    expect(out).toEqual([
      { id: 's1', player: 'Ann', job: 'Spearman', level: 34, pct: 12.5, expGained: 100, expPerHour: 100, estimated: false },
    ]);
  });

  it('works out EXP per hour from the tracked time', () => {
    const [entry] = shapeLive([row({ expGained: 50_000, seconds: 1800 })], latest({}));
    expect(entry.expPerHour).toBe(100_000);
  });

  it('leaves the rate blank until there is enough tracked time to trust one', () => {
    const [entry] = shapeLive([row({ expGained: 5_000, seconds: MIN_RATE_SECONDS - 1 })], latest({}));
    expect(entry.expPerHour).toBeNull();
    expect(entry.expGained).toBe(5_000);
  });

  it('estimates EXP from the percent gained when the game shows no raw EXP', () => {
    const need = expToNext(62);
    const [entry] = shapeLive([row({ id: 's1', expGained: 0, expPctGained: 5, seconds: 1800 })], latest({ s1: { level: 62, pct: 80 } }));
    expect(entry.estimated).toBe(true);
    expect(entry.expGained).toBeCloseTo(need * 0.05, 0);
    expect(entry.expPerHour).toBeCloseTo(need * 0.05 * 2, 0);
  });

  it('prefers the exact EXP over a percent estimate', () => {
    const [entry] = shapeLive([row({ id: 's1', expGained: 7_000, expPctGained: 50 })], latest({ s1: { level: 62, pct: 80 } }));
    expect(entry.estimated).toBe(false);
    expect(entry.expGained).toBe(7_000);
  });

  it('counts nothing for a percent-only session whose level was never read', () => {
    const [entry] = shapeLive([row({ expGained: 0, expPctGained: 5 })], latest({}));
    expect(entry.expGained).toBe(0);
    expect(entry.estimated).toBe(false);
  });

  it('leaves level and percent null when nothing was read', () => {
    const [entry] = shapeLive([row({ id: 's1' })], latest({}));
    expect(entry.level).toBeNull();
    expect(entry.pct).toBeNull();
  });

  it('keeps only the newest session per player', () => {
    const out = shapeLive([row({ id: 'old', startedAt: 1 }), row({ id: 'new', startedAt: 9 })], latest({}));
    expect(out.map((e) => e.id)).toEqual(['new']);
  });

  it('drops players with no readable name', () => {
    expect(shapeLive([row({ player: 'Unknown' })], latest({}))).toEqual([]);
  });

  it('puts the biggest EXP gain first', () => {
    const out = shapeLive(
      [row({ id: 'a', playerKey: 'a', expGained: 5 }), row({ id: 'b', playerKey: 'b', expGained: 50 })],
      latest({}),
    );
    expect(out.map((e) => e.id)).toEqual(['b', 'a']);
  });
});
