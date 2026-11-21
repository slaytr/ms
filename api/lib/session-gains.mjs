import { computeRates } from '../../web/src/lib/metrics.ts';

/**
 * What a session gained, from its readings (rows of ms_readings in time order, as `pg` returns them).
 * It is the tracker's own maths (`computeRates` in web/src/lib/metrics.ts), so the Maps, Rankings and
 * grinding-now figures agree with what the player saw: raw EXP where it was read, the EXP percent sized by
 * the level's EXP where it was not, and level-ups carried across either way.
 *
 * @param {ReadonlyArray<{ taken_at: Date | string | number, meso: string | number | null, exp: string | number | null, exp_pct: string | number | null, level: number | null }>} rows
 */
export function sessionGains(rows) {
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const readings = rows.map((r) => ({
    takenAt: new Date(r.taken_at).getTime(),
    meso: num(r.meso),
    exp: num(r.exp),
    expPct: num(r.exp_pct),
    level: r.level ?? null,
  }));
  const rates = computeRates(readings);
  return {
    expGained: Math.round(rates.expGained),
    expEstimated: rates.expEstimated,
    expPctGained: rates.expPctGained,
    mesoGained: Math.round(rates.mesoGained),
  };
}
