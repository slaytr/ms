<script setup lang="ts">
import type { TrackerView } from '../../lib/tracker-view';
import TrackerStats from '../TrackerStats.vue';
import CharacterAvatar from './CharacterAvatar.vue';
import GameWindow from './GameWindow.vue';
import LevelBadge from './LevelBadge.vue';

/**
 * The compact "who am I tracking" box that sits on the left once the game is locked in: the avatar
 * and name, then the same stats the pop-out shows, then the buttons passed in the slot. The elapsed
 * time is already in the window's title bar, so the stats' own "Tracking for" line is left off.
 */
defineProps<{
  name: string | null;
  job: string | null;
  view: TrackerView;
}>();
</script>

<template>
  <GameWindow title="Overview" class="overview">
    <template #aside>{{ view.elapsed }}</template>

    <div class="who-row">
      <CharacterAvatar :name="name" />
      <div class="who-text">
        <p class="name">{{ name ?? 'Your character' }}</p>
        <p class="meta">
          <LevelBadge :level="view.level" />
          <span v-if="job" class="job">{{ job }}</span>
        </p>
      </div>
    </div>

    <TrackerStats class="shared-stats" :view="view" :show-elapsed="false" />

    <div class="actions"><slot /></div>
  </GameWindow>
</template>

<style scoped>
.who-row { display: flex; align-items: center; gap: 0.75rem; }
.who-row :deep(.avatar) { margin: 0; flex: none; width: 72px; height: 72px; }
.who-text { min-width: 0; }
.name { margin: 0; font: 400 1.6rem / 1.1 'Lilita One', sans-serif; overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.7rem; margin: 0.35rem 0 0; }
.job { font-weight: 800; color: #6b4a22; }

.shared-stats { margin-top: 0.9rem; }

.actions:not(:empty) { margin-top: 0.9rem; }
</style>
