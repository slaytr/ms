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
  /** Levels gained: the share of a level gained / 100, so 1.4 is a level and 40%. Wraps level-ups and ignores the level label. */
  readonly levelsGained: number;
  /** Mesos gained (only counted while the inventory is open, so it can undercount). */
  readonly mesoGained: number;
  readonly seconds: number;
  readonly sessions: number;
}

export const PODIUM_SIZE = 3;

/** Adds up each player's sessions over the window, unranked. Input is not modified. */
function weeklyTotals(sessions: readonly MapSession[]): readonly WeeklyRank[] {
  const byPlayer = new Map<string, MapSession[]>();
  for (const session of sessions) {
    byPlayer.set(session.playerKey, [...(byPlayer.get(session.playerKey) ?? []), session]);
  }
  return [...byPlayer.entries()].map(([playerKey, group]): WeeklyRank => {
    const newest = group.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
    const latestWithJob = [...group].sort((a, b) => b.startedAt - a.startedAt).find((s) => s.job);
    const expPctGained = group.reduce((total, s) => total + s.expPctGained, 0);
    return {
      playerKey,
      player: newest.player,
      job: latestWithJob?.job ?? null,
      level: newest.levelTo ?? newest.levelFrom,
      expGained: group.reduce((total, s) => total + s.expGained, 0),
      expPctGained,
      levelsGained: expPctGained / 100,
      mesoGained: group.reduce((total, s) => total + s.mesoGained, 0),
      seconds: group.reduce((total, s) => total + s.seconds, 0),
      sessions: group.length,
    };
  });
}

/**
 * The `limit` players with the most EXP gained, best first. Ties go to the larger share of a level, then to
 * the name so the order is stable.
 */
export function topByExp(sessions: readonly MapSession[], limit: number = PODIUM_SIZE): readonly WeeklyRank[] {
  return weeklyTotals(sessions)
    .filter((rank) => rank.expGained > 0)
    .sort((a, b) => b.expGained - a.expGained || b.expPctGained - a.expPctGained || a.player.localeCompare(b.player))
    .slice(0, limit);
}

/** The `limit` players who gained the most levels (a share of a level counts), best first; ties go to the name. */
export function topByLevels(sessions: readonly MapSession[], limit: number = PODIUM_SIZE): readonly WeeklyRank[] {
  return weeklyTotals(sessions)
    .filter((rank) => rank.levelsGained > 0)
    .sort((a, b) => b.levelsGained - a.levelsGained || a.player.localeCompare(b.player))
    .slice(0, limit);
}

/** The `limit` players who gained the most mesos, best first; ties go to the name. */
export function topByMesos(sessions: readonly MapSession[], limit: number = PODIUM_SIZE): readonly WeeklyRank[] {
  return weeklyTotals(sessions)
    .filter((rank) => rank.mesoGained > 0)
    .sort((a, b) => b.mesoGained - a.mesoGained || a.player.localeCompare(b.player))
    .slice(0, limit);
}

/** What the API returns for the window: when it starts, and the sessions inside it. */
export interface WeeklySessions {
  readonly since: number;
  readonly sessions: readonly MapSession[];
}
