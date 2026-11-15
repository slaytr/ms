<script setup lang="ts">
import type { PotView } from '../lib/pot-tracker';
import type { TrackerView } from '../lib/tracker-view';
import LevelBadge from './home/LevelBadge.vue';
import PotStats from './PotStats.vue';
import TrackerStats from './TrackerStats.vue';

/**
 * The pop-out overlay: a name bar over the shared stats. Presentation only. The home-page overview
 * reuses it as is, filling the `top` slot (avatar) and the default slot (buttons), so the two can
 * never drift apart.
 */
/** `pots` is shown only when passed (null means "passed, nothing counted yet"). */
defineProps<{ view: TrackerView; inline?: boolean; pots?: PotView | null }>();
defineEmits<{ rescan: []; repot: [] }>();
</script>

<template>
  <section class="pip" :class="{ inline }" aria-label="Level progress">
    <header v-if="inline" class="bar">
      <h1 class="name">{{ view.name ?? 'Tracking' }}</h1>
      <LevelBadge :level="view.level" />
    </header>
    <!-- Pop-out: a slim bar with the map on the left and the session timer on the right. -->
    <header v-else class="bar slim">
      <span class="map-name" :title="view.mapFull ?? undefined">{{ view.mapName ?? 'Tracking' }}</span>
      <span class="timer" :title="view.paused ? 'Paused' : 'Time tracked this session'">{{ view.paused ? 'Paused ' : '' }}{{ view.elapsed }}</span>
    </header>

    <div class="body">
      <div v-if="$slots.top" class="top"><slot name="top" /></div>
      <TrackerStats :view="view" :show-map="inline" :show-elapsed="inline">
        <!-- In the pop-out the bar carries map and timer, so name and level sit beside the EXP/h figure. -->
        <template v-if="!inline" #aside>
          <h1 class="name-aside">{{ view.name ?? 'Tracking' }}</h1>
          <LevelBadge :level="view.level" />
        </template>
      </TrackerStats>
      <PotStats v-if="pots !== undefined" :pots="pots" @rescan="$emit('rescan')" @repot="$emit('repot')" />
      <div v-if="$slots.default" class="extras"><slot /></div>
    </div>
  </section>
</template>

<style scoped>
.pip {
  --ink: #4a2a0e;
  display: flex;
  flex-direction: column;
  min-height: var(--pip-min-height, 100vh); /* the pop-out sets this to 0 so the window can fit the content */
  box-sizing: border-box;
  background: #fff6dc;
  color: var(--ink);
  font: 700 14px/1.35 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  border: 3px solid var(--ink);
}
.pip:not(.inline) { border: 0; }
.pip.inline { min-height: 0; border-radius: 12px; overflow: hidden; max-width: 320px; box-shadow: 0 6px 0 rgba(74, 42, 14, 0.25); }
.pip * { box-sizing: border-box; }
/* The pop-out window is small: the big EXP/h figure is a touch smaller there than on the page. */
.pip:not(.inline) :deep(.rate) { font-size: clamp(1.75rem, 12vw, 2.5rem); }

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px 5px;
  background: linear-gradient(#5cbcf7, #2f8fe0);
  border-bottom: 3px solid var(--ink);
}
.name { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 1.1rem/1.2 'Lilita One', sans-serif; color: #fff; text-shadow: 0 2px 0 #1e5f9e; }

.bar.slim { padding: 2px 10px 1px; border-bottom-width: 2px; font: 400 0.85rem/1.3 'Lilita One', sans-serif; color: #fff; text-shadow: 0 1px 0 #1e5f9e; }
.map-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timer { flex: none; font-variant-numeric: tabular-nums; }
.name-aside { margin: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 1.1rem/1.2 'Lilita One', sans-serif; color: var(--ink); }

.body { flex: 1; padding: 10px 12px 8px; display: flex; flex-direction: column; }
.top { margin-bottom: 8px; }
.extras { margin-top: 10px; }
</style>
