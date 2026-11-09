import { CUMULATIVE_EXP } from '../data/expTable';

/** A level and EXP reading, as seen at one moment. */
export interface LevelPoint {
  readonly at: number;
  readonly level: number;
  readonly exp: number;
  /** Progress through the level, 0-100, when it was read. */
  readonly expPct: number | null;
}

/** One character on the Characters page: its latest known state. */
export interface CharacterEntry {
  readonly playerKey: string;
  readonly name: string;
  readonly job: string | null;
  readonly level: number;
  /** Progress through the current level, 0-100, when it was read. */
  readonly expPct: number | null;
  /** Epoch ms of the newest snapshot. */
  readonly lastSeenAt: number;
  /** The earliest and latest readings inside the last 24 hours, or null when not tracked in that window. */
  readonly dayFrom: LevelPoint | null;
  readonly dayTo: LevelPoint | null;
}

export interface DayGain {
  /** EXP gained (negative after a death penalty): total EXP at the latest reading minus at the earliest. */
  readonly exp: number;
  /** Share of a level gained (100 = one full level), or null when either reading lacked a percentage. */
  readonly pct: number | null;
}

/** Total EXP earned since level 1, or null for a level the table doesn't cover. */
const totalExp = (point: LevelPoint): number | null => {
  const base = CUMULATIVE_EXP[point.level];
  return base === undefined ? null : base + point.exp;
};

/**
 * What a character gained between the earliest and latest readings of the last day. It is a difference
 * of the readings, not a sum over sessions. Null when there are fewer than two readings or a level is unknown.
 */
export function dayGain(entry: Pick<CharacterEntry, 'dayFrom' | 'dayTo'>): DayGain | null {
  const { dayFrom: from, dayTo: to } = entry;
  if (!from || !to || to.at <= from.at) return null;
  const start = totalExp(from);
  const end = totalExp(to);
  if (start === null || end === null) return null;
  const pct = from.expPct === null || to.expPct === null ? null : (to.level - from.level) * 100 + (to.expPct - from.expPct);
  return { exp: end - start, pct };
}

/** A new array, highest level first; ties go to more EXP into the level, then the most recently seen. */
export function rankCharacters(characters: readonly CharacterEntry[]): readonly CharacterEntry[] {
  return [...characters].sort(
    (a, b) =>
      b.level - a.level ||
      (b.expPct ?? -1) - (a.expPct ?? -1) ||
      b.lastSeenAt - a.lastSeenAt ||
      a.name.localeCompare(b.name),
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "2d ago": how long since the character was last tracked. */
export function formatSeen(lastSeenAt: number, now: number): string {
  const age = Math.max(0, now - lastSeenAt);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
  return `${Math.floor(age / DAY)}d ago`;
}
