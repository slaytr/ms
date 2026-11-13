<script setup lang="ts">
import { computed } from 'vue';

import type { TrackerView } from '../lib/tracker-view';

/**
 * The numbers, shared so the home-page overview and the pop-out show exactly the same thing: map,
 * EXP/hour, level progress, gained/avg/meso cards, time to next level. Presentation only. Each
 * surface adds its own chrome around it (avatar and buttons on the overview, name bar in the pop-out).
 */
const props = withDefaults(defineProps<{ view: TrackerView; showElapsed?: boolean }>(), { showElapsed: true });

const fmt = (n: number) => Math.round(n).toLocaleString();

const hero = computed(() => {
  const { eta, etaText } = props.view;
  if (eta.state === 'ready') return { text: etaText ?? '', hint: null };
  if (eta.state === 'calculating') return { text: 'Calculating', hint: 'Needs about 2 minutes of play' };
  if (eta.state === 'stalled') return { text: 'Waiting for EXP', hint: 'No EXP gained yet' };
  return { text: '—', hint: 'Level or EXP not readable yet' };
});

/** "+1,200" in green, "-300" in red; exactly zero is shown plain. */
const net = computed(() => {
  const value = props.view.netMesos;
  if (value === null) return null;
  const rounded = Math.round(value);
  if (rounded === 0) return { text: '0', tone: 'zero' };
  return rounded > 0 ? { text: `+${fmt(rounded)}`, tone: 'up' } : { text: `-${fmt(-rounded)}`, tone: 'down' };
});

const percent = computed(() => (props.view.progress ? (props.view.progress.fraction * 100).toFixed(2) : null));
</script>

<template>
  <div class="tracker-stats">
    <p v-if="view.mapName" class="map" :title="view.mapFull ?? undefined">{{ view.mapName }}</p>
    <p class="label">EXP / hour (last hour)</p>
    <p class="rate" :class="{ muted: view.expPerHour === '—' }" :title="view.ratesEstimated ? 'Early estimate. It steadies as you play.' : undefined">
      {{ view.expPerHour }}<span v-if="view.ratesEstimated || view.expEstimated" class="approx" :title="view.expEstimated ? 'Estimated from the EXP bar percent' : undefined">~</span>
    </p>

    <div v-if="view.progress" class="progress">
      <p class="pct-row">
        <span v-if="view.expPctPerHour" class="pct-rate" title="Projected level progress per hour, from the last hour">{{ view.expPctPerHour }}</span>
        <strong>{{ percent }}%</strong>
      </p>
      <div
        class="track"
        role="progressbar"
        aria-label="EXP into this level"
        :aria-valuenow="Number(percent)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="fill" :style="{ width: `${view.progress.fraction * 100}%` }" />
      </div>
      <p class="to-go">
        <strong>{{ view.progress.estimated ? '~' : '' }}{{ fmt(view.progress.exp) }} EXP</strong>
        <span>{{ view.progress.estimated ? '~' : '' }}{{ fmt(view.progress.remaining) }} EXP to go</span>
      </p>
    </div>

    <dl class="stats">
      <div>
        <dt>EXP gained</dt>
        <dd class="green">{{ view.expEstimated ? '~' : '' }}+{{ fmt(view.expGained) }}</dd>
      </div>
      <div>
        <dt>Avg EXP / hour</dt>
        <dd class="green">{{ view.expPerHourAvg }}</dd>
      </div>
      <div>
        <dt>Meso gained</dt>
        <dd class="gold">
          <template v-if="view.mesoGained !== null">+{{ fmt(view.mesoGained) }}</template>
          <template v-else>—</template>
        </dd>
      </div>
      <div>
        <dt>Meso / hour</dt>
        <dd class="gold">{{ view.mesoPerHour ?? '—' }}</dd>
      </div>
      <div class="wide" :title="hero.hint ?? undefined">
        <dt>Time to next level</dt>
        <dd class="level-time" :class="{ muted: view.eta.state !== 'ready' }">{{ hero.text }}</dd>
      </div>
      <div
        class="wide"
        :title="view.netMesosCeiling ? 'Meso gained minus pot cost. Some pots used have no NPC price, so the real figure can be lower.' : 'Meso gained minus the NPC cost of the pots you used'"
      >
        <dt>Net mesos</dt>
        <dd class="net" :class="net ? net.tone : 'muted'">
          <template v-if="net">{{ net.text }}<span v-if="view.netMesosCeiling" class="approx">?</span></template>
          <template v-else>—</template>
        </dd>
      </div>
    </dl>

    <p v-if="view.expEstimated" class="note">Your game shows EXP as a percent only, so EXP is estimated from the bar.</p>
    <p v-if="view.paused" class="note paused-note">Paused. Nothing is counted until you resume.</p>
    <p v-if="view.mesoGained === null" class="note">Open your inventory to track meso.</p>
    <p v-else-if="view.mesoStale" class="note">Meso paused while your inventory is closed.</p>

    <p v-if="showElapsed" class="elapsed">Tracking for {{ view.elapsed }}</p>
  </div>
</template>

<style scoped>
.tracker-stats {
  --ink: #4a2a0e;
  flex: 1;
  display: flex;
  flex-direction: column;
  color: var(--ink);
  font: 700 14px/1.35 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
}
.tracker-stats * { box-sizing: border-box; }

.map { margin: 0 0 4px; font-size: 12px; color: #6b4a22; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label { margin: 0; color: #6b4a22; }
.rate { margin: 0; font: 400 clamp(2rem, 15vw, 3rem) / 1.05 'Lilita One', sans-serif; color: #2e9a1f; font-variant-numeric: tabular-nums; }
.rate.muted { color: #8f7a55; }
.approx { margin-left: 0.1em; font-size: 0.55em; vertical-align: top; color: #6b4a22; }

.progress { margin-top: -6px; }
.track { height: 14px; background: #ecdcae; border: 2px solid var(--ink); border-radius: 8px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(#8fe35f, #3fa02a); transition: width 0.6s ease-out; }
.to-go { display: flex; justify-content: space-between; margin: 3px 0 0; font-size: 12px; font-variant-numeric: tabular-nums; }
.to-go strong { font-weight: 800; }
.pct-row { display: flex; justify-content: flex-end; align-items: baseline; gap: 6px; margin: 0 0 1px; line-height: 1.1; font-size: 12px; font-variant-numeric: tabular-nums; }
.pct-row strong { font-weight: 800; }
.pct-rate { font-weight: 800; color: #2e9a1f; }

.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 10px 0 0; }
.stats div { padding: 4px 8px; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 8px; }
.stats .wide { grid-column: 1 / -1; }
.stats dt { font-size: 11px; color: #6b4a22; }
.stats dd { margin: 0; font: 400 1.25rem/1.2 'Lilita One', sans-serif; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

.stats dd.gold { color: #c98a00; }
.stats dd.green { color: #2e9a1f; }
.stats dd.level-time { color: #2e9a1f; }
.stats dd.net.up { color: #2e9a1f; }
.stats dd.net.down { color: #c0392b; }
.stats dd.net.zero { color: #6b4a22; }
.stats dd.net .approx { font-size: 0.6em; }
.stats dd.muted { color: #8f7a55; font-size: 1.05rem; }

.note { margin: 6px 0 0; font-size: 12px; color: #8a5a00; }
.paused-note { font-weight: 800; color: #b06a00; }
.elapsed { margin: auto 0 0; padding-top: 8px; font-size: 11px; color: #8f7a55; text-align: right; }

@media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
</style>
