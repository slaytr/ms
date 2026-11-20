import rows from '../data/merch-items.json';

/**
 * Every item cozy.markets had seen in shops when the catalog was pulled (2,140), with its icon copied to
 * /merch/<id>.png. cozy.markets can't be queried live (no CORS, Cloudflare in front of scripts), so the list is
 * bundled. A name that isn't here can still be tracked, just without a picture.
 */
export interface CatalogItem {
  readonly id: number;
  readonly name: string;
  readonly category: string;
}

const ITEMS: readonly CatalogItem[] = (rows as unknown as readonly (readonly [number, string, string])[]).map(([id, name, category]) => ({
  id,
  name,
  category,
}));
const LOWER = ITEMS.map((i) => i.name.toLowerCase());

export function iconUrl(catalogId: number): string {
  return `/merch/${catalogId}.png`;
}

export function catalogSize(): number {
  return ITEMS.length;
}

/** The catalog item with exactly this name (ignoring case and extra spaces), if any. */
export function findByName(name: string): CatalogItem | null {
  const wanted = name.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!wanted) return null;
  const at = LOWER.indexOf(wanted);
  return at >= 0 ? ITEMS[at] : null;
}

/**
 * Items matching what the player has typed, best first: exact name, then names starting with it, then names with a
 * word starting with it, then names containing it. Every word typed must appear, in any order.
 */
export function searchCatalog(query: string, limit = 8): readonly CatalogItem[] {
  const q = query.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!q) return [];
  const words = q.split(' ');
  const ranked: { item: CatalogItem; rank: number }[] = [];
  for (let i = 0; i < ITEMS.length; i += 1) {
    const name = LOWER[i];
    if (!words.every((w) => name.includes(w))) continue;
    const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(` ${q}`) ? 2 : 3;
    ranked.push({ item: ITEMS[i], rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name));
  return ranked.slice(0, limit).map((r) => r.item);
}
