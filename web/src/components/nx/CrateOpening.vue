<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { planFor } from '../../lib/open-fx';

const props = defineProps<{
  crateIconId: number;
  itemId: number;
  itemName: string;
  rate: number;
  /** Every item the crate can hold, flipped through on the reel. */
  pool: readonly number[];
  /** Items opened together; the show is for the rarest. */
  count: number;
}>();
const emit = defineEmits<{ done: [] }>();

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const plan = computed(() => {
  const base = planFor(props.rate);
  return reduced ? { ...base, shakeMs: 100, spinSteps: 3, holdMs: 800, particles: 0, rays: false, flash: false } : base;
});

const phase = ref<'shake' | 'spin' | 'locked'>('shake');
const shown = ref(props.itemId);
/** 0 = just started (fast, blurred) .. 1 = about to lock (slow, sharp). */
const slow = ref(0);
const timers: number[] = [];
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

/** Reel faces: the pool in a walk that never repeats back to back, ending on the real item. */
function faces(steps: number): number[] {
  const others = props.pool.filter((id) => id !== props.itemId);
  const out: number[] = [];
  for (let i = 0; i < steps - 1; i++) out.push(others.length > 0 ? others[(i * 7 + 3) % others.length] : props.itemId);
  out.push(props.itemId);
  return out;
}

const bits = computed(() =>
  Array.from({ length: plan.value.particles }, (_, i) => {
    const angle = (i / plan.value.particles) * 360 + (i % 3) * 7;
    const dist = 90 + ((i * 37) % 90);
    return { key: i, style: { '--a': `${angle}deg`, '--d': `${dist}px`, '--s': `${6 + ((i * 5) % 8)}px`, '--t': `${(i % 7) * 40}ms` } };
  }),
);
/** Four-point twinkles around the slot once it locks. */
const stars = computed(() =>
  Array.from({ length: Math.round(plan.value.particles / 4) + 3 }, (_, i) => ({
    key: i,
    style: { left: `${8 + ((i * 53) % 84)}%`, top: `${6 + ((i * 29) % 80)}%`, '--w': `${10 + ((i * 7) % 14)}px`, '--t': `${(i * 110) % 900}ms` },
  })),
);

const finish = () => emit('done');

function spin(list: number[], i: number) {
  shown.value = list[i];
  slow.value = i / list.length;
  if (i === list.length - 1) {
    phase.value = 'locked';
    later(finish, plan.value.holdMs);
    return;
  }
  later(() => spin(list, i + 1), 40 + slow.value ** 3 * 320);
}

onMounted(() =>
  later(() => {
    phase.value = 'spin';
    spin(faces(plan.value.spinSteps), 0);
  }, plan.value.shakeMs),
);
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));
</script>

<template>
  <div class="fx" :class="[`t-${plan.tier}`, phase]" :style="{ '--c': plan.color, '--shake': `${plan.shakeMs}ms` }" role="presentation" @click="finish">
    <div v-if="plan.flash && phase === 'locked'" class="flash" />
    <div v-if="plan.rays && phase === 'locked'" class="rays" />
    <div class="stage">
      <img v-if="phase === 'shake'" class="crate" :src="`/nx/${crateIconId}.png`" alt="" draggable="false" />
      <template v-else>
        <div v-if="phase === 'locked'" class="glow" />
        <template v-if="phase === 'locked'"><span v-for="b in bits" :key="b.key" class="bit" :style="b.style" /></template>
        <div class="slot" :class="{ fast: slow < 0.5 }">
          <img class="item" :class="{ lock: phase === 'locked' }" :src="`/nx/${shown}.png`" alt="" draggable="false" />
        </div>
        <template v-if="phase === 'locked'">
          <span v-for="s in stars" :key="`s${s.key}`" class="star" :style="s.style" />
          <p class="label">{{ itemName }}<small v-if="count > 1"> + {{ count - 1 }} more</small></p>
          <p class="rate">{{ rate }}% drop</p>
        </template>
      </template>
    </div>
    <p class="skip">Click to skip</p>
  </div>
</template>

