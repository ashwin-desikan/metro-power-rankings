#!/usr/bin/env python3
"""MLB 2026 season simulator - playoff odds per team.

The baseball leg of /predictions, same convention as the NFL and Premier
League sims:
  public/data/mlb-sim.json          - season odds per team (exp wins, division,
                              playoffs, first-round bye, pennant, World Series)
  public/data/mlb-sim-history.json  - one snapshot per build date, for trend
                              lines on the same numbers

WHY IN-HOUSE. There is no free, licensable public feed for MLB postseason
probabilities. FanGraphs and Baseball-Reference both publish them but serve
them from undocumented internal endpoints under terms that forbid scraping,
ESPN's BPI has no public odds feed, and the commercial APIs sell betting
lines rather than postseason probabilities. Computing our own is the only
route that is ours to explain on /methodology, and the machinery already
exists (build_nfl_sim.py). See HANDOFF.md 2026-08-04.

MODEL (rundiff-v1, "site data + market"):
  - Team strength = regressed run differential per game. Prior seasons come
    from ESPN standings (2025/2024, weights .60/.40, shrunk toward league
    average by REGRESS); the current season is folded in at a weight that
    grows with games played and dominates by midsummer (baseball has 162
    games of signal, so unlike the NFL the current year should win).
  - Run differential becomes a true-talent win pct through the classic ten-
    runs-per-win rule: wpct = .500 + rd_per_game / RPW. A +1.0 run/game team
    reads as a .600 club, which is about right for an elite roster.
  - Ratings are the log-odds of that win pct, so a head-to-head game is
    exactly the log5 formula plus a home-field term:
        P(home) = sigmoid(r_home - r_away + HFA_LOGIT)
    HFA_LOGIT is the log-odds of .535, MLB's long-run home win rate.
  - The REAL remaining schedule (ESPN per-team schedules, 2430 games over a
    full season) is simulated DEFAULT_SIMS times with per-season rating noise.
    Division winners by record (head-to-head inside the sim, then random,
    standing in for the full tie-break ladder). Seeds 1-3 are the division
    winners, 4-6 the wild cards.
  - The real bracket: seeds 1-2 bye; Wild Card 3v6 and 4v5 best-of-3 entirely
    at the higher seed; LDS best-of-5 (2-2-1); LCS and World Series
    best-of-7 (2-3-2). Home games follow the actual pattern, not a coin flip.
  - Market blend: ESPN carries a World Series winner futures market. It is
    mapped onto the rating scale through the model's own rating-to-title-odds
    curve and blended at MARKET_W_MAX scaled by the share of the season still
    unplayed, so it matters in March and is nearly silent in September. Soft
    by design: no futures means model-only, not a failure.

RUNDIFF-V1-V3 additions (contract 2026-09-03, mirrors build_nfl_sim.py's
points-v3): per-season noise now has three correlated layers on the log-odds
scale (a league-wide HFA jitter, a per-division jitter, and a per-team
residual sized so the total matches an adaptive sigma that shrinks as the
season plays out and widens where the stats and market ratings disagree
about a team). Every simulated season draws from common random numbers keyed
to its index (rating shocks, then one uniform per FULL-schedule game in fixed
(date, event id) order), so a rating change does not reshuffle which games
"get unlucky" between builds; postseason and tie-break draws come from a
second, independent random stream. Season win-count percentiles are
collected from the same run, and a history file tracks the headline numbers
across builds.

    python scripts/predictions/build_mlb_sim.py               # build + write
    python scripts/predictions/build_mlb_sim.py --dry
    python scripts/predictions/build_mlb_sim.py --self-test   # offline tests
    python scripts/predictions/build_mlb_sim.py --sims 50000

Network: ESPN only (Windows box / mini / CI; the Cowork sandbox is blocked).
"""
import io
import json
import math
import os
import random
import sys
import time
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_SIM = os.path.join(ROOT, "public", "data", "mlb-sim.json")
OUT_HIST = os.path.join(ROOT, "public", "data", "mlb-sim-history.json")

SEASON = 2026
GAMES_PER_TEAM = 162
STRENGTH_SEASONS = [(2025, 0.60), (2024, 0.40)]
REGRESS = 0.62          # keep 62% of past run differential; shrink the rest
RPW = 10.0              # runs per win (rd/game -> wpct above .500)
CUR_W_CAP = 0.88        # ceiling on the current season's weight in a rating
CUR_W_SLOPE = 1.25      # how fast that weight climbs with games played
HFA_LOGIT = math.log(0.535 / 0.465)   # MLB home win rate, in log-odds
SIGMA_SEASON = 0.07     # per-simulated-season rating noise, log-odds (humility)
WPCT_CLAMP = 0.24       # ratings clamp to .260-.740 true talent
MARKET_W_MAX = 0.35     # preseason weight of the futures-implied rating
CALIB_SIMS = 3000       # quick pre-sim mapping rating <-> title odds
DEFAULT_SIMS = 20000
ESPN = "https://site.api.espn.com/apis"

# rundiff-v1-v3: correlated season-noise layers, the adaptive-sigma / market
# disagreement knob, and history-file cap (contract 2026-09-03).
SEED = SEASON              # common random numbers seed
HFA_SD = 0.01               # sd of the per-season league-wide HFA-logit jitter
DIV_SD = 0.03                # sd of the per-season, per-division jitter
SIGMA_FLOOR_FRAC = 0.45      # floor on adaptive sigma as a fraction of SIGMA_SEASON
DISAGREE_K = 0.5             # widens a team's sigma by this * |stats - market|
TEAM_SD_FLOOR = 0.0004       # floor (variance) under the per-team residual sqrt
HISTORY_KEEP = 180           # max snapshots kept in mlb-sim-history.json

