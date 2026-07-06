#!/bin/bash
# F1 sync — round-gated poller (runs hourly via launchd; wrapped by hc-run.sh so
# every run pings the "f1-weekly" healthchecks check = poller-alive signal).
# Logic: fetch Jolpica's last race; compare its round to the max stored round for
# that season in Supabase.
#   delta <= 0  -> IDLE (already synced)   exit 0
#   delta == 1  -> SYNC the new race        exit 0 on success
#   delta  > 1  -> GAP: ntfy for manual full-season catch-up, do NOT half-sync   exit 1
# So results land within ~1h of Jolpica publishing them, and a missed race
# self-catches-up whenever the mini is back online. Mini owns public/data/f1/data.json.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
F1DIR="$HOME/Projects/F1 Data"; INCOMING="$F1DIR/data/_incoming"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"; SC="$REPO/scripts"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/f1-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
export F1_SUPABASE=1
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] F1 sync FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }
[ -n "${SUPABASE_SERVICE_KEY:-}" ] || fail "SUPABASE_SERVICE_KEY not set"

# 1. fetch just the last-race results and decide
mkdir -p "$INCOMING"; rm -f "$INCOMING"/*.json
curl -fsSL "https://api.jolpi.ca/ergast/f1/current/last/results.json" -o "$INCOMING/results.json" || fail "jolpica fetch failed"
DECISION="$("$PY" - "$INCOMING/results.json" <<'PYEOF'
import sys, json, os
from supabase import create_client
try:
    races=json.load(open(sys.argv[1]))["MRData"]["RaceTable"]["Races"]
    if not races: print("IDLE 0 0 none"); sys.exit()
    season=int(races[0]["season"]); rnd=int(races[0]["round"]); name=races[0]["raceName"]
    sb=create_client(os.environ["SUPABASE_URL"],os.environ["SUPABASE_SERVICE_KEY"])
    rows=sb.table("f1_results").select("round").eq("season",season).execute().data
    stored=max((int(x["round"]) for x in rows), default=0)
    d=rnd-stored
    kind="IDLE" if d<=0 else "SYNC" if d==1 else "GAP"
    print(f"{kind} {season} {rnd} {stored} {name}")
except Exception as e:
    print(f"ERR 0 0 0 {e}")
PYEOF
)"
kind=$(echo "$DECISION" | awk '{print $1}')
season=$(echo "$DECISION" | awk '{print $2}'); jrnd=$(echo "$DECISION" | awk '{print $3}'); stored=$(echo "$DECISION" | awk '{print $4}')
racename=$(echo "$DECISION" | cut -d' ' -f5-)

case "$kind" in
  IDLE) log "idle: $season R$jrnd already synced (stored R$stored)."; rm -f "$INCOMING"/*.json; exit 0 ;;
  ERR)  fail "round check failed: $racename" ;;
  GAP)  rm -f "$INCOMING"/*.json
        push "F1: manual catch-up needed -- $DATE" urgent rotating_light "Jolpica is at $season R$jrnd but Supabase has only R$stored (gap > 1). Not auto-syncing — run a full-season catch-up by hand."
        fail "round gap: Jolpica R$jrnd vs stored R$stored" ;;
esac

# 2. SYNC: new race ($season R$jrnd, "$racename")
log "=== F1 sync: new race $season R$jrnd ($racename) ==="
cd "$REPO" || fail "repo not found"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward"
BASE="https://api.jolpi.ca/ergast/f1"
fetch(){ curl -fsSL "$BASE/$2" -o "$INCOMING/$1" || fail "fetch $1 failed"; "$PY" -c "import json;json.load(open('$INCOMING/$1'))" 2>/dev/null || fail "$1 not JSON"; }
fetch qualifying.json           current/last/qualifying.json
fetch sprint.json               current/last/sprint.json
fetch driverStandings.json      current/driverStandings.json
fetch constructorStandings.json current/constructorStandings.json

cd "$F1DIR"
log "merging into Supabase (f1_update.py)"
"$PY" f1_update.py 2>&1 | tee -a "$LOG" || fail "f1_update failed"
log "rebuilding data.json"
"$PY" "$SC/build-f1-data.py" 2>&1 | tee -a "$LOG" || fail "build-f1-data failed"
rm -f "$INCOMING"/*.json

DJ="$REPO/public/data/f1/data.json"; [ -f "$DJ" ] || fail "data.json not produced"
new_size=$(stat -f%z "$DJ"); old_size=$(git -C "$REPO" show HEAD:public/data/f1/data.json 2>/dev/null | wc -c | tr -d ' ')
if [ "${old_size:-0}" -gt 0 ] && [ "$new_size" -lt $(( old_size / 2 )) ]; then
  git -C "$REPO" checkout -- public/data/f1/data.json; fail "sanity gate: data.json $new_size < 50% of $old_size — refusing"
fi
cd "$REPO"
if [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN=1: not committing."; git --no-pager diff --stat -- public/data/f1/data.json | tee -a "$LOG"; git checkout -- public/data/f1/data.json
else
  git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
  git add public/data/f1/data.json
  git commit -m "data: f1 sync — $season R$jrnd $racename [vercel skip]" --quiet || fail "git commit failed"
  git push origin HEAD:main || fail "git push failed"
  push "F1 synced -- $DATE" default checkered_flag "$season R$jrnd $racename is live."
  log "committed + pushed."
fi
log "=== F1 sync done ==="
