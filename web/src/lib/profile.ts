import type { CharacterPlate } from './detect/detect.ts';

/** The character we recognised on screen, kept in this browser so the home page can greet them next time. */
export interface CharacterProfile {
  /** Exact-pixel hash of the on-screen name: the stable identity (there are no accounts). */
  readonly fingerprint: string;
  /** Null until readable, or typed in by the player when a letter has no template. */
  readonly name: string | null;
  readonly job: string | null;
  readonly level: number | null;
  readonly updatedAt: number;
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'maple-metrics:character';
const MAX_NAME_LENGTH = 20;

/**
 * Folds one detection into the saved profile. Same character: fill gaps from what we already knew
 * (the level isn't on screen every tick, a letter may be unreadable). Different character: start fresh.
 * Returns the previous profile untouched when no character was seen.
 */
export function mergeProfile(
  previous: CharacterProfile | null,
  plate: CharacterPlate,
  level: number | null,
  now: number,
): CharacterProfile | null {
  if (!plate.fingerprint) return previous;
  const same = previous?.fingerprint === plate.fingerprint ? previous : null;
  return {
    fingerprint: plate.fingerprint,
    name: plate.name ?? same?.name ?? null,
    job: plate.job ?? same?.job ?? null,
    level: level ?? same?.level ?? null,
    updatedAt: now,
  };
}

/** Applies a name the player typed in. Returns the profile unchanged if the name is blank. */
export function withTypedName(profile: CharacterProfile, typed: string): CharacterProfile {
  const name = typed.trim().slice(0, MAX_NAME_LENGTH);
  return name ? { ...profile, name } : profile;
}

/** Same data, ignoring the timestamp: used to skip pointless writes on every tick. */
export function sameProfile(a: CharacterProfile | null, b: CharacterProfile | null): boolean {
  if (a === null || b === null) return a === b;
  return a.fingerprint === b.fingerprint && a.name === b.name && a.job === b.job && a.level === b.level;
}

function parseProfile(raw: unknown): CharacterProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : null);
  const fingerprint = text(p.fingerprint);
  if (!fingerprint) return null;
  const level = typeof p.level === 'number' && Number.isInteger(p.level) && p.level >= 1 && p.level <= 300 ? p.level : null;
  return {
    fingerprint,
    name: text(p.name),
    job: text(p.job),
    level,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
  };
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked (private mode / disabled cookies)
  }
}

export function loadProfile(store: KeyValueStore | null = defaultStore()): CharacterProfile | null {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return raw ? parseProfile(JSON.parse(raw)) : null;
  } catch {
    return null; // corrupt JSON or blocked storage: behave as a first visit
  }
}

export function saveProfile(profile: CharacterProfile, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full or blocked: the profile just won't persist.
  }
}

export function clearProfile(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
