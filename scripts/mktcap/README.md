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
4. (mini runner only, since 2026-08-29 evening) `update_top_companies.py --write` —
   patches the `marketCap` block of `public/data/details/*.json` + meta.json's
   `companiesAsOf` straight from that CSV, then commits UNTAGGED (details are
   build-time reads; that commit is the weekly production build). The site's
   Top Companies sections therefore track the Saturday run with no Excel step;
   extract.py also reads the CSV now, so a later workbook-sync converges to
   the same bytes instead of reverting to the workbook's Power Query cache.

## The metro curation queue (Ashwin)
New companies land with `metro = null` in `mktcap_geo` (`mapped_by='auto-stub'`).
The report lists them. Assign via any Claude session / SQL:
    update mktcap_geo set metro='San Francisco-San Jose', city='...', state='...',
      mapped_by='ashwin', mapped_at=current_date where symbol='XYZ';
Rules: strict HQ-in-metro (~30km); metro must exist in mktcap_valid_metros;
when uncertain leave null and skip. The pipeline NEVER guesses.

**Region vs radius.** The ~30km is a default for a metro named after one city,
not the test itself. The test is whether the HQ is IN the metro, and some
entries in mktcap_valid_metros are polycentric regions rather than cities --
Rhine-Neckar and Rhine-Ruhr say so in their names, and `Frankfurt` is read as
the Rhein-Main region. Inside a region the distance to its largest city can
exceed 30km and the mapping is still right. Two rows record that reading:

| company | HQ | metro | distance | set by |
|---|---|---|---|---|
| (workbook row) | Mainz | Frankfurt | ~35km | excel-sync |
| Boehringer Ingelheim | Ingelheim am Rhein | Frankfurt | ~45km | ashwin, 2026-09-05 |

Ingelheim is in the Mainz-Bingen district, which is part of the official
Frankfurt Rhein-Main region, so it is inside the metro on the region reading and
outside it on the radius one. Ashwin ruled for the region.

The guardrail is that this applies only where the metro genuinely IS a region --
named as one, or officially polycentric. It is not licence to stretch a
single-city metro to whatever sits 45km away: Monett, Missouri is ~60km from
Springfield (MO) and that is a `no-metro`, not a Springfield mapping, because
Springfield is a city metro and Monett is not in it.

When you have LOOKED and no valid metro applies -- Dot Foods in Mount Sterling,
Illinois; Arctic Slope Regional in Utqiagvik -- record that instead of leaving
it to be re-reviewed forever:
    update mktcap_geo set mapped_by='no-metro', mapped_at=current_date
      where symbol='XYZ';   -- metro stays null
`no-metro` is the queue's terminal state and build_merged.py drops those rows
from it.

There is a third state for a different situation. When the HQ is in a real city
that `mktcap_valid_metros` simply does not list yet, that is a gap in the metro
list, not a fact about the company, and `no-metro` would make it permanent:
    update mktcap_geo set mapped_by='metro-gap', mapped_at=current_date
      where symbol='XYZ';   -- metro stays null
`metro-gap` is a HOLD, not a resolution. It leaves the weekly queue like
`no-metro` but is counted separately (`held-metro-gap=` in METRO QUEUE COUNTS)
and named on its own report line, so it can be re-entered the day the metro is
added. Used 2026-09-05 for Chaozhou Three-Circle (Chaozhou ~2.5M), Chifeng
Jilong Gold (Chifeng) and Tongling Nonferrous (Tongling) -- all absent from the
list while comparable Huainan and Bengbu are in it. **Adding metro areas is its
own decision with its own criteria; do not add one just to clear a company.** It is a decision, not a guess: the never-guesses rule is about the
pipeline inventing a metro, not about a human recording that none exists. Leave
`auto-stub`/`seed` in place when you simply have not looked yet.

The queue is a STANDING BACKLOG, not a weekly delta. As of 2026-09-05, 6,805 of
12,996 active companies have no metro -- but 7,720 of those geo rows are
`mapped_by='seed'`, i.e. they arrived unmapped in the 2026-07-23 workbook seed
and were never mapped there either; only ~53 were ever queued by this pipeline.
By weight the gap is small: the unmapped tail is 3.1% of world market cap
($5.66T of $181.93T). The weekly ntfy therefore reports COUNTS plus what is
actionable (new this run, and anything at or above `NOTABLE_CAP_USD`, $10B,
which is 14 companies today); the full standing list goes to
mac-mini-jobs/mktcap-review-queue.md, which is the channel the
mktcap-weekly-metro-mapping-research cloud routine reads.

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
