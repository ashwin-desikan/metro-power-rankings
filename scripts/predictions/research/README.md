# What predicts Champions League outcomes? (the ucl-poisson-v2 study)

*2026-08-30. Commissioned after ucl-poisson-v1 ranked Sporting CP third on
champion odds and the proposed fix — "blend in UEFA club coefficients" — was
challenged as untested. Everything below is computed from this site's own
archives and is reproducible from the three scripts in this folder.*

## Data

| Source | Contents | Span |
|---|---|---|
| `eur_competition_matches` (Supabase) | every European tie, with scores | 1955-56 to 2025-26, 14,871 ties = 28,155 matches |
| `hub-*.json` (67 files) | domestic league tables, the site's per-season club score, country coefficients | 1959-60 to 2025-26 |
| `uefa_club/team_coeff_history` (Supabase) | real UEFA per-season club coefficient points | 2008-09 to 2025-26 |

Outcomes, a rolling European Elo, and a UEFA-style coefficient analogue are
all computed from the match archive itself, so the study lives in one club
namespace (1,162 of 1,188 names join the domestic hubs directly).

## Question 1 — is a club coefficient predictive, or merely descriptive?

**Predictive, but strictly dominated.** Within-season Spearman of preseason
predictors against knockout depth (mean over seasons):

| Predictor (all preseason) | 1992-2026 | 2016-2026 |
|---|---|---|
| Site club score (t-1) | **0.41** | **0.44** |
| Real UEFA 5y coefficient | 0.42 (2014+) | 0.42 |
| Country coefficient | 0.37 | 0.39 |
| v1 formula (dom ratios + 0.8·log country) | 0.33 | 0.40 |
| Reconstructed 5y coefficient | 0.24 | 0.22 |
| Prior-season coefficient points | 0.20 | 0.14 |
| European-match Elo | ~0.08 | ~0.11 |
| Domestic attack rel. to own league | 0.06 | 0.10 |
| Domestic defence rel. to own league | ~0.00 | ~0.00 |

So: a five-year coefficient genuinely carries forward-looking signal (it is
not just a record of the past), but in a multivariate fit its weight goes to
zero or negative the moment the site score enters — same information, worse
summary. The claim "coefficients only describe the past" is wrong; the claim
"coefficients are the best available strength measure" is also wrong.

## Question 2 — what about domestic form?

Near-zero across leagues, and **non-monotone at the extremes**: bucketing
group matches by the domestic-dominance gap, the quintile where a club most
out-dominates its own league relative to its opponent actually shows a
*negative* mean goal difference. Dominating a mid-tier league is anti-signal
— this is precisely the mechanism that put Sporting third in v1.

## Question 3 — can we do better with an Elo?

Not with this data. European-only Elo sees ~10 matches per club per season;
after fixing three successive design bugs (documented in
`cl_predictors_study.py`) it still could not separate the field
out-of-sample. Five-year aggregates exist because match-sparse Europe cannot
support per-match ratings. (ClubElo works because it ingests weekly domestic
match results, which this archive does not contain.)

## Two structural facts worth publishing on their own

1. **Home advantage in European league-phase/group football is tiny**: 1.44
   home goals v 1.34 away over 6,216 matches — 0.035 in log-goals, roughly a
   quarter of typical domestic home advantage.
2. **Group points per game is a bad outcome variable**: groups differ wildly
   in difficulty, so within-season correlations against group points are
   ~0.1 for every predictor while the same predictors hit 0.4+ against
   knockout depth.

## The fitted model (what v2 ships)

Poisson MLE on 6,216 CL/EL/ECL group and league-phase matches, 1993-2026:

    lam_home = exp(b0 + hfa + S_home − S_away)
    S = tau · [ 0.0335·z(site_score) + 0.019·z(log country_coeff) ]

Era-cross-validated; features beyond these two add nothing out-of-sample.
Held out entirely from training, the two completed new-format league phases
(2024-25, 2025-26): **70.6% decisive-match accuracy v 62.9% for the v1
formula** (n=288).

`tau = 3.5` is the season-level calibration: match-level fits are attenuated
by feature noise, and compounding the raw slope over a 17-match campaign
under-spreads titles (a 6.7% favourite). Replaying 2004-2024 with each
season's real group compositions, tau=3.5 maximizes the log-likelihood of
the actual champions (2.92 → 2.46 per season). One check leaning the other
way, recorded honestly: the model's preseason favourite won 2 of 18 real
seasons while tau=3.5 expects 4 — binomially compatible (~8%), revisit as
seasons accrue.

Effect on the 2026-27 table: Sporting CP fall from 12.8% champion (v1) to
1.3%; the board is led by PSG 15.4%, Bayern 14.5%, Arsenal 13.0% — the top
of the site's own rating, not the loudest domestic goal difference.

## Reproduction

    RESEARCH_DIR=~/research python3 scripts/predictions/research/cl_predictors_study.py
    RESEARCH_DIR=~/research python3 scripts/predictions/research/fit_ucl_strength.py
    RESEARCH_DIR=~/research python3 scripts/predictions/research/backtest_ucl.py

`RESEARCH_DIR` holds the Supabase exports (`eur_matches.json`,
`uefa_coeff_rows.json`, plus derived files); the export queries are in the
study script's docstring. The shipped artifact is
`scripts/predictions/ucl_strength_weights.json` — refit on research runs,
reviewed, never on pipeline autopilot.
