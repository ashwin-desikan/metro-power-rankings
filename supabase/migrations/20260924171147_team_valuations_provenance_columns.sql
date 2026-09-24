-- supabase/migrations/20260924130000_team_valuations_provenance_columns.sql
--
-- Adds per-row provenance to public.team_valuations: method (published vs.
-- transaction-inferred), confidence, and a direct source_url. Added
-- 2026-09-24 alongside Ashwin's ruling that Supabase is now the ONLY source
-- of truth for team valuations (OtherLeagues.xlsx is retired for this
-- pipeline -- see scripts/valuations/sync_team_valuations.py, now a refusal,
-- and its replacement scripts/valuations/upsert_team_valuations.py).
--
-- lib/valuations.ts and app/sports/valuations/ValuationsTable.tsx read these
-- as optional fields (older rows predate this migration and simply have
-- them null), so this migration is backward-compatible with every existing
-- row and requires no backfill to ship.
--
-- Applied 2026-09-24 after Ashwin's approval.

begin;

alter table public.team_valuations add column if not exists method text;
alter table public.team_valuations add column if not exists confidence text;
alter table public.team_valuations add column if not exists source_url text;

comment on column public.team_valuations.method is
  'How the figure was derived: "published" (a formal annual valuation '
  'exercise, e.g. Sportico/Football Benchmark) or "transaction" (inferred '
  'from a real sale price). Null on rows that predate this column.';
comment on column public.team_valuations.confidence is
  'Confidence in the figure ("high" / "medium" / "low"), set by whoever '
  'curated the row. Null on rows that predate this column.';
comment on column public.team_valuations.source_url is
  'Direct link to the source article/report, when known. Null on rows that '
  'predate this column or whose source has no single URL.';

commit;
