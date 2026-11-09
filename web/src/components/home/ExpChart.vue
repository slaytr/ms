<script setup lang="ts">
import { computed, useId } from 'vue';

import { formatCompact } from '../../lib/format';
import type { ExpGainPoint } from '../../lib/metrics';

const props = defineProps<{ series: readonly ExpGainPoint[] }>();
/** Unique per chart: the Tracker page keeps its own copy mounted (hidden) while the Maps page shows another. */
const areaId = `exp-area-${useId()}`;

const W = 640;
const H = 300;
const PAD = { top: 16, right: 20, bottom: 34, left: 58 };
const MIN_SPAN_MS = 5 * 60_000;
const Y_TICKS = 4;
const X_STEPS_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720];

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

/** Round up to 1, 2, 2.5, 5 or 10 times a power of ten, so axis labels land on friendly numbers. */
function niceMax(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

const lastPoint = computed(() => props.series[props.series.length - 1] ?? null);
const xMax = computed(() => Math.max(lastPoint.value?.elapsedMs ?? 0, MIN_SPAN_MS));
const yMax = computed(() => niceMax(Math.max(lastPoint.value?.gained ?? 0, 100)));

const x = (ms: number) => PAD.left + (ms / xMax.value) * plotW;
const y = (gained: number) => PAD.top + plotH - (gained / yMax.value) * plotH;

const points = computed(() => props.series.map((p) => `${x(p.elapsedMs).toFixed(1)},${y(p.gained).toFixed(1)}`));
const linePath = computed(() => points.value.join(' '));
const areaPath = computed(() => {
  if (points.value.length < 2) return '';
  const base = (PAD.top + plotH).toFixed(1);
  const first = x(props.series[0].elapsedMs).toFixed(1);
  const last = x(props.series[props.series.length - 1].elapsedMs).toFixed(1);
  return `M${first},${base} L${points.value.join(' L')} L${last},${base} Z`;
});

const yTicks = computed(() =>
  Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    const value = (yMax.value / Y_TICKS) * i;
    return { y: y(value), label: formatCompact(value) };
  }),
);

function clockLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)}h${m ? ` ${m}m` : ''}`;
}

const xTicks = computed(() => {
  const spanMin = xMax.value / 60_000;
  const step = X_STEPS_MIN.find((s) => spanMin / s <= 6) ?? 1440;
  const ticks: { x: number; label: string }[] = [];
  for (let m = 0; m <= spanMin + 1e-9; m += step) ticks.push({ x: x(m * 60_000), label: clockLabel(m) });
  return ticks;
});

const ready = computed(() => props.series.length >= 2);
const summary = computed(() =>
  ready.value
    ? `EXP gained over time: ${Math.round(lastPoint.value?.gained ?? 0).toLocaleString()} EXP in ${clockLabel(Math.round(xMax.value / 60_000))}.`
    : 'EXP chart: waiting for more readings.',
);
</script>

<template>
  <figure class="chart">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient :id="areaId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6cc24a" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#6cc24a" stop-opacity="0.04" />
        </linearGradient>
      </defs>

      <g class="grid">
        <g v-for="tick in yTicks" :key="`y${tick.label}${tick.y}`">
          <line :x1="PAD.left" :x2="W - PAD.right" :y1="tick.y" :y2="tick.y" />
          <text :x="PAD.left - 8" :y="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
        </g>
        <text v-for="tick in xTicks" :key="`x${tick.label}`" :x="tick.x" :y="H - 10" text-anchor="middle">{{ tick.label }}</text>
      </g>

      <path v-if="ready" :d="areaPath" :fill="`url(#${areaId})`" />
      <polyline v-if="ready" :points="linePath" class="line" />
      <circle v-if="lastPoint" :cx="x(lastPoint.elapsedMs)" :cy="y(lastPoint.gained)" r="5.5" class="dot" />
    </svg>
    <p v-if="!ready" class="waiting">Collecting readings… the line appears once you've gained some EXP.</p>
  </figure>
</template>

<style scoped>
.chart { margin: 0; position: relative; }
svg { display: block; width: 100%; height: auto; }
.grid line { stroke: #e3d3a2; stroke-width: 1; }
.grid text { fill: #6b4a22; font: 700 12px 'Nunito', sans-serif; }
.line { fill: none; stroke: #2e9a1f; stroke-width: 3.5; stroke-linejoin: round; stroke-linecap: round; }
.dot { fill: #ffd12e; stroke: #4a2a0e; stroke-width: 3; }
.waiting { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 0 3rem 2rem; text-align: center; color: #6b4a22; }
</style>
