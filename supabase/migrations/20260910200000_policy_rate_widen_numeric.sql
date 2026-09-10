-- supabase/migrations/20260910200000_policy_rate_widen_numeric.sql
-- The first seed (load_policy_rates.py --write, mini, 2026-09-10) failed with
-- HTTP 400: numeric(8,4) caps a level at 9999.9999 and the BIS series carry
-- hyperinflation-era policy rates far above it (bis-br 1989-10-06 10532.58%,
-- peak 790799.14%; the largest single change 258402.15). Widen every rate
-- column to numeric(14,4); the primary keys, indexes and policies are
-- unchanged. Idempotent: ALTER TYPE to the same type is a no-op.

alter table public.policy_rate_changes
  alter column level  type numeric(14,4),
  alter column change type numeric(14,4),
  alter column lower  type numeric(14,4),
  alter column upper  type numeric(14,4);

alter table public.policy_rate_daily
  alter column level type numeric(14,4);
