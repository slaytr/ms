<script setup lang="ts">
import type { PotView } from '../lib/pot-tracker';

/**
 * Pot use from the Use tab: what's left of each item, how many were used since the count started, and
 * the mesos spent and HP/MP restored. Presentation only; the numbers come from lib/pot-tracker.ts.
 */
defineProps<{ pots: PotView | null }>();
defineEmits<{ rescan: []; repot: [] }>();

const fmt = (n: number) => Math.round(n).toLocaleString();
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

    <p v-if="!pots" class="note">Open your inventory on the <strong>Use</strong> tab, scrolled to the top, and we'll count your pots from there.</p>

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
          <tr><th>Item</th><th class="num">Left</th><th class="num">Used</th><th class="num">Mesos</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in pots.rows" :key="row.id" :class="{ idle: row.used === 0 }">
            <td>{{ row.name }}</td>
            <td class="num" :title="row.stale ? 'Last good reading: this count isn\'t readable right now' : undefined">{{ row.now === null ? '—' : fmt(row.now) }}{{ row.stale ? '?' : '' }}</td>
            <td class="num used">{{ row.used > 0 ? fmt(row.used) : '·' }}</td>
            <td class="num meso" :title="row.used > 0 && row.mesos === null ? 'No NPC sells this, so its cost is not known' : undefined">
              {{ row.used === 0 ? '' : row.mesos === null ? '?' : fmt(row.mesos) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="pots.paused" class="note paused">Paused for repotting. Restock, then press <strong>Resume</strong>. Nothing in your inventory counts until then.</p>
      <p v-if="pots.totals.percentItemsUsed > 0" class="note">HP/MP for elixirs and other percentage items isn't counted (it depends on your max HP/MP).</p>
      <p v-if="pots.scrolledAway" class="note warn">Your Use tab has scrolled. Scroll it back to where it was to keep counting.</p>
      <p v-if="pots.unreadable.length > 0" class="note warn">Couldn't read every {{ pots.unreadable.join(', ') }} count, so {{ pots.unreadable.length === 1 ? 'it isn\'t' : 'they aren\'t' }} fully counted.</p>
      <p class="note">Counts the visible slots only. Pots you buy or pick up offset the ones you use.</p>
    </template>
  </section>
</template>

<style scoped>
.pots { margin-top: 10px; padding: 6px 8px; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 8px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
h3 { margin: 0; font: 400 1rem / 1.2 'Lilita One', sans-serif; }
.restart { padding: 1px 8px; font: 700 11px / 1.4 'Nunito', sans-serif; color: #4a2a0e; background: #fff; border: 2px solid #d9c48a; border-radius: 999px; cursor: pointer; }
.buttons { display: inline-flex; gap: 4px; }
.restart.on { background: #5cc23e; border-color: #2c7d18; color: #fff; }
.restart:hover { background: #ffe6a0; }
.restart.on:hover { background: #4aa82e; }
.restart:focus-visible { outline: 3px solid #4a2a0e; outline-offset: 2px; }
.note { margin: 4px 0 0; font-size: 11px; color: #6b4a22; }
.note.warn { color: #a23a00; }
.note.paused { padding: 3px 6px; color: #2c5d18; background: #eaf8dd; border-radius: 6px; }
.summary { margin: 4px 0 6px; font-variant-numeric: tabular-nums; font-size: 12px; }
.summary strong { font: 400 1.3rem / 1.1 'Lilita One', sans-serif; color: #2e9a1f; }
.dot { margin: 0 4px; color: #8f7a55; }
.meso { color: #b07a00; }
.hp { color: #c0392b; }
.mp { color: #1f6fc4; }
table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-size: 10px; color: #6b4a22; border-bottom: 2px solid #ecdcae; padding: 1px 3px; }
td { padding: 1px 3px; border-bottom: 1px solid #f1e6c4; }
.num { text-align: right; }
.used { font-weight: 800; color: #2e9a1f; }
tr.idle td { color: #8f7a55; }
</style>
