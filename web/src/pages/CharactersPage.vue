<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import CharacterAvatar from '../components/home/CharacterAvatar.vue';
import CharacterRankTable from '../components/home/CharacterRankTable.vue';
import GameWindow from '../components/home/GameWindow.vue';
import SkyScene from '../components/home/SkyScene.vue';
import { listCharacters } from '../lib/api';
import { rankCharacters, specLeaders, type CharacterEntry } from '../lib/characters';

const characters = ref<readonly CharacterEntry[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const now = ref(Date.now());

const ranked = computed(() => rankCharacters(characters.value));
// Only jobs that have a character get a slot (job order kept).
const slots = computed(() => specLeaders(characters.value).filter((slot) => slot.leader !== null));

onMounted(async () => {
  try {
    characters.value = await listCharacters();
    now.value = Date.now();
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="characters">
    <SkyScene />
    <main class="content">
      <h1 class="heading">Characters</h1>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="status">Loading…</p>
      <p v-else-if="ranked.length === 0" class="status">No characters yet. Track a session and your character will show up here.</p>

      <template v-else>
        <GameWindow v-if="slots.length > 0" title="Top by job">
          <ul class="specs">
            <li v-for="slot in slots" :key="slot.spec" class="slot" :title="slot.leader ? `${slot.leader.name}, Lv ${slot.leader.level}` : `No ${slot.spec} yet`">
              <span class="portrait"><CharacterAvatar v-if="slot.leader" :name="slot.leader.name" /></span>
              <span class="spec">{{ slot.spec }}</span>
              <span class="who">{{ slot.leader ? `${slot.leader.name} · Lv ${slot.leader.level}` : '' }}</span>
            </li>
          </ul>
        </GameWindow>

        <GameWindow title="Ranking">
          <template #aside>{{ ranked.length }} {{ ranked.length === 1 ? 'character' : 'characters' }}</template>
          <CharacterRankTable :rows="ranked" :now="now" show-job />
        </GameWindow>
      </template>
    </main>
  </div>
</template>

<style scoped>
.characters {
  --ink: #4a2a0e;
  position: relative;
  min-height: 100dvh;
  color: var(--ink);
  font-family: 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  font-weight: 700;
  color-scheme: light;
}
.content {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 24px;
  max-width: 900px;
  margin: 0 auto;
  padding: 72px 16px 80px;
}
.heading {
  margin: 0;
  text-align: center;
  font: 400 clamp(2rem, 6vw, 3rem) / 1.1 'Lilita One', 'Trebuchet MS', sans-serif;
  color: #fff;
  text-shadow: -2px -2px 0 var(--ink), 2px -2px 0 var(--ink), -2px 2px 0 var(--ink), 2px 2px 0 var(--ink), 0 4px 0 var(--ink);
}
.status, .alert { margin: 0 auto; max-width: 34rem; padding: 0.8rem 1.2rem; text-align: center; background: #fff6dc; border: 3px solid var(--ink); border-radius: 12px; }
.alert { background: #fff0ee; border-color: #c4361d; color: #8a1d0c; }
.specs { display: flex; flex-wrap: nowrap; justify-content: safe center; gap: 12px; margin: 0; padding: 0 0 4px; list-style: none; overflow-x: auto; }
.slot { display: grid; justify-items: center; align-content: start; gap: 2px; box-sizing: border-box; flex: none; width: 128px; min-width: 0; padding: 10px 6px; text-align: center; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 10px; }
.portrait { display: grid; place-items: center; width: 96px; height: 96px; }
.portrait :deep(.avatar) { margin: 0; }
.spec { max-width: 100%; font-size: 0.75rem; font-weight: 800; line-height: 1.2; }
.who { max-width: 100%; min-height: 1.2em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.7rem; color: #6b4a22; }
</style>
