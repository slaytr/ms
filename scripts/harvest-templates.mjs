#!/usr/bin/env node
/**
 * Builds web/src/lib/detect/templates.json from labelled screenshot fixtures.
 *
 *  1. Anchor bitmaps (the EXP./LV./MESOS labels) are cut from one reference
 *     fixture using the rects in layout.ts.
 *  2. For every fixture listed in fixtures/labels.json, the anchors are
 *     located, digits are segmented, and each glyph bitmap is filed under the
 *     character the label says it is.
 *
 * Re-run after adding fixtures/labels. It reports which characters still have
 * no template (those can't be read yet) and refuses ambiguous input: a
 * character rendering two different ways usually means a typo in labels.json.
 *
 * Usage: node scripts/harvest-templates.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { findAnchor } from '../web/src/lib/detect/anchor.ts';
import { loadFrame, FIXTURES_DIR } from '../web/src/lib/detect/fixture-io.ts';
import { ANCHOR_PAD, ANCHOR_SOURCES, ANCHOR_TOLERANCE, CHARACTER, EXP, LEVEL, MAP, MESO, SEARCH } from '../web/src/lib/detect/layout.ts';
import { extractBitmap, inkBounds, toLuma } from '../web/src/lib/detect/mask.ts';
import { EMPTY_TEMPLATES } from '../web/src/lib/detect/types.ts';
import { fitView, unscaleView } from '../web/src/lib/detect/view.ts';
import { expGlyphs, joinGlyphs, levelTiles, mapGlyphs, mesoGlyphs, textGlyphs } from '../web/src/lib/detect/readers.ts';

const OUT = join(import.meta.dirname, '..', 'web', 'src', 'lib', 'detect', 'templates.json');
const labels = JSON.parse(readFileSync(join(FIXTURES_DIR, 'labels.json'), 'utf8'));
// Scaled-up frames are for the tests only, unless labelled "harvest": true (a lossless capture whose unscaled glyphs
// are exact, checked against the native templates). Lossy frames (JPEG) never teach anything.
const files = Object.keys(labels).filter((name) => name.endsWith('.png') && !labels[name].lossy && (!labels[name].scaled || labels[name].harvest));

const REFERENCE = files.find((name) => !labels[name].scaled && labels[name].meso && labels[name].exp && labels[name].level);
if (!REFERENCE) throw new Error('labels.json needs at least one fixture labelled with exp, level and meso.');

const POLARITY = {
  exp: EXP.anchorPolarity,
  level: LEVEL.anchorPolarity,
  mesos: MESO.anchorPolarity,
  minimap: ANCHOR_SOURCES.minimap.polarity,
};
const problems = [];

// 1. Anchors, cut from the reference frame.
const reference = loadFrame(REFERENCE);
const referenceLuma = toLuma(reference);
const anchors = {};
for (const [name, { rect, polarity }] of Object.entries(ANCHOR_SOURCES)) {
  const ink = inkBounds(referenceLuma, reference.width, rect, polarity);
  if (!ink) throw new Error(`anchor "${name}": no ink found in ${JSON.stringify(rect)} of ${REFERENCE}`);
  const padded = { x: ink.x - ANCHOR_PAD, y: ink.y - ANCHOR_PAD, w: ink.w + 2 * ANCHOR_PAD, h: ink.h + 2 * ANCHOR_PAD };
  anchors[name] = extractBitmap(referenceLuma, reference.width, padded, polarity);
  console.log(`anchor ${name.padEnd(5)} ink @ (${ink.x},${ink.y}) ${ink.w}x${ink.h}  padded origin (${padded.x},${padded.y})`);
}

// 2. Glyphs, learned from labelled fixtures.
const fonts = { exp: {}, meso: {}, level: {}, text: {}, map: {} };

function learn(font, char, bitmap, file) {
  const variants = (fonts[font][char] ??= []);
  const key = bitmap.join('/');
  if (variants.some((existing) => existing.join('/') === key)) return;
  variants.push(bitmap);
  if (variants.length > 1) problems.push(`${font} '${char}' has ${variants.length} different renderings (new one from ${file}); check labels.`);
}

function learnRun(font, text, bitmaps, file, { exact }) {
  if (exact ? bitmaps.length !== text.length : bitmaps.length < text.length) {
    problems.push(`${file}: ${font} label "${text}" has ${text.length} chars but ${bitmaps.length} glyphs were found; skipped.`);
    return;
  }
  [...text].forEach((char, i) => learn(font, char, bitmaps[i], file));
}

/**
 * Splits a text label into glyph tokens plus where word spaces are. Two markers say the
 * pixels and the letters don't line up one-to-one:
 *   "{yY}"  two letters whose pixels touch and so segment as ONE glyph ("Pa{yY}oBills").
 *   "~h~"   ONE letter drawn as two pieces (stem + arch, split by the stem's shadow column),
 *           so it segments as TWO glyphs ("Nort~h~"). The reader joins them back up.
 */
