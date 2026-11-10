-- One-off data fix: the two sessions on 2026-11-10 with fingerprint 21mnpc31v1b are Bellatryx, a level 40 Bandit,
-- but the name was never read off the screen, so they have no name.
-- Checked against the EXP table: level 40 needs 294,216 EXP, and the readings (76,371 EXP = 25.96%,
-- 93,375 EXP = 31.74%) imply 294,187 and 294,187. Identified by the name-pixel fingerprint, the character's
-- identity in this app. The other nameless Bandit (4jsl8e0i8v) is level 50, so it is not touched.
--
-- Narrow on purpose: only that fingerprint, and only rows whose name is still blank, so anything the
-- detector reads later (or the player types in) is never overwritten.

update ms_session_snapshots
   set name = 'Bellatryx'
 where fingerprint = '21mnpc31v1b'
   and coalesce(name, '') = '';

update ms_capture_sessions
   set character = 'Bellatryx'
 where fingerprint = '21mnpc31v1b'
   and coalesce(character, '') = '';

insert into ms_character_identities (fingerprint, name, job)
values ('21mnpc31v1b', 'Bellatryx', 'Bandit')
on conflict (fingerprint) do update
   set name = coalesce(nullif(ms_character_identities.name, ''), excluded.name),
       job  = coalesce(nullif(ms_character_identities.job, ''), excluded.job);
