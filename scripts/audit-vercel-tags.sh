#!/bin/sh
# Layer 3 of the 2026-08-06 fix (see .githooks/prepare-commit-msg and
# scripts/vercel-ignore.sh for layers 1 and 2, and the incident itself).
#
# Retrospective audit: lists every commit in a range and flags any mismatch
# between "touches a build-relevant path" and "tagged [vercel skip] on its
# subject line". Two mismatch directions, reported separately because they
# are not equally bad, and checked against two DIFFERENT path lists:
#
#   WASTED   touches nothing in vercel-build-paths.txt (includes public/),
#            but untagged -> a real build fired for no reason. Wasteful,
#            not incorrect. This was 2026-08-06's failure, 13 times in one
#            session.
#   MISSING  touches CODE (that list minus public/), but tagged -> a real
#            deploy got silently skipped. Worse: the site can go stale and
#            nothing alerts, the same class of silent failure jobs.toml
#            drift was.
#
# public/ is deliberately EXCLUDED from the MISSING check, not just down-
# weighted. Every genuine data-refresh commit in this repo's history writes
# to public/data/*.json and correctly carries the tag BY DESIGN -- the whole
# ISR-from-GitHub-raw architecture is built on the live site never reading
# its own bundled public/ copy for that data, only the committed JSON via
# raw.githubusercontent.com. Checking public/ against MISSING the same way
# as app/ or lib/ produced 15 false alarms out of 34 real commits on this
# script's first real run (2026-08-06) -- every single one a routine,
# correct data refresh, not a bug. Real code that would actually break if
# silently skipped lives in app/, lib/, and the config paths; that is what
# MISSING is for.
#
# Usage:
#   scripts/audit-vercel-tags.sh                 # today's commits on HEAD
#   scripts/audit-vercel-tags.sh <since>..<until> # any git revision range
#
# Exit 0 if every commit in range is consistent, 1 if anything is flagged.
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
CODE_PATHS=$(printf '%s\n' "$BUILD_PATHS" | grep -vx 'public')

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
    TOUCHES_CODE=0
    git diff --quiet "$sha^" "$sha" -- $CODE_PATHS 2>/dev/null || TOUCHES_CODE=1
  else
    TOUCHES_BUILD=1   # root commit: fail toward "flag it", not toward "trust it"
    TOUCHES_CODE=1
  fi

  if [ "$TOUCHES_BUILD" = 0 ] && [ "$TAGGED" = 0 ]; then
    WASTED=$((WASTED + 1))
    echo "WASTED   $sha  $SUBJECT"
  elif [ "$TOUCHES_CODE" = 1 ] && [ "$TAGGED" = 1 ]; then
    MISSING=$((MISSING + 1))
    echo "MISSING  $sha  $SUBJECT"
  fi
done

echo
echo "$TOTAL commits checked ($RANGE): $WASTED wasted-build, $MISSING missing-deploy"
[ "$WASTED" = 0 ] && [ "$MISSING" = 0 ]
