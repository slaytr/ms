import { describe, expect, it } from 'vitest';

import type { ExpRatePoint } from './metrics';
import { overlayGraph } from './overlay-graph';

const point = (seconds: number, expPerHour: number): ExpRatePoint => ({ elapsedMs: seconds * 1000, expPerHour });
const coords = (line: string) => line.split(' ').map((p) => p.split(',').map(Number) as [number, number]);

describe('overlayGraph', () => {
  it('is null with fewer than two points', () => {
    expect(overlayGraph([], 100, 30)).toBeNull();
    expect(overlayGraph([point(20, 5000)], 100, 30)).toBeNull();
  });

  it('starts at the left edge even when the first point comes late in the session', () => {
    const graph = overlayGraph([point(20, 5000), point(23, 6000), point(26, 5500)], 100, 30);
    expect(coords(graph!.line)[0][0]).toBe(0);
  });

  it('only fills the left part while there is little data, growing rightwards', () => {
    const graph = overlayGraph([point(20, 5000), point(23, 6000), point(26, 5500)], 100, 30);
    const xs = coords(graph!.line).map(([x]) => x);
    expect(xs[xs.length - 1]).toBeLessThan(20);
  });

  it('reaches the right edge once a full window is drawn, with the newest point there', () => {
    const rate = Array.from({ length: 700 }, (_, i) => point(20 + i * 3, 50_000 + (i % 10) * 1000));
    const xs = coords(overlayGraph(rate, 100, 30)!.line).map(([x]) => x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(100);
  });

  it('puts the y axis near the data instead of at zero', () => {
    // 150k-160k sits well above zero: the low point must not be pushed to the middle of the box.
    const graph = overlayGraph([point(20, 150_000), point(23, 160_000), point(26, 155_000)], 100, 30);
    const ys = coords(graph!.line).map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });

  it('keeps every point inside the box', () => {
    const graph = overlayGraph([point(20, 0), point(23, 90_000), point(26, 45_000)], 100, 30);
    for (const [x, y] of coords(graph!.line)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
  });
});
