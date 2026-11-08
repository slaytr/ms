<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import NavMenu from './components/NavMenu.vue';

const route = useRoute();
/** The developer test bench keeps its own bare layout. */
const showNav = computed(() => route.name !== 'testing');
</script>

<template>
  <NavMenu v-if="showNav" />
  <RouterView />
</template>
