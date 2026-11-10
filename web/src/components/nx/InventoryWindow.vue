<script lang="ts">
/** One filled slot of the inventory. */
export interface InvSlot {
  readonly key: string;
  /** Item id: names the icon file in /nx. */
  readonly id: number;
  readonly name: string;
  /** Drop rate in percent, for items that came out of a crate. */
  readonly rate?: number;
  /** Just obtained: gets a brief glow. */
  readonly fresh?: boolean;
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

/**
 * A MapleStory-style "Item Inventory": title bar, tab, a 4-wide scrolling slot grid and an info box for the
 * slot under the pointer. Presentation only; the page owns what is in the slots. `slots` is positional: the
 * array index is the slot, and null is an empty slot.
 */
const props = defineProps<{
  tabs: readonly string[];
  active: string;
  slots: readonly (InvSlot | null)[];
  /** A slot to scroll into view (the one just filled), or null. */
  reveal?: number | null;
}>();
const emit = defineEmits<{ select: [tab: string]; use: [slot: InvSlot]; move: [from: number, to: number] }>();

const COLS = 4;
const ROW_PX = 39;
const VISIBLE_ROWS = 6;

const grid = ref<HTMLElement | null>(null);

/** Keeps the slot that was just filled in view without scrolling the whole page. */
watch(
  () => props.reveal,
  async (index) => {
    if (index === null || index === undefined || !grid.value) return;
    await nextTick();
    const top = Math.floor(index / COLS) * ROW_PX;
    const view = grid.value;
    if (top < view.scrollTop) view.scrollTop = top;
    else if (top + ROW_PX > view.scrollTop + VISIBLE_ROWS * ROW_PX) view.scrollTop = top + ROW_PX - VISIBLE_ROWS * ROW_PX;
  },
);

const picked = ref<string | null>(null);
const hovered = ref<InvSlot | null>(null);
const info = computed(() => hovered.value ?? props.slots.find((slot) => slot?.key === picked.value) ?? null);

const iconUrl = (id: number) => `/nx/${id}.png`;

function pick(slot: InvSlot) {
  picked.value = slot.key;
}

/** The slot being dragged, and the slot it is hovering over, for the drag styling. */
const dragFrom = ref<number | null>(null);
const dragOver = ref<number | null>(null);

function onDragStart(event: DragEvent, index: number) {
  dragFrom.value = index;
  hovered.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index)); // Firefox won't start a drag without data
  }
}

function onDragEnd() {
  dragFrom.value = null;
  dragOver.value = null;
}

/** Dropping on another slot moves the item there (or swaps); dropping anywhere else leaves it put. */
function onDrop(index: number) {
  const from = dragFrom.value;
  onDragEnd();
  if (from === null || from === index) return;
  picked.value = null;
  emit('move', from, index);
}
</script>

<template>
  <section class="inv" aria-label="Item Inventory">
    <header class="title">
      <span>Item Inventory</span>
      <span class="x" aria-hidden="true">x</span>
    </header>

    <div class="tabs" role="tablist" aria-label="Inventory tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="tab"
        :class="{ on: tab === active }"
        role="tab"
        type="button"
        :aria-selected="tab === active"
        @click="emit('select', tab)"
      >
        {{ tab }}
      </button>
    </div>

    <div class="page">
      <div ref="grid" class="grid" role="list" @mouseleave="hovered = null">
        <template v-for="(slot, index) in slots" :key="index">
          <button
            v-if="slot"
            class="slot filled"
            :class="{ picked: picked === slot.key, fresh: slot.fresh, dragging: dragFrom === index, over: dragOver === index && dragFrom !== index }"
            type="button"
            role="listitem"
            draggable="true"
            @dragstart="onDragStart($event, index)"
            @dragend="onDragEnd"
            @dragover.prevent="dragOver = index"
            @dragleave="dragOver = null"
            @drop.prevent="onDrop(index)"
            :aria-label="slot.name"
            @click="pick(slot)"
            @dblclick="emit('use', slot)"
            @keydown.enter.prevent="emit('use', slot)"
            @mouseenter="hovered = slot"
            @focus="hovered = slot"
            @blur="hovered = null"
          >
            <img :src="iconUrl(slot.id)" alt="" draggable="false" />
          </button>
          <span
            v-else
            class="slot"
            :class="{ over: dragOver === index }"
            role="presentation"
            @dragover.prevent="dragOver = index"
            @dragleave="dragOver = null"
            @drop.prevent="onDrop(index)"
          />
        </template>
      </div>

      <div class="info" aria-live="polite">
        <template v-if="info">
          <span class="icon"><img :src="iconUrl(info.id)" alt="" draggable="false" /></span>
          <span class="text">
            <strong>{{ info.name }}</strong>
            <small v-if="info.rate !== undefined">Drop rate: {{ info.rate }}%</small>
            <small v-else>Double-click to open.</small>
          </span>
        </template>
        <span v-else class="empty">Hover an item to see what it is.</span>
      </div>

      <footer class="foot"><slot name="footer" /></footer>
    </div>
  </section>
