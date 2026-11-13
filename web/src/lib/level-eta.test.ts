import { describe, expect, it } from 'vitest';

import { estimateEta, formatEta, levelProgress, MIN_ELAPSED_FOR_ETA_MS } from './level-eta';

const HOUR = 3_600_000;

describe('levelProgress', () => {
  it('works out what is left from the EXP table (level 49 needs 655,200)', () => {
    const p = levelProgress(49, 17_691)!;
    expect(p.need).toBe(655_200);
    expect(p.remaining).toBe(637_509);
    expect(p.fraction).toBeCloseTo(0.027, 3);
  });

  it('is null when the level or EXP is unknown, or the level has no table entry', () => {
    expect(levelProgress(null, 100)).toBeNull();
    expect(levelProgress(49, null)).toBeNull();
    expect(levelProgress(100, 5)).toBeNull(); // the cap has no requirement
    expect(levelProgress(150, 5)).toBeNull();
    expect(levelProgress(0, 5)).toBeNull();
  });

  it('never reports negative remaining or more than 100% (a level-up we have not seen yet)', () => {
    const p = levelProgress(49, 700_000)!;
    expect(p.remaining).toBe(0);
    expect(p.fraction).toBe(1);
  });
});

describe('estimateEta', () => {
  const progress = levelProgress(49, 17_691)!; // 637,509 to go

  it('divides what is left by the hourly rate', () => {
    const eta = estimateEta(progress, 637_509, 10 * 60_000);
    expect(eta).toEqual({ state: 'ready', ms: HOUR });
  });

  it('gets shorter as the rate goes up', () => {
    const slow = estimateEta(progress, 100_000, 10 * 60_000);
    const fast = estimateEta(progress, 200_000, 10 * 60_000);
    expect(slow.state === 'ready' && fast.state === 'ready' && fast.ms < slow.ms).toBe(true);
  });

  it('waits for enough play before trusting a rate (one lucky kill is not a rate)', () => {
    expect(estimateEta(progress, 5_000_000, MIN_ELAPSED_FOR_ETA_MS - 1)).toEqual({ state: 'calculating' });
    expect(estimateEta(progress, 5_000_000, MIN_ELAPSED_FOR_ETA_MS).state).toBe('ready');
  });

  it('says stalled when no EXP has been gained, instead of dividing by zero', () => {
    expect(estimateEta(progress, 0, 10 * 60_000)).toEqual({ state: 'stalled' });
    expect(estimateEta(progress, Number.NaN, 10 * 60_000)).toEqual({ state: 'stalled' });
  });

  it('is unknown when level or EXP could not be read', () => {
    expect(estimateEta(null, 100_000, 10 * 60_000)).toEqual({ state: 'unknown' });
  });

  it('is now when the level is already full', () => {
    const full = levelProgress(49, 655_200)!;
    expect(estimateEta(full, 0, 0)).toEqual({ state: 'ready', ms: 0 });
  });
});

describe('formatEta', () => {
  it('shows hours and minutes, minutes, or under a minute', () => {
    expect(formatEta(2 * HOUR + 14 * 60_000)).toBe('2h 14m');
    expect(formatEta(38 * 60_000)).toBe('38m');
    expect(formatEta(20_000)).toBe('<1m');
    expect(formatEta(0)).toBe('Now');
  });

  it('rounds to the nearest minute and carries into the hour', () => {
    expect(formatEta(59 * 60_000 + 40_000)).toBe('1h 0m');
    expect(formatEta(HOUR + 29_000)).toBe('1h 0m');
  });

  it('caps absurdly long estimates', () => {
    expect(formatEta(250 * HOUR)).toBe('100h+');
  });
});

describe('levelProgress from the percent alone', () => {
  it('sizes the level from the percent when raw EXP is hidden, and says it is an estimate', () => {
    const p = levelProgress(62, null, 50)!;
    expect(p.estimated).toBe(true);
    expect(p.fraction).toBe(0.5);
    expect(p.exp + p.remaining).toBe(p.need);
  });

  it('prefers raw EXP when it is there', () => {
    const p = levelProgress(49, 17_691, 2.7)!;
    expect(p.estimated).toBe(false);
    expect(p.exp).toBe(17_691);
  });

  it('has no progress without raw EXP or a percent', () => {
    expect(levelProgress(62, null, null)).toBeNull();
    expect(levelProgress(null, null, 50)).toBeNull();
  });
});
