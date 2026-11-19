<script setup lang="ts">
/** Previous / next for a paged table. Renders nothing when everything fits on one page. */
defineProps<{ page: number; totalPages: number; label: string; busy?: boolean }>();
defineEmits<{ change: [page: number] }>();
</script>

<template>
  <nav v-if="totalPages > 1" class="pager" :aria-label="label">
    <button type="button" :disabled="busy || page <= 1" @click="$emit('change', page - 1)">‹ Prev</button>
    <span class="where" aria-live="polite">Page {{ page }} of {{ totalPages }}</span>
    <button type="button" :disabled="busy || page >= totalPages" @click="$emit('change', page + 1)">Next ›</button>
  </nav>
</template>

<style scoped>
.pager {
  --ink: var(--c-4a2a0e-edge);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  /* Sits flush under the table, which bleeds to the window's padding edge. */
  margin: 20px -20px -20px;
  padding: 8px 12px;
  background: var(--c-ffeec0-bg);
  border-top: 3px solid var(--ink);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--c-6b4a22-text);
}
.where { min-width: 7.5rem; text-align: center; font-weight: 800; }
button {
  padding: 3px 14px;
  font: inherit;
  font-weight: 800;
  color: var(--ink-text);
  background: var(--c-fff6dc-bg);
  border: 2px solid var(--ink);
  border-radius: 999px;
  cursor: pointer;
}
button:hover:not(:disabled) { color: var(--c-1f6fc4-text); }
button:disabled { opacity: 0.4; cursor: default; }
button:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
</style>
