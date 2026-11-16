<script setup lang="ts">
import { computed } from 'vue';

import type { Crate } from '../../lib/loot-box';

/** The crate's published contents: icon, name and drop rate for every item, with what you have found so far ticked. */
const props = defineProps<{
  crate: Crate;
  /** How many of each item id the player has pulled. */
  found: ReadonlyMap<number, number>;
}>();

/** Rarest first, then by name, so the chase items sit at the top. */
const rows = computed(() =>
  [...props.crate.items].sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name)),
);
const iconUrl = (id: number) => `/nx/${id}.png`;
</script>

<template>
  <section class="rates" :aria-label="`${crate.name} drop rates`">
    <header class="title">Drop rates</header>
    <div class="scroll">
      <table>
        <thead>
          <tr><th class="ic"><span class="sr">Icon</span></th><th>Item</th><th class="num">Rate</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in rows" :key="item.id" :class="{ got: found.has(item.id) }">
            <td class="ic"><img :src="iconUrl(item.id)" alt="" loading="lazy" draggable="false" /></td>
            <td class="name">
              {{ item.name }}
              <span v-if="found.has(item.id)" class="have" :title="`You have found ${found.get(item.id)}`">x{{ found.get(item.id) }}</span>
            </td>
            <td class="num">{{ item.rate }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="note">Rates are Nexon's published figures, rounded, so they may not add to exactly 100%.</p>
  </section>
</template>

<style scoped>
.rates {
  --edge: var(--c-243247-edge);
  color: var(--c-1c2636-text);
  background: var(--c-f6f1e2-bg);
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--c-f4f7fb-edge), 0 6px 0 rgba(36, 50, 71, 0.35);
  font: 700 12px/1.3 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  overflow: hidden;
}
.title {
  padding: 3px 8px 2px;
  color: var(--c-ffffff-text);
  background: linear-gradient(var(--c-5a78a6-bg), var(--c-34507c-bg));
  border-bottom: 2px solid var(--edge);
  font: 400 13px/1.4 'Lilita One', sans-serif;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 0 var(--c-1c2d49-edge);
}
.scroll { max-height: 420px; overflow-y: auto; scrollbar-width: thin; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th { position: sticky; top: 0; padding: 2px 6px; text-align: left; font-size: 10px; color: var(--c-50607a-text); background: var(--c-dde4ef-bg); border-bottom: 1px solid var(--c-8f9db3-edge); }
td { padding: 2px 6px; border-bottom: 1px solid var(--c-e3dcc4-edge); }
.ic { width: 1%; padding-right: 0; }
.ic img { display: block; image-rendering: pixelated; }
.num { text-align: right; white-space: nowrap; }
tr.got td { background: var(--c-e4f4d2-bg); }
.have { margin-left: 4px; padding: 0 5px; font-size: 10px; color: var(--c-ffffff-text); background: var(--c-3fa02a-bg); border-radius: 999px; }
.note { margin: 0; padding: 5px 8px; font-size: 10px; color: var(--c-6b6a5a-text); border-top: 1px solid var(--c-e3dcc4-edge); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
