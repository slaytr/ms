import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATES } from './detect/default-templates.ts';
import { detectFrame } from './detect/detect.ts';
import { FIXTURES_DIR, listFixtures, loadFrame } from './detect/fixture-io.ts';
import { withInferredLevel } from './level-infer';

/** The shipped templates, but with no level digits known, as if the level font hadn't been captured yet. */
const BLIND_TEMPLATES = { ...DEFAULT_TEMPLATES, fonts: { ...DEFAULT_TEMPLATES.fonts, level: {} } };
const frames = listFixtures();
const labels = JSON.parse(readFileSync(join(FIXTURES_DIR, 'labels.json'), 'utf8')) as Record<string, { level?: string }>;
/** Frames are level 49 unless labelled otherwise (a few were captured after levelling up). */
const levelOf = (file: string) => Number(labels[file]?.level ?? 49);

describe('level inference on real game frames', () => {
  it('has frames to test against', () => {
    expect(frames.length).toBeGreaterThan(0);
  });

  it.each(frames)('recovers the level from EXP when the level digits are unreadable: %s', (file) => {
    const raw = detectFrame(loadFrame(file), BLIND_TEMPLATES);
    expect(raw.level).toBeNull();
    if (raw.exp === null || raw.expPct === null) return; // EXP itself isn't readable in this frame

    const detection = withInferredLevel(raw, null);
    expect(detection.level).toBe(levelOf(file));
    expect(detection.levelInferred).toBe(true);
  });
});
