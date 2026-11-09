import { query } from '../db.mjs';

/** Sessions shorter than this (first to last reading) say nothing reliable about a map's rate. */
const MIN_SESSION_SECONDS = 60;
const MAX_SESSIONS = 1000;

/**
 * One row per labelled session: which map, who, for how long, and what was gained. A session is
 * named after the first map the minimap showed, so this is "where the session was spent".
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
const SESSION_STATS_SQL = `
with e as (
  select session_id, taken_at, exp, level, exp_pct,
         lag(exp) over w as p_exp, lag(level) over w as p_level, lag(exp_pct) over w as p_pct,
         lag(taken_at) over w as p_at
    from ms_readings
   where exp is not null
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
   where exp_pct is not null
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
   where meso is not null
), meso_gain as (
  select session_id, sum(case when p_meso is null then 0 else greatest(0, meso - p_meso) end)::bigint as gained
    from m group by session_id
), span as (
  select session_id,
         min(taken_at) as first_at, max(taken_at) as last_at, count(*)::int as readings,
         min(level) as level_from, max(level) as level_to
    from ms_readings group by session_id
)
select s.id,
       s.label as map,
       coalesce(nullif(st.name, ''), nullif(s.character, ''), 'Unknown') as player,
       coalesce(nullif(st.job, ''), nullif(en.job, '')) as job,
       coalesce(s.fingerprint, lower(coalesce(nullif(st.name, ''), nullif(s.character, ''), s.id::text))) as "playerKey",
       extract(epoch from sp.first_at) * 1000 as "startedAt",
       extract(epoch from (sp.last_at - sp.first_at)) as seconds,
       sp.level_from as "levelFrom", sp.level_to as "levelTo",
       coalesce(eg.gained, 0) as "expGained",
       coalesce(pg.gained, 0) as "expPctGained",
       coalesce(mg.gained, 0) as "mesoGained"
  from ms_capture_sessions s
  join span sp on sp.session_id = s.id
  left join ms_session_snapshots st on st.session_id = s.id and st.kind = 'start'
  left join ms_session_snapshots en on en.session_id = s.id and en.kind = 'end'
  left join exp_gain eg on eg.session_id = s.id
  left join pct_gain pg on pg.session_id = s.id
  left join meso_gain mg on mg.session_id = s.id
 where s.label <> ''
   and sp.readings >= 2
   and extract(epoch from (sp.last_at - sp.first_at)) >= $1
 order by sp.first_at desc
 limit $2`;

/** Per-session map stats, newest first. Numbers come back as JS numbers (Postgres returns bigint as text). */
export async function listMapSessions() {
  const { rows } = await query(SESSION_STATS_SQL, [MIN_SESSION_SECONDS, MAX_SESSIONS]);
  return rows.map((row) => ({
    id: row.id,
    map: row.map,
    player: row.player,
    job: row.job ?? null,
    playerKey: row.playerKey,
    startedAt: Number(row.startedAt),
    seconds: Number(row.seconds),
    levelFrom: row.levelFrom,
    levelTo: row.levelTo,
    expGained: Number(row.expGained),
    expPctGained: Number(row.expPctGained),
    mesoGained: Number(row.mesoGained),
  }));
}
