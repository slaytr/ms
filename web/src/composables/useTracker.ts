import { computed, reactive, ref } from 'vue';

import { createSession, endSession, labelSession, postReadings, saveSessionIdentity, setSessionPartySize } from '../lib/api';
import type { Detection, MapPlate } from '../lib/detect/detect.ts';
import { coreReady } from '../lib/health';
import { mapLabel } from '../lib/map-label';
import { computeRates, type Pause, type Reading } from '../lib/metrics';
import { emptyPotHistory, recordPotHistory, type PotHistory } from '../lib/pot-history';
import { buildPotView,observePots, observeQuick, pausePots, rescanPots, resumePots, startPotTracking } from '../lib/pot-tracker';
import { cleanSessionName, MAX_PARTY_SIZE, MIN_PARTY_SIZE } from '../lib/session-input';
import { saveSessionToken } from '../lib/session-tokens';
import { applyIdentity, carryForward, snapshotFrom, type PlayerIdentity, type PlayerSnapshot } from '../lib/snapshot';
import { useDetector } from './useDetector';
import { useMissReporter } from './useMissReporter';
import { useScreenCapture } from './useScreenCapture';

const SAMPLE_INTERVAL_MS = 3_000;
const UPLOAD_EVERY = 10;
/** Consecutive ticks the core data must read cleanly before we call the session "tracked". */
const CONFIRM_STREAK = 2;

export interface TrackerStart {
  readonly label?: string;
  readonly character?: string;
}

export type TrackerStatus = 'idle' | 'loading' | 'tracking';

/**
 * Screen share + detection + upload, in one place so the home page and the /testing
 * test page behave identically. A session row is only created once there is something
 * to record, so a share that never shows the game leaves nothing behind.
 */
