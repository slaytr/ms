import type { MapPlate } from './detect/detect.ts';
import { formatClock, formatPerHour } from './format';
import { estimateEta, formatEta, levelProgress, MIN_ELAPSED_FOR_ETA_MS, type Eta, type LevelProgress } from './level-eta';
import { computeRates, pausedWithin, type Pause, type Rates, type Reading } from './metrics';
import { mapLabel } from './map-label';
import type { PlayerSnapshot } from './snapshot';

/** Meso is read only while the inventory is open; older than this and we say it's paused. */
const MESO_STALE_AFTER_MS = 60_000;
/** Shortest stretch of play we will project into a per-hour figure. */
const MIN_ELAPSED_FOR_RATE_MS = 10_000;
/** The EXP/h headline looks back this far, so it follows your current pace rather than the whole session. */
const RECENT_WINDOW_MS = 3_600_000;

/** Everything the pop-out overlay shows, already worked out, so the component only draws it. */
export interface TrackerView {
  readonly name: string | null;
  /** The map to show ("Tree Dungeon, Forest Up North VIII", or just the street if that is all we read); null if unknown. */
  readonly mapName: string | null;
  /** "Street: Map" in full, for a tooltip when `mapName` is cut short. */
  readonly mapFull: string | null;
  readonly level: number | null;
  readonly progress: LevelProgress | null;
  readonly eta: Eta;
  /** "2h 14m", or null while there's no estimate yet. */
  readonly etaText: string | null;
  /** EXP/h over the last hour of play (the whole session while it's shorter than an hour). */
  readonly expPerHour: string;
  /** The same last-hour figure as a number; null until there's a rate. */
  readonly expPerHourValue: number | null;
  /** EXP/h averaged over the whole session. */
  readonly expPerHourAvg: string;
  /** Last-hour pace as a share of a level, e.g. "12.40%"; null until there's a rate. */
  readonly expPctPerHour: string | null;
  /** Total EXP gained this session, across level-ups. */
  readonly expGained: number;
  /** The per-hour figures are an early projection from a short stretch of play, so they will still swing. */
  readonly ratesEstimated: boolean;
  /** Null until meso has been read at least once. */
  readonly mesoPerHour: string | null;
  readonly mesoGained: number | null;
  /**
   * Meso gained minus what the pots used cost (NPC price), so a farm that burns more in pots than it
   * earns shows red. Null until meso has been read. Pots that no NPC sells count for
   * nothing, in which case `netMesosCeiling` is true: the real figure can only be lower.
   */
  readonly netMesos: number | null;
  readonly netMesosCeiling: boolean;
  /** Meso hasn't been seen for a while (inventory closed), so its numbers are paused, not wrong. */
  readonly mesoStale: boolean;
  readonly elapsed: string;
  /** Tracking is paused: nothing is being counted and the clock is stopped. */
  readonly paused: boolean;
}

export interface TrackerViewInput {
  readonly name: string | null;
  /** The map the player is on, if the minimap has been read. */
  readonly map?: MapPlate | null;
  /** Latest known state, carried forward, so level and EXP are present even on a tick that missed them. */
  readonly snapshot: PlayerSnapshot | null;
  readonly readings: readonly Reading[];
  readonly rates: Rates;
  /** What the potion tracker says was spent on pots used; omitted or null when no pots are being counted. */
  readonly potSpend?: { readonly mesos: number; readonly unknownFor: number } | null;
  /** Stretches the player paused tracking, left out of every rate. */
  readonly pauses?: readonly Pause[];
}

/**
 * The wall-clock moment the session rates end at: the start plus the time counted, plus every pause that
 * happened before it (a pause that is still going ends the count where it began).
 */
function wallEnd(startMs: number, elapsedMs: number, pauses: readonly Pause[]): number {
  let end = startMs + elapsedMs;
  for (const pause of [...pauses].sort((a, b) => a.from - b.from)) {
    if (pause.from >= end || pause.to === null) break;
    end += pause.to - pause.from;
  }
  return end;
}

/** Rates over only the last hour of counted time, ending where the session rates end (now). */
function lastHourRates(readings: readonly Reading[], rates: Rates, pauses: readonly Pause[]): Rates {
  if (readings.length === 0 || rates.elapsedMs <= RECENT_WINDOW_MS) return rates;
  const startMs = Math.min(...readings.map((r) => r.takenAt));
  const endMs = wallEnd(startMs, rates.elapsedMs, pauses);
  // Walk back from the end until an hour of counted (unpaused) time is covered.
  let cutoff = endMs - RECENT_WINDOW_MS;
  for (let i = 0; i < 8; i += 1) {
    const counted = endMs - cutoff - pausedWithin(pauses, cutoff, endMs);
    if (Math.abs(counted - RECENT_WINDOW_MS) < 1000) break;
    cutoff -= RECENT_WINDOW_MS - counted;
  }
  if (cutoff <= startMs) return rates;
  return computeRates(
    readings.filter((r) => r.takenAt >= cutoff),
    endMs,
    pauses,
  );
}

export function buildTrackerView({ name, map = null, snapshot, readings, rates, potSpend = null, pauses = [] }: TrackerViewInput): TrackerView {
  const level = snapshot?.level ?? null;
  const progress = levelProgress(level, snapshot?.exp ?? null);
  const eta = estimateEta(progress, rates.expPerHour, rates.elapsedMs);

  const mesoReadings = readings.filter((r) => r.meso !== null);
  const lastMeso = mesoReadings[mesoReadings.length - 1];
  const latest = readings[readings.length - 1];
  const hasMeso = lastMeso !== undefined;
  // Per-hour is (gained so far) / (time so far), projected to an hour. It shows as soon as there is a
  // few seconds of play and is flagged as an estimate until the time-to-level estimate also trusts it.
  const hasRate = rates.elapsedMs >= MIN_ELAPSED_FOR_RATE_MS;
  const perHour = (value: number) => (hasRate ? formatPerHour(value) : '—');
  const recent = lastHourRates(readings, rates, pauses);

  return {
    name,
    mapName: map ? (map.name ?? map.street) : null,
    mapFull: map ? mapLabel(map) : null,
    level,
    progress,
    eta,
    etaText: eta.state === 'ready' ? formatEta(eta.ms) : null,
    expPerHour: perHour(recent.expPerHour),
    expPerHourValue: hasRate ? recent.expPerHour : null,
    expPerHourAvg: perHour(rates.expPerHour),
    expPctPerHour: hasRate ? `${recent.expPctPerHour.toFixed(2)}%` : null,
    expGained: rates.expGained,
    ratesEstimated: hasRate && rates.elapsedMs < MIN_ELAPSED_FOR_ETA_MS,
    mesoPerHour: hasMeso ? perHour(rates.mesoPerHour) : null,
    mesoGained: hasMeso ? rates.mesoGained : null,
    netMesos: hasMeso ? rates.mesoGained - (potSpend?.mesos ?? 0) : null,
    netMesosCeiling: hasMeso && (potSpend?.unknownFor ?? 0) > 0,
    mesoStale: hasMeso && latest !== undefined && latest.takenAt - lastMeso.takenAt > MESO_STALE_AFTER_MS,
    elapsed: formatClock(rates.elapsedMs),
    paused: pauses.some((p) => p.to === null),
  };
}
