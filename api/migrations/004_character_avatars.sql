-- Our own copy of each character's sprite, so the app doesn't depend on ClassicRank at display time.
-- Refreshed (at most every 3 hours) when a session starts. One row per character, keyed by lowercase name.

create table ms_character_avatars (
  name_key    text primary key check (name_key = lower(name_key)),
  name        text not null,
  png         bytea not null check (octet_length(png) between 1 and 262144),
  fetched_at  timestamptz not null default now()
);
