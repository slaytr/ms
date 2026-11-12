import { query, withTransaction } from '../db.mjs';

/** API field -> column, for the fields an admin may set on a snapshot. */
const SNAPSHOT_COLUMNS = { name: 'name', job: 'job', level: 'level', exp: 'exp', expPct: 'exp_pct', meso: 'meso' };
/** API field -> column, for the fields an admin may set on a reading. */
const READING_COLUMNS = { meso: 'meso', exp: 'exp', expPct: 'exp_pct', level: 'level' };

/** The player name a session shows, same precedence as the Maps/Characters listings. */
const PLAYER_SQL = `coalesce(nullif(st.name, ''), nullif(s.character, ''), nullif(ci.name, ''))`;

const hasKey = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Only the whitelisted fields present in `patch`, as [column, value] pairs. */
function pickColumns(patch, columns) {
  return Object.entries(columns)
    .filter(([field]) => hasKey(patch, field))
    .map(([field, column]) => [column, patch[field]]);
}

/** Sessions for the editor, newest first. `unnamed` keeps only those with no player name anywhere. */
export async function listAdminSessions({ unnamed, search, limit }) {
  const { rows } = await query(
    `select s.id, s.label, s.character, s.fingerprint,
            s.started_at as "startedAt", s.ended_at as "endedAt",
            (select count(*)::int from ms_readings r where r.session_id = s.id) as "readingCount",
            ${PLAYER_SQL} as player,
            coalesce(nullif(st.job, ''), nullif(en.job, ''), nullif(ci.job, '')) as job,
            st.level as "startLevel", en.level as "endLevel"
       from ms_capture_sessions s
       left join ms_session_snapshots st on st.session_id = s.id and st.kind = 'start'
       left join ms_session_snapshots en on en.session_id = s.id and en.kind = 'end'
       left join ms_character_identities ci on ci.fingerprint = s.fingerprint
      where ($1::boolean = false or ${PLAYER_SQL} is null)
        and ($2::text = '' or s.label ilike '%' || $2 || '%' or coalesce(${PLAYER_SQL}, '') ilike '%' || $2 || '%')
      order by s.started_at desc
      limit $3`,
    [unnamed, search, limit],
  );
  return rows;
}

