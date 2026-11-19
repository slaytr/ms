import { query } from '../db.mjs';

/**
 * Per-session stats kept in `ms_session_stats` (migration 015). The numbers come from ms_readings and are
 * recomputed only for sessions whose readings changed, so reading them costs a few hundred small rows
 * however many readings there are.
 *
 * The gains mirror web/src/lib/metrics.ts: they sum the change between consecutive successful reads
 * of each field (a failed read is skipped, a drop is a death penalty and counts as zero).
 * A wrapped bar (a drop of 50+ points) is a level-up whatever the label says, and a rising level label
 * only counts as one unless the readings are under 30s apart and EXP kept climbing (the label just
 * catching up to a level-up already counted), exactly as `leveledUp` does in metrics.ts.
 * EXP uses the raw counter, which resets on a level-up, so the single gap that crosses a level-up
 * contributes 0 to `expGained` (a slight undercount, never an invention). `expPctGained` wraps the
 * level-up exactly, so it is also the level-fair figure for comparing characters.
 */

/** Recomputes the sessions in `target` ($1 ids, $2 the versions that were read) and stores the result. */
const REFRESH_SQL = `
with target as (
  select * from unnest($1::uuid[], $2::bigint[]) as t(id, version)
), e as (
  select session_id, taken_at, exp, level, exp_pct,
         lag(exp) over w as p_exp, lag(level) over w as p_level, lag(exp_pct) over w as p_pct,
         lag(taken_at) over w as p_at
    from ms_readings
   where exp is not null and session_id in (select id from target)
  window w as (partition by session_id order by taken_at)
), exp_gain as (
  select session_id,
         sum(case
               when p_exp is null then 0
               when exp_pct is not null and p_pct is not null and exp_pct - p_pct < -50 then 0
               when level is not null and p_level is not null and level > p_level
                    and not (taken_at - p_at <= interval '30 seconds' and exp >= p_exp) then 0
               else greatest(0, exp - p_exp)
             end)::bigint as gained
    from e group by session_id
), p as (
  select session_id, taken_at, exp, exp_pct, level,
         lag(exp_pct) over w as p_pct, lag(level) over w as p_level, lag(exp) over w as p_exp,
         lag(taken_at) over w as p_at
    from ms_readings
   where exp_pct is not null and session_id in (select id from target)
  window w as (partition by session_id order by taken_at)
), pct_gain as (
  select session_id,
         sum(case
               when p_pct is null then 0
               when exp_pct - p_pct < -50 then 100 - p_pct + exp_pct
               when level is not null and p_level is not null and level > p_level
                    and not (taken_at - p_at <= interval '30 seconds'
                             and (case when exp is not null and p_exp is not null then exp >= p_exp else exp_pct >= p_pct end))
                 then 100 - p_pct + exp_pct
               else greatest(0, exp_pct - p_pct)
             end)::float8 as gained
    from p group by session_id
), m as (
  select session_id, meso, lag(meso) over (partition by session_id order by taken_at) as p_meso
    from ms_readings
   where meso is not null and session_id in (select id from target)
), meso_gain as (
  select session_id, sum(case when p_meso is null then 0 else greatest(0, meso - p_meso) end)::bigint as gained
    from m group by session_id
), span as (
  select session_id,
         min(taken_at) as first_at, max(taken_at) as last_at, count(*)::int as readings,
         min(level) as level_from, max(level) as level_to
    from ms_readings
   where session_id in (select id from target)
   group by session_id
)
insert into ms_session_stats
  (session_id, version, stale, readings, first_at, last_at, seconds, level_from, level_to,
   exp_gained, exp_pct_gained, meso_gained, computed_at)
select t.id, t.version, false,
       coalesce(sp.readings, 0), sp.first_at, sp.last_at,
       coalesce(extract(epoch from (sp.last_at - sp.first_at)), 0)::float8,
       sp.level_from, sp.level_to,
       coalesce(eg.gained, 0), coalesce(pg.gained, 0), coalesce(mg.gained, 0), now()
  from target t
  left join span sp on sp.session_id = t.id
  left join exp_gain eg on eg.session_id = t.id
  left join pct_gain pg on pg.session_id = t.id
  left join meso_gain mg on mg.session_id = t.id
on conflict (session_id) do update set
  readings = excluded.readings, first_at = excluded.first_at, last_at = excluded.last_at,
  seconds = excluded.seconds, level_from = excluded.level_from, level_to = excluded.level_to,
  exp_gained = excluded.exp_gained, exp_pct_gained = excluded.exp_pct_gained,
  meso_gained = excluded.meso_gained, computed_at = excluded.computed_at,
  -- A readings write that landed while this ran bumped the version: stay stale for the next refresh.
  stale = ms_session_stats.version <> excluded.version`;

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
  await query(REFRESH_SQL, [rows.map((r) => r.id), rows.map((r) => r.version)]);
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
