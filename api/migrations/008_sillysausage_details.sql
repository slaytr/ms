-- One-off data fix: the session on 2026-11-09 (fingerprint 15rbd3eptnr) is SillySausage, a level 40 Assassin,
-- but his name and job were never read off the screen, so he has no name and no row on the Characters page.
-- Identified by the name-pixel fingerprint, which is the character's identity in this app.
--
-- Narrow on purpose: only that fingerprint, and only rows whose name / job is still blank, so anything
-- the detector reads later is never overwritten.

update ms_session_snapshots
   set name = case when coalesce(name, '') = '' then 'SillySausage' else name end,
       job  = case when coalesce(job, '')  = '' then 'Assassin' else job end
 where fingerprint = '15rbd3eptnr'
   and (coalesce(name, '') = '' or coalesce(job, '') = '');

update ms_capture_sessions
   set character = 'SillySausage'
 where fingerprint = '15rbd3eptnr'
   and coalesce(character, '') = '';
