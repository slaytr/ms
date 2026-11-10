import { createRouter, createWebHistory } from 'vue-router';

import CapturePage from './pages/CapturePage.vue';
import CharactersPage from './pages/CharactersPage.vue';
import RankingsPage from './pages/RankingsPage.vue';
import MapsPage from './pages/MapsPage.vue';
import LootPage from './pages/LootPage.vue';

/** The home page is mounted by App.vue (kept alive so a screen share survives navigation), so its route renders nothing. */
const HomePlaceholder = { render: () => null };

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePlaceholder, meta: { title: "Bill's Personal Super Duper Maplestory Classic Tracker" } },
    { path: '/maps', name: 'maps', component: MapsPage, meta: { title: 'Maps | Bill\'s Personal Super Duper Maplestory Classic Tracker' } },
    { path: '/characters', name: 'characters', component: CharactersPage, meta: { title: "Characters | Bill's Personal Super Duper Maplestory Classic Tracker" } },
    { path: '/rankings', name: 'rankings', component: RankingsPage, meta: { title: "Rankings | Bill's Personal Super Duper Maplestory Classic Tracker" } },
    { path: '/loot', name: 'loot', component: LootPage, meta: { title: "Loot | Bill's Personal Super Duper Maplestory Classic Tracker" } },
    { path: '/nx', redirect: '/loot' },
    // Not linked from anywhere: reach the testing tools by typing /testing.
    { path: '/testing', name: 'testing', component: CapturePage, meta: { title: 'Testing tools' } },
    { path: '/capture', redirect: '/testing' },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});

router.afterEach((to) => {
  document.title = String(to.meta.title ?? "Bill's Personal Super Duper Maplestory Classic Tracker");
});
