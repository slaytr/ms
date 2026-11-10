-- What each character has bought and rolled in the Loot tab (the NX loot box simulator), keyed by the
-- on-screen fingerprint like everything else. Only what must be remembered is stored:
--   * the bag, 96 slots as JSON: null = empty, "c" = an unopened crate, a number = the id of an item rolled from one
--   * how much NX has been spent
-- A character's earned NX is never stored: it is worked out from their EXP gained across all sessions (7,000
-- to start, +35,000 per 200,000 EXP), so it always matches the sessions on record.

create table ms_loot_state (
  fingerprint    text primary key,
  bag            jsonb not null default '[]'::jsonb,
  nx_spent       bigint not null default 0 check (nx_spent >= 0),
  crates_opened  integer not null default 0 check (crates_opened >= 0),
  last_open      jsonb not null default '[]'::jsonb,
  updated_at     timestamptz not null default now()
);
