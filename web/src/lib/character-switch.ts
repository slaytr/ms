/**
 * Notices that the player changed character on the shared window. A session belongs to one character
 * (its fingerprint), so when another character stays on screen the tracker must close the session
 * and start a new one, instead of piling the new character's readings onto the old one.
 */

/** Ticks (~3s each) in a row another fingerprint must be read before we call it a character switch. */
export const SWITCH_AFTER_TICKS = 3;

export interface SwitchState {
  /** The other fingerprint being watched, if any. */
  readonly candidate: string | null;
  /** How many reads of `candidate` so far. */
  readonly count: number;
}

export const noSwitch: SwitchState = { candidate: null, count: 0 };

export interface SwitchStep {
  readonly state: SwitchState;
  /** True on the tick the switch is confirmed. */
  readonly switched: boolean;
  /** The character switched to (only when `switched`). */
  readonly fingerprint: string | null;
}

/**
 * Folds one tick's fingerprint in. `sessionFingerprint` is the character the open session belongs to;
 * null means the session has none (or there is no session), in which case nothing can switch.
 * An unreadable tick (null) changes nothing: the name plate is often covered for a moment.
 */
export function observeFingerprint(state: SwitchState, sessionFingerprint: string | null, seen: string | null): SwitchStep {
  if (sessionFingerprint === null) return { state: noSwitch, switched: false, fingerprint: null };
  if (seen === null) return { state, switched: false, fingerprint: null };
  if (seen === sessionFingerprint) return { state: noSwitch, switched: false, fingerprint: null };

  const count = state.candidate === seen ? state.count + 1 : 1;
  if (count >= SWITCH_AFTER_TICKS) return { state: noSwitch, switched: true, fingerprint: seen };
  return { state: { candidate: seen, count }, switched: false, fingerprint: null };
}
