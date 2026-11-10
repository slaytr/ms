import { describe, expect, it } from 'vitest';

import { cleanIdentity } from './identity.mjs';

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
