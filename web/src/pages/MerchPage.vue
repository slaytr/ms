<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import SkyScene from '../components/home/SkyScene.vue';
import MerchItemCard from '../components/merch/MerchItemCard.vue';
import { catalogSize, findByName, iconUrl, searchCatalog, type CatalogItem } from '../lib/merch-catalog';
import {
  cleanName,
  loadMerch,
  parseMeso,
  parseQty,
  saveMerch,
  totalsOf,
  tradeProblem,
  withTrade,
  withoutItem,
  withoutLastTrade,
  type MerchItem,
} from '../lib/merch';

const items = ref<readonly MerchItem[]>(loadMerch());
const saveFailed = ref(false);
watch(items, (next) => (saveFailed.value = !saveMerch(next)));

const nameText = ref('');
const qtyText = ref('');
const priceText = ref('');
const problem = ref<string | null>(null);
const showSuggestions = ref(false);
const highlighted = ref(0);
const formEl = ref<HTMLElement | null>(null);

const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : '');

const totals = computed(() => totalsOf(items.value));
const suggestions = computed(() => (showSuggestions.value ? searchCatalog(nameText.value) : []));
/** The cozy.markets item the typed name matches exactly, which gives the purchase its picture. */
const matched = computed<CatalogItem | null>(() => findByName(nameText.value));
const typedName = computed(() => cleanName(nameText.value));

watch(nameText, () => (highlighted.value = 0));

function pick(item: CatalogItem) {
  nameText.value = item.name;
  showSuggestions.value = false;
}

function onNameKey(event: KeyboardEvent) {
  const list = suggestions.value;
  if (list.length === 0) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlighted.value = (highlighted.value + 1) % list.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlighted.value = (highlighted.value + list.length - 1) % list.length;
  } else if (event.key === 'Enter' && !matched.value) {
    event.preventDefault(); // choose the highlighted match instead of submitting half a name
    pick(list[highlighted.value] ?? list[0]);
  } else if (event.key === 'Escape') {
    showSuggestions.value = false;
  }
}

function recordBuy() {
  const name = typedName.value;
  const qty = parseQty(qtyText.value);
  const price = parseMeso(priceText.value);
  problem.value = !name ? 'Enter the item name.' : tradeProblem(null, 'buy', qty, price);
  if (problem.value !== null || qty === null || price === null) return;
  const before = items.value;
  const next = withTrade(before, { name: matched.value?.name ?? name, catalogId: matched.value?.id ?? null }, 'buy', qty, price, Date.now());
  if (next === before) {
    problem.value = 'That purchase could not be added (the ledger is full).';
    return;
  }
  items.value = next;
  nameText.value = '';
  qtyText.value = '';
  priceText.value = '';
  showSuggestions.value = false;
}

function sell(item: MerchItem, qty: number, price: number) {
  items.value = withTrade(items.value, { name: item.name, catalogId: item.catalogId }, 'sell', qty, price, Date.now());
}

