#!/usr/bin/env bash
# Shared plumbing for the runners the dispatcher calls.
#
# Every runner in this folder is a LITERAL port of the GitHub workflow it
# replaces: same step order, same self-test gate, same early-exit on no change,
# same push retry loop, same fail-open revalidate ping after the 300s raw-CDN
# sleep. Do not paraphrase those guards. Each was added in response to a
# specific incident and the comments in the YAML explain which.
#
# Conventions follow metro-mini-refresh.sh, which is the house pattern:
#   - caller-supplied DRY_RUN wins over config.env
#   - fast-forward-only to origin before doing any work
#   - macOS ships no `timeout` binary, hence the pure-bash watchdog
#
# shellcheck shell=bash
set -uo pipefail

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MINI_DIR="$(cd "$COMMON_DIR/.." && pwd)"

# Capture the caller's DRY_RUN BEFORE config.env is sourced: `set -a; . config.env`
# would otherwise overwrite it and a `DRY_RUN=1` test run would go live.
_DRY_RUN_CALLER="${DRY_RUN:-}"
[ -f "$MINI_DIR/config.env" ] && set -a && . "$MINI_DIR/config.env" && set +a

REPO_DIR="${REPO_DIR:?set REPO_DIR in config.env (path to the git clone on the mini)}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PY="${PYTHON_BIN:-python3}"
DRY_RUN="${_DRY_RUN_CALLER:-${DRY_RUN:-0}}"
STEP_TIMEOUT="${STEP_TIMEOUT:-600}"
RAW_CDN_TTL="${RAW_CDN_TTL:-300}"
SITE_ORIGIN="${SITE_ORIGIN:-https://rankings.citizenofnowhere.org}"

note()  { echo "[$(date '+%F %T')] $*"; }
alert() { "$PY" "$MINI_DIR/notify.py" "CoN mini job" "$1" 1 || true; }
fail()  { note "FAIL: $1"; alert "$1"; exit 1; }

# Fast-forward to origin so we build and commit on top of the latest history.
# The Actions equivalent is a fresh checkout; on a persistent clone the honest
# equivalent is ff-only, which refuses rather than silently discarding a local
# divergence.
mini_sync() {
  cd "$REPO_DIR" || fail "REPO_DIR not found: $REPO_DIR"
  git fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet || fail "git fetch failed"
  git merge --ff-only "$GIT_REMOTE/$GIT_BRANCH" --quiet \
    || fail "cannot fast-forward; local branch has diverged from $GIT_REMOTE/$GIT_BRANCH (resolve by hand)"
}

