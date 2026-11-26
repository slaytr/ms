import { describe, expect, it } from 'vitest';

import { MIN_RATE_SECONDS, MIN_SHOWN, shapeLive, shapeRecent } from './live.mjs';

const row = (over) => ({
  id: 'a',
  player: 'Ann',
  job: 'Spearman',
  map: 'Victoria Road: Ant Tunnel I',
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
      {
        id: 's1', player: 'Ann', job: 'Spearman', map: 'Victoria Road: Ant Tunnel I', seconds: 3600,
        level: 34, pct: 12.5, expGained: 100, expPerHour: 100, estimated: false,
      },
    ]);
  });

  it('leaves the map null while the session has no name', () => {
    const [entry] = shapeLive([row({ map: '' })], latest({}));
    expect(entry.map).toBeNull();
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

  it('passes on the stored EXP gain and whether part of it is estimated', () => {
    const [exact] = shapeLive([row({ expGained: 7_000 })], latest({}));
    expect(exact.estimated).toBe(false);
    const [guess] = shapeLive([row({ expGained: 7_000, expEstimated: true, seconds: 1800 })], latest({}));
    expect(guess.estimated).toBe(true);
    expect(guess.expGained).toBe(7_000);
    expect(guess.expPerHour).toBe(14_000);
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

describe('shapeRecent', () => {
  const seen = (entries) => new Map(Object.entries(entries));
  const HOUR = 3_600_000;

  it('lists who was seen last first, with when they were last seen', () => {
    const out = shapeRecent(
      [row({ id: 'x', playerKey: 'x', player: 'X' }), row({ id: 'y', playerKey: 'y', player: 'Y' })],
      latest({ x: { level: 40, pct: 1 } }),
      seen({ x: 9 * HOUR, y: 8 * HOUR }),
      new Set(),
      3,
    );
    expect(out.map((e) => e.player)).toEqual(['X', 'Y']);
    expect(out[0].lastSeenAt).toBe(new Date(9 * HOUR).toISOString());
    expect(out[0].level).toBe(40);
  });

  it('skips players who are grinding now', () => {
    const out = shapeRecent([row({ id: 'x', playerKey: 'live' })], latest({}), seen({ x: HOUR }), new Set(['live']), 3);
    expect(out).toEqual([]);
  });

  it('keeps one entry per player, from the session seen most recently', () => {
    const out = shapeRecent(
      [row({ id: 'a', startedAt: 1 }), row({ id: 'b', startedAt: 2 })],
      latest({}),
      seen({ a: 9 * HOUR, b: 5 * HOUR }),
      new Set(),
      3,
    );
    expect(out.map((e) => e.id)).toEqual(['a']);
  });

  it('only returns as many as are needed', () => {
    const stats = ['a', 'b', 'c', 'd'].map((k, i) => row({ id: k, playerKey: k, player: k }));
    const out = shapeRecent(stats, latest({}), seen({ a: 4, b: 3, c: 2, d: 1 }), new Set(), 2);
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('drops unnamed players and sessions never seen', () => {
    const out = shapeRecent(
      [row({ id: 'u', player: 'Unknown', playerKey: 'u' }), row({ id: 'n', playerKey: 'n' })],
      latest({}),
      seen({ u: 5 }),
      new Set(),
      3,
    );
    expect(out).toEqual([]);
  });

  it('shows at least three', () => {
    expect(MIN_SHOWN).toBe(3);
  });
});