function buyMore(item: MerchItem) {
  nameText.value = item.name;
  showSuggestions.value = false;
  formEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
</script>

<template>
  <div class="merch">
    <SkyScene />
    <main class="content">
      <h1 class="heading">Merch tracker</h1>
      <p class="sub">Log what you buy and sell, and see your stock, profit and margin on each item. Saved in this browser only.</p>

      <section class="win totals" aria-label="Totals">
        <header class="title">Overall</header>
        <dl class="body">
          <div><dt>Profit</dt><dd class="big" :class="tone(totals.profit)">{{ signed(totals.profit) }}</dd></div>
          <div>
            <dt>Margin</dt>
            <dd class="big" :class="tone(totals.profit)">{{ totals.margin === null ? '—' : `${(totals.margin * 100).toFixed(1)}%` }}</dd>
          </div>
          <div><dt>Revenue</dt><dd>{{ fmt(totals.revenue) }}</dd></div>
          <div><dt>Tied up in stock</dt><dd>{{ fmt(totals.heldCost) }}</dd></div>
          <div><dt>Items in stock</dt><dd>{{ totals.itemsHeld }}</dd></div>
        </dl>
      </section>

      <section ref="formEl" class="win add" aria-label="Add a purchase">
        <header class="title">I bought…</header>
        <form class="body form" autocomplete="off" @submit.prevent="recordBuy">
          <div class="field name">
            <label for="merch-name">Item</label>
            <div class="pickrow">
              <span class="pic">
                <img v-if="matched" :src="iconUrl(matched.id)" :alt="matched.name" draggable="false" />
                <span v-else class="blank" aria-hidden="true">?</span>
              </span>
              <div class="combo">
                <input
                  id="merch-name"
                  v-model="nameText"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  :aria-expanded="suggestions.length > 0"
                  aria-controls="merch-suggestions"
                  placeholder="Start typing an item name"
                  maxlength="60"
                  @focus="showSuggestions = true"
                  @input="showSuggestions = true"
                  @blur="showSuggestions = false"
                  @keydown="onNameKey"
                />
                <ul v-if="suggestions.length > 0" id="merch-suggestions" class="menu" role="listbox">
                  <li
                    v-for="(s, i) in suggestions"
                    :key="s.id"
                    role="option"
                    :aria-selected="i === highlighted"
                    :class="{ on: i === highlighted }"
                    @mousedown.prevent="pick(s)"
                  >
                    <img :src="iconUrl(s.id)" alt="" draggable="false" />
                    <span>{{ s.name }}</span>
                    <small>{{ s.category }}</small>
                  </li>
                </ul>
              </div>
            </div>
            <small v-if="matched" class="hint ok">Found on cozy.markets</small>
            <small v-else-if="typedName" class="hint">Not in the {{ catalogSize().toLocaleString() }} cozy.markets items, so it will be tracked without a picture.</small>
          </div>

          <div class="field">
            <label for="merch-qty">Quantity</label>
            <input id="merch-qty" v-model="qtyText" type="text" inputmode="numeric" placeholder="e.g. 100" />
          </div>
          <div class="field">
            <label for="merch-price">Price each (meso)</label>
            <input id="merch-price" v-model="priceText" type="text" inputmode="text" placeholder="e.g. 1500, 12k, 1.5m" />
          </div>
          <button type="submit" class="btn deal">Add purchase</button>
          <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
        </form>
      </section>

      <p v-if="saveFailed" class="warn" role="alert">This browser won't let us save, so your ledger will be gone when you close the tab.</p>

      <p v-if="items.length === 0" class="empty">Nothing tracked yet. Add your first purchase above.</p>
      <div v-else class="list">
        <MerchItemCard
          v-for="item in items"
          :key="item.key"
          :item="item"
          @sell="(qty, price) => sell(item, qty, price)"
          @buy-more="buyMore(item)"
          @undo="items = withoutLastTrade(items, item.key)"
          @remove="items = withoutItem(items, item.key)"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.merch {
  --ink: var(--c-4a2a0e-edge);
  --edge: var(--c-243247-edge);
  position: relative;
  min-height: 100dvh;
  color: var(--ink-text);
  font-family: 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  font-weight: 700;
}
.content { position: relative; z-index: 1; display: grid; gap: 14px; max-width: 760px; margin: 0 auto; padding: 72px 16px 90px; }
.heading {
  margin: 0;
  text-align: center;
  font: 400 clamp(2rem, 6vw, 3rem) / 1.1 'Lilita One', 'Trebuchet MS', sans-serif;
  color: var(--c-ffffff-text);
  text-shadow: -2px -2px 0 var(--ink), 2px -2px 0 var(--ink), -2px 2px 0 var(--ink), 2px 2px 0 var(--ink), 0 4px 0 var(--ink);
}
.sub { margin: -6px 0 6px; text-align: center; color: var(--c-ffffff-text); text-shadow: 0 2px 0 var(--ink); }
.empty, .warn { margin: 0; padding: 0.6rem 1.2rem; text-align: center; background: var(--c-fff6dc-bg); border: 3px solid var(--ink); border-radius: 12px; }
.warn { color: var(--c-b3261e-text); }
.list { display: grid; gap: 14px; }

.win {
  color: var(--c-1c2636-text);
  background: var(--c-f6f1e2-bg);
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--c-f4f7fb-edge), 0 6px 0 rgba(36, 50, 71, 0.35);
  font: 700 13px/1.3 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
}
.title {
  margin: 0;
  padding: 3px 8px 2px;
  color: var(--c-ffffff-text);
  background: linear-gradient(var(--c-5a78a6-bg), var(--c-34507c-bg));
  border-bottom: 2px solid var(--edge);
  font: 400 14px/1.4 'Lilita One', sans-serif;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 0 var(--c-1c2d49-edge);
}
.body { margin: 0; padding: 10px; }

