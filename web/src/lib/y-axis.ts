/**
 * The y axis of the EXP charts: gridlines every 1, 2 or 5 times a power of ten (10k, 20k, 50k... once the
 * data is big). When the data sits well above zero (say 125k-210k) the axis starts at the gridline below the
 * lowest value instead of 0, so the line uses the height of the chart.
 */
export interface YAxis {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

const MAX_Y_INTERVALS = 6;
const MIN_BIG_STEP = 10_000;
const STEPS = [1, 2, 5].flatMap((m) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => m * 10 ** p)).sort((a, b) => a - b);

/** Round up to 1, 2, 2.5, 5 or 10 times a power of ten, so axis labels land on friendly numbers. */
function niceMax(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

/** `floor` is the smallest top the axis may have, so an empty or tiny series still gets a sensible scale. */
export function buildYAxis(low: number, high: number, floor: number): YAxis {
  const top = Math.max(high, floor);
  const bottom = Math.min(low, top);
  for (const step of STEPS) {
    if (top >= 3 * MIN_BIG_STEP && step < MIN_BIG_STEP) continue;
    const max = Math.ceil(top / step) * step;
    // One gridline of headroom under the lowest value, so the line never rides the axis.
    const rawMin = Math.floor(bottom / step) * step;
    const min = bottom - rawMin < step * 0.25 ? rawMin - step : rawMin;
    const start = min < step * 2 ? 0 : min;
    if ((max - start) / step <= MAX_Y_INTERVALS) return { min: start, max: Math.max(max, start + step), step };
  }
  return { min: 0, max: niceMax(top), step: niceMax(top) / 4 };
}
