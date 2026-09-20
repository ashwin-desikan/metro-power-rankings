#!/usr/bin/env bash
# metro-rankings.sh - weekly metro rankings recalculation, Supabase-only, no
# workbook needed on this box (see scripts/metro_sync/README.md).
#
# Why: MetroAreas.xlsx lives on Ashwin's Windows machine; scripts/metro_sync
# mirrors its rows into Supabase so scripts/extract.py can run the whole
# metro ETL on the mini with METRO_WORKBOOK_SOURCE=supabase and produce
# byte-identical output. This runner is that weekly recalculation.
#
# Order of steps:
#   1. mini_sync (ff-only to origin/main).
#   2. source the Supabase key the same way run-mktcap-refresh.sh does.
#   3. guarded self-tests: sync_workbook.py, publish_guard.py, metro_score/parity.py.
#   4. guarded: extract.py against the Supabase mirror (this is the slow step;
#      STEP_TIMEOUT is raised to 1200s for it alone).
#   5. revert public/data/quiz_queue.json (extract.py's subprocess rewrites it
#      with an unseeded RNG every run; house practice is to discard that).
#   6. run publish_guard.py against the file it just wrote. A hold restores
#      public/data, commits only the report ([vercel skip]) and fails loudly.
#      A no_change restores public/data and exits clean, no commit.
#   7. otherwise, MODE decides what happens to a clean, passing run:
#        shadow  (default): never touches public/data's real content, only
#                the report is committed, [vercel skip].
#        publish: commits the real files extract.py wrote, UNTAGGED on
#                purpose (see below), plus the report, one commit.
#
# CUTOVER RULE: publish mode REPLACES the update_top_companies.py step at the
# tail of run-mktcap-refresh.sh, in the SAME change that flips
# METRO_RANKINGS_MODE to publish. Never run both: two untagged Saturday
# commits would spend the whole day's 2-build budget between them. Until that
# cutover this runner stays in shadow mode, proving itself for two clean
# Saturdays first (see jobs.toml's comment on this job).
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

DATE="$(date -u +%F)"
REPORT="mac-mini-jobs/reports/metro-rankings-$DATE.md"
MODE="${METRO_RANKINGS_MODE:-shadow}"
case "$MODE" in
  shadow|publish) ;;
  *) fail "unknown METRO_RANKINGS_MODE: $MODE (expected shadow or publish)" ;;
esac
note "mode: $MODE"

# Every path this job writes, listed literally. The restore below touches these
# and nothing else: a blanket `git checkout -- public/data` would also wipe the
# uncommitted output of any other job that happens to be mid-run on this clone.
PUBLISH_PATHS="public/data/metros.json public/data/regions.json public/data/states.json public/data/meta.json public/data/gold-standard-leagues.json public/data/details public/data/state-metro-scores.json public/data/states-directory.json"
_restore_outputs() {
  # shellcheck disable=SC2086
  git checkout -- $PUBLISH_PATHS public/data/quiz_queue.json 2>/dev/null
  git clean -fdq public/data/details 2>/dev/null   # a NEW metro's detail file
}

# Every exit path below this point must leave public/data clean except a
# successful publish. The trap is the guarantee: it fires on any exit
# (including fail(), which calls exit 1) and is a no-op once we've committed
# for real, because by then the working tree already IS clean.
_CLEAN_ON_EXIT=1
_restore_public_data() {
  if [ "$_CLEAN_ON_EXIT" = "1" ]; then
    cd "$REPO_DIR" 2>/dev/null || return 0
    _restore_outputs
    # DRY_RUN never leaves a trace: the report was written to prove it can be,
    # but a dry run's tree must come back exactly as it started.
    if [ "$DRY_RUN" = "1" ] && [ -n "${REPORT:-}" ]; then
      rm -f "$REPORT"
    fi
  fi
}
trap _restore_public_data EXIT

