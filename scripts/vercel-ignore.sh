#!/bin/sh
# Vercel ignored-build step. vercel.json points here because the inline
# ignoreCommand string has a 256-character schema cap (a bot PR tripped it
# on 2026-08-03; see HANDOFF).
#
# Exit 0 = SKIP the build, exit 1 = BUILD. Fail OPEN: when anything is
# uncertain (missing env, unknown base sha, pathspec surprise), build.
#
# Decision order:
#   1. "[vercel skip]" in the head commit message always skips - the house
#      convention; every data/docs/automation commit carries it.
#   2. Non-main refs skip unless the commit opts in with "[preview]".
#   3. "[deploy-retry]" (mac-mini run-deploy-watch.sh re-triggers) always builds.
#   4. Otherwise, skip only when the WHOLE push range
#      (VERCEL_GIT_PREVIOUS_SHA..HEAD) touched no build-relevant path.
#      Diffing HEAD^..HEAD instead would miss an app commit buried under a
#      data commit in the same push - the exact gap the deploy watcher heals.

SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
MSG=$(git log -1 --pretty=%B "$SHA" 2>/dev/null) || exit 1

case "$MSG" in *"[vercel skip]"*) exit 0;; esac

if [ "${VERCEL_GIT_COMMIT_REF:-main}" != "main" ]; then
  case "$MSG" in *"[preview]"*) exit 1;; *) exit 0;; esac
fi

case "$MSG" in *"[deploy-retry]"*) exit 1;; esac

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$BASE" ] || exit 1
git cat-file -e "$BASE^{commit}" 2>/dev/null || exit 1

# Paths that feed `next build`, read from the single source of truth also
# used by .githooks/prepare-commit-msg (see that file's own comment for why
# this moved out of an inline list on 2026-08-06).
PATHS_FILE="$(dirname "$0")/vercel-build-paths.txt"
[ -f "$PATHS_FILE" ] || exit 1
BUILD_PATHS=$(grep -v '^#' "$PATHS_FILE" | grep -v '^[[:space:]]*$')

if git diff --quiet "$BASE" "$SHA" -- $BUILD_PATHS; then
  exit 0
fi
exit 1
