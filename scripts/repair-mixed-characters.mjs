#!/usr/bin/env node
/**
 * One-off repair for sessions that recorded two characters because the tracker used to keep one session
 * open across an in-game character switch (fixed in useTracker). For every session of --fingerprint:
 *   - readings are cut wherever the level jumps by more than MAX_STEP;
 *   - a piece with fewer than MIN_PIECE readings is noise and is deleted;
 *   - a piece at or above --foreign-min-level belongs to the other character and moves to a new session
 *     under --foreign-fingerprint (with its own start/end snapshots);
 *   - the rest stays, and the session's end snapshot is rebuilt from its last remaining reading.
 * Snapshots of --fingerprint that carry the other character's name or spec are put right, and the
 * saved identity of --fingerprint is set to --name/--job. Stats rows are dropped so they recompute.
 *
 * Dry run unless `--apply`. Only ever runs against a localhost DATABASE_URL.
 *
 *   node --env-file=.env.local scripts/repair-mixed-characters.mjs \
 *     --fingerprint 1fc1offng27 --name AstraYao --job Magician \
 *     --foreign-fingerprint pen8slfw6b --foreign-name YaeMiho --foreign-job Spearman --foreign-min-level 40 [--apply]
 */

import { closePool, pool, withTransaction } from '../api/db.mjs';

const MAX_STEP = 5;
const MIN_PIECE = 5;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) values[key] = true;
    else {
      values[key] = next;
      i += 1;
    }
  }
  for (const required of ['fingerprint', 'name', 'job', 'foreign-fingerprint', 'foreign-name', 'foreign-job', 'foreign-min-level']) {
    if (typeof values[required] !== 'string') throw new Error(`Missing --${required}`);
  }
  const minLevel = Number(values['foreign-min-level']);
  if (!Number.isInteger(minLevel) || minLevel < 2) throw new Error('--foreign-min-level must be a whole number above 1');
  return { ...values, minLevel, apply: values.apply === true };
}

