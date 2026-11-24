-- One-off data repair. Until the tracker learned to end a session when the player switched character in-game,
-- readings of the second character piled onto the first one's session. AstraYao (1fc1offng27) sessions hold
-- YaeMiho (pen8slfw6b) readings at level ~54, and YaeMiho's name and spec were saved against AstraYao's
-- fingerprint, which showed YaeMiho twice in the rankings.
--
-- Per session of the owner fingerprint: readings are cut wherever the level jumps by more than 5; a piece of
-- fewer than 5 readings is noise and is deleted; a piece at level 40+ in a session that also has a piece below
-- 40 belongs to the other character and moves to a new session under their fingerprint; the rest stays and the
-- session's end snapshot is rebuilt from it. Snapshots that carry the other character's name or spec are put
-- right and the owner's saved identity is set. Session stats are dropped so they recompute on the next read.
--
-- Safe to run on any database: with no such sessions nothing changes, and a second run finds nothing to do.
-- Shared database: only ms_ objects are touched.

do $$
declare
  owner_fp     constant text := '1fc1offng27';
  owner_name   constant text := 'AstraYao';
  owner_job    constant text := 'Magician';
  foreign_fp   constant text := 'pen8slfw6b';
  foreign_name constant text := 'YaeMiho';
  foreign_job  constant text := 'Spearman';
  min_level    constant int  := 40;
  max_step     constant int  := 5;
  min_piece    constant int  := 5;
