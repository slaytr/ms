<script setup lang="ts">
import { computed, ref, useId } from 'vue';

import { formatCompact } from '../../lib/format';
import { expRateSeries, type ExpGainPoint } from '../../lib/metrics';
import { buildYAxis } from '../../lib/y-axis';

const props = defineProps<{ series: readonly ExpGainPoint[] }>();
/** Unique per chart: the Tracker page keeps its own copy mounted (hidden) while the Maps page shows another. */
const areaId = `exp-area-${useId()}`;

/** 'rate' is EXP per hour over a 1 minute moving window (the default); 'total' is the running EXP gained. */
type Mode = 'rate' | 'total';
const MODES: ReadonlyArray<{ value: Mode; label: string; hint: string }> = [
  { value: 'rate', label: 'EXP / hr', hint: 'EXP per hour, averaged over a moving 1 minute window' },
  { value: 'total', label: 'Total EXP', hint: 'EXP gained so far, adding up over the session' },
];
const mode = ref<Mode>('rate');

/** How much of the session the chart shows, ending now. Defaults to the last 30 minutes. */
const WINDOWS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 180, label: '3h' },
  { value: null, label: 'All' },
];
const windowMin = ref<number | null>(30);
const clipId = `exp-clip-${useId()}`;

const W = 640;
const H = 300;
const PAD = { top: 16, right: 20, bottom: 34, left: 58 };
const MIN_SPAN_MS = 5 * 60_000;
const X_STEPS_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720];

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

/** What is plotted: one value per point, whichever mode is showing. */
interface Sample {
  readonly elapsedMs: number;
  readonly value: number;
}
const samples = computed<readonly Sample[]>(() =>
  mode.value === 'total'
    ? props.series.map((p) => ({ elapsedMs: p.elapsedMs, value: p.gained }))
    : expRateSeries(props.series).map((p) => ({ elapsedMs: p.elapsedMs, value: p.expPerHour })),
);

const lastSample = computed(() => samples.value[samples.value.length - 1] ?? null);
/** End of the time axis: the whole session so far, the same in both modes so switching doesn't move it. */
const xMax = computed(() => Math.max(props.series[props.series.length - 1]?.elapsedMs ?? 0, MIN_SPAN_MS));
/** Start of the time axis: the last `windowMin` minutes, or the session start when it is shorter (or "All"). */
const xMin = computed(() => (windowMin.value === null ? 0 : Math.max(0, xMax.value - windowMin.value * 60_000)));
const xSpan = computed(() => xMax.value - xMin.value);
const visible = computed(() => samples.value.filter((s) => s.elapsedMs >= xMin.value));
/** The y axis (lib/y-axis.ts): starts at the gridline below the lowest value when the data sits well above zero, and a break mark says so. */
const yAxis = computed(() => {
  const values = visible.value.map((s) => s.value);
  const floor = mode.value === 'total' ? 100 : 1000;
  return buildYAxis(values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 0, floor);
});
const yBroken = computed(() => yAxis.value.min > 0);

const x = (ms: number) => PAD.left + ((ms - xMin.value) / xSpan.value) * plotW;
const y = (value: number) => PAD.top + plotH - ((value - yAxis.value.min) / (yAxis.value.max - yAxis.value.min)) * plotH;

const points = computed(() => samples.value.map((p) => `${x(p.elapsedMs).toFixed(1)},${y(p.value).toFixed(1)}`));
const linePath = computed(() => points.value.join(' '));
const areaPath = computed(() => {
  if (points.value.length < 2) return '';
  const base = (PAD.top + plotH).toFixed(1);
  const first = x(samples.value[0].elapsedMs).toFixed(1);
  const last = x(samples.value[samples.value.length - 1].elapsedMs).toFixed(1);
  return `M${first},${base} L${points.value.join(' L')} L${last},${base} Z`;
});

