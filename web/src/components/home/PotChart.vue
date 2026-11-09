<script setup lang="ts">
import { computed } from 'vue';

import type { PotSample } from '../../lib/pot-history';

/** One potion's running use over the session, as a step line (use only changes when a pot is drunk). */
const props = defineProps<{ name: string; series: readonly PotSample[]; elapsedMs: number }>();

const W = 220;
const H = 110;
const PAD = { top: 8, right: 8, bottom: 20, left: 30 };
const MIN_SPAN_MS = 5 * 60_000;
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function niceMax(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((m) => m * power >= value) ?? 10) * power;
}

const used = computed(() => props.series[props.series.length - 1]?.used ?? 0);
const xMax = computed(() => Math.max(props.elapsedMs, props.series[props.series.length - 1]?.elapsedMs ?? 0, MIN_SPAN_MS));
const yMax = computed(() => niceMax(Math.max(used.value, 4)));
const x = (ms: number) => PAD.left + (ms / xMax.value) * plotW;
const y = (value: number) => PAD.top + plotH - (value / yMax.value) * plotH;

/** Horizontal then vertical between samples, finishing flat at "now". */
const stepPath = computed(() => {
  const pts = props.series;
  if (pts.length === 0) return '';
  let d = `M${x(pts[0].elapsedMs).toFixed(1)},${y(pts[0].used).toFixed(1)}`;
  for (const p of pts.slice(1)) d += ` H${x(p.elapsedMs).toFixed(1)} V${y(p.used).toFixed(1)}`;
  return `${d} H${x(xMax.value).toFixed(1)}`;
});

const yTicks = computed(() => [0, yMax.value / 2, yMax.value].map((v) => ({ y: y(v), label: String(Math.round(v)) })));
const xLabel = computed(() => {
  const m = Math.round(xMax.value / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
});
const summary = computed(() => `${props.name}: ${used.value} used.`);
</script>

<template>
  <figure class="pot-chart">
    <figcaption>
      <span class="name">{{ name }}</span>
      <span class="used">{{ used.toLocaleString() }}</span>
    </figcaption>
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" preserveAspectRatio="xMidYMid meet">
      <g class="grid">
        <g v-for="tick in yTicks" :key="tick.label">
          <line :x1="PAD.left" :x2="W - PAD.right" :y1="tick.y" :y2="tick.y" />
          <text :x="PAD.left - 5" :y="tick.y + 3.5" text-anchor="end">{{ tick.label }}</text>
        </g>
        <text :x="PAD.left" :y="H - 5">0</text>
        <text :x="W - PAD.right" :y="H - 5" text-anchor="end">{{ xLabel }}</text>
      </g>
      <path :d="stepPath" class="line" />
    </svg>
  </figure>
</template>

<style scoped>
.pot-chart { margin: 0; padding: 6px 8px 2px; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 8px; min-width: 0; }
figcaption { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 12px; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.used { font: 400 1.1rem / 1 'Lilita One', sans-serif; color: #1f8f8a; font-variant-numeric: tabular-nums; }
svg { display: block; width: 100%; height: auto; }
.grid line { stroke: #e3d3a2; stroke-width: 1; }
.grid text { fill: #6b4a22; font: 700 9px 'Nunito', sans-serif; }
.line { fill: none; stroke: #1f8f8a; stroke-width: 2.5; stroke-linejoin: round; }
</style>
