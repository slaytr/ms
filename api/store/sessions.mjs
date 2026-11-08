import { query, withTransaction } from '../db.mjs';

const MAX_READINGS_PER_BATCH = 500;

export { MAX_READINGS_PER_BATCH };

/** Writes (or overwrites) a session's 'start' or 'end' snapshot. Safe to repeat. */
async function upsertSnapshot(client, sessionId, kind, snapshot) {
  await query(
    `insert into ms_session_snapshots (session_id, kind, taken_at, fingerprint, name, job, level, exp, exp_pct, meso)
     values ($1, $2, coalesce(to_timestamp($3::float8 / 1000.0), now()), $4, $5, $6, $7, $8, $9, $10)
     on conflict (session_id, kind) do update set
       taken_at = excluded.taken_at, fingerprint = excluded.fingerprint, name = excluded.name, job = excluded.job,
       level = excluded.level, exp = excluded.exp, exp_pct = excluded.exp_pct, meso = excluded.meso`,
    [
      sessionId,
      kind,
      snapshot.takenAt ?? null,
      snapshot.fingerprint ?? null,
      snapshot.name ?? null,
      snapshot.job ?? null,
      snapshot.level ?? null,
      snapshot.exp ?? null,
      snapshot.expPct ?? null,
      snapshot.meso ?? null,
    ],
    client,
  );
}

/** Creates the session and, in the same transaction, its starting snapshot. */
export async function createSession({ label, character, fingerprint, start }) {
  return withTransaction(async (client) => {
    const { rows } = await query(
      `insert into ms_capture_sessions (label, character, fingerprint) values ($1, $2, $3)
       returning id, owner_token as "ownerToken", started_at as "startedAt"`,
      [label, character, fingerprint ?? null],
      client,
    );
    if (start) await upsertSnapshot(client, rows[0].id, 'start', start);
    return rows[0];
  });
}

export async function listRecentSessions(limit = 20) {
  const { rows } = await query(
    `select s.id, s.label, s.character, s.started_at as "startedAt", s.ended_at as "endedAt",
            (select count(*)::int from ms_readings r where r.session_id = s.id) as "readingCount"
       from ms_capture_sessions s
      order by s.started_at desc
      limit $1`,
    [limit],
  );
  return rows;
}

export async function getSession(id) {
  const { rows } = await query(
    `select id, label, character, fingerprint, started_at as "startedAt", ended_at as "endedAt"
       from ms_capture_sessions where id = $1`,
    [id],
  );
  if (rows.length === 0) return null;

  const readings = await query(
    `select extract(epoch from taken_at) * 1000 as "takenAt", meso, exp, exp_pct::float8 as "expPct", level
       from ms_readings where session_id = $1 order by taken_at`,
    [id],
  );
  const snapshots = await query(
    `select kind, extract(epoch from taken_at) * 1000 as "takenAt", fingerprint, name, job, level, exp,
            exp_pct::float8 as "expPct", meso
       from ms_session_snapshots where session_id = $1`,
    [id],
  );
  const byKind = Object.fromEntries(snapshots.rows.map(({ kind, ...rest }) => [kind, { ...rest, takenAt: Number(rest.takenAt) }]));

  return {
    ...rows[0],
    readings: readings.rows.map((r) => ({ ...r, takenAt: Number(r.takenAt) })),
    snapshots: { start: byKind.start ?? null, end: byKind.end ?? null },
  };
}

/** True when `token` is the owner token for session `id`. */
export async function isOwner(id, token) {
  const { rows } = await query('select 1 from ms_capture_sessions where id = $1 and owner_token = $2', [id, token]);
  return rows.length > 0;
}

/** Appends readings in one statement via unnest. Returns the number inserted. */
export async function appendReadings(sessionId, readings) {
  const { rowCount } = await query(
    `insert into ms_readings (session_id, taken_at, meso, exp, exp_pct, level)
     select $1, to_timestamp(t / 1000.0), m, x, e, l
       from unnest($2::float8[], $3::bigint[], $4::bigint[], $5::numeric[], $6::int[]) as u(t, m, x, e, l)`,
    [
      sessionId,
      readings.map((r) => r.takenAt),
      readings.map((r) => r.meso),
      readings.map((r) => r.exp ?? null),
      readings.map((r) => r.expPct),
      readings.map((r) => r.level),
    ],
  );
  return rowCount;
}

/** Sets the session's display name (the tracker names it after the map once the map has been read). */
export async function labelSession(id, label) {
  await query('update ms_capture_sessions set label = $2 where id = $1', [id, label]);
}

/** Marks the session ended (once) and records the closing snapshot, if the client sent one. */
export async function endSession(id, end) {
  await withTransaction(async (client) => {
    await query('update ms_capture_sessions set ended_at = now() where id = $1 and ended_at is null', [id], client);
    if (end) await upsertSnapshot(client, id, 'end', end);
  });
}
