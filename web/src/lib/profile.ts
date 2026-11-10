import type { CharacterPlate } from './detect/detect.ts';

/** The character we recognised on screen, kept in this browser so the home page can greet them next time. */
export interface CharacterProfile {
  /** Exact-pixel hash of the on-screen name: the stable identity (there are no accounts). */
  readonly fingerprint: string;
  /** Null until readable, or typed in by the player when a letter has no template. */
  readonly name: string | null;
  readonly job: string | null;
  readonly level: number | null;
  /** True once the player entered their own name and spec: those then win over anything detected. */
  readonly confirmed: boolean;
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
  const confirmed = same?.confirmed ?? false;
  return {
    fingerprint: plate.fingerprint,
    // What the player told us beats what the detector reads.
    name: confirmed ? same!.name : (plate.name ?? same?.name ?? null),
    job: confirmed ? same!.job : (plate.job ?? same?.job ?? null),
    level: level ?? same?.level ?? null,
    confirmed,
    updatedAt: now,
  };
}

/** Applies a name the player typed in. Returns the profile unchanged if the name is blank. */
export function withTypedName(profile: CharacterProfile, typed: string): CharacterProfile {
  const name = typed.trim().slice(0, MAX_NAME_LENGTH);
  return name ? { ...profile, name } : profile;
}

/**
 * A new player tells us who they are: a name and a spec. Returns the profile unchanged if either is blank.
 * The profile may be null on the first tick, so the caller passes the fingerprint seen on screen.
 */
export function withIdentity(
  profile: CharacterProfile | null,
  fingerprint: string,
  typedName: string,
  job: string,
  now: number,
): CharacterProfile | null {
  const name = typedName.trim().slice(0, MAX_NAME_LENGTH);
  const spec = job.trim();
  if (!name || !spec) return profile;
  const base = profile?.fingerprint === fingerprint ? profile : null;
  return { fingerprint, name, job: spec, level: base?.level ?? null, confirmed: true, updatedAt: now };
}

/**
 * True when we don't yet know both the name and the job of this on-screen character, so we should ask.
 * Known means the player typed them in, or the detector read them (it never guesses, so a read is trusted).
 */
export function needsIdentity(profile: CharacterProfile | null, fingerprint: string | null): boolean {
  if (fingerprint === null) return false;
  const known = profile?.fingerprint === fingerprint && profile.name !== null && profile.job !== null;
  return !known;
}

/** Same data, ignoring the timestamp: used to skip pointless writes on every tick. */
export function sameProfile(a: CharacterProfile | null, b: CharacterProfile | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.fingerprint === b.fingerprint && a.name === b.name && a.job === b.job && a.level === b.level && a.confirmed === b.confirmed
  );
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
    confirmed: p.confirmed === true,
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
