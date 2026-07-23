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
"$PY" scripts/leaders/refresh-current-leaders.py --self-test || fail "leaders self-test failed"

# --- refreshes -------------------------------------------------------------
# Each step is best-effort: a single upstream hiccup should not abort the whole
# run, because each script leaves good data untouched on its own failure. We
# collect the names of any that error and alert once at the end.
STEP_FAILS=""; STEP_TOTAL=0; STEP_FAIL_COUNT=0
run_step() {  # run_step "label" cmd...
  local label="$1"; shift
  STEP_TOTAL=$((STEP_TOTAL+1))
  note "step: $label (timeout ${STEP_TIMEOUT}s)"
  # Run the step in the background; a watchdog kills it if it exceeds STEP_TIMEOUT.
  # macOS ships no `timeout` binary, so this is a portable pure-bash equivalent.
  "$@" &
  local pid=$!
  ( sleep "$STEP_TIMEOUT"
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
      note "  step TIMED OUT after ${STEP_TIMEOUT}s: $label"
    else
      note "  step FAILED (rc=$rc): $label"
    fi
    STEP_FAILS="${STEP_FAILS}\n- ${label}"
    STEP_FAIL_COUNT=$((STEP_FAIL_COUNT+1))
  fi
}

run_step "leaders (add-only)"   "$PY" scripts/leaders/refresh-current-leaders.py --add-only
run_step "governors (add-only)" "$PY" scripts/civic/refresh_governors.py --add-only
run_step "congress"             "$PY" scripts/civic/refresh_congress.py
run_step "mayors"               "$PY" scripts/civic/refresh_mayors.py
run_step "billionaires fetch"   "$PY" scripts/billionaires/fetch-billionaires.py
run_step "billionaires build"   "$PY" scripts/billionaires/build-billionaires.py
run_step "valuations"           "$PY" scripts/build-valuations-data.py
run_step "power ranking"        "$PY" scripts/build-power-ranking.py

# --- commit + push ---------------------------------------------------------
if git diff --quiet -- public/data; then
  note "no data change this run; nothing to commit"
else
  git config user.name  "metro-mini[bot]"
  git config user.email "metro-mini-bot@users.noreply.github.com"
  git add public/data
  MSG="data: mini civic/leaders/billionaires refresh [vercel skip]"
  if [ "$DRY_RUN" = "1" ]; then
    note "DRY_RUN=1: would commit and push -> $MSG"
    git reset -q -- public/data
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
  alert "Refresh OK; ${STEP_FAIL_COUNT}/${STEP_TOTAL} best-effort steps errored (good data left intact):$STEP_FAILS"
  note "done with ${STEP_FAIL_COUNT}/${STEP_TOTAL} non-fatal step failures — exit 0"
  exit 0
fi
note "done clean"
