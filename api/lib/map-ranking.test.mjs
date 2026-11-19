import { describe, expect, it } from 'vitest';

import { parseRankSort, rankingPage } from './map-ranking.mjs';

/** A session on `map` that qualifies; `rate` is its EXP/h. */
const session = (map, rate, over = {}) => ({
  id: `${map}-${rate}`,
  map,
  player: 'P',
  job: null,
  playerKey: 'k',
  startedAt: 0,
  seconds: 3600,
  levelFrom: 50,
  levelTo: 50,
  expGained: rate,
  expPctGained: 1,
  mesoGained: 0,
  ...over,
});

/** `count` maps named M01.., the first one the fastest. */
const maps = (count) => Array.from({ length: count }, (_, i) => session(`M${String(i + 1).padStart(2, '0')}`, 1_000_000 - i * 1000));

describe('rankingPage', () => {
  it('lists 20 maps per page, best EXP/h first', () => {
    const first = rankingPage(maps(45), { sort: 'expPerHour', page: 1 });
    expect(first.maps).toHaveLength(20);
    expect(first.maps[0].map).toBe('M01');
    expect(first).toMatchObject({ page: 1, pageSize: 20, totalMaps: 45, totalPages: 3 });

    const last = rankingPage(maps(45), { sort: 'expPerHour', page: 3 });
    expect(last.maps.map((m) => m.map)).toEqual(['M41', 'M42', 'M43', 'M44', 'M45']);
  });

  it('shows the last page when asked for one past the end', () => {
    expect(rankingPage(maps(45), { sort: 'expPerHour', page: 9 }).page).toBe(3);
  });

  it('has one empty page when nothing qualifies', () => {
    expect(rankingPage([], { sort: 'expPerHour', page: 1 })).toMatchObject({ maps: [], page: 1, totalPages: 1, totalMaps: 0, bestExpPerHour: 0 });
  });

  it('orders ALL maps by the chosen column, not just the best 20 by EXP/h', () => {
    const sessions = [...maps(25), session('Slow but rich', 60_000, { mesoGained: 9_000_000 })];
    const page = rankingPage(sessions, { sort: 'mesoPerHour', page: 1 });
    expect(page.maps[0].map).toBe('Slow but rich');
  });

  it('scales every page to the best EXP/h overall', () => {
    expect(rankingPage(maps(45), { sort: 'expPerHour', page: 3 }).bestExpPerHour).toBe(1_000_000);
  });

  it('does not modify its input', () => {
    const input = maps(3);
    const copy = structuredClone(input);
    rankingPage(input, { sort: 'seconds', page: 1 });
    expect(input).toEqual(copy);
  });
});

describe('parseRankSort', () => {
  it('defaults to EXP/h and accepts the three columns', () => {
    expect(parseRankSort(undefined)).toEqual({ sort: 'expPerHour' });
    expect(parseRankSort('mesoPerHour')).toEqual({ sort: 'mesoPerHour' });
    expect(parseRankSort('seconds')).toEqual({ sort: 'seconds' });
  });

  it('refuses anything else', () => {
    expect(parseRankSort('sessions')).toHaveProperty('error');
    expect(parseRankSort('expGained; drop table')).toHaveProperty('error');
  });
});
