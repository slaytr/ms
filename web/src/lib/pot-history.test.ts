import { describe, expect, it } from 'vitest';

import { emptyPotHistory, recordPotHistory } from './pot-history';
import type { PotRow, PotView } from './pot-tracker';

const row = (id: number, used: number): PotRow => ({
  id, name: `Pot ${id}`, source: 'quick', before: 100, now: 100 - used, stale: false, used, mesos: 0, hp: 0, mp: 0,
});
const view = (...rows: PotRow[]): PotView => ({
  rows,
  totals: { used: 0, mesos: 0, mesosUnknownFor: 0, hp: 0, mp: 0, percentItemsUsed: 0 },
  scrolledAway: false, paused: false, unreadable: [], usesTab: false, since: 0,
});

describe('recordPotHistory', () => {
  it('ignores a missing view', () => {
    expect(recordPotHistory(emptyPotHistory, null, 0, 1000)).toBe(emptyPotHistory);
  });

  it('starts a series when an item first appears, relative to the origin', () => {
    const next = recordPotHistory(emptyPotHistory, view(row(1, 0)), 1000, 4000);
    expect(next.series.get(1)).toEqual([{ elapsedMs: 3000, used: 0 }]);
  });

  it('adds a sample only when the total changes', () => {
    const a = recordPotHistory(emptyPotHistory, view(row(1, 0)), 0, 0);
    expect(recordPotHistory(a, view(row(1, 0)), 0, 3000)).toBe(a);
    const b = recordPotHistory(a, view(row(1, 2)), 0, 6000);
    expect(b.series.get(1)).toEqual([{ elapsedMs: 0, used: 0 }, { elapsedMs: 6000, used: 2 }]);
  });

  it('does not mutate the previous history', () => {
    const a = recordPotHistory(emptyPotHistory, view(row(1, 0)), 0, 0);
    recordPotHistory(a, view(row(1, 5)), 0, 3000);
    expect(a.series.get(1)).toHaveLength(1);
  });
});
