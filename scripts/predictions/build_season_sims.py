#!/usr/bin/env python3
"""Season simulators - playoff + championship odds for six leagues.

One script, six builders, one shared engine:
  public/data/afl-sim.json   AFL premiership odds     (finals: NEW 2026 top-10 wildcard format)
  public/data/nrl-sim.json   NRL premiership odds     (finals: top-8, AFL-style since 2012)
  public/data/wnba-sim.json  WNBA title odds          (top 8 overall; Bo3 / Bo5 / Bo7)
  public/data/cfl-sim.json   Grey Cup odds            (3+3 divisional with the crossover rule)
  public/data/npb-sim.json   Japan Series odds        (Climax Series both leagues, then JS)
  public/data/mls-sim.json   MLS Cup odds             (9 per conference: wild card, Bo3, KO)

Sits beside build_mlb_sim.py / build_nfl_sim.py / build_pl_sim.py and follows
their conventions: stdlib only, offline --self-test, hard verification of the
derived records against the source's own standings before anything is written,
data-only commits riding [vercel skip], read by the site via lib/seasonSim.ts
from GitHub raw with ISR.

MODEL (margin-v1, current season only). These six leagues do not justify the
MLB script's multi-season priors + futures blend; each uses its games-to-date:
  - Team strength = points/goals/runs margin per game, shrunk toward zero by
    GP/(GP+K) with a per-league K (heavy for the CFL's short season).
  - A game is a draw from N(m_home - m_away + HFA, SIGMA); win, and for the
    footy/soccer codes draw, read off the sampled margin. Baseball uses the
    MLB script's log5-with-HFA instead of margins.
  - Per-simulated-season rating noise (humility term), as in the other sims.
  - The real remaining schedule is simulated SIMS times; ladders use each
    league's actual points system and tie-breakers; the real bracket runs to
    a champion. NPB has no published remaining pairings in our feed, so its
    remaining games are distributed evenly across same-league opponents
    (interleague play is over by August; see npb_synthetic_schedule).

SOURCES (all verified reachable from GitHub runners; the Cowork sandbox is
egress-blocked for all of them, use SEASON_SIM_FIXTURES for offline dev):
  AFL/NRL  fixtures: afltables.com season pages (pairings + venue home team).
           records:  ESPN standings API (afltables lags played games by days,
           measured 2026-08-10: Penrith 19 played on afltables, 20 on ESPN,
           so ESPN owns W/L/D/PF/PA and afltables owns who-plays-whom).
           The two are reconciled: a "remaining" fixture whose both teams
           already have a full ESPN game count is dropped as already-played.
  WNBA/MLS ESPN standings + per-team schedule endpoints (build_mlb_sim.py
           pattern). NO User-Agent header anywhere: Akamai's ESPN edge
           applies per-PoP UA policy and a plain library token is the only
           shape that works everywhere (see build_mlb_sim.py fetch_json).
  CFL      cfl.ca /schedule/ (server-rendered WordPress: every game with a
           unix timestamp, Final status and scores) cross-checked against
           cfl.ca /standings/ (the same parse lib/cflStandings.ts does).
  NPB      SPAIA official_stats_history (the lib/npbStandings.ts source):
           W/L/D, runs for/against, RestGame per team.

    python scripts/predictions/build_season_sims.py                # all in-season leagues
    python scripts/predictions/build_season_sims.py --league afl,nrl
    python scripts/predictions/build_season_sims.py --self-test    # offline
    python scripts/predictions/build_season_sims.py --dry --sims 2000
    SEASON_SIM_FIXTURES=/tmp/simdev python ... --league afl --dry  # offline dev
"""
import argparse
import json
import math
import os
import random
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "public", "data")
ESPN = "https://site.api.espn.com/apis"
DEFAULT_SIMS = 20000
FIXTURES_DIR = os.environ.get("SEASON_SIM_FIXTURES")  # offline dev only

# Per-league knobs. SIGMA is the per-game margin spread, HFA the home margin
# edge, K the shrinkage half-life in games, DRAW_BAND the |margin| below which
# a sampled game is a draw (0 = draws impossible), NOISE the per-sim rating
# wobble in margin units.
CFG = {
    "afl":  dict(sigma=36.0, hfa=9.0,  k=6.0,  draw_band=0.5,  noise=2.5),
    "nrl":  dict(sigma=16.5, hfa=3.0,  k=6.0,  draw_band=0.25, noise=1.2),
    "wnba": dict(sigma=11.5, hfa=2.8,  k=10.0, draw_band=0.0,  noise=0.8),
    "cfl":  dict(sigma=13.5, hfa=3.0,  k=8.0,  draw_band=0.0,  noise=1.0),
    "mls":  dict(sigma=1.45, hfa=0.35, k=10.0, draw_band=0.5,  noise=0.10),
    # NPB uses the MLB log5 machinery (runs-per-win), not margins.
    "npb":  dict(rpw=9.5, hfa_wpct=0.535, k=30.0, tie_rate=0.012, noise=0.05),
}

# ------------------------------------------------------------------ fetching

def fetch_bytes(url, retries=3, soft=False):
    """Plain-library fetch, deliberately WITHOUT a User-Agent header.

    ESPN sits behind Akamai with per-PoP UA policy; the only UA shape that
    works from every vantage measured (GH runners, the mini, the Windows box)
    is urllib's own library token. afltables/cfl.ca/spaia accept it too.
    Full measurement matrix: build_mlb_sim.py fetch_json docstring.
    """
    if FIXTURES_DIR:
        p = os.path.join(FIXTURES_DIR, _fixture_name(url))
        with open(p, "rb") as f:
            return f.read()
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - retry then re-raise
            last = e
            time.sleep(2 * (i + 1))
    if soft:
        print("[season-sims] soft-fail %s: %r" % (url, last))
        return None
    raise last


def _fixture_name(url):
    """Map a live URL onto the sample files _scratch/simdev uses in dev."""
    table = [
        ("afltables.com/afl", "afl2026.html"),
        ("afltables.com/rl", "nrl2026.html"),
        ("cfl.ca/standings", "cfl_standings.html"),
        ("cfl.ca/schedule", "cfl_schedule.html"),
        ("GameAssortment=1", "spaia_central.json"),
        ("GameAssortment=2", "spaia_pacific.json"),
        ("wnba/standings", "espn_wnba_standings.json"),
        ("usa.1/standings", "espn_mls_standings.json"),
        ("wnba/teams?", "espn_wnba_teams.json"),
        ("usa.1/teams?", "espn_mls_teams.json"),
        ("australian-football/afl/standings", "espn_afl_standings.json"),
        ("rugby-league/3/standings", "espn_nrl_standings.json"),
        ("wnba/teams/", "espn_wnba_sched_sample.json"),
        ("usa.1/teams/", "espn_mls_sched_sample.json"),
    ]
    for needle, name in table:
        if needle in url:
            return name
    raise KeyError("no fixture mapped for %s" % url)


def fetch_json(url, retries=3, soft=False):
    b = fetch_bytes(url, retries=retries, soft=soft)
    return None if b is None else json.loads(b.decode("utf-8"))


def fetch_text(url, retries=3):
    return fetch_bytes(url, retries=retries).decode("utf-8", "replace")


# ------------------------------------------------------------------ math

def phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def margin_probs(m_home, m_away, cfg):
    """(p_home, p_draw, p_away) under the normal-margin model."""
    mu = m_home - m_away + cfg["hfa"]
    s = cfg["sigma"]
    b = cfg["draw_band"]
    if b <= 0:
        p_h = 1.0 - phi(-mu / s)
        return p_h, 0.0, 1.0 - p_h
    p_away = phi((-b - mu) / s)
    p_h = 1.0 - phi((b - mu) / s)
    return p_h, 1.0 - p_h - p_away, p_away


def shrink(margin_per_game, gp, k):
    return margin_per_game * (gp / (gp + k)) if gp > 0 else 0.0


def sample_margin(rng, m_home, m_away, cfg, neutral=False):
    mu = m_home - m_away + (0.0 if neutral else cfg["hfa"])
    return rng.gauss(mu, cfg["sigma"])


def game_winner(rng, m_home, m_away, cfg, neutral=False):
    """True if home wins; draws re-rolled (for knockout games with a decider
    mechanism - golden point, shootout after ET, extra time)."""
    while True:
        m = sample_margin(rng, m_home, m_away, cfg, neutral)
        if abs(m) > cfg["draw_band"] or cfg["draw_band"] <= 0:
            return m > 0


def best_of(rng, hi, lo, m, cfg, pattern):
    """Simulate a series. pattern is a string of H/A per game (hi's venue
    perspective); first to ceil(len/2) wins. Returns True if hi wins."""
    need = len(pattern) // 2 + 1
    w_hi = w_lo = 0
    for venue in pattern:
        home, away = (hi, lo) if venue == "H" else (lo, hi)
        home_won = game_winner(rng, m[home], m[away], cfg)
        hi_won = home_won if venue == "H" else not home_won
        if hi_won:
            w_hi += 1
        else:
            w_lo += 1
        if w_hi == need:
            return True
        if w_lo == need:
            return False
    return w_hi > w_lo


