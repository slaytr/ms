-- Raw EXP points read from the status bar (e.g. 17,691). A whole number, far
-- more precise than exp_pct, which only has two decimals. Nullable: older
-- readings have none, and any single read can fail.
alter table ms_readings add column exp bigint check (exp >= 0);
