import { describe, expect, it } from 'vitest';

import { computeRates, type Reading } from './metrics';
import type { PlayerSnapshot } from './snapshot';
import { buildTrackerView } from './tracker-view';

const MIN = 60_000;
const reading = (minutes: number, over: Partial<Reading> = {}): Reading => ({
  takenAt: minutes * MIN,
  meso: null,
  exp: null,
  expPct: null,
  level: null,
  ...over,
});
const snapshot = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  takenAt: 0,
  fingerprint: 'abc',
  name: 'PayYoBills',
  job: null,
  level: 49,
  exp: 17_691,
  expPct: 2.7,
  meso: 721_592,
  ...over,
});

const view = (readings: Reading[], snap: PlayerSnapshot | null = snapshot()) =>
  buildTrackerView({ name: 'PayYoBills', snapshot: snap, readings, rates: computeRates(readings) });

describe('buildTrackerView net mesos', () => {
  const earning = [reading(0, { meso: 1_000_000 }), reading(10, { meso: 1_500_000 })];

  it('is meso gained minus what the pots cost', () => {
    const v = buildTrackerView({ name: null, snapshot: snapshot(), readings: earning, rates: computeRates(earning), potSpend: { mesos: 120_000, unknownFor: 0 } });
    expect(v.netMesos).toBe(380_000);
    expect(v.netMesosCeiling).toBe(false);
  });

  it('goes negative when the pots cost more than was earned', () => {
    const v = buildTrackerView({ name: null, snapshot: snapshot(), readings: earning, rates: computeRates(earning), potSpend: { mesos: 600_000, unknownFor: 0 } });
    expect(v.netMesos).toBe(-100_000);
  });

  it('equals meso gained when no pots are counted, and is unknown before meso is read', () => {
    expect(view(earning).netMesos).toBe(500_000);
    expect(view([reading(0, { exp: 1 }), reading(5, { exp: 2 })]).netMesos).toBeNull();
  });

  it('flags a ceiling when a used pot has no NPC price', () => {
    const v = buildTrackerView({ name: null, snapshot: snapshot(), readings: earning, rates: computeRates(earning), potSpend: { mesos: 0, unknownFor: 2 } });
    expect(v.netMesosCeiling).toBe(true);
  });
});

describe('buildTrackerView rates', () => {
  it('headline EXP/h uses the last hour while the average covers the whole session', () => {
    // 0-60 min: 60,000 EXP. 60-120 min: 120,000 EXP. Session avg = 90K/h, last hour = 120K/h.
    const readings = [
      reading(0, { exp: 0, level: 49 }),
      reading(60, { exp: 60_000, level: 49 }),
      reading(120, { exp: 180_000, level: 49 }),
    ];
    const v = buildTrackerView({ name: null, snapshot: snapshot({ exp: 180_000 }), readings, rates: computeRates(readings, 120 * MIN) });
    expect(v.expPerHourAvg).toBe('90K');
    expect(v.expPerHour).toBe('120K');
    expect(v.expGained).toBe(180_000);
  });

  it('both figures match while the session is under an hour', () => {
    const readings = [reading(0, { exp: 0, level: 49 }), reading(30, { exp: 60_000, level: 49 })];
    const v = view(readings);
    expect(v.expPerHour).toBe(v.expPerHourAvg);
  });
});

