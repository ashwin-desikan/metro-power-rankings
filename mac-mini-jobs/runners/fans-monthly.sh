#!/usr/bin/env bash
# Monthly refresh for the Fan Attention Index (/fans). See jobs.toml id
# "fans-monthly" and scripts/fans/README.md for the full flow. Same runner
# idiom as economy-housing.sh: self-test gate, guarded steps, commit_paths --
# but NO "[vercel skip]" and NO revalidate_ping (see below, both deliberate).
#
# scripts/fans/monthly_refresh.py is the whole pipeline in one entry point:
# fetches the previous completed month's all-language Wikipedia pageviews
# for every team (scripts/fans/universe_state.json is the persisted roster --
# the original research pipeline's cache lives outside the repo on Ashwin's
# own machine and is not reachable from the mini), best-effort refreshes
# Google Trends for the currently-blended groups (fails open: keeps last
# month's value on any pytrends error, never blocks the run), appends the
# month to public/data/fans/history/, rolls the 12-month window, recomputes
# the blend-rescale and cross-sport score (scripts/fans/
# league_revenue_anchor.csv), and regenerates public/data/fans/
# fan-attention.json via csv_to_json.py.
#
# NO "[vercel skip]": lib/fanIndex.ts reads fan-attention.json with
# readFileSync at BUILD time (checked 2026-09-24), not at request time, so
# unlike every other job in this folder a commit here MUST trigger a real
# Vercel build or /fans silently keeps serving last month's data forever.
# revalidate_ping is correspondingly skipped: revalidateTag() only busts the
# Next.js fetch cache, which a readFileSync page never populates -- the
# build itself is the only thing that changes what this page serves.
#
# Needs nothing from config.env beyond REPO_DIR: no API key (Wikimedia
# pageviews and Trends are both unauthenticated), no Supabase.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

guarded "self-test monthly_refresh" "$PY" scripts/fans/monthly_refresh.py --self-test

# ONE 4.7 GB download, not 26,602 requests. Switched 2026-09-24 (HANDOFF AV/AW)
# after the per-article path failed its own validation gate. Measured on the mini
# that day: 5.02 GB and 439M lines streamed in 16.0 minutes, 26,037 of 26,602
# keys matched, and 24 of 24 checkable values identical to the REST endpoint it
# replaced. The default STEP_TIMEOUT (600s) would still kill it, so it is raised
# for this step alone, the same way metro-rankings.sh raises it for its own long
# step. 3600s is a 3.7x margin on the measured time, which leaves room for a slow
# transfer day without leaving room for a silent hang.
#
# 🔴 THE TRENDS HALF IS INERT ON THIS MACHINE. pytrends is not in the venv, so
# fetch_trends_for_group() takes its ImportError path, logs "pytrends not
# installed, skipping (keeping last value)" once per blended group and returns
# {}. That is fail-open by design and the Wikipedia half is unaffected, but it
# means /fans keeps whatever trends_index the Windows session last produced. Read
# the log, not the exit code, to know whether Trends actually refreshed.
# 🔴 DRY_RUN=1 ALONE IS NOT A DRY RUN OF THIS SCRIPT, so the flag is passed
# through. _common.sh's DRY_RUN gates commit_paths and revalidate_ping and
# nothing else, so without this the "DRY_RUN validation" that jobs.toml tells the
# next person to perform runs the entire real pipeline and WRITES
# universe_state.json, the history month, the scratch CSVs and fan-attention.json.
# Measured 2026-09-24: that is exactly what the first validation run did, and it
# left the shared clone dirty, which stops every job that fast-forwards and cost
# about fourteen hours that morning (HANDOFF section AI).
_fans_dry=""
[ "$DRY_RUN" = "1" ] && _fans_dry="--dry-run"
STEP_TIMEOUT=3600 guarded "monthly pageviews + trends + history + rebuild" \
  "$PY" scripts/fans/monthly_refresh.py $_fans_dry

commit_paths "Auto: fan attention index monthly refresh" \
  scripts/fans/universe_state.json \
  public/data/fans/fan-attention.json \
  public/data/fans/history

note "done"
