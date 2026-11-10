#!/usr/bin/env node
/**
 * Builds web/src/lib/detect/inventory-templates.json: what the Use-tab and quick-slot readers need to know.
 *
 *  - Stack-count digits are learned from frames labelled in fixtures/labels.json:
 *      useTab:     a 6 x 5 grid of the inventory's Use tab (rows of slots, top to bottom), and
 *      quickSlots: a 2 x 4 grid of the quick-slot bar.
 *    Each cell is "Item name:count", "?:count" for an item we don't track, "?" for a slot with an icon but
 *    no count (a skill), or "-" for an empty slot. Every glyph of a labelled count is filed under its digit.
 *    The two grids are learned into separate digit sets: same font, but different shading and background.
 *  - Item icons come from the PNGs in fixtures/potion-icons/ (named by item id, gitignored), turned
 *    into compact templates of their fully opaque pixels.
 *
 * Re-run after labelling more frames. It lists the digits that still have no template, and every slot it
 * could not learn from.
 *
 * Usage: node scripts/harvest-inventory.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { detectFrame } from '../web/src/lib/detect/detect.ts';
import { loadFrame, FIXTURES_DIR } from '../web/src/lib/detect/fixture-io.ts';
import { digitGlyphs, digitMask, mismatchAt, slotOrigin, useTabSelected, INVENTORY } from '../web/src/lib/detect/inventory.ts';
import { quickSlotOrigin } from '../web/src/lib/detect/quickslots.ts';
import { quickSlotRegion, unscaleColourRegions } from '../web/src/lib/detect/unscale-frame.ts';
import { parseTemplates } from '../web/src/lib/detect/templates.ts';
import { POTIONS } from '../web/src/data/potions.ts';

const { PNG } = createRequire(import.meta.url)('pngjs');

const OUT = join(import.meta.dirname, '..', 'web', 'src', 'lib', 'detect', 'inventory-templates.json');
const ICON_DIR = join(FIXTURES_DIR, 'potion-icons');
const templates = parseTemplates(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'web', 'src', 'lib', 'detect', 'templates.json'), 'utf8')));
const labels = JSON.parse(readFileSync(join(FIXTURES_DIR, 'labels.json'), 'utf8'));

const MAX_DIGIT_WIDTH = 7;
/** A '1' with its flag is 3 wide; every other digit is at least 5. Anything narrower is a fragment (a damaged piece of a digit) that would match the edge of real ones. */
const minWidth = (digit) => (digit === '1' ? 3 : 5);
/** A learned shape may differ from its nearest known rendering by this many pixels (it is the highlight noise we are learning). */
const MAX_NOISY_DIFF = 6;
/** The quick slots fade the lower rows of each digit to grey and sit on bright icons, so a seed from the Use tab is further off. */
const MAX_NOISY_DIFF_SEEDED = 12;
/** ...but must be at least this much nearer its own digit than any other digit, as the reader requires. */
const MARGIN = 3;

const problems = [];
const nameToId = new Map(POTIONS.map((p) => [p.name, p.id]));

/** Blank columns before a template's first ink. */
const leadOf = (template) => {
  for (let col = 0; col < template[0].length; col++) if (template.some((r) => r[col] === '#')) return col;
  return 0;
};

/**
 * Learns one set of digit shapes (the Use tab's, or the quick slots'). A slot is learned in a first pass when its
 * glyphs come out clean; one fused with a highlight from the icon waits for the second pass, which places each
 * digit by sliding the known renderings over the mask (the label says which digit comes next) and files the shape
 * found there, noise and all. The same icon draws the same highlights in the same place every time, so the next
 * such slot matches it exactly.
 */
