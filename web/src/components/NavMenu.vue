<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { useTheme } from '../composables/useTheme.ts';

const { theme, toggle } = useTheme();

const links = [
  { to: '/', label: 'Tracker' },
  { to: '/maps', label: 'Maps' },
  { to: '/characters', label: 'Characters' },
  { to: '/rankings', label: 'Rankings' },
  { to: '/loot', label: 'Loot' },
  { to: '/merch', label: 'Merch' },
] as const;
</script>

<template>
  <nav class="nav" aria-label="Main">
    <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="tab" active-class="on" exact-active-class="on">
      {{ link.label }}
    </RouterLink>
    <button type="button" class="theme" :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" :title="theme === 'dark' ? 'Light mode' : 'Dark mode'" @click="toggle">
      {{ theme === 'dark' ? '☀' : '☾' }}
    </button>
  </nav>
</template>

<style scoped>
.nav {
  --ink: var(--c-4a2a0e-edge);
  position: fixed;
  top: 10px;
  left: 50%;
  z-index: 20;
  display: flex;
  gap: 4px;
  padding: 4px;
  transform: translateX(-50%);
  background: var(--c-fff6dc-bg);
  border: 3px solid var(--ink);
  border-radius: 999px;
  box-shadow: 0 4px 0 rgba(74, 42, 14, 0.3);
}
.tab {
  padding: 4px 18px 3px;
  font: 400 1.05rem/1.3 'Lilita One', 'Trebuchet MS', sans-serif;
  color: var(--ink-text);
  text-decoration: none;
  border-radius: 999px;
}
.tab:hover { background: var(--c-ffe6a0-bg); }
.tab.on { color: var(--c-ffffff-text); background: linear-gradient(var(--c-5cbcf7-bg), var(--c-2f8fe0-bg)); text-shadow: 0 2px 0 var(--c-1e5f9e-edge); }
.theme {
  width: 2rem;
  padding: 0;
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--ink-text);
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}
.theme:hover { background: var(--c-ffe6a0-bg); }
.theme:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
.tab:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
</style>
