#!/bin/sh
# Layer 3 of the 2026-08-06 fix (see .githooks/prepare-commit-msg and
# scripts/vercel-ignore.sh for layers 1 and 2, and the incident itself).
#
# Retrospective audit: lists every commit in a range and flags any mismatch
# between "touches a build-relevant path" (scripts/vercel-build-paths.txt)
# and "tagged [vercel skip] on its subject line". Two directions, not equally
# bad:
#
#   WASTED   touches nothing build-relevant, but untagged -> a real build
#            fired for no reason. Wasteful, not incorrect. This was
#            2026-08-06's failure, 13 times in one session. High-confidence:
#            an untagged commit that provably touches nothing on the list
#            genuinely never needed a build.
#   MISSING  touches something build-relevant, but tagged -> POSSIBLY a real
#            deploy got silently skipped, POSSIBLY a correct, routine,
#            ISR-only data refresh. This script CANNOT tell those apart on
#            its own, and deliberately does not try to.
#
# Earlier versions of this file excluded public/ (and later just
# public/data) from MISSING, on the theory that the frontend always reads
# public/data at runtime via ISR from GitHub raw. That theory is WRONG for
# most of it: `app/` and `lib/` contain 313 `readFileSync` sites that bake
# public/data in at build time (see scripts/vercel-ignore.sh's own comment,
# and CLAUDE.md's deploy-discipline section, both corrected 2026-08-06 after
# shipping that exact wrong assumption once already). A static path list
# cannot distinguish the ISR-only minority (business, mlb-sim, ESPN
# snapshots, football bundles -- all correctly self-tagged by their own
# scripts) from the build-time majority (metros, sports, elections, the
# quiz) without doing the same 313-site audit by hand. Rather than encode a
# SECOND unverified guess about which paths are "obviously fine" -- the same
# mistake, just moved -- MISSING here lists every candidate and leaves the
# judgment to whoever reads it: an "Auto: refresh X [vercel skip]" subject
# from an established runner script is expected noise; anything else is
# worth a second look. scripts/test-vercel-ignore.sh, Windows's pinned
# regression suite, is the authoritative check for this specific question;
# this script is a spot-check net underneath it, not a replacement.
#
# Usage:
#   scripts/audit-vercel-tags.sh                 # today's commits on HEAD
#   scripts/audit-vercel-tags.sh <since>..<until> # any git revision range
#
# Exit 0 unless a WASTED case is found (high-confidence: no ambiguity about
# whether those needed a build). MISSING cases print but never fail the exit
# code, since a routine ISR-only skip is expected and correct.
# Meant to be run by hand at the start of a session, same as
# `dispatcher.py --check-sync` on the mini side -- a habit that has to be
# remembered is the same class of risk as a job that silently never runs,
# so treat a skipped audit the same way: worth noticing, not worth trusting
# to memory alone. That is what layers 1 and 2 are for; this is the net
# underneath both of them.

set -eu
cd "$(git rev-parse --show-toplevel)"

RANGE="${1:-}"
if [ -z "$RANGE" ]; then
  # Explicit Z suffix: git's --since is otherwise ambiguous about which
  # timezone a bare "YYYY-MM-DDTHH:MM:SS" means, and everything else in
  # this project (jobs.toml, dispatcher.py) treats all times as UTC.
  SINCE=$(date -u +%Y-%m-%dT00:00:00Z)
  RANGE="today (since $SINCE)"
  REVLIST_ARGS="--since=$SINCE HEAD"
else
  REVLIST_ARGS="$RANGE"
fi

PATHS_FILE="scripts/vercel-build-paths.txt"
[ -f "$PATHS_FILE" ] || { echo "missing $PATHS_FILE" >&2; exit 1; }
BUILD_PATHS=$(grep -v '^#' "$PATHS_FILE" | grep -v '^[[:space:]]*$')

COMMITS=$(git rev-list $REVLIST_ARGS)
[ -n "$COMMITS" ] || { echo "no commits in range"; exit 0; }

WASTED=0
MISSING=0
TOTAL=0

for sha in $COMMITS; do
  TOTAL=$((TOTAL + 1))
  SUBJECT=$(git log -1 --pretty=%s "$sha")
  TAGGED=0
  case "$SUBJECT" in *"[vercel skip]"*) TAGGED=1;; esac

  if git rev-parse -q --verify "$sha^" >/dev/null 2>&1; then
    TOUCHES_BUILD=0
    git diff --quiet "$sha^" "$sha" -- $BUILD_PATHS 2>/dev/null || TOUCHES_BUILD=1
  else
    TOUCHES_BUILD=1   # root commit: fail toward "flag it", not toward "trust it"
  fi

  if [ "$TOUCHES_BUILD" = 0 ] && [ "$TAGGED" = 0 ]; then
    WASTED=$((WASTED + 1))
    echo "WASTED   $sha  $SUBJECT"
  elif [ "$TOUCHES_BUILD" = 1 ] && [ "$TAGGED" = 1 ]; then
    MISSING=$((MISSING + 1))
    echo "MISSING  $sha  $SUBJECT  (verify by hand -- may be a routine ISR-only skip)"
  fi
done

echo
echo "$TOTAL commits checked ($RANGE): $WASTED wasted-build (high confidence)," \
     "$MISSING touched-build-and-tagged (needs a human/AI glance, not automatically wrong)"
[ "$WASTED" = 0 ]
