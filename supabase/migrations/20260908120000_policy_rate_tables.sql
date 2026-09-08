-- supabase/migrations/20260908120000_policy_rate_tables.sql
-- Supabase as the system of record for the /business/economy policy-rate
-- layer (scripts/macro/RATES-CONTRACT.md), same pattern as
-- public.market_series_daily (scripts/business/series_store.py): the JSON
-- under public/data/business/economy/rates/** is the read model the pages
-- load, these two tables are what survives a disk loss and what a future
-- reader (a query, a comparison, an alert) can hit directly.
--
-- Writers: scripts/macro/rates/refresh.py --write (weekly incremental) and
-- scripts/macro/rates/load_policy_rates.py --write (one-time seed from the
-- current JSON files). Both use the service_role key via the shared rest()
-- helper (scripts/business/load_market_series.py's rest(), same as
-- series_store.py) and are FAIL-OPEN without SUPABASE_SERVICE_KEY, exactly
-- like series_store.py: a missing key logs loudly and skips the Supabase
-- write, it never fails the JSON build.
--
-- RLS idiom: public read (public policy-rate data, no PII), no anon write
-- policy at all -- only the service_role key (which bypasses RLS) writes.
-- Matches scripts/supabase/OTHER-LEAGUES-SUPABASE.md's documented pattern
-- and the post-2026-08-02 mktcap lockdown: no anon insert/update policy is
-- ever created, temporary or otherwise.

create table if not exists public.policy_rate_changes (
  bank_code  text        not null,
  date       date        not null,
  level      numeric(8,4) not null,
  change     numeric(8,4),
  lower      numeric(8,4),
  upper      numeric(8,4),
  era_name   text        not null,
  kind       text        not null check (kind in ('policy', 'market')),
  source     text        not null,
  built_at   date        not null,
  primary key (bank_code, date)
);

comment on table public.policy_rate_changes is
  'One row per decision date per central bank (policy-era rows only, per '
  'RATES-CONTRACT.md), the same rows public/data/business/economy/rates/'
  '<code>.json carries in `changes`. era_name is the instrument''s short '
  'name at that date; kind is "policy" (the bank sets it) or "market" (BIS '
  'daily proxy). source distinguishes how the row entered: "own" (the '
  'bank''s own change table, fetched by refresh.py), "bis" (derived from '
  'BIS daily levels), or "seed" (loaded once from the committed JSON by '
  'load_policy_rates.py). built_at is the date the row was written.';

create index if not exists policy_rate_changes_bank_date_idx
  on public.policy_rate_changes (bank_code, date desc);

create table if not exists public.policy_rate_daily (
  bank_code text        not null,
  date      date        not null,
  level     numeric(8,4) not null,
  primary key (bank_code, date)
);

comment on table public.policy_rate_daily is
  'BIS CBPOL daily levels (WS_CBPOL), one row per bank_code (a bis-<iso2> '
  'code or an own-spine code''s BIS cross-check series) per calendar day. '
  'This is the incremental cache refresh.py maintains between weekly runs '
  'so it never re-downloads the 470 MB bulk BIS file; the local mirror is '
  'scripts/macro/rates/cache/bis-daily/<iso2>.json.';

create index if not exists policy_rate_daily_bank_date_idx
  on public.policy_rate_daily (bank_code, date desc);

alter table public.policy_rate_changes enable row level security;
alter table public.policy_rate_daily   enable row level security;

create policy "policy_rate_changes read" on public.policy_rate_changes
  for select to anon, authenticated using (true);

create policy "policy_rate_daily read" on public.policy_rate_daily
  for select to anon, authenticated using (true);
