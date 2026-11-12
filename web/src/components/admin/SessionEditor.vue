<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import { snapshotForm, snapshotPatch, type SnapshotForm } from '../../lib/admin';
import { adminApi, type AdminCharacter, type AdminSession, type SessionPatch } from '../../lib/admin-api';
import { computeRates } from '../../lib/metrics';
import ReadingsTable from './ReadingsTable.vue';

const props = defineProps<{ token: string; sessionId: string }>();
const emit = defineEmits<{ changed: [removed: boolean] }>();

const session = ref<AdminSession | null>(null);
const characters = ref<readonly AdminCharacter[]>([]);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);

const details = reactive({ label: '', player: '', job: '', fingerprint: '', saveToCharacter: false });
const start = reactive<SnapshotForm>(snapshotForm(null));
const end = reactive<SnapshotForm>(snapshotForm(null));

const numberFields = [
  { key: 'level', label: 'Level' },
  { key: 'exp', label: 'EXP' },
  { key: 'expPct', label: 'EXP %' },
  { key: 'meso', label: 'Meso' },
] as const;

/** Gains as the Maps/Characters pages will compute them from the readings as they stand now. */
const gains = computed(() => (session.value && session.value.readings.length > 1 ? computeRates(session.value.readings) : null));
const fmt = (n: number) => Math.round(n).toLocaleString();

function fill(loaded: AdminSession) {
  const first = loaded.snapshots.start;
  details.label = loaded.label;
  details.player = first?.name ?? loaded.snapshots.end?.name ?? loaded.character ?? loaded.identity?.name ?? '';
  details.job = first?.job ?? loaded.snapshots.end?.job ?? loaded.identity?.job ?? '';
  details.fingerprint = loaded.fingerprint ?? '';
  details.saveToCharacter = false;
  Object.assign(start, snapshotForm(first));
  Object.assign(end, snapshotForm(loaded.snapshots.end));
}

async function load() {
  try {
    const [loaded, chars] = await Promise.all([adminApi.getSession(props.token, props.sessionId), adminApi.listCharacters(props.token)]);
    session.value = loaded;
    characters.value = chars;
    fill(loaded);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load the session.';
  }
}

function buildPatch(loaded: AdminSession): { patch: SessionPatch; errors: readonly string[] } {
  const name = details.player.trim();
  const job = details.job.trim();
  const startResult = snapshotPatch(loaded.snapshots.start, { ...start, name, job });
  // The closing snapshot is only given the player's name/job when it exists (or the admin fills it in).
  const endTouched = loaded.snapshots.end !== null || numberFields.some((f) => end[f.key].trim() !== '');
  const endResult = snapshotPatch(loaded.snapshots.end, endTouched ? { ...end, name, job } : end);

  const patch: SessionPatch = {};
  const label = details.label.trim();
  if (label !== loaded.label) patch.label = label;
  if (name && name !== loaded.character) patch.character = name;
  const fingerprint = details.fingerprint.trim() || null;
  if (fingerprint !== loaded.fingerprint) patch.fingerprint = fingerprint;
  if (Object.keys(startResult.patch).length > 0) patch.start = startResult.patch;
  if (Object.keys(endResult.patch).length > 0) patch.end = endResult.patch;
  return { patch, errors: [...startResult.errors, ...endResult.errors] };
}

async function save() {
  if (!session.value) return;
  error.value = null;
  notice.value = null;
  const { patch, errors } = buildPatch(session.value);
  if (errors.length > 0) {
    error.value = errors.join(' ');
    return;
  }
  const fingerprint = details.fingerprint.trim();
  const alsoCharacter = details.saveToCharacter && fingerprint !== '' && details.player.trim() !== '';
  if (Object.keys(patch).length === 0 && !alsoCharacter) {
    notice.value = 'Nothing changed.';
    return;
  }
  saving.value = true;
  try {
    if (Object.keys(patch).length > 0) await adminApi.patchSession(props.token, props.sessionId, patch);
    if (alsoCharacter) {
      await adminApi.saveCharacter(props.token, fingerprint, {
        name: details.player.trim(),
        job: details.job.trim() || null,
        applyToSessions: true,
      });
    }
    await load();
    notice.value = 'Saved.';
    emit('changed', false);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Save failed.';
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!session.value || !window.confirm('Delete this whole session and all its readings? This cannot be undone.')) return;
  try {
    await adminApi.deleteSession(props.token, props.sessionId);
    emit('changed', true);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Delete failed.';
  }
}

