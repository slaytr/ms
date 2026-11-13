import { MAX_LABEL_LENGTH } from './map-label';

/** The game's party limit. */
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 6;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * What the player typed as a session name, ready to send: trimmed, inner whitespace collapsed, capped
 * at the API's limit. Null when it is blank (which means "name it after the map again").
 */
export function cleanSessionName(text: string): string | null {
  if (CONTROL_CHARS.test(text)) return null;
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH).trim();
  return clean === '' ? null : clean;
}

/** A typed party size as a whole number from 1 to 6, else null. Never rounds or clamps: "2.5" and "9" are refused. */
export function parsePartySize(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const size = Number(trimmed);
  return size >= MIN_PARTY_SIZE && size <= MAX_PARTY_SIZE ? size : null;
}

/** The size one step up or down, held inside 1 to 6. */
export function stepPartySize(size: number, delta: 1 | -1): number {
  return Math.min(MAX_PARTY_SIZE, Math.max(MIN_PARTY_SIZE, size + delta));
}

/** "Solo" or "Party of 3", for lists. */
export function partyText(size: number): string {
  return size <= 1 ? 'Solo' : `Party of ${size}`;
}
