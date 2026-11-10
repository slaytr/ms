-- The name and spec a player typed in (or that we already know) for a character, keyed by the on-screen
-- fingerprint. Detection is unreliable for names, so this is the fallback for any session or browser
-- where the detector could not read them: listings use the name/job they find on a snapshot first and
-- fall back to this row. One row per character; the newest entry wins.

create table ms_character_identities (
  fingerprint  text primary key,
  name         text check (name is null or char_length(name) between 1 and 40),
  job          text check (job is null or char_length(job) between 1 and 80),
  updated_at   timestamptz not null default now()
);

-- Seed from what the snapshots already hold: the newest non-blank name and job per fingerprint, so
-- existing players are not asked again from a new browser.
with n as (
  select distinct on (fingerprint) fingerprint, name
    from ms_session_snapshots
   where fingerprint is not null and coalesce(name, '') <> ''
   order by fingerprint, taken_at desc
), j as (
  select distinct on (fingerprint) fingerprint, job
    from ms_session_snapshots
   where fingerprint is not null and coalesce(job, '') <> ''
   order by fingerprint, taken_at desc
)
insert into ms_character_identities (fingerprint, name, job)
select n.fingerprint, n.name, j.job
  from n
  left join j on j.fingerprint = n.fingerprint;
