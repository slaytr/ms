<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { isFixtureUploadEnabled, saveFixture } from '../lib/fixtures';

const props = defineProps<{ video: HTMLVideoElement | null; sharing: boolean; tracking: boolean }>();
const emit = defineEmits<{ share: []; unshare: [] }>();

const PRESETS = [
  { value: 'inventory-open', text: 'Inventory open (meso visible)' },
  { value: 'inventory-closed', text: 'Inventory closed' },
  { value: 'other', text: 'Other' },
] as const;
const AUTO_INTERVAL_MS = 8_000;

const enabled = ref(false);
const label = ref<string>(PRESETS[0].value);
const saved = ref<readonly string[]>([]);
const error = ref<string | null>(null);
const auto = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

async function save() {
  if (!props.video) return;
  try {
    error.value = null;
    const file = await saveFixture(props.video, label.value);
    saved.value = [file, ...saved.value].slice(0, 12);
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}

function toggleAuto() {
  auto.value = !auto.value;
  if (timer) clearInterval(timer);
  timer = auto.value ? setInterval(() => void save(), AUTO_INTERVAL_MS) : null;
}

onMounted(async () => {
  enabled.value = await isFixtureUploadEnabled();
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section v-if="enabled" class="card">
    <h2>Capture fixtures <span class="tag">dev</span></h2>
    <p class="muted">
      Saves lossless, full-resolution frames to <code>fixtures/</code> on this machine so detection can be tuned to your
      client. Take several: inventory open and closed, and at different window sizes or UI scales. The filename records the
      resolution.
    </p>

    <div class="row">
      <button v-if="!sharing" :disabled="tracking" @click="emit('share')">Share screen</button>
      <button v-else-if="!tracking" class="secondary" @click="emit('unshare')">Stop sharing</button>

      <select v-model="label" aria-label="Frame type">
        <option v-for="p in PRESETS" :key="p.value" :value="p.value">{{ p.text }}</option>
      </select>
      <button :disabled="!sharing" @click="save">Save frame</button>
      <button class="secondary" :disabled="!sharing" @click="toggleAuto">
        {{ auto ? 'Stop auto-save' : `Auto-save every ${AUTO_INTERVAL_MS / 1000}s` }}
      </button>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ul v-if="saved.length" class="saved">
      <li v-for="f in saved" :key="f">{{ f }}</li>
    </ul>
  </section>
</template>

<style scoped>
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-top: 16px; }
h2 { margin: 0 0 6px; font-size: 1.05rem; }
.tag { font-size: 11px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); vertical-align: middle; }
.muted { color: var(--muted); margin: 0 0 12px; font-size: 14px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); font: inherit; }
button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--accent); color: #fff; cursor: pointer; font: inherit; }
button.secondary { background: transparent; color: var(--fg); }
button:disabled { opacity: 0.5; cursor: default; }
.error { color: #c0392b; margin: 8px 0 0; }
.saved { margin: 10px 0 0; padding-left: 18px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
</style>
