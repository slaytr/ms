<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { getSession, listSessions, type SessionDetail, type SessionSummary } from '../lib/api';
import { formatPerHour } from '../lib/format';
import { computeRates } from '../lib/metrics';

// Bump to reload the list (e.g. after a session ends).
const props = defineProps<{ refreshKey: number }>();

const sessions = ref<readonly SessionSummary[]>([]);
const selected = ref<SessionDetail | null>(null);
const error = ref<string | null>(null);

const rates = computed(() => (selected.value ? computeRates(selected.value.readings) : null));
const fmt = (n: number | null) => (n === null ? '—' : Math.round(n).toLocaleString());
const when = (iso: string) => new Date(iso).toLocaleString();

async function load() {
  try {
    error.value = null;
    sessions.value = await listSessions();
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}

async function open(id: string) {
  try {
    error.value = null;
    selected.value = await getSession(id);
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}

onMounted(load);
watch(() => props.refreshKey, load);
</script>

<template>
  <section class="card">
    <h2>Recent sessions</h2>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="sessions.length === 0" class="muted">No saved sessions yet.</p>
    <ul v-else class="list">
      <li v-for="s in sessions" :key="s.id">
        <button :class="{ on: selected?.id === s.id }" @click="open(s.id)">
          <strong>{{ s.label || 'Untitled' }}</strong>
          <span class="muted">{{ s.character }} · {{ when(s.startedAt) }} · {{ s.readingCount }} readings</span>
        </button>
      </li>
    </ul>

    <div v-if="selected && rates" class="detail">
      <h3>{{ selected.label || 'Untitled' }}</h3>
      <p class="muted">
        {{ formatPerHour(rates.mesoPerHour) }} meso/hr · {{ formatPerHour(rates.expPerHour) }} EXP/hr ({{ rates.expPctPerHour.toFixed(2) }}%/hr) ·
        {{ selected.readings.length }} datapoints
      </p>
      <ul v-if="selected.snapshots.start || selected.snapshots.end" class="snaps">
        <li v-for="(snap, kind) in selected.snapshots" :key="kind">
          <strong>{{ kind === 'start' ? 'Start' : 'End' }}:</strong>
          <template v-if="snap">
            {{ snap.name ?? 'unknown name' }}, Lv {{ snap.level ?? '—' }}, {{ fmt(snap.exp) }} EXP<template v-if="snap.expPct !== null"> ({{ snap.expPct.toFixed(2) }}%)</template>, {{ fmt(snap.meso) }} meso
          </template>
          <template v-else>not saved</template>
        </li>
      </ul>
      <div class="scroll">
        <table>
          <thead><tr><th>Time</th><th>Meso</th><th>EXP</th><th>EXP %</th><th>Level</th></tr></thead>
          <tbody>
            <tr v-for="r in selected.readings" :key="r.takenAt">
              <td>{{ new Date(r.takenAt).toLocaleTimeString() }}</td>
              <td>{{ fmt(r.meso) }}</td>
              <td>{{ fmt(r.exp) }}</td>
              <td>{{ r.expPct === null ? '—' : r.expPct.toFixed(3) }}</td>
              <td>{{ r.level ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-top: 16px; }
h2 { margin: 0 0 8px; font-size: 1.05rem; }
h3 { margin: 16px 0 0; }
.muted { color: var(--muted); margin: 0; }
.error { color: #c0392b; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list button { width: 100%; text-align: left; display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--fg); cursor: pointer; }
.list button.on { border-color: var(--accent); }
.snaps { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 2px; font-size: 14px; }
.scroll { max-height: 320px; overflow: auto; margin-top: 8px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 4px 8px; border-bottom: 1px solid var(--border); }
th:first-child, td:first-child { text-align: left; }
</style>
