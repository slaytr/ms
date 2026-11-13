import { describe, expect, it } from 'vitest';

import { formatLevels, formatStay, qualifyingSessions, rankMaps, rankPlayers, sessionRates, sortRanks, topPlayersForMap, type MapSession } from './maps';

const session = (over: Partial<MapSession> = {}): MapSession => ({
  id: 'a',
  map: 'Victoria Road: Henesys Hunting Ground',
  player: 'PayYoBills',
  job: 'Wizard (Ice,Lightning)',
  playerKey: 'abc',
  startedAt: 0,
  seconds: 3600,
  levelFrom: 49,
  levelTo: 49,
  expGained: 100_000,
  expPctGained: 10,
  mesoGained: 50_000,
  ...over,
});

describe('rankMaps', () => {
  it('weights rates by time played, not by session count', () => {
    // 1h at 100K/h plus 15min at 400K/h: total 200K in 1.25h = 160K/h (not the 250K/h plain average).
    const ranks = rankMaps([session({ id: '1' }), session({ id: '2', seconds: 900, expGained: 100_000 })]);
    expect(ranks).toHaveLength(1);
    expect(ranks[0].expPerHour).toBe(160_000);
    expect(ranks[0].sessions).toBe(2);
  });

  it('lists the best EXP/h map first', () => {
    const ranks = rankMaps([
      session({ id: '1', map: 'Slow', expGained: 10_000 }),
      session({ id: '2', map: 'Fast', expGained: 500_000 }),
      session({ id: '3', map: 'Middle', expGained: 100_000 }),
    ]);
    expect(ranks.map((r) => r.map)).toEqual(['Fast', 'Middle', 'Slow']);
  });

  it('counts a character once however many sessions it played there', () => {
    const ranks = rankMaps([session({ id: '1' }), session({ id: '2' }), session({ id: '3', playerKey: 'other' })]);
    expect(ranks[0].players).toBe(2);
  });

  it('works out %/h and meso/h from the totals', () => {
    const [rank] = rankMaps([session({ seconds: 1800, expPctGained: 6, mesoGained: 30_000 })]);
    expect(rank.expPctPerHour).toBeCloseTo(12, 6);
    expect(rank.mesoPerHour).toBeCloseTo(60_000, 6);
  });

  it('returns nothing for no sessions and does not mutate its input', () => {
    expect(rankMaps([])).toEqual([]);
    const input = [session({ id: '1', map: 'B' }), session({ id: '2', map: 'A' })];
    const copy = [...input];
    rankMaps(input);
    expect(input).toEqual(copy);
  });
});

describe('qualifyingSessions', () => {
  it('keeps sessions of 30+ minutes above 50K EXP/h', () => {
    // 30 min, 30,000 EXP = 60K/h.
    expect(qualifyingSessions([session({ seconds: 1800, expGained: 30_000 })])).toHaveLength(1);
  });

  it('drops sessions under 30 minutes however fast they were', () => {
    expect(qualifyingSessions([session({ seconds: 1799, expGained: 500_000 })])).toHaveLength(0);
  });

  it('drops sessions at or below 50K EXP/h, even long ones', () => {
    // Exactly 50K/h is not "above".
    expect(qualifyingSessions([session({ seconds: 3600, expGained: 50_000 })])).toHaveLength(0);
    expect(qualifyingSessions([session({ seconds: 7200, expGained: 10_000 })])).toHaveLength(0);
  });

  it('leaves a map out of the ranking when none of its sessions qualify', () => {
    const slow = session({ id: '1', map: 'Slow', seconds: 3600, expGained: 10_000 });
    const fast = session({ id: '2', map: 'Fast', seconds: 3600, expGained: 200_000 });
    expect(rankMaps(qualifyingSessions([slow, fast])).map((r) => r.map)).toEqual(['Fast']);
  });
});

