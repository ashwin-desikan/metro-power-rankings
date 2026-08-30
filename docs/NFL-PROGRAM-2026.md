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

## Stage 2 addendum (agreed 2026-08-30 evening) — the Comeback layer

Play-by-play-derived: largest deficit overcome per franchise and per metro,
plus the conditional ceiling by clock state (the largest deficit ever
overcome from each point in the game). Distributed per the
metrics-board-is-not-a-page rule: claims on team and metro pages, one deep
dive, and an in-season "comeback watch" row on the predictions hub (current
deficit vs the historical win rate at that clock state). Covers 1999-2025
from the nflverse cache now; extends season by season as the PFR backfill
(below) lands. Inspiration: comebackceiling.com (Jed Christiansen) — the
conditional-ceiling framing is the borrowed idea; metro rollups, the century
of pregame expectation and live picks integration are ours.

## GSIS archive (verified 2026-08-30 in Ashwin's authenticated session)

Ashwin holds an NFLGSIS.com login. GameStatsLive covers seasons 1981-2026
with quarter scores + OT on every game and official gamebook PDFs at
`/{season}/{pre|reg|post}/{week}/{gameId}/Gamebook.pdf` (authenticated).
Pilot verdict on three gamebooks: 1998 = digital PDF with full genuine pbp
(down/dist/spot/clock per play) -- direct text extraction; 1994 = clean
SuperStat scan -- OCR-friendly; 1981 = typewriter/handwriting scan -- the
scoring-plays table (team, qtr, clock, running score) is legible, which
alone carries the comeback layer, and team-stats TOUCHDOWNS rows carry net
TDs. Every era has the scoring summary. 1977-1980 is NOT in the archive.
Rules: respect the account terms; derive aggregates, cite the source, never
redistribute PDFs; the server 503s bare requests -- slow and resumable
only; bulk pulls need Ashwin's explicit approval per the budget gate.

## PFR historical pbp backfill (SUPERSEDED for 1981+ by GSIS, 2026-08-30)

Kept as the record of why: PFR sits behind Cloudflare Turnstile; the mini
correctly refused to bypass and the no-bypass rule binds every session.
Jed Christiansen email / SR licensing remain the only routes for 1977-1980,
if that tail is ever wanted.

Sports Reference digitized official gamebooks: PFR now carries full
play-by-play back to 1977 (expanded Aug 2025, extended to 1977 Aug 2026).
No alternates exist in the open (nflverse starts 1999, ESPN early 2000s,
Armchair 2000+ paid); PFR is the source. The job, in tranches:

1. Seeded RANDOM pilot: 20 games from 1998, to validate the parser and
   measure PFR's throttle tolerance. STOP after the pilot, project the
   full cost, get Ashwin's approval before any sweep (budget-gate rule).
2. Tranche one: the full 1998 season (~250 games incl. playoffs).
3. Backward sweep 1997 -> 1977, one season per tranche.

Rules: polite rate (PFR throttles and bans aggressive scrapers), resumable,
never re-fetch a cached game; cache to gitignored data/nfl/pfr-pbp/ as one
parquet per season; reconcile every scraped game's final score against the
workbook's rows for that season, mismatches surface and hard-stop, never
auto-repair. Fallback if a game's pbp is patchy: its scoring summary alone
still supports the comeback layer (deficits only change on scores).
In parallel, one courtesy email to Jed Christiansen asking for his compiled
dataset costs nothing. This backfill serves content, not the model: the
backtest gate stays 1999-2025 on nflverse.

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

## Stage 1 log

- 2026-08-30: nflverse ETL SHIPPED (`6e64c365f`, mini). pbp 1999-2025 +
  current, rosters/depth_charts/snap_counts current-season-only, injuries
  excluded. RULING: current-season-only scope for the three live feeds
  stands; historical QB starts derive from pbp (approximation on record:
  slightly flatters the model on surprise scratches).