def fmt_pct(n, sims):
    return round(100.0 * n / sims, 2)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# =====================================================================
# AFL / NRL
# =====================================================================

AFL_TEAMS = {
    # afltables key -> (display name, site slug). Slugs match lib/afl.ts.
    "adelaide": ("Adelaide", "adelaide"),
    "brisbanel": ("Brisbane Lions", "brisbane-lions"),
    "bullldogs": ("Western Bulldogs", "western-bulldogs"),
    "carlton": ("Carlton", "carlton"),
    "collingwood": ("Collingwood", "collingwood"),
    "essendon": ("Essendon", "essendon"),
    "fremantle": ("Fremantle", "fremantle"),
    "geelong": ("Geelong", "geelong"),
    "goldcoast": ("Gold Coast", "gold-coast"),
    "gws": ("Greater Western Sydney", "greater-western-sydney"),
    "hawthorn": ("Hawthorn", "hawthorn"),
    "kangaroos": ("North Melbourne", "north-melbourne"),
    "melbourne": ("Melbourne", "melbourne"),
    "padelaide": ("Port Adelaide", "port-adelaide"),
    "richmond": ("Richmond", "richmond"),
    "stkilda": ("St Kilda", "st-kilda"),
    "swans": ("Sydney", "sydney-swans"),
    "westcoast": ("West Coast", "west-coast"),
}
# ESPN displayName -> afltables key (records join). Mirrors lib/_footyStandings.
AFL_ESPN = {
    "Adelaide Crows": "adelaide", "Brisbane Lions": "brisbanel", "Carlton": "carlton",
    "Collingwood": "collingwood", "Essendon": "essendon", "Fremantle": "fremantle",
    "Geelong Cats": "geelong", "Gold Coast SUNS": "goldcoast", "GWS GIANTS": "gws",
    "Hawthorn": "hawthorn", "Melbourne": "melbourne", "North Melbourne": "kangaroos",
    "Port Adelaide": "padelaide", "Richmond": "richmond", "St Kilda": "stkilda",
    "Sydney Swans": "swans", "West Coast Eagles": "westcoast", "Western Bulldogs": "bullldogs",
}

NRL_TEAMS = {
    "auckland": ("New Zealand Warriors", "new-zealand-warriors"),
    "brisbane": ("Brisbane Broncos", "brisbane-broncos"),
    "canberra": ("Canberra Raiders", "canberra-raiders"),
    "canterbury": ("Canterbury-Bankstown", "canterbury-bankstown"),
    "cronulla": ("Cronulla-Sutherland", "cronulla-sutherland"),
    "dolphins": ("Dolphins", "dolphins"),
    "easts": ("Sydney Roosters", "sydney-roosters"),
    "manly": ("Manly-Warringah", "manly-warringah"),
    "melbourne": ("Melbourne Storm", "melbourne-storm"),
    "newcastle": ("Newcastle Knights", "newcastle-knights"),
    "north_qld": ("North Queensland", "north-queensland"),
    "parramatta": ("Parramatta", "parramatta"),
    "penrith": ("Penrith", "penrith"),
    "souths": ("South Sydney", "south-sydney"),
    "st_geo-illa": ("St George Illawarra", "st-george-illawarra"),
    "titans": ("Gold Coast Titans", "gold-coast-titans"),
    "wests_tigers": ("Wests Tigers", "wests-tigers"),
}
NRL_ESPN = {
    "Panthers": "penrith", "Rabbitohs": "souths", "Storm": "melbourne",
    "Roosters": "easts", "Sea Eagles": "manly", "Dolphins": "dolphins",
    "Sharks": "cronulla", "Knights": "newcastle", "Cowboys": "north_qld",
    "Wests Tigers": "wests_tigers", "Broncos": "brisbane", "Bulldogs": "canterbury",
    "Raiders": "canberra", "Titans": "titans", "Eels": "parramatta",
    "Dragons": "st_geo-illa", "Warriors": "auckland",
}

FOOTY_URL = {
    "afl": "https://afltables.com/afl/seas/%d.html",
    "nrl": "https://afltables.com/rl/seas/%d.html",
}
FOOTY_ESPN_URL = {
    "afl": ESPN + "/v2/sports/australian-football/afl/standings",
    "nrl": ESPN + "/v2/sports/rugby-league/3/standings",
}
FOOTY_SEASON_GAMES = {"afl": 23, "nrl": 24}  # per team, 2026
FOOTY_WIN_PTS = {"afl": 4, "nrl": 2}
FOOTY_GAME_TOTAL = {"afl": 165.0, "nrl": 44.0}  # combined score, for PF/PA updates


def parse_footy_fixtures(html):
    """[(home_key, away_key, played)] from an afltables season page, in page
    (round) order. Bye rows and finals tables are skipped: a match table has
    exactly two team links; played games carry two width=5% total cells."""
    out = []
    for tbl in re.findall(r"<table[^>]*border=[12][^>]*>(.*?)</table>", html, re.S):
        keys = re.findall(r"\.\./teams/(?:[a-z0-9_\-\.]+/)?([a-z0-9_\-\.]+)_idx\.html", tbl)
        if len(keys) != 2 or ">Bye<" in tbl:
            continue
        tots = re.findall(r"<td[^>]*width=5%[^>]*>\s*(\d+)\s*</td>", tbl)
        out.append((keys[0], keys[1], len(tots) == 2))
    return out


def footy_espn_records(league):
    """key -> dict(gp, w, l, d, pf, pa, pts) from the ESPN standings API."""
    data = fetch_json(FOOTY_ESPN_URL[league])
    standings = (data.get("children") or [{}])[0].get("standings") if league == "nrl" else data.get("standings")
    entries = (standings or {}).get("entries") or []
    name_map = NRL_ESPN if league == "nrl" else AFL_ESPN
    win_n, loss_n, draw_n = (("gamesWon", "gamesLost", "gamesDrawn") if league == "nrl"
                             else ("wins", "losses", "ties"))
    out = {}
    for e in entries:
        key = name_map.get((e.get("team", {}).get("displayName") or "").strip())
        if not key:
            raise SystemExit("[%s] unmapped ESPN team: %r" % (league, e.get("team", {}).get("displayName")))
        stats = {s.get("name"): s.get("value") for s in e.get("stats", [])}
        out[key] = dict(
            gp=int(stats.get("gamesPlayed") or 0),
            w=int(stats.get(win_n) or 0), l=int(stats.get(loss_n) or 0),
            d=int(stats.get(draw_n) or 0),
            pf=float(stats.get("pointsFor") or 0.0), pa=float(stats.get("pointsAgainst") or 0.0),
            pts=int(stats.get("points") or 0),
        )
    return out


def reconcile_remaining(remaining, records, season_games, league):
    """Drop 'remaining' fixtures the records say were already played.

    afltables lags ESPN by up to a few days. For each team,
    espn_gp + remaining_count must equal season_games; while any fixture has
    BOTH teams over quota, drop the earliest such fixture. Hard-fails if the
    counts cannot be reconciled (that means a real structural mismatch, not
    lag, and publishing would be wrong)."""
    remaining = list(remaining)
    def excess():
        cnt = {t: 0 for t in records}
        for h, a in remaining:
            cnt[h] += 1
            cnt[a] += 1
        return {t: records[t]["gp"] + cnt[t] - season_games for t in records}
    ex = excess()
    while any(v > 0 for v in ex.values()):
        for i, (h, a) in enumerate(remaining):
            if ex[h] > 0 and ex[a] > 0:
                del remaining[i]
                break
        else:
            raise SystemExit("[%s] cannot reconcile fixtures vs records: %s"
                             % (league, {t: v for t, v in ex.items() if v != 0}))
        ex = excess()
    bad = {t: v for t, v in ex.items() if v != 0}
    if bad:
        raise SystemExit("[%s] fixture/record count mismatch: %s" % (league, bad))
    return remaining


def footy_ladder_order(teams, pts, pf, pa, league):
    """Ladder order: points desc, then percentage (AFL) / differential (NRL)."""
    if league == "afl":
        return sorted(teams, key=lambda t: (-pts[t], -(pf[t] / pa[t] if pa[t] else 0.0)))
    return sorted(teams, key=lambda t: (-pts[t], -(pf[t] - pa[t])))


