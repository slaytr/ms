import { query } from '../db.mjs';

const MAX_CHARACTERS = 500;

/**
 * One row per character: its latest known level, from the newest session snapshot that read one
 * (the end snapshot carries the last value forward, the start snapshot covers a tab closed without Stop).
 * A character is its fingerprint (hash of the name pixels); a typed name stands in when there is none.
 * Rows with no usable name are left out, since there would be nothing to show or look an avatar up by.
 *
 * `dayFrom` / `dayTo` are the earliest and latest readings of the last 24 hours (level and EXP both
 * read), across all of the character's sessions. The page takes the difference, so the day's gain does
 * not depend on how sessions were split. Null when the character was not tracked in that window.
 */
const CHARACTERS_SQL = `
with latest as (
  select distinct on (sn.session_id)
         sn.session_id, sn.name, sn.job, sn.level, sn.exp_pct, sn.taken_at, sn.fingerprint,
         s.character as typed_name, s.fingerprint as session_fingerprint
    from ms_session_snapshots sn
    join ms_capture_sessions s on s.id = sn.session_id
   where sn.level is not null
   order by sn.session_id, sn.taken_at desc
), named as (
  select coalesce(nullif(name, ''), nullif(typed_name, '')) as name,
         coalesce(fingerprint, session_fingerprint) as fingerprint,
         job, level, exp_pct, taken_at
    from latest
), keyed as (
  select *, coalesce(fingerprint, lower(name)) as player_key
    from named
   where name is not null
), newest as (
  select distinct on (player_key) *
    from keyed
   order by player_key, taken_at desc
), day as (
  select coalesce(s.fingerprint, st.fingerprint, lower(coalesce(nullif(st.name, ''), nullif(s.character, '')))) as player_key,
         r.taken_at, r.level, r.exp, r.exp_pct
    from ms_readings r
    join ms_capture_sessions s on s.id = r.session_id
    left join ms_session_snapshots st on st.session_id = s.id and st.kind = 'start'
   where r.taken_at >= now() - interval '24 hours'
     and r.level is not null and r.exp is not null
), meso_points as (
  -- The newest meso count of each session, from its snapshots and its readings (a running session has no end snapshot).
  select s.id,
         coalesce(s.fingerprint, st.fingerprint, lower(coalesce(nullif(st.name, ''), nullif(s.character, '')))) as player_key,
         p.taken_at, p.meso
    from ms_capture_sessions s
    left join ms_session_snapshots st on st.session_id = s.id and st.kind = 'start'
    cross join lateral (
      select taken_at, meso from (
        (select taken_at, meso from ms_session_snapshots where session_id = s.id and meso is not null order by taken_at desc limit 1)
        union all
        (select taken_at, meso from ms_readings where session_id = s.id and meso is not null order by taken_at desc limit 1)
      ) both_sources
       order by taken_at desc limit 1
    ) p
), meso_latest as (
  select distinct on (player_key) player_key, taken_at, meso
    from meso_points
   where player_key is not null
   order by player_key, taken_at desc
), day_first as (
  select distinct on (player_key) * from day where player_key is not null order by player_key, taken_at asc
), day_last as (
  select distinct on (player_key) * from day where player_key is not null order by player_key, taken_at desc
)
select n.player_key as "playerKey", n.name, n.job, n.level,
       n.exp_pct::float8 as "expPct",
       extract(epoch from n.taken_at) * 1000 as "lastSeenAt",
       f.level as "fromLevel", f.exp as "fromExp", f.exp_pct::float8 as "fromPct",
       extract(epoch from f.taken_at) * 1000 as "fromAt",
       l.level as "toLevel", l.exp as "toExp", l.exp_pct::float8 as "toPct",
       extract(epoch from l.taken_at) * 1000 as "toAt",
       m.meso::float8 as meso,
       extract(epoch from m.taken_at) * 1000 as "mesoAt"
  from newest n
  left join day_first f on f.player_key = n.player_key
  left join day_last l on l.player_key = n.player_key
  left join meso_latest m on m.player_key = n.player_key
 order by n.level desc, n.exp_pct desc nulls last, n.taken_at desc
 limit $1`;

const point = (row, prefix) =>
  row[`${prefix}At`] === null || row[`${prefix}At`] === undefined
    ? null
    : {
        at: Number(row[`${prefix}At`]),
        level: row[`${prefix}Level`],
        exp: Number(row[`${prefix}Exp`]),
        expPct: row[`${prefix}Pct`] === null ? null : Number(row[`${prefix}Pct`]),
      };

/** Characters ranked by level (then EXP% into it, then most recently seen). Numbers come back as JS numbers. */
export async function listCharacters() {
  const { rows } = await query(CHARACTERS_SQL, [MAX_CHARACTERS]);
  return rows.map((row) => {
    const dayFrom = point(row, 'from');
    const dayTo = point(row, 'to');
    const snapshotAt = Number(row.lastSeenAt);
    // A session still running (or closed without Stop) has no end snapshot yet, so a newer reading is the better "current".
    const fresher = dayTo !== null && dayTo.at > snapshotAt;
    return {
      playerKey: row.playerKey,
      name: row.name,
      job: row.job || null,
      level: fresher ? dayTo.level : row.level,
      expPct: fresher ? dayTo.expPct : row.expPct === null ? null : Number(row.expPct),
      lastSeenAt: fresher ? dayTo.at : snapshotAt,
      dayFrom,
      dayTo,
      meso: row.meso === null ? null : Number(row.meso),
      mesoAt: row.mesoAt === null ? null : Number(row.mesoAt),
    };
  });
}
