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
#   3. "[deploy-now]" always builds, past the same-day cap.
#   3b. The same-day cap: at MAX_DAILY_BUILDS (2) paid production builds
#      today, skip, whatever the commit touched. Counted from the Vercel API;
#      inactive without VERCEL_BUILD_CAP_TOKEN. Added 2026-09-09.
#   3c. "[deploy-retry]" (mac-mini run-deploy-watch.sh re-triggers) builds,
#      but not past the cap.
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

# --- same-day production build cap. -------------------------------------
# 2026-09-06, the FIFTH overage invoice ($105.77). The guard above was
# verified correct against build logs; the money was 190 untagged app commits
# in 30 days, 85% pushed by hand, in evening bursts far past the 2/day budget
# that four memory files had already restated. A rule that lives in a memory
# file holds for a few weeks. A rule that runs inside Vercel's own build step
# holds for whoever pushed, from whatever machine, whether or not they read
# anything. So the budget is enforced HERE.
#
# What is counted: today's (UTC) production deployments of this project that
# actually consumed build minutes -- READY, ERROR, BUILDING, QUEUED,
# INITIALIZING -- excluding this deployment itself. CANCELED and skipped are
# free and are not counted, which is also why this cannot be estimated from
# git alone: a push of ten stacked app commits is ONE build, and a commit
# count would have blocked the day's only real deploy.
#
# The count comes from the Vercel API and needs a read token in the project's
# build env as VERCEL_BUILD_CAP_TOKEN. Without it the cap is INACTIVE and the
# guard behaves exactly as before, saying so in the log, so shipping this file
# ahead of the token is safe. MAX_DAILY_BUILDS (default 2) is the ceiling.
#
# Override: "[deploy-now]" on the SUBJECT line always builds, the third
# same-day deploy you genuinely want. It is the only tag that beats the cap:
# "[deploy-retry]" (the mini's deploy watcher) does NOT, or the watcher would
# spend the very builds the cap saved re-triggering the commits it skipped.
# A capped commit is healed by that same watcher on the next UTC day, when
# its retry once again reads under the ceiling.
case "$SUBJECT" in *"[deploy-now]"*)
  echo "vercel-ignore: [deploy-now] on the subject; building past any cap"; exit 1;;
esac
if [ -n "${VERCEL_IGNORE_TEST_SUBJECT:-}" ]; then
  # test hook (scripts/test-vercel-ignore.sh only): prove the override path
  # without a real commit carrying the tag
  case "$VERCEL_IGNORE_TEST_SUBJECT" in *"[deploy-now]"*) exit 1;; esac
fi
MAX_DAILY_BUILDS="${MAX_DAILY_BUILDS:-2}"
CAP_PROJECT="prj_eGoUAOrnwvNP86s7p74ruILMl3Dr"
CAP_TEAM="team_yQjbuPwcr40J6AxkjCv6AawD"
builds_today() {
  # prints the number of paid production deployments created today (UTC),
  # not counting this one; prints nothing when the count is unavailable
  if [ -n "${VERCEL_BUILD_CAP_MOCK_COUNT:-}" ]; then
    printf '%s\n' "$VERCEL_BUILD_CAP_MOCK_COUNT"; return 0   # test hook
  fi
  [ -n "${VERCEL_BUILD_CAP_TOKEN:-}" ] || return 0
  NOW=$(date -u +%s); MID=$((NOW - NOW % 86400))
  URL="https://api.vercel.com/v6/deployments?projectId=$CAP_PROJECT&teamId=$CAP_TEAM&target=production&limit=100&since=${MID}000"
  JSON=$(curl -sS -m 20 -H "Authorization: Bearer $VERCEL_BUILD_CAP_TOKEN" "$URL" 2>/dev/null) || return 0
  printf '%s' "$JSON" | SELF="${VERCEL_DEPLOYMENT_ID:-}" node -e '
    let d; try { d = JSON.parse(require("fs").readFileSync(0, "utf8")); } catch (e) { process.exit(0); }
    const paid = new Set(["READY", "ERROR", "BUILDING", "QUEUED", "INITIALIZING"]);
    const self = process.env.SELF || "";
    const n = (d.deployments || []).filter(x => paid.has(x.state) && x.uid !== self && x.id !== self).length;
    process.stdout.write(String(n));
  '
}
COUNT=$(builds_today)
case "$COUNT" in
  "")  echo "vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)";;
  *[!0-9]*) echo "vercel-ignore: build cap count unreadable ('$COUNT'); cap not applied";;
  *)
    if [ "$COUNT" -ge "$MAX_DAILY_BUILDS" ]; then
      echo "vercel-ignore: $COUNT paid production build(s) already today (cap $MAX_DAILY_BUILDS); skipping. Add [deploy-now] to the subject to build anyway."
      exit 0
    fi
    echo "vercel-ignore: $COUNT paid production build(s) so far today (cap $MAX_DAILY_BUILDS)";;
esac

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
