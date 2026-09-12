#!/bin/bash
# Weekly team-ownership check (mini-owned, WEEKLY, APPLY-MODE). Transitioned
# from a Claude cloud scheduled task on 2026-09-12 at Ashwin's instruction:
# the cloud session lost push access to the repo (git proxy 403, 2026-09-12
# run had to fall back to a hand-applied patch), the mini's clone pushes
# non-interactively, and ntfy is reachable from here where the cloud sandbox
# blocks it. The cloud scheduled task stays DISABLED as a manual fallback,
# same role workflow_dispatch plays for migrated Actions. ONE runner per job.
#
# APPLY-MODE IS DELIBERATE and is not the daily-ops-sweep precedent drifting:
# Ashwin converted this specific task from proposal-only to apply on
# 2026-09-07, before the transition. It edits ONE curated file
# (scripts/data/team-owners-seed.json), is gated by the dataset's own
# self-test, build and watchlist checks, and never touches Supabase.
# A push from this job CAN spend a real Vercel build (owners data is read at
# build time), which is why the prompt counts today's paid builds first and
# falls back to a patch in ~/metro-mini-jobs/pending/ when the 2/day budget
# is already spent.
#
# Self-test gate before any live run (project convention).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR" "$HOME/metro-mini-jobs/pending"
LOG="$LOGDIR/owners-weekly-$DATE.log"
SUMMARY="$LOGDIR/owners-weekly-$DATE-summary.txt"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/metro-mini-jobs/config.env" ] && { set -a; source "$HOME/metro-mini-jobs/config.env"; set +a; }

cd "$REPO" || { log "ERROR: cannot cd to $REPO"; exit 1; }

# Concurrency lock, same reasoning as run-daily-ops-sweep.sh: a hand-launched
# test racing a dispatcher-fired occurrence shares one working tree.
LOCK="$HOME/metro-mini-jobs/owners-weekly.lock"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  log "another owners-weekly (pid $(cat "$LOCK")) is already running; exiting"
  exit 0
fi
echo $$ > "$LOCK"

log "=== Owners weekly start ($DATE) ==="
command -v claude >/dev/null || { log "ERROR: claude not on PATH"; exit 1; }

# The working tree is shared with every other mini job. Refuse to start dirty
# rather than committing someone else's half-finished state under this job's
# name (same posture as run-ops-autofix.sh).
if [ -n "$(git status --porcelain)" ]; then
  log "ERROR: working tree dirty; refusing to run. git status:"; git status --short | tee -a "$LOG"
  exit 1
fi

# Offline gate before the expensive half wakes.
python3 scripts/build-team-owners-data.py --self-test >>"$LOG" 2>&1 \
  || { log "ERROR: owners self-test failed; not launching Claude"; exit 1; }

PROMPT="Today's date is $DATE. You maintain the team-ownership dataset behind https://rankings.citizenofnowhere.org/sports/owners. You are running WEEKLY and UNATTENDED (headless claude -p) on the Mac mini, in the repo at $REPO. Check whether anything changed in major-league sports team ownership in the past week and APPLY confirmed changes (apply-mode was Ashwin's explicit choice, 2026-09-07). Never touch Supabase. Report via ntfy, never assume anyone reads your final message.

CRITICAL EXECUTION RULES: the moment your turn ends this process EXITS and cannot be resumed. Do the ENTIRE job in ONE continuous turn. Do not use the Task tool or subagents. This working tree is SHARED with other scheduled jobs: leave it CLEAN (pushed, or fully reset) before your turn ends, never with uncommitted changes or an unpushed local commit, because the next job's pull-rebase-push would carry a stray commit out under the wrong name.