const yTicks = computed(() => {
  const { min, max, step } = yAxis.value;
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, i) => {
    const value = min + step * i;
    return { y: y(value), label: formatCompact(value) };
  });
});
/** Zigzag drawn over the axis just above the bottom gridline, marking that the axis doesn't start at 0. */
const breakPath = computed(() => {
  const cy = PAD.top + plotH - 9;
  const x0 = PAD.left;
  return `M${x0 - 6},${cy - 6} L${x0 + 6},${cy - 2} L${x0 - 6},${cy + 2} L${x0 + 6},${cy + 6}`;
});

function clockLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)}h${m ? ` ${m}m` : ''}`;
}

const xTicks = computed(() => {
  const fromMin = xMin.value / 60_000;
  const toMin = xMax.value / 60_000;
  const step = X_STEPS_MIN.find((s) => (toMin - fromMin) / s <= 6) ?? 1440;
  const ticks: { x: number; label: string }[] = [];
  for (let m = Math.ceil(fromMin / step - 1e-9) * step; m <= toMin + 1e-9; m += step) ticks.push({ x: x(m * 60_000), label: clockLabel(m) });
  return ticks;
});

/** Where the pointer is on the time axis (ms into the session), or null when it is off the chart. */
const hoverMs = ref<number | null>(null);
/** The plotted point nearest the pointer. Looked up from the time, so it follows a mode or window change. */
const hovered = computed<Sample | null>(() => {
  const at = hoverMs.value;
  if (at === null || visible.value.length === 0) return null;
  return visible.value.reduce((best, s) => (Math.abs(s.elapsedMs - at) < Math.abs(best.elapsedMs - at) ? s : best));
});
/** The point the dot sits on: under the pointer while hovering, else the latest reading. */
const active = computed(() => hovered.value ?? lastSample.value);

function onPointerMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  if (box.width === 0) return;
  const vx = ((event.clientX - box.left) / box.width) * W;
  const clamped = Math.min(Math.max(vx, PAD.left), W - PAD.right);
  hoverMs.value = xMin.value + ((clamped - PAD.left) / plotW) * xSpan.value;
}
const onPointerLeave = () => {
  hoverMs.value = null;
};

/** The active value, written above its point (below it when the point sits at the very top). While hovering it also gives the time. */
const nowLabel = computed(() => {
  const s = active.value;
  if (!s) return null;
  const cx = x(s.elapsedMs);
  const cy = y(s.value);
  const value = `${formatCompact(s.value)}${mode.value === 'rate' ? '/h' : ''}`;
  return {
    text: hovered.value ? `${value} · ${clockLabel(Math.round(s.elapsedMs / 60_000))}` : value,
    x: cx,
    y: cy - 12 < PAD.top + 10 ? cy + 24 : cy - 12,
    anchor: cx > W - 90 ? 'end' : cx < PAD.left + 70 ? 'start' : 'middle',
  };
});

const ready = computed(() => samples.value.length >= 2);
const summary = computed(() => {
  if (!ready.value) return 'EXP chart: waiting for more readings.';
  const span = clockLabel(Math.round(xMax.value / 60_000));
  const latest = Math.round(lastSample.value?.value ?? 0).toLocaleString();
  return mode.value === 'total'
    ? `EXP gained over time: ${latest} EXP in ${span}.`
    : `EXP per hour over time, 1 minute moving average: ${latest} EXP/h now, over ${span}.`;
});
const waiting = computed(() =>
  mode.value === 'total'
    ? "Collecting readings… the line appears once you've gained some EXP."
    : "Collecting readings… the rate line starts after the first few seconds of EXP.",
);
</script>

<template>
  <figure class="chart">
    <div class="modes" role="group" aria-label="Chart type">
      <button
        v-for="m in MODES"
        :key="m.value"
        type="button"
        :class="{ on: mode === m.value }"
        :aria-pressed="mode === m.value"
        :title="m.hint"
        @click="mode = m.value"
      >
        {{ m.label }}
      </button>
      <span v-if="mode === 'rate'" class="note">1 min average</span>
      <span class="spacer" />
      <div class="windows" role="group" aria-label="Time range">
        <button
          v-for="w in WINDOWS"
          :key="w.label"
          type="button"
          :class="{ on: windowMin === w.value }"
          :aria-pressed="windowMin === w.value"
          :title="w.value === null ? 'Show the whole session' : `Show the last ${w.label}`"
          @click="windowMin = w.value"
        >
          {{ w.label }}
        </button>
      </div>
    </div>

    <svg
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      :aria-label="summary"
      preserveAspectRatio="xMidYMid meet"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
      @pointercancel="onPointerLeave"
    >
      <defs>
        <linearGradient :id="areaId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color: var(--chart-fill)" stop-opacity="0.55" />
          <stop offset="100%" style="stop-color: var(--chart-fill)" stop-opacity="0.04" />
        </linearGradient>
        <clipPath :id="clipId"><rect :x="PAD.left" :y="PAD.top" :width="plotW" :height="plotH + 2" /></clipPath>
      </defs>

      <g class="grid">
        <g v-for="tick in yTicks" :key="`y${tick.label}${tick.y}`">
          <line :x1="PAD.left" :x2="W - PAD.right" :y1="tick.y" :y2="tick.y" />
          <text :x="PAD.left - 8" :y="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
        </g>
        <text v-for="tick in xTicks" :key="`x${tick.label}`" :x="tick.x" :y="H - 10" text-anchor="middle">{{ tick.label }}</text>
      </g>

      <path v-if="yBroken" :d="breakPath" class="axis-break"><title>The axis doesn't start at 0</title></path>

      <g :clip-path="`url(#${clipId})`">
        <path v-if="ready" :d="areaPath" :fill="`url(#${areaId})`" />
        <polyline v-if="ready" :points="linePath" class="line" />
      </g>
      <line v-if="hovered && ready" :x1="x(hovered.elapsedMs)" :x2="x(hovered.elapsedMs)" :y1="PAD.top" :y2="PAD.top + plotH" class="hover-line" />
      <circle v-if="active" :cx="x(active.elapsedMs)" :cy="y(active.value)" r="5.5" class="dot" />
      <text v-if="nowLabel" :x="nowLabel.x" :y="nowLabel.y" :text-anchor="nowLabel.anchor" class="now">{{ nowLabel.text }}</text>
    </svg>
    <p v-if="!ready" class="waiting">{{ waiting }}</p>
  </figure>
</template>

<style scoped>
.chart { margin: 0; position: relative; padding: 6px 8px; background: var(--chart-bg); border-radius: 8px; }
.modes { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; }
.modes button { padding: 3px 12px; font: 400 0.9rem 'Lilita One', sans-serif; color: var(--c-4a2a0e-text); background: var(--c-ecdcae-bg); border: 2px solid var(--c-4a2a0e-edge); border-radius: 999px; cursor: pointer; }
.modes button.on { color: var(--c-ffffff-text); background: var(--c-3fa02a-bg); }
.modes button:focus-visible { outline: 3px solid var(--c-2f8fe0-edge); outline-offset: 2px; }
.modes .spacer { flex: 1; }
.windows { display: flex; gap: 4px; }
.windows button { padding: 2px 9px; font-size: 0.8rem; }
.modes .note { margin-left: 4px; font-size: 0.75rem; color: var(--c-6b4a22-text); }
svg { display: block; width: 100%; height: auto; }
.grid line { stroke: var(--chart-grid); stroke-width: 1; }
.grid text { fill: var(--chart-text); font: 700 12px 'Nunito', sans-serif; }
.axis-break { fill: none; stroke: var(--chart-text); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.line { fill: none; stroke: var(--chart-line); stroke-width: 3.5; stroke-linejoin: round; stroke-linecap: round; }
.hover-line { stroke: var(--chart-text); stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.6; pointer-events: none; }
svg { touch-action: pan-y; }
.dot { pointer-events: none; fill: var(--c-ffd12e-bg); stroke: var(--c-4a2a0e-edge); stroke-width: 3; }
.now { pointer-events: none; fill: var(--chart-now); font: 400 15px 'Lilita One', sans-serif; paint-order: stroke; stroke: var(--chart-now-halo); stroke-width: 4px; stroke-linejoin: round; }
.waiting { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 2rem 3rem 2rem; text-align: center; color: var(--chart-text); }
</style>
