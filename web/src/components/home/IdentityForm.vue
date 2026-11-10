<script setup lang="ts">
import { computed, ref } from 'vue';

import { SPECS } from '../../lib/characters';

const props = defineProps<{ idSuffix: string }>();
const emit = defineEmits<{ save: [name: string, job: string] }>();

const name = ref('');
const job = ref('');
const ready = computed(() => name.value.trim().length > 0 && job.value !== '');
const nameId = computed(() => `identity-name-${props.idSuffix}`);
const jobId = computed(() => `identity-job-${props.idSuffix}`);

function submit() {
  if (ready.value) emit('save', name.value, job.value);
}
</script>

<template>
  <form class="identity" @submit.prevent="submit">
    <p class="lead">New here? Tell us who you are so your sessions land on the right character.</p>
    <label :for="nameId">Character name</label>
    <input :id="nameId" v-model="name" maxlength="20" autocomplete="off" placeholder="Character name" />
    <label :for="jobId">Spec</label>
    <select :id="jobId" v-model="job">
      <option value="" disabled>Pick your spec</option>
      <option v-for="spec in SPECS" :key="spec" :value="spec">{{ spec }}</option>
    </select>
    <button type="submit" :disabled="!ready">Save</button>
  </form>
</template>

<style scoped>
.identity { display: grid; gap: 6px; margin-top: 14px; padding: 12px; background: #fff8e0; border: 2px solid #f0b030; border-radius: 10px; }
.lead { margin: 0 0 4px; font-weight: 800; }
label { font-weight: 800; }
input, select { padding: 8px 10px; font: inherit; font-weight: 700; color: var(--ink); background: #fff; border: 2px solid var(--ink); border-radius: 8px; }
button { justify-self: start; margin-top: 4px; padding: 8px 14px; font: 400 1.05rem 'Lilita One', sans-serif; color: #fff; background: #2f8fe0; border: 2px solid var(--ink); border-radius: 8px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button:focus-visible { outline: 4px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 7px var(--ink); }
</style>
