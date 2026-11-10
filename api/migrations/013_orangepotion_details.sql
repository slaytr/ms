-- One-off data fix: the session on 2026-11-10 with fingerprint 1u64gxmdrcg is OrangePotion, a level 34 Spearman,
-- but the name and job were never read off the screen, so it had no name. Identified by the name-pixel
-- fingerprint, the character's identity in this app, and confirmed by the owner.
--
-- Narrow on purpose: only that fingerprint, and only rows whose name / job is still blank, so anything the
-- detector reads later (or the player types in) is never overwritten.

update ms_session_snapshots
   set name = case when coalesce(name, '') = '' then 'OrangePotion' else name end,
       job  = case when coalesce(job, '')  = '' then 'Spearman' else job end
 where fingerprint = '1u64gxmdrcg'
   and (coalesce(name, '') = '' or coalesce(job, '') = '');

update ms_capture_sessions
   set character = 'OrangePotion'
 where fingerprint = '1u64gxmdrcg'
   and coalesce(character, '') = '';

-- Saved so a new browser skips the name form for this character; a name already saved is kept.
insert into ms_character_identities (fingerprint, name, job)
values ('1u64gxmdrcg', 'OrangePotion', 'Spearman')
on conflict (fingerprint) do update
   set name = coalesce(nullif(ms_character_identities.name, ''), excluded.name),
       job  = coalesce(nullif(ms_character_identities.job, ''), excluded.job);
