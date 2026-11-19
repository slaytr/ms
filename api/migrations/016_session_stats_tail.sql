-- EXP% gained after a session's last raw EXP reading. The game stops showing raw EXP once it passes 1M, so a
-- session can switch to percent-only part way through; exp_gained then stops growing and only this keeps
-- counting. Sized into EXP by the live page. See api/store/session-stats.mjs.
alter table ms_session_stats add column exp_tail_pct_gained double precision not null default 0;
-- Existing rows are recomputed on their next read.
update ms_session_stats set stale = true;
