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

# 🔴 `HEAD:$GIT_BRANCH` DOES NOT MEAN "main TO main". Both push sites in this
# file push whatever HEAD happens to point at onto $GIT_BRANCH, and until
# 2026-09-23 neither checked that HEAD was on it. This clone is shared with
# whoever is working on the mini, so one `git switch` silently re-aimed the
# whole fleet at someone's branch.
#
# Measured that day: at 15:37 a session committed a [vercel skip] docs commit on
# an unreviewed `security-hardening` branch, _mini_sync_flush_unpushed ran about
# 20 seconds later inside the mlb-sim job, pushed HEAD:main, and the commit was
# public before the author noticed. Their `reset --soft` could not undo it, and
# the follow-up rebase then DISCARDED the corrected commit as already applied.
# The only thing that kept that branch's app code off main was the untagged-
# commit rule below, which exists to protect the build budget and had never been
# asked to be a security boundary.
#
# A detached HEAD counts as wrong on purpose: `symbolic-ref -q` prints nothing
# and returns non-zero, so `head` is empty and never equals a non-empty
# $GIT_BRANCH.
#
# WHY THIS EXITS 1 RATHER THAN STANDING DOWN 0 like the dispatcher lock does.
# The lock's own rule, a few lines up, is that a scheduled job must never be
# silently skipped. A green healthchecks tile over a job that built nothing is
# the silent-failure class this repo keeps paying for, so a wrong branch is a
# real failure and is reported as one. Volume is bounded from both ends: the
# dispatcher records the slot even on failure, so there is no 10-minute retry
# loop, and the alert() here is deduped per distinct HEAD, the same stamp trick
# _mini_sync_flush_unpushed uses. One ntfy for the condition, plus the
# dispatcher's own honest FAIL per job that really did not run.
#
# Branch work in this clone belongs in `git worktree add`, which leaves the
# clone itself on $GIT_BRANCH and never trips this.
require_expected_branch() {
  local what="${1:-this git write}" head where stamp
  stamp="$MINI_DIR/.mini-wrong-branch"
  head="$(git symbolic-ref --short -q HEAD || true)"
  # Clearing on the way past is what makes the dedupe re-arm. Without it a
  # second checkout of a branch already named in the stamp would be silent.
  if [ "$head" = "$GIT_BRANCH" ]; then
    rm -f "$stamp" 2>/dev/null
    return 0
  fi
  where="${head:-a detached HEAD at $(git rev-parse --short HEAD 2>/dev/null)}"
  note "REFUSING $what: the clone is on $where, not $GIT_BRANCH. Every push here is HEAD:$GIT_BRANCH, so continuing would publish $where. NOTHING WAS DONE."
  if [ "$(cat "$stamp" 2>/dev/null)" != "$where" ]; then
    alert "mini clone is on $where, not $GIT_BRANCH. Jobs are refusing to run rather than pushing that branch to $GIT_BRANCH. Switch back, or use a git worktree for branch work."
    echo "$where" > "$stamp" 2>/dev/null || true
  fi
  exit 1
}

# EVERY runner takes the dispatcher's lock, so a run started BY HAND cannot
# collide with a scheduled tick. This is the case that actually did damage on
# 2026-09-20: a hand-run metro-rankings and a scheduled bot commit touched the
# index at the same moment, the run's restore of public/data failed, and 775
# files were left modified. deploy-watch got this first; this is the rest of
# the fleet, and it covers runners that never call mini_sync (git-maintenance).
#
# Under a dispatcher tick it is a NO-OP: the tick holds the lock already and
# exports DISPATCHER_LOCK_HELD, which dispatcher_lock_acquire honours. Only a
# manual run can stand down, so no scheduled job can be silently skipped by it.
#
# 🔴 NO `trap dispatcher_lock_release EXIT` HERE, AND THAT IS DELIBERATE.
# bash's `trap ... EXIT` REPLACES any previous EXIT trap, and two runners own
# theirs for real work -- metro-rankings.sh (`_restore_public_data`, the
# guarantee that public/data is put back after a shadow run) and
# economy-rates.sh (`report_failed_builders`). They set theirs AFTER sourcing
# this file, so a trap here would be silently replaced and never release;
# setting one later would be far worse, silently killing that restore. Measured
# both ways before writing this.
#
# Not releasing is SAFE, because the lock is a PID and both implementations
# (dispatcher.py's acquire_lock and dispatcher-lock.sh) probe it with signal 0
# and take over a dead one. A manual run that exits leaves a file whose owner
# is gone, and the next acquirer takes it over and says so. Releasing would be
# tidier; being correct without depending on trap ordering is worth more.
if [ -r "$REPO_DIR/mac-mini-jobs/dispatcher-lock.sh" ]; then
  . "$REPO_DIR/mac-mini-jobs/dispatcher-lock.sh"
  if ! dispatcher_lock_acquire "$(basename "${BASH_SOURCE[1]:-a runner}")"; then
    note "STANDING DOWN: a dispatcher tick holds the lock. NOTHING WAS DONE -- no data was built, fetched or committed. Wait for the tick to finish, then run this again."
    exit 0
  fi
