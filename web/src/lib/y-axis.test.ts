import { describe, expect, it } from 'vitest';

import { buildYAxis } from './y-axis';

describe('buildYAxis', () => {
  it('starts at zero when the data reaches down near it', () => {
    expect(buildYAxis(0, 80_000, 1000).min).toBe(0);
  });

  it('starts near the data when it sits well above zero', () => {
    const axis = buildYAxis(125_000, 210_000, 1000);
    expect(axis.min).toBeGreaterThan(0);
    expect(axis.min).toBeLessThanOrEqual(125_000);
    expect(axis.max).toBeGreaterThanOrEqual(210_000);
  });

  it('leaves a gridline of headroom under the lowest value', () => {
    const axis = buildYAxis(120_000, 210_000, 1000);
    expect(axis.min).toBeLessThan(120_000);
  });

  it('keeps the whole data range inside the axis', () => {
    for (const [low, high] of [[3_000, 9_000], [48_000, 52_000], [250_000, 400_000]] as const) {
      const axis = buildYAxis(low, high, 1000);
      expect(axis.min).toBeLessThanOrEqual(low);
      expect(axis.max).toBeGreaterThanOrEqual(high);
    }
  });

  it('gives an empty series the floor as its top', () => {
    const axis = buildYAxis(0, 0, 1000);
    expect(axis.min).toBe(0);
    expect(axis.max).toBeGreaterThanOrEqual(1000);
  });
});
