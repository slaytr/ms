const MAX_NAME_LENGTH = 20;
const MAX_JOB_LENGTH = 80;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * A player-typed name and spec, ready to store: trimmed, inner whitespace collapsed, name capped at
 * the form's 20 characters. Null when either is missing or holds control characters, so a bad entry
 * is refused rather than half saved.
 */
export function cleanIdentity(name, job) {
  if (typeof name !== 'string' || typeof job !== 'string') return null;
  if (CONTROL_CHARS.test(name) || CONTROL_CHARS.test(job)) return null;
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  const cleanJob = job.trim().replace(/\s+/g, ' ').slice(0, MAX_JOB_LENGTH);
  return cleanName && cleanJob ? { name: cleanName, job: cleanJob } : null;
}

const hasText = (value) => typeof value === 'string' && value.trim() !== '';
const complete = (row) => (row && hasText(row.name) && hasText(row.job) ? { name: row.name, job: row.job } : null);

/**
 * Who a fingerprint belongs to, from what we hold: what a player typed for it wins; otherwise the name and
 * spec the detector read from the character's most recent session that read both. Null when neither source
 * has both (a name without its spec isn't enough, since the player would still be asked for the spec).
 */
export function pickIdentity(typed, detected) {
  return complete(typed) ?? complete(detected);
}
