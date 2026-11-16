<script setup lang="ts">
import { ref } from 'vue';

import type { PotView } from '../lib/pot-tracker';

/**
 * Pot use from the Use tab: what's left of each item, how many were used since the count started, and
 * the mesos spent and HP/MP restored. Presentation only; the numbers come from lib/pot-tracker.ts.
 */
defineProps<{ pots: PotView | null }>();
defineEmits<{ rescan: []; repot: [] }>();

/** Item icons live in web/public/potions, named by the game's item id. */
const iconUrl = (id: number) => `/potions/${id}.png`;
/** Items whose icon file is missing: the table is icon-only, so these fall back to showing the name. */
const noIcon = ref<ReadonlySet<number>>(new Set());
const iconFailed = (id: number) => {
  noIcon.value = new Set([...noIcon.value, id]);
};
const fmt = (n: number) => Math.round(n).toLocaleString();
/** Change in stock since counting began: negative = ran down, positive = restocked or looted. Null when a count is unknown. */
const net = (row: { before: number | null; now: number | null }) => (row.before === null || row.now === null ? null : row.now - row.before);
const fmtNet = (n: number | null) => (n === null ? '—' : n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');
</script>

<template>
  <section class="pots" aria-label="Potions">
    <header class="head">
      <h3>Potions</h3>
      <span v-if="pots" class="buttons">
        <button type="button" class="restart" :class="{ on: pots.paused }" :title="pots.paused ? 'Carry on counting from your restocked inventory' : 'Pause while you restock; what you used so far is kept'" @click="$emit('repot')">
          {{ pots.paused ? 'Resume' : 'Repot' }}
        </button>
        <button type="button" class="restart" title="Start over from what you have now, forgetting what was used" @click="$emit('rescan')">Restart count</button>
      </span>
    </header>

    <p v-if="!pots" class="note">Put your pots in the <strong>quick slots</strong> and we'll count them as you go, or open your inventory on the <strong>Use</strong> tab, scrolled to the top.</p>

    <template v-else>
      <p class="summary">
        <strong>{{ fmt(pots.totals.used) }}</strong> used
        <template v-if="pots.totals.used > 0">
          <span class="dot">·</span><span class="meso">{{ fmt(pots.totals.mesos) }}{{ pots.totals.mesosUnknownFor > 0 ? '+' : '' }} mesos</span>
          <span class="dot">·</span><span class="hp">{{ fmt(pots.totals.hp) }} HP</span>
          <span class="dot">·</span><span class="mp">{{ fmt(pots.totals.mp) }} MP</span>
        </template>
      </p>

      <table>
        <thead>
          <tr><th>Item</th><th class="num">Left</th><th class="num">Used</th><th class="num" title="Change in stock since counting began (restocking counts)">Net</th><th class="num" title="Mesos spent on the pots used, and below it the net change in what your stock is worth">Mesos</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in pots.rows" :key="row.id" :class="{ idle: row.used === 0 }">
            <td class="item">
              <span class="icon" role="img" :aria-label="row.name" :title="row.name">
                <img v-if="!noIcon.has(row.id)" :src="iconUrl(row.id)" alt="" width="27" height="30" loading="lazy" @error="iconFailed(row.id)" />
                <span v-else class="fallback">{{ row.name }}</span>
                <span v-if="row.source === 'quick'" class="qs" title="Counted from your quick slots, so no inventory needed">QS</span>
              </span>
            </td>
            <td class="num" :title="row.stale ? 'Last good reading: this count isn\'t readable right now' : undefined">{{ row.now === null ? '—' : fmt(row.now) }}{{ row.stale ? '?' : '' }}</td>
            <td class="num used">{{ row.used > 0 ? fmt(row.used) : '·' }}</td>
            <td class="num netcol" :class="{ up: (net(row) ?? 0) > 0, down: (net(row) ?? 0) < 0 }">{{ fmtNet(net(row)) }}</td>
            <td class="num meso" :title="row.used > 0 && row.mesos === null ? 'No NPC sells this, so its cost is not known' : undefined">
              {{ row.used === 0 ? '' : row.mesos === null ? '?' : fmt(row.mesos) }}
              <small v-if="row.netMesos !== null && row.netMesos !== 0" class="netmeso" :class="{ up: row.netMesos > 0 }" title="Net: what your stock is worth now against when counting began (restocking offsets use)">{{ fmtNet(row.netMesos) }}</small>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="pots.paused" class="note paused">Paused for repotting. Restock, then press <strong>Resume</strong>. Nothing in your inventory counts until then.</p>
      <p v-if="pots.totals.percentItemsUsed > 0" class="note">HP/MP for elixirs and other percentage items isn't counted (it depends on your max HP/MP).</p>
      <p v-if="pots.scrolledAway" class="note warn">Your Use tab has scrolled. Scroll it back to where it was to keep counting.</p>
      <p v-if="pots.unreadable.length > 0" class="note warn">Couldn't read every {{ pots.unreadable.join(', ') }} count, so {{ pots.unreadable.length === 1 ? 'it isn\'t' : 'they aren\'t' }} fully counted.</p>
      <p v-if="pots.usesTab" class="note">Use-tab pots: the visible slots only, and pots you buy or pick up offset the ones you use. QS pots are counted from your quick slots, wherever they are.</p>
      <p v-else class="note"><span class="qs">QS</span> Counted from your quick slots, so no inventory needed. Pots you buy don't count against you.</p>
    </template>
  </section>
