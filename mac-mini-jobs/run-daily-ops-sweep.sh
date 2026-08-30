#!/bin/bash
# Daily proactive ops sweep (mini-owned, DAILY, REPORT-ONLY). Commissioned
# 2026-08-30 after Ashwin had to separately ask about several same-morning
# ntfy alerts (mlb-sim, newsletter-podcast, mktcap-refresh, then egress-
# refresh and [gap-watch] the next day) before any got investigated -- the
# standing complaint being that these only get looked at when he names the
# exact job, not proactively.
#
# This runs headless Claude Code once daily to do what that session did by
# hand: pull the full RUN/DONE/FAIL list from dispatcher.log for the trailing
# ~26h (not grep for keywords tied to whatever failed last time), read full
# context for every FAIL and every job-script push() alert (state-transition
# notices like [gap-watch] are not failures and dispatcher.log alone won't
# show them -- individual job logs need checking too), and actually
# investigate root cause rather than report the grep hit.
#
# DELIBERATELY REPORT-ONLY -- no fixes, no re-runs, no healthchecks pings,
# no writes to any data table or job state, not even mechanical ones. The
# report + one ntfy digest is the entire output. Ashwin reviews and decides
# what gets acted on, same as any other finding this session surfaced. This
# was a deliberate, explicit choice (2026-08-30) over a broader "safe
# autonomous fixes allowed" scope, made right after two build-triggering
# commits got pushed today without a heads-up first -- an unattended daily
# job writing to production on its own judgment is exactly that same
# category of risk, just recurring instead of one-off.
#
# Self-test gate before any live run (project convention).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/daily-ops-sweep-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
[ -f "$HOME/metro-mini-jobs/config.env" ] && { set -a; source "$HOME/metro-mini-jobs/config.env"; set +a; }

cd "$REPO" || { log "ERROR: cannot cd to $REPO"; exit 1; }

# Concurrency lock. Found the hard way on 2026-08-30's own first run: a
# hand-launched test overlapped the real dispatcher-fired occurrence (both
# "due" within the same catchup window), and the second instance ran the
# full headless investigation a second time with nothing to show for it --
# its git push lost the race non-fast-forward, and dispatcher.py killed it
# at the timeout before it could even get that far. dispatcher.py locks
# itself against re-entrant dispatcher ticks, but that does not cover a
# manually-launched copy of this script racing a dispatcher-launched one, so
# this script needs its own lock too.
LOCK="$HOME/metro-mini-jobs/daily-ops-sweep.lock"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  log "another daily-ops-sweep (pid $(cat "$LOCK")) is already running; exiting"
  exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log "=== Daily Ops Sweep start ($DATE) ==="
command -v claude >/dev/null || { log "ERROR: claude not on PATH"; exit 1; }

REPORT="$REPO/mac-mini-jobs/daily-ops-sweep-report.md"

PROMPT="Today's date is $DATE. You are running a DAILY, UNATTENDED, READ-ONLY ops sweep on the Mac mini for the Metro Area Project (Citizen of Nowhere). Ashwin should never have to ask you to look at an ntfy alert or a job failure -- that is the point of this job. Do the thorough investigation a careful engineer would do, not a keyword grep. INVESTIGATE AND REPORT ONLY -- you make NO writes of any kind this run: no git commits/pushes to anything except the one report file below, no re-running jobs, no healthchecks pings, no Supabase writes, no fixing anything, even something that looks completely mechanical and obviously safe. Every finding gets written up for Ashwin to act on himself.

CRITICAL EXECUTION RULES -- you are running headless (claude -p). The moment your turn ends, this process EXITS and CANNOT be resumed. Do the ENTIRE sweep in ONE continuous turn. Do not use the Task tool or delegate to subagents (no nested headless sessions). Your FINAL message must come only AFTER \$REPORT exists on disk with this run's findings.

STEP 1 -- Comprehensive dispatcher log review, not a keyword search:
Run: grep \"\$(date -u -v-26H +%Y-%m-%d)\\|\$(date -u +%Y-%m-%d)\" \$HOME/metro-mini-jobs/dispatcher.log | grep -E '(RUN|DONE|FAIL|MISSED)'
List EVERY job that ran in the trailing ~26 hours with its DONE/FAIL status. For every FAIL, read the full dispatcher.log context around it (not just the one-line summary) to understand what actually happened.

