<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <section class="window">
    <h2 class="title">
      <span>{{ title }}</span>
      <span v-if="$slots.aside" class="aside"><slot name="aside" /></span>
    </h2>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.window {
  --ink: var(--c-4a2a0e-edge);
  text-align: left;
  background: var(--c-fff6dc-bg);
  border: 4px solid var(--ink);
  border-radius: 14px;
  box-shadow: inset 0 0 0 3px var(--c-ffe6a0-edge), 0 8px 0 rgba(74, 42, 14, 0.28), 0 18px 28px rgba(40, 70, 110, 0.25);
  overflow: hidden;
  color: var(--ink-text);
}
.title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 8px 18px 6px;
  font: 400 1.25rem/1.2 'Lilita One', 'Trebuchet MS', sans-serif;
  letter-spacing: 0.02em;
  color: var(--c-ffffff-text);
  background: linear-gradient(var(--c-5cbcf7-bg), var(--c-2f8fe0-bg));
  border-bottom: 4px solid var(--ink);
  text-shadow: 0 2px 0 var(--c-1e5f9e-edge);
}
.aside { font-variant-numeric: tabular-nums; white-space: nowrap; }
.body { padding: 18px 20px 20px; }
</style>
