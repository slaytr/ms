import { describe, expect, it } from 'vitest';

import { otherTheme, resolveTheme, saveTheme } from './theme.ts';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};

describe('theme', () => {
  it('uses the saved choice over the system preference', () => {
    expect(resolveTheme(memory({ 'maple-metrics:theme': 'light' }), true)).toBe('light');
    expect(resolveTheme(memory({ 'maple-metrics:theme': 'dark' }), false)).toBe('dark');
  });

  it('falls back to the system preference when nothing valid is saved', () => {
    expect(resolveTheme(memory(), true)).toBe('dark');
    expect(resolveTheme(memory({ 'maple-metrics:theme': 'blue' }), false)).toBe('light');
    expect(resolveTheme(null, true)).toBe('dark');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(resolveTheme(broken, false)).toBe('light');
    expect(() => saveTheme(broken, 'dark')).not.toThrow();
  });

  it('round-trips and toggles', () => {
    const store = memory();
    saveTheme(store, 'dark');
    expect(resolveTheme(store, false)).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('dark');
  });
});
