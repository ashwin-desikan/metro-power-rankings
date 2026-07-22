#!/usr/bin/env bash
# metro-mini-refresh.sh
#
# Local (Mac mini) mirror of .github/workflows/civic-data-refresh.yml. Runs the
# egress-sensitive data refreshes from the mini's stable residential IP, commits
# changed files under public/data with a [vercel skip] marker, and pushes to
# origin/main. The site reads these via ISR from GitHub raw, so NO Vercel build
# fires (see feedback: "No Vercel deploys for data"). Every underlying refresh
# script aborts WITHOUT writing on any upstream failure, so a bad response can
# never overwrite good committed data; a quiet week produces no diff and no commit.
#
# WHY RUN THIS ON THE MINI INSTEAD OF ACTIONS
#   - Offloads GitHub Actions minutes.
#   - Wikidata SPARQL is more reliable from a stable residential IP than from a
#     shared GitHub runner IP (which gets rate-limited / 429'd).
#   - Gives a place to run refreshes that today only run interactively in Cowork.
#
#   IMPORTANT: if you enable this, DISABLE the overlapping GitHub Actions
#   schedule (civic-data-refresh.yml / leaders-refresh.yml / billionaires-refresh.yml)
#   or you will get duplicate commits racing each other. Keep ONE runner.
#
# Config is read from config.env in this script's directory.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$DIR/config.env" ] && set -a && . "$DIR/config.env" && set +a

REPO_DIR="${REPO_DIR:?set REPO_DIR in config.env (path to the git clone on the mini)}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PY="${PYTHON_BIN:-python3}"
DRY_RUN="${DRY_RUN:-0}"
STEP_TIMEOUT="${STEP_TIMEOUT:-300}"   # seconds; caps any single refresh step (e.g. a Wikidata outage)
MAYORS_STEP_TIMEOUT="${MAYORS_STEP_TIMEOUT:-1800}"  # mayors gets more room: cold-start QID
                                                    # discovery (scripts/civic/city-qids.json) is
                                                    # chunked and label-based, so it's slower than
                                                    # the steady-state single-query hot path once
                                                    # the cache is warm. Persists progress per chunk,
                                                    # so a timeout here never loses prior work.
                                                    # Sized from the actual worst case, not a guess:
                                                    # discovery retries=2/timeout=45 -> ~93s/chunk x 9
                                                    # chunks =~ 14 min if EVERY chunk fails outright,
                                                    # plus the hot-path query's own worst case (default
                                                    # retries=4/timeout=120 =~ 8.5 min) if some slugs
                                                    # are already cached -> ~22.5 min combined. 900s
                                                    # (the original value) was undersized for this and
                                                    # got the step killed mid-run under the 2026-07
                                                    # WDQS outage, registering as a false "step timed
                                                    # out" alert on an otherwise-safe no-op week.

note() { echo "[$(date '+%F %T')] $*"; }
alert() { "$PY" "$DIR/notify.py" "CoN mini refresh" "$1" 1 || true; }
fail() { note "FAIL: $1"; alert "$1"; exit 1; }

cd "$REPO_DIR" || fail "REPO_DIR not found: $REPO_DIR"

# Fast-forward to origin so we commit on top of the latest history.
git fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet || fail "git fetch failed"
if ! git merge --ff-only "$GIT_REMOTE/$GIT_BRANCH" --quiet; then
  fail "cannot fast-forward; local branch has diverged from $GIT_REMOTE/$GIT_BRANCH (resolve by hand)"
fi

# --- self-tests (same gate the Action uses; abort before any network work) ---
note "running self-tests"
"$PY" scripts/civic/civic_common.py --self-test    || fail "civic_common self-test failed"
"$PY" scripts/civic/refresh_governors.py --self-test || fail "governors self-test failed"
"$PY" scripts/civic/refresh_congress.py --self-test  || fail "congress self-test failed"
"$PY" scripts/civic/refresh_mayors.py --self-test    || fail "mayors self-test failed"
"$PY" scripts/civic/refresh_cabinet.py --self-test   || fail "cabinet self-test failed"
"$PY" scripts/civic/refresh_house_leadership.py --self-test || fail "house leadership self-test failed"
"$PY" scripts/leaders/refresh-current-leaders.py --self-test || fail "leaders self-test failed"

