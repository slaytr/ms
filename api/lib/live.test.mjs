import { describe, expect, it } from 'vitest';

import { shapeLive } from './live.mjs';

const row = (over) => ({ id: 'a', player: 'Ann', job: 'Spearman', playerKey: 'ann', expGained: 100, startedAt: 1, ...over });
const latest = (entries) => new Map(Object.entries(entries));

describe('shapeLive', () => {
  it('joins each session with its latest level and percent', () => {
    const out = shapeLive([row({ id: 's1' })], latest({ s1: { level: 34, pct: 12.5 } }));
    expect(out).toEqual([{ id: 's1', player: 'Ann', job: 'Spearman', level: 34, pct: 12.5, expGained: 100 }]);
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
