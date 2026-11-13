<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { MAX_LABEL_LENGTH } from '../../lib/map-label';
import { MAX_PARTY_SIZE, MIN_PARTY_SIZE, parsePartySize, stepPartySize } from '../../lib/session-input';

/**
 * Name and party size of one session, editable. The name is saved when the box loses focus or Enter is
 * pressed (a blank one asks for the map's name again); the party size is typed or stepped, 1 to 6.
 */
const props = defineProps<{
  idSuffix: string;
  /** The session's current name ('' when it has none yet). */
  name: string;
  /** What to show in the name box while it is empty, e.g. "Named after your map". */
  placeholder?: string;
  partySize: number;
  /** False where a session can't go back to being nameless: a blank name is put back instead of sent. */
  allowBlank?: boolean;
}>();
const emit = defineEmits<{ rename: [name: string]; 'party-size': [size: number] }>();

const draftName = ref(props.name);
const draftParty = ref(String(props.partySize));
const partyError = ref(false);

// The saved values change underneath us (the map names the session; a failed save keeps the old one).
watch(() => props.name, (next) => (draftName.value = next));
watch(() => props.partySize, (next) => {
  draftParty.value = String(next);
  partyError.value = false;
});

const nameId = computed(() => `session-name-${props.idSuffix}`);
const partyId = computed(() => `session-party-${props.idSuffix}`);
const hintId = computed(() => `session-party-hint-${props.idSuffix}`);

function commitName() {
  if (draftName.value.trim() === props.name.trim()) return;
  if (props.allowBlank === false && draftName.value.trim() === '') {
    draftName.value = props.name;
    return;
  }
  emit('rename', draftName.value);
}

function commitParty() {
  const size = parsePartySize(draftParty.value);
  partyError.value = size === null;
  if (size === null) {
    draftParty.value = String(props.partySize);
    return;
  }
  if (size !== props.partySize) emit('party-size', size);
}

function step(delta: 1 | -1) {
  const size = stepPartySize(props.partySize, delta);
  draftParty.value = String(size);
  partyError.value = false;
  if (size !== props.partySize) emit('party-size', size);
}
</script>

<template>
  <form class="session-details" @submit.prevent="commitName">
    <label :for="nameId">Session name</label>
    <input
      :id="nameId"
      v-model="draftName"
      :maxlength="MAX_LABEL_LENGTH"
      :placeholder="placeholder ?? 'Name this session'"
      autocomplete="off"
      @blur="commitName"
    />

    <label :for="partyId">Party size</label>
    <div class="party">
      <button type="button" aria-label="One fewer player" :disabled="props.partySize <= MIN_PARTY_SIZE" @click="step(-1)">−</button>
      <input
        :id="partyId"
        v-model="draftParty"
        class="size"
        inputmode="numeric"
        autocomplete="off"
        :aria-invalid="partyError"
        :aria-describedby="hintId"
        @blur="commitParty"
        @keydown.enter.prevent="commitParty"
      />
      <button type="button" aria-label="One more player" :disabled="props.partySize >= MAX_PARTY_SIZE" @click="step(1)">+</button>
      <span class="solo">{{ props.partySize === 1 ? 'Solo' : `${props.partySize} players` }}</span>
    </div>
    <p :id="hintId" class="hint" :class="{ bad: partyError }">Whole number, {{ MIN_PARTY_SIZE }} to {{ MAX_PARTY_SIZE }}.</p>
  </form>
</template>

<style scoped>
.session-details { display: grid; gap: 6px; padding: 12px; background: #fff8e0; border: 2px solid #f0b030; border-radius: 10px; }
label { font-weight: 800; }
input { padding: 8px 10px; font: inherit; font-weight: 700; color: var(--ink); background: #fff; border: 2px solid var(--ink); border-radius: 8px; min-width: 0; }
.party { display: flex; align-items: center; gap: 6px; }
.size { width: 3.2rem; text-align: center; }
.party button { width: 2.2rem; height: 2.2rem; font: 400 1.2rem 'Lilita One', sans-serif; line-height: 1; color: #fff; background: #2f8fe0; border: 2px solid var(--ink); border-radius: 8px; cursor: pointer; }
.party button:disabled { opacity: 0.5; cursor: default; }
.party button:focus-visible, input:focus-visible { outline: 4px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 7px var(--ink); }
.solo { font-weight: 700; color: #6b4a22; }
.hint { margin: 0; font-size: 0.85rem; color: #6b4a22; }
.hint.bad { color: #b3261e; font-weight: 800; }
</style>
