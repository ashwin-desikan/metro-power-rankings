# shellcheck shell=bash
# mac-mini-jobs/safe-push.sh -- push HEAD to a branch, and get back on top of
# origin when that push is rejected, WITHOUT EVER STASHING. The one copy of
# that rule for the fleet: runners/_common.sh sources it (mini_sync,
# commit_paths, metro-rankings), and run-football-standings.sh and
# run-deploy-watch.sh source it directly.
#
# 🔴 WHY NO STASH. `git pull --rebase --autostash` was the fleet's push retry.
# When origin had changed a file that was dirty in the shared clone, the stash
# re-apply conflicted, and measured 2026-09-26 (HANDOFF BI): the pull still
# returned 0, the push went through, and the clone was left with an UNMERGED
# index, a stash and conflict markers, with no alert. The next job to sync then
# failed on `unmerged files`. That is the 2026-09-24 outage (HANDOFF AZ), which
# stopped six jobs for hours. Here a dirty tree is a refusal, never a stash.
#
# The rules for replaying our own commits (they used to live in mini_sync):
#   * nothing of ours to replay (0 ahead): a rebase would hide the real cause.
#   * a dirty tree, untracked files included: replaying commits underneath
#     someone's half-finished output is not safe to do unasked.
#   * an absurd divergence (> MINI_SYNC_MAX_REBASE, default 50): the stranded-
#     commit case is one or two commits; dozens means something else is wrong.
#   * a CONFLICT: abort, so the branch is left exactly where it was.
#
# NO SIDE EFFECTS AT SOURCE TIME, and no exit or fail() inside: each function
# RETURNS and leaves its reason in $SAFE_PUSH_REASON, because the callers want
# different things from a refusal. commit_paths fails the run; metro-rankings'
# held-report push is best-effort so the hold reason is not overwritten;
# deploy-watch stands down and tries again next run.

# rebase_local_onto <remote> <branch>
# Put our local commits back on top of an ALREADY-FETCHED <remote>/<branch>.
# 0: HEAD is on top of it (rebased, or already was). 1: refused, the repo left
# exactly as it was, the reason in $SAFE_PUSH_REASON.
rebase_local_onto() {
  local r="$1" b="$2" ahead behind dirty
  SAFE_PUSH_REASON=""
  git merge-base --is-ancestor "$r/$b" HEAD 2>/dev/null && return 0
  ahead="$(git rev-list --count "$r/$b..HEAD" 2>/dev/null || echo 0)"
  behind="$(git rev-list --count "HEAD..$r/$b" 2>/dev/null || echo 0)"
  dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${ahead:-0}" -eq 0 ]; then
    SAFE_PUSH_REASON="cannot fast-forward to $r/$b and there is nothing to rebase (0 ahead, $behind behind, $dirty modified path(s)) (resolve by hand)"
    return 1
  fi
  if [ "${dirty:-0}" -ne 0 ]; then
    SAFE_PUSH_REASON="diverged (local $ahead, remote $behind) but the working tree has $dirty modified path(s), so a rebase would not be safe; commit or clean it (resolve by hand)"
    return 1
  fi
  if [ "$ahead" -gt "${MINI_SYNC_MAX_REBASE:-50}" ]; then
    SAFE_PUSH_REASON="diverged by $ahead local commits, past the ${MINI_SYNC_MAX_REBASE:-50} limit -- not the usual stranded-commit case, so stopping instead of replaying it (resolve by hand)"
    return 1
  fi
  echo "[$(date '+%F %T')] diverged from $r/$b (local $ahead, remote $behind); rebasing the local commit(s) on top"
  if git rebase "$r/$b" --quiet; then
    echo "[$(date '+%F %T')] rebased $ahead local commit(s) onto $r/$b"
    return 0
  fi
  git rebase --abort >/dev/null 2>&1 || true
  SAFE_PUSH_REASON="diverged and the rebase of $ahead local commit(s) CONFLICTED; aborted and left the branch exactly as it was (resolve by hand)"
  return 1
}

# push_head_retry <remote> <branch> [attempts, default 5]
# Push FIRST. Only on a rejection: back off, fetch, and if <remote>/<branch>
# really moved, rebase_local_onto it. A failed fetch, or an origin that did
# not move (a network blip), just retries the push.
# 0: pushed, on attempt $SAFE_PUSH_ATTEMPT. 1: gave up, reason in
# $SAFE_PUSH_REASON, and the local commit is still there.
# Pushes whatever HEAD is, tagged or not: fans-monthly, metro-rankings and
# deploy-watch commit build-triggering on purpose, so this must not route
# through mini_sync's flush, which refuses untagged commits.
push_head_retry() {
  local r="$1" b="$2" n="${3:-5}" attempt
  SAFE_PUSH_REASON=""; SAFE_PUSH_ATTEMPT=0
  for ((attempt = 1; attempt <= n; attempt++)); do
    if git push "$r" "HEAD:$b"; then
      SAFE_PUSH_ATTEMPT=$attempt
      return 0
    fi
    [ "$attempt" -lt "$n" ] || break
    sleep $((attempt * 5))
    git fetch "$r" "$b" --quiet || continue
    if ! git merge-base --is-ancestor "$r/$b" HEAD 2>/dev/null; then
      echo "[$(date '+%F %T')] push rejected: $r/$b moved; rebasing our commit(s) onto it (no stash)"
      rebase_local_onto "$r" "$b" || return 1
    fi
  done
  SAFE_PUSH_REASON="push to $r/$b failed after $n attempts"
  return 1
}
