<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import CharacterAvatar from '../components/home/CharacterAvatar.vue';
import LevelBadge from '../components/home/LevelBadge.vue';
import SkyScene from '../components/home/SkyScene.vue';
import CrateOpening from '../components/nx/CrateOpening.vue';
import CrateRates from '../components/nx/CrateRates.vue';
import InventoryWindow, { type InvSlot } from '../components/nx/InventoryWindow.vue';
import { MYSTERY_FASHION_CRATE } from '../data/crates';
import { buyLootCrates, getLoot, moveLootSlot, openLootCrates, type LootState } from '../lib/api';
import { crateIndexes, moveSlot, parseBag, serializeBag, type Bag } from '../lib/bag';
import { tallyById, type CrateItem } from '../lib/loot-box';
import { NX_PER_GRANT, XP_PER_GRANT } from '../lib/nx-economy';
import { loadProfile } from '../lib/profile';

/** The crate on sale. More crates will slot in here later. */
const crate = MYSTERY_FASHION_CRATE;

/** Slots in the bag (the game's maximum for one tab); crates and the items from them share it. */
const CAPACITY = 96;
const TABS = ['All'] as const;

/** Whoever the tracker last recognised in this browser. Without a named character there is nobody to open crates for. */
const profile = loadProfile();
const character = computed(() => (profile?.name ? profile : null));

/** What the server holds for this character: NX, the bag, the last opening. Null until it loads. */
const loot = ref<LootState | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busy = ref(false);
const notice = ref<string | null>(null);
/** Slots filled by the latest buy or open, which glow for a moment. */
const fresh = ref<ReadonlySet<number>>(new Set());
const reveal = ref<number | null>(null);
/** The opening animation on screen, if any; resolving `playing.finish` lets the result land. */
const playing = ref<{ item: CrateItem; count: number; finish: () => void } | null>(null);

/** Plays the reel for the rarest item of an opening and waits until it ends (or is skipped). */
function playOpening(ids: readonly number[]): Promise<void> {
  const items = ids.flatMap((id) => crate.items.filter((i) => i.id === id));
  const rarestItem = items.reduce<CrateItem | null>((best, i) => (best === null || i.rate < best.rate ? i : best), null);
  if (rarestItem === null) return Promise.resolve();
  return new Promise((resolve) => {
    playing.value = {
      item: rarestItem,
      count: items.length,
      finish: () => {
        playing.value = null;
        resolve();
      },
    };
  });
}

const fmt = (n: number) => n.toLocaleString();
const iconUrl = (id: number) => `/nx/${id}.png`;

const bag = computed<Bag>(() => parseBag(loot.value?.bag, crate.items, CAPACITY));
const nx = computed(() => loot.value?.nx ?? null);
const held = computed(() => bag.value.flatMap((entry) => (entry?.kind === 'item' ? [entry.item] : [])));
const found = computed(() => tallyById(held.value));
const crateCount = computed(() => crateIndexes(bag.value).length);
const lastOpen = computed<readonly CrateItem[]>(() =>
  (loot.value?.lastOpen ?? []).flatMap((id) => crate.items.filter((item) => item.id === id)),
);
const lastTally = computed(() =>
  [...tallyById(lastOpen.value)].map(([id, count]) => ({ item: crate.items.find((i) => i.id === id)!, count })),
);
const rarest = computed(() => held.value.reduce<CrateItem | null>((best, item) => (best === null || item.rate < best.rate ? item : best), null));
const grantPercent = computed(() => (nx.value ? (nx.value.expIntoGrant / XP_PER_GRANT) * 100 : 0));
const canBuy = (price: number) => !busy.value && nx.value !== null && nx.value.balance >= price;

const slots = computed<readonly (InvSlot | null)[]>(() =>
  bag.value.map((entry, index) => {
    if (entry === null) return null;
    const key = String(index);
    const glow = fresh.value.has(index);
    return entry.kind === 'crate'
      ? { key, id: crate.iconId, name: crate.name, fresh: glow }
      : { key, id: entry.item.id, name: entry.item.name, rate: entry.item.rate, fresh: glow };
  }),
);

