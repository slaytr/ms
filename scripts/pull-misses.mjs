#!/usr/bin/env node
/**
 * Pulls the screenshots production couldn't fully read (ms_miss_frames) into ./fixtures so you can
 * label them and train on them. Run on your machine:
 *
 *   npm run pull:misses                 newest frames you don't have yet (10 at a time)
 *   npm run pull:misses -- --limit 25   more per pull
 *   npm run pull:misses -- --purge      also delete the pulled frames from production afterwards
 *
 * Each frame is saved as fixtures/other_<w>x<h>_<ms>.png (the same naming as the Capture panel, and
 * gitignored like the other screenshots). fixtures/misses.json records, per frame, which pieces of data
 * were missing and what the detector did read, so you know what to label. Next: add the frame to
 * fixtures/labels.json and run `node scripts/harvest-templates.mjs`.
 *
 * Reads production only through `railway ssh` (the database is on a private network), the same way
 * sync-from-prod.mjs does. It never touches your local database.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const INDEX = join(FIXTURES, 'misses.json');
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const args = process.argv.slice(2);
const flag = (name) => args.indexOf(name);
const valueOf = (name) => (flag(name) === -1 ? null : args[flag(name) + 1]);

/** Runs inside the production container: prints frames (or deletes them) and exits. Needs DATABASE_URL. */
async function runOnServer() {
  const { deleteMissFrames, listMissFrames } = await import('../api/store/miss-frames.mjs');
  const { closePool } = await import('../api/db.mjs');
  try {
    const deleteIds = valueOf('--delete');
    if (deleteIds !== null) {
      const ids = deleteIds.split(',').map(Number).filter(Number.isInteger);
      console.log(JSON.stringify({ deleted: ids.length ? await deleteMissFrames(ids) : 0 }));
      return;
    }
    const frames = await listMissFrames({ afterId: Number(valueOf('--after') ?? 0), limit: Number(valueOf('--limit') ?? DEFAULT_LIMIT) });
    console.log(JSON.stringify({ frames }));
  } finally {
    await closePool();
  }
}

function ssh(extra) {
  const output = execFileSync('railway', ['ssh', '--service', valueOf('--service') ?? 'ms', '--', 'node', 'scripts/pull-misses.mjs', '--on-server', ...extra], {
    encoding: 'utf8',
    maxBuffer: 400 * 1024 * 1024,
    // Windows resolves `railway` to railway.cmd only when a shell is involved.
    shell: true,
  });
  // The container may print other lines first (npm warnings); the payload is the last line.
  return JSON.parse(output.trim().split('\n').pop());
}

const readIndex = () => (existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {});

function pull() {
  const index = readIndex();
  const afterId = Object.keys(index).reduce((max, id) => Math.max(max, Number(id)), 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(valueOf('--limit') ?? DEFAULT_LIMIT)));

  console.log(`Pulling up to ${limit} frame(s) newer than #${afterId} (railway ssh)...`);
  const { frames } = ssh(['--after', String(afterId), '--limit', String(limit)]);
  if (frames.length === 0) {
    console.log('Nothing new.');
    return;
  }

  const next = { ...index };
  for (const frame of frames) {
    const file = `other_${frame.width}x${frame.height}_${new Date(frame.createdAt).getTime()}.png`;
    writeFileSync(join(FIXTURES, file), Buffer.from(frame.png, 'base64'));
    next[frame.id] = { file, createdAt: frame.createdAt, missing: frame.missing, sessionId: frame.sessionId, detection: frame.detection };
    console.log(`  #${frame.id}  ${file}  missing: ${frame.missing.join(', ')}`);
  }
  writeFileSync(INDEX, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nSaved ${frames.length} frame(s). Details in fixtures/misses.json. Label them in fixtures/labels.json, then run harvest-templates.mjs.`);

  if (args.includes('--purge')) {
    const { deleted } = ssh(['--delete', frames.map((f) => f.id).join(',')]);
    console.log(`Deleted ${deleted} pulled frame(s) from production.`);
  }
}

if (args.includes('--on-server')) await runOnServer();
else pull();