describe('sortRanks', () => {
  it('orders by the chosen column, highest first, without touching the original', () => {
    const ranks = rankMaps([
      session({ id: '1', map: 'A', expGained: 300_000, mesoGained: 1_000 }),
      session({ id: '2', map: 'B', expGained: 100_000, mesoGained: 90_000 }),
    ]);
    expect(sortRanks(ranks, 'mesoPerHour').map((r) => r.map)).toEqual(['B', 'A']);
    expect(ranks.map((r) => r.map)).toEqual(['A', 'B']);
  });
});

describe('sessionRates', () => {
  it('is zero for a zero-length session instead of dividing by zero', () => {
    expect(sessionRates(session({ seconds: 0 })).expPerHour).toBe(0);
  });
});

describe('formatting', () => {
  it('shows a stay at a sensible precision', () => {
    expect(formatStay(50)).toBe('50s');
    expect(formatStay(42 * 60)).toBe('42m');
    expect(formatStay(3900)).toBe('1h 05m');
  });

  it('shows the level range, or a dash when the level was never read', () => {
    expect(formatLevels(49, 49)).toBe('Lv 49');
    expect(formatLevels(49, 50)).toBe('Lv 49 → 50');
    expect(formatLevels(null, 50)).toBe('Lv 50');
    expect(formatLevels(null, null)).toBe('—');
  });
});

describe('rankPlayers', () => {
  const by = (playerKey: string, over: Partial<MapSession> = {}) => session({ id: playerKey + (over.startedAt ?? 0), playerKey, player: playerKey, ...over });

  it('ranks players by EXP/h, one entry per player', () => {
    const ranked = rankPlayers([
      by('slow', { expGained: 100_000 }),
      by('fast', { expGained: 300_000 }),
      by('fast', { expGained: 100_000, startedAt: 9 }),
    ]);
    expect(ranked.map((p) => [p.player, p.expPerHour, p.sessions])).toEqual([['fast', 200_000, 2], ['slow', 100_000, 1]]);
  });

  it('adds a player\'s time before dividing, so a long stay outweighs a short burst', () => {
    const [p] = rankPlayers([
      by('a', { seconds: 1800, expGained: 100_000 }), // 200K/h for 30 min
      by('a', { seconds: 5400, expGained: 100_000, startedAt: 5 }), // 66.7K/h for 90 min
    ]);
    expect(p.expPerHour).toBe(100_000); // 200K EXP over 2h of tracked time
  });

  it('keeps only the top 9 by default and breaks ties on the name', () => {
    const ten = Array.from({ length: 10 }, (_, i) => by(`p${i}`, { expGained: 100_000 }));
    const ranked = rankPlayers(ten);
    expect(ranked).toHaveLength(9);
    expect(ranked.map((p) => p.player)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  });

  it('takes level and job from the newest session', () => {
    const [p] = rankPlayers([
      by('a', { startedAt: 1, levelTo: 40, job: 'Old Job' }),
      by('a', { startedAt: 9, levelTo: 41, job: null }),
    ]);
    expect(p.level).toBe(41);
    expect(p.job).toBe('Old Job');
  });

  it('does not modify its input', () => {
    const input = [by('a'), by('b')];
    const copy = [...input];
    rankPlayers(input);
    expect(input).toEqual(copy);
  });
});

describe('topPlayersForMap and the map leader', () => {
  it('looks only at the sessions on that map', () => {
    const sessions = [
      session({ id: '1', map: 'A', playerKey: 'x', player: 'X', expGained: 400_000 }),
      session({ id: '2', map: 'B', playerKey: 'y', player: 'Y', expGained: 900_000 }),
    ];
    expect(topPlayersForMap(sessions, 'A').map((p) => p.player)).toEqual(['X']);
  });

  it('names the fastest player as the leader of each map', () => {
    const ranks = rankMaps([
      session({ id: '1', map: 'A', playerKey: 'x', player: 'X', expGained: 100_000 }),
      session({ id: '2', map: 'A', playerKey: 'y', player: 'Y', expGained: 300_000 }),
    ]);
    expect(ranks[0].leader?.player).toBe('Y');
    expect(ranks[0].leader?.expPerHour).toBe(300_000);
  });
});
