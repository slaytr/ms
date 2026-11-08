import { describe, expect, it } from 'vitest';

import { clearProfile, loadProfile, mergeProfile, sameProfile, saveProfile, withTypedName, type CharacterProfile } from './profile';

const plate = (over: Partial<{ fingerprint: string | null; name: string | null; job: string | null }> = {}) => ({
  fingerprint: 'abc123',
  name: 'PayYoBills',
  job: 'Wizard (Ice,Lightning)',
  ...over,
});

const saved: CharacterProfile = { fingerprint: 'abc123', name: 'PayYoBills', job: 'Wizard (Ice,Lightning)', level: 49, updatedAt: 1 };

function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('mergeProfile', () => {
  it('creates a profile from the first sighting', () => {
    expect(mergeProfile(null, plate(), 49, 5)).toEqual({ ...saved, updatedAt: 5 });
  });

  it('keeps the previous profile when no character is on screen', () => {
    expect(mergeProfile(saved, plate({ fingerprint: null }), null, 9)).toBe(saved);
    expect(mergeProfile(null, plate({ fingerprint: null }), null, 9)).toBeNull();
  });

  it('fills unreadable fields from the same character, never from another', () => {
    const partial = plate({ name: null, job: null });
    expect(mergeProfile(saved, partial, null, 9)).toMatchObject({ name: 'PayYoBills', job: 'Wizard (Ice,Lightning)', level: 49 });

    const other = mergeProfile(saved, { ...partial, fingerprint: 'zzz999' }, null, 9);
    expect(other).toMatchObject({ fingerprint: 'zzz999', name: null, job: null, level: null });
  });

  it('takes the newest level (they levelled up)', () => {
    expect(mergeProfile(saved, plate(), 50, 9)?.level).toBe(50);
  });

  it('does not mutate its input', () => {
    const frozen = Object.freeze({ ...saved });
    expect(() => mergeProfile(frozen, plate(), 50, 9)).not.toThrow();
    expect(frozen.level).toBe(49);
  });
});

describe('withTypedName / sameProfile', () => {
  it('trims and caps a typed name, and ignores blanks', () => {
    expect(withTypedName(saved, '  Bill  ').name).toBe('Bill');
    expect(withTypedName(saved, 'x'.repeat(50)).name).toHaveLength(20);
    expect(withTypedName(saved, '   ')).toBe(saved);
  });

  it('compares everything except the timestamp', () => {
    expect(sameProfile(saved, { ...saved, updatedAt: 99 })).toBe(true);
    expect(sameProfile(saved, { ...saved, level: 50 })).toBe(false);
    expect(sameProfile(null, null)).toBe(true);
    expect(sameProfile(saved, null)).toBe(false);
  });
});

describe('profile storage', () => {
  it('round-trips through storage', () => {
    const store = fakeStore();
    saveProfile(saved, store);
    expect(loadProfile(store)).toEqual(saved);
    clearProfile(store);
    expect(loadProfile(store)).toBeNull();
  });

  it('treats corrupt or hostile stored data as a first visit', () => {
    const key = 'maple-metrics:character';
    expect(loadProfile(fakeStore({ [key]: '{not json' }))).toBeNull();
    expect(loadProfile(fakeStore({ [key]: '"a string"' }))).toBeNull();
    expect(loadProfile(fakeStore({ [key]: JSON.stringify({ name: 'no fingerprint' }) }))).toBeNull();
    const weird = loadProfile(fakeStore({ [key]: JSON.stringify({ fingerprint: 'f', level: 99999, name: 42 }) }));
    expect(weird).toMatchObject({ fingerprint: 'f', level: null, name: null });
  });

  it('never throws when storage is unavailable or throwing', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    const broken = { getItem: boom, setItem: boom, removeItem: boom };
    expect(loadProfile(broken)).toBeNull();
    expect(() => saveProfile(saved, broken)).not.toThrow();
    expect(() => clearProfile(broken)).not.toThrow();
    expect(loadProfile(null)).toBeNull();
  });
});
