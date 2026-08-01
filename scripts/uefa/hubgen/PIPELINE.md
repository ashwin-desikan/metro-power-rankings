# Completed-season football hub generation — pipeline map

`public/data/football/hub-YYYY-YY.json` (2013-14 … 2025-26) is NOT produced by a single
generator. It is `build_season_hub.py` (the committed base builder) followed by a stack of
post-processing **overlay** scripts that ran in a cloud session and were, until now, never
committed. This directory recovers the surviving overlays verbatim (as-run) so the shape is
reproducible. **Paths inside them are the original cloud-sandbox paths (`/tmp/...`,
`/mnt/user-data/uploads/...`) — adapt to the device before running.**

## Which stage owns which field

| Field in hub JSON | Produced by | Source of truth |
|---|---|---|
| `leagues[].{league_id,name,country,level,confed}`, `groups[].rows[].{rank,name,lookup,played,win,draw,lose,gf,ga,gd,points}`, `cups`, base `continental` (old score shape) | `build_season_hub.py` (committed) | api-football `uefahub{year}.json` bundles |
| workbook standings swapped in for wrong-tier / lower-division / split leagues; rows renamed to canonical `cur_name`; England L6/L7 removed; Mexico/US/Brazil/Argentina/Uruguay L1 + all L2+ rebuilt | `rebuild_tables.py` | Supabase `cl_league_history` (dumped to `cl_rows.json`) |
| `groups[].rows[].champ = true` on each first-division title winner | `champ_final.py` | `cl_league_history` where `champions='Y'` & `first_division='Y'` |
| `continental` replaced with round-by-round `{comp,scope,section,end_year,entries:[{name,rnd,trophy?}]}` | `build_continental_rbr.py` | CL workbook **"Eur RndbyRnd"** sheet |
| `leagues[].end_year` | **injector NOT recovered** (lost with the sandbox) — see below | deterministic rule |

## Run order
1. `build_season_hub.py`  (base hub per season, from api bundles)
2. `rebuild_tables.py`     (workbook table swaps + canonical row naming)
3. `champ_final.py`        (champion stars)
4. `build_continental_rbr.py` (continental round-by-round)
5. league `end_year` overlay (reconstruct — see below)

## The lost `end_year` overlay — reconstruct it
Every league carries `end_year`. The rule is fully encoded in the committed set
`FIRST_YEAR_ENDERS` in `app/teams/football/2026-27/page.tsx`: for a season slug `YYYY-YY`,
`end_year = <second year>` (e.g. 2014 for `2013-14`) EXCEPT for countries in that set, whose
spring–summer / calendar-year leagues end in the FIRST year. Reuse that exact set. (For the
2026-27 live hub the same logic runs at render time in `page.tsx`; for the static completed
hubs it was baked into the JSON.)

## Inputs to regenerate the overlays
- `cl_rows.json` — dump of Supabase `public.cl_league_history` (season, country, level, league,
  grp, division, place, w/d/l/gs/ga/g_diff/points, cur_name, team, champions, first_division).
- `football_team.json`, `football_lookup.json` — the canonical crosswalks (dump from Supabase /
  the Lookup sheet; `scripts/apifootball/_scratch/` already holds current copies).
- CL workbook `Eur RndbyRnd` sheet (continental) — **complete back to 1955**, so no data gap
  going earlier.

## Building 2010-11 … 2012-13 (the reason this map exists)
- **Continental round-by-round: ready.** Extend `SEASONS` in `build_continental_rbr.py` to
  include `2010-11,2011-12,2012-13`; the `Eur RndbyRnd` sheet already has them.
- **Standings base: the gap.** `build_season_hub.py` reads `uefahub{2010,2011,2012}.json`, which
  do NOT exist in `_scratch` (only 2013+). Since match data is moving all-kassiesa, the cleanest
  route is to build those three seasons' league tables from `cl_league_history` (the same
  workbook source `rebuild_tables.py` already uses) rather than re-fetching api-football.
- `champ_final.py` and the `end_year` rule work unchanged for 2010-13.
