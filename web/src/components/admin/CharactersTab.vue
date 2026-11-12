<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { sessionCount } from '../../lib/admin';
import { adminApi, type AdminCharacter } from '../../lib/admin-api';

const props = defineProps<{ token: string }>();

interface Draft {
  name: string;
  job: string;
}

const characters = ref<readonly AdminCharacter[]>([]);
const drafts = ref<Readonly<Record<string, Draft>>>({});
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const draftOf = (c: AdminCharacter): Draft => drafts.value[c.fingerprint] ?? { name: c.name ?? '', job: c.job ?? '' };
const dirty = (c: AdminCharacter) => {
  const d = draftOf(c);
  return d.name.trim() !== '' && (d.name.trim() !== (c.name ?? '') || d.job.trim() !== (c.job ?? ''));
};

function edit(c: AdminCharacter, field: keyof Draft, value: string) {
  drafts.value = { ...drafts.value, [c.fingerprint]: { ...draftOf(c), [field]: value } };
}

async function load() {
  try {
    characters.value = await adminApi.listCharacters(props.token);
    drafts.value = {};
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load characters.';
  }
}

async function save(c: AdminCharacter) {
  const d = draftOf(c);
  error.value = null;
  try {
    const { sessions } = await adminApi.saveCharacter(props.token, c.fingerprint, {
      name: d.name.trim(),
      job: d.job.trim() || null,
      applyToSessions: true,
    });
    notice.value = `Saved ${d.name.trim()} on ${sessionCount(sessions)}.`;
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Save failed.';
  }
}

onMounted(load);
</script>

<template>
  <section class="chars">
    <p class="muted">One row per character (fingerprint). Saving renames it on every one of its sessions.</p>
    <p v-if="notice" class="ok">{{ notice }}</p>
    <p v-if="error" class="err">{{ error }}</p>
    <form v-for="c in characters" :key="c.fingerprint" class="row" @submit.prevent="save(c)">
      <input :value="draftOf(c).name" placeholder="Name" maxlength="40" @input="edit(c, 'name', ($event.target as HTMLInputElement).value)" />
      <input :value="draftOf(c).job" placeholder="Job" maxlength="80" @input="edit(c, 'job', ($event.target as HTMLInputElement).value)" />
      <small>{{ c.fingerprint }} · {{ sessionCount(c.sessions) }}</small>
      <button :disabled="!dirty(c)">Save</button>
    </form>
  </section>
</template>

<style scoped>
.chars { display: grid; gap: 8px; max-width: 820px; }
.row { display: grid; grid-template-columns: 1fr 1fr 190px auto; gap: 8px; align-items: center; }
input { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); min-width: 0; }
button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.muted, small { color: var(--muted); }
.ok { color: #27874f; }
.err { color: #c0392b; }
@media (max-width: 700px) { .row { grid-template-columns: 1fr 1fr; } }
</style>
