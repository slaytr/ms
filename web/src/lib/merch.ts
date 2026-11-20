/**
 * Merching ledger: what you bought and sold, per item, and the profit that makes. Pure logic, no browser APIs
 * except the guarded localStorage helpers at the bottom. Nothing leaves the browser.
 *
 * Cost is tracked by AVERAGE COST: buying 10 at 100 then 10 at 200 leaves 20 held at 150 each. A sale realises
 * (sell price - average cost) per unit, and leaves the average cost of what is still held unchanged.
 */

export type TradeKind = 'buy' | 'sell';

export interface Trade {
  readonly id: string;
  readonly kind: TradeKind;
  readonly qty: number;
  /** Meso per unit. */
  readonly price: number;
  /** Epoch ms. */
  readonly at: number;
}

export interface MerchItem {
  /** `c:<cozy id>` for a catalog item, `n:<lowercase name>` for one we have no picture of. */
  readonly key: string;
  readonly name: string;
  /** The cozy.markets item id (its icon is at /merch/<id>.png), or null for a custom item. */
  readonly catalogId: number | null;
  /** In the order they happened. */
  readonly trades: readonly Trade[];
}

export interface Position {
  readonly held: number;
  /** Average meso per held unit (0 when nothing is held). */
  readonly avgCost: number;
  /** What the held units cost: held x avgCost. */
  readonly heldCost: number;
  readonly bought: number;
  readonly spent: number;
  readonly sold: number;
  readonly revenue: number;
  /** Profit on what has been sold, against its average cost at the time. Negative is a loss. */
  readonly profit: number;
  /** profit / revenue, or null before anything is sold (or when sales brought in nothing). */
  readonly margin: number | null;
}

export const MAX_QTY = 1_000_000_000;
export const MAX_PRICE = 1_000_000_000_000;
const MAX_NAME_LENGTH = 60;
const MAX_ITEMS = 500;
const MAX_TRADES_PER_ITEM = 2000;

export function itemKey(name: string, catalogId: number | null): string {
  return catalogId === null ? `n:${name.trim().toLowerCase()}` : `c:${catalogId}`;
}

/** Replays an item's trades in order. Trades are validated on the way in, so a sell never exceeds what is held. */
export function positionOf(trades: readonly Trade[]): Position {
  let held = 0;
  let heldCost = 0;
  let bought = 0;
  let spent = 0;
  let sold = 0;
  let revenue = 0;
  let profit = 0;
  for (const t of trades) {
    if (t.kind === 'buy') {
      held += t.qty;
      heldCost += t.qty * t.price;
      bought += t.qty;
      spent += t.qty * t.price;
    } else {
      const qty = Math.min(t.qty, held);
      const avg = held > 0 ? heldCost / held : 0;
      profit += qty * (t.price - avg);
      heldCost -= qty * avg;
      held -= qty;
      sold += qty;
      revenue += qty * t.price;
    }
  }
  if (held === 0) heldCost = 0; // drop floating point crumbs once everything is sold
  return {
    held,
    avgCost: held > 0 ? heldCost / held : 0,
    heldCost,
    bought,
    spent,
    sold,
    revenue,
    profit,
    margin: sold > 0 && revenue > 0 ? profit / revenue : null,
  };
}

export interface Totals {
  readonly invested: number;
  readonly revenue: number;
  readonly profit: number;
  readonly margin: number | null;
  readonly heldCost: number;
  readonly itemsHeld: number;
}

/** The whole ledger at a glance. `invested` is what the units still held cost. */
export function totalsOf(items: readonly MerchItem[]): Totals {
  let heldCost = 0;
  let revenue = 0;
  let profit = 0;
  let itemsHeld = 0;
  for (const item of items) {
    const p = positionOf(item.trades);
    heldCost += p.heldCost;
    revenue += p.revenue;
    profit += p.profit;
    if (p.held > 0) itemsHeld += 1;
  }
  return { invested: heldCost, revenue, profit, margin: revenue > 0 ? profit / revenue : null, heldCost, itemsHeld };
}

/**
 * Reads a meso amount the way players write it: "1500", "1,500", "1.5k", "2m", "1.2b". Returns null for anything
 * that isn't a positive whole number of meso once the suffix is applied.
 */
