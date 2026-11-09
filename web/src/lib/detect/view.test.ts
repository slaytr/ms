import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATES } from './default-templates.ts';
import { detectFrame } from './detect.ts';
import { loadFrame } from './fixture-io.ts';
import { ANCHOR_HOME, NATIVE, REFERENCE_CLIENT } from './layout.ts';
import { toLuma } from './mask.ts';
import { borderless, upscaleCapture, windowed, type WindowLayout } from './scale-fixture.ts';
import { fitView, unscaleRegion, unscaleView, type View } from './view.ts';

/** Native fixture with an open inventory, a long street/map name and everything else on screen. */
const NATIVE_FILE = 'other_1368x800_1794190494806.png';
const native = loadFrame(NATIVE_FILE);

/** The native client's luma, cut out of the windowed 1368x800 capture (columns 1.., rows 31..). */
function nativeClientLuma(): Uint8Array {
  const luma = toLuma(native);
  const out = new Uint8Array(NATIVE.width * NATIVE.height);
  for (let y = 0; y < NATIVE.height; y++) {
    const from = (REFERENCE_CLIENT.y + y) * native.width + REFERENCE_CLIENT.x;
    out.set(luma.subarray(from, from + NATIVE.width), y * NATIVE.width);
  }
  return out;
}

const LAYOUTS: ReadonlyArray<readonly [string, WindowLayout]> = [
  ['windowed 1920x1080 client (1.41x)', windowed(1080, 1920, 1366)],
  ['windowed 16:10 1920x1200 client (1.56x, width rounds to 1228)', windowed(1200, 1920, 1228)],
  ['borderless 2560x1440 (1.875x)', borderless(1440, 2560, 1366)],
  ['borderless 3840x2160 (2.8x)', borderless(2160, 3840, 1366)],
];

const viewOf = (layout: WindowLayout, width: number, height: number): View => ({
  sourceWidth: width,
  sourceHeight: height,
  left: layout.border,
  top: layout.top,
  clientWidth: layout.clientWidth,
  clientHeight: layout.clientHeight,
  width: layout.nativeWidth,
  height: NATIVE.height,
});

describe('unscaling a bilinear upscale', () => {
  it.each(LAYOUTS)('recovers the native client from a %s capture', (_name, layout) => {
    const frame = upscaleCapture(native, layout);
    const view = viewOf(layout, frame.width, frame.height);
    const recovered = unscaleView(toLuma(frame), frame.width, view);

    // Compare against the native client (centre-cropped when the layout is narrower).
    const truth = nativeClientLuma();
    const cropX = Math.floor((NATIVE.width - layout.nativeWidth) / 2);
    let off = 0;
    for (let y = 0; y < NATIVE.height; y++) {
      for (let x = 0; x < layout.nativeWidth; x++) {
        if (Math.abs(recovered[y * layout.nativeWidth + x] - truth[y * NATIVE.width + cropX + x]) > 3) off++;
      }
    }
    expect(off / (layout.nativeWidth * NATIVE.height)).toBeLessThan(0.005);
  });

  it('solves just a region and gets the same pixels as solving everything', () => {
    const layout = LAYOUTS[1][1];
    const frame = upscaleCapture(native, layout);
    const view = viewOf(layout, frame.width, frame.height);
    const luma = toLuma(frame);
    const whole = unscaleView(luma, frame.width, view);

    const part = unscaleRegion(luma, frame.width, view, { x: 300, y: 700, w: 200, h: 60 })!;
    expect(part.rect).toEqual({ x: 300, y: 700, w: 200, h: 60 });
    let differing = 0;
    for (let y = 0; y < part.rect.h; y++) {
      for (let x = 0; x < part.rect.w; x++) {
        if (Math.abs(part.pixels[y * part.rect.w + x] - whole[(part.rect.y + y) * view.width + part.rect.x + x]) > 1) differing++;
      }
    }
    expect(differing).toBe(0);
  });

  it('clips a region to the client and returns null when nothing is left', () => {
    const layout = LAYOUTS[0][1];
    const frame = upscaleCapture(native, layout);
    const view = viewOf(layout, frame.width, frame.height);
    const luma = toLuma(frame);
    expect(unscaleRegion(luma, frame.width, view, { x: 1300, y: 760, w: 500, h: 500 })!.rect).toEqual({ x: 1300, y: 760, w: 66, h: 8 });
    expect(unscaleRegion(luma, frame.width, view, { x: 5000, y: 0, w: 10, h: 10 })).toBeNull();
  });
});

describe('fitView', () => {
  it.each(LAYOUTS)('finds the layout of a %s capture', (_name, layout) => {
    const frame = upscaleCapture(native, layout);
    const view = fitView(toLuma(frame), frame.width, frame.height, DEFAULT_TEMPLATES);
    expect(view).toMatchObject({
      left: layout.border,
      top: layout.top,
      clientWidth: layout.clientWidth,
      clientHeight: layout.clientHeight,
      width: layout.nativeWidth,
      height: NATIVE.height,
    });
  });

  it('finds nothing in a frame that is not the game', () => {
    const blank = { width: 1922, height: 1232, data: new Uint8ClampedArray(1922 * 1232 * 4).fill(90) };
    expect(fitView(toLuma(blank), blank.width, blank.height, DEFAULT_TEMPLATES)).toBeNull();
  });

  it('finds nothing when the status bar is covered', () => {
    const layout = LAYOUTS[0][1];
    const frame = upscaleCapture(native, layout);
    const data = new Uint8ClampedArray(frame.data);
    data.fill(40, (frame.height - 200) * frame.width * 4); // everything in the bottom 200 rows
    expect(fitView(toLuma({ ...frame, data }), frame.width, frame.height, DEFAULT_TEMPLATES)).toBeNull();
  });

  it('leaves a native-size window alone (no view)', () => {
    expect(detectFrame(native, DEFAULT_TEMPLATES).state.view).toBeUndefined();
  });
});

describe('anchor home positions', () => {
  it('match where the anchors really are in the native client', () => {
    // The fit looks for the anchors here, so they must agree with the detector on a real frame.
    const { state } = detectFrame(native, DEFAULT_TEMPLATES);
    expect(state.exp).toEqual({ x: ANCHOR_HOME.exp.x + REFERENCE_CLIENT.x, y: ANCHOR_HOME.exp.y + REFERENCE_CLIENT.y });
    expect(state.level).toEqual({ x: ANCHOR_HOME.level.x + REFERENCE_CLIENT.x, y: ANCHOR_HOME.level.y + REFERENCE_CLIENT.y });
  });
});
