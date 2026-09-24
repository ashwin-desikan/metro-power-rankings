# scripts/fans -- Fan Attention Index maintenance

The full research methodology (how the score is built, every revision's
fixes) lives in `fan_index/README.md` on the machine that does the primary
research (currently Ashwin's own machine, outside this repo). This file
covers only the three things that run, or need to be run, **from inside this
repo**: the automatic monthly refresh, the annual revenue-anchor update, and
the season rollover of league membership. It assumes the reader has read
`fan_index/README.md` REVISION 8/9 for the method itself.

## Files here

    build_fan_index.py         an earlier (pre-v0.3) snapshot of the research
                                builder, kept for reference; NOT what the
                                monthly job runs (see below) and not updated
                                by this maintenance flow.
    csv_to_json.py             turns 3 CSVs into public/data/fans/fan-attention.json.
                                Called by both a full manual rebuild and by
                                monthly_refresh.py (via scratch CSVs, see below).
    universe_state.json        THE PERSISTED ROSTER. One row per team: qid,
                                en_title, group/league/team, every language
                                edition's title (langs), in_flux, home_langs,
                                the last 12 months of all-language pageviews
                                (monthly), and every derived field
                                (wiki_baseline_12m, fan_index_raw, k_league,
                                global_score, ...). This is the file
                                monthly_refresh.py reads and rewrites. It is
                                the ONLY copy of this state inside the repo --
                                the original research pipeline's much larger
                                cache (resolve/, sitelinks/, lang/, en/ under
                                ~/fan_cache) lives on Ashwin's own machine and
                                is never pulled onto the mini.
    league_revenue_anchor.csv  the Stage-3 cross-sport revenue anchor, one row
                                per league/group, with source, confidence and
                                notes. Copied in from the research anchor CSV
                                on 2026-09-24 (v0.4.1); see "Annual anchor
                                refresh" below for how it gets replaced.
    monthly_refresh.py         the monthly job's whole pipeline. `--self-test`
                                validates universe_state.json + the anchor CSV
                                parse and every league has an anchor row, with
                                no network calls. `--month YYYYMM` overrides
                                the target month (default: the previous
                                completed month). `--dry-run` fetches and
                                recomputes but writes nothing.

## Monthly flow (automatic, mac-mini-jobs id "fans-monthly")

Runs the 3rd of each month, 07:00 UTC (`mac-mini-jobs/jobs.toml`,
`mac-mini-jobs/runners/fans-monthly.sh`). One pass:

1. Determine the previous completed calendar month.
2. For every team in `universe_state.json`, fetch that one month's Wikipedia
   pageviews for every language edition in its `langs` map, sum to one
   all-language total, append to the team's rolling `monthly` window (kept
   at the trailing 12 months), and recompute `wiki_baseline_12m`
   (median-month x12, same formula as the main build).
3. Best-effort Google Trends refresh for whichever groups currently carry a
   `trends_index` (i.e. are blended, not wiki-only). This is fail-open: a
   pytrends error or a missing `pytrends` install logs a note and leaves that
   group's `trends_index` at its last value -- it never blocks the run. As of
   v0.4.1 the Football group (all its leagues, including MLS and Liga MX) is
   permanently wiki-only and carries no `trends_index` to refresh; NHL and
   NBA are also currently wiki-only (v0.3.1, persistent Trends 429s). See
   `fan_index/README.md` REVISION 8-9 for which groups are actually blended
   today -- that list moves over time and this script does not hardcode it,
   it just refreshes whatever the state file says is blended.
4. Append the month to `public/data/fans/history/fan-attention-YYYY-MM.json`
   and update `history/index.json`. Checks the 8MB history budget on every
   run and logs a warning (never fails the job) if it's exceeded --
   pruning the oldest month(s) is a manual call, not automatic, because
   dropping history is a one-way decision.