# The six divisions, keyed by ESPN's team `name` (the mark, not the city).
# lib/mlb-standings.ts already relies on that field matching the workbook
# canonical, so the same key joins this file to the live standings snapshot.
# Marks survive relocations that displayName does not (the Athletics dropped
# "Oakland" in 2025 and the displayName changed; the mark did not).
DIVISIONS = {
    "AL East": ["Blue Jays", "Orioles", "Rays", "Red Sox", "Yankees"],
    "AL Central": ["Guardians", "Royals", "Tigers", "Twins", "White Sox"],
    "AL West": ["Angels", "Astros", "Athletics", "Mariners", "Rangers"],
    "NL East": ["Braves", "Marlins", "Mets", "Nationals", "Phillies"],
    "NL Central": ["Brewers", "Cardinals", "Cubs", "Pirates", "Reds"],
    "NL West": ["Diamondbacks", "Dodgers", "Giants", "Padres", "Rockies"],
}
TEAM_DIV = {t: d for d, ts in DIVISIONS.items() for t in ts}
TEAM_LG = {t: d.split()[0] for t, d in TEAM_DIV.items()}
TEAMS = sorted(TEAM_DIV)

# Home-game patterns from the higher seed's point of view. Wild Card is played
# entirely at the higher seed; LDS is 2-2-1; LCS and World Series are 2-3-2.
WC_PATTERN = ["H", "H", "H"]
LDS_PATTERN = ["H", "H", "A", "A", "H"]
BO7_PATTERN = ["H", "H", "A", "A", "A", "H", "H"]


