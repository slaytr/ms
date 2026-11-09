-- One-off data fix: six sessions on 2026-11-09 belong to YaeMiho (a Spearman), but his name and job were
-- never read off the screen, so they have no name and no row on the Characters page. They are identified
-- by the name-pixel fingerprint, which is the character's identity in this app.
--
-- Narrow on purpose: only that fingerprint, and only rows whose name / job is still blank, so anything
-- the detector reads later is never overwritten.

update ms_session_snapshots
   set name = case when coalesce(name, '') = '' then 'YaeMiho' else name end,
       job  = case when coalesce(job, '')  = '' then 'Spearman' else job end
 where fingerprint = 'pen8slfw6b'
   and (coalesce(name, '') = '' or coalesce(job, '') = '');

update ms_capture_sessions
   set character = 'YaeMiho'
 where fingerprint = 'pen8slfw6b'
   and coalesce(character, '') = '';
