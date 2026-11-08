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
.lv { font: 400 1.05rem/1 'Lilita One', sans-serif; color: #4a2a0e; margin-right: 4px; }
.tile {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.9rem;
  font: 400 1.35rem/1 'Lilita One', sans-serif;
  color: #fff6c9;
  background: linear-gradient(#ffb12e, #f27a00);
  border: 2px solid #a64a00;
  border-radius: 6px;
  text-shadow: 0 1px 0 #7a3300, 1px 0 0 #7a3300, -1px 0 0 #7a3300, 0 -1px 0 #7a3300;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35);
}
.tile.blank { opacity: 0.45; }
</style>
