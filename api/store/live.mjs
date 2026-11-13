import { query } from '../db.mjs';
import { LIVE_WINDOW_SECONDS, shapeLive } from '../lib/live.mjs';
import { listStatsForSessions } from './maps.mjs';

/**
 * Sessions that have posted a reading recently and were not stopped: who is grinding right now,
 * with their level and EXP% as of the latest reading and the EXP gained this session.
 */
export async function listLiveSessions() {
  const { rows } = await query(
    `select s.id,
            (select level from ms_readings r where r.session_id = s.id and r.level is not null order by r.taken_at desc limit 1) as level,
            (select exp_pct from ms_readings r where r.session_id = s.id and r.exp_pct is not null order by r.taken_at desc limit 1) as pct
       from ms_capture_sessions s
      where s.ended_at is null
        and exists (select 1 from ms_readings r where r.session_id = s.id and r.taken_at > now() - make_interval(secs => $1))`,
    [LIVE_WINDOW_SECONDS],
  );
  if (rows.length === 0) return [];
  const latest = new Map(rows.map((r) => [r.id, { level: r.level, pct: r.pct === null ? null : Number(r.pct) }]));
  const stats = await listStatsForSessions(rows.map((r) => r.id));
  return shapeLive(stats, latest);
}
