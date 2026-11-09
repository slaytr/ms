/**
 * Test support: renders a native-size capture the way a taller window shows it, so scaled-window
 * handling can be tested on layouts and content no real frame covers (a different aspect ratio, an open
 * inventory). The client upscales bilinearly with edge pixels extending outwards; this is that model, checked
 * against real captures (it reproduces them to ~0.5 grey levels). Node-only, like fixture-io.ts.
 */

import type { Frame } from './types.ts';

export interface WindowLayout {
  /** Title bar height and the width of the side/bottom edges (windowed: 31 and 1; borderless: 0 and 0). */
  readonly top: number;
  readonly border: number;
  /** The client area in frame pixels. Its height sets the scale (height / 768). */
  readonly clientWidth: number;
  readonly clientHeight: number;
  /** Native columns the client rounds its width to. */
  readonly nativeWidth: number;
}

/** The native 1366x768 client of a windowed 1368x800 capture: columns 1.., rows 31... */
const CLIENT = { x: 1, y: 31, width: 1366, height: 768 } as const;

/** One axis of the bilinear mapping: for each output pixel, the first source pixel and the weight of the next. */
function axis(size: number, extent: number): { first: Int32Array; weight: Float64Array } {
  const first = new Int32Array(extent);
  const weight = new Float64Array(extent);
  const scale = extent / size;
  for (let k = 0; k < extent; k++) {
    const p = Math.min(Math.max((k + 0.5) / scale - 0.5, 0), size - 1);
    first[k] = Math.min(Math.floor(p), size - 2);
    weight[k] = p - first[k];
  }
  return { first, weight };
}

/**
 * `native` (a windowed 1368x800 capture of the 1366x768 client) shown in a window with `layout`. The
 * client is centre-cropped to `layout.nativeWidth` columns first, as a narrower window shows less world.
 */
export function upscaleCapture(native: Frame, layout: WindowLayout): Frame {
  const cropX = CLIENT.x + Math.floor((CLIENT.width - layout.nativeWidth) / 2);
  const width = layout.clientWidth + 2 * layout.border;
  const height = layout.clientHeight + layout.top + layout.border;
  const data = new Uint8ClampedArray(width * height * 4).fill(255); // title bar and borders: plain white

  const across = axis(layout.nativeWidth, layout.clientWidth);
  const down = axis(CLIENT.height, layout.clientHeight);
  const source = (x: number, y: number, channel: number) =>
    native.data[((CLIENT.y + y) * native.width + cropX + x) * 4 + channel];

  for (let ky = 0; ky < layout.clientHeight; ky++) {
    const j = down.first[ky];
    const b = down.weight[ky];
    for (let kx = 0; kx < layout.clientWidth; kx++) {
      const i = across.first[kx];
      const a = across.weight[kx];
      const out = ((layout.top + ky) * width + layout.border + kx) * 4;
      for (let c = 0; c < 3; c++) {
        const upper = source(i, j, c) * (1 - a) + source(i + 1, j, c) * a;
        const lower = source(i, j + 1, c) * (1 - a) + source(i + 1, j + 1, c) * a;
        data[out + c] = Math.round(upper * (1 - b) + lower * b);
      }
      data[out + 3] = 255;
    }
  }
  return { width, height, data };
}

/** A windowed capture whose client is 16:9 at `clientHeight` rows (1080 gives a 1920x1080 client in a 1922x1112 frame). */
export function windowed(clientHeight: number, clientWidth: number, nativeWidth: number): WindowLayout {
  return { top: 31, border: 1, clientWidth, clientHeight, nativeWidth };
}

/** A borderless/fullscreen capture: the frame is the client. */
export function borderless(clientHeight: number, clientWidth: number, nativeWidth: number): WindowLayout {
  return { top: 0, border: 0, clientWidth, clientHeight, nativeWidth };
}
