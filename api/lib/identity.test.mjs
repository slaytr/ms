import { describe, expect, it } from 'vitest';

import { cleanIdentity, pickIdentity } from './identity.mjs';

describe('cleanIdentity', () => {
  it('trims the name and spec', () => {
    expect(cleanIdentity('  Bill  ', ' Assassin ')).toEqual({ name: 'Bill', job: 'Assassin' });
  });

  it('needs both a name and a spec', () => {
    expect(cleanIdentity('   ', 'Assassin')).toBeNull();
    expect(cleanIdentity('Bill', '')).toBeNull();
    expect(cleanIdentity(undefined, 'Assassin')).toBeNull();
    expect(cleanIdentity('Bill', 42)).toBeNull();
  });

  it('caps the name at 20 characters, like the form does', () => {
    expect(cleanIdentity('x'.repeat(50), 'Cleric').name).toHaveLength(20);
  });

  it('collapses inner whitespace runs and rejects control characters', () => {
    expect(cleanIdentity('Pay  Yo', 'Cleric').name).toBe('Pay Yo');
    expect(cleanIdentity('Bi\u0000ll', 'Cleric')).toBeNull();
  });
});

describe('pickIdentity', () => {
  const typed = { name: 'Typed', job: 'Bandit' };
  const detected = { name: 'Detected', job: 'Wizard (Ice,Lightning)' };

  it('prefers what the player typed', () => {
    expect(pickIdentity(typed, detected)).toEqual(typed);
  });

  it('falls back to the character the detector read before for the same fingerprint', () => {
    expect(pickIdentity(undefined, detected)).toEqual(detected);
    expect(pickIdentity({ name: 'Half', job: '' }, detected)).toEqual(detected);
  });

  it('needs both a name and a spec from one source, never mixing two', () => {
    expect(pickIdentity({ name: 'OnlyName', job: null }, { name: null, job: 'OnlyJob' })).toBeNull();
  });

  it('is null when nothing is known', () => {
    expect(pickIdentity(undefined, undefined)).toBeNull();
    expect(pickIdentity({ name: ' ', job: ' ' }, undefined)).toBeNull();
  });
});
