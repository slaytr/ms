import { computed, reactive, ref } from 'vue';

import { createSession, endSession, labelSession, postReadings } from '../lib/api';
import type { Detection, MapPlate } from '../lib/detect/detect.ts';
import { coreReady } from '../lib/health';
import { mapLabel } from '../lib/map-label';
import { computeRates, type Reading } from '../lib/metrics';
import { buildPotView, observePots, rescanPots, startPotTracking } from '../lib/pot-tracker';
import { carryForward, snapshotFrom, type PlayerSnapshot } from '../lib/snapshot';
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
  let sessionLabel = '';
  /** Latest known state of the player, carried forward across ticks; becomes the session's end snapshot. */
  let latestSnapshot: PlayerSnapshot | null = null;
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

  const rates = computed(() => computeRates(readings.value, now.value));
  const latest = computed(() => readings.value[readings.value.length - 1] ?? null);
  /** The core data (who, level, EXP) has read cleanly on several ticks in a row. */
  const confirmed = computed(() => status.value === 'tracking' && streak.value >= CONFIRM_STREAK);

  async function ensureSession(detection: Detection | null): Promise<boolean> {
    if (session.id) return true;
    try {
      sessionLabel ||= (detection && mapLabel(detection.map)) || '';
      const created = await createSession({
        label: sessionLabel,
        character: options.character ?? detection?.character.name ?? '',
        fingerprint: detection?.character.fingerprint ?? null,
        start: detection ? snapshotFrom(detection, Date.now()) : null,
      });
      session.id = created.id;
      session.token = created.ownerToken;
      return true;
    } catch (cause) {
      message.value = `Could not start a session, will retry: ${(cause as Error).message}`;
      return false;
    }
  }

  /** Names an already-created, still-unnamed session once the map becomes readable. */
  async function nameFromMap(detection: Detection): Promise<void> {
    if (sessionLabel || !session.id) return;
    const label = mapLabel(detection.map);
    if (!label) return;
    sessionLabel = label; // claimed before the request so overlapping ticks don't send it twice
    try {
      await labelSession(session.id, session.token, label);
    } catch (cause) {
      sessionLabel = ''; // try again on the next tick
      message.value = `Could not name the session, will retry: ${(cause as Error).message}`;
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

  async function record(detection: Detection): Promise<void> {
    const { meso, exp, expPct, level } = detection;
    // Nothing readable this tick (e.g. alt-tabbed): don't store an empty row.
    if (meso === null && exp === null && expPct === null && level === null) return;

    const reading: Reading = { takenAt: Date.now(), meso, exp, expPct, level };
    readings.value = [...readings.value, reading];
    pending = [...pending, reading];
    if (!(await ensureSession(detection))) return;
    await nameFromMap(detection);
    if (pending.length >= UPLOAD_EVERY) await flush();
  }

  async function tick(): Promise<void> {
    const el = capture.video.value;
    if (status.value !== 'tracking' || !el) return;
    try {
      const detection = detector.read(el);
      if (detection) {
        ticks.value += 1;
        lastDetection.value = detection;
        streak.value = coreReady(detection) ? streak.value + 1 : 0;
        latestSnapshot = carryForward(latestSnapshot, detection, Date.now());
        current.value = latestSnapshot;
        if (mapLabel(detection.map)) map.value = detection.map;
        await record(detection);
        pots.value = observePots(pots.value, detection.useTab ?? null, Date.now());
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
    sessionLabel = startOptions.label ?? '';
    message.value = null;
    status.value = 'loading';
    try {
      if (!(await capture.start())) {
        status.value = 'idle';
        return;
      }
      readings.value = [];
      lastDetection.value = null;
      ticks.value = 0;
      streak.value = 0;
      savedCount.value = 0;
      pending = [];
      latestSnapshot = null;
      current.value = null;
      map.value = null;
      session.id = '';
      session.token = '';
      detector.reset();
      misses.reset();
      pots.value = startPotTracking();
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
    latest,
    current,
    map,
    potView,
    rescanPots: () => {
      pots.value = rescanPots(pots.value);
    },
    missFramesSent: misses.sent,
    missFrameError: misses.error,
    start,
    stop,
  };
}
