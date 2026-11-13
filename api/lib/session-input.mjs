export const MAX_LABEL_LENGTH = 80;
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 6;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * A player-typed session name, ready to store: trimmed, inner whitespace collapsed, capped at
 * MAX_LABEL_LENGTH. Null when it is empty, not text, or holds control characters.
 */
export function cleanSessionLabel(value) {
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) return null;
  const text = value.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH).trim();
  return text || null;
}

/** A party size as a whole number from 1 to 6, else null (never rounded or clamped: bad input is refused). */
export function cleanPartySize(value) {
  return Number.isInteger(value) && value >= MIN_PARTY_SIZE && value <= MAX_PARTY_SIZE ? value : null;
}
