#!/usr/bin/env bash
# Commissioned via HANDOFF 2026-08-19 ("cloud -> mini: commission the CFB
# predictions runner"). One command does everything: pulls ESPN standings/
# schedule/futures + the AP poll, sims the season, grades finished ledger
# entries, and extends the AP-25 slate ONLY while the poll is <=9 days fresh
# (the product promise is "the week's slate comes out after the AP poll").
# A run on a stale poll grades and re-sims but adds no games, so an extra
# run is always safe -- that is what makes a plain two-slot cadence safe
# without any day-of-week branching in this script.
#
# Cadence (season window ~Aug 15 - Jan 20), two jobs.toml entries -> this one
# script, same shape as predictions.sh's own Tue/Fri split:
#   Sun 23:40 UTC - the main slot. AP poll lands ~18:00 UTC Sunday and
#                   Saturday's finals are long in by 23:40; grades the week
#                   and publishes the next AP-25 slate a few hours after the
#                   poll drops.
#   Fri 11:40 UTC - freezes any game ESPN priced late, grades midweek
#                   MACtion, refreshes the sim. Kept as ITS OWN slot (not
#                   folded directly into predictions.sh's Tue/Fri body)
#                   rather than adding CFB to predictions.sh unconditionally,
#                   which would also run it -- harmlessly, but pointlessly --
#                   on Tuesday.
#
# The builder HARD-EXITS on purpose if the ten-conference set drifts by
# name, records fail reconciliation, or the AP poll goes missing --
# `guarded` (not `run_soft`) is deliberate: on nonzero exit it keeps the old
# JSONs and turns the run red, never ships a partial. Two traps it guards
# against, so a red run isn't a mystery: the ESPN CFB scoreboard silently
# truncates if ANY `limit=` param is passed, and "American Conference" is a
# substring of "Mid-American Conference" -- the conference resolver is
# exact-match with a set-equality gate now.
#
# Needs REVALIDATE_SECRET in config.env (already there for predictions.sh).
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

guarded "self-test CFB" "$PY" scripts/predictions/build_cfb_sim.py --self-test

guarded "rebuild the CFB model (sim + AP-25 slate + grading)" \
  "$PY" scripts/predictions/build_cfb_sim.py --sims 20000

commit_paths "Auto: refresh CFB predictions [vercel skip]" \
  public/data/cfb-sim.json \
  public/data/cfb-predictions.json

# lib/cfbSim.ts uses the shared predictions-daily tag (deliberately), so this
# flush also invalidates PL/NFL/MLB -- cross-warm them too rather than leave
# them cold until their own next slot, mirroring predictions.sh's own note.
revalidate_ping "predictions-daily" \
  "/predictions/cfb" "/predictions/pl" "/predictions/nfl" "/predictions/mlb" "/predictions"
note "done"
