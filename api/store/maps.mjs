import { query } from '../db.mjs';
import { clampPage, pageCount } from '../lib/paging.mjs';
import { rankingPage } from '../lib/map-ranking.mjs';
import { MAP_TOP_PLAYERS, MAPS_PAGE_SIZE, MIN_EXP_PER_HOUR, MIN_SESSION_SECONDS, rankPlayers } from '../../web/src/lib/maps.ts';
import { refreshStaleStats } from './session-stats.mjs';

/** Sessions shorter than this (first to last reading) say nothing reliable about a map's rate. */
const TRACKED_MIN_SECONDS = 60;
const MAX_WEEK_SESSIONS = 1000;

/**
 * One row per session: which map, who, for how long, and what was gained. A session is named after the
 * first map the minimap showed, so this is "where the session was spent". The numbers come from
 * ms_session_stats (see session-stats.mjs); the names are joined in live, so a rename needs no recompute.
 */
const SESSION_SELECT = `
select s.id,
       s.label as map,
       coalesce(nullif(st.name, ''), nullif(s.character, ''), nullif(ci.name, ''), 'Unknown') as player,
       coalesce(nullif(st.job, ''), nullif(en.job, ''), nullif(ci.job, '')) as job,
       coalesce(s.fingerprint, lower(coalesce(nullif(st.name, ''), nullif(s.character, ''), s.id::text))) as "playerKey",
       extract(epoch from x.first_at) * 1000 as "startedAt",
       x.seconds,
       x.level_from as "levelFrom", x.level_to as "levelTo",
       x.exp_gained as "expGained", x.exp_pct_gained as "expPctGained", x.exp_tail_pct_gained as "expTailPctGained", x.meso_gained as "mesoGained"
  from ms_session_stats x
  join ms_capture_sessions s on s.id = x.session_id
  left join ms_session_snapshots st on st.session_id = s.id and st.kind = 'start'
  left join ms_session_snapshots en on en.session_id = s.id and en.kind = 'end'
  left join ms_character_identities ci on ci.fingerprint = s.fingerprint`;

/**
 * The Maps page counts only real grinding sessions: named, long enough to trust and fast enough to matter.
 * $1 = minimum seconds, $2 = minimum EXP/h (the thresholds of `isQualifyingSession` in web/src/lib/maps.ts),
 * $3 = a map name to limit to, or null for every map. Compared without dividing, so a zero-length session is safe.
 */
const QUALIFYING = `
 where s.label <> '' and x.readings >= 2
   and x.seconds >= $1 and x.exp_gained::float8 * 3600 > $2::float8 * x.seconds
   and ($3::text is null or s.label = $3)`;

const QUALIFYING_PARAMS = (map) => [MIN_SESSION_SECONDS, MIN_EXP_PER_HOUR, map ?? null];

/** Numbers come back as JS numbers (Postgres returns bigint as text unless parsed, and numeric always). */
function toSession(row) {
  return {
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
    expTailPctGained: Number(row.expTailPctGained),
    mesoGained: Number(row.mesoGained),
  };
}

/** Every qualifying session (optionally of one map), newest first. Reads the stats table only. */
async function qualifyingSessions(map) {
  await refreshStaleStats();
  const { rows } = await query(`${SESSION_SELECT}${QUALIFYING} order by x.first_at desc, s.id`, QUALIFYING_PARAMS(map));
  return rows.map(toSession);
}

/** How many named sessions of a minute or more have been tracked: the "N tracked" the page compares against. */
async function countTracked() {
  const { rows } = await query(
    `select count(*)::int as n from ms_session_stats x join ms_capture_sessions s on s.id = x.session_id
      where s.label <> '' and x.readings >= 2 and x.seconds >= $1`,
    [TRACKED_MIN_SECONDS],
  );
  return rows[0].n;
}

/**
 * One page of the map ranking: 20 maps ordered by `sort`, each with its fastest player, plus how many
 * sessions qualify out of how many are tracked (for the note under the table).
 */
export async function getMapRanking({ sort, page }) {
  const [sessions, tracked] = await Promise.all([qualifyingSessions(null), countTracked()]);
  return { ...rankingPage(sessions, { sort, page }), qualifying: sessions.length, tracked };
}

/** The fastest players on one map (one entry per player, rated by their best session there). */
export async function getMapPlayers(map) {
  return rankPlayers(await qualifyingSessions(map), MAP_TOP_PLAYERS);
}

/** One page of qualifying sessions, newest first: every map, or just `map`. */
export async function getMapHistory({ map, page }) {
  await refreshStaleStats();
  const params = QUALIFYING_PARAMS(map);
  const { rows: counted } = await query(
    `select count(*)::int as n from ms_session_stats x join ms_capture_sessions s on s.id = x.session_id${QUALIFYING}`,
    params,
  );
  const total = counted[0].n;
  const totalPages = pageCount(total, MAPS_PAGE_SIZE);
  const current = clampPage(page, totalPages);
  const { rows } = await query(`${SESSION_SELECT}${QUALIFYING} order by x.first_at desc, s.id limit $4 offset $5`, [
    ...params,
    MAPS_PAGE_SIZE,
    (current - 1) * MAPS_PAGE_SIZE,
  ]);
  return { sessions: rows.map(toSession), page: current, pageSize: MAPS_PAGE_SIZE, total, totalPages };
}

/** Every session that started at or after `sinceMs` (epoch ms), named or not, newest first. For the weekly rankings. */
export async function listWeekSessions(sinceMs) {
  await refreshStaleStats();
  const { rows } = await query(
    `${SESSION_SELECT}
      where x.readings >= 2 and x.seconds >= $1 and x.first_at >= to_timestamp($2::float8 / 1000.0)
      order by x.first_at desc, s.id
      limit $3`,
    [TRACKED_MIN_SECONDS, sinceMs, MAX_WEEK_SESSIONS],
  );
  return rows.map(toSession);
}

/** Stats for just these sessions (no length minimum), e.g. whoever is grinding right now. */
export async function listStatsForSessions(ids) {
  await refreshStaleStats();
  const { rows } = await query(`${SESSION_SELECT} where x.readings >= 2 and s.id = any($1::uuid[])`, [ids]);
  return rows.map(toSession);
}
