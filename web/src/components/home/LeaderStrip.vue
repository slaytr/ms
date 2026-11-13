<script setup lang="ts">
import { formatCompact } from '../../lib/format';
import type { CharacterEntry, SpecSlot } from '../../lib/characters';
import type { WeeklyRank } from '../../lib/rankings';
import CharacterAvatar from './CharacterAvatar.vue';

/** A compact leaderboard for the home page: the week's top 3 by EXP, then the best character of each job. */
defineProps<{
  podium: readonly WeeklyRank[];
  /** The week's most efficient players (average EXP per hour), best first. */
  efficient?: readonly WeeklyRank[];
  jobs: readonly SpecSlot[];
  /** The richest characters by their latest meso count (best first). */
  rich?: readonly CharacterEntry[];
  /** Whether the rich list shows meso amounts. Hidden unless the viewer asks, since it is someone's wealth. */
  showMesos?: boolean;
  /** Show just one of the lists (the wide layout puts them on opposite sides of the page). */
  only?: 'podium' | 'efficient' | 'jobs' | 'rich';
  /** Lay the top 3 out as full-width rows instead of cards (for a narrow side column). */
  stack?: boolean;
}>();

const MEDALS = ['gold', 'silver', 'bronze'] as const;
</script>

<template>
  <div class="strip">
    <section v-if="podium.length > 0 && (!only || only === 'podium')" aria-label="Weekly top 3">
      <h3 v-if="!only">Weekly top 3 <span class="sub">EXP gained, last 7 days</span></h3>
      <ol class="chips" :class="{ stack }">
        <li v-for="(rank, index) in podium" :key="rank.playerKey" class="chip" :title="`${rank.player}: +${Math.round(rank.expGained).toLocaleString()} EXP`">
          <span class="place" :class="MEDALS[index]">{{ index + 1 }}</span>
          <CharacterAvatar :name="rank.player" small />
          <span class="name">{{ rank.player }}</span>
          <span class="stat">+{{ formatCompact(rank.expGained) }}</span>
        </li>
      </ol>
    </section>

    <section v-if="efficient && efficient.length > 0 && (!only || only === 'efficient')" aria-label="Most efficient top 3">
      <h3 v-if="!only">Most efficient <span class="sub">average EXP/h, last 7 days</span></h3>
      <ol class="chips" :class="{ stack }">
        <li v-for="(rank, index) in efficient" :key="rank.playerKey" class="chip" :title="`${rank.player}: +${Math.round(rank.expPerHour).toLocaleString()} EXP per hour`">
          <span class="place" :class="MEDALS[index]">{{ index + 1 }}</span>
          <CharacterAvatar :name="rank.player" small />
          <span class="name">{{ rank.player }}</span>
          <span class="stat">{{ formatCompact(rank.expPerHour) }}/h</span>
        </li>
      </ol>
    </section>

    <section v-if="jobs.length > 0 && (!only || only === 'jobs')" aria-label="Top by job">
      <h3 v-if="!only">Top by job</h3>
      <ul class="chips">
        <li v-for="slot in jobs" :key="slot.spec" class="chip" :title="slot.leader ? `${slot.leader.name}, Lv ${slot.leader.level}` : undefined">
          <CharacterAvatar v-if="slot.leader" :name="slot.leader.name" small />
          <span class="name">{{ slot.leader?.name }}</span>
          <span class="job">{{ slot.spec }}</span>
          <span class="stat">Lv {{ slot.leader?.level }}</span>
        </li>
      </ul>
    </section>

    <section v-if="rich && rich.length > 0 && (!only || only === 'rich')" aria-label="Rich list">
      <h3 v-if="!only" class="with-toggle">
        <span>Rich list <span class="sub">latest meso count</span></span>
        <slot name="rich-toggle" />
      </h3>
      <ol class="chips" :class="{ stack }">
        <li v-for="(c, index) in rich" :key="c.playerKey" class="chip" :title="showMesos ? `${c.name}: ${(c.meso ?? 0).toLocaleString()} mesos` : c.name">
          <span class="place" :class="MEDALS[index]">{{ index + 1 }}</span>
          <CharacterAvatar :name="c.name" small />
          <span class="name">{{ c.name }}</span>
          <span class="stat" :class="{ hidden: !showMesos }">{{ showMesos ? formatCompact(c.meso ?? 0) : '•••••' }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.strip { display: grid; gap: 10px; }
h3 { margin: 0 0 6px; font: 400 0.95rem / 1.2 'Lilita One', sans-serif; text-align: center; }
.with-toggle { display: flex; align-items: center; justify-content: center; gap: 6px; }
.stat.hidden { color: #6b4a22; letter-spacing: 0.1em; }
.sub { font: 700 0.7rem 'Nunito', sans-serif; color: #6b4a22; }
.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0; padding: 0; list-style: none; }
.chip { position: relative; display: grid; justify-items: center; align-content: start; gap: 1px; box-sizing: border-box; width: 96px; padding: 6px 4px; text-align: center; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 10px; }
.chip :deep(.avatar) { margin: 0; }
.chips.stack { flex-direction: column; flex-wrap: nowrap; }
.chips.stack .chip { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; justify-items: start; gap: 8px; width: 100%; padding: 6px 10px; text-align: left; }
.chips.stack .place { top: -8px; left: -8px; }
.name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; font-weight: 800; }
.job { max-width: 100%; font-size: 0.65rem; line-height: 1.15; color: #6b4a22; }
.stat { font-size: 0.75rem; font-variant-numeric: tabular-nums; color: #2e9a1f; }
.place { position: absolute; top: -9px; left: 6px; display: grid; place-items: center; width: 20px; height: 20px; font: 400 0.8rem 'Lilita One', sans-serif; color: #fff; border: 2px solid #4a2a0e; border-radius: 50%; background: #c8793a; }
.place.gold { background: #f2b705; }
.place.silver { background: #9aa7b4; }
.place.bronze { background: #c8793a; }
</style>
