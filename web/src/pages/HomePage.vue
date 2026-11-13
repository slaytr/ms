<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import CharacterAvatar from '../components/home/CharacterAvatar.vue';
import ChangeLog from '../components/home/ChangeLog.vue';
import GameWindow from '../components/home/GameWindow.vue';
import EyeToggle from '../components/home/EyeToggle.vue';
import IdentityForm from '../components/home/IdentityForm.vue';
import LeaderStrip from '../components/home/LeaderStrip.vue';
import LevelBadge from '../components/home/LevelBadge.vue';
import ExpChart from '../components/home/ExpChart.vue';
import PotChart from '../components/home/PotChart.vue';
import SessionDetailsForm from '../components/home/SessionDetailsForm.vue';
import MySessions from '../components/home/MySessions.vue';
import OverviewBox from '../components/home/OverviewBox.vue';
import SkyScene from '../components/home/SkyScene.vue';
import TrackingChecklist from '../components/home/TrackingChecklist.vue';
import LiveGrinders from '../components/home/LiveGrinders.vue';
import PipCompact from '../components/PipCompact.vue';
import PipTracker from '../components/PipTracker.vue';
import { CHANGELOG } from '../data/changelog';
import { usePopOut } from '../composables/usePopOut';
import { useLiveGrinders } from '../composables/useLiveGrinders';
import { useTracker } from '../composables/useTracker';
import { formatClock } from '../lib/format';
import { assessDetection } from '../lib/health';
import { getSavedIdentity, listCharacters, getWeeklySessions } from '../lib/api';
import { richest, specLeaders, type CharacterEntry, type SpecSlot } from '../lib/characters';
import { expGainSeries } from '../lib/metrics';
import { topByEfficiency, topByExp, type WeeklyRank } from '../lib/rankings';
import {
  loadProfile,
  mergeProfile,
  needsIdentity,
  sameProfile,
  saveProfile,
  withIdentity,
  type CharacterProfile,
} from '../lib/profile';
import { buildTrackerView } from '../lib/tracker-view';

/** Ticks (3s each) without seeing the status bar before we suggest what might be wrong. */
const HINT_AFTER_TICKS = 4;
/** How long the green "locked in" checklist stays up before it docks to the left. */
const LOCK_IN_MS = 1800;

const tracker = useTracker();
const { capture, status, message, lastDetection, confirmed, rates, latest, readings } = tracker;

const profile = ref<CharacterProfile | null>(loadProfile());

// Identify the player from what the screen shows. There are no accounts: the profile lives in this browser.
watch(lastDetection, (detection) => {
  if (!detection) return;
  const next = mergeProfile(profile.value, detection.character, detection.level, Date.now());
  if (next && !sameProfile(profile.value, next)) {
    profile.value = next;
    saveProfile(next);
  }
});

const fingerprint = computed(() => lastDetection.value?.character.fingerprint ?? null);
const knownProfile = computed(() =>
  fingerprint.value && profile.value?.fingerprint === fingerprint.value ? profile.value : null,
);
const knownName = computed(() => knownProfile.value?.name ?? null);
const health = computed(() => assessDetection(lastDetection.value, knownName.value));
// Name detection is unreliable, so what the player told us wins; the detector's read is only a fallback.
const displayName = computed(() => knownName.value ?? lastDetection.value?.character.name ?? null);
const displayJob = computed(() => knownProfile.value?.job ?? lastDetection.value?.character.job ?? profile.value?.job ?? null);

// A returning player's saved name and spec go straight onto this session's snapshots.
watch(
  [knownProfile, fingerprint],
  ([known, fp]) => {
    tracker.setIdentity(known?.confirmed && fp && known.name && known.job ? { fingerprint: fp, name: known.name, job: known.job } : null);
  },
  { immediate: true },
);

const showHint = computed(
  () => status.value === 'tracking' && tracker.ticks.value >= HINT_AFTER_TICKS && !lastDetection.value?.found.character,
);
// A character we have been told about before (from any browser) needn't be asked again.
watch(
  fingerprint,
  async (fp) => {
    if (!fp || !needsIdentity(profile.value, fp)) return;
    try {
      const saved = await getSavedIdentity(fp);
      // Detection may have filled the gaps while we waited, or the player may have typed their own.
      if (saved && fingerprint.value === fp && needsIdentity(profile.value, fp)) saveIdentity(saved.name, saved.job);
    } catch {
      // A nicety: if the lookup fails the form simply shows and the player types it in.
    }
  },
  { immediate: true },
);
const askIdentity = computed(() => status.value === 'tracking' && needsIdentity(profile.value, fingerprint.value));
const hadSession = computed(() => status.value === 'idle' && readings.value.length > 1);

