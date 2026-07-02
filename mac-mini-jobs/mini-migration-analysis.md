# Scheduled tasks: what should move to the Mac mini

## Summary

| Task | Cadence | Verdict | Gating factor |
|---|---|---|---|
| `f1-weekly-refresh` | per race | **Move** | Needs the "F1 Data" project on the mini; self-rearm becomes a cron |
| `update-tennis-golf-majors` | monthly | **Opt-in** | `Majors.xlsx` is gitignored (mini would need it); champion verification is judgment |
| `cricket-portal-monthly-refresh` | monthly | Stay | You paste rows into the OneDrive workbook and approve a paid build |
| `rugby-results-staging-window` | quarterly | Stay | You paste into `OtherLeagues.xlsx`; editorial scope calls each window |
| `weekly-boundary-refresh` | weekly | Stay | Rebuild needs the Overture parquet at `C:\...\MapData`, far faster on Windows |
| `preseason-audit-*` (NFL, CFB/CBB, MLB, NBA/NHL) | annual | Stay | Read-only advisory reports you act on; annual, negligible offload |
| `wc2026-greatest-games` | one-time (Jul 22) | N/A | One-time reminder |
| `wc2026-sim-daily-refresh` | disabled | N/A | The `wc2026-daily.yml` GitHub Action already owns this |

## The test that decides it

The mini's comparative advantage is unattended jobs that (a) hit the network from a stable residential IP and (b) write only to git-tracked `public/data` or a self-contained dataset, never to your hand-curated OneDrive workbooks. Apply that test and the fleet splits cleanly.

The fetch/rebuild/monitor jobs are the mini's domain, and most are already there: the civic/leaders/billionaires egress refresh, the feed-shape monitor, and the newsletter/podcast. `f1-weekly-refresh` is the one remaining job that fits the same mold, so it should join them.

Everything else stays for a real reason, not inertia. Cricket, rugby, and majors are curation workflows: the automatable half (a stager or a web lookup) feeds a step where you paste into a workbook, exercise editorial judgment, and approve a paid Vercel build. That human gate is the point, not an accident, so moving the jobs headless would either strand the output on the mini or risk an unreviewed write to a source-of-truth workbook. Boundary refresh stays because its heavy input (Overture parquet) lives on Windows and rebuilds faster there; the task is already just a freshness report that defers the rebuild to you. The preseason audits stay because the deliverable is an advisory markdown report you read and act on, they are read-only, and each fires once a year.

Net: the mini is close to saturated on the work it is actually better at. `f1-weekly` is the clear win; `majors` is a defensible opt-in; the rest are correctly placed.

---

## Instructions for the mini: adopt `f1-weekly-refresh`

**What it is.** Refreshes the "F1 Comprehensive" historical dataset in the separate **F1 Data** project (`f1_update.py`, `f1_build.py`, `data/`) after each race. This is distinct from the site's live F1 hub data (`public/data/f1/data.json`), which the `f1-refresh.yml` GitHub Action already refreshes on its own. Different targets, so there is no double-ownership; leave the Action alone.

**Prerequisite (confirmed location).** The F1 Data project lives at `C:\Users\ashwi\Desktop\Projects\F1 Data` on the Windows box, a sibling of Metro Area Project. It is a plain 6.2 MB folder, not a git repo and not OneDrive-synced, so the mini cannot clone it: copy the whole folder over once (rsync / scp / USB / cloud drop). It is self-contained (`F1_Comprehensive.xlsx`, `data/` CSVs, `f1_update.py`, `f1_build.py`) and needs `pandas` and `openpyxl` in the venv (`pip install pandas openpyxl`). After the copy, the mini's F1 Data is the single source of truth: retire the Windows Cowork task so the two workbook copies never diverge (same one-runner rule as the egress refresh).

**Why it is worth moving.** Not for Actions minutes (it is a Cowork task, not an Action) but to stop depending on the Windows box being awake on race weekends. On the mini you also have real outbound internet, so you can drop the sandbox web_fetch / provenance dance and fetch the five Jolpica endpoints directly.

**Steps (per run):**

1. Fetch these five exact URLs into `data/_incoming/` (character-for-character, no added params):
   - `https://api.jolpi.ca/ergast/f1/current/last/results.json` -> `last_results.json`
   - `https://api.jolpi.ca/ergast/f1/current/last/qualifying.json` -> `last_qualifying.json`
   - `https://api.jolpi.ca/ergast/f1/current/last/sprint.json` -> `last_sprint.json` (empty on non-sprint weekends; save it anyway)
   - `https://api.jolpi.ca/ergast/f1/current/driverStandings.json` -> `driverstandings.json`
   - `https://api.jolpi.ca/ergast/f1/current/constructorStandings.json` -> `constructorstandings.json`
   Validate each: `python3 -c "import json;json.load(open('FILE'))"`.
2. Merge + build: `python3 f1_update.py && python3 f1_build.py`. The merge is idempotent, so a week with no new race is a harmless no-op.
3. Clean up: `rm -f data/_incoming/*.json`.
4. If `f1_update.py` reports the fetched round is more than one ahead of what was stored, do not backfill headless; ntfy an alert that a manual full-season catch-up is needed.

**Scheduling.** Replace the Cowork self-rearm (which used `update_scheduled_task`) with a plain cron. Because the merge is idempotent, over-running is free, so a fixed cadence beats computing the next race date. Mirror the Action's pattern: a Sunday-evening run plus a Monday run for late classification. Example launchd `StartCalendarInterval`: Sunday 21:30 and Monday 14:00 local. A single daily run also works.

**Rare full rebuild.** Because the mini also has the metro repo clone, the occasional full historical rebuild (`scripts/build-f1-data.py`, which reads the F1 Data CSVs) can run on the mini too; keep F1 Data and Metro Area Project as siblings there, as they are on Windows.

**Alerts.** ntfy on any fetch failure, a build error, or the round-jump case in step 4. Silent on clean no-op weeks.

**Reporting.** Append a one-line status to a local log: round number ingested, net-new rows or no-op, and the current drivers'/constructors' leaders.

---

## Opt-in: `update-tennis-golf-majors`

Movable, but I would keep it on Windows for now. Two reasons. First, `Majors.xlsx` is gitignored, so the mini would need its own synced copy and a way to return the refreshed workbook. Second, and more important, the job's core is a live champion verification with real judgment (walkovers, conflicting sources, neutral-flag players); a silent headless error there injects a wrong champion into a gold-standard dataset, and the task only runs monthly, so the manual touch is cheap insurance.

If you still want it on the mini: sync `Majors.xlsx` there, then run `update_majors.py --list-missing` -> verify each champion via web -> `--add "..."` -> `--verify-counters` (must PASS) -> `build-majors-data.py`, then push `public/data/majors` with `[vercel skip]` (ISR picks it up). Send yourself a monthly ntfy summary of every auto-add so a bad one is caught fast.
