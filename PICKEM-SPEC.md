# Citizen of Nowhere Picks — Pick'em Games Spec

Replacing the "Beat the Model" section on `/play/arcade` with a pick'em product in the
mould of pickemsports.co, built entirely on prediction infrastructure the site already
runs. Companion prototype: `pickem-prototype.html` (playable, real MW1/Week 1 data).

## Summary

| Dimension | Position |
|---|---|
| Concept | **"Citizen of Nowhere Picks"** (name locked 2026-08-10): blind weekly picks vs the model, confidence pool, upset radar |
| Replaces | The two Beat the Model cards in the `model` section of `app/play/arcade/page.tsx` |
| Data needed | **None new for launch.** `pl-predictions.json` + `nfl-predictions.json` ledgers are the whole engine |
| Grading | Already built — the daily predictions workflow writes `result`/`score` into the ledger; the game just re-reads it |
| Identity | Ride the `/me` pattern exactly: localStorage signed out, Supabase table signed in, merge-up on first sign-in |
| First launch window | **PL Matchweek 1 locks Aug 21** — eleven days out. NFL Week 1 follows Sept 10 |
| Biggest differentiator | Upset Radar: only a site publishing both model AND market probabilities can run it |
| Biggest risk | Leaderboard integrity (client-side timestamps); solved with a `picked_at <= kickoff` server check |

## 1. What pickemsports.co does, and what to take

Their stack: Pre-Picks (season-long bracket locks), Game-Day Picks, head-to-head
rivals, private/public leagues, pick history with hits/misses/streaks, and
sponsor-funded prizes. Free to play; the sponsor pays for the leaderboard prize.

What transfers well here: **game-day picks** (our ledgers are literally built for
this), **streak/record tracking** (we already compute Brier and pick_correct per
entry — the same grading pass scores users), and **the standing rival**. Their weak
point is that the opponent is other users, which means a cold-start problem until
the player base exists. We don't have that problem: **the model is the house
player**. Every user has a named, credible opponent from day one, and "I beat the
CoN model in Week 3" is a shareable claim no generic pick'em can offer.

