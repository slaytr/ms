<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type { LiveGrinder } from '../../lib/api';
import { formatCompact } from '../../lib/format';
import CharacterAvatar from './CharacterAvatar.vue';
import LevelBadge from './LevelBadge.vue';

/**
 * Whoever is grinding right now, up to five side by side: avatar, name, level, EXP% and EXP gained this
 * session. With more than five it becomes a carousel of pages of five, turning by itself every few
 * seconds and pausing while hovered or focused. Presentation only.
 */
const props = defineProps<{ grinders: readonly LiveGrinder[] }>();

const PER_PAGE = 5;
const SLIDE_MS = 5000;
const page = ref(0);
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const count = computed(() => props.grinders.length);
const pages = computed(() => Math.max(1, Math.ceil(count.value / PER_PAGE)));
const visible = computed(() => props.grinders.slice(page.value * PER_PAGE, (page.value + 1) * PER_PAGE));

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`);

function go(next: number): void {
  page.value = (next + pages.value) % pages.value;
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function start(): void {
  stop();
  if (pages.value < 2) return;
  timer = setInterval(() => {
    if (!paused.value) go(page.value + 1);
  }, SLIDE_MS);
}

// The list shrinks and grows as people start and stop: keep the page valid and the timer right.
watch(
  pages,
  (now) => {
    if (page.value >= now) page.value = 0;
    start();
  },
  { immediate: true },
);
onBeforeUnmount(stop);
</script>

<template>
  <section
    v-if="count > 0"
    class="live"
    aria-label="Grinding right now"
    aria-roledescription="carousel"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <p class="head"><span class="dot" aria-hidden="true" />Grinding now · {{ count }}</p>

    <div class="row">
      <button v-if="pages > 1" class="nav" type="button" aria-label="Previous players" @click="go(page - 1)">‹</button>
      <ul class="cards" :style="{ '--n': Math.min(count, PER_PAGE) }" aria-live="polite">
        <li v-for="g in visible" :key="g.id" class="card">
          <CharacterAvatar :name="g.player" small />
          <p class="who" :title="g.player">{{ g.player }}</p>
          <LevelBadge :level="g.level" />
          <p class="pct">{{ pct(g.pct) }}</p>
          <p class="gain" :title="g.estimated ? 'Estimated from the EXP bar percent' : undefined">{{ g.estimated ? '~' : '' }}+{{ fmt(g.expGained) }}</p>
          <p class="rate" title="Average EXP per hour this session">{{ g.expPerHour === null ? '—' : `${g.estimated ? '~' : ''}${formatCompact(g.expPerHour)}/h` }}</p>
        </li>
      </ul>
      <button v-if="pages > 1" class="nav" type="button" aria-label="Next players" @click="go(page + 1)">›</button>
    </div>

    <div v-if="pages > 1" class="dots">
      <button
        v-for="i in pages"
        :key="i"
        type="button"
        class="pip"
        :class="{ on: i - 1 === page }"
        :aria-label="`Show page ${i}`"
        @click="go(i - 1)"
      />
    </div>
  </section>
</template>

<style scoped>
.live {
  --ink: #4a2a0e;
  /* As wide as its cards need (one to five of them), never wider than the page. */
  width: fit-content;
  max-width: 100%;
  margin: 0 auto 0.9rem;
  padding: 8px 10px 10px;
  background: #fff6dc;
  color: var(--ink);
  border: 3px solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 5px 0 rgba(74, 42, 14, 0.3);
  font: 700 14px/1.3 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
}
.head { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 6px; font: 400 1rem/1 'Lilita One', sans-serif; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #3fa02a; box-shadow: 0 0 0 0 rgba(63, 160, 42, 0.6); animation: ping 1.8s infinite; }
@keyframes ping { 70% { box-shadow: 0 0 0 8px rgba(63, 160, 42, 0); } 100% { box-shadow: 0 0 0 0 rgba(63, 160, 42, 0); } }

.row { display: flex; align-items: center; justify-content: center; gap: 6px; }
/* Width follows the number of players (--n, at most one page), so a last page with fewer cards doesn't resize the box. */
.cards { --card: 6.5rem; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: calc(var(--n) * var(--card) + (var(--n) - 1) * 6px); max-width: 100%; min-width: 0; margin: 0; padding: 0; list-style: none; }
.card { flex: none; width: var(--card); min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 10px; text-align: center; }
.who { max-width: 100%; margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 1rem/1.2 'Lilita One', sans-serif; }
.pct { margin: 0; font-size: 12px; font-variant-numeric: tabular-nums; color: #6b4a22; }
.rate { margin: 0; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; color: #6b4a22; }
.gain { margin: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; font: 400 0.95rem/1.2 'Lilita One', sans-serif; color: #2e9a1f; font-variant-numeric: tabular-nums; }
.card :deep(.badge) { transform: scale(0.75); transform-origin: center; margin: -3px 0; }
@media (max-width: 520px) { .cards { --card: 5.4rem; } }

.nav { flex: none; width: 26px; height: 40px; font: 400 1.4rem/1 'Lilita One', sans-serif; color: var(--ink); background: #ecdcae; border: 2px solid var(--ink); border-radius: 8px; cursor: pointer; }
.nav:focus-visible, .pip:focus-visible { outline: 3px solid #2f8fe0; outline-offset: 2px; }

.dots { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
.pip { width: 9px; height: 9px; padding: 0; background: #ecdcae; border: 2px solid var(--ink); border-radius: 50%; cursor: pointer; }
.pip.on { background: #3fa02a; }

@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
</style>