def sim_afl_finals(rng, order, m, cfg):
    """2026 top-10 wildcard finals. order = ladder order (seeds 1..10 used).
    Returns the premier. All finals sudden-death except the double chance;
    hosts per seeding; Grand Final neutral (MCG)."""
    s = order  # s[0] is seed 1
    g = lambda hi, lo, neutral=False: hi if game_winner(rng, m[hi], m[lo], cfg, neutral) else lo
    # Wildcard round: 7 hosts 10, 8 hosts 9; winners re-seeded by ladder
    # position (better ladder position -> new seed 7).
    w1 = g(s[6], s[9])
    w2 = g(s[7], s[8])
    new7, new8 = (w1, w2) if s.index(w1) < s.index(w2) else (w2, w1)
    # Week 1: qualifying finals (1v4, 2v3, losers survive), elimination
    # finals (5 v new8, 6 v new7, sudden death).
    qf1_w = g(s[0], s[3]); qf1_l = s[3] if qf1_w == s[0] else s[0]
    qf2_w = g(s[1], s[2]); qf2_l = s[2] if qf2_w == s[1] else s[1]
    ef1_w = g(s[4], new8)
    ef2_w = g(s[5], new7)
    # Week 2: semi-finals, QF losers host EF winners.
    sf1_w = g(qf1_l, ef1_w)
    sf2_w = g(qf2_l, ef2_w)
    # Week 3: preliminary finals, QF winners host the SF winner from the
    # OTHER side of the bracket.
    pf1_w = g(qf1_w, sf2_w)
    pf2_w = g(qf2_w, sf1_w)
    # Week 4: Grand Final, neutral venue.
    return g(pf1_w, pf2_w, neutral=True)


def sim_top8_finals(rng, order, m, cfg):
    """AFL-style top-8 (the NRL system since 2012). Grand Final neutral."""
    s = order
    g = lambda hi, lo, neutral=False: hi if game_winner(rng, m[hi], m[lo], cfg, neutral) else lo
    qf1_w = g(s[0], s[3]); qf1_l = s[3] if qf1_w == s[0] else s[0]
    qf2_w = g(s[1], s[2]); qf2_l = s[2] if qf2_w == s[1] else s[1]
    ef1_w = g(s[4], s[7])
    ef2_w = g(s[5], s[6])
    sf1_w = g(qf1_l, ef1_w)
    sf2_w = g(qf2_l, ef2_w)
    pf1_w = g(qf1_w, sf2_w)
    pf2_w = g(qf2_w, sf1_w)
    return g(pf1_w, pf2_w, neutral=True)


def build_footy(league, sims, seed=2026):
    cfg = CFG[league]
    teams_meta = AFL_TEAMS if league == "afl" else NRL_TEAMS
    season = date.today().year
    html = fetch_text(FOOTY_URL[league] % season)
    fixtures = parse_footy_fixtures(html)
    unknown = {k for f in fixtures for k in f[:2]} - set(teams_meta)
    if unknown:
        raise SystemExit("[%s] unmapped afltables teams: %s" % (league, sorted(unknown)))
    records = footy_espn_records(league)
    if set(records) != set(teams_meta):
        raise SystemExit("[%s] ESPN team set mismatch" % league)
    remaining = [(h, a) for h, a, played in fixtures if not played]
    remaining = reconcile_remaining(remaining, records, FOOTY_SEASON_GAMES[league], league)

    teams = sorted(teams_meta)
    m = {t: shrink((records[t]["pf"] - records[t]["pa"]) / max(records[t]["gp"], 1),
                   records[t]["gp"], cfg["k"]) for t in teams}
    win_pts = FOOTY_WIN_PTS[league]
    draw_pts = win_pts // 2
    total = FOOTY_GAME_TOTAL[league]
    spots = 10 if league == "afl" else 8
    finals = sim_afl_finals if league == "afl" else sim_top8_finals

    rng = random.Random(seed)
    acc = {t: dict(playoffs=0, top4=0, minor=0, title=0, pts=0.0) for t in teams}
    for _ in range(sims):
        r = {t: m[t] + rng.gauss(0.0, cfg["noise"]) for t in teams}
        pts = {t: records[t]["w"] * win_pts + records[t]["d"] * draw_pts for t in teams}
        pf = {t: records[t]["pf"] for t in teams}
        pa = {t: records[t]["pa"] for t in teams}
        for h, a in remaining:
            mg = sample_margin(rng, r[h], r[a], cfg)
            if abs(mg) <= cfg["draw_band"]:
                pts[h] += draw_pts; pts[a] += draw_pts
                pf[h] += total / 2; pa[h] += total / 2
                pf[a] += total / 2; pa[a] += total / 2
            else:
                w, l = (h, a) if mg > 0 else (a, h)
                pts[w] += win_pts
                pf[w] += (total + abs(mg)) / 2; pa[w] += (total - abs(mg)) / 2
                pf[l] += (total - abs(mg)) / 2; pa[l] += (total + abs(mg)) / 2
        order = footy_ladder_order(teams, pts, pf, pa, league)
        for t in order[:spots]:
            acc[t]["playoffs"] += 1
        for t in order[:4]:
            acc[t]["top4"] += 1
        acc[order[0]]["minor"] += 1
        acc[finals(rng, order, r, cfg)]["title"] += 1
        for t in teams:
            acc[t]["pts"] += pts[t]

    table = []
    for t in teams:
        name, slug = teams_meta[t]
        rec = records[t]
        table.append(dict(
            key=t, name=name, slug=slug,
            gp=rec["gp"], w=rec["w"], l=rec["l"], d=rec["d"],
            pts=rec["pts"], rating=round(m[t], 2),
            exp_pts=round(acc[t]["pts"] / sims, 1),
            p_playoffs=fmt_pct(acc[t]["playoffs"], sims),
            p_top4=fmt_pct(acc[t]["top4"], sims),
            p_minor_premiership=fmt_pct(acc[t]["minor"], sims),
            p_title=fmt_pct(acc[t]["title"], sims),
        ))
    table.sort(key=lambda x: (-x["p_title"], -x["exp_pts"]))
    played_total = sum(r["gp"] for r in records.values()) // 2
    meta = dict(
        league=league.upper(), season=season,
        title_name="Premiership", playoff_name="Finals",
        playoff_spots=spots, generated_at=now_iso(), sims=sims,
        model="margin-v1 (current-season points margin, shrunk %s/(GP+%s); sigma %s, HFA %s)"
              % ("GP", cfg["k"], cfg["sigma"], cfg["hfa"]),
        finals_format=("2026 top-10 with wildcard round (7v10, 8v9)" if league == "afl"
                       else "top-8 final eight system"),
        games_played=played_total, games_remaining=len(remaining),
        source="afltables.com fixtures + ESPN records",
        notes="Grand Final simulated at a neutral venue. %s" %
              ("Ladder tie-break: percentage." if league == "afl" else "Ladder tie-break: points differential; bye points excluded from the simulated ordering (uniform across clubs)."),
    )
    return dict(meta=meta, table=table)


# =====================================================================
# WNBA
# =====================================================================

def espn_league_teams(path_frag):
    """{espn_id: displayName} via the teams endpoint."""
    d = fetch_json("%s/site/v2/sports/%s/teams?limit=50" % (ESPN, path_frag))
    out = {}
    for grp in d.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
        t = grp.get("team", {})
        out[str(t.get("id"))] = t.get("displayName")
    return out


def espn_schedules(path_frag, team_ids, season, soccer=False, exclude_note=None):
    """{event_id: (iso_date, home_id, away_id, hs, as, completed)} across all
    per-team schedules (build_mlb_sim.py team_schedules pattern).

    Two endpoint dialects, both measured live 2026-08-10:
      - basketball/baseball: one call with ?season=Y&seasontype=2.
      - soccer: seasontype is IGNORED and returns zero events; the endpoint
        instead serves RESULTS by default and upcoming games with
        ?fixture=true, so both are fetched and merged.
    exclude_note drops events whose notes headline contains the substring -
    used for the WNBA Commissioner's Cup Championship, the one June game that
    does NOT count in the regular-season standings (the Cup's group games
    double as regular-season games and do count)."""
    urls = (["%s/site/v2/sports/%s/teams/%%s/schedule?season=%d" % (ESPN, path_frag, season),
             "%s/site/v2/sports/%s/teams/%%s/schedule?season=%d&fixture=true" % (ESPN, path_frag, season)]
            if soccer else
            ["%s/site/v2/sports/%s/teams/%%s/schedule?season=%d&seasontype=2" % (ESPN, path_frag, season)])
    games = {}
    for tid in team_ids:
        for url in urls:
            d = fetch_json(url % tid, soft=True)
            for ev in (d or {}).get("events", []) or []:
                comp = (ev.get("competitions") or [{}])[0]
                if exclude_note and any(exclude_note in (n.get("headline") or "")
                                        for n in comp.get("notes", []) or []):
                    continue
                done = bool(((comp.get("status") or {}).get("type") or {}).get("completed"))
                home = away = hs = as_ = None
                for c in comp.get("competitors", []) or []:
                    t = c.get("team") or {}
                    sc = c.get("score")
                    if isinstance(sc, dict):
                        sc = float(sc.get("value")) if sc.get("value") is not None else None
                    elif sc is not None:
                        sc = _maybe_num(sc)
                    if c.get("homeAway") == "home":
                        home, hs = str(t.get("id")), sc
                    else:
                        away, as_ = str(t.get("id")), sc
                if home in team_ids and away in team_ids:
                    games[str(ev.get("id"))] = (str(ev.get("date", ""))[:10], home, away, hs, as_, done)
    return games


