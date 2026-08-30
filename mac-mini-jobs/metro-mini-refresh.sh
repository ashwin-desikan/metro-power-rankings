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
# Capture a caller-supplied DRY_RUN BEFORE config.env is sourced. config.env sets
# DRY_RUN=0 and `set -a; . config.env` overwrites the caller's environment, so
# `DRY_RUN=1 ./metro-mini-refresh.sh` used to be silently ignored and run LIVE --
# a safety switch that quietly did nothing. Caller wins; then config.env; then 0.
_DRY_RUN_CALLER="${DRY_RUN:-}"
[ -f "$DIR/config.env" ] && set -a && . "$DIR/config.env" && set +a

REPO_DIR="${REPO_DIR:?set REPO_DIR in config.env (path to the git clone on the mini)}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PY="${PYTHON_BIN:-python3}"
DRY_RUN="${_DRY_RUN_CALLER:-${DRY_RUN:-0}}"
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
STEP_FAILS=""; STEP_TOTAL=0; STEP_FAIL_COUNT=0
run_step() {  # run_step "label" cmd...
  local label="$1"; shift
  STEP_TOTAL=$((STEP_TOTAL+1))
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
    STEP_FAIL_COUNT=$((STEP_FAIL_COUNT+1))
  fi
}

# 2026-07-20: --add-only dropped. The script now auto-applies a genuine change
# of head of state/government to _current.json AND the per-country history, and
# logs it to public/data/leaders/_changes.json (feeds /leaders/changes). Guarded
# by _plausible() plus a single-unambiguous-office check, so a noisy Wikidata
# edit is skipped rather than published.
run_step "leaders (auto-apply)" "$PY" scripts/leaders/refresh-current-leaders.py
# Weekly reconciliation of the curated leader overrides (saudi/hungary/bulgaria)
# against live Wikidata. Overrides auto-apply their forced value every run, so a
# real handover in an overridden country would otherwise be masked silently. This
# ntfy's if WD has caught up (override removable) or CHANGED to a new value (a
# possible real change to review). Read-only: queries WD, writes nothing, exits 0.
run_step "leaders override audit" "$PY" scripts/leaders/check-wikidata-overrides.py
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
# Team ownership: the seed at scripts/data/team-owners-seed.json is hand-curated
# and this step writes nothing unless it changed. It runs weekly anyway because
# it re-validates the join against the valuations board in BOTH directions -- so
# if a team is renamed or added upstream, this step goes red instead of the Owner
# column silently going blank on /sports/valuations.
run_step "team owners"          "$PY" scripts/build-team-owners-data.py
# Deterministic staleness signal for the ownership watchlist: flags contested
# rows whose published decision date has passed. No scraping, no network.
run_step "owners watchlist"     "$PY" scripts/check-owners-watchlist.py
run_step "power ranking"        "$PY" scripts/build-power-ranking.py
# Zone Zero Cup: weekly regeneration (added 2026-07-20; the Cup had not been
# rebuilt since 21 Jun). Preflight-guarded, so it refuses to write a hollowed-out
# Cup if a pillar input has collapsed. The page ISR-reads it from GitHub raw, so
# this needs no Vercel build.
run_step "zone zero cup"        "$PY" scripts/zzc_v1_multipillar.py
# Election forecast: MOVED OUT of this weekly Sunday job on 2026-08-01 to the
# forecast-weekly.yml GitHub Action (cron Mon/Wed/Fri 06:10 UTC) so it refreshes
# ~3x/week instead of drifting a full week between Sunday runs. Do NOT re-add the
# fetch/build steps here or the forecast double-runs (mini + Action same day).
# See .github/workflows/forecast-weekly.yml.
# citypopulation.de watcher (added 2026-07-22): flags NEW in-coverage entries on
# citypopulation.de's /en/help/new/ feed vs the committed snapshot and pushes via
# notify.py (same channel as alert()). stdlib-only, snapshot is
# public/data/citypopulation-feed.json (already under DATA_PATHS, so the commit
# below sweeps it up). Silent unless there's a genuinely new update; a fetch or
# empty-parse leaves the snapshot untouched and just marks the step failed.
run_step "citypopulation watch" "$PY" scripts/citypopulation/watch_feed.py
# NB: the US box-office number-ones refresh MOVED OUT of this Sunday job (2026-07-28):
# its data publishes Mon/Tue, so a Sunday run always saw last week's numbers. It now runs
# in its own com.citizenofnowhere.screen-number-ones agent on Tuesday. See run-screen-number-ones.sh.

