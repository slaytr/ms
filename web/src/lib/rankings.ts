import type { MapSession } from './maps';

/** One player's totals over the ranking window. */
export interface WeeklyRank {
  readonly playerKey: string;
  readonly player: string;
  readonly job: string | null;
  /** Level at the end of their newest session in the window, when it was read. */
  readonly level: number | null;
  readonly expGained: number;
  /** Share of a level gained (100 = one full level): shown beside raw EXP since levels differ in size. */
  readonly expPctGained: number;
  readonly seconds: number;
  readonly sessions: number;
}

export const PODIUM_SIZE = 3;

/**
 * Adds up each player's sessions and returns the `limit` with the most EXP gained, best first. Ties go
 * to the larger share of a level, then to the name so the order is stable. Input is not modified.
 */
export function topByExp(sessions: readonly MapSession[], limit: number = PODIUM_SIZE): readonly WeeklyRank[] {
  const byPlayer = new Map<string, MapSession[]>();
  for (const session of sessions) {
    byPlayer.set(session.playerKey, [...(byPlayer.get(session.playerKey) ?? []), session]);
  }
  const ranks = [...byPlayer.entries()].map(([playerKey, group]): WeeklyRank => {
    const newest = group.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
    const latestWithJob = [...group].sort((a, b) => b.startedAt - a.startedAt).find((s) => s.job);
    return {
      playerKey,
      player: newest.player,
      job: latestWithJob?.job ?? null,
      level: newest.levelTo ?? newest.levelFrom,
      expGained: group.reduce((total, s) => total + s.expGained, 0),
      expPctGained: group.reduce((total, s) => total + s.expPctGained, 0),
      seconds: group.reduce((total, s) => total + s.seconds, 0),
      sessions: group.length,
    };
  });
  return ranks
    .filter((rank) => rank.expGained > 0)
    .sort((a, b) => b.expGained - a.expGained || b.expPctGained - a.expPctGained || a.player.localeCompare(b.player))
    .slice(0, limit);
}

/** What the API returns for the window: when it starts, and the sessions inside it. */
export interface WeeklySessions {
  readonly since: number;
  readonly sessions: readonly MapSession[];
}