/** Slots whose contents changed to something filled, so they can glow and be scrolled to. */
function changedSlots(before: readonly unknown[] | undefined, after: readonly unknown[]): number[] {
  return after.flatMap((slot, index) => (slot !== null && slot !== (before?.[index] ?? null) ? [index] : []));
}

async function load() {
  if (!profile) return;
  loading.value = true;
  loadError.value = null;
  try {
    loot.value = await getLoot(profile.fingerprint);
  } catch (cause) {
    loadError.value = (cause as Error).message;
  } finally {
    loading.value = false;
  }
}

/** Runs a server action and shows what it changed; a refusal (no NX, full bag) is shown as a notice. */
async function act(run: () => Promise<LootState>, reveal_: 'first' | 'last') {
  if (busy.value) return;
  busy.value = true;
  notice.value = null;
  try {
    const next = await run();
    if (reveal_ === 'first') await playOpening(next.lastOpen ?? []);
    const changed = changedSlots(loot.value?.bag, next.bag);
    loot.value = next;
    fresh.value = new Set(changed);
    reveal.value = (reveal_ === 'first' ? changed[0] : changed[changed.length - 1]) ?? null;
  } catch (cause) {
    notice.value = (cause as Error).message;
  } finally {
    busy.value = false;
  }
}

const buy = (count: 1 | 11) => profile && act(() => buyLootCrates(profile.fingerprint, count), 'last');
const open = (indexes: readonly number[]) => profile && indexes.length > 0 && act(() => openLootCrates(profile.fingerprint, indexes), 'first');

/**
 * Dragging an item to another slot. The bag redraws at once and the move is saved in the background, so it
 * feels instant; if saving fails the bag snaps back and says why.
 */
async function move(from: number, to: number) {
  const current = loot.value;
  if (!profile || !current || busy.value) return;
  const moved = moveSlot(bag.value, from, to);
  if (moved === null) return;
  busy.value = true;
  notice.value = null;
  fresh.value = new Set();
  loot.value = { ...current, bag: serializeBag(moved) };
  try {
    loot.value = await moveLootSlot(profile.fingerprint, from, to);
  } catch (cause) {
    loot.value = current;
    notice.value = (cause as Error).message;
  } finally {
    busy.value = false;
  }
}

/** Double-clicking a crate in the bag opens that one. */
function useSlot(slot: InvSlot) {
  const index = Number(slot.key);
  if (bag.value[index]?.kind === 'crate') void open([index]);
}

onMounted(load);
</script>

