/**
 * The owner tokens of sessions started in this browser, so the player can rename them or set their
 * party size later (the token is the only proof a session is yours; there are no accounts). Kept in
 * localStorage, newest last, and trimmed so it can't grow without bound.
 */

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'maple-metrics:session-tokens';
const MAX_TOKENS = 100;

type TokenMap = Readonly<Record<string, string>>;

function defaultStore(): KeyValueStore | null {
  try {
    return localStorage;
  } catch {
    return null; // storage blocked: sessions just can't be edited later
  }
}

function read(store: KeyValueStore | null): TokenMap {
  if (!store) return {};
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

/** The saved owner token for a session, or null when it wasn't started in this browser. */
export function loadSessionToken(sessionId: string, store: KeyValueStore | null = defaultStore()): string | null {
  return read(store)[sessionId] ?? null;
}

/** Remembers a session's owner token. Quietly does nothing when storage is unavailable. */
export function saveSessionToken(sessionId: string, token: string, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return;
  const { [sessionId]: _replaced, ...rest } = read(store);
  const kept = Object.entries({ ...rest, [sessionId]: token }).slice(-MAX_TOKENS);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Not persisted: the session just can't be edited from the list later.
  }
}
