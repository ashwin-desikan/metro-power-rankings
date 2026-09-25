# shellcheck shell=bash
# mac-mini-jobs/branch-guard.sh -- the HEAD:main push guard, for the top-level
# scripts that do NOT source runners/_common.sh.
#
# Usage: source it, then call `require_main_branch "<what>"` immediately after
# cd-ing into the repo and BEFORE any fetch, merge, commit or push:
#
#   . "$REPO/mac-mini-jobs/branch-guard.sh"
#   cd "$REPO" || fail "repo not found"
#   require_main_branch "a scraper refresh"
#
# 🔴 WHY IT EXISTS. These scripts end with `git push origin HEAD:main`, which
# pushes whatever HEAD points at, and the clone they run in is shared with
# whoever is working on the mini. On 2026-09-23 a session's branch checkout was
# published to main within seconds by exactly this mechanism (HANDOFF AG). The
# fix for runners/ is require_expected_branch in runners/_common.sh (HANDOFF AH),
# but twelve top-level scripts never source _common.sh and so were never
# covered. Measured 2026-09-25.
#
# 🔴 DO NOT PIPE THE CALL. `require_main_branch ... | tee -a "$LOG"` runs the
# function in a subshell, so its `exit 1` would exit the subshell and the script
# would carry on to the push. It writes to $LOG itself when $LOG is set.
#
# 🔴 NO SIDE EFFECTS AT SOURCE TIME, which is the whole reason this is a
# separate file rather than "just source _common.sh". Sourcing _common.sh would
# redefine these scripts' own fail(), source config.env into them and take the
# dispatcher lock at load time: four behaviour changes to every job using it.
# This file only defines one function.
#
# TWIN of require_expected_branch in runners/_common.sh. Same rule, same
# detached-HEAD handling, and the SAME stamp file, so the alert is deduped across
# the whole fleet: one ntfy per distinct wrong HEAD, not one per script. If the
# rule changes, change both, or better, make _common.sh source this file.

require_main_branch() {
  local what="${1:-this git write}" want="${2:-main}" head where stamp line
  local mini="$HOME/metro-mini-jobs"
  stamp="$mini/.mini-wrong-branch"
  head="$(git symbolic-ref --short -q HEAD || true)"
  # Clearing on the way past is what re-arms the dedupe for the next episode.
  if [ "$head" = "$want" ]; then
    rm -f "$stamp" 2>/dev/null
    return 0
  fi
  # A detached HEAD prints nothing, so it can never equal a non-empty branch.
  where="${head:-a detached HEAD at $(git rev-parse --short HEAD 2>/dev/null)}"
  line="$(date +%T) REFUSING $what: the clone is on $where, not $want. This script pushes HEAD:$want, so continuing would publish $where. NOTHING WAS DONE."
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
