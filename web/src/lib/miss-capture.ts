import type { Detection } from './detect/detect.ts';

/** The pieces of data we try to read that a miss can be about. */
export type MissField = 'character' | 'level' | 'exp' | 'meso' | 'minimap' | 'map';

/**
 * Which pieces of data this frame failed to read. Meso is only a miss when its label was found but the
 * digits weren't recognised: not finding it just means the inventory is closed. A level worked out from
 * EXP counts as a miss because its digits still weren't read, and that is exactly what a template needs.
 */
export function findMisses(detection: Detection): readonly MissField[] {
  const { found, character, map } = detection;
  const misses: MissField[] = [];
  if (!found.character || character.name === null) misses.push('character');
  if (!found.level || detection.level === null || detection.levelInferred === true) misses.push('level');
  if (!found.exp || detection.exp === null) misses.push('exp');
  if (found.mesos && detection.meso === null) misses.push('meso');
  if (!found.minimap) misses.push('minimap');
  else if (map.street === null || map.name === null) misses.push('map');
  return misses;
}

/**
 * True when some part of the game UI was located. A frame where nothing is found could be any window
 * (a browser, email), so we never keep those: a screenshot is only worth sending once we know it's the game.
 * The meso label alone doesn't count, since the word could appear on any page.
 */
export function gameSeen(detection: Detection): boolean {
  const { found } = detection;
  return found.character || found.level || found.exp || found.minimap;
}

/** What went wrong, in a form the same kind of miss repeats: fields, level, map and window size. */
export function missSignature(misses: readonly MissField[], detection: Detection, width: number, height: number): string {
  const { map } = detection;
  return [[...misses].sort().join(','), `L${detection.level ?? '-'}`, map.street ?? '', map.name ?? '', `${width}x${height}`].join('|');
}

/** The part of a detection worth storing beside the screenshot: what was read and located, no internal state. */
export function describeDetection(detection: Detection) {
  const { meso, exp, expPct, level, levelInferred, found, character, map } = detection;
  return { meso, exp, expPct, level, ...(levelInferred ? { levelInferred } : {}), found, character, map };
}

const STORAGE_KEY = 'ms:miss-seen';

interface Remember {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MissGateOptions {
  /** Screenshots allowed per tracking run. */
  readonly maxPerRun?: number;
  /** Minimum gap between two uploads, so a stuck frame doesn't send one every tick. */
  readonly minIntervalMs?: number;
  /** How long this browser remembers a kind of miss it already sent, across runs. */
  readonly memoryMs?: number;
  /** Where to remember it; `null` (or storage that throws, e.g. blocked) just means no cross-run memory. */
  readonly storage?: Remember | null;
}

function load(storage: Remember | null): Record<string, number> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/**
 * Decides whether a screenshot is worth sending: at most a few per run, spaced apart, and never the same
 * kind of miss twice in a day from this browser. The server caps duplicates too; this keeps the uploads
 * from being attempted in the first place.
 */
export function createMissGate({
  maxPerRun = 6,
  minIntervalMs = 45_000,
  memoryMs = 24 * 60 * 60_000,
  storage = typeof localStorage === 'undefined' ? null : localStorage,
}: MissGateOptions = {}) {
  let sent = 0;
  let lastAt = Number.NEGATIVE_INFINITY;
  let seenThisRun = new Set<string>();
  let remembered = load(storage);

  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(remembered));
    } catch {
      // Storage blocked or full: we just lose the cross-run memory, the in-run limits still hold.
    }
  };

  return {
    allow(signature: string, nowMs: number): boolean {
      if (sent >= maxPerRun || nowMs - lastAt < minIntervalMs) return false;
      if (seenThisRun.has(signature)) return false;
      return (remembered[signature] ?? 0) <= nowMs;
    },
    record(signature: string, nowMs: number): void {
      sent += 1;
      lastAt = nowMs;
      seenThisRun = new Set([...seenThisRun, signature]);
      const live = Object.entries(remembered).filter(([, until]) => until > nowMs);
      remembered = { ...Object.fromEntries(live), [signature]: nowMs + memoryMs };
      persist();
    },
    /** Takes back a signature whose upload failed, so it can be tried again. */
    forget(signature: string): void {
      seenThisRun = new Set([...seenThisRun].filter((s) => s !== signature));
      const { [signature]: _dropped, ...rest } = remembered;
      remembered = rest;
      persist();
    },
    reset(): void {
      sent = 0;
      lastAt = Number.NEGATIVE_INFINITY;
      seenThisRun = new Set();
    },
  };
}
