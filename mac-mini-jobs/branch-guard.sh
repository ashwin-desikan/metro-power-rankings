# shellcheck shell=bash
# mac-mini-jobs/branch-guard.sh -- THE branch guard for every mini job that
# writes to git. The only copy of the rule: runners/_common.sh sources this file
# (require_expected_branch is a thin wrapper), and the top-level run-*.sh
# scripts and metro-mini-refresh.sh source it directly.
#
# Usage: source it, then call `require_main_branch "<what>" [branch]` immediately
# after cd-ing into the repo and BEFORE any fetch, merge, commit or push:
#
#   cd "$REPO" || fail "repo not found"
#   . "$REPO/mac-mini-jobs/branch-guard.sh" || fail "branch-guard.sh missing"
#   require_main_branch "a scraper refresh"
#
# 🔴 WHY IT EXISTS. `HEAD:main` DOES NOT MEAN "main TO main": it pushes whatever
# HEAD points at, and the clone these jobs run in is shared with whoever is
# working on the mini, so one `git switch` silently re-aims the whole fleet.
# Measured 2026-09-23 (HANDOFF AG): at 15:37 a session committed a [vercel skip]
# docs commit on an unreviewed `security-hardening` branch, and about 20 seconds
# later the mlb-sim job's _mini_sync_flush_unpushed pushed HEAD:main and made it
# public. The author's `reset --soft` could not undo it, and the follow-up rebase
# DISCARDED the corrected commit as already applied. Only the untagged-commit
# build rule kept that branch's app code off main, a rule written to protect the
# build budget that had never been asked to be a security boundary.
# Scripts that push `origin main` instead of HEAD:main are not safe either: on a
# branch they fast-forward or rebase it and commit the job's data onto it, so the
# data silently never ships (HANDOFF BE). Either way: no git off main.
#
# A detached HEAD counts as wrong on purpose: `symbolic-ref -q` prints nothing,
# so `head` is empty and never equals a non-empty branch name.
#
# WHY IT EXITS 1 RATHER THAN STANDING DOWN 0. A scheduled job must never be
# silently skipped: a green healthchecks tile over a job that did nothing is the
# silent-failure class this repo keeps paying for. Volume is bounded from both
# ends: the dispatcher records the slot even on failure, so there is no retry
# loop, and the ntfy here is deduped per distinct wrong HEAD through a stamp
# file shared by every job. One ntfy for the condition, plus the dispatcher's
# honest FAIL per job that really did not run.
# THE ONE EXCEPTION is run-deploy-watch.sh, which catches the exit in a subshell
# and stands down 0. Its slot comes every 10 minutes, so "no retry loop" does
# not hold for it and exit 1 would page six times an hour. The deduped ntfy
# still fires, and every other job goes red. Do not copy that pattern to a job
# that runs once a day.
#
# 🔴 DO NOT PIPE THE CALL. `require_main_branch ... | tee -a "$LOG"` runs the
# function in a subshell, so its `exit 1` would exit the subshell and the script
# would carry on to the push. It writes to $LOG itself when $LOG is set.
#
# 🔴 NO SIDE EFFECTS AT SOURCE TIME. Sourcing it defines one function and does
# nothing else, which is why the top-level scripts source this and not
# _common.sh (that would redefine their fail(), source config.env into them and
# take the dispatcher lock at load time).
#
# $MINI_DIR, when set (runners/_common.sh sets it, and so does its selftest),
# says where the stamp, config.env and notify.py live; otherwise it is
# ~/metro-mini-jobs. The selftest depends on this: without it, a test run would
# write the REAL stamp and send a REAL ntfy.
#
# Branch work in the shared clone belongs in `git worktree add`, which leaves
# the clone itself on main and never trips this.
require_main_branch() {
  local what="${1:-this git write}" want="${2:-main}" head where stamp line
  local mini="${MINI_DIR:-$HOME/metro-mini-jobs}"
  stamp="$mini/.mini-wrong-branch"
  head="$(git symbolic-ref --short -q HEAD || true)"
  # Clearing on the way past is what re-arms the dedupe for the next episode.
  if [ "$head" = "$want" ]; then
    rm -f "$stamp" 2>/dev/null
    return 0
  fi
  where="${head:-a detached HEAD at $(git rev-parse --short HEAD 2>/dev/null)}"
  line="[$(date '+%F %T')] REFUSING $what: the clone is on $where, not $want. Jobs only touch git on $want, and a HEAD:$want push from here would publish $where. NOTHING WAS DONE."
  echo "$line"
  [ -n "${LOG:-}" ] && echo "$line" >> "$LOG" 2>/dev/null
  if [ "$(cat "$stamp" 2>/dev/null)" != "$where" ]; then
    # In a subshell, so config.env never leaks into the caller's environment,
    # and so the alert has its ntfy config whichever way the caller was launched.
    ( set -a; [ -f "$mini/config.env" ] && . "$mini/config.env"; set +a
      "${PYTHON_BIN:-${PY:-python3}}" "$mini/notify.py" "CoN mini job" \
        "mini clone is on $where, not $want. Jobs are refusing to run rather than pushing that branch to $want. Switch back, or use a git worktree for branch work." 1 ) >/dev/null 2>&1 || true
    echo "$where" > "$stamp" 2>/dev/null || true
  fi
  exit 1
}
