import type { ExpRatePoint } from './metrics';
import { buildYAxis } from './y-axis';

/** The overlay's backdrop shows this much of the recent EXP/hr. */
export const OVERLAY_WINDOW_MS = 30 * 60_000;
/** Until this much is drawn the line only fills the left part, so the first points don't stretch across the box. */
const MIN_SPAN_MS = 60_000;
const MIN_TOP = 1000;

export interface OverlayGraph {
  /** SVG `points` of the line, in a `width` x `height` box. */
  readonly line: string;
  /** The same line closed down to the bottom edge, for the fill. */
  readonly area: string;
}

/**
 * The EXP/hr backdrop of the overlay. The line starts at the left edge (at the first point, or 30 minutes
 * back once the session is longer) and grows rightwards, so a fresh overlay never starts mid-box. The y axis
 * is the page chart's: it starts near the data when the data sits well above zero, not at 0.
 * Null until there are two points to join.
 */
export function overlayGraph(rate: readonly ExpRatePoint[], width: number, height: number, windowMs: number = OVERLAY_WINDOW_MS): OverlayGraph | null {
  if (rate.length < 2) return null;
  const end = rate[rate.length - 1].elapsedMs;
  const start = Math.max(rate[0].elapsedMs, end - windowMs);
  const pts = rate.filter((p) => p.elapsedMs >= start);
  if (pts.length < 2) return null;

  const span = Math.max(end - start, MIN_SPAN_MS);
  const values = pts.map((p) => Math.max(p.expPerHour, 0));
  const axis = buildYAxis(Math.min(...values), Math.max(...values), MIN_TOP);
  const range = axis.max - axis.min;
  const coords = pts.map((p, i) => {
    const px = ((p.elapsedMs - start) / span) * width;
    const py = height - ((values[i] - axis.min) / range) * height;
    return { px, py };
  });
  const text = coords.map((c) => `${c.px.toFixed(2)},${c.py.toFixed(2)}`);
  const first = coords[0].px.toFixed(2);
  const last = coords[coords.length - 1].px.toFixed(2);
  return { line: text.join(' '), area: `${first},${height} ${text.join(' ')} ${last},${height}` };
}
