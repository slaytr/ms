import { describe, expect, it } from 'vitest';

import { loadSessionToken, saveSessionToken } from './session-tokens';

function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('session tokens', () => {
  it('remembers a token per session', () => {
    const store = fakeStore();
    saveSessionToken('a', 'token-a', store);
    saveSessionToken('b', 'token-b', store);
    expect(loadSessionToken('a', store)).toBe('token-a');
    expect(loadSessionToken('b', store)).toBe('token-b');
    expect(loadSessionToken('c', store)).toBeNull();
  });

  it('keeps only the newest 100', () => {
    const store = fakeStore();
    for (let i = 0; i < 105; i++) saveSessionToken(`s${i}`, `t${i}`, store);
    expect(loadSessionToken('s0', store)).toBeNull();
    expect(loadSessionToken('s4', store)).toBeNull();
    expect(loadSessionToken('s5', store)).toBe('t5');
    expect(loadSessionToken('s104', store)).toBe('t104');
  });

  it('survives corrupt storage and a missing store', () => {
    expect(loadSessionToken('a', fakeStore({ 'maple-metrics:session-tokens': '{nope' }))).toBeNull();
    expect(loadSessionToken('a', fakeStore({ 'maple-metrics:session-tokens': '[1]' }))).toBeNull();
    expect(loadSessionToken('a', null)).toBeNull();
    expect(() => saveSessionToken('a', 't', null)).not.toThrow();
  });

  it('survives a store that refuses writes', () => {
    const store = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveSessionToken('a', 't', store)).not.toThrow();
  });
});