fi
# Fails OPEN when the helper is missing: an absent lock file must not take the
# whole fleet down, and the behaviour without it is exactly what it was before.

# Get onto the latest history so we build and commit on top of it.
#
# WAS ff-only-or-die until 2026-09-20, on the reasoning that refusing beats
# silently discarding a divergence. That reasoning was right about discarding
# and wrong about refusing, and 2026-09-20 showed the cost: a crashed gc left
# bot commit f5687d931 committed but unpushed, main diverged by one commit, and
# because EVERY runner starts here, every job on the mini hard-failed for 7h27m
# -- 14 ntfy alerts -- waiting for a human to run one rebase. The push path in
# this same file has auto-rebased on rejection for months and nobody has ever
# regretted it; the asymmetry was the bug, not the strictness.
#
# So: fast-forward when we can, rebase our own commits on top when we cannot,
# and still refuse in the cases where refusing is genuinely right --
#   * nothing of ours to replay (0 ahead): a rebase would hide the real cause.
#   * a dirty tree: replaying commits underneath someone's half-finished
#     output is not a safe thing to do unasked. On 2026-09-20 that output was
#     775 restored files.
#   * an absurd divergence (> MINI_SYNC_MAX_REBASE, default 50): the stranded-
#     commit case is one or two commits. Dozens means a wrong branch or an
#     unrelated history, and replaying it silently would turn a visible problem
#     into an invisible one.
#   * a CONFLICT: abort, so the branch is left exactly where it was. Same
#     outcome for the human as the old hard failure, minus any chance of
#     finding the repo mid-rebase.
# Never discards anything: a rebase replays our commits, it does not drop them.
mini_sync() {
  cd "$REPO_DIR" || fail "REPO_DIR not found: $REPO_DIR"
  require_expected_branch "a sync of $GIT_REMOTE/$GIT_BRANCH"
  git fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet || fail "git fetch failed"

  # Happy path, still the common one. Also succeeds when we are merely AHEAD,
  # because then origin is already an ancestor of HEAD and there is nothing
  # to do.
  if git merge --ff-only "$GIT_REMOTE/$GIT_BRANCH" --quiet 2>/dev/null; then
    _mini_sync_flush_unpushed
    return 0
  fi

  local ahead behind dirty
  ahead="$(git rev-list --count "$GIT_REMOTE/$GIT_BRANCH..HEAD" 2>/dev/null || echo 0)"
  behind="$(git rev-list --count "HEAD..$GIT_REMOTE/$GIT_BRANCH" 2>/dev/null || echo 0)"
  dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

  if [ "${ahead:-0}" -eq 0 ]; then
    fail "cannot fast-forward to $GIT_REMOTE/$GIT_BRANCH and there is nothing to rebase (0 ahead, $behind behind, $dirty modified path(s)) (resolve by hand)"
  fi
  if [ "${dirty:-0}" -ne 0 ]; then
    fail "diverged (local $ahead, remote $behind) but the working tree has $dirty modified path(s), so a rebase would not be safe; commit or clean it (resolve by hand)"
  fi
  if [ "$ahead" -gt "${MINI_SYNC_MAX_REBASE:-50}" ]; then
    fail "diverged by $ahead local commits, past the ${MINI_SYNC_MAX_REBASE:-50} limit -- not the usual stranded-commit case, so stopping instead of replaying it (resolve by hand)"
  fi

  note "diverged from $GIT_REMOTE/$GIT_BRANCH (local $ahead, remote $behind); rebasing the local commit(s) on top"
  if git rebase "$GIT_REMOTE/$GIT_BRANCH" --quiet; then
    note "rebased $ahead local commit(s) onto $GIT_REMOTE/$GIT_BRANCH"
    _mini_sync_flush_unpushed
    return 0
  fi
  git rebase --abort >/dev/null 2>&1 || true
  fail "diverged and the rebase of $ahead local commit(s) CONFLICTED; aborted and left the branch exactly as it was (resolve by hand)"
}

