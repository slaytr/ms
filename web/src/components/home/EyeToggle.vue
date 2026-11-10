<script setup lang="ts">
/** An eye button that shows or hides something sensitive. `shown` is v-model; the label says what it does. */
defineProps<{ shown: boolean; label: string }>();
defineEmits<{ 'update:shown': [value: boolean] }>();
</script>

<template>
  <button
    class="eye"
    type="button"
    :aria-pressed="shown"
    :aria-label="`${shown ? 'Hide' : 'Show'} ${label}`"
    :title="`${shown ? 'Hide' : 'Show'} ${label}`"
    @click="$emit('update:shown', !shown)"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path v-if="!shown" d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    </svg>
  </button>
</template>

<style scoped>
.eye { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; color: inherit; background: transparent; border: 0; border-radius: 6px; cursor: pointer; }
.eye svg { width: 20px; height: 20px; filter: drop-shadow(0 2px 0 rgba(30, 95, 158, 0.9)); }
.eye:hover { background: rgba(255, 255, 255, 0.2); }
.eye:focus-visible { outline: 3px solid #fff; outline-offset: 1px; }
</style>
