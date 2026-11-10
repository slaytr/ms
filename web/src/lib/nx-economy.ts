/** NX every character starts with. */
export const STARTING_NX = 7_000;
/** NX granted each time a character's cumulative EXP crosses another threshold. */
export const NX_PER_GRANT = 35_000;
/** Cumulative EXP gained, across all of a character's sessions, for each grant. */
export const XP_PER_GRANT = 200_000;

/** Where a character stands: what they have earned, spent and can spend, and how far off the next grant is. */
export interface NxStatus {
  /** Total EXP gained across every session of the character. */
  readonly expGained: number;
  /** Grants reached so far (each worth `NX_PER_GRANT`). */
  readonly grants: number;
  readonly earned: number;
  readonly spent: number;
  /** Spendable now: earned minus spent. */
  readonly balance: number;
  /** EXP gained since the last grant threshold. */
  readonly expIntoGrant: number;
  /** EXP still to gain for the next grant. */
  readonly expToNext: number;
}

/**
 * The NX picture for a character: the starting NX plus one grant per full 200K EXP gained, less what they
 * have spent. Earned NX is derived from EXP every time, never stored, so it always matches the sessions.
 */
export function nxStatus(expGained: number, spent: number): NxStatus {
  const exp = Number.isFinite(expGained) ? Math.max(0, Math.floor(expGained)) : 0;
  const outlay = Number.isFinite(spent) ? Math.max(0, Math.floor(spent)) : 0;
  const grants = Math.floor(exp / XP_PER_GRANT);
  const earned = STARTING_NX + grants * NX_PER_GRANT;
  const expIntoGrant = exp % XP_PER_GRANT;
  return {
    expGained: exp,
    grants,
    earned,
    spent: outlay,
    balance: earned - outlay,
    expIntoGrant,
    expToNext: XP_PER_GRANT - expIntoGrant,
  };
}
