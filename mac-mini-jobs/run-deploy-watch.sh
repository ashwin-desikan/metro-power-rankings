#!/bin/bash
# Auto-heal CANCELED Vercel production builds; alert on FAILED ones. No workflow change.
#
# Vercel cancels an in-progress build when a newer commit is pushed. Because the
# ~19 data jobs push [vercel skip] commits all day, an app-code build can get
# canceled mid-flight and then silently never deploy (the newer HEAD is a data
# commit that skips). This watcher reconciles desired-vs-live every ~10 min:
#   - TARGET = newest origin/main commit Vercel would BUILD (touches app/lib/public
#     /config AND has no [vercel skip]).
#   - LIVE   = the commit production is actually serving (from /deployed).
#   - If TARGET isn't included in LIVE and has had time to build, re-trigger by
#     bumping lib/deploy-retry.ts and pushing (no [vercel skip]). Bounded + ntfy.
#
# Safe by design: it only re-triggers a commit that is STALE (older than a full
# build window) and not live, so it never cancels a legitimately in-flight build.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"
STATE="$HOME/metro-mini-jobs/.deploy-watch-state"
PROD_URL="${PROD_URL:-https://rankings.citizenofnowhere.org/deployed}"
STALE_MIN="${STALE_MIN:-20}"        # not-live builds older than this = canceled/failed
COOLDOWN_MIN="${COOLDOWN_MIN:-18}"  # after a re-trigger, wait this long before another
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
[ -f "$HOME/.config/metro-supabase/env" ] && source "$HOME/.config/metro-supabase/env"  # NTFY_TOPIC
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0
  curl -s -o /dev/null -H "Title: $1" -H "Tags: $2" -d "$3" "https://ntfy.sh/$NTFY_TOPIC" || true; }
cd "$REPO" || { echo "repo missing at $REPO"; exit 1; }

git fetch -q origin main || { echo "git fetch failed (transient) — next run"; exit 0; }

# TARGET: newest origin/main commit that Vercel's ignoreCommand would build.
#
# Read the path list from the same file the guard itself reads, at origin/main
# rather than from the working tree, so this always answers the question "what
# would Vercel build?" using Vercel's own current answer.
#
# This was a hardcoded copy until 2026-08-06 and had silently drifted: it was
# missing proxy.ts, .npmrc, vercel.json and .vercelignore. The failure mode is
# quiet and bad. A commit touching only proxy.ts (the /admin auth gate) WOULD be
# built by the guard, but this watcher would not count it as a TARGET, would
# pick an older commit instead, find that one live, and report "up to date"
# while the auth change sat undeployed. Two copies of one list is the same class
# of bug as the two divergent plists and the inert githooks.
PATHS_BLOB="$(git show origin/main:scripts/vercel-build-paths.txt 2>/dev/null || true)"
if [ -n "$PATHS_BLOB" ]; then
  IFS=$'\n' read -r -d '' -a BUILD_PATHS < <(
    printf '%s\n' "$PATHS_BLOB" | grep -v '^#' | grep -v '^[[:space:]]*$' && printf '\0'
  )
else
  # Fail loud rather than silently narrowing the list: a truncated list makes
  # this watcher under-report work and go quiet, which is worse than not running.
  echo "WARNING: could not read scripts/vercel-build-paths.txt from origin/main; skipping this run"
  exit 0
fi
[ "${#BUILD_PATHS[@]}" -ge 8 ] || {
  echo "WARNING: build-path list looks truncated (${#BUILD_PATHS[@]} entries); skipping this run"
  exit 0
}
TARGET=""; TARGET_SUBJ=""
while IFS=$'\x1f' read -r sha subj; do
  case "$subj" in *"[vercel skip]"*) continue;; esac
  TARGET="$sha"; TARGET_SUBJ="$subj"; break
