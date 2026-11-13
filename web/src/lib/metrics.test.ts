import { describe, expect, it } from 'vitest';

import { computeRates, expGainSeries, type Reading } from './metrics';

const HOUR = 3_600_000;
const reading = (minutes: number, over: Partial<Reading> = {}): Reading => ({
  takenAt: minutes * 60_000,
  meso: null,
  exp: null,
  expPct: null,
  level: null,
  ...over,
});

describe('computeRates: meso', () => {
  it('returns zeroed rates for fewer than two readings', () => {
    expect(computeRates([]).mesoPerHour).toBe(0);
    expect(computeRates([reading(0, { meso: 100 })]).elapsedMs).toBe(0);
  });

  it('extrapolates meso/hour from gained meso', () => {
    const r = computeRates([reading(0, { meso: 1_000 }), reading(30, { meso: 6_000 })]);
    expect(r.mesoGained).toBe(5_000);
    expect(r.elapsedMs).toBe(HOUR / 2);
    expect(r.mesoPerHour).toBe(10_000);
  });

  it('does not count spending (meso decreases) as negative income', () => {
    const r = computeRates([
      reading(0, { meso: 10_000 }),
      reading(10, { meso: 15_000 }),
      reading(20, { meso: 2_000 }), // bought something
      reading(30, { meso: 5_000 }),
    ]);
    expect(r.mesoGained).toBe(8_000);
  });

  it('skips readings where detection failed (null) without breaking the chain', () => {
    const r = computeRates([reading(0, { meso: 1_000 }), reading(10, { meso: null }), reading(20, { meso: 3_000 })]);
    expect(r.mesoGained).toBe(2_000);
  });
});

describe('computeRates: raw EXP', () => {
  it('sums raw EXP points and extrapolates per hour', () => {
    const r = computeRates([
      reading(0, { exp: 17_691, expPct: 2.7, level: 49 }),
      reading(15, { exp: 20_000, expPct: 3.05, level: 49 }),
      reading(30, { exp: 23_691, expPct: 3.61, level: 49 }),
    ]);
    expect(r.expGained).toBe(6_000);
    expect(r.expPerHour).toBe(12_000);
  });

  it('does not count an EXP drop (death penalty) as negative income', () => {
    const r = computeRates([
      reading(0, { exp: 50_000, level: 49 }),
      reading(10, { exp: 60_000, level: 49 }),
      reading(20, { exp: 55_000, level: 49 }), // died
      reading(30, { exp: 58_000, level: 49 }),
    ]);
    expect(r.expGained).toBe(13_000);
  });

  it('survives a level-up using the exact level size from the EXP table', () => {
    // Level 49 needs 655,200: 5,200 left to level, then 1,000 into level 50.
    const r = computeRates([
      reading(0, { exp: 650_000, expPct: 99.21, level: 49 }),
      reading(30, { exp: 1_000, expPct: 0.14, level: 50 }),
    ]);
    expect(r.expGained).toBe(6_200);
  });

  it('estimates the level size from raw EXP and percent when the level is not in the table', () => {
    // Level 150 is past the table. 90% = 90,000 EXP, so the level needs 100,000: 10,000 left + 500 more.
    const r = computeRates([
      reading(0, { exp: 90_000, expPct: 90, level: 150 }),
      reading(30, { exp: 500, expPct: 0.4, level: 151 }),
    ]);
    expect(r.expGained).toBeCloseTo(10_500);
  });

  it('infers a level-up from a large percent drop when the level was not read', () => {
    const r = computeRates([reading(0, { exp: 90_000, expPct: 90 }), reading(30, { exp: 500, expPct: 0.4 })]);
    expect(r.expGained).toBeCloseTo(10_500);
  });

  it('skips the level-up gap rather than inventing EXP when the level size cannot be estimated', () => {
    // Level 150 is not in the table, and a previous reading at 0% tells us nothing about the level size.
    const r = computeRates([reading(0, { exp: 0, expPct: 0, level: 150 }), reading(30, { exp: 400, expPct: 0.3, level: 151 })]);
    expect(r.expGained).toBe(0);
  });

  it('counts the whole of a level-up that starts at 0 EXP when the level is in the table', () => {
    const r = computeRates([reading(0, { exp: 0, expPct: 0, level: 49 }), reading(30, { exp: 400, expPct: 0.06, level: 50 })]);
    expect(r.expGained).toBe(655_600);
  });

  it('ignores readings without raw EXP', () => {
    const r = computeRates([reading(0, { exp: 1_000 }), reading(10, { exp: null }), reading(20, { exp: 4_000 })]);
    expect(r.expGained).toBe(3_000);
  });
});

