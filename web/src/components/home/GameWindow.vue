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
  --ink: #4a2a0e;
  text-align: left;
  background: #fff6dc;
  border: 4px solid var(--ink);
  border-radius: 14px;
  box-shadow: inset 0 0 0 3px #ffe6a0, 0 8px 0 rgba(74, 42, 14, 0.28), 0 18px 28px rgba(40, 70, 110, 0.25);
  overflow: hidden;
  color: var(--ink);
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
  color: #fff;
  background: linear-gradient(#5cbcf7, #2f8fe0);
  border-bottom: 4px solid var(--ink);
  text-shadow: 0 2px 0 #1e5f9e;
}
.aside { font-variant-numeric: tabular-nums; white-space: nowrap; }
.body { padding: 18px 20px 20px; }
</style>