export function parseMeso(text: string): number | null {
  const match = /^(\d[\d,]*(?:\.\d+)?)\s*([kmb])?$/i.exec(text.trim().replace(/\s+/g, ' '));
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  const value = Math.round(base * mult);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/** A whole-number quantity ("1,000" is fine), or null. */
export function parseQty(text: string): number | null {
  const clean = text.trim().replace(/,/g, '');
  if (!/^\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/** Why a trade can't be recorded, or null when it can. */
export function tradeProblem(item: MerchItem | null, kind: TradeKind, qty: number | null, price: number | null): string | null {
  if (qty === null) return 'Enter a quantity (a whole number, 1 or more).';
  if (price === null) return 'Enter a price per item in meso (e.g. 1500, 12k or 1.5m).';
  if (qty > MAX_QTY) return 'That quantity is too large.';
  if (price > MAX_PRICE) return 'That price is too large.';
  if (kind === 'sell') {
    const held = item ? positionOf(item.trades).held : 0;
    if (qty > held) return held === 0 ? 'You have none of this item to sell.' : `You only hold ${held.toLocaleString()}.`;
  }
  return null;
}

export function cleanName(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/** The ledger after a trade. Creates the item on its first buy; returns the ledger untouched if the trade isn't allowed. */
export function withTrade(
  items: readonly MerchItem[],
  ref: { readonly name: string; readonly catalogId: number | null },
  kind: TradeKind,
  qty: number,
  price: number,
  now: number,
): readonly MerchItem[] {
  const name = cleanName(ref.name);
  if (!name) return items;
  const key = itemKey(name, ref.catalogId);
  const existing = items.find((i) => i.key === key) ?? null;
  if (tradeProblem(existing, kind, qty, price) !== null) return items;
  if (existing === null && (kind === 'sell' || items.length >= MAX_ITEMS)) return items;
  if (existing && existing.trades.length >= MAX_TRADES_PER_ITEM) return items;

  const trade: Trade = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, kind, qty, price, at: now };
  if (existing === null) return [{ key, name, catalogId: ref.catalogId, trades: [trade] }, ...items];
  return items.map((i) => (i.key === key ? { ...i, trades: [...i.trades, trade] } : i));
}

/** The ledger without an item's most recent trade (the item goes too if that was its only one). */
export function withoutLastTrade(items: readonly MerchItem[], key: string): readonly MerchItem[] {
  return items.flatMap((i) => {
    if (i.key !== key) return [i];
    const trades = i.trades.slice(0, -1);
    return trades.length > 0 ? [{ ...i, trades }] : [];
  });
}

export function withoutItem(items: readonly MerchItem[], key: string): readonly MerchItem[] {
  return items.filter((i) => i.key !== key);
}

// ---- storage ---------------------------------------------------------------------------------------------

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'maple-metrics:merch';

function parseTrade(raw: unknown): Trade | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= max ? v : null);
  const qty = whole(t.qty, MAX_QTY);
  const price = whole(t.price, MAX_PRICE);
  if ((t.kind !== 'buy' && t.kind !== 'sell') || qty === null || price === null) return null;
  return {
    id: typeof t.id === 'string' && t.id.length <= 40 ? t.id : Math.random().toString(36).slice(2),
    kind: t.kind,
    qty,
    price,
    at: typeof t.at === 'number' && Number.isFinite(t.at) ? t.at : 0,
  };
}

/** Parses saved JSON, dropping anything malformed, and any sell that would exceed what was held at that point. */
export function parseMerch(raw: unknown): readonly MerchItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: MerchItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? cleanName(e.name) : '';
    const catalogId = typeof e.catalogId === 'number' && Number.isSafeInteger(e.catalogId) ? e.catalogId : null;
    if (!name || !Array.isArray(e.trades)) continue;
    const key = itemKey(name, catalogId);
    if (seen.has(key)) continue;
    let held = 0;
    const trades: Trade[] = [];
    for (const rawTrade of e.trades.slice(0, MAX_TRADES_PER_ITEM)) {
      const trade = parseTrade(rawTrade);
      if (trade === null || (trade.kind === 'sell' && trade.qty > held)) continue;
      held += trade.kind === 'buy' ? trade.qty : -trade.qty;
      trades.push(trade);
    }
    if (trades.length === 0) continue;
    seen.add(key);
    items.push({ key, name, catalogId, trades });
  }
  return items;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked (private mode / disabled cookies)
  }
}

export function loadMerch(store: KeyValueStore | null = defaultStore()): readonly MerchItem[] {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return raw ? parseMerch(JSON.parse(raw)) : [];
  } catch {
    return []; // corrupt JSON or blocked storage: behave as an empty ledger
  }
}

/** Returns false when the ledger could not be saved (storage full or blocked), so the page can say so. */
export function saveMerch(items: readonly MerchItem[], store: KeyValueStore | null = defaultStore()): boolean {
  try {
    if (store === null) return false;
    store.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}
