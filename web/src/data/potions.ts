/**
 * Recovery items (HP/MP potions and food) for MapleStory Classic World, for the pot-use tracker.
 *
 * Sources, fetched 2026-11-09 from ms-classic.com (its robots.txt allows this): the potions guide and one
 * page per item. Restore amounts and NPC sell prices come from the game data (v1.0.0 Grand Launch). Shop
 * BUY prices are not in the game data: they are community records from Founder's Access (v0.9.0) that match
 * across independent shop lists, so they may have changed at launch. Check a price in the shop before relying on it.
 *
 * Reading the fields:
 *  - `hp` / `mp`: flat amount restored. `hpPercent` / `mpPercent`: share of max HP/MP (elixirs, ramen), so the
 *    amount depends on the character.
 *  - `buyPrice`: the lowest NPC price anyone can pay (citizenship-gated shops only count if nothing else sells it).
 *    null when no NPC sells it (drops, quest rewards, event items), so a meso cost can't be worked out.
 *  - `shops`: every NPC that sells it, with notes such as "Citizenship grade 10+". Prices can differ by NPC
 *    (Unagi is 1,000 mesos at three shops but 1,800 at Mr. Sweatbottom).
 *  - `sellPrice`: what an NPC pays for one.
 *  - `id`: the game's item id (also the icon's file name on the source site).
 */

export interface PotionShop {
  readonly npc: string;
  readonly where: string;
  readonly price: number;
  readonly note?: string;
}

export interface Potion {
  readonly id: number;
  readonly name: string;
  readonly hp?: number;
  readonly mp?: number;
  readonly hpPercent?: number;
  readonly mpPercent?: number;
  readonly sellPrice: number | null;
  readonly buyPrice: number | null;
  readonly shops: readonly PotionShop[];
}