describe('computeRates: EXP percent', () => {
  it('sums EXP percent across a level-up using the level reading', () => {
    const r = computeRates([reading(0, { expPct: 90, level: 200 }), reading(30, { expPct: 10, level: 201 })]);
    expect(r.expPctGained).toBeCloseTo(20);
    expect(r.expPctPerHour).toBeCloseTo(40);
  });

  it('infers a level-up from a large EXP drop when level was not read', () => {
    const r = computeRates([reading(0, { expPct: 95 }), reading(30, { expPct: 5 })]);
    expect(r.expPctGained).toBeCloseTo(10);
  });

  it('treats a small EXP drop with no level change as noise, not a level-up', () => {
    const r = computeRates([reading(0, { expPct: 50.2 }), reading(30, { expPct: 50.0 })]);
    expect(r.expPctGained).toBe(0);
  });
});

describe('expGainSeries', () => {
  it('is empty with no EXP readings', () => {
    expect(expGainSeries([])).toEqual([]);
    expect(expGainSeries([reading(0, { meso: 5 })])).toEqual([]);
  });

  it('starts at zero and accumulates gains by elapsed time', () => {
    const series = expGainSeries([reading(0, { exp: 100 }), reading(1, { exp: 160 }), reading(3, { exp: 400 })]);
    expect(series).toEqual([
      { elapsedMs: 0, gained: 0 },
      { elapsedMs: 60_000, gained: 60 },
      { elapsedMs: 180_000, gained: 300 },
    ]);
  });

  it('never goes down on a death penalty', () => {
    const series = expGainSeries([reading(0, { exp: 500 }), reading(1, { exp: 300 }), reading(2, { exp: 350 })]);
    expect(series.map((p) => p.gained)).toEqual([0, 0, 50]);
  });

  it('carries the total across a level-up using the EXP table', () => {
    // Level 1 needs 15 EXP: 5 left in level 1, then 5 into level 2.
    const series = expGainSeries([reading(0, { exp: 10, level: 1 }), reading(1, { exp: 5, level: 2 })]);
    expect(series[1].gained).toBe(10);
  });

  it('ignores readings with no EXP and sorts out-of-order input', () => {
    const series = expGainSeries([reading(2, { exp: 300 }), reading(1, { exp: null }), reading(0, { exp: 100 })]);
    expect(series.map((p) => p.gained)).toEqual([0, 200]);
  });

  it('ends at the same total computeRates reports', () => {
    const readings = [reading(0, { exp: 100 }), reading(5, { exp: 900 }), reading(9, { exp: 1500 })];
    expect(expGainSeries(readings).at(-1)?.gained).toBe(computeRates(readings).expGained);
  });
});

describe('computeRates with a wall clock', () => {
  it('measures elapsed time up to now, so the clock runs between readings', () => {
    const readings = [reading(0, { exp: 1000 }), reading(10, { exp: 2000 })];
    expect(computeRates(readings).elapsedMs).toBe(10 * 60_000);
    expect(computeRates(readings, 30 * 60_000).elapsedMs).toBe(30 * 60_000);
  });

  it('projects the rate from the start and the latest reading over the time so far', () => {
    const readings = [reading(0, { exp: 0 }), reading(30, { exp: 60_000 })];
    expect(computeRates(readings, 30 * 60_000).expPerHour).toBe(120_000);
    expect(computeRates(readings, 60 * 60_000).expPerHour).toBe(60_000);
  });

  it('starts counting time from a single reading', () => {
    const r = computeRates([reading(0, { exp: 5 })], 90_000);
    expect(r.elapsedMs).toBe(90_000);
    expect(r.expGained).toBe(0);
  });

  it('ignores a clock earlier than the last reading, and still returns zero with no readings', () => {
    const readings = [reading(0, { exp: 1 }), reading(5, { exp: 2 })];
    expect(computeRates(readings, 60_000).elapsedMs).toBe(5 * 60_000);
    expect(computeRates([], 99_000).elapsedMs).toBe(0);
  });
});