done < <(git log -100 --format='%H%x1f%s' origin/main -- "${BUILD_PATHS[@]}")
[ -n "$TARGET" ] || { echo "no build-relevant commit in the last 100 — nothing to do"; exit 0; }

# Cache-bust: PROD_URL sits behind Cloudflare's HTML edge cache, and a stale
# cached sha here caused a duplicate re-trigger of a completed build (2026-08-03).
LIVE="$(curl -fsS --max-time 15 "${PROD_URL}?cb=$(date +%s)" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("sha") or "")' 2>/dev/null || true)"
[ -n "$LIVE" ] || { echo "could not read live sha from $PROD_URL — next run"; exit 0; }
git cat-file -e "${LIVE}^{commit}" 2>/dev/null || { echo "live sha ${LIVE:0:9} not in local history yet — next run"; exit 0; }

if git merge-base --is-ancestor "$TARGET" "$LIVE" 2>/dev/null; then
  echo "up to date: TARGET ${TARGET:0:9} is live (serving ${LIVE:0:9})"
  rm -f "$STATE" "$STATE.failed"; exit 0
fi

NOW=$(date +%s); TARGET_TS=$(git log -1 --format=%ct "$TARGET"); AGE_MIN=$(( (NOW - TARGET_TS) / 60 ))
if [ "$AGE_MIN" -lt "$STALE_MIN" ]; then
  echo "TARGET ${TARGET:0:9} not live but only ${AGE_MIN}m old (<${STALE_MIN}m) — a build is likely still running"
  exit 0
fi

# Deployment-state guard: before spending a build, ask GitHub what happened to
# TARGET's production deployment. Vercel posts one deployment per push HEAD
# and a status on it, and the status answers the question this watcher used
# to skip: WHY is TARGET not live?
#
#   success        -> the build finished; only the live check lagged (alias
#                     flip, edge cache). No re-trigger: it would duplicate a
#                     completed build (burned ~8 min on 2026-08-03).
#   failure/error  -> the build genuinely FAILED. No re-trigger: rebuilding
#                     the same code fails the same way, and each attempt is a
#                     production build against the 2/day budget. On 2026-09-06
#                     the api/og/compare function exceeded 250 MB, the watcher
#                     read "not live after 20 minutes" as CANCELED, retried it
#                     (attempt 1 also failed), and sent Ashwin a "re-triggered
#                     canceled build" ntfy that pointed him the wrong way.
#                     Alert loudly instead, with the commit and the build log.
#   none/unknown   -> no deployment reached GitHub (a skipped build posts
#                     nothing) or the API did not answer (404 under secondary
#                     rate limiting reads as "no deployments", see CLAUDE.md).
#                     Fall through to the retry path, which is the case this
#                     watcher was written for: a build canceled by a newer
#                     [vercel skip] push.
#
# Measured 2026-09-07 against the real API: b40726b7b and its retry 1291a3818
# both carry a single status `failure` ("Deployment has failed"); ebbdd66d6
# carries `success`; commits Vercel skipped carry no deployment at all. A
# build canceled mid-flight by a newer push was NOT observed in that sample,
# so that state is inferred to land in "none/unknown", not proven.
# Repo is public; unauthenticated API is fine at this rate.
DEPLOY_STATE="$(curl -fsS --max-time 15 \
  "https://api.github.com/repos/ashwin-desikan/metro-power-rankings/deployments?sha=$TARGET&environment=Production&per_page=5" \
  | python3 -c '
import sys, json, urllib.request
verdict = ""
try:
    deps = json.load(sys.stdin)
    states = []
    for d in (deps if isinstance(deps, list) else []):
        try:
            with urllib.request.urlopen(d.get("statuses_url", ""), timeout=15) as r:
                for s in json.load(r):
                    states.append((s.get("state") or "", (s.get("description") or "").lower()))
        except Exception:
            pass
    if any(st == "success" for st, _ in states):
        verdict = "success"
    elif any(st in ("failure", "error") and "cancel" not in desc for st, desc in states):
        verdict = "failed"
