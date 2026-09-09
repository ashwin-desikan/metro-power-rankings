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
# Cadence (season window ~Aug 15 - Jan 20), THREE jobs.toml entries -> this one
# script. Kept as their own slots rather than folded into predictions.sh's
# Tue/Fri body, which would also run CFB on Tuesday -- harmlessly, but
# pointlessly:
#   Sun 23:40 UTC - the main slot. When the AP poll lands ~18:00 UTC Sunday,
#                   this grades the week and publishes the next AP-25 slate a
#                   few hours later.
#   Wed 11:40 UTC - added 2026-09-09 (was the Friday slot, moved). The Sunday
#                   assumption is not always true: ESPN carried the Week 2 poll
#                   dated 09-08, after Sunday's run, so the slate sat on last
#                   weekend's games. Wednesday catches a Mon/Tue poll.
#   Fri 11:40 UTC - restored 2026-09-09 alongside Wednesday. Grades Wed/Thu
#                   games, adds any fixture that entered the AP-25 window after
#                   Wednesday, refreshes the sim/ratings/playoff odds.
#
# What NO later slot does is revise a pick already made. grade_and_extend()
# skips `if gid in known`, so model, market, blend and pick are frozen by the
# run that first saw the game. Deliberate: a pick free to drift toward the
# closing line would converge on the market and the Ledger's model-vs-market
# Brier would stop meaning anything. Publishing earlier therefore trades a
# less-informed market snapshot for an earlier slate -- that is the whole
# point of the Wednesday slot, and it is a product decision, not a bug.
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

# Before the model: build_cfb_sim.py reads the consensus when it freezes a
# ledger entry. Soft all the way down (see its __main__), so a dead book
# costs the meta-market and not the day's model.
guarded "self-test the meta-market" "$PY" scripts/predictions/build_meta_market.py --self-test
guarded "rebuild the CFB meta-market" "$PY" scripts/predictions/build_meta_market.py --league cfb

guarded "self-test CFB" "$PY" scripts/predictions/build_cfb_sim.py --self-test

guarded "rebuild the CFB model (sim + AP-25 slate + grading)" \
  "$PY" scripts/predictions/build_cfb_sim.py --sims 20000

# The *-sim-history.json snapshots were written by the builders from
# 2026-09-03 but never staged, so the week-over-week deltas and
# sparklines on the hubs stayed blank. Added 2026-09-04.
commit_paths "Auto: refresh CFB predictions [vercel skip]" \
  public/data/cfb-sim.json \
  public/data/cfb-predictions.json \
  public/data/cfb-meta-market.json \
  public/data/cfb-sim-history.json

# lib/cfbSim.ts uses the shared predictions-daily tag (deliberately), so this
# flush also invalidates PL/NFL/MLB -- cross-warm them too rather than leave
# them cold until their own next slot, mirroring predictions.sh's own note.
revalidate_ping "predictions-daily" \
  "/predictions/cfb" "/predictions/pl" "/predictions/nfl" "/predictions/mlb" "/predictions"
note "done"