// The small always-on-top overlay. It shares this page's state, so it updates on every tick.
const { grinders } = useLiveGrinders();
const popOut = usePopOut('Level tracker');
// Reset ends this session and starts a new one, so it asks for a second click before doing it.
const RESET_CONFIRM_MS = 4000;
const confirmingReset = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;
function clearResetConfirm(): void {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
  confirmingReset.value = false;
}
async function resetSession(): Promise<void> {
  if (!confirmingReset.value) {
    confirmingReset.value = true;
    resetTimer = setTimeout(clearResetConfirm, RESET_CONFIRM_MS);
    return;
  }
  clearResetConfirm();
  await tracker.reset();
  peakExpPerHour.value = 0; // a new session starts its own best pace
}
// The compact overlay: a single green bar (EXP gained + EXP/hour). Its own window, so both can be open.
const compactPopOut = usePopOut('EXP bar');
const COMPACT_SIZE = { width: 240, height: 28 };
const trackerView = computed(() =>
  buildTrackerView({
    name: displayName.value,
    map: tracker.map.value,
    snapshot: tracker.current.value,
    readings: readings.value,
    rates: rates.value,
    pauses: tracker.pauses.value,
    potSpend: tracker.potView.value
      ? { mesos: tracker.potView.value.totals.mesos, unknownFor: tracker.potView.value.totals.mesosUnknownFor }
      : null,
  }),
);

// Once everything reads cleanly, linger on the green ticks for a moment, then dock to the left and show the chart.
const docked = ref(false);
let dockTimer: ReturnType<typeof setTimeout> | null = null;
const clearDockTimer = () => {
  if (dockTimer) clearTimeout(dockTimer);
  dockTimer = null;
};
// Locked in means the core reads (name, level, EXP) are steady. Meso and pots need the inventory open, so they are optional.
const lockedIn = computed(() => confirmed.value);
watch(lockedIn, (isLocked) => {
  if (!isLocked || docked.value || dockTimer) return;
  dockTimer = setTimeout(() => {
    docked.value = true;
    dockTimer = null;
  }, LOCK_IN_MS);
});
watch(status, (now) => {
  if (now === 'idle') {
    popOut.close();
    compactPopOut.close();
  }
  if (now !== 'tracking') {
    clearDockTimer();
    docked.value = false;
  }
  if (now === 'idle') peakExpPerHour.value = 0;
});
// Highest EXP/h of this session = 100% on the compact bar. Early projections (first ~2 minutes) swing
// wildly off one kill, so they never set the peak.
const peakExpPerHour = ref(0);
watch(trackerView, (view) => {
  const rate = view.expPerHourValue;
  if (rate !== null && !view.ratesEstimated && rate > peakExpPerHour.value) peakExpPerHour.value = rate;
});
const compactFill = computed(() => {
  const rate = trackerView.value.expPerHourValue;
  if (rate === null || peakExpPerHour.value <= 0) return 1;
  return Math.min(1, Math.max(0, rate / peakExpPerHour.value));
});
// Leaderboard teaser for the welcome screen. A nicety: if it can't load, say so quietly and carry on.
const podium = ref<readonly WeeklyRank[]>([]);
const efficient = ref<readonly WeeklyRank[]>([]);
const jobLeaders = ref<readonly SpecSlot[]>([]);
const richList = ref<readonly CharacterEntry[]>([]);
/** Meso amounts on the rich list stay hidden until the viewer reveals them. */
const showMesos = ref(false);
const leaderError = ref(false);
onMounted(async () => {
  try {
    const [characters, week] = await Promise.all([listCharacters(), getWeeklySessions()]);
    podium.value = topByExp(week.sessions);
    efficient.value = topByEfficiency(week.sessions);
    jobLeaders.value = specLeaders(characters).filter((slot) => slot.leader !== null);
    richList.value = richest(characters);
  } catch {
    leaderError.value = true;
  }
});
const expSeries = computed(() => expGainSeries(readings.value, tracker.pauses.value));
const potCharts = computed(() =>
  (tracker.potView.value?.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    series: tracker.potHistory.value.series.get(row.id) ?? [],
  })),
);

