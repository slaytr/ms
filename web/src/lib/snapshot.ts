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
  const hasExp = detection.exp !== null;

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
