import { query } from '../db.mjs';
import { LIVE_WINDOW_SECONDS, MIN_SHOWN, shapeLive, shapeRecent } from '../lib/live.mjs';
import { listStatsForSessions } from './maps.mjs';

/** How many recent sessions are looked at to find enough different players to fill the box. */
const RECENT_SESSION_LIMIT = 40;

const LATEST_LEVEL = `(select level from ms_readings r where r.session_id = s.id and r.level is not null order by r.taken_at desc limit 1)`;
const LATEST_PCT = `(select exp_pct from ms_readings r where r.session_id = s.id and r.exp_pct is not null order by r.taken_at desc limit 1)`;

const toLatest = (rows) => new Map(rows.map((r) => [r.id, { level: r.level, pct: r.pct === null ? null : Number(r.pct) }]));

/** Sessions that posted a reading recently and were not stopped. */
async function queryLive() {
  const { rows } = await query(
    `select s.id, ${LATEST_LEVEL} as level, ${LATEST_PCT} as pct
       from ms_capture_sessions s
      where s.ended_at is null
        and exists (select 1 from ms_readings r where r.session_id = s.id and r.taken_at > now() - make_interval(secs => $1))`,
    [LIVE_WINDOW_SECONDS],
  );
  return rows;
}

/** The sessions read most recently that are not live, with when each was last read. */
async function queryRecent(liveIds) {
  const { rows } = await query(
    `select s.id, ${LATEST_LEVEL} as level, ${LATEST_PCT} as pct, last.taken_at as last_seen
       from ms_capture_sessions s
       join lateral (select max(r.taken_at) as taken_at from ms_readings r where r.session_id = s.id) last on last.taken_at is not null
      where s.id <> all($1::uuid[])
      order by last.taken_at desc
      limit $2`,
    [liveIds, RECENT_SESSION_LIMIT],
  );
  return rows;
}

/**
 * Who is grinding right now (a reading in the last few minutes, session not stopped), with their level
 * and EXP% as of the latest reading and the EXP gained this session. When fewer than MIN_SHOWN are
 * grinding, the rest of the spots go to whoever was last seen, each tagged with `lastSeenAt`.
 */
export async function listLiveSessions() {
  const liveRows = await queryLive();
  const recentRows = liveRows.length < MIN_SHOWN ? await queryRecent(liveRows.map((r) => r.id)) : [];
  const ids = [...liveRows, ...recentRows].map((r) => r.id);
  if (ids.length === 0) return [];

  const stats = await listStatsForSessions(ids);
  const liveIds = new Set(liveRows.map((r) => r.id));
  const liveStats = stats.filter((row) => liveIds.has(row.id));
  const live = shapeLive(liveStats, toLatest(liveRows));
  if (live.length >= MIN_SHOWN) return live;

  const lastSeen = new Map(recentRows.map((r) => [r.id, new Date(r.last_seen).getTime()]));
  const liveKeys = new Set(liveStats.map((row) => row.playerKey));
  const recent = shapeRecent(
    stats.filter((row) => !liveIds.has(row.id)),
    toLatest(recentRows),
    lastSeen,
    liveKeys,
    MIN_SHOWN - live.length,
  );
  return [...live, ...recent];
}