STEP 2 -- Individual job logs, because dispatcher.log only shows job-level exit code:
A job can exit 0 (DONE) while still pushing a real ntfy alert from inside the script for a state change worth knowing about (e.g. a [gap-watch] league-ready notice, a mktcap METRO QUEUE nudge, a business-daily new-geo-stub notice). Check \$HOME/metro-mini-jobs/logs/*-$DATE.log and ~/newsletter-podcast/logs/$DATE.log for anything that looks like it fired a push() this window, even inside a job that DONE'd clean.

STEP 3 -- Investigate root cause for everything found, don't just report the symptom:
- Check (read-only) if a same-day later run already self-healed it, by comparing against the next scheduled run of the same job in dispatcher.log -- if so, say so, no further write needed from Ashwin either.
- Cross-reference HANDOFF.md's recent entries and this project's memory for known, already-understood issues.
- For data-correctness questions (a scrape returned something that looks wrong), use WebSearch to check the actual current real-world fact before concluding anything is broken -- but this is still purely informational for the report; you do not act on it.
- For anything requiring a Supabase read to understand (e.g. checking whether a table already reflects a state), read-only SELECT queries are fine; never write.

STEP 4 -- Write \$REPORT (always rewritten, never appended -- a rolling as-of-this-run snapshot, same convention as mac-mini-jobs/mktcap-review-queue.md). Structure:
  # Daily Ops Sweep -- $DATE
  ## Jobs this window: N ok, N failed, N flagged
  ## Self-healed (informational only, no action needed)
  ## Needs Ashwin's attention
  (each item under 'Needs Ashwin's attention': what happened, root cause, evidence/sources, and the specific fix you'd recommend -- precise enough that he or a follow-up Claude session can execute it without re-investigating)
If genuinely nothing needs attention, say that plainly and keep the report short -- do not manufacture findings to look thorough.

STEP 5 -- Commit ONLY \$REPORT (git add/commit/push that one file, identity metro-mini[bot], message 'ops: daily sweep $DATE [vercel skip]' -- this path is outside public/ so it does not affect the build either way). Then push ONE consolidated ntfy notification: [ -n \"\${NTFY_TOPIC:-}\" ] && curl -s -o /dev/null -H \"Title: Daily Ops Sweep -- $DATE\" -H \"Priority: default\" -H \"Tags: mag\" -d \"<2-4 sentence summary: N jobs ok, what if anything needs Ashwin's attention, point to the report file for detail>\" \"https://ntfy.sh/\$NTFY_TOPIC\" -- ONE notification for the whole sweep, not one per item, so this doesn't become the noise problem it exists to fix.

Do the real work. Read actual log files. Query Supabase read-only when you need to verify something rather than assuming. Use WebSearch for anything you're not certain of. Match the investigation depth this session applied to mlb-sim/newsletter-podcast/mktcap-refresh/egress-refresh/gap-watch on 2026-08-29 and 2026-08-30 -- but unlike that session, you do not touch anything except the report file."

CLAUDE_OUT="$(mktemp)"; trap 'rm -f "$CLAUDE_OUT" "$LOCK"' EXIT
run_claude(){ claude -p "$1" --dangerously-skip-permissions --output-format text --max-budget-usd 10 2>&1 | tee -a "$LOG" | tee "$CLAUDE_OUT"; }
# Same guard as newsletter-podcast/run-daily.sh: an expired Claude Code login
# makes headless `claude -p` print this and write nothing. Detect and stop
# rather than burn the run on a retry that can't succeed.
auth_expired(){ grep -qiE 'Failed to authenticate|OAuth session expired|not logged in|Invalid API key' "$CLAUDE_OUT"; }

log "Launching Claude Code (headless)..."
run_claude "$PROMPT"
if auth_expired; then
  log "ERROR: Claude Code login expired on the mini -- run 'claude' on the mini and log in, then re-run."
  exit 1
fi
[ -f "$REPORT" ] || { log "WARN: report not written at $REPORT"; exit 1; }

log "=== Daily Ops Sweep done ==="