/** Cuts readings (already in time order) into runs where the level never jumps by more than MAX_STEP. */
function splitByLevelJumps(readings) {
  const pieces = [];
  let current = [];
  let lastLevel = null;
  for (const reading of readings) {
    if (reading.level !== null && lastLevel !== null && Math.abs(reading.level - lastLevel) > MAX_STEP) {
      pieces.push(current);
      current = [];
    }
    current.push(reading);
    if (reading.level !== null) lastLevel = reading.level;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

function medianLevel(piece) {
  const levels = piece.map((r) => r.level).filter((l) => l !== null).sort((a, b) => a - b);
  return levels.length === 0 ? null : levels[Math.floor(levels.length / 2)];
}

/** What to do with each piece: 'keep' (stays), 'move' (other character), 'drop' (noise). */
function classifyPieces(pieces, minLevel) {
  return pieces.map((piece) => {
    const level = medianLevel(piece);
    if (piece.length < MIN_PIECE || level === null) return { piece, action: 'drop' };
    return { piece, action: level >= minLevel ? 'move' : 'keep' };
  });
}

const lastWith = (piece, field) => [...piece].reverse().find((r) => r[field] !== null)?.[field] ?? null;

async function planSession(client, session, minLevel) {
  const { rows } = await client.query(
    'select id, taken_at, meso, exp_pct, level, exp from ms_readings where session_id = $1 order by taken_at, id',
    [session.id],
  );
  const classified = classifyPieces(splitByLevelJumps(rows), minLevel);
  const dirty = classified.some((c) => c.action !== 'keep');
  return { session, classified, dirty };
}

async function moveToNewSession(client, args, session, piece) {
  const first = piece[0];
  const last = piece[piece.length - 1];
  const created = await client.query(
    `insert into ms_capture_sessions (label, character, fingerprint, party_size, started_at, ended_at)
     values ($1, '', $2, $3, $4, $5) returning id`,
    [session.label, args['foreign-fingerprint'], session.party_size, first.taken_at, last.taken_at],
  );
  const id = created.rows[0].id;
  await client.query('update ms_readings set session_id = $1 where id = any($2::bigint[])', [id, piece.map((r) => r.id)]);
  const snapshot = (kind, takenAt, reading, meso) =>
    client.query(
      `insert into ms_session_snapshots (session_id, kind, taken_at, fingerprint, name, job, level, exp, exp_pct, meso)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, kind, takenAt, args['foreign-fingerprint'], args['foreign-name'], args['foreign-job'], reading.level, reading.exp, reading.exp_pct, meso],
    );
  await snapshot('start', first.taken_at, { level: lastWith([first], 'level') ?? first.level, exp: first.exp, exp_pct: first.exp_pct }, null);
  await snapshot('end', last.taken_at, { level: lastWith(piece, 'level'), exp: lastWith(piece, 'exp'), exp_pct: lastWith(piece, 'exp_pct') }, lastWith(piece, 'meso'));
  return id;
}

async function applyPlan(client, args, plan) {
  const touched = [plan.session.id];
  let newSessions = 0;
  let deleted = 0;
  const kept = [];
  for (const { piece, action } of plan.classified) {
    if (action === 'move') {
      touched.push(await moveToNewSession(client, args, plan.session, piece));
      newSessions += 1;
    } else if (action === 'drop') {
      await client.query('delete from ms_readings where id = any($1::bigint[])', [piece.map((r) => r.id)]);
      deleted += piece.length;
    } else {
      kept.push(...piece);
    }
  }
  if (kept.length > 0) {
    const level = lastWith(kept, 'level');
    await client.query(
      `update ms_session_snapshots set level = $2, exp = $3, exp_pct = $4, taken_at = $5
        where session_id = $1 and kind = 'end'`,
      [plan.session.id, level, lastWith(kept, 'exp'), lastWith(kept, 'exp_pct'), kept[kept.length - 1].taken_at],
    );
    await client.query('update ms_capture_sessions set ended_at = $2 where id = $1 and ended_at is not null', [plan.session.id, kept[kept.length - 1].taken_at]);
  }
  return { touched, newSessions, deleted };
}

async function fixLabelsAndIdentity(client, args) {
  const snaps = await client.query(
    `update ms_session_snapshots set name = $2, job = $3
      where fingerprint = $1 and (name = $4 or job = $5)`,
    [args.fingerprint, args.name, args.job, args['foreign-name'], args['foreign-job']],
  );
  await client.query(
    `insert into ms_character_identities (fingerprint, name, job) values ($1, $2, $3)
     on conflict (fingerprint) do update set name = excluded.name, job = excluded.job, updated_at = now()`,
    [args.fingerprint, args.name, args.job],
  );
  return snaps.rowCount;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!LOCAL_HOSTS.includes(host)) throw new Error(`Refusing to repair non-local database host "${host}".`);

  await withTransaction(async (client) => {
    const { rows: sessions } = await client.query(
      'select id, label, party_size, started_at from ms_capture_sessions where fingerprint = $1 order by started_at',
      [args.fingerprint],
    );
    const touched = [];
    for (const session of sessions) {
      const plan = await planSession(client, session, args.minLevel);
      if (!plan.dirty) continue;
      const summary = plan.classified.map((c) => `${c.action}:${c.piece.length}@L${medianLevel(c.piece)}`).join(' ');
      process.stdout.write(`${session.id} ${session.started_at.toISOString()}  ${summary}\n`);
      if (args.apply) touched.push(...(await applyPlan(client, args, plan)).touched);
    }
    if (!args.apply) {
      process.stdout.write('\nDry run: nothing changed. Add --apply to repair.\n');
      return;
    }
    const relabelled = await fixLabelsAndIdentity(client, args);
    if (touched.length > 0) await client.query('delete from ms_session_stats where session_id = any($1::uuid[])', [touched]);
    process.stdout.write(`\nRepaired ${touched.length} session(s); relabelled ${relabelled} snapshot(s); identity of ${args.fingerprint} set.\n`);
  });
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