export function useTracker() {
  const capture = useScreenCapture();
  const detector = useDetector();
  const misses = useMissReporter();
  /** Pot use from scans of the Use tab (see lib/pot-tracker.ts). */
  const pots = ref(startPotTracking());
  const potView = computed(() => buildPotView(pots.value));
  /** Running pots used per item over the session, for the per-potion charts. */
  const potHistory = ref<PotHistory>(emptyPotHistory);

  const status = ref<TrackerStatus>('idle');
  const message = ref<string | null>(null);
  const readings = ref<readonly Reading[]>([]);
  const lastDetection = ref<Detection | null>(null);
  const ticks = ref(0);
  const streak = ref(0);
  const savedCount = ref(0);
  const historyKey = ref(0);
  const session = reactive({ id: '', token: '' });

  let options: TrackerStart = {};
  /**
   * The session's name: what the player typed, else the map read from the minimap. Empty while
   * unknown, in which case the first readable map names the session (even after it was created).
   */
  const sessionLabel = ref('');
  /** The name the server has for this session, so a rename is sent once and retried if it fails. */
  let sentLabel = '';
  /** How many players were in the party, as the player typed it (1 = solo). */
  const partySize = ref(MIN_PARTY_SIZE);
  let sentPartySize = MIN_PARTY_SIZE;
  /** Latest known state of the player, carried forward across ticks; becomes the session's end snapshot. */
  let latestSnapshot: PlayerSnapshot | null = null;
  /** The name and spec the player entered; overrides whatever the detector reads. */
  let identity: PlayerIdentity | null = null;
  /** The session the current identity was last saved against, so it is sent once per session, not every tick. */
  let identitySavedFor = '';
  /** The same latest-known state, reactive, for the live overlay (level and EXP are present even on a tick that missed them). */
  const current = ref<PlayerSnapshot | null>(null);
  /** The map the player is on now. Holds the last readable one while the minimap is covered or unreadable. */
  const map = ref<MapPlate | null>(null);
  let pending: readonly Reading[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Wall clock, refreshed every second while tracking, so the time and per-hour projection never wait on a frame being read. */
  const now = ref(Date.now());
  let clock: ReturnType<typeof setInterval> | null = null;
  const stopClock = () => {
    if (clock) clearInterval(clock);
    clock = null;
  };

  /** Stretches the player paused tracking. The last one has no end while the tracker is paused. */
  const pauses = ref<readonly Pause[]>([]);
  const paused = computed(() => pauses.value.some((p) => p.to === null));
  /** True when pausing is what froze pot counting, so resuming only thaws it then (a Repot the player started stays theirs). */
  let potsPausedByPause = false;

  const rates = computed(() => computeRates(readings.value, now.value, pauses.value));
  const latest = computed(() => readings.value[readings.value.length - 1] ?? null);
  /** The core data (who, level, EXP) has read cleanly on several ticks in a row. */
  const confirmed = computed(() => status.value === 'tracking' && streak.value >= CONFIRM_STREAK);

  async function ensureSession(detection: Detection | null): Promise<boolean> {
    if (session.id) return true;
    try {
      sessionLabel.value ||= (detection && mapLabel(detection.map)) || '';
      const label = sessionLabel.value;
      const size = partySize.value;
      const fingerprint = detection?.character.fingerprint ?? null;
      const known = identity && identity.fingerprint === fingerprint ? identity : null;
      const created = await createSession({
        label,
        character: options.character ?? known?.name ?? detection?.character.name ?? '',
        fingerprint,
        start: detection ? applyIdentity(snapshotFrom(detection, Date.now()), identity) : null,
        partySize: size,
      });
      session.id = created.id;
      session.token = created.ownerToken;
      sentLabel = label;
      sentPartySize = size;
      saveSessionToken(created.id, created.ownerToken); // lets the player rename or edit it later from their session list
      return true;
    } catch (cause) {
      message.value = `Could not start a session, will retry: ${(cause as Error).message}`;
      return false;
    }
  }

  /** A still-unnamed session takes the map's name once the map becomes readable. A name the player typed is never replaced. */
  function nameFromMap(detection: Detection): void {
    if (sessionLabel.value) return;
    sessionLabel.value = mapLabel(detection.map) ?? '';
  }

  /** Sends the session's name (typed or from the map) when the server doesn't have it yet; retried on later ticks if it fails. */
  async function syncLabel(): Promise<void> {
    const label = sessionLabel.value;
    if (!session.id || !label || label === sentLabel) return;
    const previous = sentLabel;
    sentLabel = label; // claimed before the request so overlapping ticks don't send it twice
    try {
      await labelSession(session.id, session.token, label);
    } catch (cause) {
      sentLabel = previous; // try again on the next tick
      message.value = `Could not name the session, will retry: ${(cause as Error).message}`;
    }
  }

  /** Same for the party size the player typed. */
  async function syncPartySize(): Promise<void> {
    const size = partySize.value;
    if (!session.id || size === sentPartySize) return;
    const previous = sentPartySize;
    sentPartySize = size;
    try {
      await setSessionPartySize(session.id, session.token, size);
    } catch (cause) {
      sentPartySize = previous;
      message.value = `Could not save the party size, will retry: ${(cause as Error).message}`;
    }
  }

  async function flush(): Promise<void> {
    if (pending.length === 0 || !session.id) return;
    const batch = pending;
    pending = [];
    try {
      await postReadings(session.id, session.token, batch);
      savedCount.value += batch.length;
    } catch (cause) {
      pending = [...batch, ...pending]; // retry with the next flush
      message.value = `Upload failed, will retry: ${(cause as Error).message}`;
    }
  }

  /**
   * Keeps the typed name and spec against the character on the server, once per session. Needs a session
   * (it is the proof of who is asking), so it runs again after the session is created and on later ticks
   * until it succeeds.
   */
  async function syncIdentity(): Promise<void> {
    if (!identity || !session.id || identitySavedFor === session.id) return;
    const sessionId = session.id;
    identitySavedFor = sessionId; // claimed before the request so overlapping ticks don't send it twice
    try {
      await saveSessionIdentity(sessionId, session.token, identity.name, identity.job);
    } catch (cause) {
      identitySavedFor = ''; // try again on the next tick
      message.value = `Could not save your name, will retry: ${(cause as Error).message}`;
    }
  }

  async function record(detection: Detection): Promise<void> {
    const { meso, exp, expPct, level } = detection;
    // Nothing readable this tick (e.g. alt-tabbed): don't store an empty row.
    if (meso === null && exp === null && expPct === null && level === null) return;

    const reading: Reading = { takenAt: Date.now(), meso, exp, expPct, level };
    readings.value = [...readings.value, reading];
    pending = [...pending, reading];
    if (!(await ensureSession(detection))) return;
    nameFromMap(detection);
    await syncLabel();
    await syncPartySize();
    await syncIdentity();
    if (pending.length >= UPLOAD_EVERY) await flush();
  }

  async function tick(): Promise<void> {
    const el = capture.video.value;
    if (status.value !== 'tracking' || !el) return;
    if (paused.value) {
      // Paused: read nothing and record nothing, but keep the loop alive so resuming picks up within a tick.
      timer = setTimeout(tick, SAMPLE_INTERVAL_MS);
      return;
    }
    try {
      const detection = detector.read(el);
      if (detection) {
        ticks.value += 1;
        lastDetection.value = detection;
        streak.value = coreReady(detection) ? streak.value + 1 : 0;
        latestSnapshot = applyIdentity(carryForward(latestSnapshot, detection, Date.now()), identity);
        current.value = latestSnapshot;
        if (mapLabel(detection.map)) map.value = detection.map;
        await record(detection);
        // The quick slots first: an item they show is counted from there, and the Use tab then ignores it.
        pots.value = observePots(observeQuick(pots.value, detection.quickSlots ?? null, Date.now()), detection.useTab ?? null, Date.now());
        const potNow = Date.now();
        potHistory.value = recordPotHistory(potHistory.value, buildPotView(pots.value), readings.value[0]?.takenAt ?? potNow, potNow);
        void misses.consider(detection, el, session.id);
      }
    } catch (cause) {
      message.value = `Read failed: ${(cause as Error).message}`;
    }
    if (status.value === 'tracking') timer = setTimeout(tick, SAMPLE_INTERVAL_MS);
  }

  async function start(startOptions: TrackerStart = {}): Promise<void> {
    if (status.value !== 'idle') return;
    options = startOptions;
    sessionLabel.value = startOptions.label ?? '';
    sentLabel = '';
    partySize.value = MIN_PARTY_SIZE;
    sentPartySize = MIN_PARTY_SIZE;
    message.value = null;
    status.value = 'loading';
    try {
      if (!(await capture.start())) {
        status.value = 'idle';
        return;
      }
      readings.value = [];
      pauses.value = [];
      potsPausedByPause = false;
      lastDetection.value = null;
      ticks.value = 0;
      streak.value = 0;
      savedCount.value = 0;
      pending = [];
      latestSnapshot = null;
      identity = null;
      identitySavedFor = '';
      current.value = null;
      map.value = null;
      session.id = '';
      session.token = '';
      detector.reset();
      misses.reset();
      pots.value = startPotTracking();
      potHistory.value = emptyPotHistory;
      capture.onEnded(() => void stop());
      now.value = Date.now();
      stopClock();
      clock = setInterval(() => {
        now.value = Date.now();
      }, 1000);
      status.value = 'tracking';
      void tick();
    } catch (cause) {
      message.value = (cause as Error).message;
      capture.stop();
      status.value = 'idle';
    }
  }

  /** Stops counting (EXP, meso, time, pots) until `resume`. Readings already taken are sent now. */
  function pause(): void {
    if (status.value !== 'tracking' || paused.value) return;
    pauses.value = [...pauses.value, { from: Date.now(), to: null }];
    if (!pots.value.paused) {
      pots.value = pausePots(pots.value);
      potsPausedByPause = true;
    }
    void flush();
  }

  /** Carries on counting. Whatever happened while paused is not added: the next reading is a fresh start. */
  function resume(): void {
    if (!paused.value) return;
    const resumedAt = Date.now();
    pauses.value = pauses.value.map((p) => (p.to === null ? { ...p, to: resumedAt } : p));
    if (potsPausedByPause) {
      pots.value = resumePots(pots.value);
      potsPausedByPause = false;
    }
    streak.value = 0;
  }

  async function stop(): Promise<void> {
    if (status.value === 'idle') return;
    status.value = 'idle';
    now.value = Date.now(); // freeze the clock at the moment tracking ended
    stopClock();
    if (timer) clearTimeout(timer);
    capture.stop();
    await flush();
    if (session.id) await endSession(session.id, session.token, latestSnapshot).catch(() => undefined);
    historyKey.value += 1;
  }

  return {
    capture,
    status,
    message,
    readings,
    lastDetection,
    ticks,
    confirmed,
    savedCount,
    historyKey,
    rates,
    pauses,
    paused,
    pause,
    resume,
    latest,
    current,
    map,
    potView,
    potHistory,
    rescanPots: () => {
      pots.value = rescanPots(pots.value);
      potHistory.value = emptyPotHistory;
    },
    /** Repot: freeze pot counting while restocking, or carry on from the restocked inventory. */
    togglePotsPaused: () => {
      pots.value = pots.value.paused ? resumePots(pots.value) : pausePots(pots.value);
    },
    /** The player told us who they are: use it for this session's snapshots from now on, including the one saved at the end. */
    setIdentity: (next: PlayerIdentity | null) => {
      identity = next;
      void syncIdentity();
      if (latestSnapshot) {
        latestSnapshot = applyIdentity(latestSnapshot, identity);
        current.value = latestSnapshot;
      }
    },
    /** The session's name: what the player typed, else the map's name once it has been read ('' until either). */
    sessionName: sessionLabel,
    /**
     * The player typed a name for this session. A blank one goes back to naming it after the map (the
     * server keeps the old name until the map is next read, since a session can't be saved nameless).
     */
    renameSession: (text: string) => {
      sessionLabel.value = cleanSessionName(text) ?? '';
      void syncLabel();
    },
    partySize,
    /** The player typed how many people are in their party; anything outside 1-6 is ignored. */
    setPartySize: (size: number) => {
      if (!Number.isInteger(size) || size < MIN_PARTY_SIZE || size > MAX_PARTY_SIZE) return;
      partySize.value = size;
      void syncPartySize();
    },
    missFramesSent: misses.sent,
    missFrameError: misses.error,
    start,
    stop,
  };
}