</template>

<style scoped>
.pots { margin-top: 10px; padding: 6px 8px; background: var(--c-fffdf3-bg); border: 2px solid var(--c-d9c48a-edge); border-radius: 8px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
h3 { margin: 0; font: 400 1rem / 1.2 'Lilita One', sans-serif; }
.restart { padding: 1px 8px; font: 700 11px / 1.4 'Nunito', sans-serif; color: var(--c-4a2a0e-text); background: var(--c-ffffff-bg); border: 2px solid var(--c-d9c48a-edge); border-radius: 999px; cursor: pointer; }
.buttons { display: inline-flex; gap: 4px; }
.restart.on { background: var(--c-5cc23e-bg); border-color: var(--c-2c7d18-edge); color: var(--c-ffffff-text); }
.restart:hover { background: var(--c-ffe6a0-bg); }
.restart.on:hover { background: var(--c-4aa82e-bg); }
.restart:focus-visible { outline: 3px solid var(--c-4a2a0e-edge); outline-offset: 2px; }
.note { margin: 4px 0 0; font-size: 11px; color: var(--c-6b4a22-text); }
.note.warn { color: var(--c-a23a00-text); }
.qs { margin-left: 5px; padding: 0 5px; font: 800 9px / 1.6 'Nunito', sans-serif; letter-spacing: 0.04em; color: var(--c-ffffff-text); background: var(--c-3fa02a-bg); border-radius: 999px; vertical-align: middle; }
.icon .qs { position: absolute; right: -5px; bottom: -5px; margin: 0; padding: 0 3px; font-size: 7px; line-height: 1.5; }
.note.paused { padding: 3px 6px; color: var(--c-2c5d18-text); background: var(--c-eaf8dd-bg); border-radius: 6px; }
.summary { margin: 4px 0 6px; font-variant-numeric: tabular-nums; font-size: 12px; }
.summary strong { font: 400 1.3rem / 1.1 'Lilita One', sans-serif; color: var(--c-2e9a1f-text); }
.dot { margin: 0 4px; color: var(--c-8f7a55-text); }
.meso { color: var(--c-b07a00-text); }
.hp { color: var(--c-c0392b-text); }
.mp { color: var(--c-1f6fc4-text); }
table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-size: 10px; color: var(--c-6b4a22-text); border-bottom: 2px solid var(--c-ecdcae-edge); padding: 1px 3px; }
td { padding: 1px 3px; border-bottom: 1px solid var(--c-f1e6c4-edge); }
.item { width: 1%; padding-right: 6px; }
.icon { position: relative; display: grid; place-items: center; width: 32px; height: 34px; background: var(--pot-icon-bg); border: 2px solid var(--c-d9c48a-edge); border-radius: 6px; }
.icon img { display: block; image-rendering: pixelated; }
.fallback { max-width: 28px; overflow: hidden; font-size: 8px; line-height: 1; text-align: center; word-break: break-all; }
tr.idle .icon img { opacity: 0.45; filter: grayscale(0.6); }
.num { text-align: right; }
.used { font-weight: 800; color: var(--c-2e9a1f-text); }
small.netmeso { display: block; font-size: 10px; line-height: 1.1; color: var(--c-c0392b-text); }
small.netmeso.up { color: var(--c-1f6fc4-text); }
.netcol.down { color: var(--c-c0392b-text); }
.netcol.up { color: var(--c-1f6fc4-text); }
tr.idle td { color: var(--c-8f7a55-text); }
</style>
