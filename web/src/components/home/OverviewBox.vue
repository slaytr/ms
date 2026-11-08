<script setup lang="ts">
import type { TrackerView } from '../../lib/tracker-view';
import PipTracker from '../PipTracker.vue';
import CharacterAvatar from './CharacterAvatar.vue';

/**
 * The "who am I tracking" box that sits on the left once the game is locked in. It is the pop-out
 * tracker itself, with two extras: the character's avatar (and job) above the stats, and whatever
 * buttons the page passes in below them.
 */
defineProps<{
  name: string | null;
  job: string | null;
  view: TrackerView;
}>();
</script>

<template>
  <PipTracker class="overview" :view="view" inline>
    <template #top>
      <div class="who-row">
        <CharacterAvatar :name="name" />
        <p class="job">{{ job ?? 'Your character' }}</p>
      </div>
    </template>
    <slot />
  </PipTracker>
</template>

<style scoped>
.who-row { display: flex; align-items: center; gap: 0.75rem; }
.who-row :deep(.avatar) { margin: 0; flex: none; width: 72px; height: 72px; }
.job { margin: 0; min-width: 0; font-weight: 800; color: #6b4a22; overflow-wrap: anywhere; }
</style>