# _push_committed_or_fail <label>
# The already-created local commit exists either way; this only decides
# whether the push retry loop's exhaustion is reported. Mirrors
# commit_paths' own 5-attempt backoff in _common.sh, which we can't reuse
# here directly because report-only commits must still happen (and DRY_RUN
# must still block them) even on the hold path, before commit_paths' own
# no-op-detection logic would run.
_push_committed_or_fail() {
  local label="$1"
  local attempt
  for attempt in 1 2 3 4 5; do
    if git pull --rebase --autostash "$GIT_REMOTE" "$GIT_BRANCH" \
       && git push "$GIT_REMOTE" "HEAD:$GIT_BRANCH"; then
      note "Pushed $label on attempt $attempt."
      _CLEAN_ON_EXIT=0
      return 0
    fi
    sleep $((attempt * 5))
  done
  fail "failed to push $label after retries"
}

mini_sync

# 2. Supabase key, same line run-mktcap-refresh.sh uses. The REST backend
# (scripts/mktcap/common.py) reads MKTCAP_SUPABASE_KEY.
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; . "$HOME/.config/metro-supabase/env"; set +a; }
if [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
  export MKTCAP_SUPABASE_KEY="$SUPABASE_SERVICE_KEY"
fi

cd "$REPO_DIR" || fail "REPO_DIR not found: $REPO_DIR"

# 3. Self-tests, offline, no I/O.
guarded "self-test the workbook sync shim" "$PY" scripts/metro_sync/sync_workbook.py --self-test
guarded "self-test the publish guard" "$PY" scripts/metro_sync/publish_guard.py --self-test
guarded "self-test the score parity check" "$PY" scripts/metro_score/parity.py --self-test

# 4. The ETL itself. METRO_SYNC_BACKEND is passed through from the caller's
# environment (default rest = Supabase); a test run sets it to file:<dir>.
# Raised timeout: this step does real work (thousands of rows, per-metro
# detail files), unlike the other steps here.
STEP_TIMEOUT=1200 guarded "extract.py against the Supabase mirror" \
  env METRO_WORKBOOK_SOURCE=supabase METRO_SYNC_BACKEND="${METRO_SYNC_BACKEND:-rest}" \
  "$PY" scripts/extract.py

# 5. extract.py's check_quiz_queue.py subprocess rewrites quiz_queue.json
# with an unseeded RNG on every run; house practice is to discard that so it
# isn't treated as a "change" by anything downstream.
git checkout -- public/data/quiz_queue.json 2>/dev/null || true

# 4b. build-states-directory.py now reads via scripts/metro_sync/open_workbook.py
# too (proven byte-identical between workbook mode and the mirror; see
# scripts/metro_sync/open_workbook.py's own docstring). It needs metros.json,
# which extract.py just wrote, so it runs after it, still under
# METRO_WORKBOOK_SOURCE=supabase.
#
# build-state-metro-scores.py is ALSO switched (same proof, same module) but
# deliberately NOT run here: it writes public/data/state-metro-scores.json,
# the exact same path build-states-directory.py writes with a DIFFERENT
# computation, so running both here would make whichever ran last silently
# clobber the other's numbers. Neither script is referenced anywhere else in
# the repo (no other runner, no package.json script), so this looks like an
# unresolved duplication predating this change, not something to paper over
# by picking one silently. Left for Ashwin to resolve; see the phase 2 report.
guarded "build-states-directory.py against the Supabase mirror" \
  env METRO_WORKBOOK_SOURCE=supabase METRO_SYNC_BACKEND="${METRO_SYNC_BACKEND:-rest}" \
  "$PY" scripts/build-states-directory.py

# 6. Guard the fresh metros.json against what was at HEAD.
GUARD_JSON="$(mktemp)"
"$PY" scripts/metro_sync/publish_guard.py --json --report "$REPORT" > "$GUARD_JSON"
GUARD_RC=$?
GUARD_STATUS="$("$PY" -c "import json,sys; print(json.load(open('$GUARD_JSON'))['status'])" 2>/dev/null || echo unknown)"
note "guard verdict: $GUARD_STATUS (rc=$GUARD_RC)"

if [ "$GUARD_RC" -eq 20 ] || [ "$GUARD_STATUS" = "held" ]; then
  FIRST_REASON="$("$PY" -c "
import json
d = json.load(open('$GUARD_JSON'))
reasons = d.get('reasons') or []
print(reasons[0] if reasons else 'guard held for an unspecified reason')
" 2>/dev/null)"
  rm -f "$GUARD_JSON"
  # Restore the real data now (the trap will no-op it a second time, which
  # is fine); keep the report, commit only that, tagged so it never builds.
  _restore_outputs
  git add -f "$REPORT" 2>/dev/null
  if ! git diff --cached --quiet; then
    if [ "$DRY_RUN" = "1" ]; then
      note "DRY_RUN=1: would commit held report -> $REPORT"
      git reset -q -- "$REPORT"
    else
      git config user.name  "metro-mini[bot]"
      git config user.email "metro-mini-bot@users.noreply.github.com"
      git commit -m "metro-rankings: held $DATE [vercel skip]" --quiet || note "WARN: could not commit held report"
      # Best-effort: a failed push here must not replace the real hold
      # reason with a push-failure message, so this does not call fail()
      # itself. fail "$FIRST_REASON" right below is unconditional either way.
      for attempt in 1 2 3 4 5; do
        if git pull --rebase --autostash "$GIT_REMOTE" "$GIT_BRANCH" \
           && git push "$GIT_REMOTE" "HEAD:$GIT_BRANCH"; then
          note "Pushed held report on attempt $attempt."
          _CLEAN_ON_EXIT=0
          break
        fi
        sleep $((attempt * 5))
      done
    fi
  fi
  fail "$FIRST_REASON"
fi
rm -f "$GUARD_JSON"

if [ "$GUARD_STATUS" = "no_change" ]; then
  note "no_change: restoring public/data, nothing to commit."
  _restore_outputs
  note "done (no_change)"
  exit 0
fi

# 7. MODE decides what happens to a clean, passing run.
if [ "$MODE" = "shadow" ]; then
  {
    echo ""
    echo "## Shadow mode"
    echo ""
    echo "\`git diff --stat -- public/data | tail -1\`:"
    echo '```'
    git diff --stat -- public/data | tail -1
    echo '```'
    CHANGED_COUNT="$(git diff --name-only -- public/data | wc -l | tr -d ' ')"
    echo ""
    echo "changed files: $CHANGED_COUNT"
  } >> "$REPORT"
  note "shadow mode: restoring public/data (not published), committing report only."
  _restore_outputs
  git add -f "$REPORT"
  if git diff --cached --quiet; then
    note "report unchanged; nothing to commit."
  else
    if [ "$DRY_RUN" = "1" ]; then
      note "DRY_RUN=1: would commit shadow report -> $REPORT"
      git --no-pager diff --cached --stat
      git reset -q -- "$REPORT"
    else
      git config user.name  "metro-mini[bot]"
      git config user.email "metro-mini-bot@users.noreply.github.com"
      git commit -m "metro-rankings: shadow report $DATE [vercel skip]" --quiet || fail "git commit (shadow report) failed"
      _push_committed_or_fail "shadow report"
    fi
  fi
  note "done (shadow)"
  exit 0
fi

# MODE = publish.
if command -v node >/dev/null 2>&1; then
  guarded "slug drift check" node scripts/check-slug-drift.mjs
else
  note "node not on PATH; skipping slug drift check (treat as a gap, not a pass)."
fi

# The literal set extract.py writes (confirmed by reading its json.dump
# calls and by `git status --porcelain` after a real run): metros.json,
# regions.json, states.json, meta.json, gold-standard-leagues.json, the
# per-metro detail files under details/, plus the report. Deliberately not
# a `public/data` catch-all so a stray unrelated file never rides along.

if commit_paths "rankings: weekly metro recalculation $DATE" $PUBLISH_PATHS "$REPORT"; then
  note "committed + pushed weekly metro recalculation (untagged on purpose -- this is the weekly build)"
  _CLEAN_ON_EXIT=0
else
  # commit_paths returns 1 both for DRY_RUN=1 (it already printed the would-be
  # diff and unstaged everything) and for a genuine no-op (guard said pass but
  # the files came out byte-identical, which should be rare). Either way there
  # is nothing left to do here; the trap restores public/data.
  note "commit_paths made no commit (DRY_RUN=$DRY_RUN); public/data will be restored."
fi

note "done (publish)"
