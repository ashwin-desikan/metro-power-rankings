#!/usr/bin/env bash
# Give the day's HANDOFF entries a second reconciler pass while they are still
# same-day. The cloud reconciler runs at 06:30 UTC, which is before most of a
# day's entries exist, so this fires the routine's own trigger endpoint in the
# evening. See jobs.toml id "notion-reconcile-ping".
#
# THE SMALLER HALF OF A PAIR. notion-reconcile-verify.sh is the job that fixes
# the actual 2026-09-23 defect, a run that fires, does nothing and leaves no log
# line. Triggering an extra pass without verifying it only moves the silence to
# a different hour, which is why the two shipped together.
#
# NO GIT, NO COMMIT, so no mini_sync: this job makes one HTTP request and reads
# its status. _common.sh is sourced for config.env, note(), guarded() and fail().
#
# SECRETS ARE ASHWIN'S TO PLACE. NOTION_RECONCILE_TRIGGER_URL and
# NOTION_RECONCILE_TRIGGER_TOKEN live in config.env on the mini and are named in
# config.env.example. With either absent the python fails closed with a clear
# line and makes no network call, and this runner turns that into an alert
# rather than a quiet exit 0.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

PING="scripts/notion/reconcile_ping.py"
cd "$REPO_DIR" || fail "REPO_DIR not found: $REPO_DIR"

# Pure logic before any network call, same as every other runner here: the 2xx
# classification, the retry-once rule, and that a trigger URL is never logged
# with its query string intact.
guarded "self-test reconcile_ping" "$PY" "$PING" --self-test

FLAGS=""
[ "$DRY_RUN" = "1" ] && FLAGS="--dry-run"

OUT="$(mktemp -t notion-reconcile-ping)"
if "$PY" "$PING" $FLAGS >"$OUT" 2>&1; then
  cat "$OUT"; rm -f "$OUT"
  note "done"
  exit 0
fi

cat "$OUT"
# The last two lines carry the diagnosis (FAIL: ... and, for a 401/404, that it
# is the endpoint rather than a transient fault). Sent as the alert body so the
# phone says what happened without needing the log.
DETAIL="$(grep -E '^(FAIL|attempt|NOTION_RECONCILE)' "$OUT" | tail -4)"
rm -f "$OUT"
note "reconciler trigger failed:"
note "$DETAIL"
fail "notion-reconcile-ping: $DETAIL"
