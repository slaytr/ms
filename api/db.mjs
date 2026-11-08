/**
 * The one Postgres pool for the API. Everything else imports `query` /
 * `withTransaction` from here so connection setup lives in one place.
 */

import pg from 'pg';

const { Pool, types } = pg;

// bigint (OID 20) comes back as a string by default. Meso counts stay far
// below 2^53, so parse them to plain numbers.
types.setTypeParser(20, (value) => Number(value));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL env var is required.');
}

// Managed Postgres (Railway) terminates TLS with a cert Node doesn't chain
// to, so rejectUnauthorized: false. `sslmode=disable` (local dev) skips TLS.
const ssl = connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false };

export const pool = new Pool({ connectionString, ssl });

/** Runs one query. Pass `client` to reuse a transaction's connection. */
export function query(text, params, client = pool) {
  return client.query(text, params);
}

/** Runs `fn(client)` in BEGIN/COMMIT, rolling back on any throw. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {
      // Connection already dead; the original error is what matters.
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
