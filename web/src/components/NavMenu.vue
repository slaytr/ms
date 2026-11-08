<script setup lang="ts">
import { RouterLink } from 'vue-router';

const links = [
  { to: '/', label: 'Tracker' },
  { to: '/maps', label: 'Maps' },
] as const;
</script>

<template>
  <nav class="nav" aria-label="Main">
    <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="tab" active-class="on" exact-active-class="on">
      {{ link.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav {
  --ink: #4a2a0e;
  position: fixed;
  top: 10px;
  left: 50%;
  z-index: 20;
  display: flex;
  gap: 4px;
  padding: 4px;
  transform: translateX(-50%);
  background: #fff6dc;
  border: 3px solid var(--ink);
  border-radius: 999px;
  box-shadow: 0 4px 0 rgba(74, 42, 14, 0.3);
}
.tab {
  padding: 4px 18px 3px;
  font: 400 1.05rem/1.3 'Lilita One', 'Trebuchet MS', sans-serif;
  color: var(--ink);
  text-decoration: none;
  border-radius: 999px;
}
.tab:hover { background: #ffe6a0; }
.tab.on { color: #fff; background: linear-gradient(#5cbcf7, #2f8fe0); text-shadow: 0 2px 0 #1e5f9e; }
.tab:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
</style>
