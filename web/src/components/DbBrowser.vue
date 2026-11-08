<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { formatCell, listDbViews, readDbView, type DbPage, type DbViewSummary } from '../lib/dev-db';

const PAGE_SIZE = 50;

/** Read-only look at what's in the database: sessions, characters, maps, snapshots, readings, avatars. */
const views = ref<readonly DbViewSummary[]>([]);
const active = ref('sessions');
const page = ref<DbPage | null>(null);
const offset = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

const first = computed(() => (page.value && page.value.total > 0 ? page.value.offset + 1 : 0));
const last = computed(() => (page.value ? page.value.offset + page.value.rows.length : 0));
const hasPrev = computed(() => offset.value > 0);
const hasNext = computed(() => (page.value ? offset.value + PAGE_SIZE < page.value.total : false));

async function load() {
  loading.value = true;
  try {
    error.value = null;
    page.value = await readDbView(active.value, PAGE_SIZE, offset.value);
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  try {
    views.value = await listDbViews();
  } catch (cause) {
    error.value = (cause as Error).message;
    return;
  }
  await load();
}

function select(name: string) {
  if (name === active.value) return;
  active.value = name;
  offset.value = 0;
  void load();
}

function move(direction: 1 | -1) {
  offset.value = Math.max(0, offset.value + direction * PAGE_SIZE);
  void load();
}

onMounted(refresh);
</script>

<template>
  <section class="card">
    <header class="head">
      <h2>Database</h2>
      <button type="button" class="ghost" :disabled="loading" @click="refresh">Refresh</button>
    </header>

    <div class="tabs" role="tablist">
      <button
        v-for="view in views"
        :key="view.name"
        type="button"
        role="tab"
        :aria-selected="active === view.name"
        :class="{ on: active === view.name }"
        @click="select(view.name)"
      >
        {{ view.label }} <span class="count">{{ view.total.toLocaleString() }}</span>
      </button>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="page && page.rows.length === 0" class="muted">Nothing in {{ page.label.toLowerCase() }} yet.</p>
    <div v-else-if="page" class="scroll">
      <table>
        <thead>
          <tr>
            <th v-for="col in page.columns" :key="col.key" :class="{ num: col.type === 'number' }">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in page.rows" :key="index">
            <td v-for="col in page.columns" :key="col.key" :class="{ num: col.type === 'number', mono: col.type === 'id' }" :title="col.type === 'id' ? String(row[col.key] ?? '') : undefined">
              {{ formatCell(row[col.key], col.type) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer v-if="page && page.total > 0" class="pager">
      <span class="muted">{{ first.toLocaleString() }}–{{ last.toLocaleString() }} of {{ page.total.toLocaleString() }}</span>
      <span>
        <button type="button" class="ghost" :disabled="!hasPrev || loading" @click="move(-1)">Previous</button>
        <button type="button" class="ghost" :disabled="!hasNext || loading" @click="move(1)">Next</button>
      </span>
    </footer>
  </section>
</template>

<style scoped>
.card { margin-top: 16px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
h2 { margin: 0; font-size: 1.05rem; }
.muted { color: var(--muted); }
.error { color: #c0392b; }
button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--accent); color: #fff; cursor: pointer; }
button.ghost { background: transparent; color: var(--fg); }
button:disabled { opacity: 0.5; cursor: default; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.tabs button { background: transparent; color: var(--fg); }
.tabs button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.count { margin-left: 4px; opacity: 0.7; font-size: 0.85em; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 10px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; }
.num { text-align: right; }
.mono { font-family: ui-monospace, Consolas, monospace; }
.pager { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 13px; }
.pager span:last-child { display: inline-flex; gap: 6px; }
</style>