# guarded "label" cmd...  -- hard-fails the run, matching the YAML's `set -e`.
# Unlike metro-mini-refresh.sh's best-effort run_step, these workflows abort on
# any step failure by design: a failed self-test or a failed model build must
# never reach the commit step.
guarded() {
  local label="$1"; shift
  note "step: $label (timeout ${STEP_TIMEOUT}s)"
  "$@" &
  local pid=$!
  # Redirected: killing $watcher reaps the subshell but not the sleep it
  # forked, and an orphan still holding this pipe keeps the dispatcher's
  # capture_output read blocked until the full timeout elapses.
  ( sleep "$STEP_TIMEOUT"
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null; sleep 3; kill -KILL "$pid" 2>/dev/null
    fi ) >/dev/null 2>&1 &
  local watcher=$!
  if wait "$pid" 2>/dev/null; then
    kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null
  else
    local rc=$?
    kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null
    if [ "$rc" -ge 124 ] || [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then
      fail "step TIMED OUT after ${STEP_TIMEOUT}s: $label"
    fi
    fail "step failed (rc=$rc): $label"
  fi
}

# commit_paths "message" path...
# Early-exits when nothing changed, exactly as the workflows do, so a no-op day
# is silent rather than an error. Returns 1 when there was nothing to commit.
commit_paths() {
  local msg="$1"; shift
  git add "$@"
  if git diff --cached --quiet; then
    note "No changes; nothing to commit."
    return 1
  fi
  if [ "$DRY_RUN" = "1" ]; then
    note "DRY_RUN=1: would commit and push -> $msg"
    git --no-pager diff --cached --stat
    git reset -q -- "$@"
    return 1
  fi
  git config user.name  "metro-mini[bot]"
  git config user.email "metro-mini-bot@users.noreply.github.com"
  git commit -m "$msg" || fail "git commit failed"
  local attempt
  for attempt in 1 2 3 4 5; do
    if git pull --rebase --autostash "$GIT_REMOTE" "$GIT_BRANCH" \
       && git push "$GIT_REMOTE" "HEAD:$GIT_BRANCH"; then
      note "Pushed on attempt $attempt."
      return 0
    fi
    sleep $((attempt * 5))
  done
  fail "Failed to push after retries."
}

# revalidate_ping <tag> [warm_path...]
# Fail-open by design: the 6h ISR window is the backstop, so a missing secret or
# a failed ping must never fail the data run. See app/api/revalidate/route.ts.
# raw.githubusercontent serves from a ~5-min CDN cache; flushing before it
# expires would re-render from the PREVIOUS commit's JSON and re-cache THAT for
# 6h, which is the exact bug the sleep exists to avoid.
#
# revalidateTag() only marks a route's cache entry dirty -- it does not
# regenerate it. Vercel serves the OLD copy (cache=STALE) to whichever request
# hits that route first after invalidation, while it regenerates in the
# background; only the request AFTER THAT sees fresh content. Measured
# 2026-08-06: nobody visited /business/markets for 67 minutes after a
# confirmed-200 ping, so a real visitor at 07:04:37Z ate that stale hit and saw
# yesterday's data. warm_path(s), if given, are GETted right after a
# successful ping so THIS job eats the stale-while-revalidate hit instead of a
# visitor.
revalidate_ping() {
  local tag="$1"; shift
  local warm_paths=("$@")
  if [ "$DRY_RUN" = "1" ]; then
    note "DRY_RUN=1: skipping revalidate ping (tag=$tag)"
    return 0
  fi
  if [ -z "${REVALIDATE_SECRET:-}" ]; then
    note "REVALIDATE_SECRET not set; skipping (6h ISR backstop applies)."
    return 0
  fi
  note "Waiting out the GitHub raw CDN TTL before flushing..."
  sleep "$RAW_CDN_TTL"
  local attempt code
  for attempt in 1 2 3; do
    code="$(curl -s -o /tmp/reval.out -w '%{http_code}' -X POST \
      -H "x-revalidate-secret: $REVALIDATE_SECRET" \
      "$SITE_ORIGIN/api/revalidate?tag=$tag")" || code=000
    if [ "$code" = "200" ]; then
      cat /tmp/reval.out; echo
      note "Revalidated on attempt $attempt."
      _warm_paths "${warm_paths[@]}"
      return 0
    fi
    note "revalidate ping attempt $attempt returned HTTP $code"
    sleep $((attempt * 5))
  done
  note "WARN: on-demand revalidation failed; pages refresh via the 6h ISR window instead."
  return 0
}

# _warm_paths path...
# GETs capped at 20s each so a hung route can't hold the runner open. Best-effort:
# a warm failing is not a job failure, same fail-open posture as the ping itself --
# the 6h window is still the backstop.
#
# SERIAL WITH A STAGGER, NOT PARALLEL, since 2026-09-01. These used to fire together
# with `&` + `wait`, so a caller passing eight paths (season-sims does) put eight
# requests plus the revalidate POST on the wire in the same instant. The
# citizenofnowhere.org zone is on Cloudflare's FREE plan, where rate limiting gives
# you ONE rule, counts over a fixed 10-SECOND window, and counts cached responses as
# well as origin ones -- "requests to origin only" is a paid parameter. So a BURST is
# the only thing that can trip it and a steady trickle cannot, which is the opposite
# of the usual intuition. Six requests in five minutes tripped it on 2026-09-01.
#
# The failure was invisible by design: a rate-limited warm returns 429/1015, the
# fail-open posture swallows it, and the page it was meant to warm is left cold, so
# the next real visitor eats the stale hit -- the exact problem the warm exists to
# prevent. WARM_STAGGER keeps at most two requests inside any 10-second window.
# The cost is seconds in a job that already sleeps 300s to wait out the raw CDN TTL.
WARM_STAGGER="${WARM_STAGGER:-5}"
_warm_paths() {
  [ "$#" -eq 0 ] && return 0
  local path code
  for path in "$@"; do
    code="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$SITE_ORIGIN$path")" || code=000
    note "warm $path -> HTTP $code"
    sleep "$WARM_STAGGER"
  done
}
