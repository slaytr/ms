import { describe, expect, it } from 'vitest';

import { expToNext } from '../../web/src/data/expTable.ts';
import { sessionGains } from './session-gains.mjs';

const MIN = 60_000;
// Rows as pg returns them: bigint and numeric come back as strings.
const row = (minutes, over) => ({ taken_at: new Date(minutes * MIN), meso: null, exp: null, exp_pct: null, level: 62, ...over });

describe('sessionGains', () => {
  it('counts a percent-only level-up from the percent and the EXP table, not as zero', () => {
    const g = sessionGains([row(0, { exp_pct: '99.00' }), row(10, { exp_pct: '1.00', level: 63 })]);
    expect(g.expGained).toBe(Math.round(expToNext(62) * 0.01 + expToNext(63) * 0.01));
    expect(g.expEstimated).toBe(true);
  });

  it('counts a level-up inside the raw EXP stretch instead of dropping that gap', () => {
    const need = expToNext(50);
    const g = sessionGains([
      row(0, { exp: String(need - 1_000), exp_pct: '99.00', level: 50 }),
      row(10, { exp: '500', exp_pct: '0.50', level: 51 }),
    ]);
    expect(g.expGained).toBe(1_500);
    expect(g.expEstimated).toBe(false);
  });

  it('adds the percent-sized gain after raw EXP disappears to the exact gain before it', () => {
    const g = sessionGains([
      row(0, { exp: '900000', exp_pct: '50.00' }),
      row(10, { exp: '950000', exp_pct: '52.00' }),
      row(20, { exp_pct: '53.00' }),
    ]);
    expect(g.expGained).toBe(Math.round(50_000 + expToNext(62) * 0.01));
    expect(g.expEstimated).toBe(true);
  });

  it('counts a raw EXP level-up followed by percent-only readings', () => {
    const need = expToNext(62);
    const g = sessionGains([
      row(0, { exp: String(need - 2_000), exp_pct: '99.00', level: 62 }),
      row(10, { exp: '1000', exp_pct: '0.10', level: 63 }),
      row(20, { exp_pct: '1.10', level: 63 }),
    ]);
    expect(g.expGained).toBe(Math.round(3_000 + expToNext(63) * 0.01));
  });

  it('adds up meso and percent gained, and is zero with no readings', () => {
    const g = sessionGains([row(0, { meso: '100', exp_pct: '10.00' }), row(5, { meso: '350', exp_pct: '12.50' })]);
    expect(g.mesoGained).toBe(250);
    expect(g.expPctGained).toBeCloseTo(2.5);
    expect(sessionGains([])).toEqual({ expGained: 0, expEstimated: false, expPctGained: 0, mesoGained: 0 });
  });
});
