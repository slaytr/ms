import { describe, expect, it } from 'vitest';

import { coverageTotals, detectionCoverage, EXPECTED, fontCoverage } from './coverage.ts';
import { DEFAULT_INVENTORY_TEMPLATES } from './default-inventory-templates.ts';
import { DEFAULT_TEMPLATES } from './default-templates.ts';
import raw from './templates.json';
import { parseTemplates } from './templates.ts';
import { EMPTY_TEMPLATES, type Bitmap } from './types.ts';

const glyph: Bitmap = ['#'];

describe('fontCoverage', () => {
  it('separates measured glyphs, drafts standing in for them, and nothing at all', () => {
    const harvested = { '1': [glyph], '2': [glyph] };
    const merged = { ...harvested, '3': [glyph] }; // 3 is only a draft
    const result = fontCoverage(['1', '2', '3', '4'], harvested, merged);
    expect(result).toEqual({ real: ['1', '2'], drafted: ['3'], missing: ['4'] });
  });

  it('ignores glyphs the font should not have (touching pairs are extras, not gaps)', () => {
    const harvested = { '1': [glyph], Vi: [glyph] };
    expect(fontCoverage(['1', '2'], harvested, harvested)).toEqual({ real: ['1'], drafted: [], missing: ['2'] });
  });

  it('treats a character with no variants as missing', () => {
    expect(fontCoverage(['1'], { '1': [] }, { '1': [] }).missing).toEqual(['1']);
  });
});

describe('detectionCoverage', () => {
  const areas = detectionCoverage(parseTemplates(raw), DEFAULT_TEMPLATES, {
    digits: DEFAULT_INVENTORY_TEMPLATES.digits,
    quickDigits: DEFAULT_INVENTORY_TEMPLATES.quickDigits,
  });
  const area = (id: string) => areas.find((a) => a.id === id)!;

  it('lists every area the detector reads', () => {
    expect(areas.map((a) => a.id)).toEqual(['level', 'exp', 'meso', 'map', 'text', 'use-counts', 'quick-counts']);
  });

  it('accounts for every expected character exactly once', () => {
    for (const a of areas) {
      const expected = a.id.endsWith('counts') ? EXPECTED.count : EXPECTED[a.id as keyof typeof EXPECTED];
      expect([...a.real, ...a.drafted, ...a.missing].sort(), a.id).toEqual([...expected].sort());
    }
  });

  it('shows the level digits still unmeasured, from the real templates', () => {
    expect(area('level').real).toEqual(expect.arrayContaining(['0', '1', '2', '3', '4', '5', '6', '7', '9']));
    expect(area('level').drafted).toEqual(['8']); // drafted, not measured
    expect(area('level').missing).toEqual([]);
  });

  it('marks fonts that can show any letter as open ended', () => {
    expect(area('map').openEnded).toBe(true);
    expect(area('text').openEnded).toBe(true);
    expect(area('level').openEnded).toBe(false);
  });

  it('reports everything missing when nothing has been harvested', () => {
    const empty = detectionCoverage(EMPTY_TEMPLATES, EMPTY_TEMPLATES, { digits: {}, quickDigits: {} });
    expect(empty.every((a) => a.real.length === 0 && a.drafted.length === 0 && a.missing.length > 0)).toBe(true);
  });
});

describe('coverageTotals', () => {
  it('adds up each area', () => {
    const totals = coverageTotals([
      { id: 'a', label: '', where: '', real: ['1', '2'], drafted: ['3'], missing: [], openEnded: false },
      { id: 'b', label: '', where: '', real: ['x'], drafted: [], missing: ['y', 'z'], openEnded: true },
    ]);
    expect(totals).toEqual({ real: 3, drafted: 1, missing: 2 });
  });
});
