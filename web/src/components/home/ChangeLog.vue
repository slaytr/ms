<script setup lang="ts">
import { computed } from 'vue';

import type { ChangeLogEntry } from '../../data/changelog';

/** What's new, newest first. Entries live in data/changelog.ts. */
const props = defineProps<{ entries: readonly ChangeLogEntry[] }>();

const sorted = computed(() => [...props.entries].sort((a, b) => b.date.localeCompare(a.date)));

/** "2026-11-10" -> "Nov 10". Built from the parts so the day never shifts with the viewer's time zone. */
function dayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
</script>

<template>
  <p v-if="sorted.length === 0" class="empty">Nothing here yet.</p>
  <ul v-else class="log">
    <li v-for="entry in sorted" :key="`${entry.date}${entry.text}`">
      <time :datetime="entry.date">{{ dayLabel(entry.date) }}</time>
      <span>{{ entry.text }}</span>
    </li>
  </ul>
</template>

<style scoped>
.empty { margin: 0; text-align: center; font-size: 0.85rem; color: #6b4a22; }
.log { display: grid; gap: 6px; max-height: 14rem; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.log li { display: grid; grid-template-columns: 3.4rem minmax(0, 1fr); gap: 8px; font-size: 0.85rem; line-height: 1.3; }
time { font-weight: 800; color: #6b4a22; font-variant-numeric: tabular-nums; }
</style>
