<script setup lang="ts">
import { dayGain, formatSeen, type CharacterEntry } from '../../lib/characters';
import CharacterAvatar from './CharacterAvatar.vue';

/** A ranked list of characters (already sorted by the caller). The job column is optional, since a job board is all one job. */
defineProps<{ rows: readonly CharacterEntry[]; now: number; showJob?: boolean }>();

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
</script>

<template>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th class="left">Character</th>
          <th class="left">Level</th>
          <th v-if="showJob" class="left job-col">Job</th>
          <th class="num" title="EXP between the earliest and latest reading in the last 24 hours">EXP (24h)</th>
          <th class="num">Last seen</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(c, index) in rows" :key="c.playerKey">
          <td class="num rank">{{ index + 1 }}</td>
          <td class="left">
            <span class="who">
              <span class="icon"><CharacterAvatar :name="c.name" small /></span>
              <span class="name" :title="c.name">{{ c.name }}</span>
            </span>
          </td>
          <td class="left level">Lv {{ c.level }}<span v-if="c.expPct !== null" class="pct"> · {{ c.expPct.toFixed(1) }}%</span></td>
          <td v-if="showJob" class="left dim job-col" :title="c.job ?? undefined">{{ c.job ?? '—' }}</td>
          <td class="num" :class="gainClass(c)">{{ formatGain(c) }}</td>
          <td class="num dim">{{ formatSeen(c.lastSeenAt, now) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.scroll { margin: -18px -20px -20px; overflow-x: auto; }
table { width: 100%; min-width: 520px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 12px; white-space: nowrap; border-bottom: 2px solid #ecdcae; }
th { position: sticky; top: 0; padding-block: 9px; font-size: 0.8rem; font-weight: 800; color: #6b4a22; background: #ffeec0; border-bottom: 3px solid #4a2a0e; }
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
