<script setup lang="ts">
import { computed } from 'vue';

/** The level drawn as the game draws it: one orange tile per digit. */
const props = defineProps<{ level: number | null }>();
const digits = computed(() => (props.level === null ? [] : String(props.level).split('')));
</script>

<template>
  <span class="badge" role="img" :aria-label="level === null ? 'Level unknown' : `Level ${level}`">
    <span class="lv" aria-hidden="true">Lv.</span>
    <template v-if="level !== null">
      <span v-for="(digit, i) in digits" :key="i" class="tile" aria-hidden="true">{{ digit }}</span>
    </template>
    <span v-else class="tile blank" aria-hidden="true">?</span>
  </span>
</template>

<style scoped>
.badge { display: inline-flex; align-items: center; gap: 3px; vertical-align: middle; }
.lv { font: 400 1.05rem/1 'Lilita One', sans-serif; color: var(--c-4a2a0e-text); margin-right: 4px; }
.tile {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.9rem;
  font: 400 1.35rem/1 'Lilita One', sans-serif;
  color: var(--c-fff6c9-text);
  background: linear-gradient(var(--c-ffb12e-bg), var(--c-f27a00-bg));
  border: 2px solid var(--c-a64a00-edge);
  border-radius: 6px;
  text-shadow: 0 1px 0 var(--c-7a3300-edge), 1px 0 0 var(--c-7a3300-edge), -1px 0 0 var(--c-7a3300-edge), 0 -1px 0 var(--c-7a3300-edge);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35);
}
.tile.blank { opacity: 0.45; }
</style>
