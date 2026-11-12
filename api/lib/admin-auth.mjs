import { timingSafeEqual } from 'node:crypto';

/**
 * True when `provided` equals the configured admin token. Compared in constant time so the token
 * can't be guessed byte by byte. An unset or empty `expected` never matches (admin stays off).
 */
export function isAdminToken(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
