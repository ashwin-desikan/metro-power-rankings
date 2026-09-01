#!/bin/bash
# api-football -> Supabase daily standings + continental fixtures, then export to committed
# JSON bundles the site reads via ISR (mini-owned).
# refresh.py writes football_standings/football_fixtures to Supabase; export_bundles.py then
# writes public/data/football/live-*.json and commits them with [vercel skip] (ISR from GitHub
# raw, so NO Vercel build -- vercel.json's ignoreCommand short-circuits on the [vercel skip] tag).
#
# Scheduled 4x/day at 05:00, 11:00, 17:00, 23:00 UTC by mac-mini-jobs/jobs.toml (dispatcher.py),
# which owns the schedule -- 05:00 after run-euro-comps at 04:00, to spread the api-football load.
#
# RESTORED 2026-08-06 (Ashwin's call): the old plist only ever reached the 05:00 UTC slot (its
# local 05:00+06:00 bracket, filtered by a guard that used to live here, could never reach 11:00/
# 17:00/23:00), so this header's documented cadence had never actually been delivered -- the site
# ran on 1x/day standings, not 4x. No internal hour guard now: it was a second, invisible schedule
# that a jobs.toml edit could be silently overridden by, the exact failure this migration exists
# to prevent. If 429s or quota warnings show up, step down jobs.toml's `times` to
# ["05:00", "17:00"] rather than reintroducing a guard here.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/football-standings-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] football-standings FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== football-standings start ($DATE) ==="
[ -n "${APISPORTS_KEY:-}" ]      || fail "APISPORTS_KEY not set (expected in ~/.config/metro-supabase/env)"
# Accept SUPABASE_SERVICE_KEY as well as SUPABASE_WRITE_KEY (refresh.py already falls
# back to it, and the mini standardises on SERVICE_KEY). See run-gap-league-watch.sh.
[ -n "${SUPABASE_WRITE_KEY:-}${SUPABASE_SERVICE_KEY:-}" ] || fail "no Supabase key set (SUPABASE_WRITE_KEY or SUPABASE_SERVICE_KEY expected in ~/.config/metro-supabase/env)"
cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

# self-test gate before any live/network run (mirrors project discipline)
"$PY" scripts/apifootball/refresh.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "refresh self-test failed"

log "running daily refresh (--write)"
# refresh.py exit codes: 0 = clean; 3 = data WRITTEN but one+ api teams don't map to the
# Lookup (UNMATCHED); other = real failure. An unmatched team is a curation TODO (add it to
# the Lookup workbook + sync_lookup.py) -- NOT a pipeline failure -- so on exit 3 we WARN
# (so it gets fixed) but continue, letting export+commit still ship fresh bundles. One
# obscure reserve side must not freeze the whole daily football refresh. Real failures (any
# other nonzero) still hard-fail.
"$PY" scripts/apifootball/refresh.py --write 2>&1 | tee -a "$LOG"; rc="${PIPESTATUS[0]}"
if [ "$rc" -eq 3 ]; then
  unmatched="$(grep 'UNMATCHED ALERT' -A6 "$LOG" | grep -E 'team_id' | sed 's/^\[football\][[:space:]]*//' | head -10)"
  push "football: unmatched team(s) -- add to Lookup" default warning "Daily refresh wrote all other data; these api teams need a Lookup entry (then run sync_lookup.py):
${unmatched:-see log}"
  log "  UNMATCHED (non-fatal): warned; continuing to export + commit so the site stays fresh"
elif [ "$rc" -ne 0 ]; then
  fail "refresh --write failed (rc=$rc)"
fi