describe('buildTrackerView', () => {
  it('shows time to level from the EXP still needed and the EXP/h earned so far', () => {
    // 60,000 EXP in 30 min = 120,000/h. Left to level: 655,200 - 77,691 = 577,509 -> about 4h 49m.
    const readings = [reading(0, { exp: 17_691, level: 49 }), reading(30, { exp: 77_691, level: 49 })];
    const v = view(readings, snapshot({ exp: 77_691 }));
    expect(v.expPerHour).toBe('120K');
    expect(v.etaText).toBe('4h 49m');
    expect(v.progress?.remaining).toBe(577_509);
  });

  it('changes as the rate changes: a faster pace shortens the estimate', () => {
    const slow = view([reading(0, { exp: 10_000 }), reading(30, { exp: 20_000 })], snapshot({ exp: 20_000 }));
    const fast = view([reading(0, { exp: 10_000 }), reading(30, { exp: 60_000 })], snapshot({ exp: 60_000 }));
    expect(slow.eta.state === 'ready' && fast.eta.state === 'ready' && fast.eta.ms < slow.eta.ms).toBe(true);
  });

  it('says it is still calculating during the first couple of minutes', () => {
    const v = view([reading(0, { exp: 1000 }), reading(1, { exp: 5000 })], snapshot({ exp: 5000 }));
    expect(v.eta.state).toBe('calculating');
    expect(v.etaText).toBeNull();
  });

  it('has no estimate when level or EXP are not known yet', () => {
    const v = view([reading(0), reading(10)], snapshot({ level: null, exp: null }));
    expect(v.eta.state).toBe('unknown');
    expect(v.progress).toBeNull();
  });

  it('reports meso gained and meso/h once meso has been read', () => {
    const readings = [reading(0, { meso: 100_000 }), reading(30, { meso: 150_000 })];
    const v = view(readings);
    expect(v.mesoGained).toBe(50_000);
    expect(v.mesoPerHour).toBe('100K');
    expect(v.mesoStale).toBe(false);
  });

  it('leaves meso empty when the inventory was never opened', () => {
    const v = view([reading(0, { exp: 1 }), reading(10, { exp: 2 })]);
    expect(v.mesoGained).toBeNull();
    expect(v.mesoPerHour).toBeNull();
    expect(v.mesoStale).toBe(false);
  });

  it('marks meso as paused when the inventory has been closed for a while', () => {
    const readings = [reading(0, { meso: 100_000 }), reading(5, { meso: 120_000 }), reading(9, { exp: 5 })];
    expect(view(readings).mesoStale).toBe(true);
    // Closed only briefly: not stale yet.
    const brief = [reading(0, { meso: 100_000 }), reading(5, { meso: 120_000 }), reading(5.5, { exp: 5 })];
    expect(view(brief).mesoStale).toBe(false);
  });

  it('formats elapsed time as a clock', () => {
    expect(view([reading(0), reading(75)]).elapsed).toBe('1:15:00');
  });

  it('shows the map when it has been read, falling back to the street, else nothing', () => {
    const base = { name: null, snapshot: null, readings: [], rates: computeRates([]) };
    const both = buildTrackerView({ ...base, map: { street: 'Victoria Road', name: 'The Forest North of Ellinia' } });
    expect(both.mapName).toBe('The Forest North of Ellinia');
    expect(both.mapFull).toBe('Victoria Road: The Forest North of Ellinia');

    const streetOnly = buildTrackerView({ ...base, map: { street: 'Victoria Road', name: null } });
    expect(streetOnly.mapName).toBe('Victoria Road');

    const none = buildTrackerView(base);
    expect([none.mapName, none.mapFull]).toEqual([null, null]);
  });

  it('copes with no readings at all', () => {
    const v = buildTrackerView({ name: null, snapshot: null, readings: [], rates: computeRates([]) });
    expect(v.eta.state).toBe('unknown');
    expect(v.elapsed).toBe('0:00:00');
    expect(v.expPerHour).toBe('—');
  });

  it('holds per-hour figures back for the first few seconds, but still shows totals', () => {
    const early = [reading(0, { exp: 1000, meso: 100_000 }), reading(1 / 12, { exp: 1500, meso: 108_000 })]; // 5s
    const v = view(early, snapshot({ exp: 1500 }));
    expect(v.expPerHour).toBe('—');
    expect(v.mesoPerHour).toBe('—');
    expect(v.mesoGained).toBe(8_000);
  });

  it('projects a per-hour figure after a few seconds and flags it as an estimate', () => {
    // 1,000 EXP in 20 seconds projects to 180,000 an hour.
    const v = view([reading(0, { exp: 1000 }), reading(1 / 3, { exp: 2000 })], snapshot({ exp: 2000 }));
    expect(v.expPerHour).toBe('180K');
    expect(v.ratesEstimated).toBe(true);
  });

  it('stops calling the rate an estimate after the warm-up', () => {
    const v = view([reading(0, { exp: 1000 }), reading(3, { exp: 4000 })], snapshot({ exp: 4000 }));
    expect(v.ratesEstimated).toBe(false);
  });

  it('keeps the clock and the projection moving between readings, from the wall clock', () => {
    const readings = [reading(0, { exp: 1000 }), reading(1, { exp: 4000 })];
    const atLastReading = buildTrackerView({ name: null, snapshot: snapshot({ exp: 4000 }), readings, rates: computeRates(readings, 1 * MIN) });
    const aMinuteLater = buildTrackerView({ name: null, snapshot: snapshot({ exp: 4000 }), readings, rates: computeRates(readings, 2 * MIN) });
    expect(atLastReading.elapsed).toBe('0:01:00');
    expect(aMinuteLater.elapsed).toBe('0:02:00');
    expect(atLastReading.expPerHour).toBe('180K');
    expect(aMinuteLater.expPerHour).toBe('90K');
  });

  it('shows per-hour figures once warmed up', () => {
    const v = view([reading(0, { exp: 1000 }), reading(2, { exp: 4000 })], snapshot({ exp: 4000 }));
    expect(v.expPerHour).toBe('90K');
  });
});