/** One session with every reading (including ids, so they can be edited) and both snapshots. */
export async function getAdminSession(id) {
  const { rows } = await query(
    `select id, label, character, fingerprint, started_at as "startedAt", ended_at as "endedAt"
       from ms_capture_sessions where id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const readings = await query(
    `select id, extract(epoch from taken_at) * 1000 as "takenAt", meso, exp, exp_pct::float8 as "expPct", level
       from ms_readings where session_id = $1 order by taken_at, id`,
    [id],
  );
  const snaps = await query(
    `select kind, name, job, level, exp, exp_pct::float8 as "expPct", meso
       from ms_session_snapshots where session_id = $1`,
    [id],
  );
  const byKind = Object.fromEntries(snaps.rows.map(({ kind, ...rest }) => [kind, rest]));
  const identity = rows[0].fingerprint
    ? ((await query('select name, job from ms_character_identities where fingerprint = $1', [rows[0].fingerprint])).rows[0] ?? null)
    : null;
  return {
    ...rows[0],
    readings: readings.rows.map((r) => ({ ...r, takenAt: Number(r.takenAt) })),
    snapshots: { start: byKind.start ?? null, end: byKind.end ?? null },
    identity,
  };
}

async function patchSnapshot(client, sessionId, kind, patch) {
  const pairs = pickColumns(patch, SNAPSHOT_COLUMNS);
  if (pairs.length === 0) return;
  const columns = pairs.map(([column]) => column);
  const values = pairs.map(([, value]) => value);
  // A missing snapshot is created at the session's start time; an existing one only has these columns touched.
  await query(
    `insert into ms_session_snapshots (session_id, kind, taken_at, fingerprint, ${columns.join(', ')})
     select s.id, $2, s.started_at, s.fingerprint, ${columns.map((_, i) => `$${i + 3}`).join(', ')}
       from ms_capture_sessions s where s.id = $1
     on conflict (session_id, kind) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`,
    [sessionId, kind, ...values],
    client,
  );
}

/**
 * Edits a session: its label (map), character text, fingerprint, and any of the start/end snapshot fields.
 * Only fields present in `patch` change. Returns false when the session doesn't exist.
 */
export async function updateAdminSession(id, patch) {
  return withTransaction(async (client) => {
    const found = await query('select 1 from ms_capture_sessions where id = $1 for update', [id], client);
    if (found.rows.length === 0) return false;

    const sets = [];
    const values = [id];
    for (const field of ['label', 'character', 'fingerprint']) {
      if (hasKey(patch, field)) {
        values.push(patch[field]);
        sets.push(`${field} = $${values.length}`);
      }
    }
    if (sets.length > 0) await query(`update ms_capture_sessions set ${sets.join(', ')} where id = $1`, values, client);
    if (hasKey(patch, 'fingerprint')) {
      await query('update ms_session_snapshots set fingerprint = $2 where session_id = $1', [id, patch.fingerprint], client);
    }
    if (patch.start) await patchSnapshot(client, id, 'start', patch.start);
    if (patch.end) await patchSnapshot(client, id, 'end', patch.end);
    return true;
  });
}

/** Edits one reading of a session. Returns false when it isn't that session's reading. */
export async function updateReading(sessionId, readingId, patch) {
  const pairs = pickColumns(patch, READING_COLUMNS);
  if (pairs.length === 0) return true;
  const { rowCount } = await query(
    `update ms_readings set ${pairs.map(([column], i) => `${column} = $${i + 3}`).join(', ')}
      where id = $1 and session_id = $2`,
    [readingId, sessionId, ...pairs.map(([, value]) => value)],
  );
  return rowCount > 0;
}

/** Deletes readings (by id) from a session. Returns how many went. */
export async function deleteReadings(sessionId, ids) {
  const { rowCount } = await query('delete from ms_readings where session_id = $1 and id = any($2::bigint[])', [sessionId, ids]);
  return rowCount;
}

/**
 * Rewrites the level on a session's readings: all of them, or only those currently showing `onlyLevel`
 * (a misread 8 -> 18 across a stretch). Returns how many changed.
 */
export async function setReadingLevels(sessionId, level, onlyLevel) {
  const { rowCount } = await query(
    `update ms_readings set level = $2
      where session_id = $1 and ($3::int is null or level = $3) and level is distinct from $2`,
    [sessionId, level, onlyLevel ?? null],
  );
  return rowCount;
}

/** Deletes a whole session (readings and snapshots cascade). */
export async function deleteAdminSession(id) {
  const { rowCount } = await query('delete from ms_capture_sessions where id = $1', [id]);
  return rowCount > 0;
}

/** Every distinct map name with how many sessions use it. */
export async function listMapLabels() {
  const { rows } = await query(
    `select label, count(*)::int as sessions from ms_capture_sessions where label <> '' group by label order by label`,
  );
  return rows;
}

/** Renames a map on every session that carries `from`. Returns how many sessions changed. */
export async function renameMap(from, to) {
  const { rowCount } = await query('update ms_capture_sessions set label = $2 where label = $1', [from, to]);
  return rowCount;
}

/** One row per character fingerprint: the name we would show, its spec, and how many sessions it has. */
export async function listAdminCharacters() {
  const { rows } = await query(
    `select s.fingerprint,
            coalesce(nullif(ci.name, ''),
                     (select nullif(n.name, '') from ms_session_snapshots n where n.fingerprint = s.fingerprint and coalesce(n.name, '') <> '' order by n.taken_at desc limit 1),
                     (select nullif(c.character, '') from ms_capture_sessions c where c.fingerprint = s.fingerprint and c.character <> '' order by c.started_at desc limit 1)) as name,
            coalesce(nullif(ci.job, ''),
                     (select nullif(n.job, '') from ms_session_snapshots n where n.fingerprint = s.fingerprint and coalesce(n.job, '') <> '' order by n.taken_at desc limit 1)) as job,
            count(*)::int as sessions
       from ms_capture_sessions s
       left join ms_character_identities ci on ci.fingerprint = s.fingerprint
      where s.fingerprint is not null
      group by s.fingerprint, ci.name, ci.job
      order by max(s.started_at) desc`,
  );
  return rows;
}

/**
 * Sets the name and spec of a character (by fingerprint). With `applyToSessions` the same name/spec
 * are also written onto every session and snapshot of that fingerprint, so past listings change too.
 * Returns how many sessions the fingerprint has.
 */
export async function setCharacter(fingerprint, { name, job }, applyToSessions) {
  return withTransaction(async (client) => {
    await query(
      `insert into ms_character_identities (fingerprint, name, job) values ($1, $2, $3)
       on conflict (fingerprint) do update set name = excluded.name, job = excluded.job, updated_at = now()`,
      [fingerprint, name, job],
      client,
    );
    if (applyToSessions) {
      await query('update ms_session_snapshots set name = $2, job = coalesce($3, job) where fingerprint = $1', [fingerprint, name, job], client);
      await query('update ms_capture_sessions set character = $2 where fingerprint = $1', [fingerprint, name], client);
    }
    const { rows } = await query('select count(*)::int as n from ms_capture_sessions where fingerprint = $1', [fingerprint], client);
    return rows[0].n;
  });
}
