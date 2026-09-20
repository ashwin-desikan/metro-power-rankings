#!/usr/bin/env bash
# git-maintenance.sh - the ONE place this repo is allowed to run git gc.
#
# WHY THIS EXISTS (2026-09-20). Git's own auto-maintenance crashed TWICE in
# eight hours and both times left `index.lock`, `HEAD.lock` and
# `objects/maintenance.lock` behind, plus a pair of `tmp_obj_*` files:
#   14:17:50  stranded bot commit f5687d931 unpushed, which diverged main and
#             hard-failed every job calling mini_sync() for 7h27m (14 ntfy alerts).
#   22:15     collided with bot commit 0880b185a and a metro-rankings shadow run,
#             so the run's restore of public/data FAILED, leaving 775 modified
#             files, and 0880b185a was left unpushed -- the same shape, again.
# Cause: `gc.auto`, `gc.autoDetach` and `maintenance.auto` were all unset, so git
# took its defaults -- auto-gc fires off the back of a commit and DETACHES into
# the background, where it races the next job's git command and dies holding
# three locks. A dozen scheduled jobs commit here all day, so it recurs.
#
# Fix, in two halves. Half one is config, already applied to the clone:
#   gc.auto = 0            (the gc task never fires on its own)
#   maintenance.auto false (the run_auto_maintenance hook that takes
#                           objects/maintenance.lock never fires either)
# Half two is this job: the same work, done deliberately, in the FOREGROUND, in
# a dispatcher slot. The dispatcher holds a single lock across all its jobs, so
# nothing it runs can collide with this. That is the whole point of moving gc
# in here rather than leaving it to fire from whichever job happened to commit.
#
# IT STILL IS NOT ALONE. run-deploy-watch.sh runs every 10 minutes from its OWN
# launchd agent, outside the dispatcher's lock, and does real git -- fetch, log,
# and `pull --rebase --autostash`. So a collision is still possible, just rare
# and no longer self-inflicted. This script therefore treats "another git
# process holds the lock" as a SKIP, not a failure: gc is never urgent, and a
# job that pages Ashwin at 03:00 because a fetch was in flight is worse than a
# job that shrugs and tries again tomorrow.
#
# Writes NOTHING to the repo contents. No commit, no push, no [vercel skip] to
# get wrong. It only repacks objects and removes git's own debris.
#
# DRY_RUN=1 reports what it would do and changes nothing.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

# Deliberately NO mini_sync. Maintenance must not care whether main is ahead,
# behind or diverged -- gc is about object storage, not branch state, and a
# janitor that refuses to tidy because the branch diverged is exactly the
# failure mode this job exists to clean up after.

cd "$REPO_DIR" || fail "REPO_DIR not found: $REPO_DIR"

# How many loose objects justify a repack. This is git's own default; the point
# of gc.auto=0 above is to stop git applying it at an UNCONTROLLED moment, not
# to abandon the threshold, so the slot re-applies it with -c.
GC_AUTO_THRESHOLD="${GC_AUTO_THRESHOLD:-6700}"
# A lock younger than this may belong to a live git we simply cannot see.
STALE_LOCK_MIN="${STALE_LOCK_MIN:-60}"
QUARANTINE="$MINI_DIR/quarantine"

# Conservative: any git anywhere on this box counts. The mini runs nothing else
# that would use git, so a false positive costs one skipped night, while a false
# negative is how stale locks got created in the first place.
git_busy() {
  pgrep -x git >/dev/null 2>&1 && return 0
  pgrep -f 'git-pack-objects|git-repack|git-gc|git-maintenance|git-remote-https' >/dev/null 2>&1 && return 0
  return 1
}

if git_busy; then
  note "a git process is running; skipping maintenance this slot (not a failure)"
  exit 0
fi

