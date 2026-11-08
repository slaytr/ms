/**
 * Node-only helpers for loading screenshot fixtures. Used by tests and by
 * scripts/harvest-templates.mjs; never imported by the browser bundle.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import pngjs from 'pngjs';

import type { Frame } from './types.ts';

export const FIXTURES_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'fixtures');

export function loadFrame(file: string): Frame {
  const png = pngjs.PNG.sync.read(readFileSync(join(FIXTURES_DIR, file)));
  return { width: png.width, height: png.height, data: png.data };
}

export function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith('.png'))
    .sort();
}
