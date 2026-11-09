<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import CharacterAvatar from '../components/home/CharacterAvatar.vue';
import GameWindow from '../components/home/GameWindow.vue';
import SkyScene from '../components/home/SkyScene.vue';
import { listCharacters } from '../lib/api';
import { dayGain, formatSeen, rankCharacters, type CharacterEntry } from '../lib/characters';

const characters = ref<readonly CharacterEntry[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const now = ref(Date.now());

const fmt = (n: number) => Math.round(n).toLocaleString();
const formatGain = (c: CharacterEntry) => {
  const gain = dayGain(c);
  if (!gain) return '—';
  const sign = gain.exp > 0 ? '+' : gain.exp < 0 ? '−' : '';
  return `${sign}${fmt(Math.abs(gain.exp))}`;
};
const gainClass = (c: CharacterEntry) => {
  const gain = dayGain(c);
  return { gain: !!gain && gain.exp > 0, loss: !!gain && gain.exp < 0, dim: !gain };
};

const ranked = computed(() => rankCharacters(characters.value));

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

      <GameWindow v-else title="Ranking">
        <template #aside>{{ ranked.length }} {{ ranked.length === 1 ? 'character' : 'characters' }}</template>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th class="num">#</th>
                <th class="left">Character</th>
                <th class="left">Level</th>
                <th class="left job-col">Job</th>
                <th class="num" title="EXP between the earliest and latest reading in the last 24 hours">EXP (24h)</th>
                <th class="num">Last seen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, index) in ranked" :key="c.playerKey">
                <td class="num rank">{{ index + 1 }}</td>
                <td class="left">
                  <span class="who">
                    <span class="icon"><CharacterAvatar :name="c.name" small /></span>
                    <span class="name" :title="c.name">{{ c.name }}</span>
                  </span>
                </td>
                <td class="left level">Lv {{ c.level }}<span v-if="c.expPct !== null" class="pct"> · {{ c.expPct.toFixed(1) }}%</span></td>
                <td class="left dim job-col" :title="c.job ?? undefined">{{ c.job ?? '—' }}</td>
                <td class="num" :class="gainClass(c)">{{ formatGain(c) }}</td>
                <td class="num dim">{{ formatSeen(c.lastSeenAt, now) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </GameWindow>
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

.scroll { margin: -18px -20px -20px; overflow-x: auto; }
table { width: 100%; min-width: 560px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 12px; white-space: nowrap; border-bottom: 2px solid #ecdcae; }
th { position: sticky; top: 0; padding-block: 9px; font-size: 0.8rem; font-weight: 800; color: #6b4a22; background: #ffeec0; border-bottom: 3px solid var(--ink); }
tbody tr:nth-child(even) { background: rgba(255, 253, 243, 0.7); }
tbody tr:last-child td { border-bottom: 0; }
.left { text-align: left; }
.num { text-align: right; }
.dim { color: #6b4a22; }
.rank { width: 2.5rem; font: 400 1.1rem 'Lilita One', sans-serif; color: #8f7a55; }
tbody tr:nth-child(-n + 3) .rank { color: #c98a00; }

.who { display: flex; align-items: center; gap: 10px; }
.icon { flex: none; display: grid; place-items: center; width: 48px; height: 48px; }
.name { font-weight: 800; overflow: hidden; text-overflow: ellipsis; max-width: 14rem; }
.level { font-weight: 800; }
.gain { color: #2e9a1f; font-weight: 800; }
.loss { color: #c0392b; font-weight: 800; }
.pct { font-weight: 700; color: #6b4a22; }
@media (max-width: 719px) { .job-col { display: none; } }
</style>
