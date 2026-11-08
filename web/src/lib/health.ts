import type { Detection } from './detect/detect.ts';

/** ok: read with certainty. unreadable: on screen but a digit/letter isn't recognised yet. missing: not on screen. */
export type Health = 'ok' | 'unreadable' | 'missing';

export interface TrackingHealth {
  /** We are receiving frames from the shared window. */
  readonly window: Health;
  readonly character: Health;
  readonly level: Health;
  readonly exp: Health;
  /** Optional: only visible while the inventory is open. */
  readonly meso: Health;
}

const rate = (found: boolean, value: unknown): Health => (!found ? 'missing' : value === null ? 'unreadable' : 'ok');

/**
 * What we can confirm from the latest detection. A character counts as identified as long as its
 * name pixels were found (the fingerprint is the identity); a readable name is a separate nicety,
 * which `knownName` (e.g. one the player typed in) can also satisfy.
 */
export function assessDetection(detection: Detection | null, knownName: string | null = null): TrackingHealth {
  if (!detection) {
    return { window: 'missing', character: 'missing', level: 'missing', exp: 'missing', meso: 'missing' };
  }
  const { found, character } = detection;
  return {
    window: 'ok',
    character: rate(found.character, character.name ?? knownName),
    level: rate(found.level, detection.level),
    exp: rate(found.exp, detection.exp),
    meso: rate(found.mesos, detection.meso),
  };
}

/** The core data we need before calling a session "tracked": who, what level, and EXP. Meso is a bonus. */
export function coreReady(detection: Detection | null): boolean {
  return detection !== null && detection.found.character && detection.level !== null && detection.exp !== null;
}
