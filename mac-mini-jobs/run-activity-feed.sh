#!/bin/bash
# Regenerate the Site Activity feed (public/data/activity-feed.json) from git
# history and commit it [vercel skip]. The /activity page + home "Latest updates"
# rail read it via ISR-from-raw (lib/activity.ts), so no Vercel build is needed.
#
# Runs early each morning (02:30Z) so it captures the previous day's data-job +
# manual commits. Its own "chore(activity)" commits are skipped by the generator,
# so the feed never lists itself.
#
# ON mini_sync SINCE 2026-09-26 (HANDOFF BH). This used to open with
# `git pull --rebase --autostash`. On 2026-09-24 an uncommitted lib/releases.ts
# sat in the shared clone, origin had changed the same file, the autostash
# conflicted on re-apply, and the script exited WITHOUT cleaning the index. That
# turned a recoverable "local changes would be overwritten" into `unmerged
# files`, which killed five more jobs over 3.5 hours (HANDOFF AZ). mini_sync
# never stashes: it fast-forwards, rebases only our own commits and only on a
# clean tree, and aborts a conflicting rebase, so a refusal leaves the repo
# exactly as it found it. It also carries the branch guard, the dispatcher lock
# and the stranded-commit flush, like every other runner.
#
# 🔴 SOURCES THE LIVE _common.sh IN ~/metro-mini-jobs/runners/, NOT THE REPO COPY
# BESIDE THIS FILE. _common.sh derives MINI_DIR from its own path. From the repo
# copy that would be the repo's mac-mini-jobs/, which has no config.env, and the
# guard would write its stamp files INSIDE the shared clone: a dirty tree, the
# very thing this change exists to stop.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
FEED="public/data/activity-feed.json"
. "$HOME/metro-mini-jobs/runners/_common.sh" || { echo "cannot load _common.sh; refusing to run"; exit 1; }

# Every machine's latest commits first, so the feed is complete. Refuses off
# main and refuses rather than half-merging (see above).
mini_sync

# A failed or partial generation must not leave a modified tracked file in the
# shared clone (HANDOFF BC), so put the feed back before failing.
if ! python3 scripts/build-activity-feed.py; then
  git checkout -- "$FEED" 2>/dev/null
  fail "activity feed generator failed; $FEED restored, nothing committed"
fi

# commit_paths commits as metro-mini[bot] and pushes with retries. It returns 1
# only for "nothing changed" or DRY_RUN=1 (real failures exit through fail()),
# and under DRY_RUN it leaves the generated file modified, so restore it.
if ! commit_paths "chore(activity): refresh site activity feed [vercel skip]" "$FEED"; then
  git checkout -- "$FEED" 2>/dev/null
fi
exit 0
