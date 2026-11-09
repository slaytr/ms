/** One tracked session, as the API reports it for the Maps page. The session is named after its map. */
export interface MapSession {
  readonly id: string;
  readonly map: string;
  readonly player: string;
  /** The character's job as the game words it (e.g. "Wizard (Ice,Lightning)"), or null when it couldn't be read. */
  readonly job: string | null;
  /** Stable identity (character fingerprint), so two sessions by one character count as one player. */
  readonly playerKey: string;
  /** Epoch ms of the first reading. */
  readonly startedAt: number;
  readonly seconds: number;
  readonly levelFrom: number | null;
  readonly levelTo: number | null;
  readonly expGained: number;
  /** Share of a level gained (100 = one full level), so characters of any level compare fairly. */
  readonly expPctGained: number;
  readonly mesoGained: number;
}

export interface MapRank {
  readonly map: string;
  readonly sessions: number;
  readonly players: number;
  readonly seconds: number;
  readonly expGained: number;
  readonly expPerHour: number;
  readonly expPctPerHour: number;
  readonly mesoPerHour: number;
}

export type RankKey = 'expPerHour' | 'expPctPerHour' | 'mesoPerHour' | 'seconds' | 'sessions';

const HOUR_SECONDS = 3600;

/** Only real grinding sessions count toward the Maps page: long enough to trust, and fast enough to matter. */
export const MIN_SESSION_SECONDS = 30 * 60;
export const MIN_EXP_PER_HOUR = 50_000;

const perHour = (amount: number, seconds: number) => (seconds > 0 ? (amount / seconds) * HOUR_SECONDS : 0);

/** Lasted at least 30 minutes and earned more than 50K EXP/h. */
export function isQualifyingSession(session: MapSession): boolean {
  return session.seconds >= MIN_SESSION_SECONDS && perHour(session.expGained, session.seconds) > MIN_EXP_PER_HOUR;
}

/** A new array of just the qualifying sessions. */
export function qualifyingSessions(sessions: readonly MapSession[]): readonly MapSession[] {
  return sessions.filter(isQualifyingSession);
}

/**
 * Groups sessions by map. Rates are total gained over total time (not an average of averages), so a
 * long session counts for more than a short one. Maps come back best EXP/h first.
 */
export function rankMaps(sessions: readonly MapSession[]): readonly MapRank[] {
  const byMap = new Map<string, MapSession[]>();
  for (const session of sessions) {
    byMap.set(session.map, [...(byMap.get(session.map) ?? []), session]);
  }
  const ranks = [...byMap.entries()].map(([map, group]): MapRank => {
    const sum = (pick: (s: MapSession) => number) => group.reduce((total, s) => total + pick(s), 0);
    const seconds = sum((s) => s.seconds);
    const expGained = sum((s) => s.expGained);
    return {
      map,
      sessions: group.length,
      players: new Set(group.map((s) => s.playerKey)).size,
      seconds,
      expGained,
      expPerHour: perHour(expGained, seconds),
      expPctPerHour: perHour(
        sum((s) => s.expPctGained),
        seconds,
      ),
      mesoPerHour: perHour(
        sum((s) => s.mesoGained),
        seconds,
      ),
    };
  });
  return sortRanks(ranks, 'expPerHour');
}

/** A new array ordered by `key`, highest first; ties fall back to the map name so the order is stable. */
export function sortRanks(ranks: readonly MapRank[], key: RankKey): readonly MapRank[] {
  return [...ranks].sort((a, b) => b[key] - a[key] || a.map.localeCompare(b.map));
}

export interface SessionRates {
  readonly expPerHour: number;
  readonly expPctPerHour: number;
  readonly mesoPerHour: number;
}

export function sessionRates(session: MapSession): SessionRates {
  return {
    expPerHour: perHour(session.expGained, session.seconds),
    expPctPerHour: perHour(session.expPctGained, session.seconds),
    mesoPerHour: perHour(session.mesoGained, session.seconds),
  };
}

/** "1h 05m" or "42m" or "50s": how long a stay lasted, at the precision that matters for its size. */
export function formatStay(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** "Lv 49" or "Lv 49 → 50"; a dash when the level was never read. */
export function formatLevels(from: number | null, to: number | null): string {
  if (from === null && to === null) return '—';
  if (from === null || to === null || from === to) return `Lv ${from ?? to}`;
  return `Lv ${from} → ${to}`;
}
