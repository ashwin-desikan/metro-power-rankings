#!/bin/bash
# WC2026 daily sim refresh (mini-owned; replaces the wc2026-daily.yml Action).
# fetch results (api-sports primary, ESPN fallback) -> refresh Polymarket odds ->
# build simulation -> patch bracket -> commit [vercel skip].
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"; SC="$REPO/scripts"
INTL="$REPO/public/data/international"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/wc2026-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] WC2026 sim FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== WC2026 daily start ($DATE, DRY_RUN=$DRY_RUN) ==="
cd "$REPO" || fail "repo not found"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged)"

# 1. results: api-sports primary, ESPN fallback
ok=0
if [ -n "${APISPORTS_KEY:-}" ]; then
  if curl -sf -H "x-apisports-key: $APISPORTS_KEY" \
       "https://v3.football.api-sports.io/fixtures?league=1&season=2026" -o /tmp/apisports.json \
     && "$PY" "$SC/parse-apisports-wc2026.py" /tmp/apisports.json >>"$LOG" 2>&1; then
    ok=1; log "results: api-sports"
  else
    log "api-sports failed; falling back to ESPN"
  fi
else
  log "APISPORTS_KEY not set; using ESPN"
fi
if [ "$ok" -ne 1 ]; then
  CACHE="$SC/.cache"; mkdir -p "$CACHE"; rm -f "$CACHE"/espn-*.json
  d=20260611; end=$(date -u +%Y%m%d); [ "$end" -gt 20260719 ] && end=20260719
  while [ "$d" -le "$end" ]; do
    curl -sf "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=$d" -o "$CACHE/espn-$d.json" || true
    d=$(date -u -j -v+1d -f "%Y%m%d" "$d" +%Y%m%d)   # BSD date (macOS): +1 day
  done
  "$PY" "$SC/parse-espn-wc2026.py" "$CACHE"/espn-*.json >>"$LOG" 2>&1 || fail "ESPN parse failed (both sources down)"
  log "results: ESPN fallback"
fi

# 2. refresh Polymarket odds (de-vig into wc2026-odds.json), right before the sim
if curl -fsS "https://gamma-api.polymarket.com/events?closed=false&limit=40&order=volume&ascending=false&tag=World%20Cup" -o /tmp/polymarket-wc.json; then
  ODDS_OUT="$("$PY" "$SC/refresh-wc2026-odds.py" /tmp/polymarket-wc.json 2>&1)"; rc=$?
  echo "$ODDS_OUT" | tee -a "$LOG"
  if [ $rc -ne 0 ]; then log "WARN: odds refresh non-zero (guard tripped?) — keeping prior wc2026-odds.json"; fi
  UNMAPPED="$(echo "$ODDS_OUT" | grep -i 'UNMAPPED' || true)"
  [ -n "$UNMAPPED" ] && push "WC odds: UNMAPPED teams -- $DATE" default warning "$UNMAPPED"
else
  log "WARN: Polymarket fetch failed — keeping prior odds"
fi

# 3. build sim, 4. patch bracket
log "building simulation"
"$PY" "$SC/build-wc2026-simulation.py" >>"$LOG" 2>&1 || fail "build-wc2026-simulation failed"
log "patching bracket"
"$PY" "$SC/patch-wc2026-bracket.py" >>"$LOG" 2>&1 || fail "patch-wc2026-bracket failed"

# 5. commit
FILES="public/data/international/wc2026-results.json public/data/international/wc2026-sim.json public/data/international/wc2026.json public/data/international/wc2026-odds.json"
if git diff --quiet -- $FILES; then
  log "no WC change this run"
elif [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN=1: WC changed — NOT committing. Diff stat:"; git --no-pager diff --stat -- $FILES | tee -a "$LOG"; git checkout -- $FILES
else
  git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
  git add $FILES
  git commit -m "wc2026: daily sim + live odds refresh [vercel skip]" --quiet || fail "git commit failed"
  git push origin HEAD:main || fail "git push failed"
  log "committed + pushed WC data"
fi
log "=== WC2026 daily done ==="