describe('computeRates: a level label that lags the EXP reset', () => {
  // Readings are ~3s apart. Level 50's digits can't be read yet, so right after a level-up the level is
  // inferred from EXP and can stay on the old level for a tick before it corrects to the new one.
  const SEC = 1 / 20; // 3 seconds, in minutes

  it('counts a level-up once when the label is still the old level on the tick EXP resets, then catches up', () => {
    const r = computeRates([
      reading(0, { exp: 650_000, expPct: 99.21, level: 49 }),
      reading(SEC, { exp: 100, expPct: 0.02, level: 49 }), // EXP has reset, label not yet
      reading(2 * SEC, { exp: 900, expPct: 0.13, level: 50 }), // label catches up
    ]);
    // 5,200 left in level 49, then 100, then 800 more: 6,100. Not another whole level on top.
    expect(r.expGained).toBe(6_100);
    expect(r.expPctGained).toBeCloseTo(0.92, 2);
  });

  it('does not add a whole level when the label rises a few seconds apart with EXP still climbing', () => {
    const r = computeRates([
      reading(0, { exp: 0, expPct: 0, level: 49 }),
      reading(SEC, { exp: 500, expPct: 0.07, level: 50 }),
    ]);
    expect(r.expGained).toBe(500);
    expect(r.expPctGained).toBeCloseTo(0.07, 2);
  });

  it('still counts a real level-up when the EXP counter dropped', () => {
    const r = computeRates([
      reading(0, { exp: 650_000, expPct: 99.21, level: 49 }),
      reading(SEC, { exp: 1_200, expPct: 0.17, level: 50 }),
    ]);
    expect(r.expGained).toBe(6_400);
  });
});

describe('computeRates: paused tracking', () => {
  const MIN = 60_000;
  // 0 to 10 min tracking, paused 10 to 40 min, tracking again 40 to 50 min. EXP rises 1000 per tracked 10 min,
  // and jumps by 5000 while paused.
  const readings = [
    reading(0, { exp: 1_000 }),
    reading(10, { exp: 2_000 }),
    reading(40, { exp: 7_000 }),
    reading(50, { exp: 8_000 }),
  ];
  const pauses = [{ from: 10 * MIN, to: 40 * MIN }];

  it('leaves the paused time out of elapsed time', () => {
    expect(computeRates(readings, undefined, pauses).elapsedMs).toBe(20 * MIN);
  });

  it('adds nothing for what changed across the pause', () => {
    expect(computeRates(readings, undefined, pauses).expGained).toBe(2_000);
    expect(computeRates(readings).expGained).toBe(7_000); // without the pause, the jump would count
  });

  it('projects the rate from counted time only', () => {
    expect(computeRates(readings, undefined, pauses).expPerHour).toBe(6_000); // 2000 EXP in 20 counted minutes
  });

  it('freezes the clock while a pause is still going', () => {
    const open = [{ from: 10 * MIN, to: null }];
    const early = computeRates([reading(0, { exp: 1 }), reading(10, { exp: 2 })], 20 * MIN, open);
    const later = computeRates([reading(0, { exp: 1 }), reading(10, { exp: 2 })], 90 * MIN, open);
    expect(early.elapsedMs).toBe(10 * MIN);
    expect(later.elapsedMs).toBe(10 * MIN);
  });

  it('skips the meso and percent gain across a pause too', () => {
    const rs = [
      reading(0, { meso: 100, expPct: 10 }),
      reading(10, { meso: 200, expPct: 20 }),
      reading(40, { meso: 9_000, expPct: 80 }),
    ];
    const r = computeRates(rs, undefined, [{ from: 10 * MIN, to: 40 * MIN }]);
    expect(r.mesoGained).toBe(100);
    expect(r.expPctGained).toBe(10);
  });

  it('draws the chart with paused time removed and no jump', () => {
    const series = expGainSeries(readings, pauses);
    expect(series.map((p) => [p.elapsedMs / MIN, p.gained])).toEqual([[0, 0], [10, 1_000], [10, 1_000], [20, 2_000]]);
  });
});
