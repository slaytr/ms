#!/usr/bin/env node
/**
 * Dev tool: prints how a region of a fixture segments into glyphs, so layout
 * constants can be chosen from evidence.
 *
 * Usage: node scripts/probe-glyphs.mjs <fixture.png> <x> <y> <w> <h> <light|dark> <threshold>
 */

import { loadFrame } from '../web/src/lib/detect/fixture-io.ts';
import { dark, light, segmentGlyphs, toLuma } from '../web/src/lib/detect/mask.ts';

const [file, x, y, w, h, mode, threshold] = process.argv.slice(2);
const frame = loadFrame(file);
const luma = toLuma(frame);
const polarity = (mode === 'dark' ? dark : light)(Number(threshold));
const rect = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };

const glyphs = segmentGlyphs(luma, frame.width, rect, polarity);
console.log(`${glyphs.length} glyph(s) in ${JSON.stringify(rect)}`);
glyphs.forEach((glyph, i) => {
  console.log(`\n#${i}  x=${glyph.x}  width=${glyph.bitmap[0].length}`);
  console.log(glyph.bitmap.join('\n'));
});