begin
  if not exists (select 1 from ms_capture_sessions where fingerprint = owner_fp) then
    return;
  end if;

  -- Every reading of the owner's sessions, with the piece it falls in.
  create temp table fix_readings on commit drop as
  with ordered as (
    select r.id, r.session_id, r.taken_at, r.level,
           count(r.level) over w as seen,
           row_number() over w as pos
      from ms_readings r
      join ms_capture_sessions s on s.id = r.session_id
     where s.fingerprint = owner_fp
    window w as (partition by r.session_id order by r.taken_at, r.id)
  ), filled as (
    -- The last level read at or before each reading (levels are not on every row).
    select o.*, first_value(o.level) over (partition by o.session_id, o.seen order by o.pos) as fill
      from ordered o
  ), jumps as (
    select f.*,
           (f.level is not null
            and lag(f.fill) over (partition by f.session_id order by f.pos) is not null
            and abs(f.level - lag(f.fill) over (partition by f.session_id order by f.pos)) > max_step) as jump
      from filled f
  )
  select id, session_id, taken_at, level,
         sum(case when jump then 1 else 0 end) over (partition by session_id order by pos) as piece
    from jumps;

  create temp table fix_pieces on commit drop as
  select session_id, piece, count(*) as n,
         percentile_disc(0.5) within group (order by level) as median_level
    from fix_readings
   group by session_id, piece;

  -- keep / move / drop for each piece. A session in one piece is never touched.
  alter table fix_pieces add column action text;
  update fix_pieces p set action = case
      when p.n < min_piece or p.median_level is null then 'drop'
      when p.median_level >= min_level
           and exists (select 1 from fix_pieces o where o.session_id = p.session_id and o.median_level < min_level and o.n >= min_piece)
        then 'move'
      else 'keep'
    end;
  delete from fix_pieces p
   where (select count(*) from fix_pieces o where o.session_id = p.session_id) = 1;
  delete from fix_pieces where action = 'keep' and session_id not in (select session_id from fix_pieces where action <> 'keep');

  -- Noise goes.
  delete from ms_readings where id in (
    select r.id from fix_readings r join fix_pieces p using (session_id, piece) where p.action = 'drop');

  -- Each moved piece becomes its own session under the other character's fingerprint.
  create temp table fix_moves on commit drop as
  select p.session_id as old_id, p.piece, gen_random_uuid() as new_id
    from fix_pieces p where p.action = 'move';

  insert into ms_capture_sessions (id, label, character, fingerprint, party_size, started_at, ended_at)
  select m.new_id, s.label, '', foreign_fp, s.party_size,
         (select min(r.taken_at) from fix_readings r where r.session_id = m.old_id and r.piece = m.piece),
         (select max(r.taken_at) from fix_readings r where r.session_id = m.old_id and r.piece = m.piece)
    from fix_moves m join ms_capture_sessions s on s.id = m.old_id;

  -- Snapshots first (they read the readings where they still are), then the readings move.
  insert into ms_session_snapshots (session_id, kind, taken_at, fingerprint, name, job, level, exp, exp_pct, meso)
  select m.new_id, 'start', f.taken_at, foreign_fp, foreign_name, foreign_job, f.level, f.exp, f.exp_pct, null
    from fix_moves m
    cross join lateral (
      select r.taken_at, r.level, r.exp, r.exp_pct
        from ms_readings r join fix_readings fr on fr.id = r.id
       where fr.session_id = m.old_id and fr.piece = m.piece
       order by r.taken_at, r.id limit 1) f;

  insert into ms_session_snapshots (session_id, kind, taken_at, fingerprint, name, job, level, exp, exp_pct, meso)
  select m.new_id, 'end', e.taken_at, foreign_fp, foreign_name, foreign_job, e.level, e.exp, e.exp_pct, e.meso
    from fix_moves m
    cross join lateral (
      select max(r.taken_at) as taken_at,
             (array_agg(r.level   order by r.taken_at desc, r.id desc) filter (where r.level   is not null))[1] as level,
             (array_agg(r.exp     order by r.taken_at desc, r.id desc) filter (where r.exp     is not null))[1] as exp,
             (array_agg(r.exp_pct order by r.taken_at desc, r.id desc) filter (where r.exp_pct is not null))[1] as exp_pct,
             (array_agg(r.meso    order by r.taken_at desc, r.id desc) filter (where r.meso    is not null))[1] as meso
        from ms_readings r join fix_readings fr on fr.id = r.id
       where fr.session_id = m.old_id and fr.piece = m.piece) e;

  update ms_readings r set session_id = m.new_id
    from fix_readings fr join fix_moves m on m.old_id = fr.session_id and m.piece = fr.piece
   where r.id = fr.id;

  -- Sessions that lost readings: the end snapshot follows what is left.
  update ms_session_snapshots n set
      taken_at = k.taken_at, level = k.level, exp = k.exp, exp_pct = k.exp_pct
    from (
      select s.session_id,
             max(r.taken_at) as taken_at,
             (array_agg(r.level   order by r.taken_at desc, r.id desc) filter (where r.level   is not null))[1] as level,
             (array_agg(r.exp     order by r.taken_at desc, r.id desc) filter (where r.exp     is not null))[1] as exp,
             (array_agg(r.exp_pct order by r.taken_at desc, r.id desc) filter (where r.exp_pct is not null))[1] as exp_pct
        from (select distinct session_id from fix_pieces where action <> 'keep') s
        join ms_readings r on r.session_id = s.session_id
       group by s.session_id) k
   where n.session_id = k.session_id and n.kind = 'end' and k.level is not null;

  update ms_capture_sessions c set ended_at = k.last_at
    from (select r.session_id, max(r.taken_at) as last_at
            from ms_readings r where r.session_id in (select session_id from fix_pieces where action <> 'keep')
           group by r.session_id) k
   where c.id = k.session_id and c.ended_at is not null;

  -- Snapshots that carry the other character's name or spec, and the owner's saved identity.
  update ms_session_snapshots set name = owner_name, job = owner_job
   where fingerprint = owner_fp and (name = foreign_name or job = foreign_job);

  insert into ms_character_identities (fingerprint, name, job) values (owner_fp, owner_name, owner_job)
  on conflict (fingerprint) do update set name = excluded.name, job = excluded.job, updated_at = now();

  -- Stats are derived from readings: let them recompute (a session with no row counts as stale).
  delete from ms_session_stats where session_id in (select session_id from fix_pieces where action <> 'keep');
end
$$;