</template>

<style scoped>
.inv {
  --edge: #243247;
  width: 100%;
  max-width: 220px;
  color: #1c2636;
  background: #cfd8e6;
  border: 2px solid var(--edge);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px #f4f7fb, 0 6px 0 rgba(36, 50, 71, 0.35);
  font: 700 12px/1.3 'Nunito', 'Trebuchet MS', system-ui, sans-serif;
  user-select: none;
}
.title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px 2px;
  color: #fff;
  background: linear-gradient(#5a78a6, #34507c);
  border-bottom: 2px solid var(--edge);
  border-radius: 4px 4px 0 0;
  font: 400 13px/1.4 'Lilita One', sans-serif;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 0 #1c2d49;
}
.x { color: #cfd8e6; font: 700 12px/1 'Nunito', sans-serif; }

.tabs { display: flex; gap: 1px; padding: 5px 6px 0; }
.tab {
  flex: 1 1 0;
  min-width: 0;
  padding: 2px 0 1px;
  font: 800 10px/1.4 'Nunito', sans-serif;
  color: #50607a;
  background: #aebbd0;
  border: 1px solid #7d8da6;
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
}
.tab:hover { background: #bccadd; }
.tab.on { color: #1c2636; background: #f6f1e2; border-color: var(--edge); padding-bottom: 3px; margin-bottom: -1px; position: relative; z-index: 1; }
.tab:focus-visible { outline: 2px solid #e8a200; outline-offset: -2px; }

.page { padding: 6px; background: #f6f1e2; border-top: 1px solid var(--edge); border-radius: 0 0 4px 4px; }
.grid {
  display: grid;
  grid-template-columns: repeat(4, 38px);
  grid-auto-rows: 38px;
  justify-content: center;
  gap: 1px;
  /* Six rows show; the rest scroll, like a long bag. */
  max-height: calc(6 * 38px + 5px);
  overflow-y: auto;
  padding: 1px;
  background: #b9b19a;
  border: 1px solid #8f8770;
  scrollbar-width: thin;
}
.slot {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  background: #ebe5d2;
  border: 1px solid #cdc5ac;
  box-shadow: inset 1px 1px 0 #fffdf4, inset -1px -1px 0 #d6cfb8;
  border-radius: 0;
}
.slot.filled { cursor: grab; }
.slot.filled:active { cursor: grabbing; }
.slot.dragging { opacity: 0.4; }
.slot.over { background: #d6ecff; outline: 2px dashed #2f8fe0; outline-offset: -2px; }
.slot.filled:hover { background: #fff7d0; }
.slot.picked { outline: 2px solid #e8a200; outline-offset: -2px; background: #ffedb0; }
.slot.filled:focus-visible { outline: 2px solid #2f8fe0; outline-offset: -2px; }
.slot img { image-rendering: pixelated; transform: scale(1.2); pointer-events: none; }
.slot.fresh { animation: glow 1.4s ease-out 2; }
@keyframes glow { 0%, 100% { box-shadow: inset 1px 1px 0 #fffdf4, inset -1px -1px 0 #d6cfb8; } 50% { box-shadow: inset 0 0 0 2px #ffd54a, 0 0 8px #ffd54a; } }

.info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  margin-top: 6px;
  padding: 5px 6px;
  color: #fff;
  background: rgba(27, 36, 51, 0.92);
  border: 1px solid #0d131d;
  border-radius: 4px;
}
.info .icon { display: grid; place-items: center; flex: none; width: 36px; height: 36px; background: #fff7d8; border-radius: 3px; }
.info .icon img { image-rendering: pixelated; transform: scale(1.2); }
.info .text { display: grid; min-width: 0; }
.info strong { color: #ffe066; font-weight: 800; overflow-wrap: anywhere; }
.info small { color: #d6deea; font-size: 10px; }
.info .empty { color: #a9b6c9; font-size: 11px; }

.foot { margin-top: 6px; }

@media (prefers-reduced-motion: reduce) { .slot.fresh { animation: none; outline: 2px solid #ffd54a; outline-offset: -2px; } }
</style>
