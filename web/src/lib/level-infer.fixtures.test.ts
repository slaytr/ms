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
/** Frames not in labels.json (see view.test.ts) whose level isn't 49. */
const UNLABELLED_LEVELS: Readonly<Record<string, number>> = {
  'other_2574x1506_1794300300000.png': 40,
  'inventory-closed_1368x800_1794534108250.png': 54,
  'inventory-closed_1368x800_1794534113636.png': 54,
  'other_1368x800_1794294397963.png': 43,
  'other_1368x800_1794295393250.png': 41,
  'other_1368x800_1794296364899.png': 51,
  'other_1368x800_1794296618967.png': 43,
  'other_1368x800_1794298449996.png': 44,
  'other_1368x800_1794298675268.png': 44,
  'other_1368x800_1794298885208.png': 41,
  'other_1370x814_1794300037251.png': 40,
};
/** Frames are level 49 unless labelled otherwise (a few were captured after levelling up). */
const levelOf = (file: string) => Number(labels[file]?.level ?? UNLABELLED_LEVELS[file] ?? 49);

describe('level inference on real game frames', () => {
  it('has frames to test against', () => {
    expect(frames.length).toBeGreaterThan(0);
  });

  it.each(frames)('recovers the level from EXP when the level digits are unreadable: %s', (file) => {
    const raw = detectFrame(loadFrame(file), BLIND_TEMPLATES);
    expect(raw.level).toBeNull();
    if (raw.exp === null || raw.expPct === null) return; // EXP itself isn't readable in this frame

    const detection = withInferredLevel(raw, null);
    // Just after a level-up the EXP is too small to tell which level it belongs to, so no guess is made (never a wrong level).
    if (detection.level === null) {
      expect(raw.expPct).toBeLessThan(0.1);
      return;
    }
    expect(detection.level).toBe(levelOf(file));
    expect(detection.levelInferred).toBe(true);
  });
});