# Flush commits that are sitting local. Rebasing clears the DIVERGENCE, which
# is what was breaking every job, but on its own it leaves the commit stranded:
# quieter than a hard failure and worse in its own way, because data meant to
# be published can sit unpushed indefinitely with nothing alerting. Ashwin
# ruled 2026-09-20: push the tagged ones automatically, alert on the untagged.
#
# The split is the [vercel skip] rule. A commit carrying the tag cannot trigger
# a build, so pushing it needs nobody's permission and is simply finishing the
# job the committing runner started. A commit WITHOUT the tag is a production
# build, which is Ashwin's call for that specific push, so this never pushes
# one -- it says so instead, and keeps saying so only once per distinct HEAD.
#
# Note the batching hazard this also avoids: Vercel reads the ignore rule from
# the PUSHED HEAD COMMIT ONLY (learned 2026-09-02). Pushing a mixed batch whose
# HEAD happens to be tagged would ship the untagged commit's changes with NO
# build at all. All-or-nothing on the tag is what makes that impossible here.
#
# Never fails the job: this is a self-heal, and a job must not die because a
# best-effort push did not go through.
_mini_sync_flush_unpushed() {
  local range n untagged subject head_sha stamp
  require_expected_branch "a flush of stranded commits"
  range="$GIT_REMOTE/$GIT_BRANCH..HEAD"
  stamp="$MINI_DIR/.mini-sync-untagged"
  n="$(git rev-list --count "$range" 2>/dev/null || echo 0)"
  if [ "${n:-0}" -eq 0 ]; then
    rm -f "$stamp" 2>/dev/null
    return 0
  fi

  # The post-commit hook's own test, character for character (.githooks/
  # post-commit): a subject containing the literal [vercel skip]. Two copies of
  # one rule is the bug class this repo keeps finding, so it is a deliberate
  # quote, not a paraphrase -- if that hook's definition changes, change this.
  untagged=0
  while IFS= read -r subject; do
    case "$subject" in *"[vercel skip]"*) ;; *) untagged=$((untagged + 1));; esac
  done < <(git log --format=%s "$range" 2>/dev/null)

  if [ "$untagged" -eq 0 ]; then
    if git push --quiet "$GIT_REMOTE" "HEAD:$GIT_BRANCH" 2>/dev/null; then
      note "pushed $n stranded [vercel skip] commit(s) to $GIT_REMOTE/$GIT_BRANCH"
      rm -f "$stamp" 2>/dev/null
    else
      note "could not push $n stranded [vercel skip] commit(s) this run (origin moved, or no network); the next job carries them"
    fi
    return 0
  fi

  head_sha="$(git rev-parse --short HEAD 2>/dev/null)"
  note "NOTE: $n local commit(s) unpushed, $untagged of them UNTAGGED (build-triggering); not pushing those from here"
  # One alert per distinct HEAD, not one per runner: every job starts with
  # mini_sync, so an unqualified alert here would fire dozens of times a day
  # for as long as the commit sat there, and be ignored by the second day.
  if [ "$(cat "$stamp" 2>/dev/null)" != "$head_sha" ]; then
    alert "$untagged untagged (build-triggering) commit(s) sitting unpushed on the mini at $head_sha. mini_sync will not push these -- push by hand when you want the build."
    echo "$head_sha" > "$stamp" 2>/dev/null || true
  fi
  return 0
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
  require_expected_branch "a commit and push of $*"
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
