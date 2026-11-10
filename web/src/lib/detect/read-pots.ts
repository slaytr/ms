import type { DetectState } from './detect.ts';
import { DEFAULT_INVENTORY_TEMPLATES } from './default-inventory-templates.ts';
import { readUseTab, type UseTab } from './inventory.ts';
import { readQuickSlots, type QuickSlots } from './quickslots.ts';
import type { Frame, Rect } from './types.ts';
import { quickSlotRegion, unscaleColourRegions, useTabRegion } from './unscale-frame.ts';

export interface PotReadings {
  readonly useTab: UseTab;
  readonly quickSlots: QuickSlots | null;
}

/**
 * Reads the pot sources (the Use tab and the quick-slot bar) from a frame whose anchors `state` located. In a
 * native-size window they are read straight off the frame. In a taller window (`state.view`) the UI is scaled
 * up, so just the regions the readers look at are first recovered to native pixels in full colour.
 */
export function readPots(frame: Frame, state: DetectState): PotReadings {
  const { exp, mesos, view } = state;
  let source = frame;
  if (view) {
    const regions: Rect[] = [];
    if (exp) regions.push(quickSlotRegion(exp));
    if (mesos) regions.push(useTabRegion(mesos));
    if (regions.length === 0) return { useTab: null, quickSlots: null };
    source = unscaleColourRegions(frame, view, regions);
  }
  return {
    useTab: mesos ? readUseTab(source, mesos, DEFAULT_INVENTORY_TEMPLATES) : null,
    // The quick-slot bar hangs off the EXP label and is always on screen, so it is read every tick.
    quickSlots: exp ? readQuickSlots(source, exp, DEFAULT_INVENTORY_TEMPLATES) : null,
  };
}
