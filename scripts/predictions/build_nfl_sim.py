#!/usr/bin/env python3
"""NFL 2026 season simulator + weekly game predictions + ledger.

The NFL leg of /predictions (same convention as the Premier League hub):
  public/data/nfl-sim.json          - season odds per team (exp wins, division,
                                      playoffs, conference, Super Bowl LXI)
  public/data/nfl-sim-history.json  - one snapshot per build date, for trend
                                      lines on the same numbers
  public/data/nfl-predictions.json  - upcoming-game predictions + the graded
                                      ledger tracking us vs the market

MODEL (points-v3, "site data + market + spreads, correlated noise"):
  - Team strength = regressed scoring margin per game from the last three
    regular seasons, BLENDED with a market rating implied by the DraftKings
    Super Bowl futures ESPN carries for all 32 teams (de-vigged, mapped onto
    the points scale via the model's own rating-to-title-odds curve, weight
    MARKET_W_SEASON). The stats say what teams have done; the futures say
    what the market knows about now - QB moves, rosters, the champion's
    continuity - that margins cannot see. Ratings come from (ESPN standings 2023/24/25, weights .15/.30/.55, shrunk
    toward the mean by REGRESS - year-to-year NFL margin correlation is weak
    and a preseason model should say so). In-season, actual 2026 results are
    folded into the rating at a weight growing with games played.
  - Each game: P(home) = Phi((r_home - r_away + HFA) / SIGMA_GAME), the
    classic points-spread translation (HFA 1.6 pts, sigma 13.4), with HFA
    dropped to 0 for a neutral-site game (ESPN's competition.neutralSite).
    Ties are ignored (~0.4% of NFL games; documented approximation).
  - The REAL 2026 schedule (all 272 games, ESPN per-team schedules) is
    simulated with per-season rating noise. Division winners and seeds via
    the OFFICIAL tie-break ladder's win-based steps (h2h with the 3+-club
    sweep rule, division, common games incl. the wild-card minimum-4 clause,
    conference, strength of victory, strength of schedule, in the official
    order; the points-based steps that follow them are beyond a win-only
    sim, so a tie surviving SOS falls to random -- the documented
    approximation, replacing the old wins->h2h->random). Full score-based
    ladders live in nfl_standings.py (golden-tested against GSIS's 2025
    standings). Seeds 1-7 per conference; the actual bracket (2v7 3v6 4v5,
    1-seed bye, reseeded divisional, championship, neutral-site Super Bowl).

POINTS-V3 additions: per-season noise now has three correlated layers (a
league-wide HFA jitter, a per-division jitter, and a per-team jitter sized
so the total matches an adaptive sigma that shrinks as the season plays out
and widens where the stats and market disagree about a team). ESPN's posted
spreads feed a ridge-regularized market rating (prior = the futures rating)
that takes over the market blend once enough of them accumulate. Every
simulated season draws from common random numbers keyed to its index, so a
rating change does not reshuffle which games "get unlucky" between builds.
A cheap stats-only "lite" tier runs alongside the full "classic" run at the
same seed for comparison in `tiers`. Win-count percentiles, playoff-leverage
swings for the upcoming window, and bubble odds are all collected from the
same run.

WEEKLY PREDICTIONS + LEDGER: regular/post-season games in the next window
(reaching ahead to the first week when quiet) get a model win probability;
ESPN's posted line (moneyline de-vigged, else the spread through the same
Phi) provides the market column and a 50/50 blend that makes the pick.
Predictions freeze on first sight; later runs grade them against final
scores and accumulate pick accuracy + Brier for model, lite, market and
blend.

    python scripts/predictions/build_nfl_sim.py               # build + write
    python scripts/predictions/build_nfl_sim.py --dry
    python scripts/predictions/build_nfl_sim.py --self-test   # offline tests
    python scripts/predictions/build_nfl_sim.py --sims 50000

Network: ESPN only (Windows box / CI; the Cowork sandbox is blocked).
"""
import io
import json
import math
import os
import random
import sys
import urllib.request
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_common as sc
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_SIM = os.path.join(ROOT, "public", "data", "nfl-sim.json")
OUT_PRED = os.path.join(ROOT, "public", "data", "nfl-predictions.json")
OUT_HIST = os.path.join(ROOT, "public", "data", "nfl-sim-history.json")
# Written by build_meta_market.py, which must run BEFORE this builder in the
# runner. Read-only here and soft: a missing or stale meta-market must never
# fail the model build, it just means a ledger entry freezes without one.
IN_META = os.path.join(ROOT, "public", "data", "nfl-meta-market.json")

SEASON = 2026
STRENGTH_SEASONS = [(2025, 0.55), (2024, 0.30), (2023, 0.15)]
REGRESS = 0.55        # keep 55% of past margin; shrink the rest to zero
HFA = 1.6             # home-field advantage, points
SIGMA_GAME = 13.4     # sd of an NFL game margin around the spread
SIGMA_SEASON = 2.5    # per-simulated-season rating noise, points (humility)
MARKET_W_SEASON = 0.45  # weight of the futures-implied rating in the blend
CALIB_SIMS = 4000     # quick pre-sim that maps rating <-> title odds
MATCH_BLEND_W = 0.5
WINDOW_DAYS = 8
DEFAULT_SIMS = 20000
ESPN = "https://site.api.espn.com/apis"

# points-v3: correlated season-noise layers and the adaptive-sigma / market
# rating / tiering knobs (contract 2026-09-03).
HFA_SD = 0.6              # sd of the per-season league-wide HFA jitter
DIV_SD = 1.0               # sd of the per-season, per-division jitter
SIGMA_FLOOR_FRAC = 0.45    # floor on adaptive sigma as a fraction of SIGMA_SEASON
DISAGREE_K = 0.5           # widens a team's sigma by this * |stats - market|
TIER_SIMS = 5000           # sim count for the stats-only "lite" tier
SPREAD_LAMBDA = 2.0        # ridge weight (games-equivalent) pulling spread ratings to prior
SPREAD_LOOKBACK_DAYS = 28  # ledger market.spread entries older than this are dropped
HISTORY_KEEP = 180         # max snapshots kept in nfl-sim-history.json

# The eight divisions (stable since 2002). Verified against ESPN's 2026 team
# list at build time (verify step inside build()).
DIVISIONS = {
    "AFC East": ["Buffalo Bills", "Miami Dolphins", "New England Patriots", "New York Jets"],
    "AFC North": ["Baltimore Ravens", "Cincinnati Bengals", "Cleveland Browns", "Pittsburgh Steelers"],
    "AFC South": ["Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Tennessee Titans"],
    "AFC West": ["Denver Broncos", "Kansas City Chiefs", "Las Vegas Raiders", "Los Angeles Chargers"],
    "NFC East": ["Dallas Cowboys", "New York Giants", "Philadelphia Eagles", "Washington Commanders"],
    "NFC North": ["Chicago Bears", "Detroit Lions", "Green Bay Packers", "Minnesota Vikings"],
    "NFC South": ["Atlanta Falcons", "Carolina Panthers", "New Orleans Saints", "Tampa Bay Buccaneers"],
    "NFC West": ["Arizona Cardinals", "Los Angeles Rams", "San Francisco 49ers", "Seattle Seahawks"],
}
TEAM_DIV = {t: d for d, ts in DIVISIONS.items() for t in ts}
TEAM_CONF = {t: d.split()[0] for t, d in TEAM_DIV.items()}
TEAMS = sorted(TEAM_DIV)


def slugify(name):
    s = name.lower()
    return "-".join(w for w in "".join(c if c.isalnum() or c == " " else " " for c in s).split())


def fetch_json(url, soft=False):
    # No User-Agent on purpose: urllib's own library token is the only shape
    # that passed from every vantage we tested on 2026-08-05. The mini's edge
    # 403s "CitizenOfNowhere/1.0", branded tokens and browser spoofs alike.
    # Full measured matrix and the reasoning live in build_mlb_sim.py's
    # fetch_json docstring. Do not add a UA back here without re-measuring.
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.load(r)
    except Exception as e:
        if soft:
            print("soft-fetch miss: %s (%s)" % (url, e))
            return None
        raise SystemExit("required fetch failed: %s (%s)" % (url, e))


# ------------------------------------------------------------------ ratings

def season_margins(season):
    """{team: (margin_per_game, games)} from ESPN's REGULAR-season standings.

    seasontype=2 pinned. Called only for completed seasons (STRENGTH_SEASONS),
    where the unpinned default does resolve to the regular season -- verified
    2026-09-04, season=2025 returns the Patriots at 14-3 with 490 points for --
    so this is a no-op today. It is here anyway because the same endpoint
    unpinned was serving PRESEASON for the current season that morning, and a
    rating built on preseason margins is not a rating. The current season never
    reaches this function (played_results() reads the scoreboard and filters
    season.type to 2 and 3), so this is belt to that braces.
    """
    d = fetch_json("%s/v2/sports/football/nfl/standings?season=%d&seasontype=2"
                   % (ESPN, season))
    out = {}
    for ch in d.get("children", []):
        for e in ch.get("standings", {}).get("entries", []):
            stats = {s["name"]: s.get("value") for s in e.get("stats", [])}
            g = (stats.get("wins") or 0) + (stats.get("losses") or 0) + (stats.get("ties") or 0)
            if not g:
                continue
            out[e["team"]["displayName"]] = (
                ((stats.get("pointsFor") or 0) - (stats.get("pointsAgainst") or 0)) / g, g)
    return out


