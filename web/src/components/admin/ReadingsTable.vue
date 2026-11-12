<script setup lang="ts">
import { computed, ref } from 'vue';

import { parseNumberField, type NumberField } from '../../lib/admin';
import { adminApi, type AdminReading, type ReadingPatch } from '../../lib/admin-api';

const props = defineProps<{ token: string; sessionId: string; readings: readonly AdminReading[] }>();
const emit = defineEmits<{ changed: [] }>();

const PAGE = 100;
const page = ref(0);
const selected = ref<ReadonlySet<number>>(new Set());
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const fixFrom = ref('');
const fixTo = ref('');

const pageCount = computed(() => Math.max(1, Math.ceil(props.readings.length / PAGE)));
const visible = computed(() => props.readings.slice(page.value * PAGE, (page.value + 1) * PAGE));
const columns: ReadonlyArray<{ key: NumberField; label: string }> = [
  { key: 'level', label: 'Level' },
  { key: 'exp', label: 'EXP' },
  { key: 'expPct', label: 'EXP %' },
  { key: 'meso', label: 'Meso' },
];

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const show = (value: number | null) => (value === null ? '' : String(value));

function toggle(id: number) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function fail(cause: unknown, fallback: string) {
  notice.value = null;
  error.value = cause instanceof Error ? cause.message : fallback;
}

/** Saves one cell when its text changed (on blur/enter). A bad value is reported and not sent. */
async function commit(reading: AdminReading, field: NumberField, text: string) {
  const { value, error: problem } = parseNumberField(field, text);
  if (problem) {
    error.value = problem;
    return;
  }
  if (value === reading[field]) return;
  error.value = null;
  try {
    const patch: ReadingPatch = { [field]: value };
    await adminApi.patchReading(props.token, props.sessionId, reading.id, patch);
    emit('changed');
  } catch (cause) {
    fail(cause, 'Could not save the reading.');
  }
}

async function removeSelected() {
  const ids = [...selected.value];
  if (ids.length === 0 || !window.confirm(`Delete ${ids.length} reading(s)?`)) return;
  try {
    await adminApi.deleteReadings(props.token, props.sessionId, ids);
    selected.value = new Set();
    emit('changed');
  } catch (cause) {
    fail(cause, 'Delete failed.');
  }
}

/** "Change every reading showing level A to B" (or all readings when A is blank). */
async function fixLevels() {
  const to = parseNumberField('level', fixTo.value);
  const from = parseNumberField('level', fixFrom.value);
  if (to.error || to.value === null || from.error) {
    error.value = to.error ?? from.error ?? 'Enter the level to set.';
    return;
  }
  try {
    const { changed } = await adminApi.setLevels(props.token, props.sessionId, to.value, from.value ?? undefined);
    error.value = null;
    notice.value = `${changed} reading(s) changed.`;
    emit('changed');
  } catch (cause) {
    fail(cause, 'Could not change the levels.');
  }
}
</script>

<template>
  <div class="readings">
    <h3>Readings ({{ readings.length }})</h3>
    <div class="tools">
      <span>Set level</span>
      <input v-model="fixFrom" placeholder="from (blank = all)" size="14" />
      <span>to</span>
      <input v-model="fixTo" placeholder="level" size="6" />
      <button @click="fixLevels">Apply</button>
      <button class="danger" :disabled="selected.size === 0" @click="removeSelected">Delete {{ selected.size }} selected</button>
      <span v-if="notice" class="ok">{{ notice }}</span>
      <span v-if="error" class="err">{{ error }}</span>
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Time</th>
            <th v-for="c in columns" :key="c.key">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visible" :key="r.id">
            <td><input type="checkbox" :checked="selected.has(r.id)" @change="toggle(r.id)" /></td>
            <td>{{ time(r.takenAt) }}</td>
            <td v-for="c in columns" :key="c.key">
              <input
                :value="show(r[c.key])"
                inputmode="decimal"
                @change="commit(r, c.key, ($event.target as HTMLInputElement).value)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pageCount > 1" class="pager">
      <button :disabled="page === 0" @click="page--">Prev</button>
      <span>Page {{ page + 1 }} / {{ pageCount }}</span>
      <button :disabled="page >= pageCount - 1" @click="page++">Next</button>
    </div>
  </div>
</template>

<style scoped>
.readings { display: grid; gap: 8px; min-width: 0; }
h3 { margin: 0; font-size: 15px; }
.tools, .pager { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; }
.scroll { max-height: 420px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { padding: 2px 6px; text-align: left; white-space: nowrap; }
thead th { position: sticky; top: 0; background: var(--card); }
td input:not([type]), td input[inputmode] { width: 100%; min-width: 70px; padding: 3px 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--card); color: var(--fg); }
.tools input { padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--card); color: var(--fg); }
button { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.danger { color: #c0392b; }
.ok { color: #27874f; }
.err { color: #c0392b; }
</style>
