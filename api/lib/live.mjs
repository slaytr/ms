import { expToNext } from '../../web/src/data/expTable.ts';

/** A session counts as "grinding now" when its latest reading is newer than this. */
export const LIVE_WINDOW_SECONDS = 5 * 60;
const MAX_LIVE = 12;
/** The live box always shows at least this many people: when fewer are grinding, those last seen fill the rest. */
export const MIN_SHOWN = 3;
/** A rate from less tracked time than this is noise (one kill), so it is left blank. */
export const MIN_RATE_SECONDS = 2 * 60;

/**
 * EXP gained, and whether it is a guess. Raw EXP readings give it exactly. A game that shows only the EXP
 * bar's percent (it hides raw EXP above 1M) has none, so it is sized from the percent gained and the level's
 * EXP from the table. That ignores a level-up part way through, which is fine for a rough figure.
 */
function expOf(row, level) {
  if (row.expGained > 0) return { exp: row.expGained, estimated: false };
  const need = level === null ? null : expToNext(level);
  if (need === null || !(row.expPctGained > 0)) return { exp: 0, estimated: false };
  return { exp: (row.expPctGained / 100) * need, estimated: true };
}

/** One player's entry: who they are, their latest level / EXP%, and what the session gained. */
function toEntry(row, latest) {
  const now = latest.get(row.id) ?? { level: null, pct: null };
  const { exp, estimated } = expOf(row, now.level);
  return {
    id: row.id,
    player: row.player,
    job: row.job,
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
 * @param {ReadonlyArray<{ id: string, player: string, job: string | null, playerKey: string, expGained: number, expPctGained: number, seconds: number, startedAt: number }>} stats
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
 * @param {ReadonlyArray<{ id: string, player: string, job: string | null, playerKey: string, expGained: number, expPctGained: number, seconds: number, startedAt: number }>} stats
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
