import type { Detection } from './detect/detect.ts';

/**
 * Who the player is and where they stand at one moment. Saved when a session
 * starts and ends, so progress can be graphed across sessions per character.
 */
export interface PlayerSnapshot {
  /** Epoch milliseconds. */
  readonly takenAt: number;
  /** Exact-pixel hash of the on-screen name; the stable per-character identity. */
  readonly fingerprint: string | null;
  readonly name: string | null;
  readonly job: string | null;
  readonly level: number | null;
  readonly exp: number | null;
  readonly expPct: number | null;
  readonly meso: number | null;
}

/** Everything unknown. */
const BLANK = {
  fingerprint: null,
  name: null,
  job: null,
  level: null,
  exp: null,
  expPct: null,
  meso: null,
} as const;

/** Who the player says they are (typed in), tied to the on-screen fingerprint it was entered for. */
export interface PlayerIdentity {
  readonly fingerprint: string;
  readonly name: string;
  readonly job: string;
}

/** Puts the player's own name and spec on a snapshot of that same character; any other snapshot is returned as is. */
export function applyIdentity(snapshot: PlayerSnapshot, identity: PlayerIdentity | null): PlayerSnapshot {
  if (!identity || snapshot.fingerprint !== identity.fingerprint) return snapshot;
  return { ...snapshot, name: identity.name, job: identity.job };
}

/** What one detection says on its own. Unread values stay null: a snapshot never guesses. */
export function snapshotFrom(detection: Detection, takenAt: number): PlayerSnapshot {
  return carryForward(null, detection, takenAt);
}

/**
 * Updates `previous` with whatever this detection could read, keeping the last known value for
 * everything it couldn't. Meso is only visible while the inventory is open, so without this the
 * closing snapshot would usually have no meso. Related values move together: raw EXP and its
 * percent come from the same tick, and the identity fields from the same name plate, so the result
 * never mixes one tick's EXP with another's percent.
 */
export function carryForward(previous: PlayerSnapshot | null, detection: Detection, takenAt: number): PlayerSnapshot {
  const base = previous ?? { takenAt, ...BLANK };
  const { character } = detection;
  const hasIdentity = character.fingerprint !== null;
  // The game hides raw EXP once a level needs over a million, leaving only the percent. That is told apart from a
  // single failed read (keep the last exact pair, never mixing two ticks) by raw EXP never having been seen at
  // this level: none known yet, or the level just changed.
  const levelChanged = detection.level !== null && base.level !== null && detection.level !== base.level;
  const percentOnly = detection.exp === null && detection.expPct !== null && (base.exp === null || levelChanged);
  const hasExp = detection.exp !== null || percentOnly;

  return {
    takenAt,
    fingerprint: hasIdentity ? character.fingerprint : base.fingerprint,
    // A different character on screen must not inherit the previous one's name or job.
    name: hasIdentity ? (character.name ?? (character.fingerprint === base.fingerprint ? base.name : null)) : base.name,
    job: hasIdentity ? (character.job ?? (character.fingerprint === base.fingerprint ? base.job : null)) : base.job,
    level: detection.level ?? base.level,
    exp: hasExp ? detection.exp : base.exp,
    expPct: hasExp ? detection.expPct : base.expPct,
    meso: detection.meso ?? base.meso,
  };
}
