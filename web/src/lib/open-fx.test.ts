import { describe, expect, it } from 'vitest';
import { planFor, tierFor } from './open-fx';

describe('open-fx', () => {
  it('rarer drops get higher tiers', () => {
    expect(tierFor(1)).toBe('legendary');
    expect(tierFor(2)).toBe('epic');
    expect(tierFor(3)).toBe('rare');
    expect(tierFor(10)).toBe('common');
  });

  it('rarer drops get longer, bigger shows', () => {
    const plans = [10, 3, 2, 1].map(planFor);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].spinSteps).toBeGreaterThan(plans[i - 1].spinSteps);
      expect(plans[i].particles).toBeGreaterThan(plans[i - 1].particles);
    }
  });
});
