#!/bin/bash
# CompaniesMarketCap -> Supabase + /business weekly refresh (mini-owned, WEEKLY, Saturday).
#
# Runs the Supabase-only half of the Saturday mktcap ritual (refresh.py
# --write: fetch companiesmarketcap.com + CB Insights, merge, sanity-gate,
# write the weekly valuation snapshot, export out/mktcap_export.csv), THEN
# the two exports each explicitly document as belonging right after it in
# the Saturday flow -- build_business_data.py and build_sp500.py (both
# read-only against Supabase/Wikipedia, no Windows dependency) -- and
# commits public/data/business/*.json. Until 2026-08-17 this job stopped
# after the Supabase write, so /business kept showing whatever snapshot
# Ashwin's own manual run had last produced (stuck on 2026-08-08 while the
# mini's own weekly Supabase refreshes on 08-15/08-16 went unpublished --
# the export step existed and was self-tested, it was just never wired to
# anything that ran it). [vercel skip]: lib/business.ts reads these via
# GitHub-raw ISR first, build-time file as fallback, so a data-only commit
# surfaces with no deploy, same pattern as the season-sims/football bundles.
#
# Deliberately NOT run here: sync_city_lookup.py and compare_excel.py both
# need Excel workbooks that only exist on Ashwin's Windows machine (OneDrive
# paths, confirmed absent from this checkout 2026-08-08) -- those two stay
# part of Ashwin's own manual Saturday ritual. Running refresh.py before he's
# done that week's workbook update is safe, not wrong: unmapped new companies
# just queue as geo stubs (metro=null) for him to curate later, same as any
# other week -- "the pipeline NEVER guesses" per scripts/mktcap/README.md.
#
# Self-test gate before any live/network run (mirrors project discipline).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"; MKTCAP="$REPO/scripts/mktcap"; BIZ="$REPO/scripts/business"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/mktcap-refresh-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
# REVALIDATE_SECRET lives in config.env (the dispatcher-family jobs' file),
# not metro-supabase/env -- separate secret, separate file, by design.
[ -f "$HOME/metro-mini-jobs/config.env" ] && { set -a; source "$HOME/metro-mini-jobs/config.env"; set +a; }
SITE_ORIGIN="${SITE_ORIGIN:-https://rankings.citizenofnowhere.org}"
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] mktcap-refresh FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }
# Same shape as _common.sh's revalidate_ping (mac-mini-jobs/runners/): a
# 300s wait for GitHub raw's CDN TTL, then flush the ISR tag so /business
# shows this run's data within seconds instead of the 6h backstop. Warms
# the tabs itself afterward -- 2026-08-06 measured a real visitor eating a
# 67-minute-stale hit right after a confirmed-200 ping otherwise.
revalidate_business(){
  if [ -z "${REVALIDATE_SECRET:-}" ]; then
    log "REVALIDATE_SECRET not set; skipping (6h ISR backstop applies)."
    return 0
  fi
  log "Waiting out the GitHub raw CDN TTL before flushing..."
  sleep 300
  local attempt code
  for attempt in 1 2 3; do
    code="$(curl -s -o /tmp/mktcap-reval.out -w '%{http_code}' -X POST \
      -H "x-revalidate-secret: $REVALIDATE_SECRET" \
      "$SITE_ORIGIN/api/revalidate?tag=business-daily")" || code=000
    if [ "$code" = "200" ]; then
      log "$(cat /tmp/mktcap-reval.out)"
      log "Revalidated on attempt $attempt."
      for p in /business /business/companies /business/private /business/sp500; do
        code2="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_ORIGIN$p")" || code2=000
        log "warm $p -> HTTP $code2"
      done
      return 0
    fi
    log "revalidate ping attempt $attempt returned HTTP $code"
    sleep $((attempt * 5))
  done
  log "WARN: on-demand revalidation failed; /business refreshes via the 6h ISR window instead."
}

log "=== mktcap-refresh start ($DATE) ==="
[ -n "${SUPABASE_SERVICE_KEY:-}" ] || fail "SUPABASE_SERVICE_KEY not set (expected in ~/.config/metro-supabase/env)"
export MKTCAP_SUPABASE_KEY="$SUPABASE_SERVICE_KEY"

cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

cd "$MKTCAP" || fail "scripts/mktcap not found"
log "self-test"
"$PY" refresh.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "refresh.py --self-test failed"

log "refresh --write (fetch + merge + Supabase write + CSV export)"
"$PY" refresh.py --write 2>&1 | tee -a "$LOG"; rc="${PIPESTATUS[0]}"
if [ "$rc" -ne 0 ]; then
  fail "refresh.py --write failed (exit $rc) -- check the sanity gate: a >5% week-over-week source swing aborts before writing"
fi

# 2026-08-25 sunset plan item 1: commit out/mktcap_export.csv so MetroAreas.xlsx
# can Power Query it straight from GitHub raw, retiring the manual CMC workbook
# as the primary feed. out/ is gitignored (report.md, source_*.csv stay local/
# ephemeral) -- this is the one file force-added out of it. Path stays outside
# public/ on purpose so the [vercel skip] build guard also skips this commit.
EXPORT_CSV="$MKTCAP/out/mktcap_export.csv"
if [ -f "$EXPORT_CSV" ]; then
  if git diff --quiet -- "$EXPORT_CSV" 2>/dev/null && git ls-files --error-unmatch "$EXPORT_CSV" >/dev/null 2>&1; then
    log "mktcap_export.csv unchanged; nothing to commit"
  else
    git config user.name  "metro-mini[bot]"
    git config user.email "metro-mini-bot@users.noreply.github.com"
    git add -f "$EXPORT_CSV"
    git commit -m "mktcap: weekly export.csv refresh $DATE [vercel skip]" --quiet || fail "git commit (mktcap_export.csv) failed"
    git push origin HEAD:main --quiet || fail "git push (mktcap_export.csv) failed"
    log "committed + pushed mktcap_export.csv"
  fi
