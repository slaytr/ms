import { query } from '../db.mjs';

/**
 * DEV ONLY. A fixed menu of read-only views over our own `ms_` tables for the /testing page.
 * Every query is written out here: nothing from the request is ever put into SQL except
 * `limit`/`offset` as bound parameters, and secrets (`owner_token`, avatar image bytes) are
 * never selected.
 */

/** @typedef {{ key: string, label: string, type?: 'text' | 'number' | 'time' | 'id' }} Column */

const VIEWS = {
  sessions: {
    label: 'Sessions',
    columns: [
      { key: 'id', label: 'Id', type: 'id' },
      { key: 'label', label: 'Label' },
      { key: 'character', label: 'Character' },
      { key: 'fingerprint', label: 'Fingerprint', type: 'id' },
      { key: 'startedAt', label: 'Started', type: 'time' },
      { key: 'endedAt', label: 'Ended', type: 'time' },
      { key: 'readings', label: 'Readings', type: 'number' },
    ],
    count: 'select count(*) as n from ms_capture_sessions',
    rows: `select s.id, s.label, s.character, s.fingerprint, s.started_at as "startedAt", s.ended_at as "endedAt",
                  (select count(*) from ms_readings r where r.session_id = s.id) as readings
             from ms_capture_sessions s
            order by s.started_at desc limit $1 offset $2`,
  },
  characters: {
    label: 'Characters',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'job', label: 'Job' },
      { key: 'fingerprint', label: 'Fingerprint', type: 'id' },
      { key: 'level', label: 'Level', type: 'number' },
      { key: 'sessions', label: 'Sessions', type: 'number' },
      { key: 'firstSeen', label: 'First seen', type: 'time' },
      { key: 'lastSeen', label: 'Last seen', type: 'time' },
      { key: 'hasAvatar', label: 'Avatar' },
    ],
    count: 'select count(distinct fingerprint) as n from ms_capture_sessions where fingerprint is not null',
    rows: `select (array_agg(coalesce(nullif(st.name, ''), nullif(s.character, '')) order by s.started_at desc))[1] as name,
                  (array_agg(st.job order by s.started_at desc) filter (where st.job is not null))[1] as job,
                  s.fingerprint,
                  max(coalesce(st.level, 0)) as level,
                  count(distinct s.id) as sessions,
                  min(s.started_at) as "firstSeen",
                  max(s.started_at) as "lastSeen",
                  bool_or(a.name_key is not null)::text as "hasAvatar"
             from ms_capture_sessions s
             left join ms_session_snapshots st on st.session_id = s.id and st.kind = 'start'
             left join ms_character_avatars a on a.name_key = lower(coalesce(nullif(st.name, ''), nullif(s.character, '')))
            where s.fingerprint is not null
            group by s.fingerprint
            order by max(s.started_at) desc limit $1 offset $2`,
  },
  maps: {
    label: 'Maps',
    columns: [
      { key: 'map', label: 'Map' },
      { key: 'sessions', label: 'Sessions', type: 'number' },
      { key: 'characters', label: 'Characters', type: 'number' },
      { key: 'readings', label: 'Readings', type: 'number' },
      { key: 'firstSeen', label: 'First seen', type: 'time' },
      { key: 'lastSeen', label: 'Last seen', type: 'time' },
    ],
    count: "select count(distinct label) as n from ms_capture_sessions where label <> ''",
    rows: `select s.label as map,
                  count(*) as sessions,
                  count(distinct coalesce(s.fingerprint, s.character)) as characters,
                  coalesce(sum((select count(*) from ms_readings r where r.session_id = s.id)), 0) as readings,
                  min(s.started_at) as "firstSeen",
                  max(s.started_at) as "lastSeen"
             from ms_capture_sessions s
            where s.label <> ''
            group by s.label
            order by max(s.started_at) desc limit $1 offset $2`,
  },
  snapshots: {
    label: 'Snapshots',
    columns: [
      { key: 'sessionId', label: 'Session', type: 'id' },
      { key: 'kind', label: 'Kind' },
      { key: 'takenAt', label: 'Taken', type: 'time' },
      { key: 'name', label: 'Name' },
      { key: 'job', label: 'Job' },
      { key: 'level', label: 'Level', type: 'number' },
      { key: 'exp', label: 'EXP', type: 'number' },
      { key: 'expPct', label: 'EXP %', type: 'number' },
      { key: 'meso', label: 'Meso', type: 'number' },
    ],
    count: 'select count(*) as n from ms_session_snapshots',
    rows: `select session_id as "sessionId", kind, taken_at as "takenAt", name, job, level, exp,
                  exp_pct::float8 as "expPct", meso
             from ms_session_snapshots order by taken_at desc limit $1 offset $2`,
  },
  readings: {
    label: 'Readings',
    columns: [
      { key: 'takenAt', label: 'Taken', type: 'time' },
      { key: 'sessionId', label: 'Session', type: 'id' },
      { key: 'level', label: 'Level', type: 'number' },
      { key: 'exp', label: 'EXP', type: 'number' },
      { key: 'expPct', label: 'EXP %', type: 'number' },
      { key: 'meso', label: 'Meso', type: 'number' },
    ],
    count: 'select count(*) as n from ms_readings',
    rows: `select taken_at as "takenAt", session_id as "sessionId", level, exp, exp_pct::float8 as "expPct", meso
             from ms_readings order by taken_at desc limit $1 offset $2`,
  },
  avatars: {
    label: 'Avatars',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'bytes', label: 'Image bytes', type: 'number' },
      { key: 'fetchedAt', label: 'Fetched', type: 'time' },
    ],
    count: 'select count(*) as n from ms_character_avatars',
    rows: `select name, octet_length(png) as bytes, fetched_at as "fetchedAt"
             from ms_character_avatars order by fetched_at desc limit $1 offset $2`,
  },
};

export const VIEW_NAMES = Object.keys(VIEWS);
export const MAX_PAGE_SIZE = 200;

const total = async (view) => Number((await query(view.count)).rows[0].n);

/** Every view with its row count, for the tab strip. */
export async function listViews() {
  return Promise.all(VIEW_NAMES.map(async (name) => ({ name, label: VIEWS[name].label, total: await total(VIEWS[name]) })));
}

/** One page of a view, or null for a name that isn't on the menu. */
export async function readView(name, limit, offset) {
  const view = Object.hasOwn(VIEWS, name) ? VIEWS[name] : null;
  if (!view) return null;
  const [{ rows }, count] = await Promise.all([query(view.rows, [limit, offset]), total(view)]);
  return { name, label: view.label, columns: view.columns, rows, total: count, limit, offset };
}