# --- 1. stale lock sweep -----------------------------------------------------
# The recovery both incidents needed, automated. A lock is removed ONLY when it
# is older than STALE_LOCK_MIN AND no git process is running (checked above).
# Moved to a quarantine dir, never deleted, so a wrong call is recoverable.
swept=0
for lock in index.lock HEAD.lock ORIG_HEAD.lock config.lock packed-refs.lock \
            shallow.lock objects/maintenance.lock; do
  f="$REPO_DIR/.git/$lock"
  [ -e "$f" ] || continue
  age_min=$(( ( $(date +%s) - $(stat -f %m "$f") ) / 60 ))
  if [ "$age_min" -ge "$STALE_LOCK_MIN" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      note "DRY_RUN: would quarantine stale lock $lock (${age_min}m old)"
    else
      mkdir -p "$QUARANTINE"
      mv "$f" "$QUARANTINE/$(basename "$lock").$(date +%Y%m%d-%H%M%S)"
      note "quarantined stale lock $lock (${age_min}m old)"
    fi
    swept=$((swept + 1))
  else
    note "lock $lock is only ${age_min}m old -- leaving it and skipping this slot"
    exit 0
  fi
done
# next-index-* is git writing a new index; same rule, but the name varies.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  age_min=$(( ( $(date +%s) - $(stat -f %m "$f") ) / 60 ))
  [ "$age_min" -ge "$STALE_LOCK_MIN" ] || continue
  if [ "$DRY_RUN" = "1" ]; then
    note "DRY_RUN: would quarantine $(basename "$f") (${age_min}m old)"
  else
    mkdir -p "$QUARANTINE"
    mv "$f" "$QUARANTINE/$(basename "$f").$(date +%Y%m%d-%H%M%S)"
    note "quarantined $(basename "$f") (${age_min}m old)"
  fi
  swept=$((swept + 1))
done < <(find "$REPO_DIR/.git" -maxdepth 1 -name 'next-index-*.lock' 2>/dev/null)

# DRY_RUN must not page anyone. `swept` counts what a real run WOULD do, so it
# is non-zero in a rehearsal too; alerting on it sent a false "something
# crashed mid-write" at 22:27 on 2026-09-20 from a dry run that had quarantined
# nothing. Found by re-reading the ntfy feed after the change, which is the
# only reason it did not sit there as a standing lie.
if [ "$swept" -gt 0 ] && [ "$DRY_RUN" != "1" ]; then
  alert "git-maintenance swept $swept stale lock(s) in the rankings repo -- something crashed mid-write; check dispatcher.log around the timestamps"
fi

# --- 2. stale temporary objects ---------------------------------------------
# tmp_obj_* is a half-written object from a crashed writer. A live one is
# seconds old; anything past a day is debris. git gc only clears these once
# they age past gc.pruneExpire (2 weeks), which is why eight had piled up.
tmp_count=$(find "$REPO_DIR/.git/objects" -type f -name 'tmp_obj_*' -mtime +1 2>/dev/null | wc -l | tr -d ' ')
if [ "$tmp_count" -gt 0 ]; then
  if [ "$DRY_RUN" = "1" ]; then
    note "DRY_RUN: would remove $tmp_count stale tmp_obj_* file(s)"
  else
    find "$REPO_DIR/.git/objects" -type f -name 'tmp_obj_*' -mtime +1 -delete 2>/dev/null
    note "removed $tmp_count stale tmp_obj_* file(s)"
  fi
fi

# --- 3. the gc itself --------------------------------------------------------
before=$(git count-objects -v 2>/dev/null | awk '/^count:/{print $2}')
note "loose objects before: ${before:-unknown} (threshold $GC_AUTO_THRESHOLD)"

if [ "$DRY_RUN" = "1" ]; then
  note "DRY_RUN: would run git -c gc.auto=$GC_AUTO_THRESHOLD -c gc.autoDetach=false gc --auto"
  note "done (dry run)"
  exit 0
fi

# --auto so a quiet day is a no-op; autoDetach=false so it runs in the
# FOREGROUND and a collision fails here, visibly, instead of orphaning locks
# in a background process nobody is waiting on. That detach is the whole bug.
out="$(git -c gc.auto="$GC_AUTO_THRESHOLD" -c gc.autoDetach=false gc --auto 2>&1)"
rc=$?
[ -n "$out" ] && note "$out"

if [ "$rc" -ne 0 ]; then
  case "$out" in
    *"Unable to create"*.lock*|*"another git process"*|*"index.lock"*)
      note "gc skipped: another git process held the lock (deploy-watch runs every 10m). Not a failure."
      exit 0 ;;
    *)
      fail "git gc failed (rc=$rc): $out" ;;
  esac
fi

after=$(git count-objects -v 2>/dev/null | awk '/^count:/{print $2}')
note "loose objects after: ${after:-unknown}"
note "done"
