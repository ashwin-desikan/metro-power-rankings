#!/bin/bash
# run-scraper-refresh.sh <conflicts|fiba|rugby|substack>
# Mini-side owner for the egress-sensitive scraper refreshes migrated off GitHub
# Actions (conflicts-refresh / fiba-ranking / rugby-rankings / daily-rebuild).
# Each job: fast-forward to origin, run the SAME fetch+build the Action ran, and
# if the scoped path changed, commit [vercel skip] + push. The site ISR-reads it,
# so NO Vercel build fires. A quiet run makes no diff and no commit.
#
# IMPORTANT: once a job is enabled here, DISABLE the matching GitHub Actions
# schedule or you get duplicate commits racing (same rule as the civic refresh).
# Deps on the mini: the repo .venv (requests, beautifulsoup4, openpyxl). The
# 'substack' job additionally needs Node 20 on PATH; if Node is absent, leave
# daily-rebuild on Actions and skip installing the substack plist.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
JOB="${1:?usage: run-scraper-refresh.sh <conflicts|fiba|rugby|substack>}"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/scraper-$JOB-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] scraper $JOB FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== scraper $JOB start ($DATE, DRY_RUN=$DRY_RUN) ==="
cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

case "$JOB" in
  conflicts)
    "$PY" scripts/conflicts/fetch-conflicts.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "fetch-conflicts failed"
    "$PY" scripts/conflicts/build-conflicts.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build-conflicts failed"
    ADD=( public/data/conflicts.json public/data/conflicts_raw.json )
    MSG="data: monthly interstate-wars refresh [vercel skip]" ;;
  fiba)
    "$PY" scripts/basketball/fetch_fiba_ranking.py scripts/basketball/fiba_ranking.json 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "fetch_fiba_ranking failed"
    "$PY" scripts/basketball/build_intl_basketball.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build_intl_basketball failed"
    ADD=( public/data/basketball scripts/basketball/fiba_ranking.json )
    MSG="Auto: refresh FIBA World Ranking [vercel skip]" ;;
  rugby)
    "$PY" scripts/rugby/fetch_wru_rankings.py scripts/rugby/wrurankings.txt 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "fetch_wru_rankings failed"
    "$PY" scripts/rugby/build_rugby_union_data.py OtherLeagues.xlsx scripts/rugby/wrurankings.txt public/data/rugby-union 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build_rugby_union_data failed"
    ADD=( public/data/rugby-union scripts/rugby/wrurankings.txt )
    MSG="Auto: refresh World Rugby rankings [vercel skip]" ;;
  substack)
    node scripts/refresh-substack-feed.mjs 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "refresh-substack-feed failed"
    ADD=( public/data/substack-feed.json )
    MSG="chore(substack): refresh feed snapshot [vercel skip]" ;;
  *) fail "unknown job: $JOB (expected conflicts|fiba|rugby|substack)" ;;
esac

if git diff --quiet -- "${ADD[@]}"; then
  log "no change for $JOB this run; nothing to commit"
else
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY_RUN=1: $JOB changed -- diff summary (NOT committing):"
    git --no-pager diff --stat -- "${ADD[@]}" | tee -a "$LOG"
    git checkout -- "${ADD[@]}"
  else
    git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
    git add "${ADD[@]}"
    git commit -m "$MSG" --quiet || fail "git commit failed"
    git push origin HEAD:main || fail "git push failed"
    log "committed + pushed $JOB"
  fi
fi
log "=== scraper $JOB done ==="
