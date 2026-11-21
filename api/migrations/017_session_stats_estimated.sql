-- exp_gained now holds the whole EXP gain of a session, exact where raw EXP was read and sized from the EXP
-- percent where it was not (the same figure web/src/lib/metrics.ts gives the tracker), so a mix of the two
-- no longer undercounts. exp_estimated says part of it is estimated. exp_tail_pct_gained is no longer used.
alter table ms_session_stats add column exp_estimated boolean not null default false;
-- Recomputed on the next read.
update ms_session_stats set stale = true;