function saveIdentity(name: string, job: string) {
  if (!fingerprint.value) return;
  const next = withIdentity(profile.value, fingerprint.value, name, job, Date.now());
  if (!next) return;
  profile.value = next;
  saveProfile(next);
}

onBeforeUnmount(() => {
  clearDockTimer();
  clearResetConfirm();
  void tracker.stop();
});
</script>

<template>
  <div class="home">
    <SkyScene />

    <main class="content" :class="{ wide: status === 'tracking' && docked, 'has-live': grinders.length > 0 }">
      <!-- Whoever is grinding sits on top. The logo goes below it until a window is shared, then it is gone. -->
      <LiveGrinders v-if="grinders.length > 0" :grinders="grinders" />
      <header v-if="status !== 'tracking'" class="logo">
        <p class="ribbon">Bill's Personal</p>
        <h1 class="title" aria-label="Bill's Personal Super Duper Maplestory Classic Tracker">
          <span class="line l1" data-text="Super Duper" aria-hidden="true"><span>Super Duper</span></span>
          <img class="game-logo" src="/maplestory-classic-world-logo.webp" alt="" width="640" height="208" />
          <span class="line l2" data-text="Tracker" aria-hidden="true"><span>Tracker</span></span>
        </h1>
      </header>

      <div v-if="status !== 'tracking'" class="cta-wrap">
        <button class="cta" type="button" :disabled="status === 'loading'" @click="tracker.start()">
          <svg class="cta-icon" viewBox="0 0 32 28" aria-hidden="true">
            <rect x="2" y="2" width="28" height="19" rx="3" fill="#fff" stroke="#4a2a0e" stroke-width="3" />
            <rect x="6" y="6" width="20" height="11" rx="1.5" fill="#43a9f0" />
            <path d="M11 26h10M16 21v5" stroke="#4a2a0e" stroke-width="3" stroke-linecap="round" />
          </svg>
          {{ status === 'loading' ? 'Pick your game window…' : 'Click here to share your game window' }}
        </button>
      </div>

      <!-- Under 1200px the leaderboard sits in the column; wider, it moves to the sides (see the asides below). -->
      <GameWindow v-if="status !== 'tracking' && (podium.length > 0 || efficient.length > 0 || jobLeaders.length > 0 || richList.length > 0)" class="panel leaders" title="Leaderboard">
        <LeaderStrip :podium="podium" :efficient="efficient" :jobs="jobLeaders" :rich="richList" :show-mesos="showMesos">
          <template #rich-toggle><EyeToggle v-model:shown="showMesos" label="mesos" /></template>
        </LeaderStrip>
      </GameWindow>
      <p v-else-if="status !== 'tracking' && leaderError" class="fine">The leaderboard couldn't load just now.</p>

      <GameWindow v-if="status !== 'tracking'" class="panel changelog-inline" title="Change log">
        <ChangeLog :entries="CHANGELOG" />
      </GameWindow>

      <p v-if="capture.error.value || message" class="alert" role="alert">{{ capture.error.value ?? message }}</p>

      <!-- Idle: welcome back, or how it works -->
      <GameWindow v-if="status === 'idle' && profile" class="panel" title="Welcome back">
        <div class="welcome">
          <CharacterAvatar :name="profile.name" />
          <div class="details">
            <p class="who">{{ profile.name ?? 'Your character' }}</p>
            <p class="meta">
              <LevelBadge :level="profile.level" />
              <span v-if="profile.job" class="job">{{ profile.job }}</span>
            </p>
          </div>
        </div>
      </GameWindow>

      <GameWindow v-if="status === 'idle' && profile" class="panel" title="Your sessions">
        <MySessions :fingerprint="profile.fingerprint" />
      </GameWindow>

      <GameWindow v-if="hadSession" class="panel" title="Last session">
        <dl class="stats">
          <div><dt>Time</dt><dd>{{ formatClock(rates.elapsedMs) }}</dd></div>
          <div><dt>Meso per hour</dt><dd>{{ trackerView.mesoPerHour ?? '—' }}</dd></div>
          <div><dt>EXP per hour</dt><dd>{{ trackerView.expPerHour }}</dd></div>
        </dl>
        <p class="note">Saved {{ tracker.savedCount.value }} readings.</p>
      </GameWindow>

      <!-- Tracking: first confirm the core data is being read, then dock it to the left and chart EXP. -->
      <Transition v-if="status === 'tracking'" name="stage" mode="out-in">
        <GameWindow v-if="!docked" key="checking" class="panel checking" :title="lockedIn ? `Locked in!` : 'Checking your game window'">
          <p class="banner" :class="{ done: lockedIn }" role="status">
            <template v-if="lockedIn">Got it. Tracking {{ displayName ?? 'your character' }}…</template>
            <template v-else>Making sure we can read your name, level and EXP…</template>
          </p>

          <TrackingChecklist :health="health" :detection="lastDetection" :name="displayName" />

          <IdentityForm v-if="askIdentity" id-suffix="checking" @save="saveIdentity" />

          <div v-if="showHint" class="hint">
            <p><strong>Can't see your status bar yet.</strong> Check that:</p>
            <ul>
              <li>You shared the game window itself, not a browser tab or your whole screen.</li>
              <li>The bottom bar with your level, name and EXP is fully on screen.</li>
              <li>Windows display scaling is 100% (scaling blurs the pixels we read).</li>
            </ul>
          </div>

          <button class="stop" type="button" @click="tracker.stop()">Stop tracking</button>
          <button class="reset" :class="{ confirming: confirmingReset }" type="button" @click="resetSession()">
            {{ confirmingReset ? 'Click again to reset' : 'Reset session' }}
          </button>
        </GameWindow>

        <div v-else key="docked" class="dashboard">
          <OverviewBox
            class="overview-box"
            :name="displayName"
            :job="displayJob"
            :view="trackerView"
            :pots="tracker.potView.value"
            @rescan="tracker.rescanPots()"
            @repot="tracker.togglePotsPaused()"
          >
            <IdentityForm v-if="askIdentity" id-suffix="docked" @save="saveIdentity" />

            <SessionDetailsForm
              id-suffix="live"
              :name="tracker.sessionName.value"
              placeholder="Named after your map"
              :party-size="tracker.partySize.value"
              @rename="tracker.renameSession"
              @party-size="tracker.setPartySize"
            />

            <div class="popout">
              <button class="popout-btn pause-btn" :class="{ paused: tracker.paused.value }" type="button" :aria-pressed="tracker.paused.value" @click="tracker.paused.value ? tracker.resume() : tracker.pause()">
                {{ tracker.paused.value ? 'Resume tracking' : 'Pause tracking' }}
              </button>
              <button class="popout-btn" type="button" :disabled="popOut.isOpen.value" @click="popOut.open()">
                {{ popOut.isOpen.value ? 'Tracker is popped out' : 'Pop out tracker' }}
              </button>
              <button class="popout-btn compact-btn" type="button" :disabled="compactPopOut.isOpen.value" @click="compactPopOut.open(COMPACT_SIZE)">
                {{ compactPopOut.isOpen.value ? 'Bar is popped out' : 'Pop out compact bar' }}
              </button>
              <p v-if="popOut.error.value" class="alert-inline" role="alert">{{ popOut.error.value }}</p>
              <p v-if="compactPopOut.error.value" class="alert-inline" role="alert">{{ compactPopOut.error.value }}</p>
            </div>

            <button class="stop" type="button" @click="tracker.stop()">Stop tracking</button>
            <button class="reset" :class="{ confirming: confirmingReset }" type="button" @click="resetSession()">
              {{ confirmingReset ? 'Click again to reset' : 'Reset session' }}
            </button>
          </OverviewBox>

          <div class="charts">
          <GameWindow class="chart-panel" title="EXP over time">
            <p class="chart-summary">
              <strong>+{{ Math.round(rates.expGained).toLocaleString() }}</strong> EXP gained
              <span class="dim">· {{ trackerView.expPerHour }} / hr · {{ trackerView.elapsed }}</span>
            </p>
            <ExpChart :series="expSeries" />
          </GameWindow>

          <GameWindow v-if="potCharts.length > 0" class="pot-panel" title="Potions used over time">
            <div class="pot-grid">
              <PotChart v-for="pot in potCharts" :key="pot.id" :name="pot.name" :series="pot.series" :elapsed-ms="rates.elapsedMs" />
            </div>
          </GameWindow>
          </div>
        </div>
      </Transition>
      <!-- The shared window feeds detection; it stays out of sight. -->
      <video :ref="(el) => (capture.video.value = el as HTMLVideoElement | null)" class="hidden-video" muted playsinline />

      <!-- Rendered inside the pop-out window while it is open. -->
      <Teleport v-if="popOut.target.value" :to="popOut.target.value">
        <PipTracker :view="trackerView" />
      </Teleport>
      <Teleport v-if="compactPopOut.target.value" :to="compactPopOut.target.value">
        <PipCompact :view="trackerView" :fill="compactFill" />
      </Teleport>
    </main>

    <aside v-if="status !== 'tracking'" class="side left" aria-label="Weekly top 3 and change log">
      <GameWindow v-if="podium.length > 0" title="Weekly top 3">
        <LeaderStrip :podium="podium" :jobs="[]" only="podium" stack />
      </GameWindow>
      <GameWindow v-if="efficient.length > 0" title="Most efficient top 3">
        <LeaderStrip :podium="[]" :efficient="efficient" :jobs="[]" only="efficient" stack />
      </GameWindow>
      <GameWindow title="Change log">
        <ChangeLog :entries="CHANGELOG" />
      </GameWindow>
    </aside>
    <aside v-if="status !== 'tracking' && (jobLeaders.length > 0 || richList.length > 0)" class="side right" aria-label="Top by job and rich list">
      <GameWindow v-if="jobLeaders.length > 0" title="Top by job">
        <LeaderStrip :podium="[]" :jobs="jobLeaders" only="jobs" />
      </GameWindow>
      <GameWindow v-if="richList.length > 0" title="Rich list">
        <template #aside><EyeToggle v-model:shown="showMesos" label="mesos" /></template>
        <LeaderStrip :podium="[]" :jobs="[]" :rich="richList" :show-mesos="showMesos" only="rich" stack />
      </GameWindow>
    </aside>
  </div>
