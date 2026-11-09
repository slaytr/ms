-- Screenshots the detector could not fully read, kept so they can be pulled from production, labelled
-- and trained on (scripts/pull-misses.mjs). One row per frame.
--
-- No foreign key to ms_capture_sessions on purpose: a frame may arrive before any session exists
-- (nothing readable yet), and the local `sync:prod` truncates sessions with CASCADE, which would
-- wipe frames that had a key. Bounded in size by the API (see api/store/miss-frames.mjs).

create table ms_miss_frames (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  session_id  uuid,
  width       int not null check (width between 1 and 16384),
  height      int not null check (height between 1 and 16384),
  -- Which pieces of data could not be read: character, level, exp, meso, minimap, map.
  missing     text[] not null,
  -- Same-looking misses share a signature so the API can cap duplicates.
  signature   text not null,
  -- What the detector DID read, so a label can start from it. No secrets.
  detection   jsonb not null,
  user_agent  text,
  png         bytea not null check (octet_length(png) between 1 and 8388608)
);

create index ms_miss_frames_signature_idx on ms_miss_frames (signature);
