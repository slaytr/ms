/** The one character allowed to use the admin editor. */
export const ADMIN_USER = 'PayYoBills';

/**
 * True when `provided` names the admin character. This is NOT secure: the name comes from the
 * browser, so anyone who sends it passes. It only keeps the editor out of ordinary use.
 */
export function isAdminUser(provided) {
  return typeof provided === 'string' && provided.trim().toLowerCase() === ADMIN_USER.toLowerCase();
}