else
  log "WARN: $EXPORT_CSV not found after refresh.py --write; skipping export commit"
fi

# Surface anything Ashwin should look at, without treating it as a failure:
# new geo stubs to curate. "none" is the only clean value; anything else
# (including grep finding nothing, which would mean the line's shape changed)
# is worth a look, not a silent pass.
QUEUE_LINE="$(grep 'METRO QUEUE' "$LOG" | tail -1)"
case "$QUEUE_LINE" in
  *": none"*) : ;;
  *) push "mktcap-refresh: new companies to map -- $DATE" default warning "${QUEUE_LINE:-METRO QUEUE line not found in log}" ;;
esac

# Committed alongside the data, not just pushed to ntfy: the
# mktcap-weekly-metro-mapping-research cloud routine cannot reach ntfy.sh at
# all (its sandbox's egress proxy 403s the CONNECT -- confirmed 2026-08-22,
# both raw curl and WebFetch), so ntfy was never a channel it could actually
# read from, only Ashwin's own phone. This file is what the routine reads
# instead, via its git source. Always rewritten (never appended) -- a rolling
# "as of this run" snapshot, not a log; "none" is the clean, expected value.
{
  echo "# mktcap-refresh review queue -- $DATE"
  echo "# Overwritten every run. 'none' below means nothing needs review this week."
  if [ -n "$QUEUE_LINE" ]; then printf '%s\n' "$QUEUE_LINE"; else echo "none"; fi
} > "$REPO/mac-mini-jobs/mktcap-review-queue.md"

cd "$BIZ" || fail "scripts/business not found"
log "self-test: business data + sp500"
"$PY" build_business_data.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build_business_data.py --self-test failed"
"$PY" build_sp500.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build_sp500.py --self-test failed"

log "build_business_data.py (Supabase -> public/data/business/business.json)"
"$PY" build_business_data.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build_business_data.py failed"

log "build_sp500.py (Wikipedia + Supabase -> public/data/business/sp500.json)"
"$PY" build_sp500.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build_sp500.py failed"

cd "$REPO" || fail "repo not found: $REPO"
# build_business_data.py writes all three of business/companies/unicorns.json
# (see its json.dump calls); committing only business.json would leave the
# other two silently stale even though business.json looks fresh -- lib/
# business.ts's getCompanies()/getUnicorns() read companies.json/unicorns.json
# directly, they are not derived from business.json at request time.
BIZ_PATHS="public/data/business/business.json public/data/business/sp500.json public/data/business/companies.json public/data/business/unicorns.json mac-mini-jobs/mktcap-review-queue.md"
if git diff --quiet -- $BIZ_PATHS; then
  log "no /business data or review-queue change this run; nothing to commit"
else
  git config user.name  "metro-mini[bot]"
  git config user.email "metro-mini-bot@users.noreply.github.com"
  git add $BIZ_PATHS
  git commit -m "business: weekly mktcap snapshot $DATE [vercel skip]" --quiet || fail "git commit failed"
  git push origin HEAD:main --quiet || fail "git push failed"
  log "committed + pushed /business snapshot + review queue"
  revalidate_business
fi

# 2026-08-29 (evening): the metro pages' Top Companies section now refreshes
# from this run too. update_top_companies.py patches ONLY the marketCap block
# of public/data/details/*.json (plus meta.json companiesAsOf) straight from
# the CSV this run just exported — no Excel, mirrors extract.py's logic
# byte-for-byte. The commit below is deliberately UNTAGGED (no [vercel skip]):
# detail JSONs are read at build time (readFileSync), so this commit IS the
# weekly production build that surfaces the new numbers. One untagged push per
# Saturday, well inside the 2/day budget. Runs after the /business publish so
# a failure here never blocks that; fail() still alerts via ntfy.
cd "$MKTCAP" || fail "scripts/mktcap not found"
log "self-test: update_top_companies"
"$PY" update_top_companies.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "update_top_companies.py --self-test failed"

log "update_top_companies --write (CSV -> details marketCap + meta companiesAsOf)"
"$PY" update_top_companies.py --write 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "update_top_companies.py --write failed"

cd "$REPO" || fail "repo not found: $REPO"
TOPCO_PATHS="public/data/details public/data/meta.json"
if git diff --quiet -- $TOPCO_PATHS; then
  log "no Top Companies change this run; nothing to commit (no build triggered)"
else
  git config user.name  "metro-mini[bot]"
  git config user.email "metro-mini-bot@users.noreply.github.com"
  git add $TOPCO_PATHS
  git commit -m "mktcap: weekly Top Companies refresh $DATE" --quiet || fail "git commit (Top Companies) failed"
  git push origin HEAD:main --quiet || fail "git push (Top Companies) failed"
  log "committed + pushed Top Companies refresh (untagged on purpose — this is the weekly build)"
fi

log "=== mktcap-refresh done ==="