async function readingsChanged() {
  await load();
  emit('changed', false);
}

onMounted(load);
</script>

<template>
  <section v-if="session" class="editor">
    <h2>{{ details.player || 'Unnamed session' }} <small>{{ session.id }}</small></h2>

    <div class="grid">
      <label>Map <input v-model="details.label" maxlength="80" /></label>
      <label>Player name <input v-model="details.player" maxlength="40" /></label>
      <label>Job <input v-model="details.job" maxlength="80" /></label>
      <label>
        Character fingerprint
        <input v-model="details.fingerprint" list="fingerprints" maxlength="24" placeholder="none" />
        <datalist id="fingerprints">
          <option v-for="c in characters" :key="c.fingerprint" :value="c.fingerprint">{{ c.name ?? 'Unnamed' }} ({{ c.sessions }})</option>
        </datalist>
      </label>
    </div>
    <label class="check">
      <input v-model="details.saveToCharacter" type="checkbox" :disabled="!details.fingerprint.trim() || !details.player.trim()" />
      Also set this name/job on the character (every session with this fingerprint)
    </label>

    <div class="snaps">
      <fieldset>
        <legend>Start</legend>
        <label v-for="f in numberFields" :key="f.key">{{ f.label }} <input v-model="start[f.key]" inputmode="decimal" /></label>
      </fieldset>
      <fieldset>
        <legend>End</legend>
        <label v-for="f in numberFields" :key="f.key">{{ f.label }} <input v-model="end[f.key]" inputmode="decimal" /></label>
      </fieldset>
    </div>

    <div class="actions">
      <button class="primary" :disabled="saving" @click="save">{{ saving ? 'Saving...' : 'Save details' }}</button>
      <button class="danger" @click="remove">Delete session</button>
      <span v-if="notice" class="ok">{{ notice }}</span>
      <span v-if="error" class="err">{{ error }}</span>
    </div>

    <p v-if="gains" class="gains">
      From the readings now: {{ fmt(gains.expGained) }} EXP, {{ gains.expPctGained.toFixed(2) }}%, {{ fmt(gains.mesoGained) }} meso
      over {{ Math.round(gains.elapsedMs / 60000) }} min. Gains come from the readings below; fix those to fix the gains.
    </p>

    <ReadingsTable :token="token" :session-id="sessionId" :readings="session.readings" @changed="readingsChanged" />
  </section>
  <p v-else-if="error" class="err">{{ error }}</p>
  <p v-else class="muted">Loading...</p>
</template>

<style scoped>
.editor { display: grid; gap: 14px; min-width: 0; }
h2 { margin: 0; font-size: 18px; }
h2 small { color: var(--muted); font-weight: 400; font-size: 11px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
label { display: grid; gap: 3px; font-size: 13px; color: var(--muted); }
input { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--fg); min-width: 0; }
.check { display: flex; align-items: center; gap: 8px; }
.snaps { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
fieldset { border: 1px solid var(--border); border-radius: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
button { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer; }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.danger { color: #c0392b; }
button:disabled { opacity: 0.5; cursor: default; }
.ok { color: #27874f; }
.err { color: #c0392b; }
.muted, .gains { color: var(--muted); font-size: 13px; margin: 0; }
@media (max-width: 600px) { .snaps { grid-template-columns: 1fr; } }
</style>