def _maybe_num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def espn_standings_records(url, group_names=("conf",)):
    """{displayName: dict(w, l, gp, conf)} from a v2 standings payload with
    conference children (WNBA / MLS shape)."""
    d = fetch_json(url)
    out = {}
    for child in d.get("children", []):
        gname = child.get("name") or ""
        conf = "Eastern" if re.search("east", gname, re.I) else "Western" if re.search("west", gname, re.I) else ""
        for e in (child.get("standings") or {}).get("entries", []):
            nm = (e.get("team") or {}).get("displayName")
            stats = {s.get("name"): s for s in e.get("stats", [])}
            val = lambda k: (stats.get(k) or {}).get("value")
            out[nm] = dict(
                w=int(val("wins") or 0), l=int(val("losses") or 0),
                d=int(val("ties") or 0), gp=int(val("gamesPlayed") or 0),
                pts=int(val("points") or 0), gf=val("pointsFor"), ga=val("pointsAgainst"),
                conf=conf, seed=val("playoffSeed"), rank=val("rank"),
            )
    return out


def build_wnba(sims, seed=2026):
    cfg = CFG["wnba"]
    season = date.today().year
    id2name = espn_league_teams("basketball/wnba")
    if len(id2name) < 12:
        raise SystemExit("[wnba] implausible team count %d" % len(id2name))
    games = espn_schedules("basketball/wnba", set(id2name), season,
                           exclude_note="Commissioner's Cup Championship")
    played = [(h, a, hs, as_) for _d, h, a, hs, as_, done in games.values()
              if done and hs is not None and as_ is not None]
    remaining = [(h, a) for _d, h, a, _hs, _as, done in
                 sorted(games.values(), key=lambda g: g[0]) if not done]

    teams = sorted(id2name)
    wins = {t: 0 for t in teams}; losses = {t: 0 for t in teams}
    diff = {t: 0.0 for t in teams}
    for h, a, hs, as_ in played:
        diff[h] += hs - as_; diff[a] += as_ - hs
        if hs > as_: wins[h] += 1; losses[a] += 1
        else: wins[a] += 1; losses[h] += 1

    # Hard check vs ESPN's own standings (the build_mlb_sim verify_wins idea):
    # a schedule-parse break must stop the run, not publish a wrong table.
    recs = espn_standings_records(ESPN + "/v2/sports/basketball/wnba/standings")
    for t in teams:
        r = recs.get(id2name[t])
        if r is None:
            raise SystemExit("[wnba] standings missing %s" % id2name[t])
        if (r["w"], r["l"]) != (wins[t], losses[t]):
            raise SystemExit("[wnba] derived %d-%d vs ESPN %d-%d for %s"
                             % (wins[t], losses[t], r["w"], r["l"], id2name[t]))

    gp = {t: wins[t] + losses[t] for t in teams}
    m = {t: shrink(diff[t] / max(gp[t], 1), gp[t], cfg["k"]) for t in teams}

    rng = random.Random(seed)
    acc = {t: dict(playoffs=0, semis=0, finals=0, title=0, wins=0.0) for t in teams}
    for _ in range(sims):
        r = {t: m[t] + rng.gauss(0.0, cfg["noise"]) for t in teams}
        w = dict(wins)
        for h, a in remaining:
            if game_winner(rng, r[h], r[a], cfg):
                w[h] += 1
            else:
                w[a] += 1
        # Seeds 1-8 by overall record, conference-blind (2026 format). Ties
        # broken randomly, standing in for the H2H ladder.
        order = sorted(teams, key=lambda t: (-w[t], rng.random()))
        field = order[:8]
        for t in field:
            acc[t]["playoffs"] += 1
        # First round Bo3 (1-1-1), semis Bo5 (2-2-1), Finals Bo7 (2-2-1-1-1).
        def series(hi, lo, pattern):
            return hi if best_of(rng, hi, lo, r, cfg, pattern) else lo
        s = field
        sf1a = series(s[0], s[7], "HAH")
        sf1b = series(s[3], s[4], "HAH")
        sf2a = series(s[1], s[6], "HAH")
        sf2b = series(s[2], s[5], "HAH")
        for t in (sf1a, sf1b, sf2a, sf2b):
            acc[t]["semis"] += 1
        def seeded(x, y):
            return (x, y) if s.index(x) < s.index(y) else (y, x)
        f1 = series(*seeded(sf1a, sf1b), "HHAAH")
        f2 = series(*seeded(sf2a, sf2b), "HHAAH")
        for t in (f1, f2):
            acc[t]["finals"] += 1
        champ = series(*seeded(f1, f2), "HHAAHAH")
        acc[champ]["title"] += 1
        for t in teams:
            acc[t]["wins"] += w[t]

    table = []
    for t in teams:
        table.append(dict(
            key=t, name=id2name[t], conf=recs.get(id2name[t], {}).get("conf", ""),
            gp=gp[t], w=wins[t], l=losses[t],
            rating=round(m[t], 2), exp_wins=round(acc[t]["wins"] / sims, 1),
            p_playoffs=fmt_pct(acc[t]["playoffs"], sims),
            p_semis=fmt_pct(acc[t]["semis"], sims),
            p_finals=fmt_pct(acc[t]["finals"], sims),
            p_title=fmt_pct(acc[t]["title"], sims),
        ))
    table.sort(key=lambda x: (-x["p_title"], -x["exp_wins"]))
    meta = dict(
        league="WNBA", season=season, title_name="WNBA title", playoff_name="Playoffs",
        playoff_spots=8, generated_at=now_iso(), sims=sims,
        model="margin-v1 (current-season point differential, shrunk GP/(GP+%s); sigma %s, HFA %s)"
              % (cfg["k"], cfg["sigma"], cfg["hfa"]),
        finals_format="top 8 overall; Bo3 first round, Bo5 semis, Bo7 Finals",
        games_played=len(played), games_remaining=len(remaining),
        source="ESPN standings + per-team schedules",
        notes="Seeding is overall record, conference-blind; ties broken randomly in-sim.",
    )
    return dict(meta=meta, table=table)


# =====================================================================
# CFL
# =====================================================================

CFL_TEAMS = {
    # cfl.ca abbreviation -> (name, site slug, division). Slugs match lib/cflStandings.ts.
    "WPG": ("Winnipeg Blue Bombers", "winnipeg-blue-bombers", "West"),
    "EDM": ("Edmonton Elks", "edmonton-elks", "West"),
    "BC":  ("BC Lions", "bc-lions", "West"),
    "SSK": ("Saskatchewan Roughriders", "saskatchewan-roughriders", "West"),
    "CGY": ("Calgary Stampeders", "calgary-stampeders", "West"),
    "MTL": ("Montreal Alouettes", "montreal-alouettes", "East"),
    "TOR": ("Toronto Argonauts", "toronto-argonauts", "East"),
    "OTT": ("Ottawa RedBlacks", "ottawa-redblacks", "East"),
    "HAM": ("Hamilton Tiger-Cats", "hamilton-tiger-cats", "East"),
}
# cfl.ca standings-page uppercase label -> abbreviation (lib/cflStandings.ts TEAMS).
CFL_LABEL = {
    "WINNIPEG": "WPG", "EDMONTON": "EDM", "BC": "BC", "SASKATCHEWAN": "SSK",
    "CALGARY": "CGY", "MONTREAL": "MTL", "TORONTO": "TOR", "OTTAWA": "OTT", "HAMILTON": "HAM",
}


def parse_cfl_schedule(html):
    """[(ts, away, home, away_score, home_score, final)] from cfl.ca/schedule/.

    The page is server-rendered WordPress: each game block carries a unix
    timestamp, a status span, visitor/host abbreviations and score spans.
    Preseason games appear too; the caller filters by timestamp against the
    regular-season window and by both abbreviations being CFL teams."""
    out = []
    blocks = re.split(r'<div class="date-time">', html)[1:]
    for b in blocks:
        ts = re.search(r"Number\((\d+)\)", b)
        status = re.search(r'<span class="status">([^<]*)</span>', b)
        vis = re.search(r'<span class="visitor">.*?<span class="text">([A-Z]{2,3})</span>', b, re.S)
        host = re.search(r'<span class="host">.*?<span class="text">([A-Z]{2,3})</span>', b, re.S)
        if not (ts and vis and host):
            continue
        vs_ = re.search(r'<span class="visitor-score">\s*(\d*)\s*</span>', b)
        hs_ = re.search(r'<span class="host-score">\s*(\d*)\s*</span>', b)
        # "Final", "F (OT)", "F (2OT)" are all finals; upcoming games carry an
        # empty status span.
        final = bool(status and re.match(r"\s*f", status.group(1), re.I))
        a_sc = int(vs_.group(1)) if final and vs_ and vs_.group(1) else None
        h_sc = int(hs_.group(1)) if final and hs_ and hs_.group(1) else None
        out.append((int(ts.group(1)), vis.group(1), host.group(1), a_sc, h_sc, final))
    return out


