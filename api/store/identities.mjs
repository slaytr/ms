import { query } from '../db.mjs';

/**
 * Records the name and spec a player entered against the fingerprint of the session they entered it
 * from. The fingerprint comes from the stored session, never from the client, so the caller can only
 * name the character they are actually tracking. Returns false when the session has no fingerprint.
 */
export async function saveIdentityForSession(sessionId, { name, job }) {
  const { rowCount } = await query(
    `insert into ms_character_identities (fingerprint, name, job)
     select fingerprint, $2, $3 from ms_capture_sessions where id = $1 and fingerprint is not null
     on conflict (fingerprint) do update set name = excluded.name, job = excluded.job, updated_at = now()`,
    [sessionId, name, job],
  );
  return rowCount > 0;
}

/** The saved name and spec for a character, or null when we have neither. */
export async function getIdentity(fingerprint) {
  const { rows } = await query('select name, job from ms_character_identities where fingerprint = $1', [fingerprint]);
  const row = rows[0];
  return row && row.name && row.job ? { name: row.name, job: row.job } : null;
}
