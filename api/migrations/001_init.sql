-- Initial schema: capture sessions and the readings OCR'd from shared-screen frames.
--
-- This app shares a Postgres database with other projects (e.g. ../iron), so
-- every object here is prefixed ms_ (tables, indexes, and the sequence that
-- bigserial derives from the table name). Never create an unprefixed object.

create table ms_capture_sessions (
  id           uuid primary key default gen_random_uuid(),
  -- Secret held by the browser that started the session; required to append
  -- readings. Never synced from prod (see scripts/sync-from-prod.mjs).
  owner_token  uuid not null default gen_random_uuid(),
  label        text not null default '',
  character    text not null default '',
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);

create index ms_capture_sessions_started_at_idx on ms_capture_sessions (started_at desc);

create table ms_readings (
  id          bigserial primary key,
  session_id  uuid not null references ms_capture_sessions (id) on delete cascade,
  taken_at    timestamptz not null,
  -- Nullable: OCR can fail on any single field for any single frame.
  meso        bigint check (meso >= 0),
  exp_pct     numeric(7, 4) check (exp_pct >= 0 and exp_pct <= 100),
  level       int check (level between 1 and 300)
);

create index ms_readings_session_taken_idx on ms_readings (session_id, taken_at);