export const POTIONS: readonly Potion[] = [
  { id: 2000000, name: "Red Potion", hp: 100, sellPrice: 5, buyPrice: 50, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 50 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 50 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 50 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 50 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 50 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 50 }] },
  { id: 2000001, name: "Orange Potion", hp: 250, sellPrice: 15, buyPrice: 150, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 150 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 150 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 150 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 150 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 150 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 150 }] },
  { id: 2000002, name: "White Potion", hp: 500, sellPrice: 35, buyPrice: 350, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 350 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 350 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 350 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 350 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 350 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 350 }] },
  { id: 2000003, name: "Blue Potion", mp: 200, sellPrice: 22, buyPrice: 220, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 220 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 220 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 220 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 220 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 220 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 220 }] },
  { id: 2000004, name: "Elixir", hpPercent: 35, mpPercent: 35, sellPrice: 500, buyPrice: 3000, shops: [{ npc: "Max", where: "Kerning City Civic Center, Kerning City", price: 3000, note: "Citizenship grade 10+" }, { npc: "Raymond", where: "Henesys Town Hall, Henesys", price: 3000, note: "Citizenship grade 10+" }] },
  { id: 2000005, name: "Power Elixir", hpPercent: 100, mpPercent: 100, sellPrice: 2500, buyPrice: null, shops: [] },
  { id: 2000006, name: "Mana Elixir", mpPercent: 50, sellPrice: 1000, buyPrice: null, shops: [] },
  { id: 2010001, name: "Apple", hp: 40, sellPrice: 2, buyPrice: 20, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 20 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 20 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 20 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 20 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 20 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 30 }] },
  { id: 2010002, name: "Egg", hp: 60, sellPrice: 3, buyPrice: 30, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 30 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 30 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 30 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 30 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 30 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 30 }] },
  { id: 2010003, name: "Meat", hp: 160, sellPrice: 8, buyPrice: 80, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 80 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 80 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 80 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 80 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 80 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 80 }] },
  { id: 2010004, name: "Orange", mp: 50, sellPrice: 5, buyPrice: 50, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 50 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 50 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 50 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 50 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 50 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 50 }] },
  { id: 2010005, name: "Lemon", mp: 150, sellPrice: 15, buyPrice: 150, shops: [{ npc: "Arturo", where: "Perion Department Store, Perion", price: 150 }, { npc: "Dr. Faymus", where: "Kerning City Pharmacy, Kerning City", price: 150 }, { npc: "Len the Fairy", where: "Ellinia Department Store, Ellinia", price: 150 }, { npc: "Luna", where: "Henesys Department Store, Henesys", price: 150 }, { npc: "Mina", where: "Lith Harbor Department Store, Lith Harbor", price: 150 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 150 }] },
  { id: 2010006, name: "Watermelon", hp: 800, mp: 800, sellPrice: 192, buyPrice: null, shops: [] },
  { id: 2020000, name: "Salad", mp: 200, sellPrice: 22, buyPrice: 220, shops: [{ npc: "24 Hr Mobile Store", where: "Ant Tunnel Park, Sleepywood", price: 220 }, { npc: "Max", where: "Kerning City Civic Center, Kerning City", price: 220, note: "Citizenship grade 2+" }, { npc: "Raymond", where: "Henesys Town Hall, Henesys", price: 220, note: "Citizenship grade 2+" }] },
  { id: 2020001, name: "Fried Chicken", hp: 120, sellPrice: 6, buyPrice: 60, shops: [{ npc: "24 Hr Mobile Store", where: "Ant Tunnel Park, Sleepywood", price: 60 }, { npc: "Max", where: "Kerning City Civic Center, Kerning City", price: 60, note: "Citizenship grade 1+" }, { npc: "Raymond", where: "Henesys Town Hall, Henesys", price: 60, note: "Citizenship grade 1+" }] },
  { id: 2020002, name: "Cake", hp: 100, mp: 100, sellPrice: 15, buyPrice: 150, shops: [{ npc: "24 Hr Mobile Store", where: "Ant Tunnel Park, Sleepywood", price: 150 }] },
  { id: 2020003, name: "Pizza", hp: 360, sellPrice: 25, buyPrice: 252, shops: [{ npc: "24 Hr Mobile Store", where: "Ant Tunnel Park, Sleepywood", price: 252 }, { npc: "Max", where: "Kerning City Civic Center, Kerning City", price: 252, note: "Citizenship grade 4+" }, { npc: "Raymond", where: "Henesys Town Hall, Henesys", price: 252, note: "Citizenship grade 4+" }] },
  { id: 2020009, name: "Orange Juice", mp: 450, sellPrice: 54, buyPrice: 540, shops: [{ npc: "Max", where: "Kerning City Civic Center, Kerning City", price: 540, note: "Citizenship grade 6+" }, { npc: "Raymond", where: "Henesys Town Hall, Henesys", price: 540, note: "Citizenship grade 6+" }] },
  { id: 2020010, name: "Grape Juice", mp: 900, sellPrice: 126, buyPrice: 1260, shops: [{ npc: "Max", where: "Kerning City Civic Center, Kerning City", price: 1260, note: "Citizenship grade 9+" }, { npc: "Raymond", where: "Henesys Town Hall, Henesys", price: 1260, note: "Citizenship grade 9+" }] },
  { id: 2020011, name: "W Ramen", hpPercent: 40, mpPercent: 40, sellPrice: 200, buyPrice: null, shops: [] },
  { id: 2020016, name: "Sunrise Dew", mp: 2000, sellPrice: 300, buyPrice: null, shops: [] },
  { id: 2020017, name: "Sunset Dew", mp: 2500, sellPrice: 375, buyPrice: null, shops: [] },
  { id: 2022000, name: "Pure Water", mp: 800, sellPrice: 112, buyPrice: 1120, shops: [{ npc: "24 Hr Mobile Store", where: "Ant Tunnel Park, Sleepywood", price: 1120 }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 1120 }] },
  { id: 2022003, name: "Unagi", hp: 1000, sellPrice: 100, buyPrice: 1000, shops: [{ npc: "24 Hr Mobile Store", where: "Ant Tunnel Park, Sleepywood", price: 1000 }, { npc: "Max", where: "Kerning City Civic Center, Kerning City", price: 1000, note: "Citizenship grade 8+" }, { npc: "Raymond", where: "Henesys Town Hall, Henesys", price: 1000, note: "Citizenship grade 8+" }, { npc: "Mr. Sweatbottom", where: "Regular Sauna, Sleepywood", price: 1800 }] },
];

const BY_ID: ReadonlyMap<number, Potion> = new Map(POTIONS.map((potion) => [potion.id, potion]));

export function potionById(id: number): Potion | null {
  return BY_ID.get(id) ?? null;
}

export interface Restored {
  /** Null when the potion doesn't restore HP, or restores a percentage and the max HP isn't known. */
  readonly hp: number | null;
  readonly mp: number | null;
}

/**
 * What `count` of a potion restores in total. Percentage potions need the character's max HP/MP; without
 * them that figure is null (never a guess).
 */
export function restoredBy(potion: Potion, count: number, maxHp: number | null = null, maxMp: number | null = null): Restored {
  const amount = (flat: number | undefined, percent: number | undefined, max: number | null): number | null => {
    if (flat !== undefined) return flat * count;
    if (percent !== undefined && max !== null) return Math.floor((max * percent) / 100) * count;
    return null;
  };
  return { hp: amount(potion.hp, potion.hpPercent, maxHp), mp: amount(potion.mp, potion.mpPercent, maxMp) };
}

/** Mesos spent buying `count` of a potion from an NPC, or null when no NPC sells it. */
export function mesoCost(potion: Potion, count: number): number | null {
  return potion.buyPrice === null ? null : potion.buyPrice * count;
}
