#!/bin/bash
# OPS AUTOFIX (tiered) -- a fixed whitelist of mechanical remedies. No LLM.
#
# Commissioned by Ashwin 2026-09-10, after his 2026-08-30 ruling that
# daily-ops-sweep must never re-run jobs or write to any table ("an unattended
# daily job acting on its own judgment against production is the same risk
# category, just recurring"). The distinction that makes this compatible with
# that ruling rather than a reversal of it: THIS EXERCISES NO JUDGEMENT. Every
# action below is a fixed response to a fixed machine-detected condition, and
# each is idempotent, bounded and reversible. Nothing here decides anything.
#
# It pairs with detect_issues.py, which reconciles ACTUAL state against intended
# state -- deliberately NOT reading the ntfy topic or the alert mailbox. Of the
# six real faults on 2026-09-10, three sent no notification at all and the two
# most damaging exited 0, so a notification-driven fixer would have caught none
# of them. See that file's header.
#
# THE WHITELIST, in full. If a finding is not in this list, it is REPORTED and
# nothing is done:
#
#   deploy_drift   Copy/symlink repo -> live dispatcher dir. Purely mechanical:
#                  the repo is already the source of truth (--check-sync treats
#                  it as canonical), so this only performs the deployment step
#                  someone forgot. NEVER deletes anything from the live dir.
#                  This is the fault that left economy-rates and economy-housing
#                  never once run, reported in writing on 09-09 and unactioned.
#   job_failed     Re-run the job once, through hc-run.sh exactly as the
#                  dispatcher would, then --mark-ok if it succeeded. The mini's
#                  jobs are built to be re-run: they self-test before acting and
#                  no-op when there is nothing to do.
#   action_failed  `gh run rerun` the failed run. Bounded by the attempt cap.
#
# EXPLICITLY NOT IN THE WHITELIST, and why:
#   working_tree_dirty      HARD STOP for the whole script. Never act around a
#                           human's uncommitted work.
#   check_down              A down tile means a job did not run AT ALL, which is
#                           usually launchd or the mini being off -- not
#                           something a script can fix, and re-running blind
#                           would paper over the real cause.
#   anything data-shaped    Never. On 2026-09-10 two faults (a FIBA slug mapping
#                           and a WNBA conference tie) would have silently
#                           corrupted the board if guessed at. Both exited 0.
#
# SAFETY, structural rather than judged:
#   * KILL SWITCH: `touch ~/metro-mini-jobs/AUTOFIX-OFF` stops it dead.
#   * It NEVER edits code, NEVER commits, and NEVER pushes. Re-run jobs may
#     commit as part of their own normal behaviour; that is their doing, not
#     this script's.
#   * ATTEMPT CAP, default 3 per finding-kind per day, so a fault it cannot fix
#     is not ground at forever.
#   * Every action is announced on ntfy, including doing nothing.
#
# 🔴 It cannot fix an expired Claude OAuth session -- that is the canary's job
# (claude-auth-canary, 00:30 + 06:30), and it remains what actually protects the
# Claude-driven jobs.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="$HOME/Projects/Metro Area Project"
LIVE="$HOME/metro-mini-jobs"
DATE="$(date +%F)"; LOGDIR="$LIVE/logs"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/ops-autofix-$DATE.log"
KILL="$LIVE/AUTOFIX-OFF"
ATTEMPTS="$LIVE/.autofix-attempts.json"
MAX_ATTEMPTS="${AUTOFIX_MAX_ATTEMPTS:-3}"
DRY_RUN="${AUTOFIX_DRY_RUN:-0}"

log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; . "$HOME/.config/metro-supabase/env"; set +a; }
# AUTOFIX_DRY_RUN=1 prints the alert instead of sending it. This exists because
# setting NTFY_TOPIC="" to test safely DOES NOT WORK -- the source line above
# runs after the environment is set and overwrites it, so the alert goes to
# Ashwin's phone anyway. That trap cost him a spurious alert from this very
# script's first dry run on 2026-09-10, and two more from the auth canary the
# same afternoon. Never muzzle one of these scripts from the outside.
push(){
  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf 'DRY-RUN would push: [%s] %s\n' "$1" "$4" | tee -a "$LOG"
    return 0
  fi
  [ -n "${NTFY_TOPIC:-}" ] || return 0
  curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true
}