function tokenize(label) {
  const tokens = [];
  let space = false;
  for (const match of label.matchAll(/\{([^}]+)\}|~([^~])~|(.)/gu)) {
    if (match[3] === ' ') space = true;
    else {
      const raw = match[1] ?? match[2] ?? match[3];
      tokens.push({ token: CHARACTER.lookalikes[raw] ?? raw, span: match[2] ? 2 : 1, spaceBefore: space && tokens.length > 0 });
      space = false;
    }
  }
  return tokens;
}

function learnText(label, glyphs, file, line, { font = 'text', spaceGap = CHARACTER.spaceGap } = {}) {
  const tokens = tokenize(label);
  const starts = [];
  let used = 0;
  for (const t of tokens) {
    starts.push(used);
    used += t.span;
  }
  if (used !== glyphs.length) {
    problems.push(`${file}: ${line} label "${label}" needs ${used} glyphs but ${glyphs.length} were found; use {ab} for touching letters and ~b~ for a letter drawn in two pieces. Skipped.`);
    return;
  }
  const spacing = tokens.every((t, i) => t.spaceBefore === (starts[i] > 0 && glyphs[starts[i]].gapBefore >= spaceGap));
  if (!spacing) {
    problems.push(`${file}: ${line} label "${label}" puts word spaces where the pixels have none (or vice versa). Skipped.`);
    return;
  }
  tokens.forEach((t, i) => {
    const first = glyphs[starts[i]];
    learn(font, t.token, t.span === 2 ? joinGlyphs(first, glyphs[starts[i] + 1]) : first.bitmap, file);
  });
}

for (const file of files) {
  const frame = loadFrame(file);
  let luma = toLuma(frame);
  let width = frame.width;
  let height = frame.height;
  if (labels[file].scaled) {
    // Read the frame as the detector does: fitted to the native client and unscaled.
    const view = fitView(luma, width, height, { ...EMPTY_TEMPLATES, anchors });
    if (!view) {
      problems.push(`${file}: no window fit found, skipped.`);
      continue;
    }
    luma = unscaleView(luma, width, view);
    width = view.width;
    height = view.height;
  }
  const at = {};
  for (const name of Object.keys(anchors)) {
    at[name] = findAnchor(luma, width, height, anchors[name], SEARCH[name](width, height), {
      polarity: POLARITY[name],
      tolerance: ANCHOR_TOLERANCE,
    });
  }

  const { exp, level, meso, name, job, street, map } = labels[file];
  for (const [line, text] of [['street', street], ['map', map]]) {
    if (!text) continue;
    if (!at.minimap) {
      problems.push(`${file}: labelled ${line} "${text}" but the minimap anchor was not found; skipped.`);
      continue;
    }
    learnText(text, mapGlyphs(luma, width, height, at.minimap, line), file, line, { font: 'map', spaceGap: MAP.spaceGap });
  }
  const need = [
    [exp, 'exp', 'exp', () => expGlyphs(luma, width, height, at.exp), false],
    [level, 'level', 'level', () => levelTiles(luma, width, height, at.level), true],
    [meso, 'meso', 'mesos', () => mesoGlyphs(luma, width, height, at.mesos), true],
  ];
  for (const [line, text] of [['name', name], ['job', job]]) {
    if (!text) continue;
    if (!at.level) {
      problems.push(`${file}: labelled ${line} "${text}" but the level anchor was not found; skipped.`);
      continue;
    }
    learnText(text, textGlyphs(luma, width, height, at.level, line), file, line);
  }
  for (const [text, font, anchorName, extract, exact] of need) {
    if (!text) continue;
    if (!at[anchorName]) {
      problems.push(`${file}: labelled ${font} "${text}" but the ${anchorName} anchor was not found; skipped.`);
      continue;
    }
    learnRun(font, text, extract(), file, { exact });
  }
}

const output = { version: 1, anchors, fonts };
writeFileSync(OUT, JSON.stringify(output, null, 1) + '\n');
console.log(`\nwrote ${OUT}`);

const NEEDED = { exp: '0123456789,.[]%', meso: '0123456789,', level: '0123456789' };
for (const [font, chars] of Object.entries(NEEDED)) {
  const have = Object.keys(fonts[font]);
  const missing = [...chars].filter((c) => !have.includes(c));
  console.log(`${font.padEnd(5)} have: ${have.sort().join(' ') || '(none)'}   MISSING: ${missing.join(' ') || 'none'}`);
}
console.log(`text  have: ${Object.keys(fonts.text).sort().join(' ') || '(none)'}   (open-ended: any letter may appear in a name)`);
console.log(`map   have: ${Object.keys(fonts.map).sort().join(' ') || '(none)'}   (open-ended: grows with every new map you label)`);
if (problems.length) {
  console.log('\nProblems:');
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exitCode = 1;
}
