-- How many players were in the party for a session. Typed in by the player (the game window doesn't
-- show it reliably), so it defaults to 1 (solo) and is capped at the game's party limit of 6.
alter table ms_capture_sessions
  add column party_size integer not null default 1 check (party_size between 1 and 6);
