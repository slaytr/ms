import { describe, expect, it } from 'vitest';

import { NX_PER_GRANT, STARTING_NX, XP_PER_GRANT, nxStatus } from './nx-economy';

describe('nxStatus', () => {
  it('starts every character with 7,000 NX', () => {
    expect(STARTING_NX).toBe(7_000);
    const fresh = nxStatus(0, 0);
    expect(fresh).toMatchObject({ grants: 0, earned: 7_000, spent: 0, balance: 7_000, expIntoGrant: 0, expToNext: XP_PER_GRANT });
  });

  it('adds 35,000 NX for every full 200,000 EXP gained', () => {
    expect(NX_PER_GRANT).toBe(35_000);
    expect(XP_PER_GRANT).toBe(200_000);
    expect(nxStatus(199_999, 0).earned).toBe(7_000);
    expect(nxStatus(200_000, 0).earned).toBe(42_000);
    expect(nxStatus(399_999, 0).earned).toBe(42_000);
    expect(nxStatus(400_000, 0).earned).toBe(77_000);
    expect(nxStatus(1_000_000, 0).grants).toBe(5);
  });

  it('reports progress to the next grant', () => {
    const status = nxStatus(250_000, 0);
    expect(status.expIntoGrant).toBe(50_000);
    expect(status.expToNext).toBe(150_000);
  });

  it('subtracts what was spent, and keeps spent NX when more is earned', () => {
    expect(nxStatus(0, 3_500).balance).toBe(3_500);
    expect(nxStatus(200_000, 38_500).balance).toBe(3_500);
  });

  it('treats junk input as zero rather than inventing NX', () => {
    expect(nxStatus(Number.NaN, 0).earned).toBe(7_000);
    expect(nxStatus(-5, -5)).toMatchObject({ expGained: 0, spent: 0, balance: 7_000 });
    expect(nxStatus(1_234.9, 0).expGained).toBe(1_234);
  });
});
