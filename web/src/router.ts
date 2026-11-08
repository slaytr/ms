import { createRouter, createWebHistory } from 'vue-router';

import CapturePage from './pages/CapturePage.vue';
import HomePage from './pages/HomePage.vue';
import MapsPage from './pages/MapsPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage, meta: { title: "Bill's Personal Super Duper Maplestory Classic Tracker" } },
    { path: '/maps', name: 'maps', component: MapsPage, meta: { title: 'Maps | Bill\'s Personal Super Duper Maplestory Classic Tracker' } },
    // Not linked from anywhere: reach the testing tools by typing /testing.
    { path: '/testing', name: 'testing', component: CapturePage, meta: { title: 'Testing tools' } },
    { path: '/capture', redirect: '/testing' },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});

router.afterEach((to) => {
  document.title = String(to.meta.title ?? "Bill's Personal Super Duper Maplestory Classic Tracker");
});
