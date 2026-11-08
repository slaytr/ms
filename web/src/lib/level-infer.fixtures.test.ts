import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATES } from './detect/default-templates.ts';
import { detectFrame } from './detect/detect.ts';
import { listFixtures, loadFrame } from './detect/fixture-io.ts';
import { withInferredLevel } from './level-infer';

/** The shipped templates, but with no level digits known, as if the level font hadn't been captured yet. */
const BLIND_TEMPLATES = { ...DEFAULT_TEMPLATES, fonts: { ...DEFAULT_TEMPLATES.fonts, level: {} } };
const frames = listFixtures();

describe('level inference on real game frames', () => {
  it('has frames to test against', () => {
    expect(frames.length).toBeGreaterThan(0);
  });

  it.each(frames)('recovers level 49 from EXP when the level digits are unreadable: %s', (file) => {
    const raw = detectFrame(loadFrame(file), BLIND_TEMPLATES);
    expect(raw.level).toBeNull();
    if (raw.exp === null || raw.expPct === null) return; // EXP itself isn't readable in this frame

    const detection = withInferredLevel(raw, null);
    expect(detection.level).toBe(49);
    expect(detection.levelInferred).toBe(true);
  });
});
