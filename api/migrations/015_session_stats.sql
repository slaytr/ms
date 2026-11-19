-- Per-session numbers derived from ms_readings (span, level range, EXP / EXP% / meso gained), stored so the
-- Maps, Rankings and live pages read ~200 small rows instead of window-scanning every reading each time.
--
-- Only readings-derived numbers live here. The map label, player name and job are joined in at read time, so
-- renaming a map or a character needs no recompute. A session is recomputed lazily: whoever writes its
-- readings bumps `version` and sets `stale`, and the next read refreshes the stale rows. A session with no
-- row at all (after a sync or a restore) counts as stale too. See api/store/session-stats.mjs.
--
-- Shared database: every object is prefixed ms_.

create table ms_session_stats (
  session_id      uuid primary key references ms_capture_sessions (id) on delete cascade,
  stale           boolean not null default true,
  -- Bumped on every readings write. A refresh only clears `stale` if the version is still the one it read,
  -- so a reading that lands while it computes is never lost.
  version         bigint not null default 1,
  readings        int not null default 0,
  first_at        timestamptz,
  last_at         timestamptz,
  seconds         double precision not null default 0,
  level_from      int,
  level_to        int,
  exp_gained      bigint not null default 0,
  exp_pct_gained  double precision not null default 0,
  meso_gained     bigint not null default 0,
  computed_at     timestamptz
);

create index ms_session_stats_first_at_idx on ms_session_stats (first_at desc);
