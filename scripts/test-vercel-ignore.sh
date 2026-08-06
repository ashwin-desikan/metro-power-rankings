#!/bin/sh
# Regression suite for scripts/vercel-ignore.sh, the ignored-build-step guard.
#
# WHY THIS EXISTS: on 2026-08-06 that guard let THIRTEEN production builds
# through in one day, against a 2/day budget, and a first attempt at fixing it
# nearly stopped legitimate builds instead. Both directions cost real money or
# real staleness, and neither was catchable by reading the script. So the guard
# now has tests, pinned to real commits in this repo's history.
#
# Run:  sh scripts/test-vercel-ignore.sh
# Exit: 0 all pass, 1 any fail.
#
# Adding a case: pick a REAL sha whose behaviour you can state confidently, and
# say in the label why that answer is right. Do not add a case you cannot
# justify from what the commit actually touched.

cd "$(dirname "$0")/.." || exit 9
pass=0; fail=0; missing=0

# Every case is pinned to a real sha, so a SHALLOW clone would find none of
# them and the suite would pass vacuously -- the worst kind of green. MIN_CASES
# guards that: if fewer than this many actually executed, the run is treated as
# a failure and tells you to deepen the fetch. CI must check out with
# fetch-depth: 0.
MIN_CASES=15

run() {  # run <expected SKIP|BUILD> <sha> <base|""> <why>
  want="$1"; sha="$2"; base="$3"; why="$4"
  if ! git cat-file -e "${sha}^{commit}" 2>/dev/null; then
    missing=$((missing+1))
    printf '  ----  %-5s %s  (not in this clone)\n' "$want" "$sha"; return
  fi
  VERCEL_GIT_COMMIT_SHA="$sha" VERCEL_GIT_PREVIOUS_SHA="$base" \
    VERCEL_GIT_COMMIT_REF=main sh scripts/vercel-ignore.sh >/dev/null 2>&1
  if [ $? -eq 0 ]; then got=SKIP; else got=BUILD; fi
  if [ "$got" = "$want" ]; then
    pass=$((pass+1)); printf '  ok    %-5s %s  %s\n' "$got" "$sha" "$why"
  else
    fail=$((fail+1)); printf '  FAIL  got=%-5s want=%-5s %s  %s\n' "$got" "$want" "$sha" "$why"
  fi
}

echo "rule 1 - the skip marker always wins"
run SKIP  f2764f7c0 00a9c26a8 "tagged docs commit"
run SKIP  098da634b 986f86ebe "tagged data commit"

echo
echo "the 2026-08-06 incident - untagged docs/plumbing must NOT build"
echo "(base deliberately unset/bogus: that is the condition that caused it)"
run SKIP  986f86ebe ""        "HANDOFF.md only"
run SKIP  986f86ebe d40e7042b "HANDOFF.md only, base resolvable"
run SKIP  7d67f51d7 ""        "jobs.toml only"
run SKIP  d40e7042b ""        "runner scripts + mac-mini-jobs"
run SKIP  e73f20ef1 ""        "dispatcher.py only"
run SKIP  16dbddd40 deadbeefdeadbeefdeadbeefdeadbeefdeadbeef "dispatcher.py, base bogus"
run SKIP  7cdc0c3ea ""        "HANDOFF.md only"
run SKIP  8af382f03 ""        "jobs.toml only"
run SKIP  52a2b9789 ""        "HANDOFF.md only"
run SKIP  76bb52202 ""        "HANDOFF.md only"
run SKIP  e78fd7683 ""        "jobs.toml only"
run SKIP  8436e9003 ""        "HANDOFF.md only"
run SKIP  cfe53bf48 ""        "HANDOFF.md only"
run SKIP  67a3be95c ""        "runners/_common.sh only"

echo
echo "REGRESSION GUARD - things that MUST still build"
echo "(an over-broad ignore rule is as expensive as a leaky one, just quieter)"
run BUILD e2801ca8b e2801ca8b^ "lib/espnFetch.ts ship"
run BUILD e2801ca8b ""         "same, with base unreachable"
run BUILD a277c4a35 a277c4a35^ "public/data/leaders - country pages bake it in at build time, see CLAUDE.md"

echo
echo "workflow-only and data-only changes need no build"
run SKIP  b4ea470c3 b4ea470c3^ ".github/workflows only"

echo
echo "editing the GUARD ITSELF must not cost a build (build #14 of 2026-08-06)"
echo "(it cannot change the built artifact; CI proves the guard instead)"
run SKIP  215a0a140 215a0a140^ "vercel-ignore.sh + hook only"
run SKIP  1c135d5bc 1c135d5bc^ "the merge that built: guard+hooks+CI+docs, zero site output"
run SKIP  1c135d5bc ""         "same merge, base unreachable"

echo
printf '%d passed, %d failed, %d commits not in this clone\n' "$pass" "$fail" "$missing"
[ "$fail" -eq 0 ] || exit 1
if [ $((pass)) -lt "$MIN_CASES" ]; then
  printf 'ONLY %d cases ran (need >= %d). This is a shallow clone, not a pass.\n' \
    "$pass" "$MIN_CASES" >&2
  printf 'Check out with fetch-depth: 0, or run this from a full clone.\n' >&2
  exit 1
fi
echo "vercel-ignore guard verified."
