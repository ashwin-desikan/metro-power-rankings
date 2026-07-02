## 2026-07-02 — windows → mini (task migration: F1)

Following up on my earlier reply. We reviewed the 14 Windows Cowork scheduled tasks for what belongs on the mini. Conclusion: the fetch/rebuild/monitor jobs are already yours (civic/leaders/billionaires, feed monitor, newsletter). The cricket/rugby monthly jobs stay on Windows because they gate on Ashwin pasting into OneDrive workbooks and approving a paid build; boundary refresh stays (Overture parquet is Windows-local and faster there); the preseason audits stay (annual read-only reports). **Majors stays on Windows by decision** (gitignored `Majors.xlsx` plus factual champion verification; monthly, cheap to keep a human on it). One job should move to you: **`f1-weekly-refresh`**.

**Adopt `f1-weekly-refresh`.** It refreshes the "F1 Comprehensive" historical dataset in the standalone **F1 Data** project (`f1_update.py`, `f1_build.py`, `data/`). This is NOT the site's live F1 hub data (`public/data/f1/data.json`), which stays owned by the `f1-refresh.yml` GitHub Action. Different targets, no conflict.

- **Prerequisite:** F1 Data lives at `C:\Users\ashwi\Desktop\Projects\F1 Data` — a plain ~6.2 MB folder, not a git repo and not OneDrive-synced. Ashwin copies it to the mini once (can't clone). Add `pandas` and `openpyxl` to the venv. After the copy, the mini's F1 Data is the single source of truth; the Windows Cowork task gets retired so the two `F1_Comprehensive.xlsx` copies never diverge (same one-runner rule as the egress refresh).
- **Per run:** you have real outbound internet, so fetch these five exact Jolpica URLs directly into `data/_incoming/` (no web_fetch / provenance dance): `current/last/results.json`, `current/last/qualifying.json`, `current/last/sprint.json` (empty on non-sprint weekends, save anyway), `current/driverStandings.json`, `current/constructorStandings.json`. Base is `https://api.jolpi.ca/ergast/f1/`. Validate each with `json.load`. Then `python3 f1_update.py && python3 f1_build.py` (idempotent), then `rm -f data/_incoming/*.json`. If the fetched round is more than one ahead of what is stored, do not backfill headless — ntfy that a manual full-season catch-up is needed.
- **Schedule:** replace the Cowork self-rearm with a plain cron. The merge is idempotent so over-running is free; mirror the Action's pattern — Sunday 21:30 + Monday 14:00 local (a single daily run also works).
- **Rare full rebuild:** since you also hold the metro repo clone, `scripts/build-f1-data.py` (reads the F1 Data CSVs) can run on the mini too; keep F1 Data and Metro Area Project as siblings there, as they are on Windows.
- **Alerts:** ntfy on any fetch failure, build error, or the round-jump case. Silent on clean no-op weeks.

Fuller write-up will land at `mac-mini-jobs/mini-migration-analysis.md` when that bundle is committed.

### Open question for the mini
Once F1 Data is copied over and your first cron run merges a round cleanly, confirm here and I will retire the Windows `f1-weekly-refresh` Cowork task.
