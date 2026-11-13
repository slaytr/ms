<script setup lang="ts">
import { onMounted, ref } from 'vue';

import type { TrackerView } from '../lib/tracker-view';

const FRAME = '#4a2a0e';

/**
 * The compact pop-out: one bar with EXP gained on the left and EXP/hour on the right. The green
 * fill's width is `fill` (0..1): the current EXP/h as a share of the session's best. Presentation only.
 */
withDefaults(defineProps<{ view: TrackerView; fill?: number }>(), { fill: 1 });

const fmt = (n: number) => Math.round(n).toLocaleString();

/**
 * Browsers won't open a pop-out window shorter than their minimum, so there can be spare height
 * around the 28px bar. Paint that the bar's border colour and centre the bar in it, so the spare
 * space reads as a frame instead of a black gap.
 */
const root = ref<HTMLElement | null>(null);
onMounted(() => {
  const host = root.value?.parentElement;
  const doc = root.value?.ownerDocument;
  if (!host || !doc) return;
  doc.body.style.background = FRAME;
  host.style.cssText = 'min-height:100vh;display:flex;align-items:center;';
});
</script>

<template>
  <section ref="root" class="compact" aria-label="EXP gained and EXP per hour">
    <div class="fill" :style="{ width: `${fill * 100}%` }" />
    <span class="gained" title="EXP gained">+{{ fmt(view.expGained) }}</span>
    <span v-if="view.paused" class="rate paused" title="Tracking is paused">Paused</span>
    <span v-else class="rate" :class="{ muted: view.expPerHour === '—' }" title="EXP per hour (last hour)">
      {{ view.expPerHour }}<span class="unit">/hr</span>
    </span>
  </section>
</template>

<style scoped>
.compact {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 100vh;
  padding: 0 14px;
  box-sizing: border-box;
  background: #2d5a22;
  border: 2px solid #4a2a0e;
  color: #fff;
  font: 400 1rem/1 'Lilita One', 'Nunito', sans-serif;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 0 #1f5c14;
  white-space: nowrap;
  overflow: hidden;
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(#8fe35f, #3fa02a);
  transition: width 0.6s ease-out;
}
.gained, .rate { position: relative; }
.gained { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rate { flex: none; }
.rate.muted { opacity: 0.7; }
.rate.paused { opacity: 0.85; font-size: 0.85em; letter-spacing: 0.05em; text-transform: uppercase; }
.unit { margin-left: 2px; font-size: 0.7em; opacity: 0.85; }

@media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
</style>
