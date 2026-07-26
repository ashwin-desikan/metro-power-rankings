# scripts/apifootball — api-football → Supabase league standings

Daily league tables (and continental fixtures) from api-football (api-sports.io v3) into
Supabase, keyed to the canonical club names in the Champions League workbook `Lookup` sheet.

## Tables (Supabase project nmprqkmymrdknffwnuur)
- `football_lookup`   — **mirror of the workbook `Lookup` sheet** (single source of truth for
  club identity: cur_name, team, lookup_name, uefa_name, efs_name, api_name, country, city,
  metro_area, level, ...). One-way sync FROM the workbook via `sync_lookup.py`.
- `football_league`   — tracked-league registry (108). id-corrected: Faroe **367**, Iceland **164**,
  Switzerland **208** (Challenge), Ukraine **334** (Persha).
- `football_team`     — the crosswalk: api `team_id` → `canonical_name` + `lookup_name`/`uefa_name`/
  `efs_name` aliases. Every row resolves to a `football_lookup` club.
- `football_standings`— PK (league_id, season, group_label, team_id); multi-group aware. Idempotent.
- `football_fixtures` — the 5 continental comps (CL=2, EL=3, ECL=848, Libertadores=13, Super Cup=531).

Read club names via a join, e.g.:
    select s.rank, t.canonical_name, s.points
    from football_standings s join football_team t using (team_id)
    where s.league_id = 39 and s.season = 2026 order by s.rank;

## THE INVARIANT (hard rule)
Every team in every league/competition must map to a `Lookup` club — no exceptions, no stubs.
`refresh.py --write` resolves any api team not already in `football_team` against `football_lookup`
(exact `api_name`, then unambiguous name match across cur/team/lookup/uefa/efs), auto-inserts the
mapping, and for anything it cannot resolve it writes the rest, prints an UNMATCHED alert, and
exits 3. To clear an alert: add the club to `Lookup`, run `sync_lookup.py`, and it resolves next run.

## sync_lookup.py  (runs on the Windows host — has the OneDrive workbook)
    python sync_lookup.py          # mirror Lookup sheet -> football_lookup (full replace)
Env: `CL_WORKBOOK` (defaults to the OneDrive master), Supabase write key. Run whenever `Lookup`
changes, or on a Windows schedule shortly before the mini's 05:00 UTC standings pull.

## refresh.py  (runs on the Mac mini — has network)
    python refresh.py --self-test  # offline parser + resolver tests
    python refresh.py              # DRY RUN (fetch + report, no writes)
    python refresh.py --write      # upsert standings/fixtures, resolve new teams, alert unmatched
Env: `APISPORTS_KEY`, Supabase write key. League list = `leagues.json`. Serie D (76) standings skipped.

## Daily job (mini-owned)
`mac-mini-jobs/run-football-standings.sh` + `launchd/com.citizenofnowhere.football-standings.plist`,
05:00 UTC. Self-test gate → `refresh.py --write`. Data lives in Supabase, so NO git commit / NO
Vercel build. An exit-3 UNMATCHED alert surfaces via the mini's ntfy failure notification.

## Split of responsibility
- Windows host: `sync_lookup.py` (workbook Lookup → football_lookup). Master = the workbook.
- Mac mini: `refresh.py` (api → football_standings/fixtures; resolves teams against football_lookup).

## Open / later
- Gap leagues (10) not on api-football 2026-27: `is_gap` placeholders; auto-fill when api publishes.
- UEFA CL/EL/ECL/Super Cup group tables appear once qualifying ends (autumn); fixtures cover them now.
- UEFA club/country coefficients (kassiesa.net) — deferred (robots.txt disallows automated pull).
- Optionally backfill the Lookup `API Name` column (from the built crosswalk) so future matches are
  all exact via api_name rather than name matching.
