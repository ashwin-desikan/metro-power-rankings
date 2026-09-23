#!/usr/bin/env bash
# Assert the Notion reconciler left yesterday's log line. THIS IS THE FIX.
#
# On 2026-09-23 the reconciler's 06:30 UTC cloud run fired, made no tool call at
# all, and left no log line on the "Notion operating contract" page. It
# completed only because Ashwin asked four hours later. Its inputs were healthy
# throughout, so this is not the 19 to 21 September fetch problem: it is a run
# that exits telling nobody, and nothing detected it.
#
# THE RULING (Ashwin, 2026-09-23): the detector must not depend on the thing it
# watches. A cloud routine cannot report that it died before it started, and a
# scheduled trigger inside the same system cannot notice an absence. So this
# runs on the mini and reads Notion DIRECTLY over the REST API. If it needed
# Claude it would share the failure mode of the thing it watches, which is the
# whole defect being fixed. See jobs.toml id "notion-reconcile-verify".
#
# PRESENT MEANS PASS. ABSENT IS THE ALERT, carrying the missing date and the
# page link. The python exits non-zero on absence, on an unreadable page, and on
# a missing token, so this can never go green on doubt.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

VERIFY="scripts/notion/reconcile_verify.py"
PAGE="https://www.notion.so/3dfedcc4e0f78190a1e2fb17b8b451f3"
cd "$REPO_DIR" || fail "REPO_DIR not found: $REPO_DIR"

# Date parsing, the present and absent cases, and the malformed-page cases, all
# offline before the API is touched.
guarded "self-test reconcile_verify" "$PY" "$VERIFY" --self-test

FLAGS=""
[ "$DRY_RUN" = "1" ] && FLAGS="--dry-run"

OUT="$(mktemp -t notion-reconcile-verify)"
if "$PY" "$VERIFY" $FLAGS >"$OUT" 2>&1; then
  cat "$OUT"; rm -f "$OUT"
  note "done"
  exit 0
fi

cat "$OUT"
# reconcile_verify.py prints one machine-readable "MISSING <date>" line, so the
# date in the alert is the one it actually tested rather than one recomputed
# here, which could differ across a midnight boundary.
MISSING="$(sed -n 's/^MISSING \(.*\)$/\1/p' "$OUT" | head -1)"
REASON="$(grep -E '^(FAIL|NOTION_API_TOKEN)' "$OUT" | tail -2)"
rm -f "$OUT"
note "reconciler log check failed:"
note "$REASON"
if [ -n "$MISSING" ]; then
  fail "Notion reconciler left NO log line for $MISSING. The 06:30 UTC cloud run did not complete. $PAGE"
else
  fail "Notion reconciler log could not be verified: $REASON $PAGE"
fi
