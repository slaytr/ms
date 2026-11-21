import { query } from '../db.mjs';
import { sessionGains } from '../lib/session-gains.mjs';

/**
 * Per-session stats kept in `ms_session_stats` (migration 015). The numbers come from ms_readings and are
 * recomputed only for sessions whose readings changed, so reading them costs a few hundred small rows
 * however many readings there are.
 *
 * The gains are the tracker's own maths (`sessionGains`, which runs `computeRates` from
 * web/src/lib/metrics.ts), so level-ups, raw EXP, percent-only EXP and a mix of the two are all counted
 * the way the player sees them. `exp_gained` is the whole EXP gain and `exp_estimated` says part of it was
 * sized from the EXP percent. `exp_pct_gained` wraps the level-up exactly, so it is also the level-fair
 * figure for comparing characters.
 */

const READINGS_SQL = `
select taken_at, meso, exp, exp_pct, level from ms_readings where session_id = $1 order by taken_at`;

const UPSERT_SQL = `
insert into ms_session_stats
  (session_id, version, stale, readings, first_at, last_at, seconds, level_from, level_to,
   exp_gained, exp_estimated, exp_pct_gained, exp_tail_pct_gained, meso_gained, computed_at)
values ($1, $2, false, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, now())
on conflict (session_id) do update set
  readings = excluded.readings, first_at = excluded.first_at, last_at = excluded.last_at,
  seconds = excluded.seconds, level_from = excluded.level_from, level_to = excluded.level_to,
  exp_gained = excluded.exp_gained, exp_estimated = excluded.exp_estimated,
  exp_pct_gained = excluded.exp_pct_gained, exp_tail_pct_gained = 0,
  meso_gained = excluded.meso_gained, computed_at = excluded.computed_at,
  -- A readings write that landed while this ran bumped the version: stay stale for the next refresh.
  stale = ms_session_stats.version <> excluded.version`;

/** Recomputes one session from its readings and stores the result. `version` is the one that was read. */
async function refreshSession(id, version) {
  const { rows } = await query(READINGS_SQL, [id]);
  const gains = sessionGains(rows);
  const levels = rows.map((r) => r.level).filter((l) => l !== null);
  const first = rows.length > 0 ? new Date(rows[0].taken_at) : null;
  const last = rows.length > 0 ? new Date(rows[rows.length - 1].taken_at) : null;
  await query(UPSERT_SQL, [
    id,
    version,
    rows.length,
    first,
    last,
    first && last ? (last.getTime() - first.getTime()) / 1000 : 0,
    levels.length > 0 ? Math.min(...levels) : null,
    levels.length > 0 ? Math.max(...levels) : null,
    gains.expGained,
    gains.expEstimated,
    gains.expPctGained,
    gains.mesoGained,
  ]);
}


/** Sessions with no stats row yet, or whose readings changed since the row was computed. */
const STALE_SQL = `
select s.id, coalesce(x.version, 0) as version
  from ms_capture_sessions s
  left join ms_session_stats x on x.session_id = s.id
 where x.session_id is null or x.stale`;

const MARK_STALE_SQL = `
insert into ms_session_stats (session_id, stale, version) values ($1, true, 1)
on conflict (session_id) do update set stale = true, version = ms_session_stats.version + 1`;

/**
 * Notes that a session's readings changed, so its stats are recomputed on the next read. Call it after
 * every write to ms_readings, in the same transaction when there is one (pass its `client`).
 */
export function markStatsStale(sessionId, client) {
  return query(MARK_STALE_SQL, [sessionId], client);
}

let inFlight = null;

async function refreshOnce() {
  const { rows } = await query(STALE_SQL);
  if (rows.length === 0) return 0;
  for (const row of rows) await refreshSession(row.id, row.version);
  return rows.length;
}

/**
 * Brings every stale session's stats up to date and resolves with how many were recomputed. Callers that
 * ask while a refresh is running share it instead of starting another (the first read after a deploy or a
 * sync computes everything once). Every read of the stats goes through this first.
 */
export function refreshStaleStats() {
  if (inFlight === null) {
    inFlight = refreshOnce().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