STEP 0 -- sync and read. Run git pull --ff-only (abort and report if it fails). Read scripts/data/team-owners-seed.json (curated source of truth; rows with \"confidence\":\"contested\" are the live watchlist, each with pending_review_by and pending_when) and the deploy-discipline section of CLAUDE.md.

STEP 1 -- research, two passes. (a) WATCHLIST: for each contested row, WebSearch whether the deal RESOLVED (league vote passed, sale closed, deal collapsed) or materially moved. Real sources only: league releases, ESPN, Sportico, The Athletic, BBC, Forbes, AP, club statements. Resolution requires a reported league approval or completed closing; 'nears/agrees/expected' is movement. (b) SWEEP: search for NEW ownership news from the past 7-10 days the board does not carry, across Premier League and other top European football, NFL, NBA, MLB, NHL, MLS, WNBA, F1, and other leagues present in the seed. Compare every hit against the seed before acting.

STEP 2 -- apply. Edit scripts/data/team-owners-seed.json only for findings that are multi-source or primary-source; keep prose factual, attribute single-source claims in the note, never fabricate, no em dashes in prose. Control stays with the current owner until a league approval or closing is actually reported. Then run python3 scripts/build-team-owners-data.py --self-test, then the build, then python3 scripts/check-owners-watchlist.py; all must pass or do not commit (reset the tree and report the failure instead).

STEP 3 -- budget, then commit. lib/teamOwners.ts reads the owners JSON at BUILD time, so this commit needs a REAL Vercel build: no [vercel skip] in the subject, and a lib/releases.ts entry for the day in the SAME commit (newest first, one block per day, amend if the day exists; headline 4-8 words, max 4 bullets, one sentence each, under 220 chars, no script names or paths). BEFORE committing, count today's paid production builds: if VERCEL_TOKEN or VERCEL_BUILD_CAP_TOKEN is set in the environment, GET https://api.vercel.com/v6/deployments?projectId=prj_eGoUAOrnwvNP86s7p74ruILMl3Dr&teamId=team_yQjbuPwcr40J6AxkjCv6AawD&since=<UTC-midnight-ms> with that bearer token and count target=production deployments in states READY, ERROR, BUILDING, QUEUED or INITIALIZING (CANCELED is free). Do NOT count GitHub deployment_status events. If the count is 2 or more: do NOT commit; save the change as a patch (git diff > ~/metro-mini-jobs/pending/owners-$DATE.patch), git checkout the tree clean, and report NOT APPLIED citing the budget. If no token is available, say so in the report and proceed; scripts/vercel-ignore.sh enforces the cap server-side.

STEP 4 -- push. Commit with identity metro-mini[bot] <metro-mini-bot@users.noreply.github.com>. git pull --rebase then git push, so the owners commit is the HEAD of the push (GitHub judges only the push HEAD for deployment). On a push rejection from a concurrent push, pull --rebase and retry, at most 3 times; on any other failure, save the patch to ~/metro-mini-jobs/pending/, reset the tree clean, and report the failure.

STEP 5 -- report, ALWAYS, two sinks. First write a summary to $SUMMARY: if applied and pushed, start 'Owners weekly applied: X resolved, Y moved, Z new; 1 build spent', then one line per item (Team -> what changed, source outlet); if findings could not be pushed, the same prefixed 'NOT APPLIED' with the reason; if genuinely nothing changed, the single line 'owners weekly: no changes' (and in that case make no commit and spend no build). Then send it: [ -n \"\${NTFY_TOPIC:-}\" ] && curl -s -o /dev/null -H 'Title: Owners weekly -- $DATE' -H 'Tags: rotating_light' --data-binary @$SUMMARY https://ntfy.sh/\$NTFY_TOPIC -- one notification for the whole run. Your final message comes only AFTER $SUMMARY exists and the tree is clean."

CLAUDE_OUT="$(mktemp)"; trap 'rm -f "$CLAUDE_OUT" "$LOCK"' EXIT
run_claude(){ claude -p "$1" --dangerously-skip-permissions --output-format text --max-budget-usd 15 2>&1 | tee -a "$LOG" | tee "$CLAUDE_OUT"; }
auth_expired(){ grep -qiE 'Failed to authenticate|OAuth session expired|not logged in|Invalid API key' "$CLAUDE_OUT"; }

log "Launching Claude Code (headless)..."
run_claude "$PROMPT"
if auth_expired; then
  log "ERROR: Claude Code login expired on the mini -- run 'claude' and log in, then re-run."
  exit 1
fi

# Hard guarantee for the shared tree, whatever the run decided.
if [ -n "$(git status --porcelain)" ]; then
  log "ERROR: Claude left the tree dirty; saving and resetting."
  git diff > "$HOME/metro-mini-jobs/pending/owners-$DATE-recovered.patch" 2>>"$LOG"
  git checkout -- . 2>>"$LOG"; git clean -fd >>"$LOG" 2>&1
  exit 1
fi
[ -f "$SUMMARY" ] || { log "WARN: no summary written at $SUMMARY"; exit 1; }

log "=== Owners weekly done ==="
