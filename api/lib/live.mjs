/** A session counts as "grinding now" when its latest reading is newer than this. */
export const LIVE_WINDOW_SECONDS = 5 * 60;
const MAX_LIVE = 12;

/**
 * Turns per-session stats plus each session's latest level / EXP% into the list the home page shows:
 * one entry per player (their most recent session), unnamed players left out (no one to show), the
 * biggest EXP gain first. Pure, so it is easy to test.
 *
 * @param {ReadonlyArray<{ id: string, player: string, job: string | null, playerKey: string, expGained: number, startedAt: number }>} stats
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
    .map((row) => {
      const now = latest.get(row.id) ?? { level: null, pct: null };
      return {
        id: row.id,
        player: row.player,
        job: row.job,
        level: now.level,
        pct: now.pct,
        expGained: row.expGained,
      };
    })
    .sort((a, b) => b.expGained - a.expGained)
    .slice(0, MAX_LIVE);
}
