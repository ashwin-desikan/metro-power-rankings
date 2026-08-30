#!/usr/bin/env python3
"""NFL 2026 season simulator + weekly game predictions + ledger.

The NFL leg of /predictions (same convention as the Premier League hub):
  public/data/nfl-sim.json          - season odds per team (exp wins, division,
                                      playoffs, conference, Super Bowl LXI)
  public/data/nfl-predictions.json  - upcoming-game predictions + the graded
                                      ledger tracking us vs the market

MODEL (points-v2, "site data + market"):
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
    classic points-spread translation (HFA 1.6 pts, sigma 13.4). Ties are
    ignored (~0.4% of NFL games; documented approximation).
  - The REAL 2026 schedule (all 272 games, ESPN per-team schedules) is
    simulated 20k times with per-season rating noise SIGMA_SEASON. Division
    winners and seeds via the OFFICIAL tie-break ladder's win-based steps
    (h2h with the 3+-club sweep rule, division, common games incl. the
    wild-card minimum-4 clause, conference, strength of victory, strength
    of schedule, in the official order; the points-based steps that follow
    them are beyond a win-only sim, so a tie surviving SOS falls to random
    -- the documented approximation, replacing the old wins->h2h->random).
    Full score-based ladders live in nfl_standings.py (golden-tested
    against GSIS's 2025 standings). Seeds 1-7 per conference; the actual
    bracket (2v7 3v6 4v5, 1-seed bye, reseeded divisional, championship,
    neutral-site Super Bowl).

WEEKLY PREDICTIONS + LEDGER: regular/post-season games in the next window
(reaching ahead to the first week when quiet) get a model win probability;
ESPN's posted line (moneyline de-vigged, else the spread through the same
Phi) provides the market column and a 50/50 blend that makes the pick.
Predictions freeze on first sight; later runs grade them against final
scores and accumulate pick accuracy + Brier for model, market and blend.

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
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_SIM = os.path.join(ROOT, "public", "data", "nfl-sim.json")
OUT_PRED = os.path.join(ROOT, "public", "data", "nfl-predictions.json")

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
    """{team: (margin_per_game, games)} from ESPN standings."""
    d = fetch_json("%s/v2/sports/football/nfl/standings?season=%d" % (ESPN, season))
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
    """All 272 regular-season games [(event_id, iso_date, home, away)]."""
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
                games[ev["id"]] = (ev.get("date", "")[:10], home, away)
    return [(gid,) + v for gid, v in sorted(games.items(), key=lambda kv: kv[1][0])]


def played_results(schedule_window_days=400):
    """Completed 2026 regular/post-season games from ESPN scoreboards, by
    scanning the season window. [(event_id, home, away, hs, as_, type)]."""
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
            out.append((ev["id"], home, away, hs, as_, ev["season"]["type"]))
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
    [(event_id, iso, home, away, market_pH or None, kickoff_iso or None)]."""
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
                        market_home_prob(comp), kickoff_iso(ev.get("date"))))
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
    """{conf: [seed1..seed7]} from a simulated regular season."""
    field = {}
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
    return field


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
    remaining alike) -- the static pairing counts the ladder needs."""
    m = {t: {} for t in TEAMS}
    for _gid, _d, h, a in schedule:
        m[h][a] = m[h].get(a, 0) + 1
        m[a][h] = m[a].get(h, 0) + 1
    return m


def simulate(ratings, schedule, base_wins, played_h2h, sims, meetings, seed=2026):
    rng = random.Random(seed)
    acc = {t: _tally() for t in TEAMS}
    for _ in range(sims):
        noise = {t: rng.gauss(0.0, SIGMA_SEASON) for t in TEAMS}
        r = {t: ratings[t] + noise[t] for t in TEAMS}
        wins = dict(base_wins)
        h2h = {t: dict(played_h2h[t]) for t in TEAMS}
        for _gid, _d, h, a in schedule:
            if sim_game(r[h], r[a], rng):
                wins[h] += 1
                h2h[h][a] = h2h[h].get(a, 0) + 1
            else:
                wins[a] += 1
                h2h[a][h] = h2h[a].get(h, 0) + 1
        field = playoff_field(wins, h2h, meetings, rng)
        afc, nfc, sb = run_playoffs(field, r, rng)
        for conf in ("AFC", "NFC"):
            s = field[conf]
            acc[s[0]]["seed1"] += 1
            for t in s:
                acc[t]["playoffs"] += 1
            for div, ts in DIVISIONS.items():
                if div.startswith(conf):
                    champ = next(t for t in s[:4] if t in ts)
                    acc[champ]["division"] += 1
        acc[afc]["conf"] += 1
        acc[nfc]["conf"] += 1
        acc[sb]["sb"] += 1
        for t in TEAMS:
            acc[t]["wins"] += wins[t]
    return acc


# -------------------------------------------------------- ledger + grading

def brier2(p_home, outcome_home_win):
    o = 1.0 if outcome_home_win else 0.0
    return (p_home - o) ** 2 + ((1 - p_home) - (1 - o)) ** 2


def grade_and_extend(ledger, results_by_id, upcoming, ratings, today_iso):
    known = {e["event_id"] for e in ledger}
    # ESPN's scoreboard is the kickoff source, so ungraded entries appended by
    # an earlier run pick their timestamp up (or a rescheduled time) here.
    kick_by_id = {u[0]: u[5] for u in upcoming if len(u) > 5 and u[5]}
    for e in ledger:
        if e.get("result"):
            continue
        if kick_by_id.get(e["event_id"]):
            e["kickoff"] = kick_by_id[e["event_id"]]
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
            b = e.get("blend") or e["model"]
            e["blend_brier"] = round(brier2(b["pH"], hw), 4)
            e["pick_correct"] = (e["pick"] == e["result"])
    for u in upcoming:
        gid, iso, h, a, mkt_ph = u[:5]
        kick = u[5] if len(u) > 5 else None
        if gid in known:
            continue
        ph = round(home_win_prob(ratings[h], ratings[a]), 4)
        entry = {
            "event_id": gid, "date": iso, "home": h, "away": a,
            "home_slug": slugify(h), "away_slug": slugify(a),
            "model": {"pH": ph}, "predicted_at": today_iso,
        }
        if kick:
            entry["kickoff"] = kick
        if mkt_ph is not None:
            entry["market"] = {"pH": mkt_ph}
            entry["blend"] = {"pH": round(MATCH_BLEND_W * mkt_ph + (1 - MATCH_BLEND_W) * ph, 4)}
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
    gm = [e for e in g if "market_brier" in e]
    rec["market_graded"] = len(gm)
    rec["market_brier"] = round(sum(e["market_brier"] for e in gm) / len(gm), 4) if gm else None
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
    played = [(h, a, hs, as_) for _id, h, a, hs, as_, ty in results if ty == 2]
    ratings = base_ratings(per_season, played)

    schedule = full_schedule(team_ids)
    if len(schedule) != 272:
        print("note: schedule has %d games (272 expected)" % len(schedule))
    played_ids = {r[0] for r in results}
    remaining = [(gid, d, h, a) for gid, d, h, a in schedule if gid not in played_ids]
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

    # Market blend: DraftKings Super Bowl futures -> ratings on the points
    # scale via the model's own rating->title-odds curve (quick pre-sim), then
    # blended at MARKET_W_SEASON. The stats see the past; the futures see the
    # roster news. Falls back to model-only if the market is unavailable.
    mkt_probs, mkt_provider = fetch_sb_futures()
    market_note = "model-only (no futures available)"
    if mkt_probs:
        pre = simulate(ratings, remaining, base_wins, played_h2h, CALIB_SIMS,
                       meetings, seed=99)
        pre_acc = pre[1] if isinstance(pre, tuple) else pre
        pairs = []
        for t in TEAMS:
            p = pre_acc[t]["sb"] / CALIB_SIMS
            pairs.append((_logodds(p), ratings[t]))
        a, b = _fit_rating_from_logodds(pairs)
        if b > 0:
            r_mkt = {t: a + b * _logodds(mkt_probs.get(t, 1.0 / 64)) for t in TEAMS}
            m = sum(r_mkt.values()) / len(r_mkt)
            r_mkt = {t: v - m for t, v in r_mkt.items()}
            ratings = {t: (1 - MARKET_W_SEASON) * ratings[t] + MARKET_W_SEASON * r_mkt[t]
                       for t in TEAMS}
            m2 = sum(ratings.values()) / len(ratings)
            ratings = {t: v - m2 for t, v in ratings.items()}
            market_note = "blended (weight %.2f, %s futures, 32 teams)" % (
                MARKET_W_SEASON, mkt_provider or "book")

    acc = simulate(ratings, remaining, base_wins, played_h2h, sims, meetings)

    table = []
    for t in TEAMS:
        a = acc[t]
        table.append({
            "slug": slugify(t), "name": t,
            "conf": TEAM_CONF[t], "division": TEAM_DIV[t],
            "rating": round(ratings[t], 2),
            "exp_wins": round(a["wins"] / sims, 1),
            "p_division": round(100.0 * a["division"] / sims, 2),
            "p_playoffs": round(100.0 * a["playoffs"] / sims, 2),
            "p_seed1": round(100.0 * a["seed1"] / sims, 2),
            "p_conf": round(100.0 * a["conf"] / sims, 2),
            "p_sb": round(100.0 * a["sb"] / sims, 2),
        })
    table.sort(key=lambda r: (-r["p_sb"], -r["exp_wins"]))
    assert len(table) == 32
    s = sum(r["p_sb"] for r in table)
    assert abs(s - 100.0) < 1.0, "p_sb sums to %.2f" % s
    s = sum(r["p_playoffs"] for r in table)
    assert abs(s - 1400.0) < 14.0, "p_playoffs sums to %.2f" % s

    sim_doc = {
        "meta": {
            "league": "nfl", "season": SEASON, "title_game": "Super Bowl LXI",
            "generated_at": today_iso, "sims": sims, "model": "points-v2",
            "hfa": HFA, "sigma_game": SIGMA_GAME, "sigma_season": SIGMA_SEASON,
            "regress": REGRESS,
            "strength_seasons": [s for s, _ in STRENGTH_SEASONS],
            "market": market_note, "market_weight": MARKET_W_SEASON,
            "schedule_games": len(schedule), "games_played": len(played),
            "source": "ESPN standings + 2026 schedule + posted lines + Super Bowl futures",
            "notes": "Regressed scoring-margin ratings blended with futures-implied market ratings; the real 272-game "
                     "schedule and full playoff bracket simulated; division "
                     "tie-breaks approximated (record, then head-to-head).",
        },
        "table": table,
    }

    ledger = []
    if os.path.exists(OUT_PRED):
        try:
            ledger = json.load(io.open(OUT_PRED, encoding="utf-8")).get("ledger", [])
        except Exception:
            ledger = []
    results_by_id = {r[0]: (r[1], r[2], r[3], r[4]) for r in results}
    upcoming = upcoming_games(today, WINDOW_DAYS)
    ledger = grade_and_extend(ledger, results_by_id, upcoming, ratings, today_iso)
    pred_doc = {
        "meta": {"season": SEASON, "generated_at": today_iso,
                 "match_blend_weight": MATCH_BLEND_W, "horizon_days": WINDOW_DAYS,
                 "odds_source": "ESPN posted lines (moneyline, else spread)",
                 "results_source": "ESPN final scores"},
        "record": ledger_record(ledger),
        "ledger": ledger,
    }
    return sim_doc, pred_doc


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []

    def check(name, cond):
        if not cond:
            fails.append(name)

    check("divisions-32", len(TEAMS) == 32 and len(DIVISIONS) == 8)
    check("phi-mid", abs(phi(0.0) - 0.5) < 1e-9)
    p = home_win_prob(3.0, -3.0)
    check("winprob-favourite", 0.65 < p < 0.75)
    check("winprob-sym", abs(home_win_prob(0, 0) - phi(HFA / SIGMA_GAME)) < 1e-9)
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
    # playoff field: 7 per conference, division winners seeded 1-4
    rng = random.Random(4)
    wins = {t: 8 for t in TEAMS}
    wins["Kansas City Chiefs"] = 14
    wins["Buffalo Bills"] = 13
    h2h = {t: {} for t in TEAMS}
    mt = {t: {} for t in TEAMS}
    field = playoff_field(wins, h2h, mt, rng)
    check("field-7", len(field["AFC"]) == 7 and len(field["NFC"]) == 7)
    check("field-seed1", field["AFC"][0] == "Kansas City Chiefs")
    check("field-div-first", all(len({TEAM_DIV[t] for t in field[c][:4]}) == 4 for c in field))
    # playoffs run to a single SB winner from the field
    r = {t: 0.0 for t in TEAMS}
    afc, nfc, sb = run_playoffs(field, r, random.Random(5))
    check("sb-winner", sb in (afc, nfc) and TEAM_CONF[afc] == "AFC" and TEAM_CONF[nfc] == "NFC")
    # market prob from moneyline + spread paths
    comp = {"odds": [{"homeTeamOdds": {"moneyLine": -160}, "awayTeamOdds": {"moneyLine": 140}}]}
    mp = market_home_prob(comp)
    check("ml-devig", 0.58 < mp < 0.65)
    comp2 = {"odds": [{"spread": -3.5}]}
    check("spread-prob", 0.58 < market_home_prob(comp2) < 0.62)
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

    if fails:
        print("SELF-TEST FAIL:", ", ".join(fails))
        sys.exit(1)
    print("self-test OK (24 cases)")


def main():
    if "--self-test" in sys.argv:
        self_test(); return
    sims = DEFAULT_SIMS
    if "--sims" in sys.argv:
        sims = int(sys.argv[sys.argv.index("--sims") + 1])
    sim_doc, pred_doc = build(sims)
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
    print("wrote nfl-sim.json + nfl-predictions.json")


if __name__ == "__main__":
    main()
