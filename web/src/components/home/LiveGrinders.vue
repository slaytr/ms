<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type { LiveGrinder } from '../../lib/api';
import CharacterAvatar from './CharacterAvatar.vue';
import LevelBadge from './LevelBadge.vue';

/**
 * A small carousel of whoever is grinding right now: avatar, name, level, EXP% and EXP gained this
 * session. It turns by itself every few seconds and pauses while hovered or focused. Presentation only.
 */
const props = defineProps<{ grinders: readonly LiveGrinder[] }>();

const SLIDE_MS = 5000;
const index = ref(0);
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const count = computed(() => props.grinders.length);
const current = computed(() => props.grinders[Math.min(index.value, count.value - 1)] ?? null);

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`);

function go(next: number): void {
  if (count.value === 0) return;
  index.value = (next + count.value) % count.value;
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function start(): void {
  stop();
  if (count.value < 2) return;
  timer = setInterval(() => {
    if (!paused.value) go(index.value + 1);
  }, SLIDE_MS);
}

// The list shrinks and grows as people start and stop: keep the position valid and the timer right.
watch(
  count,
  (now) => {
    if (index.value >= now) index.value = 0;
    start();
  },
  { immediate: true },
);
onBeforeUnmount(stop);
</script>

<template>
  <section
    v-if="current"
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
      <button v-if="count > 1" class="nav" type="button" aria-label="Previous player" @click="go(index - 1)">‹</button>
      <div class="card" aria-live="polite">
        <CharacterAvatar :name="current.player" small />
        <div class="info">
          <p class="who">{{ current.player }}</p>
          <p class="meta">
            <LevelBadge :level="current.level" />
            <span class="pct">{{ pct(current.pct) }}</span>
          </p>
          <p class="gain">+{{ fmt(current.expGained) }} EXP</p>
        </div>
      </div>
      <button v-if="count > 1" class="nav" type="button" aria-label="Next player" @click="go(index + 1)">›</button>
    </div>

    <div v-if="count > 1" class="dots">
      <button
        v-for="(g, i) in grinders"
        :key="g.id"
        type="button"
        class="pip"
        :class="{ on: i === index }"
        :aria-label="`Show ${g.player}`"
        @click="go(i)"
      />
    </div>
  </section>
</template>

<style scoped>
.live {
  --ink: #4a2a0e;
  max-width: 20rem;
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

.row { display: flex; align-items: center; gap: 6px; }
.card { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 6px 8px; background: #fffdf3; border: 2px solid #d9c48a; border-radius: 10px; }
.info { min-width: 0; }
.who { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 1.15rem/1.2 'Lilita One', sans-serif; }
.meta { display: flex; align-items: center; gap: 8px; margin: 0; }
.pct { font-variant-numeric: tabular-nums; color: #6b4a22; }
.gain { margin: 0; font: 400 1.05rem/1.2 'Lilita One', sans-serif; color: #2e9a1f; font-variant-numeric: tabular-nums; }

.nav { flex: none; width: 26px; height: 40px; font: 400 1.4rem/1 'Lilita One', sans-serif; color: var(--ink); background: #ecdcae; border: 2px solid var(--ink); border-radius: 8px; cursor: pointer; }
.nav:focus-visible, .pip:focus-visible { outline: 3px solid #2f8fe0; outline-offset: 2px; }

.dots { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
.pip { width: 9px; height: 9px; padding: 0; background: #ecdcae; border: 2px solid var(--ink); border-radius: 50%; cursor: pointer; }
.pip.on { background: #3fa02a; }

@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
</style>
