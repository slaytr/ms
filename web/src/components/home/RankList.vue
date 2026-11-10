<script setup lang="ts">
import CharacterAvatar from './CharacterAvatar.vue';

/** One row of a ranked list: who, a line of detail under the name, and the figure they're ranked on. */
export interface RankRow {
  readonly key: string;
  readonly player: string;
  readonly detail: string;
  readonly value: string;
}

/** A short ranked list (best first) for the Rankings page. `empty` is what to say when nobody qualifies. */
defineProps<{ title: string; subtitle: string; rows: readonly RankRow[]; empty: string }>();

const MEDALS = ['gold', 'silver', 'bronze'] as const;
</script>

<template>
  <section class="rank-list">
    <h2>{{ title }}</h2>
    <p class="sub">{{ subtitle }}</p>
    <p v-if="rows.length === 0" class="none">{{ empty }}</p>
    <ol v-else>
      <li v-for="(row, index) in rows" :key="row.key">
        <span class="place" :class="MEDALS[index]">{{ index + 1 }}</span>
        <CharacterAvatar :name="row.player" small />
        <span class="who">
          <span class="name" :title="row.player">{{ row.player }}</span>
          <span class="detail">{{ row.detail }}</span>
        </span>
        <span class="value">{{ row.value }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.rank-list { padding: 14px 14px 12px; background: #fff6dc; border: 3px solid #4a2a0e; border-radius: 14px; box-shadow: 0 5px 0 rgba(74, 42, 14, 0.3); }
h2 { margin: 0; font: 400 1.35rem / 1.2 'Lilita One', sans-serif; }
.sub { margin: 2px 0 10px; font-size: 0.8rem; color: #6b4a22; }
.none { margin: 0; padding: 10px 0; text-align: center; color: #6b4a22; }
ol { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
li { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 4px 10px 4px 6px; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 10px; }
li :deep(.avatar) { margin: 0; }
.place { display: grid; place-items: center; width: 24px; height: 24px; font: 400 0.95rem 'Lilita One', sans-serif; color: #fff; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35); border: 2px solid #4a2a0e; border-radius: 50%; background: #c8793a; }
.place.gold { background: #f2b705; }
.place.silver { background: #9aa7b4; }
.place.bronze { background: #c8793a; }
.who { display: grid; min-width: 0; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; }
.detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: #6b4a22; }
.value { font: 400 1.25rem 'Lilita One', sans-serif; color: #2e9a1f; font-variant-numeric: tabular-nums; }
</style>