<style scoped>
.fx { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(20, 14, 6, 0.72); cursor: pointer; overflow: hidden; animation: fade 0.2s ease-out; }
.stage { position: relative; display: grid; place-items: center; justify-items: center; width: 320px; height: 320px; }
.crate { image-rendering: pixelated; transform: scale(4); animation: shake var(--shake) ease-in-out forwards; }
.t-epic .crate, .t-legendary .crate { filter: drop-shadow(0 0 14px var(--c)); }

.slot { position: relative; z-index: 2; display: grid; place-items: center; width: 150px; height: 150px; background: linear-gradient(#fffdf0, #e9dfbd); border: 4px solid #4a2a0e; border-radius: 14px; box-shadow: inset 0 0 0 3px #fff6, 0 6px 0 #00000055; overflow: hidden; }
.t-legendary .slot, .t-epic .slot { border-color: var(--c); box-shadow: 0 0 22px var(--c), inset 0 0 0 3px #fff6; }
.item { image-rendering: pixelated; transform: scale(2.6); }
.slot.fast .item { filter: blur(1.5px); animation: flick 0.08s linear infinite; }
.item.lock { animation: lock 0.55s cubic-bezier(0.2, 1.8, 0.4, 1) both; }

.glow { position: absolute; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(var(--c), transparent 70%); opacity: 0.8; animation: glow 0.8s ease-out both; }
.t-common .glow { opacity: 0.35; }
.label { position: absolute; bottom: 0; margin: 0; z-index: 3; color: #fff; font: 400 20px/1.1 'Lilita One', sans-serif; text-shadow: 0 2px 0 #000; text-align: center; animation: rise 0.4s 0.2s both; }
.label small { font-size: 14px; color: #ffe9a8; }
.rate { position: absolute; bottom: -22px; margin: 0; color: var(--c); font-size: 14px; text-shadow: 0 1px 0 #000; animation: rise 0.4s 0.3s both; }
.skip { position: absolute; bottom: 18px; margin: 0; color: #fff9; font-size: 12px; }

.bit { position: absolute; width: var(--s); height: var(--s); background: var(--c); border-radius: 50%; box-shadow: 0 0 8px var(--c); animation: burst 1s var(--t) ease-out both; }
.star { position: absolute; z-index: 4; width: var(--w); height: var(--w); background: #fff; clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); filter: drop-shadow(0 0 4px var(--c)); animation: twinkle 0.9s var(--t) ease-in-out infinite; }
.rays { position: absolute; width: 1400px; height: 1400px; opacity: 0.55; background: repeating-conic-gradient(from 0deg, var(--c) 0 6deg, transparent 6deg 24deg); mask-image: radial-gradient(circle, #000 0, transparent 60%); -webkit-mask-image: radial-gradient(circle, #000 0, transparent 60%); animation: spin 8s linear infinite, fade 0.6s ease-out; }
.flash { position: absolute; inset: 0; background: #fff; animation: flash 0.7s ease-out forwards; pointer-events: none; }
.t-legendary.shake { animation: quake 0.12s linear infinite; }

@keyframes fade { from { opacity: 0; } }
@keyframes shake {
  0% { transform: scale(4) rotate(0); }
  20% { transform: scale(4.1) rotate(-7deg); }
  40% { transform: scale(4.3) rotate(7deg); }
  60% { transform: scale(4.5) rotate(-10deg); }
  80% { transform: scale(4.7) rotate(10deg); }
  100% { transform: scale(5) rotate(0); }
}
@keyframes flick { 0% { translate: 0 -14px; } 100% { translate: 0 14px; } }
@keyframes lock { 0% { transform: scale(2); } 100% { transform: scale(2.6); } }
@keyframes glow { from { transform: scale(0.2); opacity: 0; } }
@keyframes rise { from { opacity: 0; translate: 0 10px; } }
@keyframes burst { from { transform: rotate(var(--a)) translateX(0); opacity: 1; } to { transform: rotate(var(--a)) translateX(var(--d)); opacity: 0; } }
@keyframes twinkle { 0%, 100% { transform: scale(0) rotate(0); opacity: 0; } 50% { transform: scale(1) rotate(45deg); opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes flash { from { opacity: 1; } to { opacity: 0; } }
@keyframes quake { 0%, 100% { transform: translate(0); } 25% { transform: translate(-3px, 2px); } 50% { transform: translate(3px, -2px); } 75% { transform: translate(-2px, -3px); } }
</style>
