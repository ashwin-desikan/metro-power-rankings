#!/usr/bin/env bash
# Promote newly crowned cricket champions onto the Champions board.
#
# Cricket had no producer at all. is_current reached the board only through the
# Windows workbook ritual, and that ritual could not ADD a competition, because
# merge-champions-sources.py sets "Is Current" only for a competition already in
# champions.json and champions.json is built from "Is Current". Ten competitions
# sat in the ledger with a champion and never appeared under Current until
# Ashwin found it on 2026-09-19. scripts/ingest/cricket_finalize.py is the
# detector; this is what runs it. See jobs.toml id "cricket-champions".
#
# Same runner idiom as economy-housing.sh: self-test gate before any network
# call, guarded steps, commit_paths with "[vercel skip]", revalidate_ping.
#
# NO BUILD. The board reads public/data/champions-current.json from GitHub raw
# at runtime (lib/championsCurrent.ts, ISR 3600 + tag "champions"), so a new
# champion ships on a [vercel skip] commit and a tag flush, not a paid build.
#
# WHY DAILY. Cricket finals are scattered across the year (BBL, SA20, ILT20,
# Super Smash and the BPL in January, the PSL and IPL in May, the T20 Blast in
# July, The Hundred in August, the CPL and the County Championship in
# September). A weekly slot would leave a new champion off the board for up to
# six days. The cost of a daily run is eleven conditional-GET Wikipedia reads
# and one Supabase select, and on all but about ten days a year it does
# nothing at all and commits nothing.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

FINALIZE="scripts/ingest/cricket_finalize.py"

# Pure decision logic offline: the season-label maths, the infobox parse, the
# men's/women's split, and the guard that stops a competition article being
# read as a season. Runs before any network call, same as every other runner.
guarded "self-test cricket_finalize" "$PY" "$FINALIZE" --self-test

# DRY_RUN must not write to Supabase either, not just skip the commit.
FLAGS="--write"
[ "$DRY_RUN" = "1" ] && FLAGS=""

LOG_OUT="$(mktemp -t cricket-champions)"
if ! "$PY" "$FINALIZE" $FLAGS >"$LOG_OUT" 2>&1; then
  cat "$LOG_OUT"
  rm -f "$LOG_OUT"
  fail "cricket_finalize.py failed"
fi
cat "$LOG_OUT"

# A REFUSAL MUST BE AUDIBLE. The finalizer never guesses: a first-time champion
# whose metro cannot be resolved from that competition's own history, a season
# article with a champion but no readable final date, and a competition with no
# ledger history are all REFUSED rather than written. Each one needs a person,
# and if that report goes nowhere the board silently stays a season behind,
# which is the exact failure this job exists to end.
if grep -q "NEEDS ATTENTION" "$LOG_OUT"; then
  DETAIL="$(sed -n '/NEEDS ATTENTION/,$p' "$LOG_OUT" | tail -n +2 | head -10)"
  note "cricket champions needing a human:"
  note "$DETAIL"
  "$PY" "$MINI_DIR/notify.py" "Cricket champion needs a hand" "$DETAIL" 1 || true
fi

NEW_COUNT="$(sed -n 's/^\([0-9]\{1,\}\) new champion(s).*/\1/p' "$LOG_OUT" | head -1)"
rm -f "$LOG_OUT"
if [ -z "${NEW_COUNT:-}" ] || [ "$NEW_COUNT" = "0" ]; then
  note "no new cricket champions; nothing to emit"
  exit 0
fi

# Re-emit from the table. build_champions.py carries source="cricket-finalizer"
# in its base stream, so the promoted row reaches champions-history.json (the
# Time Machine and metro pages) and champions-current.json (the board).
guarded "re-emit champions JSON" "$PY" scripts/champions/build_champions.py

if commit_paths "Champions: $NEW_COUNT new cricket champion(s) [vercel skip]" \
  public/data/champions-history.json \
  public/data/champions-current.json \
  public/data/champions-metro-extra.json \
  public/data/majors/golf-months.json; then
  revalidate_ping "champions" "/sports/champions"
fi

note "done"
