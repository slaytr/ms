#!/usr/bin/env node
/**
 * Builds web/src/lib/detect/inventory-templates.json: what the Use-tab reader needs to know.
 *
 *  - Stack-count digits are learned from frames labelled with `useTab` in fixtures/labels.json: a
 *    6 x 5 grid (rows of slots, top to bottom), each cell "Item name:count", "?:count" for an item we
 *    don't track, or "-" for an empty slot. Every glyph of a labelled count is filed under its digit.
 *    A slot whose glyph count differs from its label is reported and skipped; one shape filed under two
 *    digits is reported as a conflict.
 *  - Item icons come from the PNGs in fixtures/potion-icons/ (named by item id, gitignored), turned
 *    into compact templates of their fully opaque pixels.
 *
 * Re-run after labelling more frames. It lists the digits that still have no template.
 *
 * Usage: node scripts/harvest-inventory.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { detectFrame } from '../web/src/lib/detect/detect.ts';
import { loadFrame, FIXTURES_DIR } from '../web/src/lib/detect/fixture-io.ts';
import { digitGlyphs, digitMask, mismatchAt, slotOrigin, useTabSelected, INVENTORY } from '../web/src/lib/detect/inventory.ts';
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
const problems = [];
/** Slots the plain pass skipped (an icon's highlight fused with the digits); the second pass learns them with the label's help. */
const retry = [];
/** digit -> Map(bitmap key -> bitmap) */
const digits = new Map();
const nameToId = new Map(POTIONS.map((p) => [p.name, p.id]));

function fileDigit(digit, glyph, where) {
  const key = glyph.join('/');
  for (const [other, shapes] of digits) {
    if (other !== digit && shapes.has(key)) problems.push(`${where}: this shape is filed under both "${other}" and "${digit}"`);
  }
  const shapes = digits.get(digit) ?? new Map();
  shapes.set(key, glyph);
  digits.set(digit, shapes);
}

for (const [file, label] of Object.entries(labels)) {
  if (!file.endsWith('.png') || !label.useTab) continue;
  const frame = loadFrame(file);
  const mesos = detectFrame(frame, templates).state.mesos;
  if (!mesos) {
    problems.push(`${file}: MESOS label not found, skipped.`);
    continue;
  }
  if (!useTabSelected(frame, mesos)) {
    problems.push(`${file}: the Use tab does not look selected, skipped.`);
    continue;
  }
  label.useTab.forEach((rowCells, row) =>
    rowCells.forEach((cell, col) => {
      if (cell === '-') return;
      const [name, count] = cell.split(':');
      if (name !== '?' && !nameToId.has(name)) problems.push(`${file} [${row},${col}]: unknown item "${name}".`);
      const glyphs = digitGlyphs(frame, slotOrigin(mesos, row, col));
      // Extra ink after the count is the icon's own highlight; the reader ignores it, so learn from the leading glyphs.
      // Fewer glyphs than digits (or one fused with a highlight) can't be learned from.
      const lead = glyphs.slice(0, count.length);
      if (glyphs.length < count.length || lead.some((g, i) => g[0].length > MAX_DIGIT_WIDTH || g[0].length < minWidth(count[i]))) {
        retry.push({ file, frame, mesos, row, col, cell, count });
        return;
      }
      lead.forEach((glyph, i) => fileDigit(count[i], glyph, `${file} [${row},${col}]`));
    }),
  );
}

/** Blank columns before a template's first ink. */
const leadOf = (template) => {
  for (let col = 0; col < template[0].length; col++) if (template.some((r) => r[col] === '#')) return col;
  return 0;
};

/** A learned shape may differ from its nearest known rendering by this many pixels (it is the highlight noise we are learning). */
const MAX_NOISY_DIFF = 6;
/** ...but must be at least this much nearer its own digit than any other digit, as the reader requires. */
const MARGIN = 3;

/**
 * Learns the digits of a labelled count whose glyphs fused with highlights from the icon. The label says
 * which digit comes next, so each one is placed by sliding its known renderings over the mask, and the
 * shape found there (noise and all) is filed as a new rendering. The same icon draws the same highlights
 * at the same place every time, so the next such slot matches it exactly.
 */
function learnWithLabel({ file, frame, mesos, row, col, cell, count }) {
  const where = `${file} [${row},${col}] "${cell}"`;
  const mask = digitMask(frame, slotOrigin(mesos, row, col));
  const learned = [];
  let from = 0;
  let within = 5;
  for (const ch of count) {
    const own = [...(digits.get(ch)?.values() ?? [])];
    if (own.length === 0) return problems.push(`${where}: no template for "${ch}" yet, skipped.`);
    let best = null;
    for (let start = from; start <= from + within + 3 && start < mask[0].length; start++) {
      for (const r of own) {
        const at = start - leadOf(r);
        if (at < 0 || !mask.some((m) => m[start] === '#')) continue;
        const d = mismatchAt(mask, at, r);
        if (!best || d < best.d) best = { d, at, w: r[0].length };
      }
    }
    if (!best || best.d > MAX_NOISY_DIFF) return problems.push(`${where}: couldn't place "${ch}" within ${MAX_NOISY_DIFF} pixels, skipped.`);
    const glyph = mask.map((m) => m.slice(best.at, best.at + best.w));
    const others = [...digits].filter(([d]) => d !== ch).flatMap(([, shapes]) => [...shapes.values()]);
    const nearestOther = Math.min(...others.map((r) => mismatchAt(mask, best.at, r)));
    if (nearestOther - best.d < MARGIN) return problems.push(`${where}: the "${ch}" is too close to another digit (${best.d} vs ${nearestOther}), skipped.`);
    learned.push([ch, glyph]);
    from = best.at + best.w;
    within = 4;
  }
  learned.forEach(([ch, glyph]) => fileDigit(ch, glyph, where));
}

retry.forEach(learnWithLabel);

const icons = readdirSync(ICON_DIR)
  .filter((f) => f.endsWith('.png'))
  .sort()
  .map((f) => {
    const png = PNG.sync.read(readFileSync(join(ICON_DIR, f)));
    return { id: Number(f.replace('.png', '')), w: png.width, h: png.height, rgba: Buffer.from(png.data).toString('base64') };
  });

const out = {
  version: 1,
  digits: Object.fromEntries([...digits].sort(([a], [b]) => a.localeCompare(b)).map(([digit, shapes]) => [digit, [...shapes.values()]])),
  icons,
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);

console.log(`wrote ${OUT}`);
console.log(`icons: ${icons.length} (slot ${INVENTORY.size}px, search around bottom-centre)`);
const have = Object.keys(out.digits);
console.log(`digits have: ${have.join(' ')}   MISSING: ${'0123456789'.split('').filter((d) => !have.includes(d)).join(' ') || 'none'}`);
for (const [digit, shapes] of digits) if (shapes.size > 1) console.log(`  note: "${digit}" has ${shapes.size} renderings`);
if (problems.length) console.log(`\nProblems:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
