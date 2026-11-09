-- One-off data fix: Melom is an Assassin, but the job line was never read for them, so their snapshots
-- have no job (and they get no slot in the Characters page's "Top by job").
--
-- Narrow on purpose: only this character, only rows where the job is still blank, so a job the detector
-- read later (or anything already correct) is never overwritten.

update ms_session_snapshots
   set job = 'Assassin'
 where lower(name) = 'melom'
   and (job is null or job = '');
