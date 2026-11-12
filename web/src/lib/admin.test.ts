import { describe, expect, it } from 'vitest';

import { isAdminProfile, parseNumberField, sessionCount, snapshotForm, snapshotPatch, type AdminSnapshot } from './admin';

const saved: AdminSnapshot = { name: 'Bill', job: 'Hero', level: 34, exp: 1200, expPct: 12.5, meso: 5000 };

describe('isAdminProfile', () => {
  it('matches PayYoBills, ignoring case and padding', () => {
    expect(isAdminProfile({ name: 'PayYoBills' })).toBe(true);
    expect(isAdminProfile({ name: ' payyobills ' })).toBe(true);
  });

  it('refuses everyone else, including no profile', () => {
    expect(isAdminProfile({ name: 'PayYoBill' })).toBe(false);
    expect(isAdminProfile({ name: null })).toBe(false);
    expect(isAdminProfile(null)).toBe(false);
  });
});

describe('parseNumberField', () => {
  it('reads plain and comma-grouped numbers', () => {
    expect(parseNumberField('meso', '1,234,567')).toEqual({ value: 1234567, error: null });
    expect(parseNumberField('expPct', '12.34')).toEqual({ value: 12.34, error: null });
  });

  it('treats blank as clearing the field', () => {
    expect(parseNumberField('level', '  ')).toEqual({ value: null, error: null });
  });

  it('rejects junk, fractions of whole fields and out-of-range values', () => {
    expect(parseNumberField('level', 'abc').error).not.toBeNull();
    expect(parseNumberField('level', '3.5').error).not.toBeNull();
    expect(parseNumberField('level', '301').error).not.toBeNull();
    expect(parseNumberField('level', '0').error).not.toBeNull();
    expect(parseNumberField('expPct', '100.5').error).not.toBeNull();
    expect(parseNumberField('meso', '-1').error).not.toBeNull();
  });
});

describe('snapshotPatch', () => {
  it('is empty when nothing changed', () => {
    expect(snapshotPatch(saved, snapshotForm(saved))).toEqual({ patch: {}, errors: [] });
  });

  it('holds only the fields that changed', () => {
    const form = { ...snapshotForm(saved), level: '35', name: '  PayYoBills ' };
    expect(snapshotPatch(saved, form).patch).toEqual({ level: 35, name: 'PayYoBills' });
  });

  it('clears a field when its box is emptied', () => {
    const form = { ...snapshotForm(saved), meso: '', job: '' };
    expect(snapshotPatch(saved, form).patch).toEqual({ meso: null, job: null });
  });

  it('treats a missing snapshot as all blank, so only typed values are sent', () => {
    const form = { ...snapshotForm(null), level: '10', name: 'Newbie' };
    expect(snapshotPatch(null, form).patch).toEqual({ level: 10, name: 'Newbie' });
  });

  it('reports bad numbers and leaves them out of the patch', () => {
    const result = snapshotPatch(saved, { ...snapshotForm(saved), level: 'x', exp: '5' });
    expect(result.errors).toHaveLength(1);
    expect(result.patch).toEqual({ exp: 5 });
  });
});

describe('sessionCount', () => {
  it('pluralises', () => {
    expect(sessionCount(1)).toBe('1 session');
    expect(sessionCount(3)).toBe('3 sessions');
  });
});
