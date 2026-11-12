<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

import { adminApi, type AdminSessionRow } from '../../lib/admin-api';
import SessionEditor from './SessionEditor.vue';

const props = defineProps<{ token: string }>();

const rows = ref<readonly AdminSessionRow[]>([]);
const unnamed = ref(false);
const search = ref('');
const selected = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function load() {
  loading.value = true;
  error.value = null;
  try {
    rows.value = await adminApi.listSessions(props.token, { unnamed: unnamed.value, search: search.value.trim() });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load sessions.';
  } finally {
    loading.value = false;
  }
}

function afterChange(removed: boolean) {
  if (removed) selected.value = null;
  void load();
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch([unnamed, search], () => {
  clearTimeout(timer);
  timer = setTimeout(() => void load(), 250);
});
onMounted(load);
</script>

<template>
  <div class="split">
    <section class="list">
      <div class="filters">
        <input v-model="search" placeholder="Search map or player" />
        <label><input v-model="unnamed" type="checkbox" /> Unnamed only</label>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="loading && rows.length === 0" class="muted">Loading...</p>
      <p v-else-if="rows.length === 0" class="muted">No sessions.</p>
      <button v-for="row in rows" :key="row.id" class="row" :class="{ on: selected === row.id }" @click="selected = row.id">
        <strong>{{ row.player ?? 'Unnamed' }}</strong>
        <span>{{ row.label || 'No map' }}</span>
        <small>{{ when(row.startedAt) }} · {{ row.readingCount }} readings<template v-if="row.startLevel"> · Lv {{ row.startLevel }}<template v-if="row.endLevel && row.endLevel !== row.startLevel">→{{ row.endLevel }}</template></template></small>
      </button>
    </section>

    <SessionEditor v-if="selected" :key="selected" :token="token" :session-id="selected" @changed="afterChange" />
    <p v-else class="muted pick">Pick a session to edit.</p>
  </div>
</template>

<style scoped>
.split { display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start; }
.list { display: grid; gap: 6px; max-height: 80vh; overflow: auto; }
.filters { display: grid; gap: 6px; position: sticky; top: 0; background: var(--bg); padding-bottom: 6px; }
.filters input[type='text'], .filters input:not([type]) { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); }
.row { text-align: left; display: grid; gap: 1px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); cursor: pointer; }
.row.on { border-color: var(--accent); }
.row small, .muted { color: var(--muted); }
.err { color: #c0392b; }
.pick { padding-top: 40px; }
@media (max-width: 800px) { .split { grid-template-columns: 1fr; } }
</style>