def base_ratings(per_season, played_games):
    """Regressed, recency-weighted point margin per team, with 2026 actuals
    folded in as they accumulate. played_games: [(home, away, hs, as_)]."""
    cur = {t: [0.0, 0] for t in TEAMS}  # summed margin, games
    for h, a, hs, as_ in played_games:
        if h in cur:
            cur[h][0] += hs - as_; cur[h][1] += 1
        if a in cur:
            cur[a][0] += as_ - hs; cur[a][1] += 1
    ratings = {}
    for t in TEAMS:
        num = den = 0.0
        for season, w in STRENGTH_SEASONS:
            m = per_season.get(season, {}).get(t)
            if m:
                num += w * m[0]
                den += w
        r = REGRESS * (num / den) if den else 0.0
        gp = cur[t][1]
        if gp:
            wc = min(0.65, gp / 17.0 * 1.1)
            r = (1 - wc) * r + wc * REGRESS * (cur[t][0] / gp)
        ratings[t] = r
    m = sum(ratings.values()) / len(ratings)
    return {t: v - m for t, v in ratings.items()}


def phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def home_win_prob(r_h, r_a, hfa=HFA):
    return phi((r_h - r_a + hfa) / SIGMA_GAME)


# ----------------------------------------------------------------- schedule

def espn_teams():
    d = fetch_json("%s/site/v2/sports/football/nfl/teams" % ESPN)
    out = {}
    for grp in d.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
        t = grp.get("team", {})
        out[t.get("displayName")] = t.get("id")
    return out


def full_schedule(team_ids):
    """All 272 regular-season games [(event_id, iso_date, home, away, neutral)].
    `neutral` is ESPN's competition.neutralSite flag (e.g. the London/Madrid/
    Melbourne games), appended at the end so earlier positions never move."""
    games = {}
    for name, tid in team_ids.items():
        d = fetch_json("%s/site/v2/sports/football/nfl/teams/%s/schedule?season=%d&seasontype=2"
                       % (ESPN, tid, SEASON))
        for ev in d.get("events", []):
            comp = (ev.get("competitions") or [{}])[0]
            home = away = None
            for c in comp.get("competitors", []):
                nm = (c.get("team") or {}).get("displayName")
                if c.get("homeAway") == "home":
                    home = nm
                elif c.get("homeAway") == "away":
                    away = nm
            if home in TEAM_DIV and away in TEAM_DIV:
                games[ev["id"]] = (ev.get("date", "")[:10], home, away, bool(comp.get("neutralSite")))
    return [(gid,) + v for gid, v in sorted(games.items(), key=lambda kv: kv[1][0])]


def played_results(schedule_window_days=400):
    """Completed 2026 regular/post-season games from ESPN scoreboards, by
    scanning the season window.
    [(event_id, home, away, hs, as_, type, neutral)]."""
    start = date(SEASON, 9, 1)
    end = min(date.today(), date(SEASON + 1, 2, 20))
    if end <= start:
        return []
    url = ("%s/site/v2/sports/football/nfl/scoreboard?dates=%s-%s&limit=400"
           % (ESPN, start.strftime("%Y%m%d"), end.strftime("%Y%m%d")))
    d = fetch_json(url, soft=True)
    out = []
    for ev in (d or {}).get("events", []):
        if ev.get("season", {}).get("type") not in (2, 3):
            continue
        comp = (ev.get("competitions") or [{}])[0]
        if not comp.get("status", {}).get("type", {}).get("completed"):
            continue
        home = away = None
        hs = as_ = None
        for c in comp.get("competitors", []):
            nm = (c.get("team") or {}).get("displayName")
            try:
                sc = int(c.get("score"))
            except (TypeError, ValueError):
                sc = None
            if c.get("homeAway") == "home":
                home, hs = nm, sc
            else:
                away, as_ = nm, sc
        if home in TEAM_DIV and away in TEAM_DIV and hs is not None and as_ is not None:
            out.append((ev["id"], home, away, hs, as_, ev["season"]["type"],
                        bool(comp.get("neutralSite"))))
    return out


