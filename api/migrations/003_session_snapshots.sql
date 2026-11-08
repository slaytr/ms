-- Who a session belongs to, plus where the player stood when it started and ended.
-- There are no accounts: the fingerprint (hash of the on-screen name pixels) is the
-- per-character identity, so graphs across sessions group on it.

alter table ms_capture_sessions add column fingerprint text;
create index ms_capture_sessions_fingerprint_idx on ms_capture_sessions (fingerprint, started_at desc);

-- At most one 'start' and one 'end' row per session. Tiny next to ms_readings: two rows per session.
-- Every value is nullable: meso is only visible while the inventory is open, and any read can fail.
create table ms_session_snapshots (
  id           bigserial primary key,
  session_id   uuid not null references ms_capture_sessions (id) on delete cascade,
  kind         text not null check (kind in ('start', 'end')),
  taken_at     timestamptz not null default now(),
  fingerprint  text,
  name         text,
  job          text,
  level        int check (level between 1 and 300),
  exp          bigint check (exp >= 0),
  exp_pct      numeric(7, 4) check (exp_pct >= 0 and exp_pct <= 100),
  meso         bigint check (meso >= 0),
  unique (session_id, kind)
);

-- "Show me this character's progress over time", across sessions.
create index ms_session_snapshots_fingerprint_idx on ms_session_snapshots (fingerprint, taken_at);