- 2026-08-30: BACKTEST HARNESS landed (`scripts/predictions/backtest_harness.py`).
  Walk-forward 2001-2025, graded on market-priced games only; empirical
  abbrev->franchise mapping with a hard 1:1 reconciliation (7,273 games,
  scores agree; 3 documented nflfastR gaps allowlisted, all pre-2001).
  GATE 1 RESULT: EPA alone −6.10% vs market — FAILS. Elo re-expressed
  through the harness logistic −4.08%. **Elo+EPA −3.42% vs market, beats
  the Elo backbone in 23 of 25 seasons out of sample — PASSES as an
  increment.** EPA enters points-v3 as a feature beside the backbone,
  never instead of it. Next gated candidates: hyperparameters (tuned
  honestly: tune window 2001-2012, validate 2013-2025), the QB layer,
  then rest/travel/weather.

- 2026-08-30 (later): GAMEBOOK PILOT verdict logged in the GSIS section
  above. STANDINGS MODULE SHIPPED: `scripts/predictions/nfl_standings.py`
  computes every official tiebreaking statistic GSIS's own standings page
  carries (records incl. ties-as-half, H2H, common games + net pts, SOV/SOS
  pct + combined wins, conf + league combined PF/PA ranks, net pts, net TDs)
  and applies the official division and wild-card ladders (multi-club
  restarts, sweep rule, min-4 common games; coin-toss steps returned as
  flagged ties for the sim to randomize). 🔴 GOLDEN-TESTED against the GSIS
  2025 standings export (`data/nfl/fixtures/gsis-standings-2025.txt`,
  local): 32 teams x 11 columns, ZERO mismatches, run on the box via
  `standings_golden_test.py`; seeds reproduce 2025's actual clinch picture.
  2026 wiring plan: build_nfl_sim.py imports the ladder for in-sim
  tiebreaks (replacing record-then-random) and a weekly standings JSON is
  emitted in-season (TD counts from the ETL's current-season pbp; ESPN
  results the sim already holds). Earlier years: metrics computable from
  the expectation ledger (1920+) except net TDs (pbp 1999+, gamebooks
  1981-98); era alignments come from Year by Year, and today's ladder is
  for ANALYSIS only -- never re-adjudicate a historical seed.

- 2026-08-30 (night): TWO MORE STAGE 1 BRICKS.
  (a) THE SIM RUNS THE OFFICIAL LADDER: build_nfl_sim.py's
  wins->h2h->random tiebreaks replaced with the official win-based ladder
  (h2h with the 3+-club sweep rule, division, common games incl. the
  wild-card minimum-4 clause, conference, SOV, SOS, official order for
  both ladders; division-mate reduction on wild cards; ties surviving SOS
  fall to rng -- the points-based steps need scores a win-only sim lacks,
  documented). Self-test grew 21 -> 24 cases (division step, sweep rule,
  SOV decision).
  (b) HYPERPARAMETERS TUNED HONESTLY: 3x3 grid on 2001-2012 ONLY, one
  validation on 2013-2025. Adopted decay=0.90, rollover=0.50 (validation
  -3.50% vs -3.69% for the old 0.95/0.65). A finer grid corner (0.85/0.30)
  won the tune window and LOST validation (-3.60%): overfitting, rejected
  -- the split doing its job. Sweep tooling: data/nfl/sweep_hparams.py
  (gitignored).
  FULL-WINDOW HEADLINE after both: **Elo+EPA -3.15% vs market over
  2001-2025 (was -3.42% at old defaults; backbone -4.23%), beats the
  backbone 24/25 seasons out of sample.** Next levers, in gate order:
  the QB layer, then rest/travel/weather.

## Calendar

Kickoff Wed 2026-09-09 (NE at SEA). v3 shadow from Week 1 if ETL + harness
exist by then; otherwise v2 alone picks Week 1. Gate review after Week 3
(~09-28). Stage 2 complete end of Oct. Stage 3 live before Thanksgiving.
Wild Card Jan 16-18. Super Bowl LXI 2027-02-14, SoFi. Nine international
games through the season (travel-model showcases).
