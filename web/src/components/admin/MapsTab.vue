<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { sessionCount } from '../../lib/admin';
import { adminApi, type AdminMapLabel } from '../../lib/admin-api';

const props = defineProps<{ token: string }>();

const maps = ref<readonly AdminMapLabel[]>([]);
const drafts = ref<Readonly<Record<string, string>>>({});
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

async function load() {
  try {
    maps.value = await adminApi.listMaps(props.token);
    drafts.value = {};
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load maps.';
  }
}

async function rename(map: AdminMapLabel) {
  const to = (drafts.value[map.label] ?? map.label).trim();
  if (!to || to === map.label) return;
  error.value = null;
  try {
    const { changed } = await adminApi.renameMap(props.token, map.label, to);
    notice.value = `Renamed ${changed} session(s) to "${to}". Merging two names into one is fine.`;
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Rename failed.';
  }
}

onMounted(load);
</script>

<template>
  <section class="maps">
    <p class="muted">Renaming changes the map name on every session that uses it. Type an existing name to merge two spellings.</p>
    <p v-if="notice" class="ok">{{ notice }}</p>
    <p v-if="error" class="err">{{ error }}</p>
    <form v-for="m in maps" :key="m.label" class="row" @submit.prevent="rename(m)">
      <input :value="drafts[m.label] ?? m.label" maxlength="80" @input="drafts = { ...drafts, [m.label]: ($event.target as HTMLInputElement).value }" />
      <small>{{ sessionCount(m.sessions) }}</small>
      <button :disabled="(drafts[m.label] ?? m.label).trim() === m.label">Rename</button>
    </form>
  </section>
</template>

<style scoped>
.maps { display: grid; gap: 8px; max-width: 640px; }
.row { display: grid; grid-template-columns: 1fr 90px auto; gap: 8px; align-items: center; }
input { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); }
button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.muted, small { color: var(--muted); }
.ok { color: #27874f; }
.err { color: #c0392b; }
</style>
