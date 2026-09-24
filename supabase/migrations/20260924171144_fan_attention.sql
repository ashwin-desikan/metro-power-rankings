-- supabase/migrations/20260924120000_fan_attention.sql
--
-- Backing store for the Fan Attention Index (/fans). Ashwin's repo is
-- public, so the full per-team dataset (770 teams, valuations, monthly
-- Wikipedia series) can no longer live in the repo at all, even server-only
-- under data/ -- a public git history is a public git history. Supabase is
-- now the system of record; data/fans/fan-attention.json and
-- data/fans/history/*.json are produced locally by scripts/fans/
-- csv_to_json.py and monthly_refresh.py as before, then pushed here by
-- scripts/fans/push_to_supabase.py (service_role only) and gitignored (see
-- .gitignore). Only data/fans/preview.json (top 20, four fields) stays
-- committed, for the public server-rendered page.
--
-- TABLE SHAPE, PICKED FOR SIMPLICITY. One row per version/month with the
-- entire JSON payload as jsonb, not one row per team. The alternative (one
-- row per team, version + generated_at + a per-team jsonb payload, primary
-- key (version, team)) would need 770 upserted rows and a client-side or
-- SQL-side re-assembly into the array shape app/api/fans/route.ts and
-- lib/fanIndex.ts's team-linking logic already expect (RawFile.teams).
-- Storing the whole file as one jsonb value means: the loader does one
-- upsert per refresh, the reader does one `select payload order by
-- generated_at desc limit 1`, and the payload shape is byte-for-byte what
-- csv_to_json.py already writes to data/fans/fan-attention.json --
-- app/api/fans/route.ts and lib/fanIndex.ts's parseFanIndexPayload() can
-- treat a Supabase row and a local dev JSON file identically. The tradeoff
-- (no per-team SQL querying) is not a real cost here: nothing needs to
-- query one team out of Postgres directly, every consumer wants either the
-- whole thing (the gated API route) or a small precomputed slice (the
-- committed preview.json).
--
-- RLS, mirroring 20260924080603_rls_hardening_locks_and_writes.sql's idiom
-- (public read where the data is public, service_role-only write, no
-- policy at all for INSERT/UPDATE/DELETE so only a key that bypasses RLS
-- can write) but tightened one notch further: SELECT is granted to
-- `authenticated` ONLY, not `anon`. Unlike policy_rate_changes (openly
-- public data), this table exists specifically because sign-in gates the
-- full Fan Attention Index -- an anon SELECT policy here would let anyone
-- read the whole table straight from PostgREST with the public anon key,
-- skipping the sign-in wall app/api/fans/route.ts otherwise enforces. There
-- is deliberately no anon policy at all (not even a narrower one): the
-- table is invisible to anon, full stop.

begin;

create table if not exists public.fan_attention_teams (
  version      text primary key,
  generated_at timestamptz not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);

comment on table public.fan_attention_teams is
  'One row per Fan Attention Index build. payload is the exact object '
  'data/fans/fan-attention.json holds for that version (generated, window, '
  'version, method_url, groups, residual_eligible_groups, teams[]: every '
  'field lib/fanIndex.ts''s RawFile type expects). Readers always want the '
  'latest build: select payload order by generated_at desc limit 1. Old '
  'versions are kept, not overwritten, so a bad refresh can be diagnosed or '
  'rolled back by pointing the loader at an older version key.';

create index if not exists fan_attention_teams_generated_at_idx
  on public.fan_attention_teams (generated_at desc);

create table if not exists public.fan_attention_history (
  month      text primary key,  -- "YYYY-MM"
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.fan_attention_history is
  'One row per calendar month, payload mirroring a data/fans/history/'
  '<month>.json file (per-team monthly Wikipedia baselines for that month, '
  'the source the 12-month rolling window in fan_attention_teams.payload is '
  'built from). Written by scripts/fans/push_to_supabase.py alongside '
  'fan_attention_teams on every monthly refresh; a month, once written, is '
  'upserted in place if the same month runs again (e.g. a corrected '
  're-run), never duplicated.';

alter table public.fan_attention_teams   enable row level security;
alter table public.fan_attention_history enable row level security;

-- Signed-in read only. No anon policy exists for either table (see the
-- header note above) and no INSERT/UPDATE/DELETE policy exists for anyone:
-- scripts/fans/push_to_supabase.py writes with the service_role key, which
-- bypasses RLS entirely and needs no grant here.
drop policy if exists fan_attention_teams_authenticated_read on public.fan_attention_teams;
create policy fan_attention_teams_authenticated_read on public.fan_attention_teams
  for select to authenticated using (true);

drop policy if exists fan_attention_history_authenticated_read on public.fan_attention_history;
create policy fan_attention_history_authenticated_read on public.fan_attention_history
  for select to authenticated using (true);

-- Belt and braces: no table privileges for anon at all.
revoke all on public.fan_attention_teams, public.fan_attention_history from anon;

commit;