</template>

<style scoped>
.home {
  --ink: #4a2a0e;
  --outline: -0.05em -0.05em 0 var(--ink), 0.05em -0.05em 0 var(--ink), -0.05em 0.05em 0 var(--ink), 0.05em 0.05em 0 var(--ink),
    0 -0.06em 0 var(--ink), 0 0.06em 0 var(--ink), -0.06em 0 0 var(--ink), 0.06em 0 0 var(--ink), 0 0.12em 0 #a24a00,
    0 0.2em 0.1em rgba(74, 42, 14, 0.35);
  position: relative;
  min-height: 100dvh;
  color: var(--ink);
  font-family: 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  font-weight: 700;
  color-scheme: light;
}
.content {
  position: relative;
  z-index: 1;
  max-width: 620px;
  margin: 0 auto;
  padding: calc(clamp(20px, 5vh, 56px) + 52px) 16px clamp(150px, 26vh, 300px);
  text-align: center;
}

/* Logo */
.ribbon {
  display: inline-block;
  margin: 0 0 0.4rem;
  padding: 0.25rem 1.4rem 0.15rem;
  font: 700 clamp(1.1rem, 3.4vw, 1.6rem) / 1.2 'Maplestory', 'Lilita One', sans-serif;
  color: #fff;
  background: #e8452c;
  border: 3px solid var(--ink);
  border-radius: 999px;
  text-shadow: 0 2px 0 #9c2410;
  box-shadow: 0 4px 0 rgba(74, 42, 14, 0.35);
  transform: rotate(-2.5deg);
}
.title { margin: 0 0 0.9rem; font-weight: 400; display: flex; flex-wrap: nowrap; justify-content: center; align-items: center; gap: clamp(0.15rem, 1.2vw, 0.6rem); line-height: 0.95; }
.line {
  position: relative;
  isolation: isolate;
  display: inline-block;
  font: 700 var(--size) / 1 'Maplestory', 'Lilita One', 'Trebuchet MS', sans-serif;
  letter-spacing: 0.01em;
  padding: 0.04em 0.08em 0.2em;
}
.line::before {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  padding: inherit;
  z-index: -1;
  color: var(--ink);
  text-shadow: var(--outline);
}
.line > span {
  background: linear-gradient(#fff6a8 0%, #ffd12e 45%, #ff9a1a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.l1 { --size: clamp(1.1rem, 4.6vw, 2.3rem); transform: rotate(-1.5deg); white-space: nowrap; }
.game-logo {
  display: block;
  flex: 0 1 auto;
  width: clamp(90px, 22vw, 190px);
  height: auto;
  margin: 0;
  /* The logo is white with a soft glow: a dark edge keeps it readable on the light sky. */
  filter: drop-shadow(0 2px 0 rgba(74, 42, 14, 0.85)) drop-shadow(0 0 6px rgba(74, 42, 14, 0.6));
}
.l2 { --size: clamp(1.1rem, 4.6vw, 2.3rem); transform: rotate(1deg); white-space: nowrap; }

.tagline { max-width: 30rem; margin: 0.6rem auto 1.4rem; font-size: clamp(1.05rem, 2.6vw, 1.25rem); line-height: 1.45; color: #2b4a66; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7); }

/* Call to action */
.cta-wrap { margin-bottom: 1.6rem; }
.cta {
  display: inline-flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.35em 1.1em 0.3em;
  font: 400 clamp(1.5rem, 5vw, 2.1rem) / 1.2 'Lilita One', sans-serif;
  color: #fff;
  text-shadow: var(--outline);
  background: linear-gradient(#ffe86e, #ffb11f 60%, #ff9a10);
  border: 4px solid var(--ink);
  border-radius: 20px;
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.55), 0 8px 0 #a24a00, 0 16px 20px rgba(74, 42, 14, 0.3);
  cursor: pointer;
  transition: transform 0.08s ease-out, box-shadow 0.08s ease-out, filter 0.15s;
}
.cta:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-2px); }
.cta:active:not(:disabled) { transform: translateY(6px); box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.55), 0 2px 0 #a24a00, 0 6px 10px rgba(74, 42, 14, 0.3); }
.cta:disabled { cursor: progress; filter: saturate(0.7); }
.cta:focus-visible, .stop:focus-visible {
  outline: 4px solid #fff;
  outline-offset: 2px;
  box-shadow: 0 0 0 7px var(--ink);
}
.cta-icon { width: 1.5em; height: 1.35em; flex: none; filter: none; }
.fine { margin: 1.1rem auto 0; max-width: 28rem; font-size: 0.95rem; color: #2b4a66; }

.alert { margin: 0 auto 1rem; max-width: 34rem; padding: 0.6rem 1rem; background: #fff0ee; border: 3px solid #c4361d; border-radius: 12px; color: #8a1d0c; }

/* Panels */
.panel { margin: 0 auto 1.1rem; text-align: left; }

.welcome { display: flex; align-items: center; gap: 1rem; text-align: left; }
.welcome .avatar { margin: 0; flex: none; }
.welcome .details { min-width: 0; }
.welcome .who { margin: 0; font: 400 2.2rem / 1.1 'Lilita One', sans-serif; overflow-wrap: anywhere; }
.welcome .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; margin: 0.5rem 0 0; }
.job { font-weight: 800; color: #6b4a22; }
.note { margin: 0.4rem 0 0.2rem; color: #6b4a22; }

.banner { margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; background: #e6f3ff; border: 2px solid #8cc4ee; font-weight: 800; }
.banner.done { background: #eaffd9; border-color: #6cc24a; animation: settle 0.4s ease-out; }
@keyframes settle { from { transform: scale(0.97); } to { transform: scale(1); } }


.hint { margin-top: 14px; padding: 12px; background: #fff8e0; border: 2px solid #f0b030; border-radius: 10px; }
.hint p { margin: 0 0 6px; }
.hint ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 4px; }

.popout { margin-top: 14px; }
.popout-btn { padding: 8px 16px; font: 400 1.1rem 'Lilita One', sans-serif; color: #fff; background: #2f8fe0; border: 3px solid var(--ink); border-radius: 12px; box-shadow: 0 4px 0 #1e5f9e; cursor: pointer; }
.pause-btn { background: #f0a020; box-shadow: 0 4px 0 #b06a00; }
.pause-btn.paused { background: #3fa02a; box-shadow: 0 4px 0 #2a6f1a; }
.compact-btn { margin-left: 8px; background: #3fa02a; box-shadow: 0 4px 0 #2a6f1a; }
.popout-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 #1e5f9e; }
.popout-btn:disabled { opacity: 0.6; cursor: default; box-shadow: none; }
.popout-btn:focus-visible { outline: 4px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 7px var(--ink); }
.alert-inline { margin: 6px 0 0; color: #8a1d0c; }

/* Docked view: overview box on the left, EXP chart taking the middle. */
.content.wide { max-width: 1280px; }
/* The grinding carousel is small, so it sits close under the nav instead of where the big logo would. */
.content.has-live { padding-top: 64px; }
.dashboard { display: grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); gap: 20px; align-items: start; text-align: left; }
.charts { display: grid; gap: 20px; min-width: 0; }
.pot-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 520px) { .pot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.chart-summary { margin: 0 0 0.5rem; font-size: 1.1rem; }
.chart-summary strong { font: 400 1.7rem 'Lilita One', sans-serif; font-variant-numeric: tabular-nums; }
.dim { color: #6b4a22; }
/* Overview buttons: all full width, one even gap between each. */
.overview-box .popout { margin-top: 12px; display: grid; gap: 12px; }
.overview-box .popout-btn, .overview-box .stop, .overview-box .reset { width: 100%; margin: 0; display: block; }
.overview-box .alert-inline { margin: 0; }
.overview-box .stop { margin-top: 12px; }
.checking { max-width: 620px; }

/* Checklist shrinks away to the left, then the overview and chart slide in. */
.stage-leave-active { transition: transform 0.5s ease-in, opacity 0.5s ease-in; }
.stage-leave-to { transform: translateX(-45%) scale(0.5); opacity: 0; }
.stage-enter-active { transition: transform 0.5s ease-out, opacity 0.5s ease-out; }
.stage-enter-from { transform: translateX(-36px); opacity: 0; }
@media (max-width: 860px) { .dashboard { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) {
  .stage-leave-active, .stage-enter-active { transition: none; }
}
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; }
.stats div { padding: 8px 10px; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 10px; text-align: center; }
.stats dt { font-size: 0.85rem; color: #6b4a22; }
.stats dd { margin: 0; font: 400 1.5rem / 1.2 'Lilita One', sans-serif; font-variant-numeric: tabular-nums; }

.stop { margin-top: 16px; padding: 8px 18px; font: 400 1.1rem 'Lilita One', sans-serif; color: #fff; background: #d6452c; border: 3px solid var(--ink); border-radius: 12px; box-shadow: 0 4px 0 #8f2412; cursor: pointer; }
.stop:active { transform: translateY(3px); box-shadow: 0 1px 0 #8f2412; }
.reset { margin-top: 12px; padding: 8px 18px; font: 400 1.1rem 'Lilita One', sans-serif; color: var(--ink); background: #ffe08a; border: 3px solid var(--ink); border-radius: 12px; box-shadow: 0 4px 0 #b08a1c; cursor: pointer; }
.reset:active { transform: translateY(3px); box-shadow: 0 1px 0 #b08a1c; }
.reset.confirming { color: #fff; background: #e8452c; box-shadow: 0 4px 0 #9c2410; }
.reset:focus-visible { outline: 4px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 7px var(--ink); }

.hidden-video { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
  .cta, .cta:hover:not(:disabled), .cta:active:not(:disabled) { transition: none; }
  .banner.done { animation: none; }
}
@media (max-width: 480px) { .stats { grid-template-columns: 1fr; } }
.leaders { margin-top: 1.1rem; }
/* Wide screens: the leaderboard flanks the centred 620px column instead of sitting in it. */
.side { display: none; gap: 20px; }
@media (min-width: 1200px) {
  .leaders, .changelog-inline { display: none; }
  .side { display: grid; position: absolute; z-index: 1; top: 7.5rem; width: 250px; }
  .side.left { right: calc(50% + 310px + 24px); }
  .side.right { left: calc(50% + 310px + 24px); }
}
</style>
