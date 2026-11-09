<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import NavMenu from './components/NavMenu.vue';
import HomePage from './pages/HomePage.vue';

const route = useRoute();
/** The developer test bench keeps its own bare layout. */
const showNav = computed(() => route.name !== 'testing');
const isHome = computed(() => route.name === 'home');
</script>

<template>
  <NavMenu v-if="showNav" />
  <!-- Mounted once and only hidden off the home route: unmounting it would stop the screen share. -->
  <HomePage v-if="showNav" v-show="isHome" />
  <RouterView />
</template>
