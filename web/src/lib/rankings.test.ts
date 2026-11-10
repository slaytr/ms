import { describe, expect, it } from 'vitest';

import type { MapSession } from './maps';
import { topByExp, topByLevels, topByMesos } from './rankings';

const session = (over: Partial<MapSession>): MapSession => ({
  id: 's',
  map: 'Map',
  player: 'A',
  job: null,
  playerKey: 'a',
  startedAt: 0,
  seconds: 3600,
  levelFrom: 50,
  levelTo: 50,
  expGained: 100,
  expPctGained: 1,
  mesoGained: 0,
  ...over,
});

describe('topByExp', () => {
  it('adds a player\'s sessions together and ranks by EXP gained', () => {
    const ranked = topByExp([
      session({ playerKey: 'a', player: 'A', expGained: 300 }),
      session({ playerKey: 'a', player: 'A', expGained: 300 }),
      session({ playerKey: 'b', player: 'B', expGained: 500 }),
    ]);
    expect(ranked.map((r) => [r.player, r.expGained, r.sessions])).toEqual([
      ['A', 600, 2],
      ['B', 500, 1],
    ]);
  });

  it('keeps only the top 3 and skips players who gained nothing', () => {
    const sessions = ['a', 'b', 'c', 'd', 'e'].map((k, i) => session({ playerKey: k, player: k, expGained: i * 10 }));
    expect(topByExp(sessions).map((r) => r.player)).toEqual(['e', 'd', 'c']);
  });

  it('takes level and job from the newest session, and breaks ties on level share then name', () => {
    const ranked = topByExp([
      session({ playerKey: 'a', player: 'A', startedAt: 1, levelTo: 50, job: 'Mage', expGained: 10, expPctGained: 1 }),
      session({ playerKey: 'a', player: 'A', startedAt: 2, levelTo: 51, job: null, expGained: 10, expPctGained: 1 }),
      session({ playerKey: 'b', player: 'B', expGained: 20, expPctGained: 5 }),
      session({ playerKey: 'c', player: 'C', expGained: 20, expPctGained: 5 }),
    ]);
    expect(ranked.map((r) => r.player)).toEqual(['B', 'C', 'A']);
    expect(ranked[2]).toMatchObject({ level: 51, job: 'Mage' });
  });

  it('does not modify its input', () => {
    const input = [session({ playerKey: 'b' }), session({ playerKey: 'a', expGained: 5 })];
    topByExp(input);
    expect(input.map((s) => s.playerKey)).toEqual(['b', 'a']);
  });
});

describe('topByLevels', () => {
  it('ranks by the share of a level gained across all sessions (100 = one level) and reports it in levels', () => {
    const ranked = topByLevels([
      session({ playerKey: 'a', player: 'A', expPctGained: 60 }),
      session({ playerKey: 'a', player: 'A', expPctGained: 80 }),
      session({ playerKey: 'b', player: 'B', expPctGained: 100 }),
      session({ playerKey: 'c', player: 'C', expPctGained: 0 }),
    ]);
    expect(ranked.map((r) => [r.player, r.levelsGained])).toEqual([['A', 1.4], ['B', 1]]);
  });

  it('is not thrown by a misread level label, since it never looks at levels', () => {
    const ranked = topByLevels([session({ playerKey: 'a', player: 'A', levelFrom: 4, levelTo: 49, expPctGained: 30 })]);
    expect(ranked[0].levelsGained).toBeCloseTo(0.3);
  });

  it('keeps only the top 3', () => {
    const sessions = ['a', 'b', 'c', 'd'].map((k, i) => session({ playerKey: k, player: k, expPctGained: (i + 1) * 10 }));
    expect(topByLevels(sessions).map((r) => r.player)).toEqual(['d', 'c', 'b']);
  });
});

describe('topByMesos', () => {
  it('adds each player mesos across sessions, ranks the most first and skips players with none', () => {
    const ranked = topByMesos([
      session({ playerKey: 'a', player: 'A', mesoGained: 400 }),
      session({ playerKey: 'a', player: 'A', mesoGained: 400 }),
      session({ playerKey: 'b', player: 'B', mesoGained: 500 }),
      session({ playerKey: 'c', player: 'C', mesoGained: 0 }),
    ]);
    expect(ranked.map((r) => [r.player, r.mesoGained])).toEqual([['A', 800], ['B', 500]]);
  });

  it('breaks ties on the name', () => {
    const ranked = topByMesos([session({ playerKey: 'b', player: 'B', mesoGained: 5 }), session({ playerKey: 'a', player: 'A', mesoGained: 5 })]);
    expect(ranked.map((r) => r.player)).toEqual(['A', 'B']);
  });
});
