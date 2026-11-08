<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import DbBrowser from '../components/DbBrowser.vue';
import FixtureCapture from '../components/FixtureCapture.vue';
import PipTracker from '../components/PipTracker.vue';
import SessionHistory from '../components/SessionHistory.vue';
import { usePopOut } from '../composables/usePopOut';
import { useTracker } from '../composables/useTracker';
import { isDbBrowserEnabled } from '../lib/dev-db';
import { formatPerHour } from '../lib/format';
import { assessDetection, type Health } from '../lib/health';
import { buildTrackerView } from '../lib/tracker-view';

/** Developer test bench: manual session labels, raw readings, and fixture capture. The real UI is the home page. */
const tracker = useTracker();
const { capture, status, message, readings, rates, latest, historyKey } = tracker;

const label = ref('');
const character = ref('');

/** The database browser exists only on a dev API (ENABLE_FIXTURE_UPLOAD=1), so ask before showing it. */
const dbBrowserEnabled = ref(false);
onMounted(async () => {
  dbBrowserEnabled.value = await isDbBrowserEnabled();
});

const health = computed(() => assessDetection(tracker.lastDetection.value));
const chips = computed<ReadonlyArray<{ name: string; health: Health; hint: string }>>(() => [
  { name: 'Character', health: health.value.character, hint: 'Name plate, bottom left' },
  { name: 'EXP bar', health: health.value.exp, hint: 'Bottom status bar' },
  { name: 'Level', health: health.value.level, hint: 'Bottom status bar' },
  { name: 'Meso', health: health.value.meso, hint: 'Open your inventory (meso shows only then)' },
]);

const fmt = (n: number) => Math.round(n).toLocaleString();
const fmtDuration = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

const startSession = () => tracker.start({ label: label.value.trim(), character: character.value.trim() });

// The same overlay the home page pops out, shown inline here so it can be tested without a game window.
const popOut = usePopOut('Level tracker');
const trackerView = computed(() =>
  buildTrackerView({
    name: tracker.lastDetection.value?.character.name ?? null,
    map: tracker.map.value,
    snapshot: tracker.current.value,
    readings: readings.value,
    rates: rates.value,
  }),
);

onBeforeUnmount(() => void tracker.stop());
</script>

<template>
  <main class="page">
    <p class="back"><RouterLink to="/">Back to the home page</RouterLink></p>
    <h1>Capture (testing)</h1>
    <p class="muted">
      Developer test bench for MapleStory Classic. Share your game window and we read meso, EXP and level from the screen
      in your browser. Nothing leaves your machine except the numbers.
    </p>

    <section class="card controls">
      <input v-model="label" placeholder="Session label (e.g. Hunting @ Lab)" maxlength="80" :disabled="status !== 'idle'" />
      <input v-model="character" placeholder="Character" maxlength="40" :disabled="status !== 'idle'" />
      <button v-if="status !== 'tracking'" :disabled="status === 'loading'" @click="startSession">
        {{ status === 'loading' ? 'Starting…' : 'Share screen & start' }}
      </button>
      <button v-else class="stop" @click="tracker.stop()">Stop</button>
    </section>

    <p v-if="capture.error.value || message" class="error" role="alert">{{ capture.error.value ?? message }}</p>

    <section class="grid">
      <div class="card">
        <div class="stage">
          <video :ref="(el) => (capture.video.value = el as HTMLVideoElement | null)" muted playsinline />
          <div v-if="!capture.stream.value" class="placeholder">Preview appears here once you share your game window.</div>
        </div>
        <ul class="chips" aria-label="Detection status">
          <li v-for="chip in chips" :key="chip.name" :class="chip.health" :title="chip.hint">
            <span class="dot" />{{ chip.name }}:
            {{ chip.health === 'ok' ? 'reading' : chip.health === 'unreadable' ? 'found, not recognised yet' : 'not on screen' }}
          </li>
        </ul>
        <p class="muted small">Meso only appears while your inventory is open; it can sit anywhere on screen.</p>
      </div>

      <div class="card stats">
        <h2>Session</h2>
        <dl>
          <dt>Elapsed</dt><dd>{{ fmtDuration(rates.elapsedMs) }}</dd>
          <dt>Meso now</dt><dd>{{ latest?.meso != null ? fmt(latest.meso) : '—' }}</dd>
          <dt>Meso gained</dt><dd>{{ fmt(rates.mesoGained) }}</dd>
          <dt>Meso / hour</dt><dd class="big">{{ formatPerHour(rates.mesoPerHour) }}</dd>
          <dt>EXP now</dt><dd>{{ latest?.exp != null ? fmt(latest.exp) : '—' }}<span v-if="latest?.expPct != null" class="sub"> ({{ latest.expPct.toFixed(2) }}%)</span></dd>
          <dt>EXP gained</dt><dd>{{ fmt(rates.expGained) }}</dd>
          <dt>EXP / hour</dt><dd class="big">{{ formatPerHour(rates.expPerHour) }}</dd>
          <dt>% / hour</dt><dd>{{ rates.expPctPerHour.toFixed(2) }}%</dd>
          <dt>Level</dt><dd>{{ latest?.level ?? '—' }}</dd>
          <dt>Readings</dt><dd>{{ readings.length }}</dd>
        </dl>
      </div>
    </section>

    <section class="card preview">
      <h2>Pop-out tracker</h2>
      <p class="muted small">The overlay as it appears in the pop-out window. Updates every tick while a session is running.</p>
      <PipTracker :view="trackerView" inline />
      <p>
        <button :disabled="popOut.isOpen.value" @click="popOut.open()">{{ popOut.isOpen.value ? 'Popped out' : 'Pop out' }}</button>
        <span v-if="popOut.error.value" class="error"> {{ popOut.error.value }}</span>
      </p>
      <Teleport v-if="popOut.target.value" :to="popOut.target.value">
        <PipTracker :view="trackerView" />
      </Teleport>
    </section>

    <FixtureCapture
      :video="capture.video.value"
      :sharing="capture.stream.value !== null"
      :tracking="status !== 'idle'"
      @share="capture.start()"
      @unshare="capture.stop()"
    />

    <SessionHistory :refresh-key="historyKey" />

    <DbBrowser v-if="dbBrowserEnabled" :key="historyKey" />
  </main>
</template>

<style scoped>
.page { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; }
.back { margin: 0 0 12px; font-size: 14px; }
h1 { margin: 0 0 4px; }
h2 { margin: 0 0 8px; font-size: 1.05rem; }
.muted { color: var(--muted); }
.small { font-size: 13px; margin: 8px 0 0; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.controls input { flex: 1 1 180px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); }
button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--accent); color: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
button.stop { background: #c0392b; }
.error { color: #c0392b; margin: 0 0 12px; }
.grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 800px) { .grid { grid-template-columns: 2fr 1fr; } }
.stage { position: relative; background: #000; border-radius: 6px; overflow: hidden; min-height: 180px; }
.stage video { display: block; width: 100%; height: auto; }
.placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: #aaa; padding: 16px; text-align: center; }
.chips { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 4px; font-size: 14px; }
.chips li { display: flex; align-items: center; gap: 8px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); flex: none; }
.chips .ok .dot { background: #3aa66b; }
.chips .unreadable .dot { background: #e0b020; }
.chips .missing .dot { background: var(--muted); opacity: 0.5; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; }
dt { color: var(--muted); }
dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
dd.big { font-size: 1.25rem; font-weight: 600; }
.sub { color: var(--muted); font-size: 0.85em; }
.preview { margin-top: 16px; }
</style>
