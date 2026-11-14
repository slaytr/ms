<script setup lang="ts">
import { computed } from 'vue';

import { coverageTotals, detectionCoverage, type AreaCoverage } from '../lib/detect/coverage';
import { DEFAULT_INVENTORY_TEMPLATES } from '../lib/detect/default-inventory-templates';
import { DEFAULT_TEMPLATES } from '../lib/detect/default-templates';
import raw from '../lib/detect/templates.json';
import { parseTemplates } from '../lib/detect/templates';

/**
 * Which characters of each on-screen font the detector has actually measured, which only have a hand-drawn
 * guess, and which it has never seen. A missing one makes that part of the screen read as unreadable, so this
 * is the list of frames worth capturing next. Developer view for /testing; reads the same templates the app ships.
 */
const areas = computed<readonly AreaCoverage[]>(() =>
  detectionCoverage(parseTemplates(raw), DEFAULT_TEMPLATES, {
    digits: DEFAULT_INVENTORY_TEMPLATES.digits,
    quickDigits: DEFAULT_INVENTORY_TEMPLATES.quickDigits,
  }),
);
const totals = computed(() => coverageTotals(areas.value));
const unfinished = computed(() => areas.value.filter((a) => a.missing.length > 0 || a.drafted.length > 0));

type Chip = { readonly char: string; readonly state: 'real' | 'drafted' | 'missing' };
const chipsOf = (area: AreaCoverage): readonly Chip[] =>
  [
    ...area.real.map((char): Chip => ({ char, state: 'real' })),
    ...area.drafted.map((char): Chip => ({ char, state: 'drafted' })),
    ...area.missing.map((char): Chip => ({ char, state: 'missing' })),
  ].sort((a, b) => a.char.localeCompare(b.char));

</script>

<template>
  <section class="card coverage">
    <h2>Detection coverage</h2>
    <p class="muted small">
      What the detector can read from each part of the game screen. <span class="key real">measured</span> was learned from a
      real frame, <span class="key drafted">drafted</span> is only a hand-drawn guess, <span class="key missing">missing</span>
      reads as unreadable until a frame showing it is labelled and harvested.
    </p>
    <p class="summary">
      {{ totals.real }} measured · {{ totals.drafted }} drafted · <strong>{{ totals.missing }} missing</strong>
      <span class="muted small"> (fixed character lists only; names and maps can show any letter)</span>
    </p>

    <ul class="todo" v-if="unfinished.length > 0" aria-label="Still missing">
      <li v-for="area in unfinished" :key="area.id">
        <strong>{{ area.label }}</strong>:
        <template v-if="area.missing.length > 0">missing <code>{{ area.missing.join(' ') }}</code></template>
        <template v-if="area.missing.length > 0 && area.drafted.length > 0">; </template>
        <template v-if="area.drafted.length > 0">only drafted <code>{{ area.drafted.join(' ') }}</code></template>
      </li>
    </ul>
    <p v-else class="muted small">Every listed character has been measured.</p>

    <div v-for="area in areas" :key="area.id" class="area">
      <h3>
        {{ area.label }}
        <span class="count">{{ area.real.length }}/{{ area.real.length + area.drafted.length + area.missing.length }} measured<template v-if="area.openEnded">, open ended</template></span>
      </h3>
      <p class="muted small where">{{ area.where }}</p>
      <ul class="chips">
        <li v-for="chip in chipsOf(area)" :key="chip.char" :class="chip.state" :title="chip.state === 'real' ? 'measured' : chip.state === 'drafted' ? 'drafted guess only' : 'missing'">
          {{ chip.char }}
        </li>
      </ul>
    </div>

    <h3>Other areas not read yet</h3>
    <ul class="notes small muted">
      <li>Only the inventory's <strong>Use</strong> tab is read for pots. Equip, Set-up, Etc and Cash tabs are not.</li>
      <li>Quick-slot counts have only been learned from a few potions; a newly hotkeyed item finds its icon at once but its count needs a labelled frame first.</li>
      <li>Windows display scaling above 100% changes the window frame sizes the scaled-window fit assumes.</li>
    </ul>
  </section>
</template>

<style scoped>
.coverage { margin-top: 16px; }
h2 { margin: 0 0 6px; }
h3 { margin: 16px 0 2px; font-size: 1rem; }
.count { margin-left: 8px; font-size: 0.8rem; font-weight: 400; color: var(--muted, #6b7280); }
.where { margin: 0 0 6px; }
.summary { margin: 4px 0 8px; }
.small { font-size: 0.85rem; }
.muted { color: var(--muted, #6b7280); }
.key { padding: 0 6px; border-radius: 4px; font-size: 0.8rem; }
.todo { margin: 0 0 8px; padding-left: 1.2rem; }
.todo code { font-size: 0.9rem; letter-spacing: 0.05em; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.chips li { min-width: 1.9rem; padding: 3px 6px; text-align: center; font: 600 0.9rem ui-monospace, monospace; border: 1px solid transparent; border-radius: 6px; }
.real, .chips .real { background: #dff3df; color: #1d6b1d; border-color: #9ccf9c; }
.drafted, .chips .drafted { background: #fff1cf; color: #8a5a00; border-color: #e6c36a; border-style: dashed; }
.missing, .chips .missing { background: #fde4e1; color: #a1281a; border-color: #e59a92; }
.notes { margin: 4px 0 0; padding-left: 1.2rem; }
@media (prefers-color-scheme: dark) {
  .real, .chips .real { background: #1f3a1f; color: #a6e0a6; border-color: #3f6f3f; }
  .drafted, .chips .drafted { background: #3d3216; color: #f0cf7a; border-color: #8a6f2a; }
  .missing, .chips .missing { background: #43201c; color: #f3a79e; border-color: #8a3f37; }
}
</style>
