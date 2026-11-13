import { describe, expect, it } from 'vitest';

import { MAX_LABEL_LENGTH } from './map-label';
import { cleanSessionName, parsePartySize, partyText, stepPartySize } from './session-input';

describe('cleanSessionName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanSessionName('  Lab   run ')).toBe('Lab run');
  });

  it('caps the length at the API limit', () => {
    expect(cleanSessionName('x'.repeat(300))).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('is null for blank text and control characters', () => {
    expect(cleanSessionName('   ')).toBeNull();
    expect(cleanSessionName('')).toBeNull();
    expect(cleanSessionName('a\nb')).toBeNull();
  });
});

describe('parsePartySize', () => {
  it('reads whole numbers 1 to 6', () => {
    expect(parsePartySize('1')).toBe(1);
    expect(parsePartySize(' 6 ')).toBe(6);
  });

  it('refuses anything else instead of guessing', () => {
    for (const bad of ['', '0', '7', '2.5', '-1', 'three', '03x', '100']) expect(parsePartySize(bad)).toBeNull();
  });
});

describe('stepPartySize', () => {
  it('moves by one and stops at the ends', () => {
    expect(stepPartySize(3, 1)).toBe(4);
    expect(stepPartySize(3, -1)).toBe(2);
    expect(stepPartySize(1, -1)).toBe(1);
    expect(stepPartySize(6, 1)).toBe(6);
  });
});

describe('partyText', () => {
  it('says Solo for one and the size otherwise', () => {
    expect(partyText(1)).toBe('Solo');
    expect(partyText(4)).toBe('Party of 4');
  });
});
