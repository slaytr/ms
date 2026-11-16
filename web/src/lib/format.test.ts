import { describe, expect, it } from 'vitest';

import { formatAgo, formatCompact, formatPerHour } from './format';

describe('formatPerHour', () => {
  it('shows whole numbers below 1000', () => {
    expect(formatPerHour(0)).toBe('0');
    expect(formatPerHour(7)).toBe('7');
    expect(formatPerHour(999)).toBe('999');
  });

  it('switches to numK at 1000', () => {
    expect(formatPerHour(1000)).toBe('1K');
    expect(formatPerHour(96_400)).toBe('96K');
    expect(formatPerHour(250_000)).toBe('250K');
  });

  it('truncates instead of rounding, so it never overstates', () => {
    expect(formatPerHour(999.9)).toBe('999');
    expect(formatPerHour(1999.99)).toBe('1K');
    expect(formatPerHour(96_999)).toBe('96K');
  });

  it('keeps counting in K for millions rather than inventing another unit', () => {
    expect(formatPerHour(1_234_567)).toBe('1234K');
  });

  it('falls back to 0 for empty, negative or broken input', () => {
    expect(formatPerHour(-5)).toBe('0');
    expect(formatPerHour(Number.NaN)).toBe('0');
    expect(formatPerHour(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('formatCompact', () => {
  it('keeps small numbers whole', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(950)).toBe('950');
  });

  it('shortens thousands, millions and billions with at most one decimal', () => {
    expect(formatCompact(1000)).toBe('1K');
    expect(formatCompact(12_500)).toBe('12.5K');
    expect(formatCompact(3_000_000)).toBe('3M');
    expect(formatCompact(9_482_161_548)).toBe('9.5B');
  });

  it('falls back to 0 for empty, negative or broken input', () => {
    expect(formatCompact(-1)).toBe('0');
    expect(formatCompact(Number.NaN)).toBe('0');
  });
});

describe('formatAgo', () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  it('says just now under a minute', () => {
    expect(formatAgo(30_000)).toBe('just now');
    expect(formatAgo(-5000)).toBe('just now');
  });
  it('counts minutes under an hour', () => {
    expect(formatAgo(MIN)).toBe('1 min ago');
    expect(formatAgo(12 * MIN + 40_000)).toBe('12 min ago');
  });
  it('counts whole hours, singular for one', () => {
    expect(formatAgo(HOUR)).toBe('1 hour ago');
    expect(formatAgo(2 * HOUR + 50 * MIN)).toBe('2 hours ago');
  });
  it('counts days from 24 hours', () => {
    expect(formatAgo(24 * HOUR)).toBe('1 day ago');
    expect(formatAgo(3 * 24 * HOUR + HOUR)).toBe('3 days ago');
  });
});
