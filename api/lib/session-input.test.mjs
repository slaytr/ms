import { describe, expect, it } from 'vitest';

import { cleanPartySize, cleanSessionLabel, MAX_LABEL_LENGTH } from './session-input.mjs';

describe('cleanSessionLabel', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanSessionLabel('  Hunting   at  Lab ')).toBe('Hunting at Lab');
  });

  it('caps the length', () => {
    expect(cleanSessionLabel('a'.repeat(200))).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('refuses empty, non-text and control characters', () => {
    expect(cleanSessionLabel('   ')).toBeNull();
    expect(cleanSessionLabel(undefined)).toBeNull();
    expect(cleanSessionLabel(5)).toBeNull();
    expect(cleanSessionLabel('bad\u0000name')).toBeNull();
    expect(cleanSessionLabel('two\nlines')).toBeNull();
  });
});

describe('cleanPartySize', () => {
  it('accepts whole numbers 1 to 6', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(cleanPartySize(n)).toBe(n);
  });

  it('refuses everything else', () => {
    for (const bad of [0, 7, -1, 2.5, NaN, '3', null, undefined]) expect(cleanPartySize(bad)).toBeNull();
  });
});
