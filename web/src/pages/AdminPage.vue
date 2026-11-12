<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import CharactersTab from '../components/admin/CharactersTab.vue';
import MapsTab from '../components/admin/MapsTab.vue';
import SessionsTab from '../components/admin/SessionsTab.vue';
import { ADMIN_CHARACTER, isAdminProfile } from '../lib/admin';
import { adminApi } from '../lib/admin-api';
import { loadProfile } from '../lib/profile';

type Tab = 'sessions' | 'maps' | 'characters';

const router = useRouter();
const allowed = isAdminProfile(loadProfile());
// The "token" the API calls carry is just the admin character's name (a courtesy gate, not security).
const token = ADMIN_CHARACTER;
const unlocked = ref(false);
const error = ref<string | null>(null);
const tab = ref<Tab>('sessions');
const tabs: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'maps', label: 'Maps' },
  { key: 'characters', label: 'Characters' },
];

async function unlock() {
  error.value = null;
  try {
    await adminApi.check(token);
    unlocked.value = true;
  } catch (cause) {
    unlocked.value = false;
    error.value = cause instanceof Error ? cause.message : 'Could not open admin.';
  }
}

onMounted(() => {
  // Not the PayYoBills character in this browser: behave as if the page doesn't exist.
  if (!allowed) {
    void router.replace('/');
    return;
  }
  void unlock();
});
</script>

<template>
  <main v-if="allowed" class="admin">
    <header class="bar">
      <h1>Admin</h1>
      <nav v-if="unlocked" class="tabs">
        <button v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
      </nav>
    </header>

    <p v-if="!unlocked" class="err">{{ error ?? 'Opening admin...' }}</p>

    <template v-else>
      <SessionsTab v-if="tab === 'sessions'" :token="token" />
      <MapsTab v-else-if="tab === 'maps'" :token="token" />
      <CharactersTab v-else :token="token" />
    </template>
  </main>
</template>

<style scoped>
.admin { max-width: 1100px; margin: 0 auto; padding: 20px 16px 80px; }
.bar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.bar h1 { margin: 0; font-size: 22px; }
.tabs { display: flex; gap: 4px; flex: 1; }
.tabs button, .ghost { border: 1px solid var(--border); background: var(--card); color: var(--fg); padding: 6px 14px; border-radius: 6px; cursor: pointer; }
.tabs button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.err { color: #c0392b; margin: 0; }
</style>