What NOT to copy at launch: prizes/sponsorship (regulatory surface, zero need),
brackets-as-Pre-Picks (our current Beat the Model season card already covers the
season-long lock; fold it in later as a fourth mode rather than day one), and
public leagues (needs user mass we don't have yet).

## 2. Data readiness by league

| League | Per-game ledger | Market probs | Season sim | Status |
|---|---|---|---|---|
| Premier League | ✅ `pl-predictions.json` (pH/pD/pA) | ⏳ appears when football-data posts odds | ✅ | **Launch-ready, MW1 = Aug 21** |
| NFL | ✅ `nfl-predictions.json` (pH) | ✅ ESPN lines, all 16 Week 1 games | ✅ | **Launch-ready, Week 1 = Sept 10** |
| MLB | ❌ season sim only (`mlb-sim.json`) | futures only | ✅ | Needs `build_mlb_sim.py` to emit a game ledger. Note the volume problem below |
| CFB | ❌ | — | — | Model planned with the preseason poll; ledger should follow the NFL shape |
| UCL | ❌ | — | — | Model planned after the draw; PL shape (3-way) with two-leg awareness |

Two design notes from the data:

- **MLB volume.** ~12–15 games/day is not a weekly slate, it's a daily one. Do not
  ask users to pick 15 baseball games; nobody will. The right MLB format is a
  curated **Daily 5** (the five most interesting games by model-market gap or by
  followed-team overlap), which also makes MLB the natural daily-retention hook
  between football weekends.
- **PL market probs arrive late.** football-data posts odds close to the matchweek,
  so Upset Radar is NFL-only until PL odds land in the ledger. The radar builder
  should simply filter `ledger.filter(e => e.market)` — it lights up automatically.

## 3. The three modes (as prototyped)

**The Slate (game-day picks).** Every game of the current PL matchweek / NFL week.
Picks are made **blind**: the model's call and probability bar reveal only after
the user commits, per game. This is the key UX decision — showing the odds first
turns the game into "agree with the model," which is boring and produces identical
cards. Blind picks create genuine divergence and make the reveal a micro-payoff 26
times a week. 10 pts per correct call; PL is three-way (draws are real), NFL
two-way. Picks lock at kickoff per game, not per slate.

**Confidence pool.** Rank your slate; slot value = points if the pick lands
(10-game PL slate: 10 down to 1). Default order = the model's confidence in *your*
picks, which is both a sensible default and a quiet lesson in what the model
thinks of your card. Reordering is where the skill lives.

**Upset Radar.** The five games with the largest |model pH − market pH| gap. The
user sides with the model or the market; when graded, the source with the lower
Brier on that game "wins" and siding with it pays +25. This is the mode with no
competitor analogue, it teaches what the site is actually about (model vs market),
and it is five taps, not twenty-six — the low-commitment entry point.

**The Model as house entry.** The ledger's own `pick` field is the model's card,
graded by identical rules. Weekly W/L vs the model is the headline stat; a season
head-to-head record ("You 7–5 vs the Model") is the retention spine.

## 4. Architecture: why this is cheap to build

The insight that makes this a small project: **the grading pipeline already
exists.** The daily predictions workflow (the one behind the `predictions-daily`
revalidate tag) writes `result`, `score`, `pick_correct`, and Brier fields into the
ledger after each game. A pick'em therefore never grades anything itself — it
stores `(event_key, pick, confidence, picked_at)` and, on every visit, joins picks
against the refreshed ledger. Grading is a pure client-side (or view-side) join.

Recommended shape, in order:

1. **Route**: an app route (`app/play/picks/page.tsx`, client component), not a
   static HTML shell. Unlike the kids' games, this one needs the Supabase client
   and the same ledger-fetch pattern as `lib/plSim.ts`. Fetch the two prediction
   JSONs client-side from the site's own `/data/*.json` (no new API).
2. **Anonymous tier**: picks in `localStorage` under one key
   (`con-picks-v1`), exactly like `con-following-v1`. Fully playable signed out:
   slate, confidence, radar, streaks, vs-model record.
3. **Signed-in tier**: reuse `useFollowing`'s skeleton verbatim — Google OAuth via
   the existing Supabase project, merge local picks up on first sign-in, optimistic
   writes. New table:

   ```sql
   create table picks (
     user_id uuid references auth.users not null,
     league text not null,            -- 'pl' | 'nfl' | ...
     season text not null,            -- '2026-27' | '2026'
     event_key text not null,         -- event_id (NFL) or date:home_slug (PL)
     mode text not null default 'slate',  -- 'slate' | 'radar'
     pick text not null,              -- 'H' | 'D' | 'A' | 'model' | 'market'
     confidence smallint,             -- slot value, null outside the pool
     picked_at timestamptz not null default now(),
     primary key (user_id, league, season, event_key, mode)
   );
   ```

   ⚠️ **Write the RLS policies at creation time.** The `skydb_structures` incident
   (RLS enabled, zero policies, silent empty arrays over HTTP 200) is exactly the
   failure mode this table would reproduce: a leaderboard that quietly shows
   nobody. Users read/write own rows; leaderboard reads go through a view.
4. **Locking**: client hides pick buttons at kickoff, but the *server* is the
   authority — the leaderboard view scores only rows where `picked_at` precedes
   the event's kickoff. Kickoff times come from the ledger itself. Without this,
   the global board is trivially gameable and not worth shipping.
5. **Leaderboard**: a SQL view (or nightly job) joining `picks` to a
   `results` table mirrored from the ledgers by the same daily workflow that
   grades them. One additional write step in an existing cron, no new service.

## 5. Scoring (v1, tune later)

Slate 10 pts per correct call. Confidence: slot value (n..1) as bonus on top of
the base 10 — a perfect 10-game PL card is 100 + 55. Radar: +25 per correct side.
Streak: consecutive correct slate calls across leagues in kickoff order, shown
with the 🔥 treatment. Weekly "Beat the Model" flag when your slate points exceed
the house card's. Keep all scoring integer and explainable in one sentence each;
resist Brier-scoring *users* (correct-but-unconfident feels bad and needs a
statistics lecture to explain).

## 6. Rollout

| Phase | When | Ships |
|---|---|---|
| 1 | **Before Aug 21** | PL Slate + Confidence, anonymous tier, vs-model record. The MW1 lock is a real deadline and a real hook: "the model has published its card; yours locks Friday" |
| 2 | Early Sept | Supabase `picks` + leaderboard + Google sign-in. NFL Slate and Upset Radar go live for Week 1 (Sept 10) with market data |
| 3 | Sept–Oct | CFB ledger with the model's launch |
| 4 | **October (MLB playoffs)** | MLB Postseason Pick'em — decided 2026-08-10: skip the regular season entirely, launch with the playoffs. Series-winner picks per round plus per-game picks; needs a playoff-only game ledger from `build_mlb_sim.py` (a far smaller build than a full-season one), and `mlb-sim.json` already carries pennant/WS odds for the model's card |
| 5 | After UCL draw | UCL slate; fold the existing Beat the Model season card in as "Season Locks" (the Pre-Picks analogue), retiring the old static pages the same way WC2026 was retired (reachable, unlisted) |
| 6 | When numbers justify | Social: share-your-card images, head-to-head rival links, private leagues |

Arcade change at Phase 1: the `model` section in `app/play/arcade/page.tsx` swaps
its two cards for one Nowhere Picks card ("Call every game. Beat the model.");
`/play/beat-the-model-*.html` stay reachable for locked cards, per the WC2026
precedent already noted in that file's comments.

## 7. Decisions (Ashwin, 2026-08-10)

- **Name: "Citizen of Nowhere Picks."** Locked; use it on the arcade card, page
  title, and share cards.
- **No open-book mode.** Blind reveal only in v1; one scoring sentence per mode.
- **PL draws score like any other pick.** Calling the draw correctly pays the
  same 10 pts and full confidence slot value as calling a win — no special
  handling, no discount. (The earlier "unforgiving" note was about variance only:
  three-outcome picks land less often than two-outcome NFL picks, so PL
  confidence scores swing harder. Accepted as the skill of the format; sanity-check
  the feel after MW1 resolves.)
- **MLB waits for the playoffs.** No regular-season Daily 5. October launches a
  Postseason Pick'em instead (series + game picks) — see Phase 4.

## 8. Further decisions (Ashwin, 2026-08-10)

- **MLB Postseason format: series winners + daily game-by-game picks.** Two
  scoring layers per round: lock the series winner before Game 1 (bigger payout,
  graded once), then pick each game on the day it's played (standard 10-pt slate
  picks). The daily layer keeps October a daily-visit habit; the series layer is
  the bragging-rights call. Both grade from the same playoff ledger, and the
  model's card does both too — its series calls come from `mlb-sim.json` series
  odds, its game calls from the per-game ledger.
- **Leaderboard ships global-only.** No friends filter until the player base
  justifies it; rival links and private boards move to the social phase (Phase 6).

*Spec written 2026-08-10 against `pl-predictions.json` / `nfl-predictions.json`
(both generated 2026-08-07), `lib/useFollowing.ts`, and `app/play/arcade/page.tsx`.*
