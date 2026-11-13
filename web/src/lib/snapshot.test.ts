import { describe, expect, it } from 'vitest';

import type { Detection } from './detect/detect.ts';
import { carryForward, snapshotFrom } from './snapshot';

const detection = (over: Partial<Detection> = {}): Detection => ({
  meso: 721_592,
  exp: 17_691,
  expPct: 2.7,
  level: 49,
  found: { exp: true, level: true, mesos: true, minimap: true, character: true },
  character: { fingerprint: 'abc123', name: 'PayYoBills', job: 'Wizard (Ice,Lightning)' },
  map: { street: 'Victoria Road', name: 'The Forest North of Ellinia' },
  state: { exp: null, level: null, mesos: null, minimap: null },
  ...over,
});

describe('snapshotFrom', () => {
  it('captures everything the screen shows', () => {
    expect(snapshotFrom(detection(), 1000)).toEqual({
      takenAt: 1000,
      fingerprint: 'abc123',
      name: 'PayYoBills',
      job: 'Wizard (Ice,Lightning)',
      level: 49,
      exp: 17_691,
      expPct: 2.7,
      meso: 721_592,
    });
  });

  it('leaves unread values null instead of guessing', () => {
    const snap = snapshotFrom(
      detection({ meso: null, exp: null, expPct: null, level: null, character: { fingerprint: null, name: null, job: null } }),
      5,
    );
    expect(snap).toEqual({ takenAt: 5, fingerprint: null, name: null, job: null, level: null, exp: null, expPct: null, meso: null });
  });
});

describe('carryForward', () => {
  const opened = snapshotFrom(detection(), 1000);

  it('keeps the last known meso when the inventory is closed', () => {
    const closed = detection({ meso: null, found: { exp: true, level: true, mesos: false, minimap: true, character: true } });
    const later = carryForward(opened, closed, 2000);
    expect(later.meso).toBe(721_592);
    expect(later.takenAt).toBe(2000);
  });

  it('takes newer values over older ones', () => {
    const later = carryForward(opened, detection({ meso: 800_000, exp: 20_000, expPct: 3.05, level: 50 }), 2000);
    expect(later).toMatchObject({ meso: 800_000, exp: 20_000, expPct: 3.05, level: 50 });
  });

  it('moves raw EXP and its percent together, never mixing two ticks', () => {
    // This tick read the percent but not the raw EXP: keep the previous pair intact.
    const later = carryForward(opened, detection({ exp: null, expPct: 9.99 }), 2000);
    expect(later.exp).toBe(17_691);
    expect(later.expPct).toBe(2.7);
  });

  it('does not let a different character inherit the previous name or job', () => {
    const other = detection({ character: { fingerprint: 'zzz999', name: null, job: null } });
    const later = carryForward(opened, other, 2000);
    expect(later).toMatchObject({ fingerprint: 'zzz999', name: null, job: null });
  });

  it('keeps the name for the same character when this tick could not read it', () => {
    const same = detection({ character: { fingerprint: 'abc123', name: null, job: null } });
    expect(carryForward(opened, same, 2000)).toMatchObject({ name: 'PayYoBills', job: 'Wizard (Ice,Lightning)' });
  });

  it('keeps the whole identity when no name plate was visible this tick', () => {
    const none = detection({ character: { fingerprint: null, name: null, job: null } });
    expect(carryForward(opened, none, 2000)).toMatchObject({ fingerprint: 'abc123', name: 'PayYoBills' });
  });

  it('does not mutate the previous snapshot', () => {
    const frozen = Object.freeze({ ...opened });
    expect(() => carryForward(frozen, detection({ level: 50 }), 2000)).not.toThrow();
    expect(frozen.level).toBe(49);
  });
});

describe('carryForward with a percent-only EXP bar', () => {
  it('keeps the percent when the game shows no raw EXP', () => {
    const snap = carryForward(null, detection({ exp: null, expPct: 76.04, level: 62 }), 1000);
    expect(snap.expPct).toBe(76.04);
    expect(snap.exp).toBeNull();
  });
});

describe('carryForward when raw EXP stops appearing', () => {
  it('moves to the percent alone once the level changes and no raw EXP is shown any more', () => {
    const raw = carryForward(null, detection({ exp: 900_000, expPct: 50, level: 61 }), 1000);
    const next = carryForward(raw, detection({ exp: null, expPct: 3, level: 62 }), 2000);
    expect(next.exp).toBeNull();
    expect(next.expPct).toBe(3);
  });
});