function createLearner(name, seed = {}) {
  /** digit -> Map(bitmap key -> bitmap) */
  const digits = new Map();
  /** Shapes from another set of the same font, used only to place digits (never shipped as this set's own). */
  const seeds = new Map(Object.entries(seed));
  const maxDiff = Object.keys(seed).length > 0 ? MAX_NOISY_DIFF_SEEDED : MAX_NOISY_DIFF;
  const retry = [];

  function fileDigit(digit, glyph, where) {
    const key = glyph.join('/');
    for (const [other, shapes] of digits) {
      if (other !== digit && shapes.has(key)) problems.push(`${where}: this shape is filed under both "${other}" and "${digit}"`);
    }
    const shapes = digits.get(digit) ?? new Map();
    shapes.set(key, glyph);
    digits.set(digit, shapes);
  }

  function learnClean(slot) {
    const { frame, origin, count, where } = slot;
    const glyphs = digitGlyphs(frame, origin);
    // Extra ink after the count is the icon's own highlight; the reader ignores it, so learn from the leading glyphs.
    const lead = glyphs.slice(0, count.length);
    if (glyphs.length < count.length || lead.some((g, i) => g[0].length > MAX_DIGIT_WIDTH || g[0].length < minWidth(count[i]))) {
      retry.push(slot);
      return;
    }
    lead.forEach((glyph, i) => fileDigit(count[i], glyph, where));
  }

  function learnWithLabel({ frame, origin, count, where }) {
    const mask = digitMask(frame, origin);
    const learned = [];
    let from = 0;
    let within = 5;
    for (const ch of count) {
      const own = [...(digits.get(ch)?.values() ?? []), ...(seeds.get(ch) ?? [])];
      if (own.length === 0) return `${where}: no ${name} template for "${ch}" yet, skipped.`;
      let best = null;
      for (let start = from; start <= from + within + 3 && start < mask[0].length; start++) {
        for (const r of own) {
          const at = start - leadOf(r);
          if (at < 0 || !mask.some((m) => m[start] === '#')) continue;
          const d = mismatchAt(mask, at, r);
          if (!best || d < best.d) best = { d, at, w: r[0].length };
        }
      }
      if (!best || best.d > maxDiff) return `${where}: couldn't place "${ch}" within ${maxDiff} pixels, skipped.`;
      const glyph = mask.map((m) => m.slice(best.at, best.at + best.w));
      const others = [...digits, ...seeds].filter(([d]) => d !== ch).flatMap(([, shapes]) => [...shapes.values()]);
      const nearestOther = Math.min(...others.map((r) => mismatchAt(mask, best.at, r)));
      // The label says which digit this is; what matters is that the shape, once learned, can never be confused with another digit.
      if (nearestOther < MARGIN) return `${where}: the "${ch}" would sit within ${nearestOther} pixels of another digit, skipped.`;
      learned.push([ch, glyph]);
      from = best.at + best.w;
      within = 4;
    }
    learned.forEach(([ch, glyph]) => fileDigit(ch, glyph, where));
    return null;
  }

  return {
    name,
    digits,
    learn: learnClean,
    /**
     * Retries the skipped slots until a pass learns nothing new. A rendering learned from one slot (say a 7 over the
     * orange icon) can unlock another that was too noisy to place before, so one pass in file order is not enough.
     */
    finish: () => {
      let waiting = retry;
      let reasons = [];
      for (let pass = 0; pass < 6; pass++) {
        const still = [];
        reasons = [];
        for (const slot of waiting) {
          const why = learnWithLabel(slot);
          if (why) {
            still.push(slot);
            reasons.push(why);
          }
        }
        if (still.length === waiting.length) break;
        waiting = still;
        if (waiting.length === 0) break;
      }
      problems.push(...reasons);
    },
    result: () => Object.fromEntries([...digits].sort(([a], [b]) => a.localeCompare(b)).map(([digit, shapes]) => [digit, [...shapes.values()]])),
  };
}

const useTabLearner = createLearner('Use tab');
let quickLearner = null;

/** Feeds a labelled grid to a learner, given where each slot's top-left is. */
function learnGrid(learner, file, frame, grid, originOf) {
  grid.forEach((rowCells, row) =>
    rowCells.forEach((cell, col) => {
      if (cell === '-' || cell === '?') return;
      const [name, count] = cell.split(':');
      const where = `${file} [${row},${col}] "${cell}"`;
      if (name !== '?' && !nameToId.has(name)) problems.push(`${where}: unknown item "${name}".`);
      if (count !== undefined) learner.learn({ frame, origin: originOf(row, col), count, where });
    }),
  );
}

/** Quick-slot cells wait until the Use-tab digits exist, since those seed their placement. */
const quickSlots = [];
function queueGrid(into, file, frame, grid, originOf) {
  grid.forEach((rowCells, row) =>
    rowCells.forEach((cell, col) => {
      if (cell === '-' || cell === '?') return;
      const [name, count] = cell.split(':');
      const where = `${file} [${row},${col}] "${cell}"`;
      if (name !== '?' && !nameToId.has(name)) problems.push(`${where}: unknown item "${name}".`);
      if (count !== undefined) into.push({ frame, origin: originOf(row, col), count, where });
    }),
  );
}