# Export Supabase -> committed ISR bundles the site reads (no Vercel build; [vercel skip]).
log "exporting frontend bundles"
"$PY" scripts/apifootball/export_bundles.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "export_bundles failed"
"$PY" scripts/apifootball/refresh_supercups.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "supercups export failed"
"$PY" scripts/apifootball/refresh_domestic_cups.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "domestic cups export failed"
# Women's hub: bundle-direct (no Supabase), writes wlive-2026.json. Its WSL auto-watch
# swaps FA WSL to 2026-27 the day api-football publishes that table -- so it must run
# daily, not once. lib/wLive.ts ISR-reads the bundle from GitHub raw ([vercel skip]).
"$PY" scripts/apifootball/refresh_women.py --write 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "women's refresh failed"
# UEFA country + club coefficients (Kassiesa method5). Reads Supabase ONLY -- the
# football_fixtures/football_standings rows refresh.py wrote above -- and makes no
# api-football calls, so it is free to run on all four daily slots. It writes
# public/data/football/uefa-coefficients.json, which lib/uefaCoefficients.ts reads
# from GitHub raw via ISR, so the live five-year race refreshes with NO Vercel build.
# SOFT-FAIL on purpose (the refresh.py rc=3 precedent): a coefficient miss must never
# block the standings bundles, which are the most-read tables on the site. Flip the
# `|| { ... }` to `|| fail "..."` if you would rather it hard-fail.
"$PY" scripts/uefa/uefa_coefficients.py --self-test 2>&1 | tee -a "$LOG"
if [ "${PIPESTATUS[0]}" -eq 0 ]; then
  "$PY" scripts/uefa/uefa_coefficients.py --write 2>&1 | tee -a "$LOG"
  [ "${PIPESTATUS[0]}" -eq 0 ] || {
    log "  WARN: uefa coefficients --write failed; keeping the previous file"
    push "football: UEFA coefficients not refreshed" default warning "uefa_coefficients.py --write failed; standings bundles still shipped. See $LOG"
  }
else
  log "  WARN: uefa coefficients self-test failed; skipping the coefficient write"
  push "football: UEFA coefficient self-test FAILED" high warning "Scoring logic broke its own unit tests. Coefficients NOT refreshed. See $LOG"
fi

# Citizen of Nowhere club power ranking, in season. MUST run after the coefficient step: it
# reads uefa-coefficients.json for each club's live current-season coefficient. Supabase and
# local files only, no api-football calls. Soft-fail for the same reason as above.
"$PY" scripts/uefa/build_live_ranking.py --self-test 2>&1 | tee -a "$LOG"
if [ "${PIPESTATUS[0]}" -eq 0 ]; then
  "$PY" scripts/uefa/build_live_ranking.py --write 2>&1 | tee -a "$LOG"
  [ "${PIPESTATUS[0]}" -eq 0 ] || {
    log "  WARN: club power ranking --write failed; keeping the previous file"
    push "football: club power ranking not refreshed" default warning "build_live_ranking.py --write failed; standings bundles still shipped. See $LOG"
  }
else
  log "  WARN: club power ranking self-test failed; skipping the ranking write"
  push "football: power ranking self-test FAILED" high warning "Scoring logic broke its own unit tests. Ranking NOT refreshed. See $LOG"
fi

BUNDLES="public/data/football/live-standings-2026.json public/data/football/live-competitions-2026.json public/data/football/live-supercups-2026.json public/data/football/live-cups-2026.json public/data/football/wlive-2026.json public/data/football/uefa-coefficients.json public/data/football/live-ranking-2026-27.json"
if ! git diff --quiet -- $BUNDLES; then
  git add $BUNDLES
  git commit -q -m "football: refresh live bundles [vercel skip]" || fail "bundle commit failed"
  # Push with rebase-retry: another machine/job commonly lands a commit on main
  # between our start-of-run ff-merge and this push, rejecting it non-fast-forward.
  # A single push then hard-failed and cried wolf (2026-08-03). Rebase + retry instead.
  pushed=0
  for attempt in 1 2 3; do
    if git push -q origin main 2>/dev/null; then pushed=1; break; fi
    log "push rejected (attempt $attempt) — rebasing on origin/main and retrying"
    git pull --rebase --autostash -q origin main || fail "rebase after push-reject failed"
  done
  [ "$pushed" = 1 ] || fail "bundle push failed after 3 attempts"
  log "pushed updated football bundles"
else
  log "bundles unchanged"
fi
log "=== football-standings done ==="