ACTED=()   # human-readable lines describing what was actually done

log "=== ops-autofix start ($DATE)${DRY_RUN:+ }$([ "$DRY_RUN" = 1 ] && echo '[DRY RUN]') ==="

if [ -f "$KILL" ]; then
  log "AUTOFIX-OFF present -- disabled. Remove $KILL to re-enable."
  exit 0
fi

FINDINGS="$(python3 "$REPO/mac-mini-jobs/detect_issues.py" --json 2>>"$LOG")" || {
  log "ERROR: detector failed; refusing to act blind"
  push "[ALERT] ops-autofix: detector failed" high rotating_light \
    "detect_issues.py did not return findings. Autofix did nothing."
  exit 1
}
COUNT="$(printf '%s' "$FINDINGS" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)"
if [ "$COUNT" = "0" ]; then
  log "no findings; nothing to do"
  exit 0
fi
log "$COUNT finding(s):"
printf '%s' "$FINDINGS" | python3 -c '
import sys, json
for f in json.load(sys.stdin):
    print("   [%s] %s -- %s" % (f["severity"], f["kind"], f["summary"]))' | tee -a "$LOG"

if printf '%s' "$FINDINGS" | grep -q '"kind": "working_tree_dirty"'; then
  log "STOP: uncommitted changes in the repo. Refusing to act around a human's work."
  push "[ops-autofix] stood down -- uncommitted work" default warning \
    "$COUNT finding(s) but the working tree is dirty, so nothing was done. Commit or stash and the next run picks it up."
  exit 0
fi

# --- attempt cap --------------------------------------------------------------
# Consumes one attempt per (kind) per run, so a fault this cannot actually fix
# stops being retried after MAX_ATTEMPTS rather than every slot, forever.
allowed(){
  python3 - "$ATTEMPTS" "$DATE" "$MAX_ATTEMPTS" "$1" <<'PY'
import json, sys
path, date, cap, kind = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
try:
    with open(path) as f: db = json.load(f)
except Exception: db = {}
if db.get("date") != date: db = {"date": date, "counts": {}}
c = db.setdefault("counts", {})
ok = c.get(kind, 0) < cap
if ok: c[kind] = c.get(kind, 0) + 1
with open(path, "w") as f: json.dump(db, f)
print("yes" if ok else "no")
PY
}

