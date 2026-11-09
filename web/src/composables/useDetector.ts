import { DEFAULT_TEMPLATES } from '../lib/detect/default-templates.ts';
import { detectFrame, INITIAL_STATE, type Detection, type DetectState } from '../lib/detect/detect.ts';
import { DEFAULT_INVENTORY_TEMPLATES } from '../lib/detect/default-inventory-templates.ts';
import { readUseTab } from '../lib/detect/inventory.ts';
import { withInferredLevel } from '../lib/level-infer';

/**
 * Grabs the current frame of the shared window at native resolution and runs
 * the Classic-client detector on it. Keeps the last anchor positions between
 * ticks, so a steady state costs ~2ms instead of a full-frame search.
 */
export function useDetector() {
  let state: DetectState = INITIAL_STATE;
  let canvas: HTMLCanvasElement | null = null;
  /** The last level we knew, read or inferred; only used to break ties when EXP alone fits several levels. */
  let lastLevel: number | null = null;

  function read(video: HTMLVideoElement): Detection | null {
    const { videoWidth: width, videoHeight: height } = video;
    if (width === 0 || height === 0) return null;

    canvas ??= document.createElement('canvas');
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, width, height);
    const raw = detectFrame(image, DEFAULT_TEMPLATES, state);
    state = raw.state;
    // If the level digits can't be read, work the level out from EXP and EXP%.
    const detection = withInferredLevel(raw, lastLevel);
    if (detection.level !== null) lastLevel = detection.level;
    // The Use tab is only read in a native-size window (a scaled one would need the frame unscaled first).
    const useTab = raw.state.mesos && !raw.state.view ? readUseTab(image, raw.state.mesos, DEFAULT_INVENTORY_TEMPLATES) : null;
    return { ...detection, useTab };
  }

  function reset(): void {
    state = INITIAL_STATE;
    lastLevel = null;
  }

  return { read, reset };
}