.totals .body { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.totals dt { font-size: 11px; color: var(--c-6b4a22-text); }
.totals dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.totals .big { font: 400 22px/1.1 'Lilita One', sans-serif; }
.up { color: var(--c-2e7d18-text); }
.down { color: var(--c-b3261e-text); }
@media (max-width: 620px) { .totals .body { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px; align-items: end; }
.field { display: grid; gap: 3px; min-width: 0; }
.field.name { grid-column: 1 / -1; }
.field label { font-size: 11px; color: var(--c-6b4a22-text); }
.form input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  font: 700 15px 'Nunito', sans-serif;
  color: var(--c-1c2636-text);
  background: var(--c-ffffff-bg);
  border: 2px solid var(--edge);
  border-radius: 6px;
}
.form input:focus-visible { outline: 3px solid var(--c-e8a200-edge); outline-offset: 1px; }
.pickrow { display: flex; align-items: center; gap: 8px; }
.pic { flex: none; display: grid; place-items: center; width: 44px; height: 44px; background: var(--c-fffdf3-bg); border: 2px solid var(--edge); border-radius: 6px; }
.pic img { max-width: 36px; max-height: 36px; image-rendering: pixelated; }
.blank { font: 400 20px 'Lilita One', sans-serif; color: var(--c-6b4a22-text); }
.combo { position: relative; flex: 1; min-width: 0; }
.menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  max-height: 280px;
  margin: 0;
  padding: 2px;
  overflow-y: auto;
  list-style: none;
  background: var(--c-fffdf3-bg);
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: 0 6px 0 rgba(36, 50, 71, 0.35);
}
.menu li { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 4px; cursor: pointer; }
.menu li.on, .menu li:hover { background: var(--c-e3dcc4-bg); }
.menu img { width: 28px; height: 28px; object-fit: contain; image-rendering: pixelated; }
.menu span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.menu small { color: var(--c-6b4a22-text); }
.hint { color: var(--c-6b4a22-text); }
.hint.ok { color: var(--c-2e7d18-text); }
.problem { grid-column: 1 / -1; margin: 0; color: var(--c-b3261e-text); }

.btn {
  padding: 7px 14px 5px;
  font: 400 16px/1.2 'Lilita One', sans-serif;
  color: var(--c-ffffff-text);
  text-shadow: 0 1px 0 var(--c-1c2d49-edge);
  background: linear-gradient(var(--c-ffb84a-bg), var(--c-e98a16-bg));
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: 0 3px 0 var(--c-9c5a08-edge);
  cursor: pointer;
}
.btn:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-9c5a08-edge); }
.btn:focus-visible { outline: 3px solid var(--c-e8a200-edge); outline-offset: 2px; }
@media (max-width: 560px) {
  .form { grid-template-columns: minmax(0, 1fr); }
  .btn { justify-self: stretch; }
}
</style>
