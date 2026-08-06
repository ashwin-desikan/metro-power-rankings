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

# --- base resolution. FAILS CLOSED. ---------------------------------------
# 2026-08-06: this block used to `exit 1` (build) whenever the base was absent
# or outside the clone. That cost THIRTEEN production builds in one day. The
# builds all came from commits touching only HANDOFF.md and mac-mini-jobs/,
# which the path test below would have skipped -- it never got to run, because
# Vercel's clone is shallow and/or VERCEL_GIT_PREVIOUS_SHA pointed at a commit
# that was not in it, so the guard bailed out "safely" straight into a build.
#
# Failing open here is the wrong trade. A missed deploy is cheap and already
# healed automatically: mac-mini-jobs/run-deploy-watch.sh compares the newest
# build-relevant commit against what is actually live and re-triggers with
# [deploy-retry]. A spurious deploy is not cheap and nothing heals it.
#
# So: try to deepen the clone to reach the base, and if that still fails, fall
# back to the head commit's own parent rather than building. The known cost of
# the HEAD^ fallback is the one the original comment worried about -- an app
# commit buried under a data commit earlier in the same push -- and that is
# precisely the case the deploy watcher exists to catch.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$BASE" ] && ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  git fetch --quiet --deepen=200 2>/dev/null || true
fi
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "vercel-ignore: base '${BASE:-unset}' unreachable; falling back to HEAD^"
  BASE="$SHA^"
fi
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "vercel-ignore: no usable base at all; skipping rather than building"
  exit 0
fi

# Paths that feed `next build`. Docs, workbooks, mac-mini-jobs, the rest of
# scripts/, and raw pipeline dirs never need a deploy on their own.
#
# public/data is EXCLUDED deliberately, and this is a correctness fix rather
# than a loosening. Every page that reads public/data does so at runtime via
# ISR from GitHub raw (lib/business.ts, lib/mlbSim.ts, lib/espnFetch.ts and the
# rest); the build-time copies are fallbacks that the runtime fetch supersedes.
# Every data commit in this repo already carries [vercel skip] and is already
# skipped by rule 1 above, so including public/data here never once caused a
# wanted build -- it only caused unwanted ones, by making a LATER commit's push
# range look build-relevant because a skipped data commit sat inside it. Rule 1
# and rule 4 disagreed about the same files; now they agree.
if git diff --quiet "$BASE" "$SHA" -- \
  app lib public ':(exclude)public/data' proxy.ts \
  next.config.ts postcss.config.mjs tsconfig.json \
  package.json package-lock.json .npmrc \
  vercel.json .vercelignore scripts/vercel-ignore.sh; then
  echo "vercel-ignore: no build-relevant change in $BASE..$SHA; skipping"
  exit 0
fi
echo "vercel-ignore: build-relevant change in $BASE..$SHA; building"
exit 1