def fetch_json(url, soft=False, retries=3):
    """ESPN rate-limits bursts with a 403 rather than a 429, and 30 team
    schedules in a row is a burst. Retry with backoff before giving up.

    Catch OSError, not urllib.error.URLError: socket TimeoutError is an
    OSError but NOT a URLError, so a URLError-only except never retries a
    timeout. That exact mistake killed two pipeline runs in this repo
    (scripts/build-country-indicators.py, 2026-08-04).

    The User-Agent is load-bearing, and the rule is NOT global: Akamai's ESPN
    edge applies different UA policy per PoP, so a token that works from one
    machine 403s from another. Measured 2026-08-05, same four endpoints, same
    instant, from each vantage:

        UA sent                           mac mini (London)  Windows box (UK)  GH runners
        (none) -> "Python-urllib/3.x"           200                200          see below
        "python-requests/2.31", bare curl       200                200             -
        "CitizenOfNowhere/1.0"                  403                200             -
        branded "rankings-...-nowhere/1.0"      403                200            200
        browser spoof (Safari 17)               403                200             -
        empty string                            403                403             -

    So we send NO User-Agent and let urllib supply its own library token: the
    only shape that passed from every vantage tested. Do NOT "fix" this by
    adding a browser UA (403s at the mini's edge) and do NOT restore
    "CitizenOfNowhere/1.0" (403s at the mini's edge, which is precisely what
    blocked this job from migrating off GitHub Actions).

    Vercel is a separate problem and no UA solves it: ESPN scores Vercel's
    egress IPs regardless of headers, which is why lib/espnFetch.ts carries a
    committed-snapshot fallback. Do not copy this comment's conclusion there.
    """
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except (OSError, json.JSONDecodeError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
    if soft:
        print("soft-fetch miss: %s (%s)" % (url, last))
        return None
    raise SystemExit("required fetch failed after %d tries: %s (%s)" % (retries, url, last))


# ------------------------------------------------------------------ ratings

def _num(v):
    """ESPN scores arrive as a string, a number, or {'value': n}."""
    if isinstance(v, dict):
        v = v.get("value", v.get("displayValue"))
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _walk_entries(node, out):
    """ESPN nests standings groups (league -> division) to varying depths."""
    if isinstance(node, dict):
        for e in (node.get("standings") or {}).get("entries", []) or []:
            out.append(e)
        for ch in node.get("children") or []:
            _walk_entries(ch, out)
    elif isinstance(node, list):
        for ch in node:
            _walk_entries(ch, out)


def season_rundiff(season):
    """{team_mark: (run_diff_per_game, games)} from ESPN standings."""
    d = fetch_json("%s/v2/sports/baseball/mlb/standings?season=%d" % (ESPN, season))
    entries = []
    _walk_entries(d, entries)
    out = {}
    for e in entries:
        stats = {s.get("name"): s.get("value") for s in e.get("stats", []) or []}
        g = (stats.get("wins") or 0) + (stats.get("losses") or 0)
        mark = (e.get("team") or {}).get("name")
        if not g or mark not in TEAM_DIV:
            continue
        rf, ra = stats.get("pointsFor"), stats.get("pointsAgainst")
        if rf is not None and ra is not None:
            rd = (rf - ra) / g
        elif stats.get("differential") is not None:
            rd = stats["differential"] / g
        else:
            continue
        out[mark] = (rd, g)
    return out


def verify_wins(base_wins, played):
    """Hard gate: the W-L we derived from 30 team schedules must equal ESPN's
    own current standings.

    This exists because the failure it catches is SILENT. When the schedule
    parse broke (competitors on the schedule endpoint have no `name` field,
    so every game was discarded) the script did not error - it produced a
    complete, plausible-looking table in which every team sat at ~40% to make
    the playoffs, because the model had quietly been handed an unplayed
    season. A number that is merely wrong is far more dangerous here than a
    crash. Returns a note for meta; raises on a systematic mismatch.
    """
    d = fetch_json("%s/v2/sports/baseball/mlb/standings?season=%d" % (ESPN, SEASON), soft=True)
    if not d:
        if not played:
            raise SystemExit("no completed games parsed AND ESPN standings unreachable - "
                             "refusing to publish odds off an unverifiable empty season")
        return "unverified (ESPN standings unavailable)"
    entries = []
    _walk_entries(d, entries)
    espn = {}
    for e in entries:
        st = {s.get("name"): s.get("value") for s in e.get("stats", []) or []}
        mark = (e.get("team") or {}).get("name")
        if mark in TEAM_DIV and st.get("wins") is not None:
            espn[mark] = int(st["wins"])
    if len(espn) < 30:
        return "unverified (ESPN standings incomplete: %d teams)" % len(espn)
    # Preseason is a legitimate zero, a broken parse is not. ESPN's own
    # standings decide which one we are looking at: if the league really has
    # played games and we parsed none, that is the silent failure this
    # function exists to catch.
    if not played:
        if sum(espn.values()) == 0:
            return "preseason (no games played)"
        raise SystemExit("ESPN standings show %d league wins but we parsed 0 completed "
                         "games - the schedule parse is broken (see team_schedules)"
                         % sum(espn.values()))
    bad = sorted(t for t in TEAMS if espn[t] != base_wins[t])
    if bad:
        raise SystemExit("derived wins disagree with ESPN standings for %d team(s): %s"
                         % (len(bad), ", ".join("%s %d vs %d" % (t, base_wins[t], espn[t])
                                                for t in bad[:6])))
    return "verified against ESPN standings (30/30 teams)"


def wpct_from_rd(rd):
    """Ten-runs-per-win: a +1.0 run/game club reads as .600, clamped so a
    100-loss team cannot rate below .260 and drag the sim into nonsense."""
    p = 0.5 + rd / RPW
    return min(max(p, 0.5 - WPCT_CLAMP), 0.5 + WPCT_CLAMP)


def rating_from_wpct(p):
    return math.log(p / (1.0 - p))


def base_ratings(per_season, played_games):
    """Log-odds true-talent rating per team. played_games is
    [(home, away, hs, as_)] of completed 2026 games."""
    cur = {t: [0.0, 0] for t in TEAMS}   # summed run diff, games
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
        rd = REGRESS * (num / den) if den else 0.0
        gp = cur[t][1]
        if gp:
            wc = min(CUR_W_CAP, gp / float(GAMES_PER_TEAM) * CUR_W_SLOPE)
            rd = (1 - wc) * rd + wc * (cur[t][0] / gp)
        ratings[t] = rating_from_wpct(wpct_from_rd(rd))
    m = sum(ratings.values()) / len(ratings)
    return {t: v - m for t, v in ratings.items()}


def home_win_prob(r_h, r_a, hfa=HFA_LOGIT):
    """log5 plus home field, done in log-odds space where both are additive."""
    return 1.0 / (1.0 + math.exp(-(r_h - r_a + hfa)))


# --------------------------------------------------------- adaptive sigma

def adaptive_sigma(frac_left, sigma_season=SIGMA_SEASON, floor_frac=SIGMA_FLOOR_FRAC):
    """League-wide per-season rating sigma given the fraction of the season's
    games still to play; shrinks toward `floor_frac` of the full-season value
    as the season resolves, never below it."""
    frac_left = min(max(frac_left, 0.0), 1.0)
    return sigma_season * max(floor_frac, math.sqrt(frac_left))


def team_sigma(sigma_base, r_stats, r_market, disagree_k=DISAGREE_K):
    """Widen a team's season sigma by how much the stats and market ratings
    disagree about it (no widening when there is no market rating)."""
    if r_market is None:
        return sigma_base
    return math.sqrt(sigma_base ** 2 + (disagree_k * abs(r_stats - r_market)) ** 2)


def div_residual_sd(sigma_adaptive, div_sd=DIV_SD, floor=TEAM_SD_FLOOR):
    """sd of a team's own noise layer once the shared division layer (sd
    `div_sd`) is split out of its adaptive sigma, so the two layers' variance
    sums back to it (floored so a small adaptive sigma never goes negative
    under the sqrt)."""
    return math.sqrt(max(sigma_adaptive ** 2 - div_sd ** 2, floor))


# --------------------------------------------------------------- intervals

def percentiles(values, p):
    """Nearest-rank percentile (p in 0..100) of a list of numbers. None for
    an empty list. Used for the season win-count p10/p90 bands."""
    if not values:
        return None
    s = sorted(values)
    idx = int(round((p / 100.0) * (len(s) - 1)))
    idx = min(max(idx, 0), len(s) - 1)
    return s[idx]


def band_for(p_playoffs):
    """Playoff-odds band label from p_playoffs (0..100)."""
    if p_playoffs >= 90:
        return "solid"
    if p_playoffs >= 75:
        return "likely"
    if p_playoffs >= 60:
        return "lean"
    if p_playoffs >= 40:
        return "tossup"
    if p_playoffs >= 15:
        return "unlikely"
    return "out"


# ------------------------------------------------------------------- history

def upsert_snapshot(doc, date_iso, games_played, rows, keep=HISTORY_KEEP):
    """Insert or replace `date_iso`'s snapshot in the history doc (a rebuild
    on the same date REPLACES it, never duplicates), sorted ascending by
    date and capped at `keep` entries (oldest dropped first). `doc` may be
    None for a fresh file."""
    doc = doc or {"meta": {"league": "mlb", "season": SEASON,
                           "generated_at": date_iso, "keep": keep},
                  "snapshots": []}
    snaps = [s for s in doc.get("snapshots", []) if s.get("date") != date_iso]
    snaps.append({"date": date_iso, "games_played": games_played, "rows": rows})
    snaps.sort(key=lambda s: s["date"])
    if len(snaps) > keep:
        snaps = snaps[-keep:]
    doc["snapshots"] = snaps
    doc["meta"]["generated_at"] = date_iso
    doc["meta"]["keep"] = keep
    return doc


# ----------------------------------------------------------------- schedule

def espn_teams():
    """{team_mark: (espn_id, displayName)} for the 30 current clubs."""
    d = fetch_json("%s/site/v2/sports/baseball/mlb/teams?limit=50" % ESPN)
    out = {}
    for grp in d.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
        t = grp.get("team", {})
        out[t.get("name")] = (t.get("id"), t.get("displayName"))
    return out


def team_schedules(team_ids):
    """One pass over 30 per-team schedules gives BOTH the full 2430-game
    regular season and every completed result, which is cheaper and far more
    reliable than paging the scoreboard endpoint a month at a time.

    Competitors on THIS endpoint carry only id / displayName / location /
    shortDisplayName - there is no `name` field, unlike the teams and
    standings endpoints. Resolve the mark through the id map (falling back to
    shortDisplayName, which happens to equal the mark) rather than reading
    `team.name`, which is silently None here and would drop every game.

    -> {event_id: (iso_date, home_mark, away_mark, hs, as_, completed)}
    """
    id2mark = {str(tid): mark for mark, (tid, _dn) in team_ids.items()}
    games = {}
    for mark, (tid, _dn) in team_ids.items():
        d = fetch_json("%s/site/v2/sports/baseball/mlb/teams/%s/schedule"
                       "?season=%d&seasontype=2" % (ESPN, tid, SEASON), soft=True)
        for ev in (d or {}).get("events", []) or []:
            comp = (ev.get("competitions") or [{}])[0]
            done = bool(((comp.get("status") or {}).get("type") or {}).get("completed"))
            home = away = None
            hs = as_ = None
            for c in comp.get("competitors", []) or []:
                t = c.get("team") or {}
                nm = id2mark.get(str(t.get("id"))) or t.get("shortDisplayName")
                sc = _num(c.get("score"))
                if c.get("homeAway") == "home":
                    home, hs = nm, sc
                else:
                    away, as_ = nm, sc
            if home in TEAM_DIV and away in TEAM_DIV:
                games[ev["id"]] = (ev.get("date", "")[:10], home, away, hs, as_, done)
    return games


# ------------------------------------------------------- market (futures)

def american_prob(v):
    v = float(str(v).replace("+", ""))
    return 100.0 / (v + 100.0) if v > 0 else -v / (-v + 100.0)


def fetch_ws_futures():
    """({team_mark: devigged World Series win prob}, provider) from the
    futures market ESPN carries, or (None, None). Soft by design."""
    import re as _re
    f = fetch_json("https://sports.core.api.espn.com/v2/sports/baseball/leagues/"
                   "mlb/seasons/%d/futures?limit=50" % SEASON, soft=True)
    if not f:
        return None, None
    item = next((i for i in f.get("items", []) or []
                 if "World Series" in (i.get("name") or "")), None)
    if not item or not item.get("futures"):
        return None, None
    fut = item["futures"][0]
    id2mark = {}
    d = fetch_json("%s/site/v2/sports/baseball/mlb/teams?limit=50" % ESPN, soft=True)
    for grp in (d or {}).get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
        t = grp.get("team", {})
        id2mark[str(t.get("id"))] = t.get("name")
    probs = {}
    for b in fut.get("books", []) or []:
        ml = b.get("value")
        m = _re.search(r"teams/(\d+)", (b.get("team") or {}).get("$ref", ""))
        mark = id2mark.get(m.group(1)) if m else None
        if mark in TEAM_DIV and ml is not None:
            try:
                probs[mark] = american_prob(ml)
            except ValueError:
                pass
    if len(probs) < 26:
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
    return {"wins": 0.0, "division": 0, "playoffs": 0, "bye": 0,
            "pennant": 0, "ws": 0}


def rank_group(teams, wins, h2h, rng):
    """Order a set of teams: wins, then head-to-head inside the tied group,
    then random. MLB dropped game 163 in 2022 and breaks ties on head-to-head
    first, so this is the real first rung of the ladder plus a coin flip for
    the rest (intradivision record and on down are not modelled)."""
    ts = sorted(teams, key=lambda t: (-wins[t], rng.random()))
    out = []
    i = 0
    while i < len(ts):
        j = i
        while j < len(ts) and wins[ts[j]] == wins[ts[i]]:
            j += 1
        group = ts[i:j]
        if len(group) > 1:
            # `members` MUST be a separate list. CPython's list.sort() empties
            # the list while it computes keys (its guard against mutation
            # during sorting), so a key closing over `group` itself sees an
            # empty list, every h2h sum comes out 0, and the tie-break silently
            # degrades to the random fallback. build_nfl_sim.py shipped with
            # exactly that bug; its self-test passed only by luck of the seed.
            members = list(group)
            group.sort(key=lambda t: (-sum(h2h[t].get(u, 0) for u in members if u != t),
                                      rng.random()))
        out.extend(group)
        i = j
    return out


def playoff_field(wins, h2h, rng):
    """{league: [seed1..seed6]} - three division winners then three wild
    cards, each ordered by record."""
    field = {}
    for lg in ("AL", "NL"):
        champs, rest = [], []
        for div, ts in DIVISIONS.items():
            if not div.startswith(lg):
                continue
            order = rank_group(ts, wins, h2h, rng)
            champs.append(order[0])
            rest.extend(order[1:])
        champs = rank_group(champs, wins, h2h, rng)
        rest = rank_group(rest, wins, h2h, rng)
        field[lg] = champs + rest[:3]
    return field


def sim_series(hi, lo, r, rng, pattern):
    """Best-of-len(pattern) between a higher seed `hi` and `lo`, with home
    games following the real pattern. Returns the winner."""
    need = len(pattern) // 2 + 1
    w_hi = w_lo = 0
    for slot in pattern:
        if slot == "H":
            p = home_win_prob(r[hi], r[lo])
        else:
            p = 1.0 - home_win_prob(r[lo], r[hi])
        if rng.random() < p:
            w_hi += 1
        else:
            w_lo += 1
        if w_hi == need or w_lo == need:
            break
    return hi if w_hi > w_lo else lo


def run_playoffs(field, wins, r, rng):
    """-> (al_pennant, nl_pennant, ws_winner) through the 2022-format
    bracket: 1-2 bye, WC 3v6 and 4v5 (Bo3 at the higher seed), LDS Bo5
    2-2-1 with the 1 seed drawing the lowest survivor, LCS Bo7. The World
    Series host is the pennant winner with the better regular-season record,
    ties broken at random."""
    pennants = {}
    for lg in ("AL", "NL"):
        s = field[lg]
        wc36 = sim_series(s[2], s[5], r, rng, WC_PATTERN)
        wc45 = sim_series(s[3], s[4], r, rng, WC_PATTERN)
        # The 1 seed always draws the lowest remaining seed.
        lo, hi2 = sorted((wc36, wc45), key=lambda t: -s.index(t))
        lds1 = sim_series(s[0], lo, r, rng, LDS_PATTERN)
        lds2 = sim_series(s[1], hi2, r, rng, LDS_PATTERN)
        a, b = sorted((lds1, lds2), key=lambda t: s.index(t))
        pennants[lg] = sim_series(a, b, r, rng, BO7_PATTERN)
    al, nl = pennants["AL"], pennants["NL"]
    host, away = sorted((al, nl), key=lambda t: (-wins[t], rng.random()))
    return al, nl, sim_series(host, away, r, rng, BO7_PATTERN)


def simulate(ratings, schedule, base_wins, played_h2h, sims, seed=SEED,
             sigma_team=None, gid_pos=None, n_full=0):
    """Monte Carlo the remaining schedule `sims` times.

    `schedule`: [(gid, home, away)] games still to play. `gid_pos`:
    {event_id: position in the FULL (played + remaining) season, sorted by
    (date, event id)} - fixed regardless of how much of the season has been
    played, so a game's draw never moves between builds. `n_full`: total
    games in that full ordering.

    Common random numbers: season i draws its correlated rating shocks (a
    league-wide HFA-logit jitter, a per-division jitter, a per-team
    residual) and then ONE uniform per game of the full schedule, indexed by
    gid_pos, from random.Random(seed*1_000_003 + i); postseason and
    tie-break draws come from a second random.Random(seed*7_919 + i), so
    neither stream's length depends on the other.

    `sigma_team`: {team: adaptive per-team sigma} (falls back to
    SIGMA_SEASON for any team missing from it).

    Returns (acc, win_lists): acc per-team tallies, win_lists per-team
    season win counts across sims (for percentiles)."""
    sigma_team = sigma_team or {}
    gid_pos = gid_pos or {}
    div_names = sorted(DIVISIONS)
    e_sd = {t: div_residual_sd(sigma_team.get(t, SIGMA_SEASON)) for t in TEAMS}

    acc = {t: _tally() for t in TEAMS}
    win_lists = {t: [] for t in TEAMS}

    for i in range(sims):
        rng = random.Random(seed * 1_000_003 + i)
        rng2 = random.Random(seed * 7_919 + i)
        hfa_s = HFA_LOGIT + rng.gauss(0.0, HFA_SD)
        div_noise = {d: rng.gauss(0.0, DIV_SD) for d in div_names}
        team_noise = {t: rng.gauss(0.0, e_sd[t]) for t in TEAMS}
        r = {t: ratings[t] + div_noise[TEAM_DIV[t]] + team_noise[t] for t in TEAMS}
        uniforms = [rng.random() for _ in range(n_full)]

        pcache = {}
        wins = dict(base_wins)
        h2h = {t: dict(played_h2h[t]) for t in TEAMS}
        for gid, h, a in schedule:
            key = (h, a)
            p = pcache.get(key)
            if p is None:
                p = pcache[key] = home_win_prob(r[h], r[a], hfa=hfa_s)
            u = uniforms[gid_pos[gid]] if gid in gid_pos else rng.random()
            if u < p:
                wins[h] += 1
                h2h[h][a] = h2h[h].get(a, 0) + 1
            else:
                wins[a] += 1
                h2h[a][h] = h2h[a].get(h, 0) + 1
        field = playoff_field(wins, h2h, rng2)
        al, nl, ws = run_playoffs(field, wins, r, rng2)
        for lg in ("AL", "NL"):
            s = field[lg]
            for t in s:
                acc[t]["playoffs"] += 1
            for t in s[:2]:
                acc[t]["bye"] += 1
            for t in s[:3]:
                acc[t]["division"] += 1
        acc[al]["pennant"] += 1
        acc[nl]["pennant"] += 1
        acc[ws]["ws"] += 1
        for t in TEAMS:
            acc[t]["wins"] += wins[t]
            win_lists[t].append(wins[t])
    return acc, win_lists


# -------------------------------------------------------------------- build

def build(sims, today=None):
    today_iso = (today or date.today()).isoformat()

    team_ids = espn_teams()
    missing = sorted(set(TEAMS) - set(team_ids))
    if missing:
        raise SystemExit("division map out of date vs ESPN: %s" % missing)

    games = team_schedules(team_ids)
    played = [(h, a, hs, as_) for _d, h, a, hs, as_, done in games.values()
              if done and hs is not None and as_ is not None]
    # Full-season fixed ordering for common random numbers: every game
    # (played or not), sorted by (date, event id), position never moves as
    # the season plays out.
    full_sorted = sorted(games.items(), key=lambda kv: (kv[1][0], kv[0]))
    gid_pos = {gid: i for i, (gid, _v) in enumerate(full_sorted)}
    n_full = len(full_sorted)
    remaining = [(gid, v[1], v[2]) for gid, v in games.items() if not v[5]]

    per_season = {s: season_rundiff(s) for s, _ in STRENGTH_SEASONS}
    r_stats = base_ratings(per_season, played)
    ratings = dict(r_stats)

    base_wins = {t: 0 for t in TEAMS}
    base_losses = {t: 0 for t in TEAMS}
    played_h2h = {t: {} for t in TEAMS}
    for h, a, hs, as_ in played:
        if hs > as_:
            base_wins[h] += 1; base_losses[a] += 1
            played_h2h[h][a] = played_h2h[h].get(a, 0) + 1
        elif as_ > hs:
            base_wins[a] += 1; base_losses[h] += 1
            played_h2h[a][h] = played_h2h[a].get(h, 0) + 1
        # A regular-season tie is not a thing in modern MLB; a suspended game
        # simply is not `completed` yet, so it lands in `remaining`.

    wins_note = verify_wins(base_wins, played)

    # Market blend, scaled by how much season is left. In March the futures
    # carry real information the prior years cannot; by September the standings
    # have said everything and the market should be nearly silent.
    total_slots = GAMES_PER_TEAM * len(TEAMS) / 2.0
    frac_left = min(1.0, len(remaining) / total_slots) if total_slots else 0.0
    market_w = MARKET_W_MAX * frac_left
    market_note = "model-only (no futures available)"
    r_market = None
    mkt_probs, provider = fetch_ws_futures()
    if mkt_probs and market_w > 0.01:
        pre_acc, _pre_wl = simulate(r_stats, remaining, base_wins, played_h2h,
                                    CALIB_SIMS, seed=99, gid_pos=gid_pos, n_full=n_full)
        pairs = [(_logodds(pre_acc[t]["ws"] / CALIB_SIMS), r_stats[t]) for t in TEAMS]
        a, b = _fit_rating_from_logodds(pairs)
        if b > 0:
            r_mkt = {t: a + b * _logodds(mkt_probs.get(t, 1.0 / 60)) for t in TEAMS}
            m = sum(r_mkt.values()) / len(r_mkt)
            r_mkt = {t: v - m for t, v in r_mkt.items()}
            r_market = r_mkt
            ratings = {t: (1 - market_w) * r_stats[t] + market_w * r_mkt[t]
                       for t in TEAMS}
            m2 = sum(ratings.values()) / len(ratings)
            ratings = {t: v - m2 for t, v in ratings.items()}
            market_note = "blended (weight %.2f of %.2f max, %s futures, %d teams)" % (
                market_w, MARKET_W_MAX, provider or "book", len(mkt_probs))
    elif mkt_probs:
        market_note = "model-only (season too far advanced for futures to add signal)"

    # Adaptive sigma: league-wide from games remaining, widened per team by
    # stats/market disagreement.
    sigma_base = adaptive_sigma(frac_left)
    sigma_team_dict = {t: team_sigma(sigma_base, r_stats[t],
                                     r_market[t] if r_market is not None else None)
                       for t in TEAMS}

    acc, win_lists = simulate(ratings, remaining, base_wins, played_h2h, sims,
                              sigma_team=sigma_team_dict, gid_pos=gid_pos, n_full=n_full)

    table = []
    for t in TEAMS:
        a = acc[t]
        p10 = percentiles(win_lists[t], 10)
        p90 = percentiles(win_lists[t], 90)
        p_playoffs = round(100.0 * a["playoffs"] / sims, 2)
        table.append({
            "canonical": t, "name": team_ids[t][1],
            "league": TEAM_LG[t], "division": TEAM_DIV[t],
            "rating": round(ratings[t], 4),
            "rating_stats": round(r_stats[t], 4),
            "rating_market": round(r_market[t], 4) if r_market is not None else None,
            "sigma_team": round(sigma_team_dict[t], 4),
            "true_wpct": round(1.0 / (1.0 + math.exp(-ratings[t])), 3),
            "wins": base_wins[t], "losses": base_losses[t],
            "exp_wins": round(a["wins"] / sims, 1),
            "wins_p10": round(p10, 1) if p10 is not None else None,
            "wins_p90": round(p90, 1) if p90 is not None else None,
            "p_division": round(100.0 * a["division"] / sims, 2),
            "p_playoffs": p_playoffs,
            "p_bye": round(100.0 * a["bye"] / sims, 2),
            "p_pennant": round(100.0 * a["pennant"] / sims, 2),
            "p_ws": round(100.0 * a["ws"] / sims, 2),
            "band": band_for(p_playoffs),
        })
    table.sort(key=lambda r: (-r["p_ws"], -r["exp_wins"]))

    assert len(table) == 30, "expected 30 teams, got %d" % len(table)
    s = sum(r["p_ws"] for r in table)
    assert abs(s - 100.0) < 1.0, "p_ws sums to %.2f" % s
    s = sum(r["p_playoffs"] for r in table)
    assert abs(s - 1200.0) < 12.0, "p_playoffs sums to %.2f" % s
    s = sum(r["p_pennant"] for r in table)
    assert abs(s - 200.0) < 2.0, "p_pennant sums to %.2f" % s

    corr_team_sd = round(sum(div_residual_sd(v) for v in sigma_team_dict.values())
                         / len(sigma_team_dict), 4)

    sim_doc = {
        "meta": {
            "league": "mlb", "season": SEASON, "title_game": "World Series",
            "generated_at": today_iso, "sims": sims, "model": "rundiff-v1-v3",
            "seed": SEED,
            "runs_per_win": RPW, "hfa_wpct": 0.535,
            "sigma_season": SIGMA_SEASON, "sigma_season_eff": round(sigma_base, 4),
            "corr": {"hfa_sd": HFA_SD, "div_sd": DIV_SD, "team_sd": corr_team_sd},
            "regress": REGRESS,
            "strength_seasons": [s for s, _ in STRENGTH_SEASONS],
            "market": market_note, "market_weight": round(market_w, 3),
            "schedule_games": len(games), "games_played": len(played),
            "games_remaining": len(remaining), "wins_check": wins_note,
            "source": "ESPN standings (2024/2025) + 2026 team schedules + World Series futures",
            "notes": "Regressed run-differential ratings on the ten-runs-per-win scale, "
                     "converted to log-odds so each game is log5 plus home field, with "
                     "correlated per-team/division/HFA season noise sized to an adaptive "
                     "sigma and common random numbers. The real remaining schedule and the "
                     "full 12-team bracket are simulated; division tie-breaks approximated "
                     "(record, then head-to-head).",
        },
        "table": table,
    }

    hist_rows = {r["canonical"]: {
        "xw": round(r["exp_wins"], 1),
        "div": round(r["p_division"], 1),
        "po": round(r["p_playoffs"], 1),
        "pennant": round(r["p_pennant"], 1),
        "title": round(r["p_ws"], 1),
    } for r in table}
    hist_doc = None
    if os.path.exists(OUT_HIST):
        try:
            hist_doc = json.load(io.open(OUT_HIST, encoding="utf-8"))
        except Exception:
            hist_doc = None
    hist_doc = upsert_snapshot(hist_doc, today_iso, len(played), hist_rows, HISTORY_KEEP)

    return sim_doc, hist_doc


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []
    ran = []

    def check(name, cond):
        ran.append(name)
        if not cond:
            fails.append(name)

    check("divisions-30", len(TEAMS) == 30 and len(DIVISIONS) == 6
          and all(len(v) == 5 for v in DIVISIONS.values()))
    check("leagues-15", sum(1 for t in TEAMS if TEAM_LG[t] == "AL") == 15)

    # run differential -> win pct on the ten-runs-per-win scale, and the clamp
    check("rd-even", abs(wpct_from_rd(0.0) - 0.5) < 1e-12)
    check("rd-elite", abs(wpct_from_rd(1.0) - 0.600) < 1e-12)
    check("rd-clamp", wpct_from_rd(-9.0) == 0.5 - WPCT_CLAMP)

    # log5 + HFA: equal teams give the league home win rate; the favourite is
    # helped by hosting and hurt by travelling, symmetrically in log-odds.
    check("hfa-even", abs(home_win_prob(0.0, 0.0) - 0.535) < 1e-9)
    r_good = rating_from_wpct(0.600) - rating_from_wpct(0.500)
    p_home = home_win_prob(r_good, 0.0)
    p_away = 1.0 - home_win_prob(0.0, r_good)
    check("hfa-splits", p_away < 0.600 < p_home)
    check("logodds-roundtrip", abs(1.0 / (1.0 + math.exp(-rating_from_wpct(0.62))) - 0.62) < 1e-12)

    # series: a certain winner takes the minimum number of games, and the
    # patterns encode the real home/away splits
    check("bo3", len(WC_PATTERN) == 3 and WC_PATTERN.count("H") == 3)
    check("bo5-221", LDS_PATTERN == ["H", "H", "A", "A", "H"])
    check("bo7-232", BO7_PATTERN.count("H") == 4 and BO7_PATTERN[2:5] == ["A", "A", "A"])
    r = {"Yankees": 9.0, "Rockies": -9.0}
    check("series-favourite",
          sim_series("Yankees", "Rockies", r, random.Random(1), BO7_PATTERN) == "Yankees")
    check("series-underdog",
          sim_series("Rockies", "Yankees", r, random.Random(1), BO7_PATTERN) == "Yankees")

    # tie-break: wins first, then head-to-head inside the tied group
    rng = random.Random(3)
    ts = DIVISIONS["AL East"]
    wins = {"Yankees": 95, "Red Sox": 95, "Rays": 88, "Blue Jays": 80, "Orioles": 70}
    h2h = {t: {} for t in TEAMS}
    h2h["Red Sox"]["Yankees"] = 8
    h2h["Yankees"]["Red Sox"] = 5
    order = rank_group(ts, wins, h2h, rng)
    check("tiebreak-h2h", order[0] == "Red Sox" and order[1] == "Yankees")
    check("tiebreak-last", order[-1] == "Orioles")

    # field: six per league, division winners seeded 1-3 and drawn from three
    # different divisions, wild cards 4-6
    wins = {t: 81 for t in TEAMS}
    for t, w in (("Yankees", 100), ("Guardians", 97), ("Astros", 95),
                 ("Red Sox", 94), ("Rays", 93), ("Mariners", 92), ("Angels", 91)):
        wins[t] = w
    field = playoff_field(wins, {t: {} for t in TEAMS}, random.Random(4))
    check("field-6", all(len(field[lg]) == 6 for lg in field))
    check("field-seed1", field["AL"][0] == "Yankees")
    check("field-div-winners", len({TEAM_DIV[t] for t in field["AL"][:3]}) == 3)
    check("field-wc-order", field["AL"][3] == "Red Sox" and field["AL"][4] == "Rays")
    check("field-no-dupes", len(set(field["AL"])) == 6 and len(set(field["NL"])) == 6)

    # bracket: the 1 seed cannot be knocked out before the LDS, and exactly one
    # champion emerges from each league
    r = {t: 0.0 for t in TEAMS}
    al, nl, ws = run_playoffs(field, wins, r, random.Random(5))
    check("bracket-leagues", TEAM_LG[al] == "AL" and TEAM_LG[nl] == "NL")
    check("bracket-ws", ws in (al, nl))
    check("bracket-from-field", al in field["AL"] and nl in field["NL"])

    # futures helpers
    check("american-fav", abs(american_prob(-160) - 160.0 / 260.0) < 1e-9)
    check("american-dog", abs(american_prob("+140") - 100.0 / 240.0) < 1e-9)
    a, b = _fit_rating_from_logodds([(-3.0, -3.0), (-2.0, -1.0), (-1.0, 1.0), (0.0, 3.0)])
    check("lofit", abs(b - 2.0) < 1e-9 and abs(a - 3.0) < 1e-9)
    check("lo-clamp", _logodds(0.0) < _logodds(0.5) < _logodds(1.0))

    # ESPN score shapes: string, number and the {'value': n} object
    check("num-shapes", _num("7") == 7 and _num(7) == 7 and _num({"value": 7.0}) == 7
          and _num(None) is None)

    # adaptive sigma: shrinks with games played, never below the floor, and
    # clamps a nonsense frac_left to [0, 1]
    check("adaptive-sigma-full", abs(adaptive_sigma(1.0, 0.07, 0.45) - 0.07) < 1e-12)
    check("adaptive-sigma-floor", abs(adaptive_sigma(0.0, 0.07, 0.45) - 0.07 * 0.45) < 1e-12)
    check("adaptive-sigma-mid", adaptive_sigma(0.25, 0.07, 0.45) < adaptive_sigma(1.0, 0.07, 0.45))
    check("adaptive-sigma-clamp-neg", adaptive_sigma(-3.0, 0.07, 0.45) == adaptive_sigma(0.0, 0.07, 0.45))
    check("adaptive-sigma-clamp-big", adaptive_sigma(99.0, 0.07, 0.45) == adaptive_sigma(1.0, 0.07, 0.45))

    # team sigma: no widening without a market rating; widens with disagreement
    check("team-sigma-no-market", team_sigma(0.05, 0.3, None) == 0.05)
    check("team-sigma-agree", abs(team_sigma(0.05, 0.3, 0.3) - 0.05) < 1e-12)
    ts_wide = team_sigma(0.05, 0.9, -0.1, disagree_k=0.5)
    check("team-sigma-disagree", ts_wide > 0.05)
    check("team-sigma-formula", abs(ts_wide - math.sqrt(0.05 ** 2 + (0.5 * 1.0) ** 2)) < 1e-9)

    # div residual sd: variance splits back out, floored so it never goes
    # negative under the sqrt for a tiny adaptive sigma
    dsd = div_residual_sd(0.05, div_sd=0.03, floor=0.0004)
    check("div-residual-variance", abs(dsd ** 2 + 0.03 ** 2 - 0.05 ** 2) < 1e-9)
    check("div-residual-floor", div_residual_sd(0.01, div_sd=0.03, floor=0.0004) == math.sqrt(0.0004))

    # percentiles: nearest-rank, empty-safe, monotonic p10 <= p90
    check("percentiles-empty", percentiles([], 50) is None)
    check("percentiles-single", percentiles([7], 10) == 7 and percentiles([7], 90) == 7)
    vals = [70, 75, 80, 85, 90, 95, 100, 105, 110]
    p10, p90 = percentiles(vals, 10), percentiles(vals, 90)
    check("percentiles-order", p10 <= p90)
    check("percentiles-bounds", vals[0] <= p10 and p90 <= vals[-1])

    # band thresholds, boundary-inclusive at each cut
    check("band-solid", band_for(90.0) == "solid" and band_for(99.9) == "solid")
    check("band-likely", band_for(75.0) == "likely" and band_for(89.9) == "likely")
    check("band-lean", band_for(60.0) == "lean")
    check("band-tossup", band_for(40.0) == "tossup")
    check("band-unlikely", band_for(15.0) == "unlikely")
    check("band-out", band_for(14.9) == "out" and band_for(0.0) == "out")

    # upsert_snapshot: fresh doc, same-date rebuild replaces (not appends),
    # ascending sort, and the cap drops the oldest first
    doc = upsert_snapshot(None, "2026-04-01", 5, {"yankees": {"xw": 90.0}}, keep=3)
    check("snapshot-fresh", len(doc["snapshots"]) == 1 and doc["meta"]["league"] == "mlb")
    doc = upsert_snapshot(doc, "2026-04-01", 6, {"yankees": {"xw": 91.0}}, keep=3)
    check("snapshot-replace-same-date", len(doc["snapshots"]) == 1
          and doc["snapshots"][0]["games_played"] == 6)
    doc = upsert_snapshot(doc, "2026-03-30", 4, {"yankees": {"xw": 89.0}}, keep=3)
    check("snapshot-sorted", [s["date"] for s in doc["snapshots"]] == ["2026-03-30", "2026-04-01"])
    doc = upsert_snapshot(doc, "2026-04-05", 8, {}, keep=3)
    doc = upsert_snapshot(doc, "2026-04-10", 10, {}, keep=3)
    check("snapshot-cap", len(doc["snapshots"]) == 3
          and doc["snapshots"][0]["date"] == "2026-04-01")

    # a tiny end-to-end sim: probabilities are well-formed, the better team
    # really does make the playoffs more often, and CRN keeps a game's draw
    # fixed regardless of which other games are in the (sub)schedule passed
    ratings = {t: 0.0 for t in TEAMS}
    ratings["Dodgers"] = 0.35
    full_pairs = [(h, a) for h in TEAMS for a in TEAMS
                  if h != a and TEAM_LG[h] == TEAM_LG[a]][:200]
    full_sched = [("g%d" % i, h, a) for i, (h, a) in enumerate(full_pairs)]
    gid_pos = {g[0]: i for i, g in enumerate(full_sched)}
    acc, win_lists = simulate(ratings, full_sched, {t: 60 for t in TEAMS},
                              {t: {} for t in TEAMS}, 60, seed=7,
                              gid_pos=gid_pos, n_full=len(full_sched))
    check("sim-playoff-count", abs(sum(a["playoffs"] for a in acc.values()) - 12 * 60) < 1)
    check("sim-ws-count", sum(a["ws"] for a in acc.values()) == 60)
    check("sim-pennant-count", sum(a["pennant"] for a in acc.values()) == 120)
    check("sim-favourite", acc["Dodgers"]["playoffs"] >= acc["Rockies"]["playoffs"])
    check("sim-win-lists", len(win_lists["Dodgers"]) == 60)
    # CRN: drop the LAST game from the schedule (as if it hadn't been played
    # yet) but keep the SAME full ordering (gid_pos/n_full unchanged). Every
    # other game's draw must be untouched, so every team NOT in the dropped
    # game must post the exact same season win total, one season at a time.
    drop_gid, drop_h, drop_a = full_sched[-1]
    partial_sched = full_sched[:-1]
    _acc2, wl2 = simulate(ratings, partial_sched, {t: 60 for t in TEAMS},
                          {t: {} for t in TEAMS}, 5, seed=7,
                          gid_pos=gid_pos, n_full=len(full_sched))
    _acc1, wl1 = simulate(ratings, full_sched, {t: 60 for t in TEAMS},
                          {t: {} for t in TEAMS}, 5, seed=7,
                          gid_pos=gid_pos, n_full=len(full_sched))
    untouched = [t for t in TEAMS if t not in (drop_h, drop_a)]
    check("crn-stable-subset", all(wl1[t] == wl2[t] for t in untouched))
    check("crn-dropped-game-differs",
          wl1[drop_h] != wl2[drop_h] or wl1[drop_a] != wl2[drop_a])

    if fails:
        print("SELF-TEST FAIL:", ", ".join(fails))
        sys.exit(1)
    print("self-test OK (%d cases)" % len(ran))


def main():
    if "--self-test" in sys.argv:
        self_test(); return
    sims = DEFAULT_SIMS
    if "--sims" in sys.argv:
        sims = int(sys.argv[sys.argv.index("--sims") + 1])
    sim_doc, hist_doc = build(sims)
    m = sim_doc["meta"]
    print("schedule %d games, %d played, %d remaining | %s\nwins: %s"
          % (m["schedule_games"], m["games_played"], m["games_remaining"],
             m["market"], m["wins_check"]))
    for r in sim_doc["table"][:10]:
        print("  %-14s %-11s WS %5.1f%%  pennant %5.1f%%  playoffs %6.2f%%  xW %5.1f (p10 %s p90 %s)"
              % (r["canonical"], r["division"], r["p_ws"], r["p_pennant"],
                 r["p_playoffs"], r["exp_wins"], r["wins_p10"], r["wins_p90"]))
    if "--dry" in sys.argv:
        print("dry run; nothing written."); return
    if m["games_played"] == 0:
        # A daily cron will fire in February. Preseason odds computed off two
        # year-old run differentials are not worth publishing, and overwriting
        # last October's file with them would be a regression, so exit clean
        # and leave the existing file alone.
        print("preseason: no games played; leaving the existing file untouched.")
        return
    if m["games_remaining"] == 0:
        print("note: regular season complete; odds are now a postseason snapshot.")
    with io.open(OUT_SIM, "w", encoding="utf-8", newline="") as f:
        json.dump(sim_doc, f, separators=(",", ":"), ensure_ascii=False)
    with io.open(OUT_HIST, "w", encoding="utf-8", newline="") as f:
        json.dump(hist_doc, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote %s + %s" % (os.path.relpath(OUT_SIM, ROOT), os.path.relpath(OUT_HIST, ROOT)))


if __name__ == "__main__":
    main()
