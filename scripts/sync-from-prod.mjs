#!/usr/bin/env node
/**
 * Mirrors the production database into your local one.
 *
 * - `--dump`: runs INSIDE Railway (where DATABASE_URL is prod's) and prints
 *   every synced table as one JSON object on stdout.
 * - no flag: runs on your machine. Shells out to `railway ssh` to run the dump
 *   in Railway's private network, then truncates and reloads the local
 *   DATABASE_URL (from .env.local) in a single transaction.
 *
 * Needs the Railway CLI logged in (`railway login`) and the local DB migrated
 * (`npm run migrate:local`).
 *
 * Usage: npm run sync:prod [-- --service <name>]
 */

import { execFileSync } from 'node:child_process';

import { pool, withTransaction, closePool } from '../api/db.mjs';

/** Synced tables in FK-safe order. `ms_schema_migrations` is deliberately excluded: each environment tracks its own. */
const TABLES = ['ms_capture_sessions', 'ms_session_snapshots', 'ms_readings'];

/**
 * Explicit column lists where `select *` would be wrong. owner_token is a
 * credential for appending to prod sessions; it must not be copied to dev
 * machines. The local default generates a fresh one on insert.
 */
const COLUMNS = {
  ms_capture_sessions: ['id', 'label', 'character', 'fingerprint', 'started_at', 'ended_at'],
};

/** Tables whose serial PK needs its sequence re-synced after a bulk load with explicit ids. */
const SERIAL_PK_TABLES = {
  ms_readings: { column: 'id', sequence: 'ms_readings_id_seq' },
  ms_session_snapshots: { column: 'id', sequence: 'ms_session_snapshots_id_seq' },
};

async function dump() {
  const payload = {};
  for (const table of TABLES) {
    const columns = COLUMNS[table]?.join(', ') ?? '*';
    const { rows } = await pool.query(`select ${columns} from ${table}`);
    payload[table] = rows;
  }
  process.stdout.write(JSON.stringify(payload));
}

async function loadTable(client, table, rows) {
  if (rows.length === 0) return 0;
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `insert into ${table} (${columns.join(', ')}) values (${placeholders})`;
  for (const row of rows) {
    await client.query(sql, columns.map((col) => row[col]));
  }
  return rows.length;
}

async function resyncSerialSequences(client) {
  for (const [table, { column, sequence }] of Object.entries(SERIAL_PK_TABLES)) {
    await client.query(
      `select setval($1, coalesce((select max(${column}) from ${table}), 1), exists(select 1 from ${table}))`,
      [sequence],
    );
  }
}

async function restore(payload) {
  await withTransaction(async (client) => {
    await client.query(`truncate ${TABLES.join(', ')} restart identity cascade`);
    for (const table of TABLES) {
      const count = await loadTable(client, table, payload[table] ?? []);
      console.log(`  ${table}: ${count} row(s)`);
    }
    await resyncSerialSequences(client);
  });
}

function dumpFromProd(service) {
  console.log(`Dumping from production (railway ssh --service ${service})...`);
  const json = execFileSync('railway', ['ssh', '--service', service, '--', 'node', 'scripts/sync-from-prod.mjs', '--dump'], {
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    // Windows resolves `railway` to railway.cmd only when a shell is involved.
    shell: true,
  });
  return JSON.parse(json);
}

/** Refuses to truncate anything that doesn't look like a local database. */
function assertLocalTarget() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL is not set. Point it at your local Postgres (see .env.local.example).');
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to truncate non-local database host "${host}". Sync only targets localhost.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dump')) {
    await dump();
    return;
  }

  assertLocalTarget();
  const serviceIndex = args.indexOf('--service');
  const service = serviceIndex === -1 ? 'web' : args[serviceIndex + 1];

  const payload = dumpFromProd(service);
  console.log('Loading into local Postgres...');
  await restore(payload);
  console.log('\nSync complete.');
}

main()
  .catch((error) => {
    console.error(`\nSync failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