<template>
  <div class="loot">
    <SkyScene />
    <CrateOpening
      v-if="playing"
      :crate-icon-id="crate.iconId"
      :item-id="playing.item.id"
      :item-name="playing.item.name"
      :rate="playing.item.rate"
      :pool="crate.items.map((i) => i.id)"
      :count="playing.count"
      @done="playing?.finish()"
    />
    <main class="content">
      <h1 class="heading">Loot box simulator</h1>

      <section v-if="!character" class="win gate" aria-label="Character needed">
        <header class="title">Character needed</header>
        <div class="body">
          <p><strong>Loot is for tracked characters.</strong></p>
          <p class="muted">Share your game window on the Tracker tab first, so we know who is opening the crates.</p>
          <RouterLink to="/" class="btn link">Go to the Tracker</RouterLink>
        </div>
      </section>

      <section v-else-if="loadError" class="win gate" aria-label="Loot unavailable">
        <header class="title">Loot unavailable</header>
        <div class="body">
          <p role="alert"><strong>{{ loadError }}</strong></p>
          <button type="button" class="btn link" @click="load">Try again</button>
        </div>
      </section>

      <p v-else-if="loading" class="status">Loading your loot…</p>

      <template v-else>
        <p class="sub">Earn NX by gaining EXP, then buy {{ crate.name }}s and open them. Nothing here costs real money.</p>

        <div class="layout">
          <div class="col left">
            <section class="win who" aria-label="Your character">
              <header class="title">Your character</header>
              <div class="body who-body">
                <CharacterAvatar :name="character.name" />
                <p class="who-name">{{ character.name }}</p>
                <p class="who-meta">
                  <LevelBadge :level="character.level" />
                  <span v-if="character.job" class="job">{{ character.job }}</span>
                </p>
              </div>
            </section>

            <!-- NX: what you can spend, and how close the next grant is -->
            <section v-if="nx" class="win nx" aria-label="Your NX">
              <header class="title">Your NX</header>
              <div class="body">
                <p class="balance"><span class="coin" aria-hidden="true">NX</span>{{ fmt(nx.balance) }}</p>
                <div class="track" role="progressbar" aria-label="EXP toward the next NX grant" :aria-valuenow="Math.round(grantPercent)" aria-valuemin="0" aria-valuemax="100">
                  <div class="fill" :style="{ width: `${grantPercent}%` }" />
                </div>
                <p class="grant">
                  <strong>{{ fmt(nx.expToNext) }}</strong> EXP to <strong>+{{ fmt(NX_PER_GRANT) }}</strong> NX
                </p>
                <p class="fine">{{ fmt(nx.expGained) }} EXP gained across all your sessions. Earned {{ fmt(nx.earned) }} NX, spent {{ fmt(nx.spent) }}.</p>
              </div>
            </section>

            <!-- Cash Shop: the crate on sale -->
            <section class="win shop" aria-label="Cash Shop">
              <header class="title">Cash Shop</header>
              <div class="body">
                <div class="crate-art"><img :src="iconUrl(crate.iconId)" :alt="crate.name" draggable="false" /></div>
                <h2 class="crate-name">{{ crate.name }}</h2>
                <p class="blurb">Holds one decorative equip item.</p>
                <div class="buy">
                  <button type="button" class="btn" :disabled="!canBuy(crate.price1)" @click="buy(1)">
                    Buy 1<small>{{ fmt(crate.price1) }} NX</small>
                  </button>
                  <button type="button" class="btn deal" :disabled="!canBuy(crate.price11)" @click="buy(11)">
                    Buy 11<small>{{ fmt(crate.price11) }} NX</small>
                  </button>
                </div>
              </div>
            </section>

            <!-- What the last opening gave -->
            <section class="win result" aria-label="Last opening" aria-live="polite">
              <header class="title">{{ lastOpen.length > 1 ? `You obtained ${lastOpen.length} items` : 'You obtained' }}</header>
              <div class="body">
                <p v-if="lastOpen.length === 0" class="muted">Open a crate to see what comes out.</p>
                <div v-else-if="lastOpen.length === 1" class="one">
                  <span class="big"><img :src="iconUrl(lastOpen[0].id)" alt="" draggable="false" /></span>
                  <strong>{{ lastOpen[0].name }}</strong>
                  <small>Drop rate {{ lastOpen[0].rate }}%</small>
                </div>
                <ul v-else class="many">
                  <li v-for="{ item, count } in lastTally" :key="item.id">
                    <span class="chip"><img :src="iconUrl(item.id)" alt="" draggable="false" /></span>
                    <span class="nm">{{ item.name }}</span>
                    <span class="ct">{{ count > 1 ? `x${count}` : '' }}</span>
                    <span class="rt">{{ item.rate }}%</span>
                  </li>
                </ul>
              </div>
            </section>
          </div>

          <div class="col mid">
            <InventoryWindow :tabs="TABS" :active="TABS[0]" :slots="slots" :reveal="reveal" @use="useSlot" @move="move">
              <template #footer>
                <div class="open-bar">
                  <button type="button" class="btn small" :disabled="busy || crateCount < 1" @click="open(crateIndexes(bag).slice(0, 1))">Open 1</button>
                  <button type="button" class="btn small" :disabled="busy || crateCount < 2" @click="open(crateIndexes(bag))">Open all ({{ crateCount }})</button>
                </div>
                <p v-if="notice" class="notice" role="alert">{{ notice }}</p>
                <p class="nxbar"><span class="coin" aria-hidden="true">NX</span> Balance <strong>{{ nx ? fmt(nx.balance) : '—' }}</strong></p>
              </template>
            </InventoryWindow>

            <section class="win stats" aria-label="Your stats">
              <header class="title">Stats</header>
              <dl class="body">
                <div><dt>Crates opened</dt><dd>{{ fmt(loot?.opened ?? 0) }}</dd></div>
                <div><dt>Unique items</dt><dd>{{ found.size }} / {{ crate.items.length }}</dd></div>
                <div><dt>Rarest pull</dt><dd>{{ rarest ? `${rarest.name} (${rarest.rate}%)` : '—' }}</dd></div>
                <div><dt>NX spent</dt><dd>{{ fmt(nx?.spent ?? 0) }}</dd></div>
              </dl>
            </section>
          </div>

          <div class="col right">
            <CrateRates :crate="crate" :found="found" />
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.loot {
  --ink: #4a2a0e;
  --edge: #243247;
  position: relative;
  min-height: 100dvh;
  color: var(--ink);
  font-family: 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  font-weight: 700;
  color-scheme: light;
}
.content { position: relative; z-index: 1; display: grid; gap: 14px; max-width: 980px; margin: 0 auto; padding: 72px 16px 90px; }
.heading {
  margin: 0;
  text-align: center;
  font: 400 clamp(2rem, 6vw, 3rem) / 1.1 'Lilita One', 'Trebuchet MS', sans-serif;
  color: #fff;
  text-shadow: -2px -2px 0 var(--ink), 2px -2px 0 var(--ink), -2px 2px 0 var(--ink), 2px 2px 0 var(--ink), 0 4px 0 var(--ink);
}
.sub { margin: -6px 0 6px; text-align: center; color: #fff; text-shadow: 0 2px 0 var(--ink); }
.status { margin: 0 auto; padding: 0.6rem 1.2rem; text-align: center; background: #fff6dc; border: 3px solid var(--ink); border-radius: 12px; }

.layout { display: grid; grid-template-columns: minmax(0, 220px) 224px minmax(0, 1fr); gap: 16px; align-items: start; justify-content: center; }
.col { display: grid; gap: 16px; min-width: 0; }
/* The windows are drawn at game size, which is small on a big screen. */
@media (min-width: 1000px) {
  .layout { zoom: 1.3; }
}
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); justify-items: center; }
  .col { width: 100%; max-width: 420px; }
}

