# scripts/mktcap — CompaniesMarketCap → Supabase weekly pipeline

Replaces the CompaniesMarketCap.xlsx Saturday ritual. Source of truth: `mktcap_*`
tables in Supabase (seeded 2026-07-23 from the workbook's Session 91 state and
verified to exact parity: 4,338 mapped metros, $161.75T mapped subtotal).

## Run modes
    python refresh.py --self-test    offline fixture tests (no network)
    python refresh.py                dry-run: fetch both sources, full report, NO writes
    python refresh.py --write        weekly refresh: snapshot + diffs + export CSV

## What a weekly --write run does
1. `fetch_source.py` — companiesmarketcap.com CSV + CB Insights unicorn table.
   If a fetch fails, drop the file manually into `drop/` (companiesmarketcap.csv,
   unicorns.html or unicorns.csv) and re-run: failure degrades to a 1-minute manual step.
2. `build_merged.py` — replicates the Excel Merged Master: public rows (mcap>0),
   unicorns not name-matched to a public company (IPO dedup), private at 3x revenue,
   symbol renames + overrides applied, sorted, ranked. Sanity gate: any source count
   swinging >5% week-over-week aborts before writing (assume fetch/parse bug first).
   Writes: new companies, last_seen/is_active updates, the weekly valuation snapshot,
   and blank geo stubs for new unmapped companies (the curation queue).
3. `export_csv.py` — `out/mktcap_export.csv` in MktCap_Data A:D shape,
   FULL universe, blanks for unmapped (never a filtered subset).

## The metro curation queue (Ashwin)
New companies land with `metro = null` in `mktcap_geo` (`mapped_by='auto-stub'`).
The report lists them. Assign via any Claude session / SQL:
    update mktcap_geo set metro='San Francisco-San Jose', city='...', state='...',
      mapped_by='ashwin', mapped_at=current_date where symbol='XYZ';
Rules: strict HQ-in-metro (~30km); metro must exist in mktcap_valid_metros;
when uncertain leave null and skip. The pipeline NEVER guesses.

## MetroAreas.xlsx import contract (verified 2026-07-23)
MktCap_Data holds A:D = Metro Area / Valuation / Company Name / Source; stamps
E1 (ISO date), E2 (display), K1/K2 mirror, K4 auto-COUNTA. Metro Areas AT/AU are
live COUNTIFS/SUMIFS over MktCap_Data, and extract.py reads AT (companies) and
AU (marketCap) — so ONE import updates headline numbers and company lists together.
Procedure: replace A2:D{N+1} from out/mktcap_export.csv, clear stale rows below,
stamp E1/E2, confirm calc mode Automatic, save. Then the normal
sync_source_xlsx.py → extract.py flow.

## Access + hardening
Reads are public (anon, RLS `USING (true)`). Writes require the **service_role**
key: the anon role's insert/update grants and `WITH CHECK (true)` policies on
companies/geo/valuations were revoked (migration `lock_down_mktcap_pipeline_writes`,
2026-08-02) after a review found they let anyone holding the public anon key —
which ships in every browser bundle — write directly to these tables via
PostgREST, no app involved. service_role bypasses RLS by design, so no
replacement policy is needed for the pipeline; put the service_role secret
(Supabase dashboard -> Settings -> API) in `supabase_key.txt` (gitignored) or
env MKTCAP_SUPABASE_KEY. No deletes anywhere; overrides/private/unicorns/
valid_metros/symbol_changes remain read-only to anon and curated via the
Supabase MCP. Treat this key like any other production secret: it bypasses
RLS entirely, so it must never end up in a client bundle, a committed file,
or a public CI log.

## Not automated by design
Forbes private-companies list (~annual, curate mktcap_private via MCP);
unicorn valuation corrections (mktcap_overrides); metro assignments (above).
`mktcap_unicorns` is the seed-era record; weekly runs read the live CB fetch
directly and don't rewrite it (revisit if unicorn history becomes interesting).