5. Recomputes the blend-rescale (`fan_index_raw`, group totals invariant --
   see REVISION 9 stage 2b) and the cross-sport score (`global_score`, using
   `league_revenue_anchor.csv` -- REVISION 9 stage 3) for the WHOLE dataset,
   not just the refreshed teams, since both are relative-to-group/league
   computations.
6. Writes `universe_state.json`, regenerates the 3 working CSVs into a
   scratch folder inside `scripts/fans/`, and calls `csv_to_json.py` to
   rebuild `public/data/fans/fan-attention.json`.
7. Commits `scripts/fans/universe_state.json`, `public/data/fans/
   fan-attention.json` and `public/data/fans/history/**`.

**No `[vercel skip]` on this commit.** `lib/fanIndex.ts`'s `getFanIndex()`
reads `fan-attention.json` with `readFileSync` at **build** time (checked
2026-09-24), not `fetch` at request time, so a `[vercel skip]` commit here
would update the file in git while `/fans` kept serving whatever the last
real build baked in, forever. `runners/fans-monthly.sh` also skips
`revalidate_ping` for the same reason: `revalidateTag()` only busts the
Next.js fetch cache, which a `readFileSync` page never populates -- the build
itself is the only thing that changes what this page serves. If `lib/
fanIndex.ts` is ever changed to fetch the JSON instead of reading it off
disk, both of those need to flip back (drop `[vercel skip]`'s absence, add
a `revalidate_ping` call) -- check that file before assuming either still
holds.

**Known simplification, monthly cadence only:** the monthly fetch does not
re-derive `lang_count` / `top5_langs` / `wiki_spike_ratio` (those would need
the full per-language cumulative history, not just the new month), so those
three columns go stale between full rebuilds. They are cosmetic (not used in
any score computation) and get refreshed whenever the universe is next
rebuilt from scratch (a season rollover, or a manual full re-run of the
research pipeline).

Test by hand before trusting the schedule:

    cd ~/metro-mini-jobs   # or wherever this repo is cloned on the mini
    python3 scripts/fans/monthly_refresh.py --self-test
    DRY_RUN=1 bash mac-mini-jobs/runners/fans-monthly.sh

## Annual anchor refresh

`league_revenue_anchor.csv` (Stage 3, cross-sport `k_L = sqrt(revenue /
wiki_attention)`) is **not** refreshed by the monthly job -- revenue figures
move on an annual reporting cycle (Deloitte's Annual Review of Football
Finance, league-published annual results, etc.), not monthly, and most of
its rows are already dated or proxy estimates (see the `confidence` column).

When Ashwin provides a new anchor CSV (same schema: `competition, season,
revenue_local, currency, fx_used, revenue_usd_m, source_title, source_url,
confidence, notes`):

1. Copy it into the repo as `scripts/fans/league_revenue_anchor.csv`,
   overwriting the old one (git keeps the history, so the old figures and
   sources are never actually lost).
