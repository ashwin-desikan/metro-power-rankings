# The NFL Program 2026 — plan of record

Agreed with Ashwin 2026-08-30 (cloud session). Detail lives in the blueprint
artifact and project memory (`nfl-program-2026-blueprint`); this file is the
repo copy both machines can read. Read this before touching
`scripts/predictions/build_nfl_sim.py` or commissioning any NFL job.

## Decisions (locked)

1. Strategy first, then builds. North star: model skill + audience +
   engagement as ONE staged program.
2. Data layer: FULL nflverse adoption (pbp/EPA, rosters, depth charts, snap
   counts) beside NFL_all.xlsx (century backbone) and ESPN (live + market).
   Sentiment (VADER/Reddit/news) REFUSED — would not survive the backtest gate.
3. Engagement: deepen /play/picks only. NO DFS-style lineup game this season.
4. Standing refusals unchanged: no money, no affiliate odds links, no
   parlays, no daily loop, no new metrics board.

## Stage 1 — points-v3, the engine (now -> early Oct)

- EPA ratings: opponent-adjusted EPA/play, off/def, pass/rush, recency
  weighted. Replaces raw scoring margin as the stats half of the blend; the
  de-vigged DK futures half stays.
- QB layer (headline feature): starter from nflverse depth charts + ESPN
  injury reports; value gap priced in points when the starter sits.
  NOTE: the nflverse injuries feed DIED after 2024 — never build on it.
- Situational: rest differential, short weeks, byes, travel distance + time
  zones from our own stadium/metro geography, altitude, roof, Open-Meteo
  (free, keyless) game-time weather for outdoor stadiums.
- Sim: real NFL tiebreaker ladder (replaces record-then-random), ties
  modeled, score-margin distributions retained.
- 🔴 THE BACKTEST GATE: every feature must improve out-of-sample Brier vs
  the market layer, walk-forward 1999-2025. v2 keeps the live picks until v3
  passes. v3 runs as a SHADOW ledger from Week 1, frozen + graded in public;
  every frozen pick carries `model_version`; the switch date is marked on
  the Ledger. If v3 loses in shadow, publish that too.
- Target, stated plainly: -3.00% -> about -1% skill is a strong season.
  Beating the closing line outright is speculation, labeled as such.

## Stage 2 — audience (Weeks 1-8)

Preview capsules with the "why" (top feature contributions); weekly
against-expectation recap; metro dossier block on /rankings/[slug];
/how-we-grade method + audit page; Substack serial "A season against the
closing line" + the deferred home-advantage essay.

## Stage 3 — picks deepened (Weeks 6-12)

Visible difficulty multipliers priced off market prob; four leaderboards
from one dataset (accuracy / calibration / best upset called / coverage);
monthly-reset season ladder; reader-vs-model-vs-market strip on
/predictions/scoreboard. Repairs: server-rendered slate for the no-JS
"Loading the slate..." terminus; /play links to /play/picks.

## Mini runner (Stage 1, NOT yet commissioned)

One new nightly in-season runner, guarded mode, same pattern as cfb-sun /
cfb-fri: pull nflverse assets, rebuild ratings, hand the sim its inputs.
Parquet caches stay on the mini + gitignored `data/`; only derived JSON
enters the repo. The model must degrade gracefully to v2 inputs when a feed
is stale, and staleness is surfaced, never papered over.
Source cadences: pbp nightly (raw ~15 min post-final, cleanest Thu);
rosters + depth charts daily 07:00 UTC; snap counts 0/6/12/18 UTC (PFR);
schedules every 5 min.

## Calendar

Kickoff Wed 2026-09-09 (NE at SEA). v3 shadow from Week 1 if ETL + harness
exist by then; otherwise v2 alone picks Week 1. Gate review after Week 3
(~09-28). Stage 2 complete end of Oct. Stage 3 live before Thanksgiving.
Wild Card Jan 16-18. Super Bowl LXI 2027-02-14, SoFi. Nine international
games through the season (travel-model showcases).