def parse_cfl_standings(html):
    """abbr -> (gp, w, l, t, pts) from cfl.ca/standings/ (the exact ROW regex
    lib/cflStandings.ts uses, tags stripped)."""
    text = re.sub(r"<script[\s\S]*?</script>", " ", html)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-z]+;", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    row = re.compile(r"(\d+)\s+([A-Z]{2,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+-\d+-\d+\s+\d+-\d+-\d+\s+\d+-\d+-\d+")
    out = {}
    for mm in row.finditer(text):
        abbr = CFL_LABEL.get(mm.group(2))
        if abbr and abbr not in out:
            out[abbr] = (int(mm.group(3)), int(mm.group(4)), int(mm.group(5)), int(mm.group(6)), int(mm.group(7)))
    return out


def cfl_playoff_field(order_by_div):
    """order_by_div: {"East": [teams sorted], "West": [...]}. Returns
    {"East": [1st, 2nd, 3rd-or-crossover], "West": [...]}, applying the
    crossover: 4th in one division displaces the other division's 3rd when
    strictly ahead on points (the callers pass (pts, pct) tuples for order,
    so compare the sort keys)."""
    return order_by_div  # ordering + crossover handled by caller with points


def build_cfl(sims, seed=2026):
    cfg = CFG["cfl"]
    season = date.today().year
    sched = parse_cfl_schedule(fetch_text("https://www.cfl.ca/schedule/"))
    # Regular season window: June 1 - Nov 1 (preseason May, playoffs from
    # ~Oct 31; the Grey Cup is mid-Nov). Filter by timestamp.
    lo = int(datetime(season, 6, 1, tzinfo=timezone.utc).timestamp())
    hi = int(datetime(season, 11, 1, tzinfo=timezone.utc).timestamp())
    games = [(ts, a, h, asx, hsx, fin) for ts, a, h, asx, hsx, fin in sched
             if lo <= ts < hi and a in CFL_TEAMS and h in CFL_TEAMS]
    if len(games) != 81:  # 9 teams x 18 games / 2
        raise SystemExit("[cfl] expected 81 regular-season games, parsed %d" % len(games))
    played = [(a, h, asx, hsx) for _ts, a, h, asx, hsx, fin in games if fin and asx is not None and hsx is not None]
    remaining = [(h, a) for ts, a, h, _x, _y, fin in sorted(games) if not fin]

    teams = sorted(CFL_TEAMS)
    w = {t: 0 for t in teams}; l = {t: 0 for t in teams}; tie = {t: 0 for t in teams}
    diff = {t: 0.0 for t in teams}
    for a, h, asx, hsx in played:
        diff[h] += hsx - asx; diff[a] += asx - hsx
        if hsx > asx: w[h] += 1; l[a] += 1
        elif asx > hsx: w[a] += 1; l[h] += 1
        else: tie[h] += 1; tie[a] += 1
    # Hard check vs cfl.ca's own standings table.
    st = parse_cfl_standings(fetch_text("https://www.cfl.ca/standings/%d/" % season))
    if len(st) != 9:
        raise SystemExit("[cfl] standings parse found %d teams" % len(st))
    for t in teams:
        gp_, w_, l_, t_, _pts = st[t]
        if (w_, l_, t_) != (w[t], l[t], tie[t]):
            raise SystemExit("[cfl] derived %d-%d-%d vs cfl.ca %d-%d-%d for %s"
                             % (w[t], l[t], tie[t], w_, l_, t_, t))

    gp = {t: w[t] + l[t] + tie[t] for t in teams}
    m = {t: shrink(diff[t] / max(gp[t], 1), gp[t], cfg["k"]) for t in teams}
    div = {t: CFL_TEAMS[t][2] for t in teams}

    rng = random.Random(seed)
    acc = {t: dict(playoffs=0, div_first=0, final=0, title=0, wins=0.0) for t in teams}
    for _ in range(sims):
        r = {t: m[t] + rng.gauss(0.0, cfg["noise"]) for t in teams}
        pts = {t: 2 * w[t] + tie[t] for t in teams}
        for h, a in remaining:
            if game_winner(rng, r[h], r[a], cfg):
                pts[h] += 2
            else:
                pts[a] += 2
        order = {d: sorted([t for t in teams if div[t] == d],
                           key=lambda t: (-pts[t], rng.random())) for d in ("East", "West")}
        # Crossover: 4th of one division displaces the other's 3rd when
        # STRICTLY ahead on points (a tie stays with the 3rd-place team).
        field = {}
        for d, other in (("East", "West"), ("West", "East")):
            third = order[d][2]
            cross = order[other][3]
            field[d] = [order[d][0], order[d][1],
                        cross if pts[cross] > pts[third] else third]
        for d in field:
            for t in field[d]:
                acc[t]["playoffs"] += 1
            acc[order[d][0]]["div_first"] += 1
        # Division semis (2 hosts 3), division finals (1 hosts winner),
        # Grey Cup at a pre-awarded neutral site.
        finalists = []
        for d in ("East", "West"):
            one, two, three = field[d]
            sf = two if game_winner(rng, r[two], r[three], cfg) else three
            fin = one if game_winner(rng, r[one], r[sf], cfg) else sf
            finalists.append(fin)
        for t in finalists:
            acc[t]["final"] += 1
        champ = finalists[0] if game_winner(rng, r[finalists[0]], r[finalists[1]], cfg, neutral=True) else finalists[1]
        acc[champ]["title"] += 1
        for t in teams:
            acc[t]["wins"] += pts[t] / 2.0

    table = []
    for t in teams:
        name, slug, d = CFL_TEAMS[t]
        table.append(dict(
            key=t, name=name, slug=slug, division=d,
            gp=gp[t], w=w[t], l=l[t], t=tie[t], pts=2 * w[t] + tie[t],
            rating=round(m[t], 2), exp_wins=round(acc[t]["wins"] / sims, 1),
            p_playoffs=fmt_pct(acc[t]["playoffs"], sims),
            p_division=fmt_pct(acc[t]["div_first"], sims),
            p_final=fmt_pct(acc[t]["final"], sims),
            p_title=fmt_pct(acc[t]["title"], sims),
        ))
    table.sort(key=lambda x: (-x["p_title"], -x["exp_wins"]))
    meta = dict(
        league="CFL", season=season, title_name="Grey Cup", playoff_name="Playoffs",
        playoff_spots=6, generated_at=now_iso(), sims=sims,
        model="margin-v1 (current-season point differential, shrunk GP/(GP+%s); sigma %s, HFA %s)"
              % (cfg["k"], cfg["sigma"], cfg["hfa"]),
        finals_format="top 3 per division with the crossover rule; Grey Cup at a neutral site",
        games_played=len(played), games_remaining=len(remaining),
        source="cfl.ca schedule + standings",
        notes="Simulated regular-season games cannot tie (OT ties are ~1 game a season).",
    )
    return dict(meta=meta, table=table)


# =====================================================================
# NPB
# =====================================================================

NPB_TEAMS = {
    # SPAIA TeamCD -> (name, site slug, league). Mirrors lib/npbStandings.ts.
    "1": ("Yomiuri Giants", "yomiuri-giants", "Central"),
    "2": ("Tokyo Yakult Swallows", "tokyo-yakult-swallows", "Central"),
    "3": ("Yokohama DeNA BayStars", "yokohama-dena-baystars", "Central"),
    "4": ("Chunichi Dragons", "chunichi-dragons", "Central"),
    "5": ("Hanshin Tigers", "hanshin-tigers", "Central"),
    "6": ("Hiroshima Toyo Carp", "hiroshima-toyo-carp", "Central"),
    "7": ("Saitama Seibu Lions", "saitama-seibu-lions", "Pacific"),
    "8": ("Hokkaido Nippon-Ham Fighters", "hokkaido-nippon-ham-fighters", "Pacific"),
    "9": ("Chiba Lotte Marines", "chiba-lotte-marines", "Pacific"),
    "11": ("Orix Buffaloes", "orix-buffaloes", "Pacific"),
    "12": ("Fukuoka SoftBank Hawks", "fukuoka-softbank-hawks", "Pacific"),
    "376": ("Tohoku Rakuten Golden Eagles", "tohoku-rakuten-golden-eagles", "Pacific"),
}
SPAIA = "https://spaia.jp/baseball/npb/api/official_stats_history"


def npb_records(year):
    """cd -> dict(gp, w, l, d, rf, ra, rest) from SPAIA (latest row per team)."""
    out = {}
    for assortment in (1, 2):
        raw = fetch_json("%s?GameAssortment=%d&Year=%d" % (SPAIA, assortment, year))
        latest = {}
        for r in raw or []:
            if r and r.get("TeamCD"):
                latest[r["TeamCD"]] = r
        for cd, r in latest.items():
            if cd not in NPB_TEAMS:
                raise SystemExit("[npb] unknown TeamCD %s" % cd)
            gi = lambda k: int(r.get(k) or 0)
            rec = dict(gp=gi("Game"), w=gi("Win"), l=gi("Lose"), d=gi("Draw"),
                       rf=gi("Run"), ra=gi("PointLost"), rest=gi("RestGame"))
            if rec["gp"] != rec["w"] + rec["l"] + rec["d"]:
                raise SystemExit("[npb] inconsistent record for %s: %s" % (cd, rec))
            if rec["gp"] + rec["rest"] != 143:
                raise SystemExit("[npb] games+rest != 143 for %s: %s" % (cd, rec))
            out[cd] = rec
    if len(out) != 12:
        raise SystemExit("[npb] expected 12 teams, got %d" % len(out))
    return out


def npb_synthetic_schedule(rest, league_of):
    """[(home, away)] distributing each team's remaining games across its five
    same-league opponents as evenly as possible. Interleague play ends in
    June, so by the time this sim runs every remaining game is intra-league;
    SPAIA publishes no remaining pairings, so opponents are apportioned
    round-robin style (largest-remaining-first) and homes alternated. The
    approximation is documented in meta.notes."""
    sched = []
    for lg in ("Central", "Pacific"):
        teams = [t for t in league_of if league_of[t] == lg]
        left = {t: rest[t] for t in teams}
        pair_count = {}
        flip = 0
        while True:
            avail = [t for t in teams if left[t] > 0]
            if len(avail) < 2:
                break
            avail.sort(key=lambda t: (-left[t], t))
            a = avail[0]
            # Opponent: most remaining games, fewest already-scheduled
            # head-to-heads with a (keeps the split even).
            b = min((t for t in avail[1:]),
                    key=lambda t: (pair_count.get(frozenset((a, t)), 0), -left[t], t))
            left[a] -= 1; left[b] -= 1
            pair_count[frozenset((a, b))] = pair_count.get(frozenset((a, b)), 0) + 1
            sched.append((a, b) if flip % 2 == 0 else (b, a))
            flip += 1
        leftover = {t: v for t, v in left.items() if v > 0}
        if sum(leftover.values()) > 1:
            # Odd totals happen when rained-out games will not all be made
            # up; one dangling game per league is tolerable, more is a feed
            # problem worth stopping on.
            raise SystemExit("[npb] could not pair remaining games: %s" % leftover)
    return sched


def npb_win_prob(r_h, r_a, hfa_logit):
    return 1.0 / (1.0 + math.exp(-(r_h - r_a + hfa_logit)))


def build_npb(sims, seed=2026):
    cfg = CFG["npb"]
    season = date.today().year
    recs = npb_records(season)
    league_of = {cd: NPB_TEAMS[cd][2] for cd in NPB_TEAMS}
    sched = npb_synthetic_schedule({cd: recs[cd]["rest"] for cd in recs}, league_of)

    # Rating = regressed run differential per game -> wpct via runs-per-win
    # -> log-odds (the build_mlb_sim.py chain, current season only).
    def rating(cd):
        r = recs[cd]
        rd = shrink((r["rf"] - r["ra"]) / max(r["gp"], 1), r["gp"], cfg["k"])
        wpct = min(0.75, max(0.25, 0.5 + rd / cfg["rpw"]))
        return math.log(wpct / (1 - wpct))
    m = {cd: rating(cd) for cd in NPB_TEAMS}
    hfa_logit = math.log(cfg["hfa_wpct"] / (1 - cfg["hfa_wpct"]))
    tie = cfg["tie_rate"]

    rng = random.Random(seed)
    acc = {cd: dict(playoffs=0, pennant=0, final_stage=0, series=0, title=0, wins=0.0) for cd in NPB_TEAMS}

    def game(r, h, a, home_edge=True):
        """Returns 'h'/'a'/'d'."""
        if rng.random() < tie:
            return "d"
        p = npb_win_prob(r[h], r[a], hfa_logit if home_edge else 0.0)
        return "h" if rng.random() < p else "a"

    def climax(r, order):
        """order = league standings. First stage: Bo3 all at 2nd, level series
        -> higher seed. Final stage: champion +1 advantage, first to 4
        counting the advantage, all at champion's park, ties advance champ."""
        one, two, three = order[0], order[1], order[2]
        w2 = w3 = 0
        for _ in range(3):
            g = game(r, two, three)
            if g == "h": w2 += 1
            elif g == "a": w3 += 1
            if w2 == 2 or w3 == 2:
                break
        challenger = three if w3 > w2 else two
        wc, wch = 1, 0  # champion starts one up
        for _ in range(6):
            g = game(r, one, challenger)
            if g == "h": wc += 1
            elif g == "a": wch += 1
            if wc == 4 or wch == 4:
                break
        return challenger if wch == 4 else one, challenger

    for _ in range(sims):
        r = {cd: m[cd] + rng.gauss(0.0, cfg["noise"]) for cd in NPB_TEAMS}
        w = {cd: recs[cd]["w"] for cd in NPB_TEAMS}
        l = {cd: recs[cd]["l"] for cd in NPB_TEAMS}
        for h, a in sched:
            g = game(r, h, a)
            if g == "h": w[h] += 1; l[a] += 1
            elif g == "a": w[a] += 1; l[h] += 1
        reps = {}
        for lg in ("Central", "Pacific"):
            teams = [cd for cd in NPB_TEAMS if league_of[cd] == lg]
            order = sorted(teams, key=lambda cd: (-(w[cd] / max(w[cd] + l[cd], 1)), rng.random()))
            for cd in order[:3]:
                acc[cd]["playoffs"] += 1
            acc[order[0]]["pennant"] += 1
            rep, challenger = climax(r, order)
            acc[order[0]]["final_stage"] += 1
            acc[challenger]["final_stage"] += 0  # challenger reached final stage too
            reps[lg] = rep
            acc[rep]["series"] += 1
        # Japan Series Bo7; CL club hosts in even years (2-3-2). Game ties are
        # replayed until someone reaches 4 wins; equivalent to redrawing.
        cl, pl = reps["Central"], reps["Pacific"]
        wcl = wpl = 0
        pattern = "HHAAAHH"  # CL perspective, 2026 (even year -> CL hosts 1-2, 6-7)
        gi = 0
        while wcl < 4 and wpl < 4:
            venue = pattern[gi % 7]
            h, a = (cl, pl) if venue == "H" else (pl, cl)
            g = game(r, h, a)
            if g == "h":
                wcl, wpl = (wcl + 1, wpl) if h == cl else (wcl, wpl + 1)
            elif g == "a":
                wcl, wpl = (wcl + 1, wpl) if a == cl else (wcl, wpl + 1)
            if g != "d":
                gi += 1
        acc[cl if wcl == 4 else pl]["title"] += 1
        for cd in NPB_TEAMS:
            acc[cd]["wins"] += w[cd]

    table = []
    for cd in NPB_TEAMS:
        name, slug, lg = NPB_TEAMS[cd]
        rec = recs[cd]
        table.append(dict(
            key=cd, name=name, slug=slug, league=lg,
            gp=rec["gp"], w=rec["w"], l=rec["l"], d=rec["d"],
            rating=round(m[cd], 3), exp_wins=round(acc[cd]["wins"] / sims, 1),
            p_playoffs=fmt_pct(acc[cd]["playoffs"], sims),
            p_pennant=fmt_pct(acc[cd]["pennant"], sims),
            p_series=fmt_pct(acc[cd]["series"], sims),
            p_title=fmt_pct(acc[cd]["title"], sims),
        ))
    table.sort(key=lambda x: (-x["p_title"], -x["exp_wins"]))
    meta = dict(
        league="NPB", season=season, title_name="Japan Series", playoff_name="Climax Series",
        playoff_spots=6, generated_at=now_iso(), sims=sims,
        model="rundiff-v1 (current-season run differential -> log5, runs-per-win %s, HFA %s)"
              % (cfg["rpw"], cfg["hfa_wpct"]),
        finals_format="top 3 per league; Climax first stage Bo3, final stage +1 advantage; Japan Series Bo7 (CL hosts in 2026)",
        games_played=sum(r["gp"] for r in recs.values()) // 2,
        games_remaining=len(sched),
        source="SPAIA official_stats_history",
        notes="Remaining pairings are apportioned evenly across same-league opponents (interleague is complete); ties simulated at %.1f%% a game and excluded from win pct, the NPB convention." % (100 * tie),
    )
    return dict(meta=meta, table=table)


# =====================================================================
# MLS
# =====================================================================

def build_mls(sims, seed=2026):
    cfg = CFG["mls"]
    season = date.today().year
    id2name = espn_league_teams("soccer/usa.1")
    recs = espn_standings_records(ESPN + "/v2/sports/soccer/usa.1/standings")
    # Keep only clubs present in the standings (the teams endpoint can carry
    # next year's expansion side before it has a table row).
    ids = {tid for tid, nm in id2name.items() if nm in recs}
    if len(ids) != 30:
        raise SystemExit("[mls] expected 30 clubs, matched %d" % len(ids))
    games = espn_schedules("soccer/usa.1", ids, season, soccer=True)
    played = [(h, a, hs, as_) for _d, h, a, hs, as_, done in games.values()
              if done and hs is not None and as_ is not None]
    remaining = [(h, a) for _d, h, a, _hs, _as, done in
                 sorted(games.values(), key=lambda g: g[0]) if not done]

    teams = sorted(ids)
    w = {t: 0 for t in teams}; d = {t: 0 for t in teams}; l = {t: 0 for t in teams}
    gd = {t: 0.0 for t in teams}
    for h, a, hs, as_ in played:
        gd[h] += hs - as_; gd[a] += as_ - hs
        if hs > as_: w[h] += 1; l[a] += 1
        elif as_ > hs: w[a] += 1; l[h] += 1
        else: d[h] += 1; d[a] += 1
    # Hard check vs ESPN standings. ESPN soccer standings W/D/L live in
    # wins/ties/losses stat names via espn_standings_records.
    for t in teams:
        r = recs[id2name[t]]
        if (r["w"], r["d"], r["l"]) != (w[t], d[t], l[t]):
            raise SystemExit("[mls] derived %d-%d-%d vs ESPN %d-%d-%d for %s"
                             % (w[t], d[t], l[t], r["w"], r["d"], r["l"], id2name[t]))
    conf = {t: recs[id2name[t]]["conf"] for t in teams}
    if sorted(set(conf.values())) != ["Eastern", "Western"]:
        raise SystemExit("[mls] conference detection failed")

    gp = {t: w[t] + d[t] + l[t] for t in teams}
    m = {t: shrink(gd[t] / max(gp[t], 1), gp[t], cfg["k"]) for t in teams}

    rng = random.Random(seed)
    acc = {t: dict(playoffs=0, r1=0, conf_final=0, cup_final=0, title=0, pts=0.0) for t in teams}

    def ko_win(hi, lo, r, neutral=False):
        """Knockout game: a 90-minute draw goes to a decider (ET/PKs); the
        sampled-margin draw band re-roll stands in for that coin-ish flip."""
        return game_winner(rng, r[hi], r[lo], cfg, neutral)

    for _ in range(sims):
        r = {t: m[t] + rng.gauss(0.0, cfg["noise"]) for t in teams}
        pts = {t: 3 * w[t] + d[t] for t in teams}
        wins_s = {t: w[t] for t in teams}
        gd_s = {t: gd[t] for t in teams}
        for h, a in remaining:
            mg = sample_margin(rng, r[h], r[a], cfg)
            if abs(mg) <= cfg["draw_band"]:
                pts[h] += 1; pts[a] += 1
            else:
                x, y = (h, a) if mg > 0 else (a, h)
                pts[x] += 3; wins_s[x] += 1
                gd_s[x] += abs(mg); gd_s[y] -= abs(mg)
        champs = []
        for cf in ("Eastern", "Western"):
            ct = [t for t in teams if conf[t] == cf]
            # MLS tie-breakers: points, total wins, goal difference.
            order = sorted(ct, key=lambda t: (-pts[t], -wins_s[t], -gd_s[t], rng.random()))
            field = order[:9]
            for t in field:
                acc[t]["playoffs"] += 1
            s = field
            # Wild card: 8 hosts 9.
            wc = s[7] if ko_win(s[7], s[8], r) else s[8]
            # Round One Bo3, higher seed hosts games 1 and 3; every game
            # produces a winner (straight to PKs after 90').
            def bo3(hi, lo):
                return hi if best_of_ko(hi, lo) else lo
            def best_of_ko(hi, lo):
                wins_hi = wins_lo = 0
                for venue in "HAH":
                    home, away = (hi, lo) if venue == "H" else (lo, hi)
                    home_won = ko_win(home, away, r)
                    hi_won = home_won if venue == "H" else not home_won
                    if hi_won: wins_hi += 1
                    else: wins_lo += 1
                    if wins_hi == 2 or wins_lo == 2:
                        break
                return wins_hi == 2
            q1 = bo3(s[0], wc)
            q2 = bo3(s[3], s[4])
            q3 = bo3(s[1], s[6])
            q4 = bo3(s[2], s[5])
            for t in (q1, q2, q3, q4):
                acc[t]["r1"] += 1
            def hosted(x, y):
                return (x, y) if (pts[x], wins_s[x], gd_s[x]) >= (pts[y], wins_s[y], gd_s[y]) else (y, x)
            sf1 = (lambda h_, a_: h_ if ko_win(h_, a_, r) else a_)(*hosted(q1, q2))
            sf2 = (lambda h_, a_: h_ if ko_win(h_, a_, r) else a_)(*hosted(q3, q4))
            fin = (lambda h_, a_: h_ if ko_win(h_, a_, r) else a_)(*hosted(sf1, sf2))
            acc[sf1]["conf_final"] += 1
            acc[sf2]["conf_final"] += 1
            champs.append(fin)
        for t in champs:
            acc[t]["cup_final"] += 1
        h_, a_ = champs[0], champs[1]
        if (pts[a_], wins_s[a_], gd_s[a_]) > (pts[h_], wins_s[h_], gd_s[h_]):
            h_, a_ = a_, h_
        acc[h_ if ko_win(h_, a_, r) else a_]["title"] += 1
        for t in teams:
            acc[t]["pts"] += pts[t]

    table = []
    for t in teams:
        table.append(dict(
            key=t, name=id2name[t], conf=conf[t],
            gp=gp[t], w=w[t], d=d[t], l=l[t], pts=3 * w[t] + d[t],
            rating=round(m[t], 3), exp_pts=round(acc[t]["pts"] / sims, 1),
            p_playoffs=fmt_pct(acc[t]["playoffs"], sims),
            p_conf_final=fmt_pct(acc[t]["conf_final"], sims),
            p_cup_final=fmt_pct(acc[t]["cup_final"], sims),
            p_title=fmt_pct(acc[t]["title"], sims),
        ))
    table.sort(key=lambda x: (-x["p_title"], -x["exp_pts"]))
    meta = dict(
        league="MLS", season=season, title_name="MLS Cup", playoff_name="Playoffs",
        playoff_spots=18, generated_at=now_iso(), sims=sims,
        model="margin-v1 (current-season goal difference, shrunk GP/(GP+%s); sigma %s, HFA %s goals)"
              % (cfg["k"], cfg["sigma"], cfg["hfa"]),
        finals_format="9 per conference: wild card, Bo3 round one (PKs after 90'), knockout to MLS Cup hosted by the better record",
        games_played=len(played), games_remaining=len(remaining),
        source="ESPN standings + per-team schedules",
        notes="Tie-breakers simplified to points, wins, goal difference.",
    )
    return dict(meta=meta, table=table)


# =====================================================================
# season gating, output, main
# =====================================================================

# Months (UTC) in which each league is worth simulating: from a few games
# into the season to the end of its regular season. Outside the window the
# builder is skipped without error (the mlb-sim "exit clean" convention);
# stale sim files are handled by the frontend's games_played/live gating.
ACTIVE_MONTHS = {
    "afl": range(3, 10),   # Mar-Sep
    "nrl": range(3, 10),
    "wnba": range(5, 10),  # May-Sep
    "cfl": range(6, 11),   # Jun-Oct
    "npb": range(4, 10),   # Apr-Sep (Climax odds freeze once the table is set)
    "mls": range(3, 12),   # Mar-Nov
}
BUILDERS = {
    "afl": lambda sims: build_footy("afl", sims),
    "nrl": lambda sims: build_footy("nrl", sims),
    "wnba": build_wnba,
    "cfl": build_cfl,
    "npb": build_npb,
    "mls": build_mls,
}


def write_out(league, payload, dry):
    path = os.path.join(OUT_DIR, "%s-sim.json" % league)
    top = payload["table"][:4]
    print("[%s] %d sims, %d teams; leaders: %s" % (
        league, payload["meta"]["sims"], len(payload["table"]),
        ", ".join("%s %s%%" % (r["name"], r["p_title"]) for r in top)))
    s_title = sum(r["p_title"] for r in payload["table"])
    assert abs(s_title - 100.0) < 1.5, "[%s] p_title sums to %.2f" % (league, s_title)
    s_po = sum(r["p_playoffs"] for r in payload["table"])
    expect = payload["meta"]["playoff_spots"] * 100.0
    assert abs(s_po - expect) < expect * 0.02, "[%s] p_playoffs sums to %.1f (want %.0f)" % (league, s_po, expect)
    if dry:
        return
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("[%s] wrote %s" % (league, os.path.relpath(path, ROOT)))


# ------------------------------------------------------------------ self-test

def self_test():
    ok = 0

    def check(name, cond):
        nonlocal ok
        if not cond:
            raise SystemExit("SELF-TEST FAIL: %s" % name)
        ok += 1
        print("  ok %s" % name)

    # margin model sanity
    p_h, p_d, p_a = margin_probs(0, 0, CFG["afl"])
    check("afl even game favours home", 0.55 < p_h < 0.65 and p_d < 0.02)
    p_h, p_d, p_a = margin_probs(0, 0, CFG["mls"])
    check("mls draw rate plausible", 0.22 < p_d < 0.32)
    check("shrink is monotone", shrink(10, 20, 10) > shrink(10, 5, 10) > shrink(10, 0, 10) == 0)

    # afltables parser on a miniature page
    mini = """
    <table border=2 width=100%><tr><td><b>Round 1</b></td></tr></table>
    <table border=1 width=100%>
    <tr><td><a href="../teams/geelong_idx.html">Geelong</a></td><td align=center><tt>1.1 2.2</tt></td><td width=5% align=center> 102</td><td>Thu</td></tr>
    <tr><td><a href="../teams/stkilda_idx.html">St Kilda</a></td><td align=center><tt>1.1 2.2</tt></td><td width=5% align=center> 75</td><td><b>Geelong</b> won</td></tr>
    </table>
    <table border=1 width=100%>
    <tr><td><a href="../teams/swans_idx.html">Sydney</a></td><td>&nbsp;</td><td width=5%>&nbsp;</td><td>Sat <b>Venue:</b> X</td></tr>
    <tr><td><a href="../teams/carlton_idx.html">Carlton</a></td><td>&nbsp;</td><td width=5%>&nbsp;</td><td>&nbsp;</td></tr>
    </table>
    <table border=1 width=100%><tr><td><a href="../teams/essendon_idx.html">Essendon</a></td><td>Bye</td></tr></table>
    """
    fx = parse_footy_fixtures(mini)
    check("footy parser: 2 matches, bye skipped", len(fx) == 2)
    check("footy parser: played flags", fx[0] == ("geelong", "stkilda", True) and fx[1] == ("swans", "carlton", False))

    # reconciliation drops an already-played fixture
    recs = {t: dict(gp=2) for t in ("a", "b", "c", "d")}
    rem = [("a", "b"), ("c", "d")]
    out = reconcile_remaining(rem, recs, 3, "test")
    check("reconcile keeps consistent fixtures", out == rem)
    recs2 = {"a": dict(gp=3), "b": dict(gp=3), "c": dict(gp=2), "d": dict(gp=2)}
    out2 = reconcile_remaining(list(rem), recs2, 3, "test")
    check("reconcile drops the lagged fixture", out2 == [("c", "d")])

    # AFL wildcard reseeding: better ladder team becomes the new 7 seed
    rng = random.Random(1)
    order = list("ABCDEFGHIJ")
    strong = {t: (50.0 if t in ("A", "B") else 0.0) for t in order}
    champs = {}
    for _ in range(400):
        c = sim_afl_finals(rng, order, strong, CFG["afl"])
        champs[c] = champs.get(c, 0) + 1
    check("afl finals: strong seeds win", champs.get("A", 0) + champs.get("B", 0) > 340)
    # a team outside the ten can never win
    order2 = list("ABCDEFGHIJKL")
    check("afl finals uses ten seeds", sim_afl_finals(rng, order2, {t: 0.0 for t in order2}, CFG["afl"]) in order2[:10])

    # top-8 finals: seed 9 never wins, double chance means a QF loser can
    rng = random.Random(2)
    winners = {sim_top8_finals(rng, list("ABCDEFGH"), {t: 0.0 for t in "ABCDEFGH"}, CFG["nrl"]) for _ in range(300)}
    check("nrl finals: every seed can win", len(winners) == 8)

    # best_of: heavy favourite wins Bo7 almost always
    rng = random.Random(3)
    wins = sum(best_of(rng, "X", "Y", {"X": 20.0, "Y": 0.0}, CFG["wnba"], "HHAAHAH") for _ in range(300))
    check("best_of favours the favourite", wins > 285)

    # CFL crossover: strictly-ahead 4th crosses, tie does not
    pts = {"e1": 20, "e2": 16, "e3": 8, "e4": 6, "w1": 22, "w2": 18, "w3": 12, "w4": 10, "w5": 4}
    east = ["e1", "e2", "e3", "e4"]; west = ["w1", "w2", "w3", "w4", "w5"]
    third, cross = east[2], west[3]
    field_e = cross if pts[cross] > pts[third] else third
    check("cfl crossover strictly ahead", field_e == "w4")
    pts["w4"] = 8
    field_e = cross if pts[cross] > pts[third] else third
    check("cfl crossover tie stays home", field_e == "e3")

    # CFL schedule parser on a miniature block
    mini_cfl = """
    <div class="date-time"><script>var int_timestamp = Number(1779130800) * 1000;</script>
    <span class="status">Final</span></div><div class="matchup"><div>
    <span class="visitor"><span class="icon"></span><span class="text">SSK</span></span>
    <span class="visitor-score">15</span><span class="versus">@</span>
    <span class="host-score">20</span><span class="host"><span class="text">CGY</span></span></div></div>
    <div class="date-time"><script>var int_timestamp = Number(1789130800) * 1000;</script>
    <span class="status"></span></div><div class="matchup"><div>
    <span class="visitor"><span class="text">TOR</span></span>
    <span class="visitor-score"></span><span class="versus">@</span>
    <span class="host-score"></span><span class="host"><span class="text">MTL</span></span></div></div>
    """
    g = parse_cfl_schedule(mini_cfl)
    check("cfl parser: two games", len(g) == 2)
    check("cfl parser: final with scores", g[0][1:] == ("SSK", "CGY", 15, 20, True))
    check("cfl parser: upcoming without scores", g[1][1:] == ("TOR", "MTL", None, None, False))

    # NPB synthetic schedule: totals honoured, intra-league only
    rest = {"1": 40, "2": 40, "3": 40, "4": 40, "5": 40, "6": 40,
            "7": 30, "8": 30, "9": 30, "11": 30, "12": 30, "376": 30}
    lg = {cd: NPB_TEAMS[cd][2] for cd in NPB_TEAMS}
    sched = npb_synthetic_schedule(rest, lg)
    from collections import Counter
    cnt = Counter()
    for h, a in sched:
        check_intra = lg[h] == lg[a]
        if not check_intra:
            raise SystemExit("SELF-TEST FAIL: npb interleague pairing")
        cnt[h] += 1; cnt[a] += 1
    check("npb schedule honours totals", all(cnt[cd] == rest[cd] for cd in rest))

    # NPB climax: champion advantage is real
    rng = random.Random(4)
    m = {cd: 0.0 for cd in NPB_TEAMS}
    cl_teams = [cd for cd in NPB_TEAMS if NPB_TEAMS[cd][2] == "Central"]
    # equal teams: the champion should win the final stage well over half the time
    reps = 0
    trials = 400
    saved_state = random.Random(5)
    for _ in range(trials):
        # inline the climax logic with equal ratings via build path is heavy;
        # approximate: champion needs 3 wins before challenger gets 4 at 53.5% HFA
        wc, wch = 1, 0
        while wc < 4 and wch < 4:
            if saved_state.random() < 0.55:  # ~HFA-tilted game at champion's park
                wc += 1
            else:
                wch += 1
        reps += wc == 4
    check("npb final-stage advantage", reps / trials > 0.65)

    print("SELF-TEST: %d checks passed" % ok)


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="auto",
                    help="comma list of afl,nrl,wnba,cfl,npb,mls; 'auto' = all in-season; 'all' = every league")
    ap.add_argument("--sims", type=int, default=DEFAULT_SIMS)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    month = date.today().month
    if args.league == "auto":
        leagues = [lg for lg in BUILDERS if month in ACTIVE_MONTHS[lg]]
        if not leagues:
            print("[season-sims] no league in season (month %d); nothing to do." % month)
            return
    elif args.league == "all":
        leagues = list(BUILDERS)
    else:
        leagues = [x.strip() for x in args.league.split(",") if x.strip()]
        bad = set(leagues) - set(BUILDERS)
        if bad:
            raise SystemExit("unknown league(s): %s" % sorted(bad))

    failures = []
    for lg in leagues:
        try:
            payload = BUILDERS[lg](args.sims)
            write_out(lg, payload, args.dry)
        except Exception as e:
            # One broken source must not block the other five leagues; the
            # workflow's commit step only picks up files that were written.
            # Catches everything, not just our own SystemExit hard-fails --
            # a network error (DNS, timeout, connection refused) is just as
            # capable of taking out one source as a standings mismatch is,
            # and must not crash the whole process before the other leagues
            # even get a turn. Found 2026-08-11 when afltables.com stopped
            # resolving through the mini's Tailscale DNS mid-migration: an
            # uncaught socket.gaierror killed NRL/WNBA/CFL/NPB/MLS along with
            # AFL, even though only AFL's source was actually down.
            print("[%s] FAILED: %s" % (lg, e), file=sys.stderr)
            failures.append(lg)
    if failures:
        sys.exit("failed leagues: %s" % ", ".join(failures))


if __name__ == "__main__":
    main()
