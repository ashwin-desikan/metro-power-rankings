#!/bin/bash
# Claude Code auth canary (mini-owned, DAILY). Read-only: it inspects the mini's stored
# Claude Code OAuth credential and pushes an ntfy when a re-login is coming due. It touches
# no repo, no Supabase and no table, and it NEVER prints the credential.
#
# WHY THIS EXISTS. An expired Claude session takes out BOTH Claude-driven jobs at once --
# on 2026-09-10 it failed daily-ops-sweep at 01:00Z and the newsletter digest at 07:00Z,
# and each recovered only because Ashwin re-authed by hand. Third occurrence: 2026-07-30,
# 2026-08-29, 2026-09-10. Both wrappers already DETECT the condition and refuse the futile
# retry, and both now push on it -- but the first signal was always a job that had already
# failed. This turns that into scheduled maintenance.
#
# 🔴 WATCH refreshTokenExpiresAt, NOT expiresAt. `expiresAt` is the ACCESS token and sits
# ~5 hours out at any moment; it is refreshed silently all day, so a canary on that field
# fires constantly and teaches you to ignore it. `refreshTokenExpiresAt` is when a real
# interactive login is required -- ~28 days out on a fresh credential, which is exactly the
# 30-day gap between the 07-30 and 08-29 failures.
#
# The 12-day gap (08-29 -> 09-10) was NOT an expiry: the credential seen on the morning of
# 09-10 had NO refreshToken at all, so it could not self-heal and simply died. A date alone
# would have missed that, which is why the no-refresh-token case alerts hardest here. This
# canary is necessary, not sufficient -- the auth_expired push() in each wrapper still covers
# a token that dies early.
#
# Scheduled daily 06:30 UTC by mac-mini-jobs/jobs.toml (dispatcher.py), which owns the
# schedule: 30 minutes ahead of the 07:00Z newsletter digest, so a warning lands before the
# day's first Claude-driven job rather than after it.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/claude-auth-canary-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/newsletter-podcast/env" ] && { set -a; source "$HOME/.config/newsletter-podcast/env"; set +a; }

# --dry-run prints the alert instead of sending it. This exists because setting
# NTFY_TOPIC="" to test safely DOES NOT WORK: the source line above runs after the
# environment is set and overwrites it. Testing this script's warning branches on
# 2026-09-10 sent Ashwin two real "re-auth needed in 27d" alerts for a credential
# with 27 days left. Use --dry-run to exercise the branches; never trust an env
# override to muzzle a script that sources its own config.
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
push(){
  if [ "$DRY" = "1" ]; then
    printf 'DRY-RUN would push: title=[%s] prio=[%s] tags=[%s]\n  body=[%s]\n' "$1" "$2" "$3" "$4" | tee -a "$LOG"
    return 0
  fi
  [ -n "${NTFY_TOPIC:-}" ] || return 0
  curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true
}

# Days of refresh-token life left at which to start warning. 3 days (not the 48h originally
# sketched) so a Friday-evening expiry is still flagged on a working day.
WARN_DAYS="${CLAUDE_AUTH_WARN_DAYS:-3}"

log "=== claude-auth-canary start ($DATE) ==="

# `security` writes the secret to stdout; it goes straight into python and is never echoed,
# logged, or kept in a shell variable.
BLOB="$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null)" || BLOB=""
if [ -z "$BLOB" ]; then
  log "ERROR: could not read the Claude Code credential from the keychain"
  push "[ALERT] Claude auth canary CANNOT READ credential -- $DATE" high rotating_light \
    "security find-generic-password returned nothing for 'Claude Code-credentials' on the mini. Either the item is gone (Claude Code is logged out) or launchd lost keychain access. Check with: security find-generic-password -s 'Claude Code-credentials' -w"
  exit 1
fi

# Prints one line: STATUS<TAB>DAYS<TAB>HUMAN. Never prints token material.
OUT="$(printf '%s' "$BLOB" | python3 -c '
import sys, json, datetime
try:
    d = json.load(sys.stdin)
except Exception as e:
    print("UNPARSEABLE\t0\tcredential is not JSON (%s)" % type(e).__name__); raise SystemExit(0)
o = d.get("claudeAiOauth") or {}
if not o:
    print("NO_OAUTH\t0\tno claudeAiOauth block in the credential"); raise SystemExit(0)
if not o.get("refreshToken"):
    print("NO_REFRESH_TOKEN\t0\tthe credential has NO refresh token, so it cannot renew itself"); raise SystemExit(0)
exp = o.get("refreshTokenExpiresAt")
if not exp:
    print("NO_EXPIRY_FIELD\t0\trefreshTokenExpiresAt is absent, so expiry cannot be predicted"); raise SystemExit(0)
now = datetime.datetime.now(datetime.timezone.utc)
t = datetime.datetime.fromtimestamp(exp / 1000, datetime.timezone.utc)
days = (t - now).total_seconds() / 86400.0
if days <= 0:
    print("EXPIRED\t%.2f\tthe refresh token EXPIRED on %s UTC" % (days, t.strftime("%Y-%m-%d %H:%M")))
else:
    print("OK\t%.2f\trefresh token valid until %s UTC" % (days, t.strftime("%Y-%m-%d %H:%M")))
' 2>/dev/null)" || OUT=""

[ -n "$OUT" ] || { log "ERROR: could not parse the credential"; \
  push "[ALERT] Claude auth canary FAILED -- $DATE" high rotating_light \
  "The canary read the keychain item but could not parse it. Run the canary by hand on the mini."; exit 1; }

STATUS="$(printf '%s' "$OUT" | cut -f1)"
DAYS="$(printf '%s' "$OUT" | cut -f2)"
HUMAN="$(printf '%s' "$OUT" | cut -f3)"
log "status=$STATUS days_left=$DAYS -- $HUMAN"

FIXLINE="Fix: run 'claude' on the mini and log in. Until then daily-ops-sweep (01:00Z) and the newsletter digest (07:00Z) will both fail."

case "$STATUS" in
  EXPIRED|NO_REFRESH_TOKEN|NO_OAUTH|UNPARSEABLE)
    # This is the 2026-09-10 morning state. The session cannot renew: it will die, and the
    # only warning without this canary is two failed jobs.
    push "[ALERT] Claude credential CANNOT REFRESH -- $DATE" urgent rotating_light \
      "$HUMAN. $FIXLINE"
    log "pushed: credential cannot refresh"
    ;;
  NO_EXPIRY_FIELD)
    push "[WARN] Claude auth canary blind -- $DATE" default warning \
      "$HUMAN. The credential still has a refresh token, so this is not urgent, but the canary cannot see an expiry date."
    log "pushed: no expiry field"
    ;;
  OK)
    if [ "$(printf '%s < %s\n' "$DAYS" "$WARN_DAYS" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
      PRIO=default; TAG=warning
      # Inside a day, make it loud: the next digest may well be the one that fails.
      [ "$(printf '%s < 1\n' "$DAYS" | bc -l 2>/dev/null || echo 0)" = "1" ] && { PRIO=high; TAG=rotating_light; }
      push "[WARN] Claude re-auth needed in ${DAYS%.*}d -- $DATE" "$PRIO" "$TAG" \
        "$HUMAN. $FIXLINE"
      log "pushed: re-auth due in $DAYS days (threshold $WARN_DAYS)"
    else
      log "no alert: $DAYS days of refresh-token life left (threshold $WARN_DAYS)"
    fi
    ;;
esac

log "=== claude-auth-canary done ==="