except Exception:
    pass
print(verdict)' 2>/dev/null || true)"
case "$DEPLOY_STATE" in
  success)
    echo "TARGET ${TARGET:0:9} already has a successful production deployment - live check lag, not a canceled build; no re-trigger"
    exit 0 ;;
  failed)
    echo "TARGET ${TARGET:0:9} BUILD FAILED on Vercel - not retrying (a retry would fail the same way and spend a build)"
    # Alert once per failed sha, not once per 10-minute tick.
    FAILED_MARK="$STATE.failed"
    if [ ! -f "$FAILED_MARK" ] || [ "$(cat "$FAILED_MARK" 2>/dev/null)" != "$TARGET" ]; then
      printf '%s\n' "$TARGET" > "$FAILED_MARK"
      push "[ALERT] Vercel build FAILED - deploy manually" rotating_light \
        "Build of ${TARGET:0:9} ($TARGET_SUBJ) FAILED. Not retried: the same code would fail again. Read the build log at https://vercel.com/ashwin-desikans-projects/metro-power-rankings/deployments, fix, push (the fix must be the push HEAD)."
    fi
    exit 0 ;;
esac

# Stale and not live => its build was canceled/failed. Re-trigger, guarded.
LAST_SHA=""; LAST_TS=0; ATTEMPTS=0
if [ -f "$STATE" ]; then
  LAST_SHA=$(sed -n 's/^sha=//p' "$STATE"); LAST_TS=$(sed -n 's/^ts=//p' "$STATE"); ATTEMPTS=$(sed -n 's/^attempts=//p' "$STATE")
fi
LAST_TS=${LAST_TS:-0}; ATTEMPTS=${ATTEMPTS:-0}

# A genuinely new app commit (not one of our own retries) resets the counter.
case "$TARGET_SUBJ" in
  *"[deploy-retry]"*) : ;;
  *) [ "$TARGET" != "$LAST_SHA" ] && ATTEMPTS=0 ;;
esac

if [ "$(( (NOW - LAST_TS) / 60 ))" -lt "$COOLDOWN_MIN" ]; then
  echo "re-triggered $(( (NOW - LAST_TS) / 60 ))m ago (<${COOLDOWN_MIN}m) — letting that build run"; exit 0
fi
if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
  echo "gave up after $ATTEMPTS attempts on ${TARGET:0:9}"
  push "[ALERT] Vercel auto-retry exhausted" rotating_light "Build of ${TARGET:0:9} ($TARGET_SUBJ) still not live after $ATTEMPTS retries. Deploy manually."
  exit 1
fi

git pull --rebase --autostash -q origin main || { echo "pull failed — next run"; exit 0; }
N=$(( ATTEMPTS + 1 ))
cat > lib/deploy-retry.ts <<EOF
// Bumped by mac-mini-jobs/run-deploy-watch.sh to re-trigger a Vercel build that a
// concurrent [vercel skip] data push canceled. NOT imported anywhere — it exists
// only so a re-trigger commit touches a build-relevant path (lib/) and Vercel's
// ignoreCommand rebuilds the latest code. See run-deploy-watch.sh.
export const DEPLOY_RETRY = "${TARGET:0:9}-$N";
EOF
git add lib/deploy-retry.ts
git commit -q -m "chore(deploy): re-trigger canceled build of ${TARGET:0:9} (attempt $N) [deploy-retry]"
for a in 1 2 3; do git push -q origin main 2>/dev/null && break; git pull --rebase --autostash -q origin main || true; done

printf 'sha=%s\nts=%s\nattempts=%s\n' "$TARGET" "$NOW" "$N" > "$STATE"
echo "re-triggered build of ${TARGET:0:9} (attempt $N)"
push "Vercel auto-retry" arrows_counterclockwise "Re-triggered canceled build of ${TARGET:0:9} ($TARGET_SUBJ), attempt $N."
