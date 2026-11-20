<script setup lang="ts">
import { computed, ref } from 'vue';

import { iconUrl } from '../../lib/merch-catalog';
import { parseMeso, parseQty, positionOf, tradeProblem, type MerchItem } from '../../lib/merch';

const props = defineProps<{ item: MerchItem }>();
const emit = defineEmits<{
  sell: [qty: number, price: number];
  buyMore: [];
  undo: [];
  remove: [];
}>();

const position = computed(() => positionOf(props.item.trades));
const history = computed(() => [...props.item.trades].reverse());

const selling = ref(false);
const qtyText = ref('');
const priceText = ref('');
const problem = ref<string | null>(null);
const iconFailed = ref(false);
const confirmingRemove = ref(false);

const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`;
const percent = (m: number) => `${m > 0 ? '+' : m < 0 ? '-' : ''}${Math.abs(m * 100).toFixed(1)}%`;
const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const when = (at: number) => (at > 0 ? new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Live preview of what this sale would make, so the player sees the profit before committing. */
const preview = computed(() => {
  const qty = parseQty(qtyText.value);
  const price = parseMeso(priceText.value);
  if (qty === null || price === null || qty > position.value.held) return null;
  return qty * (price - position.value.avgCost);
});

function openSell() {
  selling.value = true;
  qtyText.value = String(position.value.held);
  priceText.value = '';
  problem.value = null;
}

function submitSell() {
  const qty = parseQty(qtyText.value);
  const price = parseMeso(priceText.value);
  problem.value = tradeProblem(props.item, 'sell', qty, price);
  if (problem.value !== null || qty === null || price === null) return;
  emit('sell', qty, price);
  selling.value = false;
}
</script>

<template>
  <article class="card" :aria-label="item.name">
    <div class="top">
      <span class="pic">
        <img v-if="item.catalogId !== null && !iconFailed" :src="iconUrl(item.catalogId)" :alt="item.name" draggable="false" @error="iconFailed = true" />
        <span v-else class="blank" aria-hidden="true">?</span>
      </span>
      <div class="head">
        <h2 class="name">{{ item.name }}</h2>
        <p class="held">
          <strong>{{ fmt(position.held) }}</strong> held
          <template v-if="position.held > 0"> @ {{ fmt(position.avgCost) }} avg</template>
        </p>
      </div>
      <div class="pl" :class="tone(position.profit)">
        <template v-if="position.sold > 0">
          <strong>{{ signed(position.profit) }}</strong>
          <small>{{ position.margin === null ? 'profit' : `${percent(position.margin)} margin` }}</small>
        </template>
        <small v-else>No sales yet</small>
      </div>
    </div>

    <dl class="nums">
      <div><dt>Bought</dt><dd>{{ fmt(position.bought) }}</dd></div>
      <div><dt>Spent</dt><dd>{{ fmt(position.spent) }}</dd></div>
      <div><dt>Sold</dt><dd>{{ fmt(position.sold) }}</dd></div>
      <div><dt>Revenue</dt><dd>{{ fmt(position.revenue) }}</dd></div>
      <div><dt>In stock</dt><dd>{{ fmt(position.heldCost) }}</dd></div>
    </dl>

    <form v-if="selling" class="sell" @submit.prevent="submitSell">
      <label>
        <span>Quantity sold</span>
        <input v-model="qtyText" inputmode="numeric" autocomplete="off" :aria-label="`Quantity of ${item.name} to sell`" />
      </label>
      <label>
        <span>Price each (meso)</span>
        <input v-model="priceText" inputmode="text" autocomplete="off" placeholder="e.g. 1500, 12k, 1.5m" :aria-label="`Sell price of ${item.name}`" />
      </label>
      <p v-if="preview !== null" class="preview" :class="tone(preview)">This sale: {{ signed(preview) }} meso</p>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <div class="row">
        <button type="submit" class="btn deal">Record sale</button>
        <button type="button" class="btn ghost" @click="selling = false">Cancel</button>
      </div>
    </form>

    <div v-else class="actions">
      <button type="button" class="btn deal" :disabled="position.held === 0" @click="openSell">Sell</button>
      <button type="button" class="btn" @click="emit('buyMore')">Buy more</button>
      <button type="button" class="btn ghost" title="Remove the most recent buy or sale" @click="emit('undo')">Undo last</button>
      <button v-if="!confirmingRemove" type="button" class="btn ghost" @click="confirmingRemove = true">Remove</button>
      <template v-else>
        <button type="button" class="btn danger" @click="emit('remove')">Delete all its history</button>
        <button type="button" class="btn ghost" @click="confirmingRemove = false">Keep</button>
      </template>
    </div>

    <details class="log">
      <summary>History ({{ item.trades.length }})</summary>
      <ul>
        <li v-for="t in history" :key="t.id" :class="`is-${t.kind}`">
          <span class="kind">{{ t.kind === 'buy' ? 'Bought' : 'Sold' }}</span>
          <span>{{ fmt(t.qty) }} @ {{ fmt(t.price) }}</span>
          <span class="when">{{ when(t.at) }}</span>
        </li>
      </ul>
    </details>
  </article>
</template>

<style scoped>
.card {
  --edge: var(--c-243247-edge);
  display: grid;
  gap: 8px;
  padding: 10px;
  color: var(--c-1c2636-text);
  background: var(--c-f6f1e2-bg);
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--c-f4f7fb-edge), 0 5px 0 rgba(36, 50, 71, 0.35);
  font: 700 13px/1.3 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
}
.top { display: flex; align-items: center; gap: 10px; }
.pic { flex: none; display: grid; place-items: center; width: 48px; height: 48px; background: var(--c-fffdf3-bg); border: 2px solid var(--edge); border-radius: 6px; }
.pic img { max-width: 40px; max-height: 40px; image-rendering: pixelated; }
.blank { font: 400 22px 'Lilita One', sans-serif; color: var(--c-6b4a22-text); }
.head { flex: 1; min-width: 0; }
.name { margin: 0; font: 400 18px/1.15 'Lilita One', sans-serif; overflow-wrap: anywhere; }
.held { margin: 0; color: var(--c-6b4a22-text); font-variant-numeric: tabular-nums; }
.held strong { color: var(--c-1c2636-text); }
.pl { display: grid; justify-items: end; text-align: right; font-variant-numeric: tabular-nums; }
.pl strong { font: 400 20px/1.1 'Lilita One', sans-serif; }
.pl small { font-size: 11px; color: var(--c-6b4a22-text); }
.up strong, .up { color: var(--c-2e7d18-text); }
.down strong, .down { color: var(--c-b3261e-text); }
.pl.up small, .pl.down small { color: inherit; }

.nums { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin: 0; }
.nums div { padding: 4px 6px; background: var(--c-fffdf3-bg); border: 1px solid var(--c-e3dcc4-bg); border-radius: 4px; }
.nums dt { font-size: 10px; color: var(--c-6b4a22-text); }
.nums dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@media (max-width: 520px) { .nums { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.actions, .row { display: flex; flex-wrap: wrap; gap: 6px; }
.sell { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 8px; background: var(--c-fffdf3-bg); border: 2px dashed var(--edge); border-radius: 6px; }
.sell label { display: grid; gap: 2px; }
.sell label span { font-size: 11px; color: var(--c-6b4a22-text); }
.sell input {
  min-width: 0;
  padding: 5px 8px;
  font: 700 14px 'Nunito', sans-serif;
  color: var(--c-1c2636-text);
  background: var(--c-ffffff-bg);
  border: 2px solid var(--edge);
  border-radius: 6px;
}
.sell input:focus-visible { outline: 3px solid var(--c-e8a200-edge); outline-offset: 1px; }
.preview, .problem, .row { grid-column: 1 / -1; margin: 0; }
.problem { color: var(--c-b3261e-text); }
@media (max-width: 420px) { .sell { grid-template-columns: minmax(0, 1fr); } }

.btn {
  padding: 4px 10px 3px;
  font: 400 13px/1.2 'Lilita One', sans-serif;
  color: var(--c-ffffff-text);
  text-shadow: 0 1px 0 var(--c-1c2d49-edge);
  background: linear-gradient(var(--c-6fa0e6-bg), var(--c-3d6fc0-bg));
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: 0 3px 0 var(--c-1d3560-edge);
  cursor: pointer;
}
.btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-1d3560-edge); }
.btn:disabled { opacity: 0.45; cursor: default; box-shadow: none; }
.btn:focus-visible { outline: 3px solid var(--c-e8a200-edge); outline-offset: 2px; }
.btn.deal { background: linear-gradient(var(--c-ffb84a-bg), var(--c-e98a16-bg)); box-shadow: 0 3px 0 var(--c-9c5a08-edge); }
.btn.ghost { color: var(--c-1c2636-text); text-shadow: none; background: var(--c-fffdf3-bg); box-shadow: 0 3px 0 rgba(36, 50, 71, 0.35); }
.btn.danger { background: linear-gradient(var(--c-c0392b-bg), var(--c-c0392b-bg)); box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35); }

.log summary { cursor: pointer; font-size: 12px; color: var(--c-6b4a22-text); }
.log ul { display: grid; gap: 2px; margin: 6px 0 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.log li { display: grid; grid-template-columns: 56px 1fr auto; gap: 8px; font-size: 12px; }
.log .is-buy .kind { color: var(--c-3d6fc0-bg); }
.log .is-sell .kind { color: var(--c-2e7d18-text); }
.when { color: var(--c-6b4a22-text); }
</style>
