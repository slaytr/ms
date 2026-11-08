import { describe, expect, it } from 'vitest';

import { bitmapDistance, classify, UNKNOWN } from './glyph.ts';

const ONE = ['.#.', '##.', '.#.'];
const SEVEN = ['###', '..#', '.#.'];

describe('bitmapDistance', () => {
  it('counts differing pixels', () => {
    expect(bitmapDistance(ONE, ONE)).toBe(0);
    expect(bitmapDistance(ONE, ['.#.', '##.', '.##'])).toBe(1);
  });

  it('is infinite for different sizes, so a wrong-width glyph can never match', () => {
    expect(bitmapDistance(ONE, ['.#', '##', '.#'])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('classify', () => {
  const set = { '1': [ONE], '7': [SEVEN] };

  it('returns the matching character', () => {
    expect(classify(SEVEN, set, 0)).toBe('7');
  });

  it('tolerates the configured number of pixel errors but no more', () => {
    const noisy = ['.#.', '##.', '.##'];
    expect(classify(noisy, set, 1)).toBe('1');
    expect(classify(noisy, set, 0)).toBe(UNKNOWN);
  });

  it('returns UNKNOWN for a glyph with no template instead of guessing the nearest', () => {
    expect(classify(['###', '#.#', '###'], set, 1)).toBe(UNKNOWN);
  });

  it('refuses to pick between two different characters at equal distance', () => {
    const ambiguous = { a: [['#.']], b: [['.#']] };
    expect(classify(['..'], ambiguous, 1)).toBe(UNKNOWN);
  });
});