# --- commit + push ---------------------------------------------------------
# scripts/civic/city-qids.json is included alongside public/data: it's the
# mayors QID cache (see refresh_mayors.py), stable but not static (self-heals
# as new metros enter the top 100 or a chunk resolves late), and committing it
# keeps the mini and the civic-data-refresh.yml Action fallback warm-started
# instead of every run cold-starting QID discovery from an empty cache.
# data/forecast holds the forecast history snapshots + static poll inputs the
# forecast build appends to; public/data/forecast.json itself is already covered
# by the public/data entry above.
# scripts/screen/data holds the film-pipeline caches the number-ones refresh
# rewrites (number_ones.json + the wikilink->QID->IMDb caches); the exported
# public/data/screen/*.json is already covered by the public/data entry above.
DATA_PATHS="public/data scripts/civic/city-qids.json scripts/civic/cabinet-positions.json scripts/civic/house-leadership-positions.json data/forecast scripts/screen/data"
if git diff --quiet -- $DATA_PATHS; then
  note "no data change this run; nothing to commit"
else
  # Vandalism gate (last check before commit): blocks _current.json if a pinned
  # leader drifted or a name changed while the office did NOT turn over (same
  # `since`) -- the signature that shipped India's head of state as "Ganesh rajput"
  # (#5 most powerful person) via 8c3f77912. Nonzero = HOLD: alert + do NOT commit,
  # leave the working tree for a human. This is a real fault (human needed), so it
  # reddens the healthchecks tile via fail() -> exit 1, not the soft green path.
  note "leaders sanity gate"
  "$PY" scripts/check-leaders-sanity.py \
    || fail "leaders sanity gate HELD the commit -- _current.json has a vandalism/pin flag; review scripts/check-leaders-sanity.py output, do NOT auto-commit"
  # If this gate HELD a previous run and you're now recovering by hand: stage
  # the correction TOGETHER with $DATA_PATHS in ONE commit, not two separate
  # pushes. A HOLD recovery is inherently one work item (the fix, plus the
  # data that was blocked behind it) -- found 2026-08-30 (daily-ops-sweep)
  # after exactly that split cost an extra billable Vercel build (two
  # commits 45s apart for the same recovery).
  git config user.name  "metro-mini[bot]"
  git config user.email "metro-mini-bot@users.noreply.github.com"
  # Some refreshed files are read by lib/ with readFileSync at BUILD time, so a
  # [vercel skip] commit leaves them sitting in the repo doing nothing until an
  # unrelated commit happens to trigger a build -- vercel-ignore.sh rule 1 skips
  # on the tag BEFORE the path test, and run-deploy-watch.sh skips past tagged
  # subjects when choosing its TARGET, so neither the guard nor the healer sees
  # them. Those paths live in scripts/refresh-needs-build-paths.txt, shared with
  # civic-data-refresh.yml so the two cannot drift. Until 2026-08-11 this test
  # was hardcoded to leaders/_changes.json alone and silently missed valuations.
  # Everything else here (including the Zone Zero Cup since 2026-07-20) is
  # ISR-read from GitHub raw and rides [vercel skip], no deploy.
  # Checked before `git add`, so this compares the unstaged working tree.
  NEEDS_BUILD_FILE="scripts/refresh-needs-build-paths.txt"
  [ -f "$NEEDS_BUILD_FILE" ] || fail "missing $NEEDS_BUILD_FILE -- refusing to guess whether this refresh needs a build"
  NEEDS_BUILD_PATHS=$(grep -v '^#' "$NEEDS_BUILD_FILE" | grep -v '^[[:space:]]*$')
  [ -n "$NEEDS_BUILD_PATHS" ] || fail "$NEEDS_BUILD_FILE has no paths -- refusing to guess"
  if git diff --quiet -- $NEEDS_BUILD_PATHS; then
    MSG="data: mini civic/leaders/billionaires refresh [vercel skip]"
  else
    CHANGED=$(git diff --name-only -- $NEEDS_BUILD_PATHS | tr '\n' ' ')
    note "build-time-read data changed ($CHANGED) -- committing WITHOUT [vercel skip]"
    MSG="data: mini refresh - build-time-read data changed, rebuild required"
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
  if [ "$STEP_FAIL_COUNT" -ge "$STEP_TOTAL" ]; then
    # Every step failed -> systemic (network down, all upstreams out). Surface as a
    # real failure (exit 1 -> healthchecks red) because the job did no useful work.
    alert "ALL ${STEP_TOTAL} refresh steps failed — systemic problem:$STEP_FAILS"
    note "done: ALL ${STEP_TOTAL} steps failed (systemic) — exit 1"
    exit 1
  fi
  # A subset of best-effort steps flaked (e.g. one upstream outage like Wikidata).
  # Good data is intact and everything else committed, so this is NOT a job failure:
  # alert via ntfy but exit 0 so the healthchecks tile stays GREEN. Red is reserved
  # for systemic step failure (above) and self-test / fetch / commit / push faults.
  # (2026-07-23: a single mayors timeout during the WDQS outage was reddening the
  # whole check for two straight Sundays despite every other step committing fine.)
  alert "Refresh OK; ${STEP_FAIL_COUNT}/${STEP_TOTAL} best-effort steps errored (good data left intact):$STEP_FAILS"
  note "done with ${STEP_FAIL_COUNT}/${STEP_TOTAL} non-fatal step failures — exit 0"
  exit 0
fi
note "done clean"
