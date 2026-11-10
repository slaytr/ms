/**
 * The loot-box rules, kept pure (no database) so they can be tested: what buying and opening do to a
 * character's saved state. The rules themselves live in web/src (the same code the page uses), which
 * Node runs directly through type stripping.
 */

import { MYSTERY_FASHION_CRATE } from '../../web/src/data/crates.ts';
import { addCrates, crateIndexes, emptyBag, moveSlot, openCratesInBag, parseBag, serializeBag } from '../../web/src/lib/bag.ts';
import { nxCost, openCrates } from '../../web/src/lib/loot-box.ts';
import { nxStatus } from '../../web/src/lib/nx-economy.ts';

/** Slots in the bag: the game's maximum for one tab. */
export const BAG_SIZE = 96;
/** The sizes the shop sells. */
const BUY_COUNTS = new Set([1, 11]);

const crate = MYSTERY_FASHION_CRATE;

const fail = (status, message) => ({ error: { status, message } });

/** A character with nothing bought yet. */
export function freshState() {
  return { bag: emptyBag(BAG_SIZE), spent: 0, opened: 0, lastOpen: [] };
}

/** Rebuilds a saved row (JSON bag, ids) into a state. */
export function stateFromRow(row) {
  return {
    bag: parseBag(row.bag, crate.items, BAG_SIZE),
    spent: Number(row.spent),
    opened: Number(row.opened),
    lastOpen: Array.isArray(row.lastOpen) ? row.lastOpen.filter(Number.isInteger) : [],
  };
}

/**
 * Buys 1 or 11 crates. Needs the NX (earned from `expGained`, less what is already spent) and the bag
 * room; otherwise changes nothing. Returns `{ state }` or `{ error: { status, message } }`.
 */
export function applyBuy(state, count, expGained) {
  if (!BUY_COUNTS.has(count)) return fail(400, 'Crates are sold singly or 11 at a time.');
  const cost = nxCost(crate, count);
  if (cost > nxStatus(expGained, state.spent).balance) return fail(409, 'Not enough NX. Gain more EXP to earn some.');
  const bag = addCrates(state.bag, count);
  if (bag === null) return fail(409, 'Your inventory is full. Open some crates first.');
  return { state: { ...state, bag, spent: state.spent + cost } };
}

/**
 * Opens the crates in the given slots (repeats and slots without a crate are ignored). Each item is
 * rolled here, so a client cannot pick its own prize. Returns `{ state }` or `{ error }`.
 */
export function applyOpen(state, indexes, random = Math.random) {
  const wanted = new Set(indexes);
  const targets = crateIndexes(state.bag).filter((index) => wanted.has(index));
  if (targets.length === 0) return fail(409, 'There is no crate in those slots.');
  const rolled = openCrates(crate.items, targets.length, random);
  const { bag, placed } = openCratesInBag(state.bag, targets, rolled);
  const given = rolled.slice(0, placed.length);
  return { state: { ...state, bag, opened: state.opened + placed.length, lastOpen: given.map((item) => item.id) } };
}

/** Moves the item or crate in slot `from` to slot `to` (swapping if that is filled). Returns `{ state }` or `{ error }`. */
export function applyMove(state, from, to) {
  const bag = moveSlot(state.bag, from, to);
  if (bag === null) return fail(409, 'There is nothing in that slot to move.');
  return { state: { ...state, bag } };
}

/** What the page is sent: the NX picture, the bag in stored form, and the last opening. */
export function lootView(state, expGained) {
  return {
    nx: nxStatus(expGained, state.spent),
    bag: serializeBag(state.bag),
    opened: state.opened,
    lastOpen: state.lastOpen,
  };
}
