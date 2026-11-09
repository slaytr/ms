<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import GameWindow from '../components/home/GameWindow.vue';
import SkyScene from '../components/home/SkyScene.vue';
import { listMapSessions } from '../lib/api';
import { formatPerHour } from '../lib/format';
import {
  formatLevels,
  formatStay,
  qualifyingSessions,
  rankMaps,
  sessionRates,
  sortRanks,
  type MapSession,
  type RankKey,
} from '../lib/maps';

/** Everything the API returned; `sessions` is the part that counts (30+ minutes, above 50K EXP/h). */
const allSessions = ref<readonly MapSession[]>([]);
const sessions = computed(() => qualifyingSessions(allSessions.value));
const loading = ref(true);
const error = ref<string | null>(null);
const sortKey = ref<RankKey>('expPerHour');
const selectedMap = ref<string | null>(null);

const columns: ReadonlyArray<{ key: RankKey; label: string; hint: string }> = [
  { key: 'expPerHour', label: 'EXP / hr', hint: 'EXP gained per hour on this map' },
  { key: 'expPctPerHour', label: '% / hr', hint: 'Share of a level per hour, fair across levels' },
  { key: 'mesoPerHour', label: 'Meso / hr', hint: 'Only counts while the inventory was open' },
  { key: 'seconds', label: 'Time', hint: 'Total time tracked on this map' },
];

const ranks = computed(() => sortRanks(rankMaps(sessions.value), sortKey.value));
const bestExpPerHour = computed(() => Math.max(1, ...ranks.value.map((r) => r.expPerHour)));
const history = computed(() => (selectedMap.value ? sessions.value.filter((s) => s.map === selectedMap.value) : sessions.value));

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (n: number) => `${n.toFixed(1)}%`;
const when = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const barWidth = (expPerHour: number) => `${Math.max(2, (expPerHour / bestExpPerHour.value) * 100)}%`;

function toggleMap(map: string) {
  selectedMap.value = selectedMap.value === map ? null : map;
}