def kickoff_iso(raw):
    """ESPN event date ('2026-09-11T00:20Z') -> full ISO UTC, or None."""
    for fmt in ("%Y-%m-%dT%H:%MZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(raw or "", fmt).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            pass
    return None


def upcoming_games(today, window_days):
    """Regular/post-season games not yet completed within the window (reaching
    ahead to the first batch when the near window is empty).
    [(event_id, iso, home, away, market_pH or None, kickoff_iso or None,
      neutral, spread or None)]."""
    def scan(days):
        d0 = today.strftime("%Y%m%d")
        d1 = (today + timedelta(days=days)).strftime("%Y%m%d")
        d = fetch_json("%s/site/v2/sports/football/nfl/scoreboard?dates=%s-%s&limit=100"
                       % (ESPN, d0, d1), soft=True)
        out = []
        for ev in (d or {}).get("events", []):
            if ev.get("season", {}).get("type") not in (2, 3):
                continue
            comp = (ev.get("competitions") or [{}])[0]
            if comp.get("status", {}).get("type", {}).get("completed"):
                continue
            home = away = None
            for c in comp.get("competitors", []):
                nm = (c.get("team") or {}).get("displayName")
                if c.get("homeAway") == "home":
                    home = nm
                else:
                    away = nm
            if home not in TEAM_DIV or away not in TEAM_DIV:
                continue
            out.append((ev["id"], ev.get("date", "")[:10], home, away,
                        market_home_prob(comp), kickoff_iso(ev.get("date")),
                        bool(comp.get("neutralSite")), market_spread(comp)))
        return sorted(out, key=lambda g: g[1])
    got = scan(window_days)
    if not got:
        far = scan(45)
        if far:
            first = far[0][1]
            cutoff = (datetime.strptime(first, "%Y-%m-%d") + timedelta(days=5)).strftime("%Y-%m-%d")
            got = [g for g in far if g[1] <= cutoff]
    return got


def market_home_prob(comp):
    """De-vigged home win prob from ESPN's posted odds: moneyline pair when
    present, else the spread through the Phi translation."""
    for o in comp.get("odds") or []:
        hml = (o.get("homeTeamOdds") or {}).get("moneyLine")
        aml = (o.get("awayTeamOdds") or {}).get("moneyLine")
        if hml and aml:
            ph = 100.0 / (hml + 100.0) if hml > 0 else -hml / (-hml + 100.0)
            pa = 100.0 / (aml + 100.0) if aml > 0 else -aml / (-aml + 100.0)
            if ph + pa > 0:
                return round(ph / (ph + pa), 4)
        spread = o.get("spread")  # negative = home favoured on ESPN
        if spread is not None:
            try:
                return round(phi(-float(spread) / SIGMA_GAME), 4)
            except (TypeError, ValueError):
                pass
    return None


def market_spread(comp):
    """Raw posted home spread from ESPN's odds (negative = home favoured),
    or None when nothing is posted yet. Kept separate from market_home_prob
    because the ledger stores the spread itself, not just its win prob."""
    for o in comp.get("odds") or []:
        spread = o.get("spread")
        if spread is not None:
            try:
                return float(spread)
            except (TypeError, ValueError):
                pass
    return None


# ------------------------------------------------------- market (futures)

def espn_team_ids_by_name():
    d = fetch_json("%s/site/v2/sports/football/nfl/teams" % ESPN, soft=True)
    out = {}
    for grp in (d or {}).get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
        t = grp.get("team", {})
        out[str(t.get("id"))] = t.get("displayName")
    return out

def american_prob(v):
    v = float(str(v).replace("+", ""))
    return 100.0 / (v + 100.0) if v > 0 else -v / (-v + 100.0)


def fetch_sb_futures():
    """{team: devigged SB win prob} from the futures market ESPN carries
    (DraftKings), or None when unavailable. Soft by design."""
    import re as _re
    f = fetch_json("https://sports.core.api.espn.com/v2/sports/football/leagues/"
                   "nfl/seasons/%d/futures?limit=50" % SEASON, soft=True)
    if not f:
        return None, None
    item = next((i for i in f.get("items", [])
                 if "Super Bowl Winner" in (i.get("name") or "")), None)
    if not item or not item.get("futures"):
        return None, None
    fut = item["futures"][0]
    id2name = espn_team_ids_by_name()
    probs = {}
    for b in fut.get("books", []):
        ml = b.get("value")
        m = _re.search(r"teams/(\d+)", (b.get("team") or {}).get("$ref", ""))
        name = id2name.get(m.group(1)) if m else None
        if name in TEAM_DIV and ml is not None:
            probs[name] = american_prob(ml)
    if len(probs) < 28:
        return None, None
    s = sum(probs.values())
    return {t: p / s for t, p in probs.items()}, (fut.get("provider") or {}).get("name")


def _fit_rating_from_logodds(pairs):
    """pairs: [(logodds, rating)] -> (a, b) least squares rating = a + b*lo."""
    n = len(pairs)
    sx = sum(x for x, _ in pairs); sy = sum(y for _, y in pairs)
    sxx = sum(x * x for x, _ in pairs); sxy = sum(x * y for x, y in pairs)
    denom = n * sxx - sx * sx
    if abs(denom) < 1e-9:
        return 0.0, 0.0
    b = (n * sxy - sx * sy) / denom
    a = (sy - b * sx) / n
    return a, b


def _logodds(p, floor=5e-4):
    p = min(max(p, floor), 1 - floor)
    return math.log(p / (1 - p))


def implied_ratings_from_spreads(obs, prior, lam=SPREAD_LAMBDA, hfa=HFA, sweeps=200):
    """Ridge-regularized team ratings from posted point spreads. See
    sim_common.implied_ratings_from_spreads for the full docstring; this
    wrapper only pins this builder's own defaults (sim_common's own
    defaults are lam=2.0, hfa=0.0, which differ from SPREAD_LAMBDA/HFA)."""
    return sc.implied_ratings_from_spreads(obs, prior, lam=lam, hfa=hfa, sweeps=sweeps)


# --------------------------------------------------------- adaptive sigma

def adaptive_sigma(frac_left, sigma_season=SIGMA_SEASON, floor_frac=SIGMA_FLOOR_FRAC):
    return sc.adaptive_sigma(frac_left, sigma_season, floor_frac)


def team_sigma(sigma_base, r_stats, r_market, disagree_k=DISAGREE_K):
    return sc.team_sigma(sigma_base, r_stats, r_market, disagree_k)


def div_residual_sd(sigma_adaptive, div_sd=DIV_SD, floor=0.25):
    return sc.layer_residual_sd(sigma_adaptive, div_sd, floor)


# --------------------------------------------------------------- intervals

percentiles = sc.percentiles
leverage_from_counts = sc.leverage_from_counts
band_for = sc.band_for


# ------------------------------------------------------------------- history

def upsert_snapshot(doc, date_iso, games_played, rows, keep=HISTORY_KEEP):
    return sc.upsert_snapshot(doc, date_iso, games_played, rows, "nfl", SEASON, keep=keep)


# ------------------------------------------------------------------ the sim

def _tally():
    return {"wins": 0.0, "division": 0, "playoffs": 0, "conf": 0, "sb": 0, "seed1": 0}


# ---- the official tie-break ladder, win-based steps ----------------------
# Points-based steps (combined PF/PA ranks, net points, net TDs) need scores
# a win-only sim does not have; a tie surviving SOS falls to rng. The
# score-based ladders live in nfl_standings.py (golden-tested vs GSIS 2025).

def _rec_pct(t, opps, h2h, meetings):
    g = sum(meetings[t].get(u, 0) for u in opps)
    if g == 0:
        return None
    return sum(h2h[t].get(u, 0) for u in opps) / g


def _ladder_steps(kind, tied, wins, h2h, meetings):
    """Yields (name, {team: value}) in the OFFICIAL order; higher wins.
    A step where no club has a value yields None values throughout."""
    tied_set = set(tied)
    if kind == "division" or len(tied) == 2:
        yield "h2h", {t: _rec_pct(t, tied_set - {t}, h2h, meetings) for t in tied}
    else:
        # wild card, 3+ clubs: h2h applies only to a sweep either way
        vals = {}
        for t in tied:
            others = tied_set - {t}
            if not all(meetings[t].get(u, 0) for u in others):
                vals[t] = None
                continue
            g = sum(meetings[t].get(u, 0) for u in others)
            w = sum(h2h[t].get(u, 0) for u in others)
            vals[t] = 1.0 if w == g else (-1.0 if w == 0 else None)
        yield "h2h-sweep", vals
    if kind == "division":
        yield "division", {
            t: _rec_pct(t, set(DIVISIONS[TEAM_DIV[t]]) - {t}, h2h, meetings)
            for t in tied}
    common = set.intersection(
        *[{u for u, n in meetings[t].items() if n > 0} - tied_set for t in tied])
    conf_steps = []
    if kind == "division":
        conf_steps.append(("common", common, 0))
        conf_steps.append(("conference", None, 0))
    else:
        conf_steps.append(("conference", None, 0))
        conf_steps.append(("common", common, 4))   # wild card: minimum 4
    for name, opps, min_games in conf_steps:
        if name == "conference":
            yield name, {
                t: _rec_pct(t, {u for u in meetings[t]
                                if TEAM_CONF[u] == TEAM_CONF[t]}, h2h, meetings)
                for t in tied}
        else:
            if min_games and not all(
                    sum(meetings[t].get(u, 0) for u in opps) >= min_games
                    for t in tied):
                continue
            yield name, {t: _rec_pct(t, opps, h2h, meetings) for t in tied}
    yield "sov", {
        t: (sum(h2h[t].get(u, 0) * wins[u] for u in h2h[t]) /
            (17.0 * max(1, sum(h2h[t].values())))) for t in tied}
    yield "sos", {
        t: sum(n * wins[u] for u, n in meetings[t].items()) / (17.0 * 17.0)
        for t in tied}


def ladder_pick(kind, tied, wins, h2h, meetings, rng):
    """Best club among an exactly-tied group. 3+ clubs restart the ladder
    whenever a step eliminates anyone, per the official procedure."""
    tied = list(tied)
    while len(tied) > 1:
        progressed = False
        for name, vals in _ladder_steps(kind, tied, wins, h2h, meetings):
            usable = {t: v for t, v in vals.items() if v is not None}
            if len(usable) < len(tied):
                if name == "h2h-sweep" and usable:
                    if list(usable.values()).count(1.0) == 1:
                        return next(t for t, v in usable.items() if v == 1.0)
                    dropped = [t for t, v in usable.items() if v == -1.0]
                    if dropped and len(dropped) < len(tied):
                        tied = [t for t in tied if t not in dropped]
                        progressed = True
                        break
                continue
            best = max(usable.values())
            leaders = [t for t, v in usable.items() if v >= best - 1e-12]
            if len(leaders) == 1:
                return leaders[0]
            if len(leaders) < len(tied):
                tied = leaders
                progressed = True
                break
        if not progressed:
            return tied[rng.randrange(len(tied))]   # coin-toss territory
    return tied[0]


def ladder_order(teams, kind, wins, h2h, meetings, rng):
    """Order an exactly-tied group, best first. Wild-card ordering reduces
    division-mates through the division ladder first, per the rules."""
    remaining = list(teams)
    out = []
    while len(remaining) > 1:
        pool = remaining
        if kind == "wildcard":
            by_div = {}
            for t in remaining:
                by_div.setdefault(TEAM_DIV[t], []).append(t)
            pool = [ts[0] if len(ts) == 1 else
                    ladder_pick("division", ts, wins, h2h, meetings, rng)
                    for ts in by_div.values()]
        w = ladder_pick(kind, pool, wins, h2h, meetings, rng)
        out.append(w)
        remaining.remove(w)
    out.extend(remaining)
    return out


def _order_by_wins(teams, kind, wins, h2h, meetings, rng):
    ts = sorted(teams, key=lambda t: -wins[t])
    out = []
    i = 0
    while i < len(ts):
        j = i
        while j < len(ts) and wins[ts[j]] == wins[ts[i]]:
            j += 1
        group = ts[i:j]
        if len(group) == 1:
            out.extend(group)
        else:
            out.extend(ladder_order(group, kind, wins, h2h, meetings, rng))
        i = j
    return out


def rank_division(teams, wins, h2h, meetings, rng):
    """Order a division: wins, then the official win-based ladder."""
    return _order_by_wins(teams, "division", wins, h2h, meetings, rng)


def playoff_field(wins, h2h, meetings, rng):
    """({conf: [seed1..seed7]}, {conf: best_non_qualifier_or_None}) from a
    simulated regular season. The second element is the "8th seed" -- the
    best wild-card team that missed -- needed for the bubble stat."""
    field = {}
    bubble_next = {}
    for conf in ("AFC", "NFC"):
        champs, rest = [], []
        for div, ts in DIVISIONS.items():
            if not div.startswith(conf):
                continue
            order = rank_division(ts, wins, h2h, meetings, rng)
            champs.append(order[0])
            rest.extend(order[1:])
        champs = _order_by_wins(champs, "wildcard", wins, h2h, meetings, rng)
        rest = _order_by_wins(rest, "wildcard", wins, h2h, meetings, rng)
        field[conf] = champs + rest[:3]
        bubble_next[conf] = rest[3] if len(rest) > 3 else None
    return field, bubble_next


def sim_game(r_h, r_a, rng, hfa=HFA):
    return rng.random() < home_win_prob(r_h, r_a, hfa)


def run_playoffs(field, r, rng):
    """-> (afc_champ, nfc_champ, sb_winner). Higher seed hosts (+HFA); the
    Super Bowl is neutral."""
    winners = {}
    for conf in ("AFC", "NFC"):
        s = field[conf]
        # wild card: 2v7 3v6 4v5; 1 bye
        wc = []
        for hi, lo in ((1, 6), (2, 5), (3, 4)):
            h, a = s[hi], s[lo]
            wc.append(h if sim_game(r[h], r[a], rng) else a)
        alive = [s[0]] + wc
        alive.sort(key=lambda t: s.index(t))
        # divisional: 1 vs lowest remaining; other two meet
        low = alive[-1]
        d1h, d1a = alive[0], low
        others = [t for t in alive if t not in (d1h, d1a)]
        w1 = d1h if sim_game(r[d1h], r[d1a], rng) else d1a
        w2 = others[0] if sim_game(r[others[0]], r[others[1]], rng) else others[1]
        # championship: better original seed hosts
        h, a = sorted((w1, w2), key=lambda t: s.index(t))
        winners[conf] = h if sim_game(r[h], r[a], rng) else a
    a, n = winners["AFC"], winners["NFC"]
    sb = a if sim_game(r[a], r[n], rng, hfa=0.0) else n
    return a, n, sb


def schedule_meetings(schedule):
    """{team: {opp: games}} from the full 272-game schedule (played and
    remaining alike) -- the static pairing counts the ladder needs. The
    trailing `neutral` element (if present) is ignored here; only who plays
    whom matters for the ladder's common-games counting."""
    m = {t: {} for t in TEAMS}
    for g in schedule:
        h, a = g[2], g[3]
        m[h][a] = m[h].get(a, 0) + 1
        m[a][h] = m[a].get(h, 0) + 1
    return m


def simulate(ratings, schedule, base_wins, played_h2h, sims, meetings, seed=2026,
             sigma_team=None, window_gids=None, full_schedule=None, hfa=HFA):
    """Monte Carlo the remaining schedule `sims` times.

    Common random numbers: season i draws its correlated rating shocks (a
    league-wide HFA jitter, a per-division jitter, a per-team jitter) and
    then ONE uniform per game of the FULL 272-game schedule -- in a fixed
    (date, gid) order, so a game's draw does not move as earlier games get
    played -- from random.Random(seed*1_000_003 + i); playoff seeding and
    tie-break draws come from a second random.Random(seed*7_919 + i), so
    neither stream's length depends on the other.

    `sigma_team`: {team: adaptive per-team sigma} (falls back to
    SIGMA_SEASON for any team missing from it). `window_gids`: event ids to
    collect playoff-leverage counts for (the ledger's upcoming window).
    `full_schedule`: the complete 272-game list for CRN indexing (defaults
    to `schedule` itself, fine when `schedule` already is the full slate,
    e.g. the calibration pre-sim).

    Returns a dict: acc (per-team tallies), win_lists (per-team season win
    counts across sims, for percentiles), leverage ({gid: {home, away,
    game}} point-of-playoff-odds swings), bubble (per-team count of
    seed-7-or-best-non-qualifier finishes)."""
    sigma_team = sigma_team or {}
    window_gids = set(window_gids or ())
    full_sched = full_schedule if full_schedule is not None else schedule
    full_sorted = sorted(full_sched, key=lambda g: (g[1], g[0]))
    gid_pos = {g[0]: i for i, g in enumerate(full_sorted)}
    n_full = len(full_sorted)
    div_names = sorted(DIVISIONS)
    e_sd = {t: div_residual_sd(sigma_team.get(t, SIGMA_SEASON)) for t in TEAMS}

    acc = {t: _tally() for t in TEAMS}
    win_lists = {t: [] for t in TEAMS}
    bubble = {t: 0 for t in TEAMS}
    lc = {gid: {"home": {"win_po": 0, "win_total": 0, "loss_po": 0, "loss_total": 0},
                "away": {"win_po": 0, "win_total": 0, "loss_po": 0, "loss_total": 0}}
          for gid in window_gids}

    for i in range(sims):
        rng = random.Random(seed * 1_000_003 + i)
        rng2 = random.Random(seed * 7_919 + i)
        hfa_s = hfa + rng.gauss(0.0, HFA_SD)
        div_noise = {d: rng.gauss(0.0, DIV_SD) for d in div_names}
        team_noise = {t: rng.gauss(0.0, e_sd[t]) for t in TEAMS}
        r = {t: ratings[t] + div_noise[TEAM_DIV[t]] + team_noise[t] for t in TEAMS}
        uniforms = [rng.random() for _ in range(n_full)]

        wins = dict(base_wins)
        h2h = {t: dict(played_h2h[t]) for t in TEAMS}
        game_winner = {}
        for g in schedule:
            gid, h, a = g[0], g[2], g[3]
            neutral = g[4] if len(g) > 4 else False
            u = uniforms[gid_pos[gid]]
            p = home_win_prob(r[h], r[a], hfa=0.0 if neutral else hfa_s)
            hw = u < p
            if gid in window_gids:
                game_winner[gid] = (h, a, hw)
            if hw:
                wins[h] += 1; h2h[h][a] = h2h[h].get(a, 0) + 1
            else:
                wins[a] += 1; h2h[a][h] = h2h[a].get(h, 0) + 1

        field, bubble_next = playoff_field(wins, h2h, meetings, rng2)
        afc, nfc, sb = run_playoffs(field, r, rng2)
        po_set = set(field["AFC"]) | set(field["NFC"])
        for conf in ("AFC", "NFC"):
            s = field[conf]
            acc[s[0]]["seed1"] += 1
            for t in s:
                acc[t]["playoffs"] += 1
            for div, ts in DIVISIONS.items():
                if div.startswith(conf):
                    champ = next(t for t in s[:4] if t in ts)
                    acc[champ]["division"] += 1
            bubble[s[6]] += 1
            if bubble_next[conf]:
                bubble[bubble_next[conf]] += 1
        acc[afc]["conf"] += 1
        acc[nfc]["conf"] += 1
        acc[sb]["sb"] += 1
        for t in TEAMS:
            acc[t]["wins"] += wins[t]
            win_lists[t].append(wins[t])

        for gid, (h, a, hw) in game_winner.items():
            entry = lc[gid]
            if hw:
                entry["home"]["win_total"] += 1
                if h in po_set:
                    entry["home"]["win_po"] += 1
                entry["away"]["loss_total"] += 1
                if a in po_set:
                    entry["away"]["loss_po"] += 1
            else:
                entry["home"]["loss_total"] += 1
                if h in po_set:
                    entry["home"]["loss_po"] += 1
                entry["away"]["win_total"] += 1
                if a in po_set:
                    entry["away"]["win_po"] += 1

    leverage = {}
    for gid, c in lc.items():
        lh = leverage_from_counts(c["home"]["win_po"], c["home"]["win_total"],
                                   c["home"]["loss_po"], c["home"]["loss_total"])
        la = leverage_from_counts(c["away"]["win_po"], c["away"]["win_total"],
                                   c["away"]["loss_po"], c["away"]["loss_total"])
        leverage[gid] = {"home": lh, "away": la, "game": round(lh + la, 1)}

    return {"acc": acc, "win_lists": win_lists, "leverage": leverage, "bubble": bubble}


# -------------------------------------------------------- ledger + grading

def brier2(p_home, outcome_home_win):
    o = 1.0 if outcome_home_win else 0.0
    return (p_home - o) ** 2 + ((1 - p_home) - (1 - o)) ** 2


def load_meta_market():
    """{event_id: {"pH", "books", "sd_logodds"}} from nfl-meta-market.json.

    The consensus of the posted books is a better answer to "what does the
    market think" than the one price ESPN happens to carry, and in week 1 of
    2026 it was a much better one: ESPN had no moneyline at all, so the market
    column was a spread put through Phi, quantised onto the half-point grid and
    leaning 1.6 points against the three books that were quoting. Entries
    freeze BOTH -- `market` stays exactly what it was, so nothing already
    graded moves, and `meta_market` is the new column beside it."""
    if not os.path.exists(IN_META):
        return {}
    try:
        doc = json.load(io.open(IN_META, encoding="utf-8"))
    except (OSError, ValueError):
        print("meta-market file will not parse; freezing without it")
        return {}
    out = {}
    for g in doc.get("games", []):
        c = g.get("consensus") or {}
        if c.get("p_home") is None:
            continue
        out[str(g.get("event_id"))] = {
            "pH": round(float(c["p_home"]), 4),
            "books": c.get("books"),
            "sd_logodds": c.get("sd_logodds"),
        }
        if c.get("derived_only"):
            out[str(g.get("event_id"))]["derived_only"] = True
    return out


def grade_and_extend(ledger, results_by_id, upcoming, ratings, today_iso,
                     lite_ratings=None, leverage_by_gid=None, meta_by_gid=None):
    known = {e["event_id"] for e in ledger}
    meta_by_gid = meta_by_gid or {}
    # ESPN's scoreboard is the kickoff source, so ungraded entries appended by
    # an earlier run pick their timestamp up (or a rescheduled time) here.
    kick_by_id = {u[0]: u[5] for u in upcoming if len(u) > 5 and u[5]}
    neutral_by_id = {u[0]: (u[6] if len(u) > 6 else False) for u in upcoming}
    for e in ledger:
        if e.get("result"):
            continue
        if kick_by_id.get(e["event_id"]):
            e["kickoff"] = kick_by_id[e["event_id"]]
        # neutral is new as of points-v3: an entry frozen by an older build
        # never had it, and its model/lite pH would have wrongly carried
        # HFA. One-time correction while ungraded (no result exists yet to
        # protect), not a freeze violation -- the pick itself was never
        # graded against the wrong number.
        if neutral_by_id.get(e["event_id"]) and not e.get("neutral"):
            e["neutral"] = True
            if e["home"] in ratings and e["away"] in ratings:
                new_ph = round(home_win_prob(ratings[e["home"]], ratings[e["away"]], hfa=0.0), 4)
                if new_ph != e["model"]["pH"]:
                    # Silver-style backfill label: the retroactive edit is
                    # visible in the data, not silently overwritten.
                    e["repriced"] = {"at": today_iso, "reason": "neutral-site",
                                     "prior_model_pH": e["model"]["pH"], "prior_pick": e["pick"]}
                e["model"]["pH"] = new_ph
            if lite_ratings is not None and e["home"] in lite_ratings and e["away"] in lite_ratings:
                e["lite"] = {"pH": round(home_win_prob(lite_ratings[e["home"]], lite_ratings[e["away"]],
                                                        hfa=0.0), 4), "backfilled": today_iso}
            if e.get("market") is not None:
                e["blend"] = {"pH": round(MATCH_BLEND_W * e["market"]["pH"]
                                          + (1 - MATCH_BLEND_W) * e["model"]["pH"], 4)}
            e["pick"] = "H" if (e.get("blend") or e["model"])["pH"] >= 0.5 else "A"
        # lite.pH is new as of points-v3 too: same one-time backfill.
        if lite_ratings is not None and "lite" not in e and e["home"] in lite_ratings and e["away"] in lite_ratings:
            hfa_g = 0.0 if e.get("neutral") else HFA
            e["lite"] = {"pH": round(home_win_prob(lite_ratings[e["home"]], lite_ratings[e["away"]],
                                                    hfa=hfa_g), 4), "backfilled": today_iso}
        # The meta-market is new as of 2026-09-04. Backfilling it onto an
        # UNGRADED entry is not a freeze violation: the consensus written today
        # is today's price on a game nobody has played, not hindsight. Labelled
        # either way, the same convention `lite` uses.
        mm = meta_by_gid.get(e["event_id"])
        if mm is not None and "meta_market" not in e:
            e["meta_market"] = dict(mm, backfilled=today_iso)
        # leverage is descriptive, not a frozen pick, so it refreshes every
        # run while the game is still upcoming.
        lev = (leverage_by_gid or {}).get(e["event_id"])
        if lev is not None:
            e["leverage"] = lev
        res = results_by_id.get(e["event_id"])
        if res:
            _h, _a, hs, as_ = res
            if hs == as_:
                e["result"] = "T"
                e["graded_at"] = today_iso
                continue  # ties void the pick (no Brier; documented)
            hw = hs > as_
            e["result"] = "H" if hw else "A"
            e["score"] = "%d-%d" % (hs, as_)
            e["graded_at"] = today_iso
            e["model_brier"] = round(brier2(e["model"]["pH"], hw), 4)
            if e.get("market") is not None:
                e["market_brier"] = round(brier2(e["market"]["pH"], hw), 4)
            if e.get("lite") is not None:
                e["lite_brier"] = round(brier2(e["lite"]["pH"], hw), 4)
            if e.get("meta_market") is not None:
                e["meta_brier"] = round(brier2(e["meta_market"]["pH"], hw), 4)
            b = e.get("blend") or e["model"]
            e["blend_brier"] = round(brier2(b["pH"], hw), 4)
            e["pick_correct"] = (e["pick"] == e["result"])
    leverage_by_gid = leverage_by_gid or {}
    for u in upcoming:
        gid, iso, h, a, mkt_ph = u[:5]
        kick = u[5] if len(u) > 5 else None
        neutral = u[6] if len(u) > 6 else False
        spread = u[7] if len(u) > 7 else None
        if gid in known:
            continue
        hfa_g = 0.0 if neutral else HFA
        ph = round(home_win_prob(ratings[h], ratings[a], hfa=hfa_g), 4)
        entry = {
            "event_id": gid, "date": iso, "home": h, "away": a,
            "home_slug": slugify(h), "away_slug": slugify(a),
            "model": {"pH": ph}, "predicted_at": today_iso,
        }
        if kick:
            entry["kickoff"] = kick
        if neutral:
            entry["neutral"] = True
        if lite_ratings is not None:
            lp = round(home_win_prob(lite_ratings[h], lite_ratings[a], hfa=hfa_g), 4)
            entry["lite"] = {"pH": lp}
        if mkt_ph is not None:
            entry["market"] = {"pH": mkt_ph}
            if spread is not None:
                entry["market"]["spread"] = spread
            entry["blend"] = {"pH": round(MATCH_BLEND_W * mkt_ph + (1 - MATCH_BLEND_W) * ph, 4)}
        mm = meta_by_gid.get(gid)
        if mm is not None:
            entry["meta_market"] = dict(mm)
        lev = leverage_by_gid.get(gid)
        if lev is not None:
            entry["leverage"] = lev
        src = entry.get("blend") or entry["model"]
        entry["pick"] = "H" if src["pH"] >= 0.5 else "A"
        ledger.append(entry)
    ledger.sort(key=lambda e: (e["date"], e["home"]))
    return ledger


def ledger_record(ledger):
    g = [e for e in ledger if e.get("result") in ("H", "A")]
    rec = {
        "graded": len(g),
        "pick_correct": sum(1 for e in g if e.get("pick_correct")),
        "model_brier": round(sum(e["model_brier"] for e in g) / len(g), 4) if g else None,
        "blend_brier": round(sum(e["blend_brier"] for e in g) / len(g), 4) if g else None,
    }
    gl = [e for e in g if "lite_brier" in e]
    rec["lite_brier"] = round(sum(e["lite_brier"] for e in gl) / len(gl), 4) if gl else None
    gm = [e for e in g if "market_brier" in e]
    rec["market_graded"] = len(gm)
    rec["market_brier"] = round(sum(e["market_brier"] for e in gm) / len(gm), 4) if gm else None
    # The meta-market is scored on its OWN graded set and says how big that set
    # is, because it starts later than the rest and a Brier compared across
    # different games is not a comparison.
    gmm = [e for e in g if "meta_brier" in e]
    rec["meta_graded"] = len(gmm)
    rec["meta_brier"] = round(sum(e["meta_brier"] for e in gmm) / len(gmm), 4) if gmm else None
    return rec


# -------------------------------------------------------------------- build

def build(sims, today=None):
    today = today or date.today()
    today_iso = today.isoformat()

    team_ids = espn_teams()
    missing = sorted(set(TEAMS) - set(team_ids))
    if missing:
        raise SystemExit("division map out of date vs ESPN: %s" % missing)

    per_season = {s: season_margins(s) for s, _ in STRENGTH_SEASONS}
    results = played_results()
    played = [(h, a, hs, as_) for _id, h, a, hs, as_, ty, _neu in results if ty == 2]
    r_stats = base_ratings(per_season, played)

    schedule = full_schedule(team_ids)
    if len(schedule) != 272:
        print("note: schedule has %d games (272 expected)" % len(schedule))
    played_ids = {r[0] for r in results}
    remaining = [g for g in schedule if g[0] not in played_ids]
    meetings = schedule_meetings(schedule)

    base_wins = {t: 0 for t in TEAMS}
    played_h2h = {t: {} for t in TEAMS}
    for h, a, hs, as_ in played:
        if hs == as_:
            base_wins[h] += 0.5; base_wins[a] += 0.5
        elif hs > as_:
            base_wins[h] += 1
            played_h2h[h][a] = played_h2h[h].get(a, 0) + 1
        else:
            base_wins[a] += 1
            played_h2h[a][h] = played_h2h[a].get(h, 0) + 1

    # existing ledger, read once: feeds both the spread-implied ratings
    # (last SPREAD_LOOKBACK_DAYS days of stored market.spread) and grading.
    existing_ledger = []
    prev_meta = {}
    if os.path.exists(OUT_PRED):
        try:
            prev_doc = json.load(io.open(OUT_PRED, encoding="utf-8"))
            existing_ledger = prev_doc.get("ledger", [])
            prev_meta = prev_doc.get("meta") or {}
        except Exception:
            existing_ledger = []

    # Market step 1: DraftKings Super Bowl futures -> ratings on the points
    # scale via the model's own rating->title-odds curve (quick pre-sim).
    mkt_probs, mkt_provider = fetch_sb_futures()
    r_futures = None
    if mkt_probs:
        pre = simulate(r_stats, remaining, base_wins, played_h2h, CALIB_SIMS,
                       meetings, seed=99, full_schedule=schedule)
        pre_acc = pre["acc"]
        pairs = [(_logodds(pre_acc[t]["sb"] / CALIB_SIMS), r_stats[t]) for t in TEAMS]
        a, b = _fit_rating_from_logodds(pairs)
        if b > 0:
            r_mkt_raw = {t: a + b * _logodds(mkt_probs.get(t, 1.0 / 64)) for t in TEAMS}
            m = sum(r_mkt_raw.values()) / len(r_mkt_raw)
            r_futures = {t: v - m for t, v in r_mkt_raw.items()}

    # Market step 2: posted spreads (this window + the ledger's recent
    # history) -> ridge-regularized ratings, prior = futures (or stats).
    upcoming = upcoming_games(today, WINDOW_DAYS)
    window_gids = {u[0] for u in upcoming}
    spread_obs = []
    for u in upcoming:
        h, a = u[2], u[3]
        neutral = u[6] if len(u) > 6 else False
        spread = u[7] if len(u) > 7 else None
        if spread is not None:
            spread_obs.append((h, a, spread, neutral))
    for e in existing_ledger:
        sp = (e.get("market") or {}).get("spread")
        if sp is None:
            continue
        try:
            d = date.fromisoformat(str(e.get("date"))[:10])
        except (TypeError, ValueError):
            continue
        age = (today - d).days
        if 0 <= age <= SPREAD_LOOKBACK_DAYS:
            spread_obs.append((e["home"], e["away"], sp, bool(e.get("neutral"))))

    spread_prior = r_futures if r_futures is not None else r_stats
    r_spread, n_spread_obs = implied_ratings_from_spreads(spread_obs, spread_prior, lam=SPREAD_LAMBDA)

    if n_spread_obs >= 8:
        r_market = r_spread
        market_ratings_kind = "futures+spreads"
    elif r_futures is not None:
        r_market = r_futures
        market_ratings_kind = "futures"
    else:
        r_market = None
        market_ratings_kind = "none"

    if r_market is not None:
        ratings = {t: (1 - MARKET_W_SEASON) * r_stats[t] + MARKET_W_SEASON * r_market[t] for t in TEAMS}
        m2 = sum(ratings.values()) / len(ratings)
        ratings = {t: v - m2 for t, v in ratings.items()}
        market_note = "blended (weight %.2f, %s, %s)" % (
            MARKET_W_SEASON, market_ratings_kind, mkt_provider or "book")
    else:
        ratings = dict(r_stats)
        market_note = "model-only (no futures or spreads available)"

    # Adaptive sigma: league-wide from games remaining, widened per team by
    # stats/market disagreement.
    frac_left = len(remaining) / float(len(schedule)) if schedule else 1.0
    sigma_base = adaptive_sigma(frac_left)
    sigma_team_dict = {t: team_sigma(sigma_base, r_stats[t],
                                     r_market[t] if r_market is not None else None)
                       for t in TEAMS}

    # Lite tier: stats-only ratings, same seed, cheaper sim count.
    lite = simulate(r_stats, remaining, base_wins, played_h2h, TIER_SIMS, meetings,
                    seed=SEASON, sigma_team=sigma_team_dict, full_schedule=schedule)

    # Classic tier: the production run.
    classic = simulate(ratings, remaining, base_wins, played_h2h, sims, meetings,
                       seed=SEASON, sigma_team=sigma_team_dict, window_gids=window_gids,
                       full_schedule=schedule)
    acc = classic["acc"]

    table = []
    for t in TEAMS:
        a = acc[t]
        p10 = percentiles(classic["win_lists"][t], 10)
        p90 = percentiles(classic["win_lists"][t], 90)
        p_playoffs = round(100.0 * a["playoffs"] / sims, 2)
        table.append({
            "slug": slugify(t), "name": t,
            "conf": TEAM_CONF[t], "division": TEAM_DIV[t],
            "rating": round(ratings[t], 2),
            "rating_stats": round(r_stats[t], 2),
            "rating_market": round(r_market[t], 2) if r_market is not None else None,
            "sigma_team": round(sigma_team_dict[t], 2),
            "exp_wins": round(a["wins"] / sims, 1),
            "wins_p10": round(p10, 1) if p10 is not None else None,
            "wins_p90": round(p90, 1) if p90 is not None else None,
            "p_division": round(100.0 * a["division"] / sims, 2),
            "p_playoffs": p_playoffs,
            "p_seed1": round(100.0 * a["seed1"] / sims, 2),
            "p_conf": round(100.0 * a["conf"] / sims, 2),
            "p_sb": round(100.0 * a["sb"] / sims, 2),
            "p_bubble": round(100.0 * classic["bubble"].get(t, 0) / sims, 2),
            "band": band_for(p_playoffs),
        })
    table.sort(key=lambda r: (-r["p_sb"], -r["exp_wins"]))
    assert len(table) == 32
    s = sum(r["p_sb"] for r in table)
    assert abs(s - 100.0) < 1.0, "p_sb sums to %.2f" % s
    s = sum(r["p_playoffs"] for r in table)
    assert abs(s - 1400.0) < 14.0, "p_playoffs sums to %.2f" % s

    def tier_rows(res, n):
        rows = {}
        for t in TEAMS:
            a = res["acc"][t]
            rows[slugify(t)] = {
                "exp_wins": round(a["wins"] / n, 1),
                "p_division": round(100.0 * a["division"] / n, 2),
                "p_playoffs": round(100.0 * a["playoffs"] / n, 2),
                "p_conf": round(100.0 * a["conf"] / n, 2),
                "p_sb": round(100.0 * a["sb"] / n, 2),
            }
        return rows

    tiers = {"lite": tier_rows(lite, TIER_SIMS), "classic": tier_rows(classic, sims)}
    corr_team_sd = round(sum(div_residual_sd(v) for v in sigma_team_dict.values())
                         / len(sigma_team_dict), 2)

    sim_doc = {
        "meta": {
            "league": "nfl", "season": SEASON, "title_game": "Super Bowl LXI",
            "generated_at": today_iso, "sims": sims, "model": "points-v3",
            "seed": SEASON,
            "hfa": HFA, "sigma_game": SIGMA_GAME, "sigma_season": SIGMA_SEASON,
            "sigma_season_eff": round(sigma_base, 2),
            "corr": {"hfa_sd": HFA_SD, "div_sd": DIV_SD, "team_sd": corr_team_sd},
            "regress": REGRESS,
            "strength_seasons": [s for s, _ in STRENGTH_SEASONS],
            "market": market_note, "market_weight": MARKET_W_SEASON,
            "market_ratings": market_ratings_kind,
            "tiers": ["lite", "classic"],
            "schedule_games": len(schedule), "games_played": len(played),
            "source": "ESPN standings + 2026 schedule + posted lines + Super Bowl futures",
            "notes": "Regressed scoring-margin ratings blended with a market rating (spreads "
                     "when there are enough of them, else futures); the real 272-game schedule "
                     "and full playoff bracket simulated with correlated per-team/division/HFA "
                     "season noise and common random numbers; division tie-breaks approximated "
                     "(record, then head-to-head).",
        },
        "table": table,
        "tiers": tiers,
    }

    hist_rows = {r["slug"]: {
        "xw": round(r["exp_wins"], 1),
        "div": round(r["p_division"], 1),
        "po": round(r["p_playoffs"], 1),
        "conf": round(r["p_conf"], 1),
        "title": round(r["p_sb"], 1),
    } for r in table}
    hist_doc = None
    if os.path.exists(OUT_HIST):
        try:
            hist_doc = json.load(io.open(OUT_HIST, encoding="utf-8"))
        except Exception:
            hist_doc = None
    hist_doc = upsert_snapshot(hist_doc, today_iso, len(played), hist_rows, HISTORY_KEEP)

    results_by_id = {r[0]: (r[1], r[2], r[3], r[4]) for r in results}
    meta_by_gid = load_meta_market()
    ledger = grade_and_extend(existing_ledger, results_by_id, upcoming, ratings, today_iso,
                              lite_ratings=r_stats, leverage_by_gid=classic["leverage"],
                              meta_by_gid=meta_by_gid)
    pred_doc = {
        "meta": {"season": SEASON, "generated_at": today_iso,
                 "match_blend_weight": MATCH_BLEND_W, "horizon_days": WINDOW_DAYS,
                 "tiers": ["lite", "classic", "market", "meta", "blend"],
                 "odds_source": "ESPN posted lines (moneyline, else spread)",
                 "meta_market_source": "nfl-meta-market.json: DraftKings, FanDuel, "
                                       "Kalshi and Polymarket, power de-vigged, "
                                       "posted prices only",
                 "meta_market_games": len(meta_by_gid),
                 "results_source": "ESPN final scores"},
        "record": ledger_record(ledger),
        "ledger": ledger,
    }
    # build_nfl_shadow.py owns meta.shadow (its fitted weights and gate
    # result); this builder rebuilds meta from scratch, so carry it forward
    # rather than wiping it every morning.
    if prev_meta.get("shadow"):
        pred_doc["meta"]["shadow"] = prev_meta["shadow"]
    return sim_doc, pred_doc, hist_doc


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []
    ran = [0]

    def check(name, cond):
        # 🔴 The count used to be the literal 72 in the print at the bottom. It
        # was right when it was written and wrong the moment a case was added,
        # which is a test harness telling you a number it did not measure.
        ran[0] += 1
        if not cond:
            fails.append(name)

    check("divisions-32", len(TEAMS) == 32 and len(DIVISIONS) == 8)
    check("phi-mid", abs(phi(0.0) - 0.5) < 1e-9)
    p = home_win_prob(3.0, -3.0)
    check("winprob-favourite", 0.65 < p < 0.75)
    check("winprob-sym", abs(home_win_prob(0, 0) - phi(HFA / SIGMA_GAME)) < 1e-9)
    check("winprob-neutral-drops-hfa", abs(home_win_prob(0, 0, hfa=0.0) - 0.5) < 1e-9)
    # division ranking: wins first, then h2h inside the tie
    rng = random.Random(3)
    ts = DIVISIONS["AFC East"]
    wins = {t: 0 for t in TEAMS}
    wins.update({"Buffalo Bills": 11, "Miami Dolphins": 11,
                 "New England Patriots": 9, "New York Jets": 4})
    h2h = defaultdict(dict, {"Miami Dolphins": {"Buffalo Bills": 2}, "Buffalo Bills": {"Miami Dolphins": 0}})
    mt = {t: {} for t in TEAMS}
    mt["Miami Dolphins"]["Buffalo Bills"] = mt["Buffalo Bills"]["Miami Dolphins"] = 2
    order = rank_division(ts, wins, h2h, mt, rng)
    check("div-tiebreak", order[0] == "Miami Dolphins" and order[-1] == "New York Jets")
    # ladder: division record decides when h2h is split
    h2h2 = defaultdict(dict, {
        "Buffalo Bills": {"Miami Dolphins": 1, "New England Patriots": 2, "New York Jets": 2},
        "Miami Dolphins": {"Buffalo Bills": 1, "New England Patriots": 2, "New York Jets": 1}})
    mt2 = {t: {} for t in TEAMS}
    for a, b in (("Buffalo Bills", "Miami Dolphins"), ("Buffalo Bills", "New England Patriots"),
                 ("Buffalo Bills", "New York Jets"), ("Miami Dolphins", "New England Patriots"),
                 ("Miami Dolphins", "New York Jets")):
        mt2[a][b] = 2
        mt2[b][a] = 2
    check("ladder-division-step",
          ladder_pick("division", ["Buffalo Bills", "Miami Dolphins"],
                      wins, h2h2, mt2, rng) == "Buffalo Bills")
    # ladder: wild-card sweep rule (3+ clubs, one beat both others)
    h2h3 = defaultdict(dict, {"Pittsburgh Steelers": {"Denver Broncos": 1, "Houston Texans": 1}})
    mt3 = {t: {} for t in TEAMS}
    for a, b in (("Pittsburgh Steelers", "Denver Broncos"),
                 ("Pittsburgh Steelers", "Houston Texans"),
                 ("Denver Broncos", "Houston Texans")):
        mt3[a][b] = mt3[b][a] = 1
    h2h3["Denver Broncos"]["Houston Texans"] = 1
    check("ladder-wc-sweep",
          ladder_pick("wildcard", ["Pittsburgh Steelers", "Denver Broncos",
                                   "Houston Texans"], wins, h2h3, mt3, rng)
          == "Pittsburgh Steelers")
    # ladder: strength of victory decides when nothing earlier separates
    wins4 = {t: 0 for t in TEAMS}
    wins4["Kansas City Chiefs"] = 14
    wins4["New York Jets"] = 4
    h2h4 = defaultdict(dict, {"Pittsburgh Steelers": {"Kansas City Chiefs": 1},
                              "Denver Broncos": {"New York Jets": 1}})
    mt4 = {t: {} for t in TEAMS}
    mt4["Pittsburgh Steelers"]["Kansas City Chiefs"] = mt4["Kansas City Chiefs"]["Pittsburgh Steelers"] = 1
    mt4["Denver Broncos"]["New York Jets"] = mt4["New York Jets"]["Denver Broncos"] = 1
    check("ladder-sov",
          ladder_pick("wildcard", ["Pittsburgh Steelers", "Denver Broncos"],
                      wins4, h2h4, mt4, rng) == "Pittsburgh Steelers")
    # playoff field: 7 per conference, division winners seeded 1-4, and the
    # 8th-seed bubble marker never overlaps the field itself
    rng = random.Random(4)
    wins = {t: 8 for t in TEAMS}
    wins["Kansas City Chiefs"] = 14
    wins["Buffalo Bills"] = 13
    h2h = {t: {} for t in TEAMS}
    mt = {t: {} for t in TEAMS}
    field, bubble_next = playoff_field(wins, h2h, mt, rng)
    check("field-7", len(field["AFC"]) == 7 and len(field["NFC"]) == 7)
    check("field-seed1", field["AFC"][0] == "Kansas City Chiefs")
    check("field-div-first", all(len({TEAM_DIV[t] for t in field[c][:4]}) == 4 for c in field))
    check("field-bubble-outside-field",
          all(bubble_next[c] is None or bubble_next[c] not in field[c] for c in field))
    # playoffs run to a single SB winner from the field
    r = {t: 0.0 for t in TEAMS}
    afc, nfc, sb = run_playoffs(field, r, random.Random(5))
    check("sb-winner", sb in (afc, nfc) and TEAM_CONF[afc] == "AFC" and TEAM_CONF[nfc] == "NFC")
    # market prob / spread from moneyline + spread paths
    comp = {"odds": [{"homeTeamOdds": {"moneyLine": -160}, "awayTeamOdds": {"moneyLine": 140}}]}
    mp = market_home_prob(comp)
    check("ml-devig", 0.58 < mp < 0.65)
    comp2 = {"odds": [{"spread": -3.5}]}
    check("spread-prob", 0.58 < market_home_prob(comp2) < 0.62)
    check("spread-raw", market_spread(comp2) == -3.5)
    check("spread-raw-missing", market_spread({"odds": []}) is None)
    # grading: home win graded correctly, tie voids
    led = [{"event_id": "1", "date": "2026-09-13", "home": "Buffalo Bills", "away": "New York Jets",
            "home_slug": "buffalo-bills", "away_slug": "new-york-jets",
            "model": {"pH": 0.7}, "pick": "H", "predicted_at": "2026-09-10"},
           {"event_id": "2", "date": "2026-09-13", "home": "Chicago Bears", "away": "Detroit Lions",
            "home_slug": "chicago-bears", "away_slug": "detroit-lions",
            "model": {"pH": 0.5}, "pick": "H", "predicted_at": "2026-09-10"}]
    graded = grade_and_extend(led, {"1": ("Buffalo Bills", "New York Jets", 27, 13),
                                    "2": ("Chicago Bears", "Detroit Lions", 20, 20)},
                              [], {t: 0.0 for t in TEAMS}, "2026-09-14")
    by_home = {e["home"]: e for e in graded}
    win = by_home["Buffalo Bills"]
    tie = by_home["Chicago Bears"]
    check("grade-win", win["pick_correct"] is True and abs(win["model_brier"] - 0.18) < 1e-9)
    check("grade-tie", tie["result"] == "T" and "model_brier" not in tie)
    rec = ledger_record(graded)
    check("record-skips-tie", rec["graded"] == 1)
    # kickoff: ESPN date -> ISO UTC; carried on new entries and backfilled
    # onto ungraded ones, never onto graded history
    check("kickoff-iso", kickoff_iso("2026-09-11T00:20Z") == "2026-09-11T00:20:00Z"
          and kickoff_iso("garbage") is None and kickoff_iso(None) is None)
    led2 = [{"event_id": "3", "date": "2026-09-13", "home": "Green Bay Packers",
             "away": "Minnesota Vikings", "home_slug": "green-bay-packers",
             "away_slug": "minnesota-vikings", "model": {"pH": 0.6}, "pick": "H",
             "predicted_at": "2026-09-10"}]
    up2 = [("3", "2026-09-13", "Green Bay Packers", "Minnesota Vikings", None,
            "2026-09-13T17:00:00Z"),
           ("4", "2026-09-14", "Dallas Cowboys", "Philadelphia Eagles", None,
            "2026-09-14T00:15:00Z")]
    led2 = grade_and_extend(led2, {}, up2, {t: 0.0 for t in TEAMS}, "2026-09-11")
    by_id = {e["event_id"]: e for e in led2}
    check("kickoff-backfill", by_id["3"]["kickoff"] == "2026-09-13T17:00:00Z")
    check("kickoff-new-entry", by_id["4"]["kickoff"] == "2026-09-14T00:15:00Z")
    check("kickoff-graded-untouched", "kickoff" not in win and "kickoff" not in tie)
    # neutral-site window game: no HFA in model.pH / lite.pH, entry flagged,
    # and market.spread rides along with market.pH
    up3 = [("5", "2026-10-05", "Los Angeles Rams", "San Francisco 49ers", 0.55,
            "2026-10-05T14:30:00Z", True, -1.5)]
    led3 = grade_and_extend([], {}, up3, {t: 0.0 for t in TEAMS}, "2026-10-01",
                            lite_ratings={t: 0.0 for t in TEAMS})
    neut = led3[0]
    check("neutral-flag", neut.get("neutral") is True)
    check("neutral-no-hfa", abs(neut["model"]["pH"] - 0.5) < 1e-9
          and abs(neut["lite"]["pH"] - 0.5) < 1e-9)
    check("neutral-spread-carried", neut["market"]["spread"] == -1.5 and neut["market"]["pH"] == 0.55)
    up4 = [("6", "2026-10-05", "Dallas Cowboys", "New York Giants", None, None, False, None)]
    led4 = grade_and_extend([], {}, up4, {t: 0.0 for t in TEAMS}, "2026-10-01")
    check("non-neutral-omitted", "neutral" not in led4[0])
    check("lite-at-creation-not-backfilled", "backfilled" not in neut["lite"])
    # a pre-points-v3 frozen entry that ESPN now reports as neutral: the
    # prior model.pH/pick are preserved under `repriced`, and the fresh
    # lite.pH carries the backfill label
    rzero6 = {t: 0.0 for t in TEAMS}
    r_up = dict(rzero6); r_up["Los Angeles Rams"] = 3.0  # nonzero so pH actually moves
    led6 = [{"event_id": "8", "date": "2026-10-05", "home": "Los Angeles Rams",
             "away": "San Francisco 49ers", "home_slug": "los-angeles-rams",
             "away_slug": "san-francisco-49ers", "model": {"pH": 0.71}, "pick": "H",
             "predicted_at": "2026-09-01"}]
    up6 = [("8", "2026-10-05", "Los Angeles Rams", "San Francisco 49ers", None, None, True, None)]
    led6 = grade_and_extend(led6, {}, up6, r_up, "2026-10-01", lite_ratings=rzero6)
    e6 = led6[0]
    check("repriced-present", e6.get("repriced") is not None)
    check("repriced-prior-values",
          e6["repriced"]["reason"] == "neutral-site"
          and e6["repriced"]["prior_model_pH"] == 0.71 and e6["repriced"]["prior_pick"] == "H")
    check("repriced-model-changed", e6["model"]["pH"] != 0.71)
    check("lite-backfilled-labelled", e6["lite"].get("backfilled") == "2026-10-01")
    # lite_brier flows through grading and the ledger record
    led5 = [{"event_id": "7", "date": "2026-09-13", "home": "Buffalo Bills", "away": "New York Jets",
             "home_slug": "buffalo-bills", "away_slug": "new-york-jets",
             "model": {"pH": 0.7}, "lite": {"pH": 0.6}, "pick": "H", "predicted_at": "2026-09-10"}]
    led5 = grade_and_extend(led5, {"7": ("Buffalo Bills", "New York Jets", 27, 13)},
                            [], {t: 0.0 for t in TEAMS}, "2026-09-14")
    check("lite-brier-graded", abs(led5[0]["lite_brier"] - 0.32) < 1e-9)
    check("record-lite-brier", abs(ledger_record(led5)["lite_brier"] - 0.32) < 1e-9)

    # ---- the meta-market column ----------------------------------------
    mm = {"9": {"pH": 0.66, "books": 3, "sd_logodds": 0.05}}
    up9 = [("9", "2026-10-12", "Buffalo Bills", "New York Jets", 0.62, None, False, -3.0)]
    led9 = grade_and_extend([], {}, up9, {t: 0.0 for t in TEAMS}, "2026-10-01",
                            meta_by_gid=mm)
    e9 = led9[0]
    check("meta-frozen-at-creation",
          e9["meta_market"]["pH"] == 0.66 and e9["meta_market"]["books"] == 3
          and "backfilled" not in e9["meta_market"])
    check("meta-does-not-move-the-market-column", e9["market"]["pH"] == 0.62)
    check("meta-does-not-move-the-pick",
          e9["pick"] == ("H" if e9["blend"]["pH"] >= 0.5 else "A"))
    # backfill onto an entry frozen before the meta-market existed: labelled,
    # and only ever onto a game with no result
    old9 = [{"event_id": "9", "date": "2026-10-12", "home": "Buffalo Bills",
             "away": "New York Jets", "home_slug": "buffalo-bills",
             "away_slug": "new-york-jets", "model": {"pH": 0.7}, "pick": "H",
             "predicted_at": "2026-09-01"}]
    back9 = grade_and_extend(old9, {}, [], {t: 0.0 for t in TEAMS}, "2026-10-02",
                             meta_by_gid=mm)
    check("meta-backfill-labelled",
          back9[0]["meta_market"].get("backfilled") == "2026-10-02")
    graded9 = grade_and_extend(back9, {"9": ("Buffalo Bills", "New York Jets", 27, 13)},
                               [], {t: 0.0 for t in TEAMS}, "2026-10-13", meta_by_gid=mm)
    check("meta-brier-graded", abs(graded9[0]["meta_brier"] - 2 * (1 - 0.66) ** 2) < 1e-9)
    rec9 = ledger_record(graded9)
    check("record-meta-brier",
          rec9["meta_graded"] == 1 and abs(rec9["meta_brier"] - 2 * (1 - 0.66) ** 2) < 1e-9)
    check("meta-absent-is-not-an-error",
          "meta_market" not in grade_and_extend([], {}, up9, {t: 0.0 for t in TEAMS},
                                                "2026-10-01")[0])
    # futures mapping helpers: line recovery + logodds clamp + a blend that
    # actually moves a market favourite up
    a, b = _fit_rating_from_logodds([(-3.0, -3.0), (-2.0, -1.0), (-1.0, 1.0), (0.0, 3.0)])
    check("lofit", abs(b - 2.0) < 1e-9 and abs(a - 3.0) < 1e-9)
    check("lo-clamp", _logodds(0.0) < _logodds(0.5) < _logodds(1.0))
    r_model = {t: 0.0 for t in TEAMS}
    mkt = {t: 1.0 / 32 for t in TEAMS}
    mkt["Los Angeles Rams"] = 0.15
    lo_mean = sum(_logodds(mkt[t]) for t in TEAMS) / 32
    r_m = {t: 2.0 * (_logodds(mkt[t]) - lo_mean) for t in TEAMS}
    blended = {t: (1 - MARKET_W_SEASON) * r_model[t] + MARKET_W_SEASON * r_m[t] for t in TEAMS}
    check("blend-favourite-up", blended["Los Angeles Rams"] > 1.0)
    # adaptive sigma: full season, mid-season (above floor), season over
    # (floor governs) -- SIGMA_FLOOR_FRAC 0.45 vs sqrt(0.3) = 0.548 and
    # sqrt(0.0) = 0
    check("sigma-full-season", abs(adaptive_sigma(1.0) - SIGMA_SEASON) < 1e-9)
    check("sigma-frac-30", abs(adaptive_sigma(0.3) - SIGMA_SEASON * math.sqrt(0.3)) < 1e-9)
    check("sigma-floor", abs(adaptive_sigma(0.0) - SIGMA_SEASON * SIGMA_FLOOR_FRAC) < 1e-9)
    check("sigma-clamps-out-of-range", adaptive_sigma(1.5) == adaptive_sigma(1.0)
          and adaptive_sigma(-0.2) == adaptive_sigma(0.0))
    check("team-sigma-no-market", team_sigma(2.0, 1.0, None) == 2.0)
    check("team-sigma-disagree", team_sigma(2.0, 3.0, -1.0) > 2.0)
    check("div-residual-floor", abs(div_residual_sd(0.5) - 0.5) < 1e-9)
    check("div-residual-normal", abs(div_residual_sd(3.0) - math.sqrt(9.0 - 1.0)) < 1e-9)
    # percentiles: nearest-rank on a short, unsorted, messy list
    check("percentiles-empty", percentiles([], 50) is None)
    check("percentiles-p10", percentiles([50, 10, 30, 20, 40], 10) == 10)
    check("percentiles-p90", percentiles([50, 10, 30, 20, 40], 90) == 50)
    check("percentiles-median-odd", percentiles([9, 3, 9, 3, 5], 50) == 5)
    # leverage: normal swing and both zero-denominator edges
    check("leverage-basic", abs(leverage_from_counts(80, 100, 20, 100) - 60.0) < 1e-9)
    check("leverage-zero-win-denom", leverage_from_counts(0, 0, 5, 10) == 0.0)
    check("leverage-zero-loss-denom", leverage_from_counts(5, 10, 0, 0) == 0.0)
    # band_for: every boundary, inclusive on the low edge of each band
    check("band-solid", band_for(95) == "solid" and band_for(90) == "solid")
    check("band-likely", band_for(89.9) == "likely" and band_for(75) == "likely")
    check("band-lean", band_for(60) == "lean")
    check("band-tossup", band_for(40) == "tossup")
    check("band-unlikely", band_for(15) == "unlikely")
    check("band-out", band_for(3) == "out")
    # upsert_snapshot: fresh file, same-date replace, and a keep-cap that
    # drops the oldest first
    doc = upsert_snapshot(None, "2026-09-01", 10,
                          {"buffalo-bills": {"xw": 10.3, "div": 48.9, "po": 78.4,
                                             "conf": 24.0, "title": 14.4}})
    check("hist-fresh", len(doc["snapshots"]) == 1 and doc["snapshots"][0]["date"] == "2026-09-01")
    doc = upsert_snapshot(doc, "2026-09-01", 11,
                          {"buffalo-bills": {"xw": 10.5, "div": 49.0, "po": 79.0,
                                             "conf": 24.5, "title": 15.0}})
    check("hist-replace-same-date",
          len(doc["snapshots"]) == 1 and doc["snapshots"][0]["games_played"] == 11)
    doc2 = None
    for i in range(5):
        doc2 = upsert_snapshot(doc2, "2026-08-%02d" % (i + 1), i, {}, keep=3)
    check("hist-cap", len(doc2["snapshots"]) == 3 and doc2["snapshots"][0]["date"] == "2026-08-03"
          and doc2["snapshots"][-1]["date"] == "2026-08-05")
    # implied_ratings_from_spreads: a neutral game skips the HFA adjustment,
    # a team with zero observations falls back to its prior, and n counts
    # only observations actually used
    prior0 = {t: 0.0 for t in TEAMS}
    obs = [("Buffalo Bills", "Miami Dolphins", -6.0, False),
           ("Kansas City Chiefs", "Denver Broncos", -3.0, True),
           ("Green Bay Packers", "Chicago Bears", -3.0, False)]
    r_impl, n_impl = implied_ratings_from_spreads(obs, prior0, lam=SPREAD_LAMBDA)
    check("spread-n-count", n_impl == 3)
    check("spread-favourite-up", r_impl["Buffalo Bills"] > r_impl["Miami Dolphins"])
    # same posted spread (-3), but the neutral game has no HFA to absorb
    # part of it, so the implied rating gap has to be bigger
    check("spread-neutral-larger-gap",
          (r_impl["Kansas City Chiefs"] - r_impl["Denver Broncos"]) >
          (r_impl["Green Bay Packers"] - r_impl["Chicago Bears"]) > 0)
    r_iso, n_iso = implied_ratings_from_spreads(
        [("Buffalo Bills", "Miami Dolphins", -6.0, False)], prior0, lam=SPREAD_LAMBDA)
    check("spread-fallback-to-prior", abs(r_iso["Kansas City Chiefs"]) < 0.5)
    check("spread-no-obs", implied_ratings_from_spreads([], prior0)[1] == 0)
    # simulate: CRN determinism (same seed -> identical acc) and a neutral
    # game removing home-field advantage from the win share
    rzero = {t: 0.0 for t in TEAMS}
    zero_wins = {t: 0 for t in TEAMS}
    zero_h2h = {t: {} for t in TEAMS}
    zero_meet = {t: {} for t in TEAMS}
    home_game = [("nA", "2026-09-10", "Buffalo Bills", "Miami Dolphins", False)]
    res1 = simulate(rzero, home_game, zero_wins, zero_h2h, 400, zero_meet, seed=11,
                    full_schedule=home_game)
    res2 = simulate(rzero, home_game, zero_wins, zero_h2h, 400, zero_meet, seed=11,
                    full_schedule=home_game)
    check("sim-crn-deterministic", res1["acc"]["Buffalo Bills"] == res2["acc"]["Buffalo Bills"])
    n_probe = 2000
    neutral_game = [("nB", "2026-09-10", "Buffalo Bills", "Miami Dolphins", True)]
    res_neutral = simulate(rzero, neutral_game, zero_wins, zero_h2h, n_probe, zero_meet, seed=11,
                           full_schedule=neutral_game)
    res_home_big = simulate(rzero, home_game, zero_wins, zero_h2h, n_probe, zero_meet, seed=11,
                            full_schedule=home_game)
    bills_home = sum(res_home_big["win_lists"]["Buffalo Bills"]) / n_probe
    bills_neutral = sum(res_neutral["win_lists"]["Buffalo Bills"]) / n_probe
    check("sim-neutral-drops-hfa", bills_home > bills_neutral + 0.02 and abs(bills_neutral - 0.5) < 0.05)
    # leverage collection: a game in window_gids gets a home/away/game swing
    lev_doc = res_home_big["leverage"].get("nA")
    check("sim-leverage-present", lev_doc is None)  # window_gids empty above, so nothing collected
    res_window = simulate(rzero, home_game, zero_wins, zero_h2h, n_probe, zero_meet, seed=11,
                          full_schedule=home_game, window_gids={"nA"})
    lev = res_window["leverage"]["nA"]
    check("sim-leverage-shape", set(lev) == {"home", "away", "game"}
          and abs(lev["game"] - (lev["home"] + lev["away"])) < 1e-6)

    if fails:
        print("SELF-TEST FAIL:", ", ".join(fails))
        sys.exit(1)
    print("self-test OK (%d cases)" % ran[0])


def main():
    if "--self-test" in sys.argv:
        self_test(); return
    sims = DEFAULT_SIMS
    if "--sims" in sys.argv:
        sims = int(sys.argv[sys.argv.index("--sims") + 1])
    sim_doc, pred_doc, hist_doc = build(sims)
    m = sim_doc["meta"]
    print("schedule %d games, %d played | %s" % (m["schedule_games"], m["games_played"], m["market"]))
    for r in sim_doc["table"][:8]:
        print("  %-26s SB %5.1f%%  conf %5.1f%%  playoffs %5.1f%%  xW %.1f"
              % (r["name"], r["p_sb"], r["p_conf"], r["p_playoffs"], r["exp_wins"]))
    up = [e for e in pred_doc["ledger"] if not e.get("result")]
    print("ledger: %d entries (%d graded, %d upcoming)"
          % (len(pred_doc["ledger"]), pred_doc["record"]["graded"], len(up)))
    if "--dry" in sys.argv:
        print("dry run; nothing written."); return
    with io.open(OUT_SIM, "w", encoding="utf-8", newline="") as f:
        json.dump(sim_doc, f, separators=(",", ":"), ensure_ascii=False)
    with io.open(OUT_PRED, "w", encoding="utf-8", newline="") as f:
        json.dump(pred_doc, f, separators=(",", ":"), ensure_ascii=False)
    with io.open(OUT_HIST, "w", encoding="utf-8", newline="") as f:
        json.dump(hist_doc, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote nfl-sim.json + nfl-predictions.json + nfl-sim-history.json")


if __name__ == "__main__":
    main()
