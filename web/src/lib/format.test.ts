import { describe, expect, it } from 'vitest';

import { formatCompact, formatPerHour } from './format';

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
