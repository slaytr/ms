<script setup lang="ts">
import { ref, watch } from 'vue';

/** The character's sprite from ClassicRank (via our /api/avatar proxy). Renders nothing if there isn't one. */
const props = defineProps<{ name: string | null | undefined; small?: boolean }>();

const failedFor = ref<string | null>(null);

// A new name gets a fresh attempt.
watch(
  () => props.name,
  () => {
    failedFor.value = null;
  },
);

const usable = (name: string | null | undefined): name is string => !!name && /^[A-Za-z0-9]{2,20}$/.test(name);
</script>

<template>
  <img
    v-if="usable(name) && failedFor !== name"
    class="avatar"
    :class="{ small }"
    :src="`/api/avatar/${encodeURIComponent(name)}`"
    :alt="`${name}'s character`"
    width="96"
    height="96"
    @error="failedFor = name"
  />
</template>

<style scoped>
.avatar { display: block; margin: 0 auto 6px; width: 96px; height: 96px; image-rendering: pixelated; }
.avatar.small { margin: 0; width: 48px; height: 48px; }
</style>
