import { INVENTORY } from './inventory.ts';
import { quickSlotOrigin, QUICK } from './quickslots.ts';
import type { Frame, Point, Rect } from './types.ts';
import { unscaleRegion, type View } from './view.ts';

/**
 * The icon and stack-count readers (quick slots, Use tab) match exact colours, so they need real native
 * pixels, not the luma plane the status-bar readers use. For a window taller than the client this undoes
 * the upscale in full colour, but only for the regions those readers look at (a few hundred native pixels,
 * not the whole 1440p frame), and returns a native-size frame with just those regions filled in.
 */

const PAD = 4;

/** Where the quick-slot bar sits in native coordinates, hanging off the EXP label. */
export function quickSlotRegion(exp: Point): Rect {
  const first = quickSlotOrigin(exp, 0, 0);
  const last = quickSlotOrigin(exp, QUICK.rows - 1, QUICK.cols - 1);
  return { x: first.x - PAD, y: first.y - PAD, w: last.x + INVENTORY.size - first.x + 2 * PAD, h: last.y + INVENTORY.size - first.y + 2 * PAD };
}

/** Where the Item Inventory's tab heads, slot grid and scrollbar sit in native coordinates, hanging off the MESOS label. */
export function useTabRegion(mesos: Point): Rect {
  const left = mesos.x + INVENTORY.slot0.dx - 12;
  const top = mesos.y + INVENTORY.useTabPixel.dy - 8;
  return { x: left, y: top, w: mesos.x + INVENTORY.scroll.dx + 12 - left, h: mesos.y + 8 - top };
}

/** A native-size frame (view.width x view.height) with `regions` recovered from `frame` in full colour; everywhere else is black. */
export function unscaleColourRegions(frame: Frame, view: View, regions: readonly Rect[]): Frame {
  const pixels = frame.width * frame.height;
  const planes = [0, 1, 2].map((channel) => {
    const plane = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) plane[i] = frame.data[i * 4 + channel];
    return plane;
  });

  const data = new Uint8ClampedArray(view.width * view.height * 4);
  for (const region of regions) {
    for (let channel = 0; channel < 3; channel++) {
      const solved = unscaleRegion(planes[channel], frame.width, view, region);
      if (!solved) continue;
      const { rect, pixels: values } = solved;
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          const at = ((rect.y + y) * view.width + rect.x + x) * 4;
          data[at + channel] = values[y * rect.w + x];
          data[at + 3] = 255;
        }
      }
    }
  }
  return { width: view.width, height: view.height, data };
}