# --- refreshes -------------------------------------------------------------
# Each step is best-effort: a single upstream hiccup should not abort the whole
# run, because each script leaves good data untouched on its own failure. We
# collect the names of any that error and alert once at the end.
STEP_FAILS=""
run_step() {  # run_step "label" cmd...
  local label="$1"; shift
  local step_timeout="$STEP_TIMEOUT"
  [ "$label" = "mayors" ] && step_timeout="$MAYORS_STEP_TIMEOUT"
  note "step: $label (timeout ${step_timeout}s)"
  # Run the step in the background; a watchdog kills it if it exceeds step_timeout.
  # macOS ships no `timeout` binary, so this is a portable pure-bash equivalent.
  "$@" &
  local pid=$!
  ( sleep "$step_timeout"
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null; sleep 3; kill -KILL "$pid" 2>/dev/null
    fi ) &
  local watcher=$!
  if wait "$pid" 2>/dev/null; then
    kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null
  else
    local rc=$?
    kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null
    if [ "$rc" -ge 124 ] || [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then
      note "  step TIMED OUT after ${step_timeout}s: $label"
    else
      note "  step FAILED (rc=$rc): $label"
    fi
    STEP_FAILS="${STEP_FAILS}\n- ${label}"
  fi
}

# 2026-07-20: --add-only dropped. The script now auto-applies a genuine change
# of head of state/government to _current.json AND the per-country history, and
# logs it to public/data/leaders/_changes.json (feeds /leaders/changes). Guarded
# by _plausible() plus a single-unambiguous-office check, so a noisy Wikidata
# edit is skipped rather than published.
run_step "leaders (auto-apply)" "$PY" scripts/leaders/refresh-current-leaders.py
run_step "governors (add-only)" "$PY" scripts/civic/refresh_governors.py --add-only
run_step "congress"             "$PY" scripts/civic/refresh_congress.py
run_step "mayors"               "$PY" scripts/civic/refresh_mayors.py
# 2026-07-21: Executive/Cabinet and House leadership were never automated
# before this (refresh_congress.py explicitly passed them through untouched).
# Both live-validated clean across multiple real Wikidata rounds (see git
# history / HANDOFF.md) -- --write enabled. Each still degrades safely: an
# individual position that can't be unambiguously resolved (e.g. House
# Majority/Minority Whip, a genuine Wikidata data gap -- see
# refresh_house_leadership.py's docstring) is just left untouched, not
# guessed at or blanked.
run_step "cabinet"              "$PY" scripts/civic/refresh_cabinet.py --write
run_step "house leadership"     "$PY" scripts/civic/refresh_house_leadership.py --write
run_step "billionaires fetch"   "$PY" scripts/billionaires/fetch-billionaires.py
run_step "billionaires build"   "$PY" scripts/billionaires/build-billionaires.py
run_step "valuations"           "$PY" scripts/build-valuations-data.py
run_step "power ranking"        "$PY" scripts/build-power-ranking.py
# Zone Zero Cup: weekly regeneration (added 2026-07-20; the Cup had not been
# rebuilt since 21 Jun). Preflight-guarded, so it refuses to write a hollowed-out
# Cup if a pillar input has collapsed. The page ISR-reads it from GitHub raw, so
# this needs no Vercel build.
run_step "zone zero cup"        "$PY" scripts/zzc_v1_multipillar.py
# Election forecast (added 2026-07-22; owned by the mini per HANDOFF, GH Action
# cron in forecast-weekly.yml left disabled to avoid a double-run). fetch scrapes
# ~10 Wikipedia polling pages + the GE2024 base, stdlib-only, ~1-2 min; build is
# deterministic/seeded and writes public/data/forecast.json plus a dated snapshot
# into data/forecast/history.json. Fail-soft per country (NZ/IL/BR/FR drop from
# the JSON on a broken scrape); US/UK hard-fail so a bad week keeps last week's
# JSON rather than shipping a half-empty one. Both /elections and
# /elections/forecast ISR-read the JSON from GitHub raw, so this rides
# [vercel skip] with no deploy.
run_step "election forecast fetch" "$PY" scripts/forecast/fetch_data.py
run_step "election forecast build" "$PY" scripts/forecast/build_forecast.py
# citypopulation.de watcher (added 2026-07-22): flags NEW in-coverage entries on
# citypopulation.de's /en/help/new/ feed vs the committed snapshot and pushes via
# notify.py (same channel as alert()). stdlib-only, snapshot is
# public/data/citypopulation-feed.json (already under DATA_PATHS, so the commit
# below sweeps it up). Silent unless there's a genuinely new update; a fetch or
# empty-parse leaves the snapshot untouched and just marks the step failed.
run_step "citypopulation watch" "$PY" scripts/citypopulation/watch_feed.py

# --- commit + push ---------------------------------------------------------
# scripts/civic/city-qids.json is included alongside public/data: it's the
# mayors QID cache (see refresh_mayors.py), stable but not static (self-heals
# as new metros enter the top 100 or a chunk resolves late), and committing it
# keeps the mini and the civic-data-refresh.yml Action fallback warm-started
# instead of every run cold-starting QID discovery from an empty cache.
# data/forecast holds the forecast history snapshots + static poll inputs the
# forecast build appends to; public/data/forecast.json itself is already covered
# by the public/data entry above.
DATA_PATHS="public/data scripts/civic/city-qids.json scripts/civic/cabinet-positions.json scripts/civic/house-leadership-positions.json data/forecast"
if git diff --quiet -- $DATA_PATHS; then
  note "no data change this run; nothing to commit"
else
  git config user.name  "metro-mini[bot]"
  git config user.email "metro-mini-bot@users.noreply.github.com"
  # A leadership change rewrites the per-country history (leaders/<slug>.json),
  # which the country pages read at BUILD time, so that alone needs a real Vercel
  # build to surface. Everything else here (including the Zone Zero Cup since
  # 2026-07-20) is ISR-read from GitHub raw and rides [vercel skip], no deploy.
  # Checked before `git add`, so this compares the unstaged working tree.
  if git diff --quiet -- public/data/leaders/_changes.json; then
    MSG="data: mini civic/leaders/billionaires refresh [vercel skip]"
  else
    MSG="data: mini refresh + leadership change(s) - rebuild country pages"
  fi
  git add $DATA_PATHS
  if [ "$DRY_RUN" = "1" ]; then
    note "DRY_RUN=1: would commit and push -> $MSG"
    git reset -q -- $DATA_PATHS
  else
    git commit -m "$MSG" || fail "git commit failed"
    git push "$GIT_REMOTE" "HEAD:$GIT_BRANCH" || fail "git push failed"
    note "committed + pushed"
  fi
fi

if [ -n "$STEP_FAILS" ]; then
  alert "Refresh finished but some steps errored (good data left intact):$STEP_FAILS"
  note "done WITH step failures"
  exit 1
fi
note "done clean"
