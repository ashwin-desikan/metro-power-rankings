# REFRESH-RUNBOOK.md

Full data-refresh runbook for the OneDrive Excel-fed pipelines. Run everything
from the canonical repo on the Windows host
(`C:\Users\ashwi\Desktop\Projects\Metro Area Project`): the Excel sync and the
Overture parquet both live locally and cannot be driven from a sandbox. Close
Excel before running, or the workbook-staging step aborts by design.

Companion to `.claude/skills/workbook-sync/SKILL.md` (the orchestrator contract)
and `mac-mini-jobs/REBUILD-RUNBOOK.md` (the mini's scraped-data refreshes).

## What refreshes from where

| Layer | Command | Source workbook(s) | Auto-synced? |
|---|---|---|---|
| Metro core + big-4 + football + boundaries | `run-workbook-sync.py` | MetroAreas.xlsx, NFL/NBA/NHL/MLB, Champions League-201516 | Yes (sync + stage built in) |
| New-metro polygons | `refresh-boundaries.ps1 -Force` | MetroAreas.xlsx (via metros.json) | Needs extract to have run first |
| Metro-join datasets | states / similar / relocations / rivalries | MetroAreas.xlsx + Rivalries.xlsx | No, run after extract |
| Champions | `build-champions-data.py` + `-history.py` | Champions_History.xlsx (OneDrive-direct) | No |
| College | cfb / cbb / wcbb / college-hockey | CFB.xlsx, CBB.xlsx | No |
| OtherLeagues family | valuations / nfl-europe / afl-nrl / cfl / domestic-football / domestic-cups | OtherLeagues.xlsx (repo root) | No |
| Olympics | `scripts/olympics/build_olympics_*.py` | Olympics workbook | No |
| Supabase-sourced (not Excel-live) | majors, F1, CWS, IPL, mktcap | migrated | N/A |

## 1. The spine (does the bulk in one command)

```powershell
cd 'C:\Users\ashwi\Desktop\Projects\Metro Area Project'
python scripts\run-workbook-sync.py
```

Syncs MetroAreas.xlsx from OneDrive, stages the four league workbooks plus the
Champions League file out of OneDrive, then rebuilds metros/regions/details,
NFL, NBA, MLB, NHL, international, football, women's football, WNBA, the sports
index, and boundaries (7-day cache), finishing with the client-import and tsc
gates.

For the batch of new metros, force a complete polygon rebuild after the sync so
nothing drifts (requires the Overture parquet at
`C:\Users\ashwi\Desktop\Projects\MapData\`, Windows-host only):

```powershell
.\scripts\refresh-boundaries.ps1 -Force
```

## 2. Excel-fed builders the orchestrator does NOT run

Make sure each master is saved and synced (OneDrive-direct readers) or copied to
the repo root (OtherLeagues, CBB) before its builder runs. The metro-join four
depend on `metros.json`, so run them after the spine above.

```powershell
# metro-join (need metros.json from the spine first)
python scripts\build-states-directory.py
python scripts\build-state-metro-scores.py
python scripts\build-similar-metros.py
python scripts\build-relocations.py
python scripts\build-rivalries.py

# champions (reads Champions_History.xlsx directly from OneDrive)
python scripts\build-champions-data.py
python scripts\build-champions-history.py

# college
python scripts\build-cfb-data.py
python scripts\build-cbb-data.py
python scripts\build-wcbb-data.py
python scripts\build-college-hockey-data.py

# OtherLeagues.xlsx family
python scripts\build-valuations-data.py
python scripts\build-domestic-football.py
python scripts\build-domestic-cups-data.py
python scripts\build-afl-nrl-data.py
python scripts\build-cfl-data.py
python scripts\build-nfl-europe-data.py
python scripts\build-nfl-international-data.py

# olympics
python scripts\olympics\build_olympics_data.py
python scripts\olympics\build_olympics_editions.py
python scripts\olympics\build_olympics_breakdown.py
python scripts\olympics\build_womens_team_medals.py
```

## 3. Two things worth knowing

**Supabase-sourced datasets are no longer Excel-live.** Majors, F1, CWS, IPL,
and market cap read from Supabase, so editing their old sheets will not move the
site until you run the Excel-to-Supabase loader for each (mktcap is mid-cutover
per the shadow-Saturday plan). That is a different path than the builders above.

**Only MetroAreas + the four leagues + Champions League are auto-synced** by the
orchestrator. The other masters (Champions_History.xlsx, CFB.xlsx,
OtherLeagues.xlsx, Rivalries.xlsx, the Olympics workbook) are not swept by any
single sync step, so confirm each is current in OneDrive or copied to the repo
root before its builder runs.

## 4. Close-out

```powershell
npm run verify
git status --short public/data
```

Commit data with `[vercel skip]` so no Vercel build fires. The one exception:
any change under `public/data/leaders/**` needs a real build. Commit on your own
schedule, per standing rule.