/* Shared window chrome, matching the inventory. */
.win {
  color: #1c2636;
  background: #f6f1e2;
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px #f4f7fb, 0 6px 0 rgba(36, 50, 71, 0.35);
  font: 700 12px/1.3 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  overflow: hidden;
}
.title {
  margin: 0;
  padding: 3px 8px 2px;
  color: #fff;
  background: linear-gradient(#5a78a6, #34507c);
  border-bottom: 2px solid var(--edge);
  font: 400 13px/1.4 'Lilita One', sans-serif;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 0 #1c2d49;
}
.body { margin: 0; padding: 10px; }
.muted { margin: 0; color: #6b6a5a; }

.btn {
  display: grid;
  gap: 1px;
  justify-items: center;
  padding: 5px 10px 4px;
  font: 400 14px/1.2 'Lilita One', sans-serif;
  color: #fff;
  text-shadow: 0 1px 0 #1c2d49;
  background: linear-gradient(#6fa0e6, #3d6fc0);
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: 0 3px 0 #1d3560;
  cursor: pointer;
}
.btn small { font: 800 10px/1.2 'Nunito', sans-serif; color: #e3edff; text-shadow: none; }
.btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #1d3560; }
.btn:disabled { opacity: 0.45; cursor: default; box-shadow: none; }
.btn:focus-visible { outline: 3px solid #e8a200; outline-offset: 2px; }
.btn.deal { background: linear-gradient(#ffb84a, #e98a16); box-shadow: 0 3px 0 #9c5a08; }
.btn.deal small { color: #fff0d2; }
.btn.small { padding: 3px 8px 2px; font-size: 12px; }
.btn.link { display: inline-block; margin-top: 10px; text-decoration: none; }

/* Access gate */
.gate { max-width: 420px; margin: 0 auto; text-align: center; }
.gate .body { display: grid; gap: 6px; padding: 16px; }
.gate p { margin: 0; }

/* Your character */
.who-body { display: grid; justify-items: center; gap: 4px; text-align: center; }
.who-body :deep(.avatar) { margin: 0; }
.who-name { margin: 0; font: 400 18px/1.15 'Lilita One', sans-serif; overflow-wrap: anywhere; }
.who-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 8px; margin: 0; }
.job { color: #6b4a22; }

/* NX balance and progress */
.nx .body { display: grid; gap: 4px; }
.balance { display: flex; align-items: center; justify-content: center; gap: 4px; margin: 0; font: 400 24px/1.1 'Lilita One', sans-serif; color: #b07a00; font-variant-numeric: tabular-nums; }
.balance .coin { margin-right: 2px; }
.track { height: 10px; background: #e3dcc4; border: 2px solid var(--edge); border-radius: 6px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(#8fe35f, #3fa02a); transition: width 0.5s ease-out; }
.grant { margin: 0; text-align: center; font-size: 11px; font-variant-numeric: tabular-nums; }
.grant strong { color: #2e7d18; }
.fine { margin: 0; color: #6b6a5a; font-size: 10px; text-align: center; }

/* Shop */
.shop .body { display: grid; justify-items: center; gap: 4px; text-align: center; }
.crate-art { display: grid; place-items: center; width: 96px; height: 96px; background: radial-gradient(#fffdf0, #ece4c8); border: 2px solid #b5ac90; border-radius: 8px; }
.crate-art img { image-rendering: pixelated; transform: scale(2.2); }
.crate-name { margin: 4px 0 0; font: 400 16px/1.2 'Lilita One', sans-serif; }
.blurb { margin: 0; color: #6b6a5a; font-size: 11px; }
.buy { display: flex; gap: 8px; margin-top: 6px; }

/* Result */
.one { display: grid; justify-items: center; gap: 2px; text-align: center; }
.big { display: grid; place-items: center; width: 80px; height: 80px; background: #fff7d8; border: 2px solid #e8a200; border-radius: 8px; animation: pop 0.35s ease-out; }
.big img { image-rendering: pixelated; transform: scale(2.2); }
.one strong { font-size: 14px; }
.one small { color: #6b6a5a; }
.many { display: grid; gap: 2px; max-height: 260px; margin: 0; padding: 0; list-style: none; overflow-y: auto; scrollbar-width: thin; }
.many li { display: grid; grid-template-columns: 34px 1fr auto auto; align-items: center; gap: 6px; padding: 1px 2px; font-size: 11px; }
.many li:nth-child(even) { background: #f0ead8; }
.chip { display: grid; place-items: center; width: 34px; height: 34px; }
.chip img { image-rendering: pixelated; }
.ct { color: #2e7d18; }
.rt { color: #6b6a5a; font-variant-numeric: tabular-nums; }
@keyframes pop { 0% { transform: scale(0.4); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }

/* Inventory footer */
.open-bar { display: flex; gap: 6px; justify-content: center; }
.notice { margin: 6px 0 0; padding: 3px 6px; color: #8a1d0c; background: #fff0ee; border: 1px solid #c4361d; border-radius: 4px; font-size: 11px; }
.nxbar { display: flex; align-items: center; justify-content: space-between; margin: 6px 0 0; padding: 3px 6px; color: #fff; background: #1b2433; border: 1px solid #0d131d; border-radius: 4px; font-size: 11px; font-variant-numeric: tabular-nums; }
.nxbar strong { margin-left: auto; color: #ffe066; font-weight: 800; }
.coin { display: inline-grid; place-items: center; width: 22px; height: 14px; margin-right: 5px; font: 800 8px/1 'Nunito', sans-serif; color: #5a3500; background: linear-gradient(#ffe066, #e8a200); border: 1px solid #8a5a00; border-radius: 999px; }

/* Stats */
.stats { max-width: 224px; }
.stats .body { display: grid; gap: 4px; }
.stats .body div { display: flex; justify-content: space-between; gap: 8px; }
.stats dt { color: #50607a; }
.stats dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

@media (prefers-reduced-motion: reduce) { .big { animation: none; } .fill { transition: none; } }
</style>
