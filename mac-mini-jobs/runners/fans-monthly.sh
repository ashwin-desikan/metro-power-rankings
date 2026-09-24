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
# month to data/fans/history/, rolls the 12-month window, recomputes
# the blend-rescale and cross-sport score (scripts/fans/
# league_revenue_anchor.csv), regenerates data/fans/fan-attention.json
# (which also writes data/fans/preview.json) via csv_to_json.py, and then
# calls scripts/fans/push_to_supabase.py to upsert the full dataset into
# Supabase (public.fan_attention_teams / fan_attention_history). SECOND
# REVISION, same day (2026-09-24): the repo is public, so the full JSON can
# no longer be committed even server-only; it is now gitignored and
# Supabase is the system of record. app/api/fans/route.ts (the gated full
# table) reads Supabase at REQUEST time with the signed-in caller's own
# token, not at build time, so it updates the moment the push above
# succeeds -- no Vercel build needed for the gated data. See scripts/fans/
# README.md.
#
# "[vercel skip]" is still NOT used, because data/fans/preview.json (the
# small public top-20 file) IS committed below and IS read with readFileSync
# at build/request time, same as before: a commit that only bumped Supabase
# and not preview.json would still need a real build for the public page's
# top 20 to move. revalidate_ping is still skipped for the same reason it
# always was: revalidateTag() only busts the Next.js fetch cache, which a
# readFileSync page never populates.
#
# Needs SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) in config.env
# for the push step above; that step fails open (logs and continues) if it
# is missing, same as every other Supabase loader in this repo. Beyond that,
# nothing from config.env but REPO_DIR: no API key (Wikimedia
# pageviews and Trends are both unauthenticated).
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

# Belt and suspenders: monthly_refresh.py already calls push_to_supabase.py
# itself right after regenerating the JSON (so a bare run of that script
# still updates Supabase), but this runner calls it again as its own guarded
# step so a push failure shows up as its own line in the job log rather than
# being buried inside the "monthly pageviews + trends + history + rebuild"
# step above. Idempotent (upsert on the version/month primary key), so
# running it twice in one refresh is harmless.
guarded "push to Supabase" "$PY" scripts/fans/push_to_supabase.py

# 2026-09-24: data/fans/fan-attention.json and data/fans/history/ are
# gitignored now (the repo is public; see scripts/fans/README.md and
# supabase/migrations/20260924171144_fan_attention.sql) -- Supabase is the
# system of record for them, pushed above, not a git commit. Only
# data/fans/preview.json (the public top-20 file) and universe_state.json
# (this pipeline's own roster cache) are still committed.
# NOT "Auto:" prefixed, deliberately. .githooks/pre-commit generates
# commits-recent.txt with --invert-grep --grep='^Auto:', so an Auto: subject
# never reaches the file the Notion reconciler treats as ground truth. For the
# refresh bots that is right: they are noise. This one is the single commit a
# month that triggers a real production build, which is the opposite of noise,
# and hiding it is how "did /fans deploy this month?" becomes unanswerable from
# the reconciler's only input. Same class as the merge commits that --no-merges
# hid until 2026-09-24 (HANDOFF section AR).
commit_paths "fans: Fan Attention Index monthly refresh" \
  scripts/fans/universe_state.json \
  data/fans/preview.json

note "done"