# --- remedy: deploy drift -----------------------------------------------------
fix_deploy_drift(){
  log "-- deploy_drift: syncing repo -> live dispatcher directory"
  local items file
  items="$(printf '%s' "$FINDINGS" | python3 -c '
import sys, json
for f in json.load(sys.stdin):
    if f["kind"] == "deploy_drift":
        for it in f["evidence"]["items"]: print(it)')"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    file="$(printf '%s' "$line" | awk "{print \$NF}")"
    [ -n "$file" ] || continue
    case "$file" in
      /*|*..*) log "   refusing suspicious path: $file"; continue;;
    esac
    if [ ! -e "$REPO/mac-mini-jobs/$file" ]; then
      log "   $file is in the live dir but not the repo -- NOT deleting, reporting only"
      continue
    fi
    if [ "$DRY_RUN" = 1 ]; then log "   DRY RUN would deploy $file"; continue; fi
    mkdir -p "$(dirname "$LIVE/$file")"
    case "$file" in
      jobs.toml)
        # config is deployed as a real copy, by long-standing convention
        cp -p "$REPO/mac-mini-jobs/$file" "$LIVE/$file" && \
          { log "   copied $file"; ACTED+=("deployed $file (copy)"); };;
      *)
        # every script is a symlink into the repo, so an edit cannot drift again
        ln -sfn "$REPO/mac-mini-jobs/$file" "$LIVE/$file" && \
          { log "   symlinked $file"; ACTED+=("deployed $file (symlink)"); };;
    esac
  done <<< "$items"
  ( cd "$LIVE" && python3 dispatcher.py --check-sync 2>&1 | tail -2 | tee -a "$LOG" )
}

# --- remedy: re-run a failed job ---------------------------------------------
fix_job_failed(){
  local jid="$1" argv rc
  argv="$(python3 - "$LIVE" "$jid" <<'PY'
import json, os, sys, tomllib
live, jid = sys.argv[1], sys.argv[2]
jobs = tomllib.load(open(os.path.join(live, "jobs.toml"), "rb"))["job"]
j = next((x for x in jobs if x["id"] == jid), None)
if not j: sys.exit(1)
cmd = os.path.expandvars(os.path.expanduser(j["command"]))
path = cmd if os.path.isabs(cmd) else os.path.join(live, cmd)
argv = ["/bin/bash", path] + [str(a) for a in (j.get("args") or [])]
slug = j.get("hc_slug")
if slug:
    argv = ["/bin/bash", os.path.join(live, "hc-run.sh"), slug] + argv
print(json.dumps(argv))
PY
)" || { log "-- job_failed $jid: not found in live jobs.toml, skipping"; return; }

  if [ "$DRY_RUN" = 1 ]; then log "-- DRY RUN would re-run $jid: $argv"; return; fi
  log "-- job_failed: re-running $jid"
  python3 -c '
import json, subprocess, sys
argv = json.loads(sys.argv[1])
sys.exit(subprocess.run(argv, cwd=sys.argv[2]).returncode)' "$argv" "$LIVE" >>"$LOG" 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then
    log "   $jid re-ran clean; marking the slot ok"
    ( cd "$LIVE" && python3 dispatcher.py --mark-ok "$jid" >>"$LOG" 2>&1 ) \
      && ACTED+=("re-ran $jid successfully and marked its slot ok") \
      || ACTED+=("re-ran $jid successfully (mark-ok failed; a tick may have held the lock)")
  else
    log "   $jid failed again (exit $rc) -- leaving it failed for a human"
    ACTED+=("re-ran $jid and it FAILED again (exit $rc)")
  fi
}

# --- remedy: re-run a failed GitHub Actions run ------------------------------
fix_action_failed(){
  local run_id="$1" name="$2"
  if [ "$DRY_RUN" = 1 ]; then log "-- DRY RUN would rerun Actions run $run_id ($name)"; return; fi
  log "-- action_failed: rerunning '$name' (run $run_id)"
  if ( cd "$REPO" && gh run rerun "$run_id" --failed >>"$LOG" 2>&1 ); then
    ACTED+=("re-ran failed GitHub Actions workflow '$name' (run $run_id)")
  else
    log "   gh run rerun failed"
    ACTED+=("could NOT re-run '$name' (run $run_id); gh rerun failed")
  fi
}

# --- dispatch -----------------------------------------------------------------
while IFS=$'\t' read -r kind fid extra; do
  [ -n "$kind" ] || continue
  case "$kind" in
    deploy_drift|job_failed|action_failed) ;;
    *) log "-- $kind: not in the whitelist, reporting only"; continue;;
  esac
  if [ "$(allowed "$kind")" != "yes" ]; then
    log "-- $kind: at the $MAX_ATTEMPTS/day attempt cap, standing down"
    ACTED+=("$kind left alone: hit the $MAX_ATTEMPTS/day attempt cap")
    continue
  fi
  case "$kind" in
    deploy_drift)  fix_deploy_drift ;;
    job_failed)    fix_job_failed "$fid" ;;
    action_failed) fix_action_failed "$extra" "$fid" ;;
  esac
done < <(printf '%s' "$FINDINGS" | python3 -c '
import sys, json
seen = set()
for f in json.load(sys.stdin):
    k = f["kind"]
    if k == "deploy_drift":
        if k in seen: continue      # one sync handles every drifted file
        seen.add(k)
        print("%s\t\t" % k)
    else:
        print("%s\t%s\t%s" % (k, f.get("id", ""), (f.get("evidence") or {}).get("run_id", "")))')

# --- report -------------------------------------------------------------------
if [ "${#ACTED[@]}" -eq 0 ]; then
  log "no whitelisted action applied"
  push "[ops-autofix] $COUNT finding(s), nothing auto-fixable" default mag \
    "Detected $COUNT item(s) but none matched the whitelist, so nothing was done. See $LOG."
else
  printf '%s\n' "${ACTED[@]}" | tee -a "$LOG"
  push "[ops-autofix] acted on $COUNT finding(s)" default wrench \
    "$(printf '%s\n' "${ACTED[@]}")"
fi
log "=== ops-autofix done ==="
