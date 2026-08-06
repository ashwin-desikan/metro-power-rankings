#!/bin/sh
# Vercel ignored-build step. vercel.json points here because the inline
# ignoreCommand string has a 256-character schema cap (a bot PR tripped it
# on 2026-08-03; see HANDOFF).
#
# Exit 0 = SKIP the build, exit 1 = BUILD.
#
# Mixed failure posture, not uniformly fail-open. `git log` itself failing
# (corrupt ref, wrong SHA) still fails OPEN -> build, because that means
# something is wrong enough to want eyes on it regardless. An UNRESOLVABLE
# BASE for the path diff (step 4) fails CLOSED -> skip: 2026-08-06, failing
# open there cost thirteen real builds when Vercel's shallow clone couldn't
# reach VERCEL_GIT_PREVIOUS_SHA. A missed deploy from a wrongly-skipped build
# is cheap and self-heals (mac-mini-jobs/run-deploy-watch.sh re-triggers with
# [deploy-retry]); a spurious deploy is not cheap and nothing heals it. See
# that step's own comment for the reasoning in full.
#
# Decision order:
#   1. "[vercel skip]" on the SUBJECT LINE always skips - the house
#      convention; every data/docs/automation commit carries it there.
#   2. Non-main refs skip unless the commit opts in with "[preview]".
#   3. "[deploy-retry]" (mac-mini run-deploy-watch.sh re-triggers) always builds.
#   4. Otherwise, skip only when the WHOLE push range
#      (VERCEL_GIT_PREVIOUS_SHA..HEAD) touched no build-relevant path.
#      Diffing HEAD^..HEAD instead would miss an app commit buried under a
#      data commit in the same push - the exact gap the deploy watcher heals.
#
# All three tags are matched against SUBJECT (the first line) only, not the
# whole message. 2026-08-06: a commit body that merely DISCUSSED
# "[vercel skip]" in prose (explaining this exact mechanism) matched a
# whole-message substring check and silently skipped a build that touched
# this very script -- harmless that time by luck, not by design. Every real
# tag observed in this repo's history sits on the subject line, appended by
# hand or by a script's own `git commit -m "... [vercel skip]"`; none live
# in the body. Restricting the match there closes the false-positive without
# breaking anything real.

SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
MSG=$(git log -1 --pretty=%B "$SHA" 2>/dev/null) || exit 1
SUBJECT=$(printf '%s\n' "$MSG" | head -1)

case "$SUBJECT" in *"[vercel skip]"*) exit 0;; esac

if [ "${VERCEL_GIT_COMMIT_REF:-main}" != "main" ]; then
  case "$SUBJECT" in *"[preview]"*) exit 1;; *) exit 0;; esac
fi

case "$SUBJECT" in *"[deploy-retry]"*) exit 1;; esac

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

# Paths that feed `next build`, read from the single source of truth also
# used by .githooks/prepare-commit-msg (see that file's own comment for why
# this moved out of an inline list on 2026-08-06).
#
# public/data STAYS IN, and that is deliberate -- read from the shared list
# below, unmodified, no exclusion pathspec. I added one on this same file
# earlier today reasoning that the frontend ISR-reads public/data from GitHub
# raw; Windows caught that it's true of only a minority of it before either
# of us shipped it further. `lib/` and `app/` contain 313 `readFileSync` sites
# reading public/data AT BUILD TIME -- metros, every sport, every elections
# file, the football season hubs, state facts, the quiz -- and CLAUDE.md
# separately records that public/data/leaders/** must build because country
# pages bake it in. Excluding public/data would have silently stopped deploys
# for all of that. The ISR-backed files (business, mlb-sim, the espn
# snapshots, the football live bundles) are the exception, not the rule, and
# are already handled by rule 1, since their commits carry the marker.
# Narrowing this list would need a real audit of all 313 call sites first, not
# a plausible-sounding architectural assumption -- which is exactly what my
# version was, verified only against a synthetic test file, never against
# what the app actually reads at build time. Pinned regression case for this:
# scripts/test-vercel-ignore.sh, a real untagged public/data/leaders commit
# that must still build.
PATHS_FILE="$(dirname "$0")/vercel-build-paths.txt"
[ -f "$PATHS_FILE" ] || exit 1
BUILD_PATHS=$(grep -v '^#' "$PATHS_FILE" | grep -v '^[[:space:]]*$')

if git diff --quiet "$BASE" "$SHA" -- $BUILD_PATHS; then
  echo "vercel-ignore: no build-relevant change in $BASE..$SHA; skipping"
  exit 0
fi
echo "vercel-ignore: build-relevant change in $BASE..$SHA; building"
exit 1