for (const [file, label] of Object.entries(labels)) {
  if (!file.endsWith('.png')) continue;
  if (!label.useTab && !label.quickSlots) continue;
  if (label.lossy) continue; // a compressed capture's digit shapes are noisy: it tests the reader but never teaches it
  const frame = loadFrame(file);
  const state = detectFrame(frame, templates).state;

  if (label.useTab) {
    if (!state.mesos) problems.push(`${file}: MESOS label not found, Use tab skipped.`);
    else if (!useTabSelected(frame, state.mesos)) problems.push(`${file}: the Use tab does not look selected, skipped.`);
    else learnGrid(useTabLearner, file, frame, label.useTab, (row, col) => slotOrigin(state.mesos, row, col));
  }
  if (label.quickSlots) {
    if (!state.exp) problems.push(`${file}: no EXP label found, quick slots skipped.`);
    else {
      // A taller window draws the bar scaled up; learn from it as the reader will see it, unscaled to native pixels.
      const source = state.view ? unscaleColourRegions(frame, state.view, [quickSlotRegion(state.exp)]) : frame;
      queueGrid(quickSlots, file, source, label.quickSlots, (row, col) => quickSlotOrigin(state.exp, row, col));
    }
  }
}

useTabLearner.finish();
quickLearner = createLearner('quick slot', useTabLearner.result());
for (const slot of quickSlots) quickLearner.learn(slot);
quickLearner.finish();

/** Width of the window after the last digit that is kept as a known harmless remnant (matches TAIL_WIDTH in inventory.ts). */
const TAIL_WIDTH = 8;

/**
 * What is left after the last digit of a labelled quick-slot count: the icon's own highlights, which it draws the same
 * every time. Only taken from slots where the learned digits place exactly (within 2 pixels), so it never comes from a
 * misread. The strict reader then ignores a remnant it has seen before, and still refuses an unfamiliar one.
 */
function tailAfter({ frame, origin, count }) {
  const mask = digitMask(frame, origin);
  let from = 0;
  let within = 5;
  for (const ch of count) {
    const own = [...(quickLearner.digits.get(ch)?.values() ?? [])];
    let best = null;
    for (let start = from; start <= from + within + 3 && start < mask[0].length; start++) {
      for (const r of own) {
        const at = start - leadOf(r);
        if (at < 0 || !mask.some((m) => m[start] === '#')) continue;
        const d = mismatchAt(mask, at, r);
        if (!best || d < best.d) best = { d, at, w: r[0].length };
      }
    }
    if (!best || best.d > 2) return null;
    from = best.at + best.w;
    within = 4;
  }
  const window = mask.map((m) => m.slice(from, from + TAIL_WIDTH).padEnd(TAIL_WIDTH, '.'));
  return window.some((m) => m.includes('#')) ? window : null;
}

const quickTails = [...new Map(quickSlots.map(tailAfter).filter(Boolean).map((w) => [w.join('/'), w])).values()];

const icons = readdirSync(ICON_DIR)
  .filter((f) => f.endsWith('.png'))
  .sort()
  .map((f) => {
    const png = PNG.sync.read(readFileSync(join(ICON_DIR, f)));
    return { id: Number(f.replace('.png', '')), w: png.width, h: png.height, rgba: Buffer.from(png.data).toString('base64') };
  });

const out = { version: 1, digits: useTabLearner.result(), icons, quickDigits: quickLearner.result(), quickTails };
writeFileSync(OUT, `${JSON.stringify(out)}\n`);

console.log(`wrote ${OUT}`);
console.log(`quick-slot harmless remnants learned: ${quickTails.length}`);
console.log(`icons: ${icons.length} (slot ${INVENTORY.size}px, search around bottom-centre)`);
for (const [title, learner] of [['digits (Use tab)', useTabLearner], ['quickDigits    ', quickLearner]]) {
  const have = [...learner.digits.keys()];
  console.log(`${title} have: ${have.sort().join(' ')}   MISSING: ${'0123456789'.split('').filter((d) => !have.includes(d)).join(' ') || 'none'}`);
  for (const [digit, shapes] of learner.digits) if (shapes.size > 1) console.log(`  note: ${learner.name} "${digit}" has ${shapes.size} renderings`);
}
if (problems.length) console.log(`\nProblems:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
