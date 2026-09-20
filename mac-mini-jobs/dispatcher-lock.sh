#!/usr/bin/env bash
# dispatcher-lock.sh - take the SAME lock dispatcher.py uses, from a shell.
#
# WHY (2026-09-20). Every SCHEDULED writer of this repo now runs inside the
# dispatcher's single lock, but a run started BY HAND does not, and that is not
# a hypothetical: at 22:15 that evening a manual metro-rankings run and a
# scheduled bot commit touched the index at the same moment, the run's restore
# of public/data failed, and 775 files were left modified. deploy-watch is the
# script most likely to be run by hand -- its launchd plist is kept, unloaded,
# as the fallback for when the dispatcher is down -- so it takes the lock too.
#
# Deliberately the SAME FILE and the SAME format as dispatcher.py's
# acquire_lock(): a PID, liveness-probed with signal 0, stale file taken over.
# Two locks that do not see each other would be worse than one lock, so this is
# a quote of that function, not a parallel invention. If dispatcher.py's lock
# changes, change this with it.
#
# Re-entrancy matters: when the DISPATCHER runs deploy-watch as a job it
# already holds the lock, and a child that tried to take it again would
# deadlock the job permanently. dispatcher.py exports DISPATCHER_LOCK_HELD for
# exactly this, and seeing it means "your parent holds it, carry on".
#
# NOTE, inherited from dispatcher.py rather than introduced here: the
# check-then-write is not atomic, so two processes starting in the same
# millisecond could both pass. The window is microseconds against a 10-minute
# tick; matching the existing behaviour is worth more than closing it on one
# side only and leaving the two implementations disagreeing.
#
# Usage:
#   . "$(dirname "${BASH_SOURCE[0]}")/dispatcher-lock.sh"
#   dispatcher_lock_acquire "deploy-watch" || exit 0   # busy is not a failure
#   trap dispatcher_lock_release EXIT

DISPATCHER_LOCK_FILE="${DISPATCHER_LOCK_FILE:-$HOME/metro-mini-jobs/.dispatcher.lock}"
_DL_HELD_BY_US=0

dispatcher_lock_acquire() {
  local label="${1:-manual run}" pid
  # Inside a dispatcher tick already: it holds the lock on our behalf.
  if [ -n "${DISPATCHER_LOCK_HELD:-}" ]; then
    return 0
  fi
  if [ -e "$DISPATCHER_LOCK_FILE" ]; then
    pid="$(cat "$DISPATCHER_LOCK_FILE" 2>/dev/null | tr -d '[:space:]')"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "dispatcher lock held by pid $pid; $label standing down (not a failure)" >&2
      return 1
    fi
    echo "stale dispatcher lock (pid ${pid:-empty}); taking it over" >&2
  fi
  echo $$ > "$DISPATCHER_LOCK_FILE" 2>/dev/null || return 1
  _DL_HELD_BY_US=1
  return 0
}

# Releases ONLY a lock this process actually took. The guard is the whole point:
# a job running under the dispatcher must never delete the tick's lock on its
# way out, which would let the next tick start on top of a running one.
dispatcher_lock_release() {
  [ "${_DL_HELD_BY_US:-0}" = "1" ] || return 0
  rm -f "$DISPATCHER_LOCK_FILE" 2>/dev/null
  _DL_HELD_BY_US=0
  return 0
}
