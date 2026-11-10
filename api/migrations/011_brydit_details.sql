-- One-off data fix: the session on 2026-11-10 with fingerprint 4jsl8e0i8v is thought to be Brydit, a level 50 Bandit
-- (240,089 EXP = 33.83%), but the name was never read off the screen, so the session has no name.
-- Not confirmed from the game: the owner believes it is Brydit. Identified by the name-pixel fingerprint, the
-- character's identity in this app. If Brydit's own player types a different name in, that wins (see below).
--
-- Narrow on purpose: only that fingerprint, and only rows whose name is still blank, so anything the
-- detector reads later (or the player types in) is never overwritten.

update ms_session_snapshots
   set name = 'Brydit'
 where fingerprint = '4jsl8e0i8v'
   and coalesce(name, '') = '';

update ms_capture_sessions
   set character = 'Brydit'
 where fingerprint = '4jsl8e0i8v'
   and coalesce(character, '') = '';

-- Only a starting point: a name already saved for this fingerprint is kept.
insert into ms_character_identities (fingerprint, name, job)
values ('4jsl8e0i8v', 'Brydit', 'Bandit')
on conflict (fingerprint) do update
   set name = coalesce(nullif(ms_character_identities.name, ''), excluded.name),
       job  = coalesce(nullif(ms_character_identities.job, ''), excluded.job);