onMounted(async () => {
  try {
    allSessions.value = await listMapSessions();
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="maps">
    <SkyScene />
    <main class="content">
      <h1 class="heading">Map rankings</h1>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="status">Loading…</p>
      <p v-else-if="sessions.length === 0" class="status">
        <template v-if="allSessions.length === 0">
          No map data yet. Track a session with the minimap visible and it will show up here once it qualifies.
        </template>
        <template v-else>
          None of your {{ allSessions.length }} tracked sessions qualify yet. A session needs 30+ minutes at over 50K EXP/h.
        </template>
      </p>

      <template v-else>
        <GameWindow title="Ranking">
          <template #aside>{{ ranks.length }} {{ ranks.length === 1 ? 'map' : 'maps' }}</template>
          <div class="scroll">
            <table class="ranking">
              <colgroup>
                <col class="c-rank" />
                <col />
                <col class="c-exp" />
                <col class="c-rate" />
                <col class="c-rate" />
                <col class="c-small" />
              </colgroup>
              <thead>
                <tr>
                  <th class="num">#</th>
                  <th class="left">Map</th>
                  <th v-for="col in columns" :key="col.key" :class="col.key === 'expPerHour' ? 'left' : 'num'" :aria-sort="sortKey === col.key ? 'descending' : undefined">
                    <button type="button" :class="{ on: sortKey === col.key }" :title="col.hint" @click="sortKey = col.key">
                      {{ col.label }}<span v-if="sortKey === col.key" aria-hidden="true"> ▼</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(rank, index) in ranks" :key="rank.map" :class="{ picked: selectedMap === rank.map }">
                  <td class="num rank">{{ index + 1 }}</td>
                  <td class="left">
                    <button type="button" class="map-btn" :aria-pressed="selectedMap === rank.map" @click="toggleMap(rank.map)">
                      {{ rank.map }}
                    </button>
                  </td>
                  <td class="left exp">
                    <span class="bar" :style="{ width: barWidth(rank.expPerHour) }" aria-hidden="true" />
                    <span class="val">{{ formatPerHour(rank.expPerHour) }}</span>
                  </td>
                  <td class="num">{{ pct(rank.expPctPerHour) }}</td>
                  <td class="num meso">{{ formatPerHour(rank.mesoPerHour) }}</td>
                  <td class="num">{{ formatStay(rank.seconds) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </GameWindow>

        <GameWindow title="History" class="history">
          <template #aside>
            <button v-if="selectedMap" type="button" class="clear" @click="selectedMap = null">{{ selectedMap }} ✕</button>
            <template v-else>All maps</template>
          </template>
          <div class="scroll">
            <table class="history-table">
              <colgroup>
                <col class="h-when" />
                <col class="h-level" />
                <col class="h-time" />
                <col class="h-gain" />
                <col class="h-gain" />
                <col class="h-rate" />
                <col class="h-rate" />
                <col :class="selectedMap ? undefined : 'h-player'" />
                <col class="h-job job-col" />
                <col v-if="!selectedMap" />
              </colgroup>
              <thead>
                <tr>
                  <th class="left">When</th>
                  <th class="left">Level</th>
                  <th class="num">Time</th>
                  <th class="num">EXP gained</th>
                  <th class="num">Meso gained</th>
                  <th class="num">EXP / hr</th>
                  <th class="num">% / hr</th>
                  <th class="left">Player</th>
                  <th class="left job-col">Job</th>
                  <th v-if="!selectedMap" class="left">Map</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in history" :key="s.id">
                  <td class="left dim">{{ when(s.startedAt) }}</td>
                  <td class="left dim">{{ formatLevels(s.levelFrom, s.levelTo) }}</td>
                  <td class="num">{{ formatStay(s.seconds) }}</td>
                  <td class="num exp-text">+{{ fmt(s.expGained) }}</td>
                  <td class="num meso">+{{ fmt(s.mesoGained) }}</td>
                  <td class="num exp-text">{{ formatPerHour(sessionRates(s).expPerHour) }}</td>
                  <td class="num">{{ pct(sessionRates(s).expPctPerHour) }}</td>
                  <td class="left strong" :title="s.player">{{ s.player }}</td>
                  <td class="left dim job-col" :title="s.job ?? undefined">{{ s.job ?? '—' }}</td>
                  <td v-if="!selectedMap" class="left" :title="s.map">{{ s.map }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </GameWindow>
      </template>
    </main>
  </div>
</template>

<style scoped>
.maps {
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
  max-width: 1100px;
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
table { width: 100%; min-width: 640px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 9px 12px; white-space: nowrap; border-bottom: 2px solid #ecdcae; }
th { position: sticky; top: 0; font-size: 0.8rem; font-weight: 800; color: #6b4a22; background: #ffeec0; border-bottom: 3px solid var(--ink); }
tbody tr:nth-child(even) { background: rgba(255, 253, 243, 0.7); }
tbody tr:last-child td { border-bottom: 0; }
.left { text-align: left; }
.num { text-align: right; }
.dim { color: #6b4a22; }
.strong { font-weight: 800; }
.rank { width: 2.5rem; font: 400 1.1rem 'Lilita One', sans-serif; color: #8f7a55; }
tbody tr:nth-child(-n + 3) .rank { color: #c98a00; }

th button, .map-btn, .clear { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
th button { font-weight: 800; }
th button:hover, th button.on { color: #1f6fc4; }
.map-btn { text-align: left; font-weight: 800; }
.map-btn:hover { text-decoration: underline; }
tr.picked { background: #dff1ff !important; }
tr.picked .map-btn { color: #1f6fc4; }
button:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; border-radius: 4px; }

/* Ranking: fixed-width number columns so only the map name flexes, and a long name is cut off instead of pushing them. */
.ranking { table-layout: fixed; min-width: 720px; }
.c-rank { width: 3.25rem; }
.c-exp { width: 8.5rem; }
.c-rate { width: 6.5rem; }
.c-small { width: 5.5rem; }
.ranking td.left { overflow: hidden; text-overflow: ellipsis; }
.ranking .map-btn { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.exp { position: relative; }

/* History: fixed layout so the whole row fits without sideways scrolling. Only the map flexes; it is cut
   off with "…" and the full name is in the hover tooltip. */
.history-table { table-layout: fixed; min-width: 0; }
.history-table th, .history-table td { padding: 9px 6px; }
.history-table td.left { overflow: hidden; text-overflow: ellipsis; }
.h-when { width: 8.25rem; }
.h-level { width: 6rem; }
.h-time { width: 4rem; }
.h-gain { width: 6.25rem; }
.h-rate { width: 4.75rem; }
.h-player { width: 7rem; }
.h-job { width: 8.5rem; }
/* Not enough room for the job without sideways scrolling on a narrower window: drop it, the rest stays. */
@media (max-width: 1019px) { .job-col { display: none; } }
.bar { position: absolute; inset: 6px auto 6px 8px; max-width: calc(100% - 16px); background: linear-gradient(#a6ec7a, #5cc23e); border-radius: 6px; opacity: 0.55; }
.val { position: relative; padding-left: 8px; font-weight: 800; color: #1f6f12; }
.exp-text { color: #2e9a1f; font-weight: 800; }
.meso { color: #b07a00; font-weight: 800; }

.history .clear { padding: 0 10px; border: 2px solid #fff; border-radius: 999px; font-size: 0.85rem; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
