<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { formatPerHour } from '../lib/format';
import { expRateSeries, type ExpGainPoint } from '../lib/metrics';
import { overlayGraph } from '../lib/overlay-graph';
import type { TrackerView } from '../lib/tracker-view';

/**
 * Bryan's Overlay: a bare, compact pop-out. Flat dark surface, plain text, one thin progress bar,
 * no borders or cards, three short rows. Presentation only.
 */
const props = defineProps<{ view: TrackerView; series: readonly ExpGainPoint[]; tone?: 'green' | 'blue' }>();

/** The backdrop is the last 30 minutes of EXP/hr (lib/overlay-graph.ts), drawn in a 100x30 box that stretches to the window. */
const GRAPH_W = 100;
const GRAPH_H = 30;
const rateSeries = computed(() => expRateSeries(props.series));
const graph = computed(() => overlayGraph(rateSeries.value, GRAPH_W, GRAPH_H));

/** Pace right now: the latest 1-minute point, projected to an hour (the big figure is the last hour). */
const nowRate = computed(() => {
  const rate = rateSeries.value;
  const last = rate[rate.length - 1];
  return last ? formatPerHour(last.expPerHour) : '—';
});

const SURFACE = '#14161a';

const fmt = (n: number) => Math.round(n).toLocaleString();
const percent = computed(() => (props.view.progress ? (props.view.progress.fraction * 100).toFixed(2) : null));
const eta = computed(() => (props.view.eta.state === 'ready' ? (props.view.etaText ?? '—') : '—'));

/** The pop-out's page is cream by default; paint it the overlay's own surface so no frame shows. */
const root = ref<HTMLElement | null>(null);
onMounted(() => {
  const doc = root.value?.ownerDocument;
  if (doc) doc.body.style.background = SURFACE;
});
</script>

<template>
  <section ref="root" class="bryan" :class="{ blue: tone === 'blue' }" aria-label="Bryan's Overlay">
    <svg v-if="graph" class="graph" :viewBox="`0 0 ${GRAPH_W} ${GRAPH_H}`" preserveAspectRatio="none" aria-hidden="true">
      <polygon :points="graph.area" class="area" />
      <polyline :points="graph.line" class="line" vector-effect="non-scaling-stroke" />
    </svg>
    <div class="top">
      <span class="rate" :class="{ dim: view.expPerHour === '—' }">{{ view.expPerHour }}<span class="unit">/hr</span></span>
      <span class="side">
        <span class="line1">
          <span class="who">{{ view.name ?? 'Tracking' }}<template v-if="view.level !== null"> Lv.{{ view.level }}</template> · {{ view.paused ? 'Paused ' : '' }}{{ view.elapsed }}</span>
          <img class="leaf" src="/maple-leaf.png" alt="MapleStory" width="16" height="16" />
        </span>
        <span>+{{ fmt(view.expGained) }} <i>exp</i></span>
      </span>
    </div>

    <div class="bar-row">
      <div
        class="track"
        role="progressbar"
        aria-label="EXP into this level"
        :aria-valuenow="percent === null ? undefined : Number(percent)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div v-if="view.progress" class="fill" :style="{ width: `${view.progress.fraction * 100}%` }" />
      </div>
      <span class="pct">{{ percent === null ? '—' : `${percent}%` }}</span>
    </div>

    <div class="row">
      <span>{{ nowRate }} <i>/hr (min)</i></span>
      <span>{{ eta }} <i>to lv</i></span>
      <span>{{ view.mesoPerHour ?? '—' }} <i>meso/hr</i></span>
    </div>
  </section>
</template>

<style scoped>
.bryan {
  --accent: #7ee787;
  --accent-rgb: 126, 231, 135;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  padding: 5px 10px 6px;
  background: #14161a;
  color: #e8eaed;
  font: 600 11px/1.25 'Nunito', system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
}
.bryan.blue { --accent: #7cc8ff; --accent-rgb: 124, 200, 255; }
.graph { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.area { fill: rgba(var(--accent-rgb), 0.16); }
.line { fill: none; stroke: rgba(var(--accent-rgb), 0.45); stroke-width: 1.5; }
.top, .bar-row, .row { position: relative; }
.top, .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; white-space: nowrap; }
.top { align-items: flex-end; }
.side { min-width: 0; display: flex; flex-direction: column; align-items: flex-end; }
.line1 { min-width: 0; display: flex; align-items: center; gap: 6px; }
.leaf { flex: none; width: 16px; height: 16px; object-fit: contain; }
.who { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dim { color: #8b9098; }
.rate { flex: none; font: 700 1.45rem/1.1 'Nunito', system-ui, sans-serif; color: var(--accent); }
.rate.dim { color: #8b9098; }
.unit { margin-left: 2px; font-size: 0.5em; font-weight: 600; color: #8b9098; }
.bar-row { display: flex; align-items: center; gap: 6px; margin: 3px 0 4px; }
.track { flex: 1; height: 6px; background: #2a2e35; border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); transition: width 0.6s ease-out; }
.pct { flex: none; min-width: 46px; text-align: right; }
.row i { font-style: normal; color: #8b9098; }
@media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
</style>
