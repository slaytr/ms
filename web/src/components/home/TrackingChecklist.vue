<script setup lang="ts">
import { computed } from 'vue';

import type { Detection } from '../../lib/detect/detect.ts';
import type { Health, TrackingHealth } from '../../lib/health';
import LevelBadge from './LevelBadge.vue';

const props = defineProps<{
  health: TrackingHealth;
  detection: Detection | null;
  /** Best known name: read from the screen, or typed in earlier by the player. */
  name: string | null;
}>();

const fmt = (n: number) => n.toLocaleString();
const statusWord: Record<Health, string> = { ok: 'Confirmed', unreadable: 'Needs attention', missing: 'Not found yet' };

const job = computed(() => props.detection?.character.job ?? null);
const exp = computed(() => props.detection?.exp ?? null);
const expPct = computed(() => props.detection?.expPct ?? null);
const meso = computed(() => props.detection?.meso ?? null);
</script>

<template>
  <ul class="list">
    <li class="row" :class="health.window">
      <span class="icon" aria-hidden="true" />
      <span class="label">Game window</span>
      <span class="value">{{ health.window === 'ok' ? 'Receiving video' : 'Waiting for video' }}</span>
      <span class="sr">{{ statusWord[health.window] }}</span>
    </li>

    <li class="row" :class="health.character">
      <span class="icon" aria-hidden="true" />
      <span class="label">Character</span>
      <span class="value">
        <template v-if="health.character === 'ok'">
          <strong>{{ name }}</strong><span v-if="job" class="job">{{ job }}</span>
        </template>
        <template v-else-if="health.character === 'unreadable'">Found you, but can't read the name yet</template>
        <template v-else>Looking for your name plate</template>
      </span>
      <span class="sr">{{ statusWord[health.character] }}</span>
    </li>

    <li class="row" :class="health.level">
      <span class="icon" aria-hidden="true" />
      <span class="label">Level</span>
      <span class="value">
        <template v-if="health.level === 'ok'">
          <LevelBadge :level="detection?.level ?? null" />
          <span v-if="detection?.levelInferred" class="job">worked out from your EXP</span>
        </template>
        <template v-else-if="health.level === 'unreadable'">Found, but this level isn't recognised yet</template>
        <template v-else>Looking for your level</template>
      </span>
      <span class="sr">{{ statusWord[health.level] }}</span>
    </li>

    <li class="row" :class="health.exp">
      <span class="icon" aria-hidden="true" />
      <span class="label">EXP</span>
      <span class="value">
        <template v-if="health.exp === 'ok' && exp !== null">
          <strong>{{ fmt(exp) }}</strong><span v-if="expPct !== null" class="job">{{ expPct.toFixed(2) }}%</span>
        </template>
        <template v-else-if="health.exp === 'unreadable'">Found, but some digits aren't recognised yet</template>
        <template v-else>Looking for your EXP bar</template>
      </span>
      <span class="sr">{{ statusWord[health.exp] }}</span>
    </li>

    <li class="row" :class="[health.meso, { optional: health.meso === 'missing' }]">
      <span class="icon" aria-hidden="true" />
      <span class="label">Meso <span class="tag">optional</span></span>
      <span class="value">
        <template v-if="health.meso === 'ok' && meso !== null"><strong>{{ fmt(meso) }}</strong></template>
        <template v-else-if="health.meso === 'unreadable'">Found, but some digits aren't recognised yet</template>
        <template v-else>Optional. Open your inventory to track meso and pots.</template>
      </span>
      <span class="sr">{{ health.meso === 'missing' ? 'Optional, inventory not open' : statusWord[health.meso] }}</span>
    </li>
  </ul>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.row {
  display: grid;
  grid-template-columns: 28px 6.5rem 1fr;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #fffdf3;
  border: 2px solid #d9c48a;
  border-radius: 10px;
  min-height: 3rem;
}
.label { font-weight: 800; }
.value { color: #6b4a22; font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
.value strong { color: #4a2a0e; font-weight: 800; margin-right: 0.6em; }
.job { color: #6b4a22; }
.icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font: 400 15px/1 'Lilita One', sans-serif;
  color: #fff;
  background: #c9b88e;
  border: 2px solid #8f7a48;
}
.row.ok { border-color: #6cc24a; background: #f4ffe9; }
.row.ok .icon { background: #44b02a; border-color: #2c7d18; animation: pop 0.35s ease-out; }
.row.ok .icon::after { content: '\2713'; }
.row.unreadable { border-color: #f0b030; background: #fff8e0; }
.row.unreadable .icon { background: #f0a000; border-color: #b36f00; }
.row.unreadable .icon::after { content: '!'; }
.row.optional { border-style: dashed; background: transparent; }
.row.optional .label, .row.optional .value { color: #8f7a55; }
.tag { margin-left: 0.3em; padding: 0 6px; font: 700 0.7rem / 1.5 'Nunito', sans-serif; color: #6b4a22; background: #f1e6c4; border-radius: 999px; vertical-align: middle; }
.row.missing .icon::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: 0.8; }
@keyframes pop { 0% { transform: scale(0.4); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 520px) {
  .row { grid-template-columns: 28px 1fr; }
  .label { grid-column: 2; }
  .value { grid-column: 2; }
}
@media (prefers-reduced-motion: reduce) { .row.ok .icon { animation: none; } }
</style>
