#!/usr/bin/env bash
# Literal port of .github/workflows/nfl-live-refresh.yml, moved to the mini on
# 2026-09-11 at Ashwin's word: "I don't want to wait 5 hours for this thing to
# run ... why do we have it on GitHub and not on Mac Mini?"
#
# Why it was on GitHub: the job was born on 2026-09-06 as "the SITE half of the
# 2026 NFL automation, and it needs no workbook and no Mac mini", at a moment
# when the mini's reach into site.api.espn.com was still in question. That
# question was settled on 2026-08-05 (no User-Agent passes from every vantage;
# see jobs.toml's ESPN note), so nothing kept it there but the date it was
# written. What it cost: GitHub's cron fired the 09-08 run 4h17m late and did
# not fire the 09-11 run at all (Ashwin dispatched it by hand at 13:03Z), and
# the workflow never pinged /api/revalidate, so even a punctual run reached
# the season page only when lib/nflElo.ts's 86400s window expired.
#
# DAILY, not Tue/Fri. The 2026 schedule has games on Thursday, Friday,
# Saturday, Sunday and Monday, and the ratings, seeds and odds are what Live
# Standings and the season hub open on, so every morning after a game night
# is a morning the numbers should be facts. The scripts are change-gated and a
# no-game day commits nothing.
#
# Steps, in the YAML's order: self-test, carry the season, the postseason
# bracket in January and February, the playoff seeds, the playoff odds, one
# commit, then the ISR flush (tags nfl-elo and nfl-playoffs; see
# app/api/revalidate/route.ts).
#
# The season is taken from the calendar: September to December belong to the
# year, January and February to the previous one (the same rule
# nfl_playoffs.py's current_season() applies).
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

MONTH="$(date -u +%m)"
YEAR="$(date -u +%Y)"
case "$MONTH" in
  01|02) SEASON=$((YEAR - 1)) ;;
  *)     SEASON="$YEAR" ;;
esac
SEASON="${NFL_SEASON:-$SEASON}"
note "season $SEASON (month $MONTH)"

guarded "self-test the live carry" "$PY" scripts/nfl/nfl_live_update.py --self-test
guarded "carry the live season from ESPN" \
  "$PY" scripts/nfl/nfl_live_update.py --season "$SEASON" --write

# January and February only: outside those months the postseason does not
# exist and the call is not made rather than made and discarded.
if [ "$MONTH" = "01" ] || [ "$MONTH" = "02" ]; then
  guarded "self-test the bracket" "$PY" scripts/nfl/nfl_playoffs.py --self-test
  guarded "refresh the postseason bracket" \
    "$PY" scripts/nfl/nfl_playoffs.py --season "$SEASON" --write
else
  note "month $MONTH: outside the postseason window; bracket not refreshed."
fi

# Seeds and odds skip themselves (exit non-zero with a message) until the
# first regular-season game is in, and that is not a failure of the run, so
# these two are NOT guarded: the YAML's `|| echo` is reproduced here.
guarded "self-test the seeds" "$PY" scripts/nfl/playoff_seeds.py --self-test
"$PY" scripts/nfl/playoff_seeds.py --season "$SEASON" --write \
  || note "seeds: nothing to write yet (no regular-season game played)."

guarded "self-test the odds" "$PY" scripts/nfl/playoff_odds.py --self-test
"$PY" scripts/nfl/playoff_odds.py --season "$SEASON" --write --quiet \
  || note "odds: nothing to write yet (no schedule for the season)."

# Every file here is read via GitHub raw with ISR, so [vercel skip] is correct
# and was checked (the YAML's own note). `git add -A` on the folders so a NEW
# file, the live season's first seeds file, counts as a change.
git add -A -- public/data/nfl/elo public/data/nfl/seeds public/data/nfl/odds public/data/nfl/playoffs.json
if commit_paths "Auto: carry the live NFL season from ESPN [vercel skip]" \
     public/data/nfl/elo public/data/nfl/seeds public/data/nfl/odds public/data/nfl/playoffs.json; then
  revalidate_ping "nfl-elo" "/teams/nfl" "/teams/nfl/season/$SEASON" "/sports/standings"
  if [ "$MONTH" = "01" ] || [ "$MONTH" = "02" ]; then
    revalidate_ping "nfl-playoffs" "/teams/nfl"
  fi
fi
note "done"