2. Every `competition` value must match a `league` value in
   `universe_state.json` exactly, OR be aliased in `monthly_refresh.py`'s
   `LEAGUE_ANCHOR_ALIAS` dict (currently just `{"Championship": "EFL
   Championship"}`, because the anchor CSV historically used the league's
   full name and the dataset uses the site's shorter display name). Add to
   that dict rather than renaming either side if a future anchor uses a
   different label again.
3. Run `python3 scripts/fans/monthly_refresh.py --self-test` -- its anchor-
   coverage check fails loudly if any league in `universe_state.json` has no
   matching anchor row. Fix any mismatch before the next scheduled run,
   not after: `monthly_refresh.py`'s `recompute_blend_and_cross_sport` raises
   `SystemExit` on a missing anchor rather than silently scoring that league
   at `k_L = 0`.
4. Optionally force a full recompute immediately (rather than waiting for
   day 3): `python3 scripts/fans/monthly_refresh.py --month <last completed
   month already in history>` re-fetches nothing new (that month's
   pageviews are already in `universe_state.json`'s rolling window) but
   still reruns the blend/cross-sport recompute and rewrites `fan-attention.
   json` with the new anchors -- useful when Ashwin wants the new revenue
   figures live on the site before the next scheduled slot. This does NOT
   retroactively rewrite `cross_sport_score` in already-written history
   files (see `history/index.json`'s `generated_note`): a history month's
   score reflects the anchors in effect when that file was written.

## Season rollover of the universe

The six leagues added in v0.4/v0.4.1 (Süper Lig, Brasileirão, Liga
Profesional, Primeira Liga, Eredivisie, Scottish Premiership) get their
membership from `public/data/football/live-standings-2026.json`'s
`leagues[].groups[].rows[]` (matched by `league_id`: 203 Süper Lig, 71
Brasileirão/Serie A Brazil, 128 Liga Profesional Argentina, 94 Primeira
Liga, 88 Eredivisie, 179 Scottish Premiership/"Premiership"). That file is
**not** read by `monthly_refresh.py` -- membership only needs to change once
a season (promotion/relegation), so this is a manual, occasional step, not
part of the automatic monthly job:

1. Pull the current `rows[]` for each of the six `league_id`s from
   `live-standings-2026.json` (or whatever that season's file is named --
   the "-2026" in the filename is the season the file covers, not a fixed
   name; check `public/data/football/index.json` or `leagues.json` for the
   live filename). Dedupe by `team_id` (Liga Profesional's file currently
   lists each club under BOTH an Apertura and a Clausura group -- same 30
   clubs twice, not 60 different ones) and drop any row with `name: null`
   (a data glitch seen in the Brasileirão block as of 2026-09, one bogus
   21st row with `rank: 20` -- filter on `name is not None`, not on rank).
2. The row's `name` field is the repo's canonical display name -- use it
   verbatim for the `team` column; do not substitute a Wikipedia-style name.
   `lookup` is a looser alias, useful only for matching against the
   previous roster or a Wikipedia search, never for display.
3. Diff the new roster against `universe_state.json`'s current rows for that
   league (by `team_id` if you keep it, otherwise by name, accented and
   suffix-normalized -- v0.4.1 hand-fixed about a dozen suffix mismatches
   this way, e.g. "Estudiantes (LP)" vs. the feed's "Estudiantes de La
   Plata"; expect a few every rollover, not a clean automatic match).
   Remove relegated clubs' rows entirely (not flag -- removed, per the
   v0.3.1 precedent for teams that stop qualifying). For newly promoted
   clubs: resolve the Wikipedia QID (watch for city/place-name collisions --
   the exact trap `fan_index/README.md` REVISION 9 section 1 documents,
   e.g. a bare "Porto" or "Racing" resolving to the wrong article), run the
   entity check (P31 must be an association-football-club QID, currently
   `Q476028` or `Q847017`), then fetch that team's `en_title`, every
   language edition's title (`langs`), and a first `wiki_baseline_12m`
   exactly as the original research pipeline does (`fan_index/build_fan_index.
   py`'s `resolve_one` / `sitelinks_one` / `lang_pageviews_one` /
   `compute_team_metrics`, run from Ashwin's own machine, not the mini --
   see "Files here" above for why that pipeline isn't in this repo).
4. Add the new rows to `universe_state.json`, remove the relegated ones, then
   run `python3 scripts/fans/monthly_refresh.py --self-test` to confirm the
   file still parses and every league still has an anchor row (a newly
   promoted club never changes which league needs an anchor, so this should
   already pass -- it is a cheap sanity check, not the real gate for a
   rollover).
5. This is also the moment to refresh the three cosmetic columns
   (`lang_count`, `top5_langs`, `wiki_spike_ratio`) that the monthly job
   leaves stale between rollovers -- recompute them for every row while
   already doing a from-scratch pass, not just the newly added ones.
6. Commit by hand (not via the monthly job) with a message describing the
   rollover, e.g. `data: fan attention index season rollover (promoted:
   ..., relegated: ...)`. No `[vercel skip]`, same reasoning as the monthly
   job.
