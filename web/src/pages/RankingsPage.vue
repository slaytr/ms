<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import CharacterAvatar from '../components/home/CharacterAvatar.vue';
import RankList, { type RankRow } from '../components/home/RankList.vue';
import SkyScene from '../components/home/SkyScene.vue';
import { getWeeklySessions } from '../lib/api';
import { formatCompact } from '../lib/format';
import { formatStay } from '../lib/maps';
import { topByEfficiency, topByExp, topByLevels, topByMesos, type WeeklyRank } from '../lib/rankings';
import type { MapSession } from '../lib/maps';

const sessions = ref<readonly MapSession[]>([]);
const since = ref<number | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const podium = computed(() => topByExp(sessions.value));

const detailOf = (rank: WeeklyRank) => [rank.level !== null ? `Lv ${rank.level}` : null, rank.job].filter(Boolean).join(' · ');
const levelRows = computed<readonly RankRow[]>(() =>
  topByLevels(sessions.value).map((r) => ({ key: r.playerKey, player: r.player, detail: detailOf(r), value: `+${r.levelsGained.toFixed(1)}` })),
);
const efficientRows = computed<readonly RankRow[]>(() =>
  topByEfficiency(sessions.value).map((r) => ({
    key: r.playerKey,
    player: r.player,
    detail: detailOf(r),
    value: `${formatCompact(r.expPerHour)}/h`,
  })),
);
const mesoRows = computed<readonly RankRow[]>(() =>
  topByMesos(sessions.value).map((r) => ({ key: r.playerKey, player: r.player, detail: detailOf(r), value: `+${fmt(r.mesoGained)}` })),
);

const fmt = (n: number) => Math.round(n).toLocaleString();
const sinceLabel = computed(() =>
  since.value === null ? '' : new Date(since.value).toLocaleDateString([], { month: 'short', day: 'numeric' }),
);
const MEDALS = ['gold', 'silver', 'bronze'] as const;

onMounted(async () => {
  try {
    const week = await getWeeklySessions();
    sessions.value = week.sessions;
    since.value = week.since;
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="rankings">
    <SkyScene />
    <main class="content">
      <h1 class="heading">Weekly top 3</h1>
      <p v-if="sinceLabel" class="sub">Most EXP gained since {{ sinceLabel }}</p>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="status">Loading…</p>
      <p v-else-if="podium.length === 0" class="status">Nobody has gained EXP in the last 7 days yet.</p>

      <ol v-else class="podium">
        <li v-for="(rank, index) in podium" :key="rank.playerKey" class="card" :class="MEDALS[index]">
          <span class="place" aria-label="Place">{{ index + 1 }}</span>
          <CharacterAvatar :name="rank.player" />
          <h2 class="name" :title="rank.player">{{ rank.player }}</h2>
          <p class="meta">
            <template v-if="rank.level !== null">Lv {{ rank.level }}</template>
            <template v-if="rank.level !== null && rank.job"> · </template>
            <template v-if="rank.job">{{ rank.job }}</template>
          </p>
          <p class="exp">+{{ fmt(rank.expGained) }}<span class="unit"> EXP</span></p>
          <p class="meta">
            {{ formatStay(rank.seconds) }} over
            {{ rank.sessions }} {{ rank.sessions === 1 ? 'session' : 'sessions' }}
          </p>
        </li>
      </ol>

      <div v-if="!loading && !error" class="more">
        <RankList title="Most levels gained" subtitle="Levels climbed, last 7 days" :rows="levelRows" empty="Nobody has gained any EXP in the last 7 days yet." />
        <RankList title="Most efficient" subtitle="Average EXP per hour tracked, last 7 days (30+ min)" :rows="efficientRows" empty="Nobody has 30 minutes of tracked EXP in the last 7 days yet." />
        <RankList title="Most mesos gained" subtitle="Mesos picked up, last 7 days" :rows="mesoRows" empty="No mesos tracked in the last 7 days yet. Mesos only show while the inventory is open." />
      </div>
    </main>
  </div>
</template>

<style scoped>
.rankings {
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
  gap: 20px;
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
.sub { margin: -8px 0 0; text-align: center; color: #fff; text-shadow: 0 2px 0 var(--ink); }
.status, .alert { margin: 0 auto; max-width: 34rem; padding: 0.8rem 1.2rem; text-align: center; background: #fff6dc; border: 3px solid var(--ink); border-radius: 12px; }
.alert { background: #fff0ee; border-color: #c4361d; color: #8a1d0c; }

.podium { display: grid; gap: 16px; margin: 0; padding: 0; list-style: none; }
.card {
  position: relative;
  padding: 18px 14px 16px;
  text-align: center;
  background: #fff6dc;
  border: 3px solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 5px 0 rgba(74, 42, 14, 0.3);
}
.place {
  position: absolute;
  top: -14px;
  left: 50%;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  transform: translateX(-50%);
  font: 400 1.2rem 'Lilita One', sans-serif;
  color: #fff;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
  border: 3px solid var(--ink);
  border-radius: 50%;
  background: var(--medal);
}
.gold { --medal: #f2b705; background: #fff1bf; }
.silver { --medal: #9aa7b4; }
.bronze { --medal: #c8793a; }
.name { margin: 4px 0 0; font: 400 1.4rem 'Lilita One', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { margin: 4px 0 0; font-size: 0.85rem; color: #6b4a22; }
.exp { margin: 8px 0 0; font: 400 1.9rem 'Lilita One', sans-serif; color: #2e9a1f; font-variant-numeric: tabular-nums; }
.unit { font-size: 1rem; }

@media (min-width: 720px) { .more { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
.more { display: grid; gap: 16px; }

/* Wide enough for a podium: 2nd | 1st | 3rd, with the winner raised. */
@media (min-width: 720px) {
  .podium { grid-template-columns: repeat(3, 1fr); align-items: end; padding-top: 20px; }
  .card:nth-child(1) { order: 2; padding-block: 30px 22px; }
  .card:nth-child(2) { order: 1; }
  .card:nth-child(3) { order: 3; }
}
</style>
