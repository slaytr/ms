<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { getSession, labelSession, listCharacterSessions, setSessionPartySize, type CharacterSession, type SessionDetail } from '../../lib/api';
import { formatClock, formatPerHour } from '../../lib/format';
import { computeRates, expGainSeries } from '../../lib/metrics';
import { levelRange, sessionDurationMs, sessionTitle } from '../../lib/session-list';
import { cleanSessionName, partyText } from '../../lib/session-input';
import { loadSessionToken } from '../../lib/session-tokens';
import ExpChart from './ExpChart.vue';
import SessionDetailsForm from './SessionDetailsForm.vue';

/** The character's identity hash: the same fingerprint their sessions were saved under. */
const props = defineProps<{ fingerprint: string }>();

const sessions = ref<readonly CharacterSession[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const openId = ref<string | null>(null);
const detail = ref<SessionDetail | null>(null);
const detailError = ref<string | null>(null);

const rates = computed(() => (detail.value ? computeRates(detail.value.readings) : null));
const series = computed(() => (detail.value ? expGainSeries(detail.value.readings) : []));

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const duration = (s: CharacterSession) => {
  const ms = sessionDurationMs(s);
  return ms === null ? null : formatClock(ms);
};
const whole = (n: number) => Math.round(n).toLocaleString();

// Only sessions started in this browser can be edited: the saved owner token is the proof they're yours.
const editError = ref<string | null>(null);

function patchSession(id: string, patch: Partial<CharacterSession>) {
  sessions.value = sessions.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

async function rename(s: CharacterSession, text: string) {
  const token = loadSessionToken(s.id);
  const label = cleanSessionName(text);
  if (!token || !label) return;
  editError.value = null;
  try {
    await labelSession(s.id, token, label);
    patchSession(s.id, { label });
  } catch (cause) {
    editError.value = `Couldn't rename that session: ${(cause as Error).message}`;
  }
}

async function changeParty(s: CharacterSession, size: number) {
  const token = loadSessionToken(s.id);
  if (!token) return;
  editError.value = null;
  try {
    await setSessionPartySize(s.id, token, size);
    patchSession(s.id, { partySize: size });
  } catch (cause) {
    editError.value = `Couldn't save the party size: ${(cause as Error).message}`;
  }
}

async function load(fingerprint: string) {
  loading.value = true;
  error.value = null;
  openId.value = null;
  detail.value = null;
  try {
    sessions.value = await listCharacterSessions(fingerprint);
  } catch {
    sessions.value = [];
    error.value = "Your sessions couldn't load just now.";
  } finally {
    loading.value = false;
  }
}

async function toggle(id: string) {
  if (openId.value === id) {
    openId.value = null;
    detail.value = null;
    return;
  }
  openId.value = id;
  detail.value = null;
  detailError.value = null;
  editError.value = null;
  try {
    const loaded = await getSession(id);
    // The player may have clicked another session while this one loaded.
    if (openId.value === id) detail.value = loaded;
  } catch {
    if (openId.value === id) detailError.value = "That session couldn't load.";
  }
}

watch(() => props.fingerprint, load, { immediate: true });
</script>

<template>
  <div class="mine">
    <p v-if="loading" class="msg">Loading your sessions…</p>
    <p v-else-if="error" class="msg" role="alert">{{ error }}</p>
    <p v-else-if="sessions.length === 0" class="msg">No saved sessions yet. Start tracking and they will show up here.</p>

    <ul v-else class="list">
      <li v-for="s in sessions" :key="s.id" class="item" :class="{ open: openId === s.id }">
        <button class="row" type="button" :aria-expanded="openId === s.id" @click="toggle(s.id)">
          <span class="top">
            <strong class="name">{{ sessionTitle(s) }}</strong>
            <span v-if="levelRange(s)" class="lv">{{ levelRange(s) }}</span>
          </span>
          <span class="sub">
            {{ day(s.startedAt) }}, {{ time(s.startedAt) }}<template v-if="duration(s)"> · {{ duration(s) }}</template> · {{ partyText(s.partySize) }}
          </span>
        </button>

        <div v-if="openId === s.id" class="detail">
          <p v-if="detailError" class="msg" role="alert">{{ detailError }}</p>
          <p v-else-if="!detail || !rates" class="msg">Loading…</p>
          <template v-else>
            <SessionDetailsForm
              v-if="loadSessionToken(s.id)"
              class="edit"
              :id-suffix="`past-${s.id}`"
              :name="s.label"
              :party-size="s.partySize"
              :allow-blank="false"
              @rename="(text) => rename(s, text)"
              @party-size="(size) => changeParty(s, size)"
            />
            <p v-if="editError" class="msg" role="alert">{{ editError }}</p>
            <dl class="stats">
              <div><dt>EXP gained</dt><dd>{{ whole(rates.expGained) }}</dd></div>
              <div><dt>EXP per hour</dt><dd>{{ formatPerHour(rates.expPerHour) }}</dd></div>
              <div><dt>Meso per hour</dt><dd>{{ formatPerHour(rates.mesoPerHour) }}</dd></div>
            </dl>
            <ExpChart :series="series" />
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.mine { color: #4a2a0e; }
.msg { margin: 0; color: #6b4a22; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 26rem; overflow-y: auto; }
.item { background: #fffdf3; border: 2px solid #d9c48a; border-radius: 10px; }
.item.open { border-color: #4a2a0e; }
.row {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  font: inherit;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}
.row:focus-visible { outline: 3px solid #2f8fe0; outline-offset: 1px; }
.top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.name { font-weight: 800; overflow-wrap: anywhere; }
.lv { flex: none; font: 400 1rem 'Lilita One', sans-serif; color: #6b4a22; }
.sub { font-size: 0.9rem; color: #6b4a22; }
.detail { padding: 0 10px 10px; }
.edit { margin-bottom: 8px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0 0 8px; }
.stats div { padding: 6px 8px; background: #fff6dc; border: 2px solid #d9c48a; border-radius: 8px; text-align: center; }
.stats dt { font-size: 0.8rem; color: #6b4a22; }
.stats dd { margin: 0; font: 400 1.25rem / 1.2 'Lilita One', sans-serif; font-variant-numeric: tabular-nums; }
</style>
