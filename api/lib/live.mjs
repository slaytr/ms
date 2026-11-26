/** A session counts as "grinding now" when its latest reading is newer than this. */
export const LIVE_WINDOW_SECONDS = 5 * 60;
const MAX_LIVE = 12;
/** The live box always shows at least this many people: when fewer are grinding, those last seen fill the rest. */
export const MIN_SHOWN = 3;
/** A rate from less tracked time than this is noise (one kill), so it is left blank. */
export const MIN_RATE_SECONDS = 2 * 60;

/**
 * EXP gained, and whether part of it is a guess. The stored figure is already the whole gain, worked out by
 * the tracker's own maths (api/lib/session-gains.mjs): exact where raw EXP was read, sized from the percent
 * and the EXP table where the game hid it, level-ups carried across either way.
 */
function expOf(row) {
  return { exp: row.expGained, estimated: row.expEstimated === true };
}

/** One player's entry: who they are, their latest level / EXP%, and what the session gained. */
function toEntry(row, latest) {
  const now = latest.get(row.id) ?? { level: null, pct: null };
  const { exp, estimated } = expOf(row);
  return {
    id: row.id,
    player: row.player,
    job: row.job,
    map: row.map || null,
    seconds: row.seconds,
    level: now.level,
    pct: now.pct,
    expGained: exp,
    expPerHour: row.seconds >= MIN_RATE_SECONDS ? (exp / row.seconds) * 3600 : null,
    estimated,
  };
}

/**
 * Turns per-session stats plus each session's latest level / EXP% into the list the home page shows:
 * one entry per player (their most recent session), unnamed players left out (no one to show), the
 * biggest EXP gain first. Pure, so it is easy to test.
 *
 * @param {ReadonlyArray<{ id: string, player: string, job: string | null, map: string, playerKey: string, expGained: number, expPctGained: number, expEstimated?: boolean, seconds: number, startedAt: number }>} stats
 * @param {ReadonlyMap<string, { level: number | null, pct: number | null }>} latest by session id
 */
export function shapeLive(stats, latest) {
  const newestPerPlayer = new Map();
  for (const row of stats) {
    if (row.player === 'Unknown') continue;
    const seen = newestPerPlayer.get(row.playerKey);
    if (!seen || row.startedAt > seen.startedAt) newestPerPlayer.set(row.playerKey, row);
  }
  return [...newestPerPlayer.values()]
    .map((row) => toEntry(row, latest))
    .sort((a, b) => b.expGained - a.expGained)
    .slice(0, MAX_LIVE);
}

/**
 * Players who are not grinding now, most recently seen first, to fill the box when fewer than
 * MIN_SHOWN are live. One entry per player (the session they were last seen in); players already
 * live (excludeKeys), unnamed players and sessions with no reading are left out. Each entry carries
 * lastSeenAt (ISO time of its latest reading), which is how the page tells them from live ones.
 *
 * @param {ReadonlyArray<{ id: string, player: string, job: string | null, map: string, playerKey: string, expGained: number, expPctGained: number, expEstimated?: boolean, seconds: number, startedAt: number }>} stats
 * @param {ReadonlyMap<string, { level: number | null, pct: number | null }>} latest by session id
 * @param {ReadonlyMap<string, number>} lastSeen epoch ms of each session's latest reading, by session id
 * @param {ReadonlySet<string>} excludeKeys player keys to skip
 * @param {number} need how many to return at most
 */
export function shapeRecent(stats, latest, lastSeen, excludeKeys, need) {
  const newestPerPlayer = new Map();
  for (const row of stats) {
    const at = lastSeen.get(row.id);
    if (row.player === 'Unknown' || at === undefined || excludeKeys.has(row.playerKey)) continue;
    const seen = newestPerPlayer.get(row.playerKey);
    if (!seen || at > seen.at) newestPerPlayer.set(row.playerKey, { row, at });
  }
  return [...newestPerPlayer.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, need))
    .map(({ row, at }) => ({ ...toEntry(row, latest), lastSeenAt: new Date(at).toISOString() }));
}
