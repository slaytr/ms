import { query } from '../db.mjs';
import { pickIdentity } from '../lib/identity.mjs';

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

/**
 * The name and spec we hold for a character, or null when we have neither. A typed identity wins; failing that,
 * the character is known from earlier sessions where the detector read its name and spec from the same fingerprint,
 * so a returning player isn't asked again just because this session's frames didn't read the name.
 */
export async function getIdentity(fingerprint) {
  const typed = await query('select name, job from ms_character_identities where fingerprint = $1', [fingerprint]);
  const detected = await query(
    `select name, job from ms_session_snapshots
      where fingerprint = $1 and coalesce(name, '') <> '' and coalesce(job, '') <> ''
      order by taken_at desc limit 1`,
    [fingerprint],
  );
  return pickIdentity(typed.rows[0], detected.rows[0]);
}
