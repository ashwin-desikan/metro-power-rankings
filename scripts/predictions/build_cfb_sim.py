#!/usr/bin/env python3
"""College Football 2026 season simulator + weekly AP-25 predictions + ledger.

The CFB leg of /predictions (the NFL points-v2 engine adapted for the college
game):
  public/data/cfb-sim.json          - season odds per FBS team (exp wins,
                                      conference title game, conference title,
                                      the 12-team playoff, a first-round bye,
                                      the national championship)
  public/data/cfb-predictions.json  - weekly game predictions + graded ledger,
                                      AP Top 25 games ONLY, each week's slate
                                      built after the AP poll is released

MODEL (points-v3, "site data + market + poll"):
  - Team strength = opponent-adjusted scoring margin (an SRS solve, margins
    capped at MARGIN_CAP, home-field removed, FCS opponents pooled into one
    bucket team) over the last three seasons, recency-weighted and regressed;
    BLENDED with two priors mapped onto the points scale via the model's own
    rating-to-title-odds curve:
      * a market rating from the DraftKings national-championship futures
        ESPN carries (de-vigged), and
      * a poll rating from AP Top 25 vote shares (the poll anchor - college
        rosters churn through the portal, so the preseason poll carries
        signal margins cannot see).
    Prior weights fade as real 2026 games fold into the SRS.
  - Each game: P(home) = Phi((r_home - r_away + HFA) / SIGMA_GAME); HFA drops
    on neutral sites. Sigma and HFA are college-sized (16.5 / 2.6).
  - The REAL 2026 FBS schedule (ESPN weekly scoreboards) is simulated:
    conference standings by conference win pct (head-to-head inside the sim,
    then random, standing in for each league's tie-break ladder), top two per
    conference meet in the title game, then the 12-team CFP: the five
    highest-ranked conference champions are in, seven at-large by committee
    rank, STRAIGHT SEEDING (2026 format, confirmed to stay at 12), byes to
    seeds 1-4, first round at the higher seed, quarters on neutral.
  - The committee is NOT a formula; the proxy here is rating + K_REC * (wins
    - losses) computed after the title games, stated on the page as a proxy.

WEEKLY PREDICTIONS + LEDGER: games involving a CURRENT AP Top 25 team in the
next window get a model win probability; ESPN's posted line provides the
market column and a 50/50 blend that makes the pick. A week's slate is only
extended while the latest AP poll is fresh (POLL_MAX_AGE_DAYS), so each slate
comes out after the poll, exactly as the product promises. Predictions freeze
on first sight; later runs grade them and accumulate Brier for model, market
and blend.

    python scripts/predictions/build_cfb_sim.py               # build + write
    python scripts/predictions/build_cfb_sim.py --dry
    python scripts/predictions/build_cfb_sim.py --self-test   # offline tests
    python scripts/predictions/build_cfb_sim.py --sims 20000

Network: ESPN only (Windows box / CI; the Cowork sandbox is blocked).
"""
import io
import json
import math
import os
import random
import sys
import time
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_common as sc

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_SIM = os.path.join(ROOT, "public", "data", "cfb-sim.json")
OUT_PRED = os.path.join(ROOT, "public", "data", "cfb-predictions.json")
# Written by build_meta_market.py --league cfb, which must run BEFORE this
# builder in the runner. Read-only here and soft: a missing meta-market means
# an entry freezes without one, never a failed build.
IN_META = os.path.join(ROOT, "public", "data", "cfb-meta-market.json")
OUT_HIST = os.path.join(ROOT, "public", "data", "cfb-sim-history.json")
SLUG_LOOKUP = os.path.join(ROOT, "public", "data", "cfb", "slug-lookup.json")

SEASON = 2026
STRENGTH_SEASONS = [(2025, 0.55), (2024, 0.30), (2023, 0.15)]
REGRESS = 0.88         # year-over-year carry (program strength is sticky in
                       # college; the recency weights already decay the past,
                       # and SIGMA_SEASON carries the roster-churn uncertainty)
SRS_PRIOR_GAMES = 1.0  # ridge inside each season's SRS solve (toward 0)
MARGIN_CAP = 32        # cap game margins entering the SRS (blowout noise)
HFA = 2.6              # college home-field advantage, points
SIGMA_GAME = 16.0      # sd of a college game margin around the spread
SIGMA_SEASON = 3.5     # per-simulated-season rating noise (portal humility)
W_MARKET = 0.35        # preseason weight of the futures-implied rating
W_POLL = 0.25          # preseason weight of the AP-poll-implied rating
MKT_MIN_PROB = 0.004   # below this devigged title prob the futures price is
                       # pure longshot noise (every bad team quotes +50000)
                       # and would flatten the bottom of the field - skip it
K_REC = 1.15           # committee proxy: points of rating per net win
CCG_HOME_HOSTED = {"American", "Conference USA", "Mountain West", "Sun Belt", "Pac-12"}
CALIB_SIMS = 3000
MATCH_BLEND_W = 0.5
WINDOW_DAYS = 8
POLL_MAX_AGE_DAYS = 9  # a slate only grows while the AP poll is this fresh
DEFAULT_SIMS = 10000

# points-v3: correlated season-noise layers and the adaptive-sigma / market
# rating / tiering knobs (contract 2026-09-03, CFB-scaled).
HFA_SD = 0.9               # sd of the per-season league-wide HFA jitter
CONF_SD = 1.5               # sd of the per-season, per-conference jitter
SIGMA_FLOOR_FRAC = 0.45     # floor on adaptive sigma as a fraction of SIGMA_SEASON
DISAGREE_K = 0.5            # widens a team's sigma by this * |stats - market|
TIER_SIMS = 4000            # sim count for the "lite" and "classic" tiers
SPREAD_LAMBDA = 2.0         # ridge weight (games-equivalent) pulling spread ratings to prior
SPREAD_LOOKBACK_DAYS = 28   # ledger market.spread entries older than this are dropped
SPREAD_MIN_OBS = 25         # below this many spread observations, fall back to futures
HISTORY_KEEP = 180          # max snapshots kept in cfb-sim-history.json
MIN_TEAM_GAMES = 10    # hard floor per FBS team (played + remaining). Also the
                       # trigger for the per-team schedule backfill below, so
                       # the repair and the gate can never drift apart.
MAX_BACKFILL_TEAMS = 8 # a handful of teams short is an ESPN indexing gap and
                       # is repairable one team at a time; dozens short is the
                       # scoreboard itself being broken, and firing 138 extra
                       # requests at ESPN would be the wrong response - bail
                       # and let the gate fail loudly instead.
FCS = "__FCS__"        # pooled pseudo-team for every non-FBS opponent
ESPN = "https://site.api.espn.com/apis"
CORE = "https://sports.core.api.espn.com/v2"

# ESPN `team.location` -> canonical CFB team name in public/data/cfb (kept in
# lockstep with CANONICAL_OVERRIDE in lib/cfb-live.ts; the page resolves links
# through the same map, this copy names slugs inside the data files).
CANONICAL_OVERRIDE = {
    "Miami": "Miami FL",
    "Miami (OH)": "Miami OH",
    "Ole Miss": "Mississippi",
    "UTSA": "TX-San Antonio",
    "UCF": "Central Florida",
    "Sam Houston": "Sam Houston State",
    "Hawai'i": "Hawaii",
    "App State": "Appalachian State",
    "Middle Tennessee": "Middle Tennessee State",
    "San José State": "San Jose State",
    "NC State": "North Carolina State",
    "UConn": "Connecticut",
    "Southern Miss": "Southern Mississippi",
    "Louisiana": "LA-Lafayette",
    "UL Monroe": "LA-Monroe",
}


def name_key(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


def load_slug_lookup():
    """{name_key: page slug} over ALL 306 tracked programs (data.json), with
    slug-lookup.json as the fallback - the lookup file is a TOP_TEAMS subset
    and is blind to LA-Lafayette and LA-Monroe."""
    try:
        with io.open(os.path.join(ROOT, "public", "data", "cfb", "data.json"),
                     encoding="utf-8") as f:
            teams = json.load(f).get("teams", [])
        if teams:
            return {name_key(t["name"]): t["slug"] for t in teams}
    except Exception:
        pass
    try:
        with io.open(SLUG_LOOKUP, encoding="utf-8") as f:
            raw = json.load(f)
        return {name_key(k): v for k, v in raw.items()}
    except Exception:
        return {}


def page_slug_for(location, lookup):
    return lookup.get(name_key(CANONICAL_OVERRIDE.get(location, location)))


def fetch_json(url, soft=False):
    # No User-Agent on purpose - see build_mlb_sim.py's fetch_json docstring
    # for the measured matrix. Do not add a UA back without re-measuring.
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 2:
                if soft:
                    print("soft-fetch miss: %s (%s)" % (url, e))
                    return None
                raise SystemExit("required fetch failed: %s (%s)" % (url, e))
            time.sleep(1.5)


def phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def home_win_prob(r_h, r_a, hfa=HFA):
    return phi((r_h - r_a + hfa) / SIGMA_GAME)


# ------------------------------------------------------------- membership

def fbs_membership(season):
    """{conference_short: [team_id]} + {team_id: location} for the season.
    The Independents child is kept as a conference named 'Independents'
    (never gets a title game)."""
    d = fetch_json("%s/v2/sports/football/college-football/standings?season=%d"
                   % (ESPN, season))
    confs, names = {}, {}
    for ch in d.get("children", []):
        cname = conf_short(ch.get("name") or ch.get("abbreviation") or "?")
        ids = []
        for e in _entries_deep(ch):
            t = e.get("team") or {}
            tid = str(t.get("id"))
            if not tid or tid == "None" or tid in ids:
                continue
            ids.append(tid)
            names[tid] = t.get("location") or t.get("displayName") or tid
        if ids:
            confs.setdefault(cname, []).extend(ids)
    return confs, names


def _entries_deep(node):
    """Standings entries of a conference node, recursing into division
    children (Sun Belt/MAC file their teams one level down)."""
    out = list((node.get("standings") or {}).get("entries", []))
    for sub in node.get("children", []) or []:
        out.extend(_entries_deep(sub))
    return out


def conf_short(name):
    """Short label per conference. 🔴 MATCH ON THE EXACT NORMALIZED NAME,
    never a substring scan: "American Conference" is a SUBSTRING of
    "Mid-American Conference", and a substring pass silently merged the MAC
    into the American (18 teams, one title game for two leagues) on the
    first live run."""
    n = " ".join((name or "").split())
    exact = {
        "Southeastern Conference": "SEC",
        "Atlantic Coast Conference": "ACC",
        "American Athletic Conference": "American",
        "American Conference": "American",
        "Mid-American Conference": "MAC",
        "Mountain West Conference": "Mountain West",
        "Sun Belt Conference": "Sun Belt",
        "Pac-12 Conference": "Pac-12",
        "Big Ten Conference": "Big Ten",
        "Big 12 Conference": "Big 12",
        "Conference USA": "Conference USA",
        "FBS Independents": "Independents",
    }
    if n in exact:
        return exact[n]
    return n.replace(" Conference", "").strip() or n


def standings_records(season):
    """{team_id: (wins, losses)} from the standings endpoint - the
    independent table the derived records reconcile against."""
    d = fetch_json("%s/v2/sports/football/college-football/standings?season=%d"
                   % (ESPN, season))
    out = {}
    for ch in d.get("children", []):
        for e in _entries_deep(ch):
            tid = str((e.get("team") or {}).get("id"))
            stats = {s.get("name"): s.get("value") for s in e.get("stats", [])}
            w, l = stats.get("wins"), stats.get("losses")
            if tid and w is not None and l is not None:
                out[tid] = (int(w), int(l))
    return out


# ---------------------------------------------------------------- schedule

def season_events(season, include_post=True):
    """Every FBS scoreboard event for a season:
    [{id, date, week, st, home, away, hs, as, completed, neutral, conf_game,
      note}] - team fields are ESPN team ids; scores None until completed.

    🔴 NEVER pass limit= to this endpoint. The week query silently TRUNCATES
    whenever a limit param is present (measured 2026-08-19: 2025 week 10
    returned 25 events with limit=900, 52 without; the 2026 season summed to
    713 events via limited date ranges vs 902 via unlimited week queries,
    and future-dated games were the ones dropped)."""
    events, seen = [], set()
    urls = ["%s/site/v2/sports/football/college-football/scoreboard"
            "?groups=80&dates=%d&seasontype=2&week=%d" % (ESPN, season, w)
            for w in range(1, 17)]
    if include_post:
        urls += ["%s/site/v2/sports/football/college-football/scoreboard"
                 "?groups=80&dates=%d&seasontype=3&week=%d" % (ESPN, season, w)
                 for w in range(1, 6)]
    for url in urls:
        d = fetch_json(url, soft=True)
        for ev in (d or {}).get("events", []):
            eid = str(ev.get("id"))
            if not eid or eid in seen:
                continue
            ev_year = (ev.get("season") or {}).get("year")
            if ev_year is not None and ev_year != season:
                continue
            seen.add(eid)
            comp = (ev.get("competitions") or [{}])[0]
            home = away = None
            hloc = aloc = ""
            hs = as_ = None
            for c in comp.get("competitors", []):
                t = c.get("team") or {}
                tid = str(t.get("id"))
                sc_val = _score_val(c.get("score"))
                if c.get("homeAway") == "home":
                    home, hs, hloc = tid, sc_val, t.get("location") or ""
                else:
                    away, as_, aloc = tid, sc_val, t.get("location") or ""
            if not home or not away:
                continue
            notes = comp.get("notes") or []
            note = (notes[0].get("headline") or "") if notes else ""
            completed = bool(((comp.get("status") or {}).get("type") or {})
                             .get("completed"))
            events.append({
                "id": eid,
                "date": (ev.get("date") or "")[:10],
                "kick": ev.get("date") or "",
                "week": (ev.get("week") or {}).get("number") or 0,
                "st": (ev.get("season") or {}).get("type") or 2,
                "home": home, "away": away, "hs": hs, "as": as_,
                "hloc": hloc, "aloc": aloc,
                "completed": completed,
                "neutral": bool(comp.get("neutralSite")),
                "conf_game": bool(comp.get("conferenceCompetition")),
                "note": note,
                "mkt": None if completed else market_home_prob(comp),
                "spread": None if completed else sc.market_spread(comp),
            })
    events.sort(key=lambda e: (e["date"], e["id"]))
    return events


def _score_val(raw):
    """Competitor score across both ESPN shapes: the scoreboard returns a bare
    string ("33"), the per-team schedule an object ({"value": 33.0, ...})."""
    if isinstance(raw, dict):
        raw = raw.get("value", raw.get("displayValue"))
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def team_schedule_events(team_id, season, conf_of):
    """Regular-season events for one team from its own schedule endpoint,
    normalised into the season_events() shape.

    This endpoint indexes independently of the scoreboard and is the repair
    path for scoreboard gaps (measured 2026-08-30: ESPN's groups=80 scoreboard
    carried 3 of Jacksonville State's games, this endpoint all 12). It is a
    thinner payload, so three fields differ and are reconstructed here:
      - score is an object, not a string          -> _score_val handles both
      - no conferenceCompetition flag             -> derived from conf_of
      - no odds block                             -> mkt stays None, which
        grade_and_extend already treats as a model-only ledger entry
    Only seasontype 2 is taken: bowls and the CFP never enter the season sim,
    and a scheduled CCG has TBD competitors that fail the both-sides check
    below, so no note-less championship game can slip in as a regular game."""
    d = fetch_json("%s/site/v2/sports/football/college-football/teams/%s"
                   "/schedule?season=%d" % (ESPN, team_id, season), soft=True)
    out = []
    for ev in (d or {}).get("events", []):
        eid = str(ev.get("id") or "")
        if not eid:
            continue
        if ((ev.get("season") or {}).get("year") or season) != season:
            continue
        if ((ev.get("seasonType") or {}).get("type") or 2) != 2:
            continue
        comp = (ev.get("competitions") or [{}])[0]
        home = away = None
        hloc = aloc = ""
        hs = as_ = None
        for c in comp.get("competitors", []):
            t = c.get("team") or {}
            tid = str(t.get("id") or "")
            sc_val = _score_val(c.get("score"))
            if c.get("homeAway") == "home":
                home, hs, hloc = tid, sc_val, t.get("location") or ""
            else:
                away, as_, aloc = tid, sc_val, t.get("location") or ""
        if not home or not away:
            continue
        notes = comp.get("notes") or []
        note = (notes[0].get("headline") or "") if notes else ""
        completed = bool(((comp.get("status") or {}).get("type") or {})
                         .get("completed"))
        out.append({
            "id": eid,
            "date": (ev.get("date") or "")[:10],
            "kick": ev.get("date") or "",
            "week": (ev.get("week") or {}).get("number") or 0,
            "st": 2,
            "home": home, "away": away, "hs": hs, "as": as_,
            "hloc": hloc, "aloc": aloc,
            "completed": completed,
            "neutral": bool(comp.get("neutralSite")),
            "conf_game": bool(conf_of.get(home)
                              and conf_of.get(home) == conf_of.get(away)),
            "note": note,
            "mkt": None if completed else market_home_prob(comp),
            "spread": None if completed else sc.market_spread(comp),
        })
    return out


def backfill_short_schedules(events, id_list, names, conf_of, season):
    """Repair scoreboard indexing gaps before the hard gate sees them.

    Any FBS team the scoreboard leaves under MIN_TEAM_GAMES regular-season
    games gets its own schedule endpoint pulled and the missing events merged
    in by event id. The gate in build() is unchanged and still runs after
    this: a team the repair cannot lift over the floor still hard-exits."""
    counts = defaultdict(int)
    for e in events:
        if e["st"] != 2 or is_ccg(e):
            continue
        for side in ("home", "away"):
            counts[e[side]] += 1
    short = [t for t in id_list if counts[t] < MIN_TEAM_GAMES]
    if not short:
        return events, []
    if len(short) > MAX_BACKFILL_TEAMS:
        print("  backfill SKIPPED: %d teams under %d games - that is a broken "
              "scoreboard, not an indexing gap; not fetching %d team endpoints"
              % (len(short), MIN_TEAM_GAMES, len(short)))
        return events, []
    have = {e["id"] for e in events}
    merged = list(events)
    repaired = []
    for t in short:
        added = [e for e in team_schedule_events(t, season, conf_of)
                 if e["id"] not in have]
        for e in added:
            have.add(e["id"])
        merged.extend(added)
        after = counts[t] + len(added)
        print("  backfill: %s had %d scoreboard games, +%d from its own "
              "schedule endpoint -> %d"
              % (names.get(t, t), counts[t], len(added), after))
        if added:
            repaired.append((t, counts[t], after))
    merged.sort(key=lambda e: (e["date"], e["id"]))
    return merged, repaired


def is_ccg(ev):
    return "championship" in (ev.get("note") or "").lower() and ev["st"] == 2


# ---------------------------------------------------------------- ratings

def solve_srs(games, team_ids, prior=None, prior_w=SRS_PRIOR_GAMES, iters=60):
    """Opponent-adjusted margin ratings. games: [(home, away, hs, as, neutral)]
    over ids in team_ids or FCS (already pooled). Margins capped, HFA removed.
    prior: {id: rating} ridge target (0.0 when None)."""
    r = {t: 0.0 for t in team_ids}
    r[FCS] = -18.0
    rows = defaultdict(list)  # id -> [(adj_margin_from_own_view, opp)]
    for h, a, hs, as_, neutral in games:
        m = max(-MARGIN_CAP, min(MARGIN_CAP, hs - as_))
        adj = m - (0.0 if neutral else HFA)
        if h in r:
            rows[h].append((adj, a))
        if a in r:
            rows[a].append((-adj, h))
    p = prior or {}
    for _ in range(iters):
        nxt = {}
        for t in r:
            gs = rows.get(t)
            if not gs:
                nxt[t] = p.get(t, r[t] if t == FCS else 0.0)
                continue
            s = sum(m + r.get(opp, r[FCS]) for m, opp in gs)
            s += prior_w * p.get(t, 0.0)
            nxt[t] = s / (len(gs) + prior_w)
        r = nxt
    # center on the FBS teams (FCS bucket floats below)
    mean = sum(r[t] for t in team_ids) / max(1, len(team_ids))
    return {t: v - mean for t, v in r.items()}


def pool_fcs(events, fbs_ids):
    """[(home, away, hs, as, neutral)] with non-FBS ids replaced by FCS,
    completed games only, FCS-vs-FCS dropped."""
    out = []
    for e in events:
        if not e["completed"] or e["hs"] is None or e["as"] is None:
            continue
        h = e["home"] if e["home"] in fbs_ids else FCS
        a = e["away"] if e["away"] in fbs_ids else FCS
        if h == FCS and a == FCS:
            continue
        out.append((h, a, e["hs"], e["as"], e["neutral"]))
    return out


def historical_ratings(seasons_events, seasons_ids, current_ids):
    """Blend per-season SRS into one regressed preseason rating on the
    CURRENT team set. A team absent from a season contributes nothing for
    that season (new-to-FBS schools lean on the poll/market priors)."""
    per = {}
    for (season, _w) in STRENGTH_SEASONS:
        evs, ids = seasons_events[season], seasons_ids[season]
        per[season] = solve_srs(pool_fcs(evs, ids), ids)
    out = {}
    for t in current_ids:
        num = den = 0.0
        for season, w in STRENGTH_SEASONS:
            v = per[season].get(t)
            if v is not None:
                num += w * v
                den += w
        out[t] = REGRESS * (num / den) if den else 0.0
    mean = sum(out.values()) / max(1, len(out))
    return {t: v - mean for t, v in out.items()}, per


# --------------------------------------------------- market + poll priors

def american_prob(v):
    return sc.american_prob(v)


def fetch_title_futures(fbs_ids):
    """{team_id: devigged national-title prob} from the futures market ESPN
    carries (DraftKings), or None. Soft by design."""
    import re as _re
    f = fetch_json("%s/sports/football/leagues/college-football/seasons/%d/"
                   "futures?limit=100" % (CORE, SEASON), soft=True)
    if not f:
        return None, None
    item = None
    for i in f.get("items", []):
        nm = (i.get("name") or "").lower()
        if "championship" in nm and "reach" not in nm and "conference" not in nm \
                and "game" not in nm:
            item = i
            break
    if not item or not item.get("futures"):
        return None, None
    fut = item["futures"][0]
    probs = {}
    for b in fut.get("books", []):
        ml = b.get("value")
        m = _re.search(r"teams/(\d+)", (b.get("team") or {}).get("$ref", ""))
        tid = m.group(1) if m else None
        if tid in fbs_ids and ml is not None:
            try:
                probs[tid] = american_prob(ml)
            except (TypeError, ValueError):
                pass
    if len(probs) < 40:
        return None, None
    s = sum(probs.values())
    return {t: p / s for t, p in probs.items()}, (fut.get("provider") or {}).get("name")


def fetch_ap_poll():
    """(poll_points {team_id: pts}, ranks {team_id: rank}, week_label, date)
    for the current AP Top 25 (others-receiving-votes folded in when ESPN
    carries them)."""
    d = fetch_json("%s/site/v2/sports/football/college-football/rankings"
                   % ESPN, soft=True)
    for r in (d or {}).get("rankings", []):
        blob = " ".join(str(r.get(k) or "") for k in ("name", "shortName", "type"))
        if "ap" not in blob.lower():
            continue
        pts, ranks = {}, {}
        for e in r.get("ranks", []):
            tid = str((e.get("team") or {}).get("id"))
            if not tid:
                continue
            ranks[tid] = int(e.get("current") or 0)
            if e.get("points"):
                pts[tid] = float(e["points"])
        for e in r.get("others", []) or []:
            tid = str((e.get("team") or {}).get("id"))
            if tid and e.get("points"):
                pts[tid] = float(e["points"])
        label = ((r.get("occurrence") or {}).get("displayValue")) or None
        return pts, ranks, label, (r.get("date") or "")[:10] or None
    return {}, {}, None, None


def _fit_rating_from_logodds(pairs):
    return sc.fit_rating_from_logodds(pairs)


def _logodds(p, floor=5e-4):
    return sc.logodds(p, floor)


def blend_priors(ratings, natty_curve, mkt_probs, poll_pts, gp):
    """Fold the futures-implied and poll-implied ratings into the SRS rating
    per team, weights fading as that team's 2026 games accumulate. natty_curve
    is (a, b) mapping logodds(title prob) -> rating. Missing components
    renormalize per team."""
    a, b = natty_curve
    poll_share = None
    if poll_pts:
        s = sum(poll_pts.values())
        if s > 0:
            poll_share = {t: v / s for t, v in poll_pts.items()}
    out = {}
    for t, r_stats in ratings.items():
        wc = min(0.75, gp.get(t, 0) / 12.0 * 1.2)
        comps = [(1.0, r_stats)]  # stats weight = remainder
        if b > 0 and mkt_probs and mkt_probs.get(t, 0.0) >= MKT_MIN_PROB:
            comps.append((W_MARKET * (1 - wc), a + b * _logodds(mkt_probs[t])))
        if b > 0 and poll_share and t in poll_share:
            comps.append((W_POLL * (1 - wc), a + b * _logodds(poll_share[t])))
        prior_w = sum(w for w, _ in comps[1:])
        comps[0] = (1.0 - prior_w, r_stats)
        out[t] = sum(w * v for w, v in comps)
    mean = sum(out.values()) / max(1, len(out))
    return {t: v - mean for t, v in out.items()}
# ------------------------------------------------------------------ the sim

def _tally():
    return {"reg_wins": 0.0, "ccg": 0, "conf": 0, "playoff": 0, "bye": 0,
            "natty": 0}


def order_conference(members, conf_w, conf_l, h2h, rng):
    """Order a conference table: conference win pct, head-to-head wins inside
    the tied group, random - an approximation of every league's own ladder."""
    def pct(i):
        g = conf_w[i] + conf_l[i]
        return conf_w[i] / g if g else 0.0
    ts = sorted(members, key=lambda i: (-pct(i), rng.random()))
    out, i = [], 0
    while i < len(ts):
        j = i
        while j < len(ts) and abs(pct(ts[j]) - pct(ts[i])) < 1e-9:
            j += 1
        group = ts[i:j]
        if len(group) > 1:
            members_copy = list(group)
            group.sort(key=lambda t: (-sum(h2h.get((t, u), 0) for u in members_copy if u != t),
                                      rng.random()))
        out.extend(group)
        i = j
    return out


def committee_field(scores, champs, rng):
    """The 12-team CFP under the 2026 format: five highest-ranked conference
    champions are in, seven at-large, STRAIGHT SEEDING by committee rank.
    scores: {i: committee score}; champs: set of champion indices.
    Returns (seeds[0..11] (seed 1 first), first_out) -- first_out is the
    best-ranked team the field left out (None only in a tiny self-test
    field smaller than 13 teams), the bubble marker for p_bubble."""
    ranked = sorted(scores, key=lambda i: (-scores[i], rng.random()))
    champ_order = [i for i in ranked if i in champs]
    auto = set(champ_order[:5])
    field = list(auto)
    for i in ranked:
        if len(field) >= 12:
            break
        if i not in auto:
            field.append(i)
    field.sort(key=lambda i: (-scores[i], rng.random()))
    field = field[:12]
    field_set = set(field)
    first_out = next((i for i in ranked if i not in field_set), None)
    return field, first_out


def run_cfp(seeds, r, rng, sim_game):
    """First round at the higher seed (HFA), quarters/semis/final neutral.
    Fixed bracket, no reseeding. Returns the champion index."""
    def g(h, a, hfa):
        return h if sim_game(r[h], r[a], hfa) else a
    if len(seeds) < 12:  # tiny fields only exist in self-tests
        alive = list(seeds)
        while len(alive) > 1:
            alive = [g(alive[i], alive[len(alive) - 1 - i], 0.0)
                     for i in range(len(alive) // 2)]
        return alive[0]
    w89 = g(seeds[7], seeds[8], HFA)
    w512 = g(seeds[4], seeds[11], HFA)
    w611 = g(seeds[5], seeds[10], HFA)
    w710 = g(seeds[6], seeds[9], HFA)
    q1 = g(seeds[0], w89, 0.0)
    q2 = g(seeds[3], w512, 0.0)
    q3 = g(seeds[2], w611, 0.0)
    q4 = g(seeds[1], w710, 0.0)
    s1 = g(q1, q2, 0.0)
    s2 = g(q4, q3, 0.0)
    return g(s1, s2, 0.0)


def simulate(state, ratings_list, sims, seed=2026, natty_only=False,
             sigma_team=None, window_gids=None):
    """state: prepared arrays (see prepare_state). ratings_list: base rating
    per index. Returns {"acc", "win_lists", "leverage", "bubble"}
    (natty_only skips the record-keeping the calibration pre-sim does not
    need, and returns only "acc" for backward compatibility with that
    pre-sim's one caller).

    Common random numbers: season i draws its correlated rating shocks (a
    league-wide HFA jitter, a per-conference jitter, a per-team jitter) from
    random.Random(seed*1_000_003 + i), then ONE uniform per game of the FULL
    regular-season schedule (played + remaining, fixed (date, gid) order via
    state["gid_pos"]), so a game's draw does not move as earlier games get
    played. Conference-title, committee and CFP draws come from a second
    random.Random(seed*7_919 + i), so neither stream's length depends on the
    other.

    `sigma_team`: {index: adaptive per-team sigma} (falls back to
    SIGMA_SEASON for any team missing from it). `window_gids`: event ids to
    collect playoff-leverage counts for (the ledger's upcoming AP window)."""
    n = state["n"]
    remaining = state["remaining"]        # (gid, hi, ai, hfa, conf_flag) ai=-1 FCS
    conf_members = state["conf_members"]  # {conf: [i]} (no Independents)
    fixed_ccg = state["fixed_ccg"]        # {conf: (winner_i, loser_i)}
    ccg_neutral = state["ccg_neutral"]    # {conf: bool}
    r_fcs = state["r_fcs"]
    base_rw = state["reg_wins"]
    base_l = state["losses"]
    base_cw = state["conf_w"]
    base_cl = state["conf_l"]
    base_h2h = state["h2h"]
    gid_pos = state["gid_pos"]
    n_full = state["n_full"]
    sigma_team = sigma_team or {}
    window_gids = set(window_gids or ())
    idx_conf = {i: c for c, members in conf_members.items() for i in members}
    e_sd = {}
    for i in range(n):
        s_i = sigma_team.get(i, SIGMA_SEASON)
        e_sd[i] = sc.layer_residual_sd(s_i, CONF_SD) if i in idx_conf else s_i
    acc = {i: _tally() for i in range(n)}
    win_lists = {i: [] for i in range(n)}
    bubble = {i: 0 for i in range(n)}
    lc = {gid: {"home": {"win_po": 0, "win_total": 0, "loss_po": 0, "loss_total": 0},
                "away": {"win_po": 0, "win_total": 0, "loss_po": 0, "loss_total": 0}}
          for gid in window_gids}
    sqrt2 = math.sqrt(2.0)

    def game_prob(rh, ra, hfa):
        return 0.5 * (1.0 + math.erf(((rh - ra + hfa) / SIGMA_GAME) / sqrt2))

    for i in range(sims):
        rng = random.Random(seed * 1_000_003 + i)
        rng2 = random.Random(seed * 7_919 + i)

        def sim_game2(rh, ra, hfa):
            return rng2.random() < game_prob(rh, ra, hfa)

        hfa_s = HFA + rng.gauss(0.0, HFA_SD)
        conf_noise = {c: rng.gauss(0.0, CONF_SD) for c in conf_members}
        team_noise = [rng.gauss(0.0, e_sd[k]) for k in range(n)]
        r = [ratings_list[k] + conf_noise.get(idx_conf.get(k), 0.0) + team_noise[k]
             for k in range(n)]
        uniforms = [rng.random() for _ in range(n_full)]

        rw = list(base_rw)
        lo = list(base_l)
        cw = list(base_cw)
        cl = list(base_cl)
        h2h = dict(base_h2h)
        game_winner = {}
        for gid, hi, ai, g_hfa, cf in remaining:
            eff_hfa = 0.0 if g_hfa == 0.0 else hfa_s
            ra = r[ai] if ai >= 0 else r_fcs
            rh = r[hi] if hi >= 0 else r_fcs
            u = uniforms[gid_pos[gid]]
            hwin = u < game_prob(rh, ra, eff_hfa)
            if gid in window_gids:
                game_winner[gid] = (hi, ai, hwin)
            if hwin:
                if hi >= 0:
                    rw[hi] += 1
                if ai >= 0:
                    lo[ai] += 1
                if cf and hi >= 0 and ai >= 0:
                    cw[hi] += 1; cl[ai] += 1
                    h2h[(hi, ai)] = h2h.get((hi, ai), 0) + 1
            else:
                if ai >= 0:
                    rw[ai] += 1
                if hi >= 0:
                    lo[hi] += 1
                if cf and hi >= 0 and ai >= 0:
                    cw[ai] += 1; cl[hi] += 1
                    h2h[(ai, hi)] = h2h.get((ai, hi), 0) + 1
        wins = list(rw)   # post-season record starts from the regular season
        loss = list(lo)
        champs = set()
        for conf, members in conf_members.items():
            if conf in fixed_ccg:
                wtm, ltm = fixed_ccg[conf]
                champs.add(wtm)
                if not natty_only:
                    acc[wtm]["ccg"] += 1
                    acc[ltm]["ccg"] += 1
                    acc[wtm]["conf"] += 1
                continue
            order = order_conference(members, cw, cl, h2h, rng2)
            a, b = order[0], order[1]
            ccg_hfa = 0.0 if ccg_neutral[conf] else hfa_s
            awin = sim_game2(r[a], r[b], ccg_hfa)
            wtm, ltm = (a, b) if awin else (b, a)
            wins[wtm] += 1
            loss[ltm] += 1
            champs.add(wtm)
            if not natty_only:
                acc[a]["ccg"] += 1
                acc[b]["ccg"] += 1
                acc[wtm]["conf"] += 1
        scores = {k: r[k] + K_REC * (wins[k] - loss[k]) for k in range(n)}
        seeds, first_out = committee_field(scores, champs, rng2)
        champ = run_cfp(seeds, r, rng2, sim_game2)
        acc[champ]["natty"] += 1
        if not natty_only:
            po_set = set(seeds)
            for k, t in enumerate(seeds):
                acc[t]["playoff"] += 1
                if k < 4:
                    acc[t]["bye"] += 1
            bubble[seeds[-1]] += 1
            if first_out is not None:
                bubble[first_out] += 1
            for t in range(n):
                acc[t]["reg_wins"] += rw[t]
                win_lists[t].append(rw[t])
            for gid, (hi, ai, hwin) in game_winner.items():
                entry = lc[gid]
                if hwin:
                    entry["home"]["win_total"] += 1
                    if hi >= 0 and hi in po_set:
                        entry["home"]["win_po"] += 1
                    entry["away"]["loss_total"] += 1
                    if ai >= 0 and ai in po_set:
                        entry["away"]["loss_po"] += 1
                else:
                    entry["home"]["loss_total"] += 1
                    if hi >= 0 and hi in po_set:
                        entry["home"]["loss_po"] += 1
                    entry["away"]["win_total"] += 1
                    if ai >= 0 and ai in po_set:
                        entry["away"]["win_po"] += 1

    if natty_only:
        return {"acc": acc}

    leverage = {}
    for gid, c in lc.items():
        lh = sc.leverage_from_counts(c["home"]["win_po"], c["home"]["win_total"],
                                     c["home"]["loss_po"], c["home"]["loss_total"])
        la = sc.leverage_from_counts(c["away"]["win_po"], c["away"]["win_total"],
                                     c["away"]["loss_po"], c["away"]["loss_total"])
        leverage[gid] = {"home": lh, "away": la, "game": round(lh + la, 1)}

    return {"acc": acc, "win_lists": win_lists, "leverage": leverage, "bubble": bubble}


# -------------------------------------------------------- ledger + grading

def brier2(p_home, outcome_home_win):
    return sc.brier2(p_home, outcome_home_win)


def market_home_prob(comp):
    for o in comp.get("odds") or []:
        hml = (o.get("homeTeamOdds") or {}).get("moneyLine")
        aml = (o.get("awayTeamOdds") or {}).get("moneyLine")
        if hml and aml:
            try:
                ph = american_prob(hml)
                pa = american_prob(aml)
            except (TypeError, ValueError):
                ph = pa = None
            if ph and pa and ph + pa > 0:
                return round(ph / (ph + pa), 4)
        spread = o.get("spread")  # negative = home favoured on ESPN
        if spread is not None:
            try:
                return round(phi(-float(spread) / SIGMA_GAME), 4)
            except (TypeError, ValueError):
                pass
    return None


def kickoff_iso(raw):
    for fmt in ("%Y-%m-%dT%H:%MZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(raw or "", fmt).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            pass
    return None


def upcoming_ap_games(events, today, window_days, ap_ranks):
    """Not-yet-completed FBS games in the window where either side is in the
    CURRENT AP Top 25, drawn from the already-fetched season events (never a
    limited date-range query - see season_events). [(event_id, iso_date,
    home_id, away_id, home_loc, away_loc, market_pH, kickoff_iso, neutral,
    spread)]."""
    d0 = today.isoformat()
    d1 = (today + timedelta(days=window_days)).isoformat()
    # quiet window (e.g. the preseason poll lands ten days before kickoff):
    # reach ahead to the first upcoming AP game and take its whole opening
    # slate (+9 days spans a Week-0-to-Labor-Day opening).
    dates = sorted(e["date"] for e in events
                   if not e["completed"] and e["date"] >= d0
                   and (e["home"] in ap_ranks or e["away"] in ap_ranks))
    if dates and dates[0] > d1:
        d1 = (date.fromisoformat(dates[0]) + timedelta(days=9)).isoformat()
    out = []
    for e in events:
        if e["completed"] or e["st"] not in (2, 3):
            continue  # CCG/CFP games join the slate once their teams are set
                      # (a TBD side never carries an AP rank, so they filter
                      # themselves out until then)
        if not (d0 <= e["date"] <= d1):
            continue
        if e["home"] not in ap_ranks and e["away"] not in ap_ranks:
            continue
        out.append((e["id"], e["date"], e["home"], e["away"],
                    e["hloc"], e["aloc"], e["mkt"],
                    kickoff_iso(e["kick"]), e["neutral"], e.get("spread")))
    out.sort(key=lambda g: (g[1], g[0]))
    return out


def load_meta_market():
    """{event_id: {"pH", "books", "sd_logodds"}} from cfb-meta-market.json.

    College football is THREE books, not four: Polymarket carries no college
    game markets. And in practice only two of the three POST a price -- ESPN's
    DraftKings block is spread-only for most college games, and a spread put
    through Phi is carried but never votes -- so the consensus here is usually
    FanDuel and Kalshi. That is still a better answer to "what does the market
    think" than one book alone, and the file says how many voted on each game.
    """
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
        row = {"pH": round(float(c["p_home"]), 4), "books": c.get("books"),
               "sd_logodds": c.get("sd_logodds")}
        if c.get("derived_only"):
            row["derived_only"] = True
        out[str(g.get("event_id"))] = row
    return out


def grade_and_extend(ledger, results_by_id, upcoming, rating_of, lite_rating_of,
                     classic_rating_of, today_iso, ap_ranks, poll_label,
                     poll_fresh, lookup, leverage_by_gid=None, id_by_name=None,
                     is_fbs=None, meta_by_gid=None):
    meta_by_gid = meta_by_gid or {}
    known = {e["event_id"] for e in ledger}
    kick_by_id = {u[0]: u[7] for u in upcoming if u[7]}
    leverage_by_gid = leverage_by_gid or {}
    id_by_name = id_by_name or {}
    for e in ledger:
        if e.get("result"):
            continue
        if kick_by_id.get(e["event_id"]):
            e["kickoff"] = kick_by_id[e["event_id"]]
        # lite.pH / classic.pH are new as of points-v3: a one-time backfill
        # onto entries frozen by an older build (no result exists yet to
        # protect, so this is not a freeze violation).
        hid = id_by_name.get(e.get("home"))
        aid = id_by_name.get(e.get("away"))
        hfa_g = 0.0 if e.get("neutral") else HFA
        # 🔴 A name that does not resolve to an FBS id is an FCS opponent, and
        # the model already holds exactly ONE rating for the whole FCS field
        # (state["r_fcs"], fitted from the pooled FCS results, not guessed).
        # Every *_rating_of does idx.get(tid, -1) -> -1 -> r_fcs, so passing the
        # unresolved name straight through lands on it.
        #
        # Until 2026-09-04 this backfill required BOTH sides to resolve, so six
        # preseason FBS-v-FCS entries carried `model` and no `lite`/`classic`.
        # That is not cosmetic: the Ledger derives each tier's skill from the
        # rows that carry it, so lite and classic were being scored on 19 games
        # while model was scored on 25, and a Brier comparison across different
        # game sets is not a comparison. One unresolved side is an FCS visitor;
        # BOTH unresolved is not a game this ledger has any business pricing
        # (the scope is AP Top 25), so it is still skipped.
        both_unknown = hid is None and aid is None
        if (hid is None) != (aid is None):
            e["fcs_opponent"] = True
        if lite_rating_of is not None and "lite" not in e and not both_unknown:
            e["lite"] = {"pH": round(home_win_prob(lite_rating_of(hid), lite_rating_of(aid),
                                                    hfa_g), 4), "backfilled": today_iso}
        if classic_rating_of is not None and "classic" not in e and not both_unknown:
            e["classic"] = {"pH": round(home_win_prob(classic_rating_of(hid), classic_rating_of(aid),
                                                       hfa_g), 4), "backfilled": today_iso}
        # The meta-market is new as of 2026-09-04. Backfilling it onto an
        # UNGRADED entry is not a freeze violation: the consensus written today
        # is today's price on a game nobody has played, not hindsight.
        mm = meta_by_gid.get(e["event_id"])
        if mm is not None and "meta_market" not in e:
            e["meta_market"] = dict(mm, backfilled=today_iso)
        # leverage is descriptive, not a frozen pick, so it refreshes every
        # run while the game is still upcoming.
        lev = leverage_by_gid.get(e["event_id"])
        if lev is not None:
            e["leverage"] = lev
        res = results_by_id.get(e["event_id"])
        if res:
            hs, as_ = res
            if hs == as_:
                e["result"] = "T"
                e["graded_at"] = today_iso
                continue
            hw = hs > as_
            e["result"] = "H" if hw else "A"
            e["score"] = "%d-%d" % (hs, as_)
            e["graded_at"] = today_iso
            e["model_brier"] = round(brier2(e["model"]["pH"], hw), 4)
            if e.get("market") is not None:
                e["market_brier"] = round(brier2(e["market"]["pH"], hw), 4)
            if e.get("lite") is not None:
                e["lite_brier"] = round(brier2(e["lite"]["pH"], hw), 4)
            if e.get("classic") is not None:
                e["classic_brier"] = round(brier2(e["classic"]["pH"], hw), 4)
            if e.get("meta_market") is not None:
                e["meta_brier"] = round(brier2(e["meta_market"]["pH"], hw), 4)
            b = e.get("blend") or e["model"]
            e["blend_brier"] = round(brier2(b["pH"], hw), 4)
            e["pick_correct"] = (e["pick"] == e["result"])
    if not poll_fresh:
        ledger.sort(key=lambda e: (e["date"], e["home"]))
        return ledger
    for gid, iso, h, a, hloc, aloc, mkt_ph, kick, neutral, spread in upcoming:
        if gid in known:
            continue
        hfa = 0.0 if neutral else HFA
        ph = round(home_win_prob(rating_of(h), rating_of(a), hfa), 4)
        entry = {
            "event_id": gid, "date": iso, "home": hloc, "away": aloc,
            "home_slug": page_slug_for(hloc, lookup),
            "away_slug": page_slug_for(aloc, lookup),
            "ap": {"home": ap_ranks.get(h), "away": ap_ranks.get(a)},
            "week": poll_label,
            "model": {"pH": ph}, "predicted_at": today_iso,
        }
        if neutral:
            entry["neutral"] = True
        if kick:
            entry["kickoff"] = kick
        if lite_rating_of is not None:
            entry["lite"] = {"pH": round(home_win_prob(lite_rating_of(h), lite_rating_of(a), hfa), 4)}
        if classic_rating_of is not None:
            entry["classic"] = {"pH": round(home_win_prob(classic_rating_of(h), classic_rating_of(a), hfa), 4)}
        # Marked at creation as well as on backfill, so the Ledger can say why a
        # 99% call was never going to separate the tiers.
        if is_fbs is not None and (is_fbs(h) != is_fbs(a)):
            entry["fcs_opponent"] = True
        mm = meta_by_gid.get(gid)
        if mm is not None:
            entry["meta_market"] = dict(mm)
        if mkt_ph is not None:
            entry["market"] = {"pH": mkt_ph}
            if spread is not None:
                entry["market"]["spread"] = spread
            entry["blend"] = {"pH": round(MATCH_BLEND_W * mkt_ph + (1 - MATCH_BLEND_W) * ph, 4)}
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
    gm = [e for e in g if "market_brier" in e]
    rec["market_graded"] = len(gm)
    rec["market_brier"] = round(sum(e["market_brier"] for e in gm) / len(gm), 4) if gm else None
    # 🔴 Every tier reports its OWN graded count beside its own Brier, because
    # the sets genuinely differ and a Brier without its denominator invites the
    # comparison the sets cannot support. The 2026-09-04 FCS fix stopped the
    # gap growing, but it cannot close the one entry already graded before the
    # tiers existed (San José State at USC, 2026-08-29): backfilling a price
    # onto a game that has been played is hindsight, so that entry keeps model
    # only, for good. /predictions/scoreboard already derives tier skill over
    # the intersection of tier-and-market-priced rows; these counts are so the
    # raw file cannot be read carelessly either.
    gl = [e for e in g if "lite_brier" in e]
    rec["lite_graded"] = len(gl)
    rec["lite_brier"] = round(sum(e["lite_brier"] for e in gl) / len(gl), 4) if gl else None
    gc = [e for e in g if "classic_brier" in e]
    rec["classic_graded"] = len(gc)
    rec["classic_brier"] = round(sum(e["classic_brier"] for e in gc) / len(gc), 4) if gc else None
    gmm = [e for e in g if "meta_brier" in e]
    rec["meta_graded"] = len(gmm)
    rec["meta_brier"] = round(sum(e["meta_brier"] for e in gmm) / len(gmm), 4) if gmm else None
    rec["fcs_opponent_games"] = sum(1 for e in ledger if e.get("fcs_opponent"))
    return rec


# -------------------------------------------------------------------- build

def prepare_state(fbs_ids, id_list, conf_of, events):
    """Base records + remaining schedule arrays from the 2026 events."""
    idx = {t: i for i, t in enumerate(id_list)}
    n = len(id_list)
    reg_wins = [0] * n
    losses = [0] * n
    conf_w = [0] * n
    conf_l = [0] * n
    h2h = {}
    remaining = []
    fixed_ccg = {}
    gp = defaultdict(int)
    warn = []
    full_sched = []  # (gid, date) for every non-CCG FBS-touching regular-
                     # season game, played or not -- fixed CRN index space
                     # (see simulate()'s docstring on why it never shrinks)
    for e in events:
        if e["st"] != 2:
            continue  # bowls/CFP never enter the season sim
        hi = idx.get(e["home"], -1)
        ai = idx.get(e["away"], -1)
        if hi < 0 and ai < 0:
            continue
        if not is_ccg(e):
            full_sched.append((e["id"], e["date"]))
        if is_ccg(e):
            if e["completed"] and hi >= 0 and ai >= 0 and e["hs"] is not None:
                conf = conf_of.get(e["home"])
                w, l = (hi, ai) if e["hs"] > e["as"] else (ai, hi)
                if conf and conf == conf_of.get(e["away"]):
                    fixed_ccg[conf] = (w, l)
                # a completed CCG counts in the overall record
                reg_wins[w] += 1
                losses[l] += 1
                gp[id_list[w]] += 1
                gp[id_list[l]] += 1
            continue  # scheduled CCGs are simulated, never pre-booked
        cf = bool(e["conf_game"] and hi >= 0 and ai >= 0
                  and conf_of.get(e["home"]) == conf_of.get(e["away"])
                  and conf_of.get(e["home"]) != "Independents")
        if e["completed"] and e["hs"] is not None and e["as"] is not None:
            hwin = e["hs"] > e["as"]
            if e["hs"] == e["as"]:
                warn.append("tied game %s ignored" % e["id"])
                continue
            w, l = (hi, ai) if hwin else (ai, hi)
            if w >= 0:
                reg_wins[w] += 1
                gp[id_list[w]] += 1
            if l >= 0:
                losses[l] += 1
                gp[id_list[l]] += 1
            if cf:
                conf_w[w] += 1
                conf_l[l] += 1
                h2h[(w, l)] = h2h.get((w, l), 0) + 1
        else:
            remaining.append((e["id"], hi, ai, 0.0 if e["neutral"] else HFA, cf))
    conf_members = defaultdict(list)
    for t in id_list:
        c = conf_of.get(t)
        if c and c != "Independents":
            conf_members[c].append(idx[t])
    for c, members in conf_members.items():
        if len(members) < 2:
            raise SystemExit("conference %s has %d members" % (c, len(members)))
    ccg_neutral = {c: (c not in CCG_HOME_HOSTED) for c in conf_members}
    full_sched.sort(key=lambda g: (g[1], g[0]))
    gid_pos = {gid: i for i, (gid, _d) in enumerate(full_sched)}
    return {
        "n": n, "idx": idx, "remaining": remaining,
        "conf_members": dict(conf_members), "fixed_ccg": fixed_ccg,
        "ccg_neutral": ccg_neutral, "r_fcs": None,  # set by caller
        "reg_wins": reg_wins, "losses": losses,
        "conf_w": conf_w, "conf_l": conf_l, "h2h": h2h,
        "gid_pos": gid_pos, "n_full": len(full_sched),
    }, dict(gp), warn


def reconcile_records(season, events, ids):
    """Derived W-L per team vs the standings endpoint. Returns mismatches."""
    wins = defaultdict(int)
    losses = defaultdict(int)
    for e in events:
        if not e["completed"] or e["hs"] is None or e["as"] is None or e["hs"] == e["as"]:
            continue
        w, l = (e["home"], e["away"]) if e["hs"] > e["as"] else (e["away"], e["home"])
        if w in ids:
            wins[w] += 1
        if l in ids:
            losses[l] += 1
    ref = standings_records(season)
    bad = []
    for t in ids:
        if t not in ref:
            continue
        rw, rl = ref[t]
        if wins[t] != rw or losses[t] != rl:
            bad.append((t, wins[t], losses[t], rw, rl))
    return bad


def build(sims, today=None):
    today = today or date.today()
    today_iso = today.isoformat()
    lookup = load_slug_lookup()

    confs, names = fbs_membership(SEASON)
    conf_of = {t: c for c, ts in confs.items() for t in ts}
    fbs_ids = set(conf_of)
    if not (120 <= len(fbs_ids) <= 145):
        raise SystemExit("2026 FBS membership looks wrong: %d teams" % len(fbs_ids))
    # All ten 2026 FBS conferences, by name - a missing league means a naming
    # or nesting change upstream, and simulating nine title games for ten
    # leagues is exactly the failure the MAC/American substring bug caused.
    expected = {"SEC", "Big Ten", "Big 12", "ACC", "American", "MAC",
                "Mountain West", "Sun Belt", "Conference USA", "Pac-12"}
    real_confs = set(confs) - {"Independents"}
    if real_confs != expected:
        raise SystemExit("conference set drifted: missing %s, extra %s"
                         % (sorted(expected - real_confs), sorted(real_confs - expected)))
    for c, ts in confs.items():
        if c != "Independents" and not (6 <= len(ts) <= 18):
            raise SystemExit("conference %s has %d teams" % (c, len(ts)))
    id_list = sorted(fbs_ids, key=lambda t: names.get(t, t))

    # historical ratings (opponent-adjusted margins, three seasons)
    seasons_events, seasons_ids = {}, {}
    for season, _w in STRENGTH_SEASONS:
        s_confs, s_names = fbs_membership(season)
        s_ids = {t for ts in s_confs.values() for t in ts}
        evs = season_events(season)
        played = [e for e in evs if e["completed"]]
        if len(played) < 600:
            raise SystemExit("season %d: only %d completed games fetched" % (season, len(played)))
        bad = reconcile_records(season, evs, s_ids)
        if len(bad) > 2:
            for t, w, l, rw, rl in bad[:12]:
                print("  RECONCILE %d %s: derived %d-%d vs standings %d-%d"
                      % (season, s_names.get(t, t), w, l, rw, rl))
            raise SystemExit("season %d: %d teams disagree with the standings" % (season, len(bad)))
        for t, w, l, rw, rl in bad:
            print("  note: %d %s derived %d-%d vs standings %d-%d (tolerated)"
                  % (season, s_names.get(t, t), w, l, rw, rl))
        seasons_events[season], seasons_ids[season] = evs, s_ids
    r_hist, per_season = historical_ratings(seasons_events, seasons_ids, id_list)

    # 2026 events + current-season fold
    events = season_events(SEASON)
    events, repaired = backfill_short_schedules(events, id_list, names,
                                                conf_of, SEASON)
    state, gp, warns = prepare_state(fbs_ids, id_list, conf_of, events)
    for w in warns:
        print("  warn:", w)
    cur_games = pool_fcs([e for e in events if e["st"] == 2 and not is_ccg(e)], fbs_ids)
    if cur_games:
        r_stats = solve_srs(cur_games, set(id_list), prior=r_hist, prior_w=6.0)
    else:
        r_stats = dict(r_hist)
    r_fcs_hist = [solve_srs(pool_fcs(seasons_events[s], seasons_ids[s]),
                            seasons_ids[s])[FCS] for s, _ in STRENGTH_SEASONS]
    state["r_fcs"] = sum(r_fcs_hist) / len(r_fcs_hist)

    # schedule sanity: every FBS team should hold MIN_TEAM_GAMES+ games
    # (played + remaining), counted AFTER the backfill above. Still a hard
    # exit, deliberately: the floor is not relaxed to paper over a gap, the
    # gap is repaired from a second source and then re-checked.
    per_team_games = defaultdict(int)
    for _gid, hi, ai, _hfa, _cf in state["remaining"]:
        if hi >= 0:
            per_team_games[hi] += 1
        if ai >= 0:
            per_team_games[ai] += 1
    for i, t in enumerate(id_list):
        total = per_team_games[i] + state["reg_wins"][i] + state["losses"][i]
        if total < MIN_TEAM_GAMES:
            raise SystemExit(
                "schedule gap: %s has only %d games (backfill from its own "
                "schedule endpoint did not lift it over %d)"
                % (names[t], total, MIN_TEAM_GAMES))
        if total > 14:
            print("  note: %s carries %d games" % (names[t], total))

    # priors: futures + AP poll through the model's own rating->natty curve
    ratings_list = [r_stats[t] for t in id_list]
    pre = simulate(state, ratings_list, CALIB_SIMS, seed=99, natty_only=True)["acc"]
    pairs = []
    for i, t in enumerate(id_list):
        p = pre[i]["natty"] / CALIB_SIMS
        if p > 0:
            pairs.append((_logodds(p), r_stats[t]))
    curve = _fit_rating_from_logodds(pairs) if len(pairs) >= 15 else (0.0, 0.0)

    mkt_probs, mkt_provider = fetch_title_futures(fbs_ids)
    poll_pts, ap_ranks_by_id, poll_label, poll_date = fetch_ap_poll()
    market_note = "model-only (no futures available)"
    if curve[1] > 0 and (mkt_probs or poll_pts):
        parts = []
        if mkt_probs:
            parts.append("%s futures w %.2f (%d teams)"
                         % (mkt_provider or "book", W_MARKET, len(mkt_probs)))
        if poll_pts:
            parts.append("AP poll w %.2f (%d teams)" % (W_POLL, len(poll_pts)))
        market_note = "blended: " + ", ".join(parts)

    # tier ratings: lite = stats only; classic = stats + market (no poll);
    # deluxe = current production (stats + market + AP poll, unchanged).
    r_lite = dict(r_stats)
    r_classic = blend_priors(r_stats, curve, mkt_probs or {}, {}, gp)
    r_deluxe = blend_priors(r_stats, curve, mkt_probs or {}, poll_pts or {}, gp)
    ratings = r_deluxe
    ratings_list_lite = [r_lite[t] for t in id_list]
    ratings_list_classic = [r_classic[t] for t in id_list]
    ratings_list = [r_deluxe[t] for t in id_list]

    # market-implied ratings from posted spreads (this window + the ledger's
    # recent history), ridge-regularized toward a futures-only rating (or
    # the stats rating when no futures are available). Used to (a) widen a
    # team's adaptive sigma where stats and market disagree, and (b) report
    # rating_stats/rating_market on the table -- NOT to build the tier
    # blends above, which stay on the existing market-probability pipeline.
    r_futures = None
    if mkt_probs and curve[1] > 0:
        raw = {t: curve[0] + curve[1] * _logodds(mkt_probs.get(t, MKT_MIN_PROB))
               for t in id_list}
        mean = sum(raw.values()) / len(raw)
        r_futures = {t: v - mean for t, v in raw.items()}

    id_by_name = {v: k for k, v in names.items()}
    win_start = today.isoformat()
    win_end = (today + timedelta(days=WINDOW_DAYS)).isoformat()
    spread_obs = []
    for e in events:
        if e["completed"] or e["st"] != 2 or is_ccg(e):
            continue
        if not (win_start <= e["date"] <= win_end):
            continue
        sp = e.get("spread")
        if sp is not None and e["home"] in fbs_ids and e["away"] in fbs_ids:
            spread_obs.append((e["home"], e["away"], sp, e["neutral"]))
    existing_ledger_for_spreads = []
    if os.path.exists(OUT_PRED):
        try:
            existing_ledger_for_spreads = json.load(io.open(OUT_PRED, encoding="utf-8")).get("ledger", [])
        except Exception:
            existing_ledger_for_spreads = []
    for e in existing_ledger_for_spreads:
        sp = (e.get("market") or {}).get("spread")
        if sp is None:
            continue
        h, a = id_by_name.get(e.get("home")), id_by_name.get(e.get("away"))
        if h is None or a is None:
            continue
        try:
            d = date.fromisoformat(str(e.get("date"))[:10])
        except (TypeError, ValueError):
            continue
        age = (today - d).days
        if 0 <= age <= SPREAD_LOOKBACK_DAYS:
            spread_obs.append((h, a, sp, bool(e.get("neutral"))))

    spread_prior = r_futures if r_futures is not None else r_stats
    r_spread, n_spread_obs = sc.implied_ratings_from_spreads(
        spread_obs, spread_prior, lam=SPREAD_LAMBDA, hfa=HFA, sweeps=200)
    if n_spread_obs >= SPREAD_MIN_OBS:
        r_market = r_spread
        market_ratings_kind = "futures+spreads"
    elif r_futures is not None:
        r_market = r_futures
        market_ratings_kind = "futures"
    else:
        r_market = None
        market_ratings_kind = "none"

    # adaptive sigma: league-wide from games remaining, widened per team by
    # stats/market disagreement.
    schedule_games_total = len(state["remaining"]) + sum(state["reg_wins"])
    frac_left = (len(state["remaining"]) / float(schedule_games_total)
                if schedule_games_total else 1.0)
    sigma_base = sc.adaptive_sigma(frac_left, SIGMA_SEASON, SIGMA_FLOOR_FRAC)
    sigma_team_dict = {
        i: sc.team_sigma(sigma_base, r_stats[t],
                         r_market[t] if r_market is not None else None, DISAGREE_K)
        for i, t in enumerate(id_list)
    }

    # ledger's upcoming AP window, computed ahead of the main sim so leverage
    # can be collected for exactly those games.
    ap_set = {t: rk for t, rk in ap_ranks_by_id.items() if rk and rk <= 25}
    poll_fresh = bool(poll_date) and (today - date.fromisoformat(poll_date)).days <= POLL_MAX_AGE_DAYS
    upcoming = upcoming_ap_games(events, today, WINDOW_DAYS, ap_set) if ap_set else []
    window_gids = {u[0] for u in upcoming}

    lite_run = simulate(state, ratings_list_lite, TIER_SIMS, seed=SEASON,
                        sigma_team=sigma_team_dict)
    classic_run = simulate(state, ratings_list_classic, TIER_SIMS, seed=SEASON,
                           sigma_team=sigma_team_dict)
    deluxe_run = simulate(state, ratings_list, sims, seed=SEASON,
                          sigma_team=sigma_team_dict, window_gids=window_gids)
    acc = deluxe_run["acc"]

    games_played = sum(state["reg_wins"]) + 0  # every win is one played game
    table = []
    for i, t in enumerate(id_list):
        a = acc[i]
        p10 = sc.percentiles(deluxe_run["win_lists"][i], 10)
        p90 = sc.percentiles(deluxe_run["win_lists"][i], 90)
        p_playoff = round(100.0 * a["playoff"] / sims, 2)
        table.append({
            "espn_id": t,
            "name": CANONICAL_OVERRIDE.get(names[t], names[t]),
            "slug": page_slug_for(names[t], lookup),
            "conference": conf_of[t],
            # Tier split mirrors lib/cfb-live.ts: Notre Dame sits with the
            # Power 4, every other independent with the Group of 5.
            "power4": conf_of[t] in ("SEC", "Big Ten", "Big 12", "ACC")
                      or names[t] == "Notre Dame",
            "rating": round(ratings[t], 2),
            "rating_stats": round(r_stats[t], 2),
            "rating_market": round(r_market[t], 2) if r_market is not None else None,
            "sigma_team": round(sigma_team_dict[i], 2),
            "exp_wins": round(a["reg_wins"] / sims, 1),
            "wins_p10": round(p10, 1) if p10 is not None else None,
            "wins_p90": round(p90, 1) if p90 is not None else None,
            "p_ccg": round(100.0 * a["ccg"] / sims, 2),
            "p_conf": round(100.0 * a["conf"] / sims, 2),
            "p_playoff": p_playoff,
            "p_bye": round(100.0 * a["bye"] / sims, 2),
            "p_natty": round(100.0 * a["natty"] / sims, 2),
            "p_bubble": round(100.0 * deluxe_run["bubble"].get(i, 0) / sims, 2),
            "band": sc.band_for(p_playoff),
            "ap_rank": ap_ranks_by_id.get(t),
        })
    table.sort(key=lambda r: (-r["p_natty"], -r["p_playoff"], -r["exp_wins"]))
    s = sum(r["p_natty"] for r in table)
    assert abs(s - 100.0) < 1.0, "p_natty sums to %.2f" % s
    s = sum(r["p_playoff"] for r in table)
    assert abs(s - 1200.0) < 12.0, "p_playoff sums to %.2f" % s
    s = sum(r["p_conf"] for r in table)
    n_confs = len(state["conf_members"])
    assert abs(s - 100.0 * n_confs) < n_confs * 1.0, "p_conf sums to %.2f" % s
    unresolved = [r["name"] for r in table if not r["slug"]]
    if unresolved:
        print("  unlinked on the page (%d): %s" % (len(unresolved), ", ".join(unresolved)))

    def tier_rows(run, n):
        rows = {}
        for i, t in enumerate(id_list):
            a = run["acc"][i]
            slug = page_slug_for(names[t], lookup) or t
            rows[slug] = {
                "exp_wins": round(a["reg_wins"] / n, 1),
                "p_ccg": round(100.0 * a["ccg"] / n, 2),
                "p_conf": round(100.0 * a["conf"] / n, 2),
                "p_playoff": round(100.0 * a["playoff"] / n, 2),
                "p_bye": round(100.0 * a["bye"] / n, 2),
                "p_natty": round(100.0 * a["natty"] / n, 2),
            }
        return rows

    tiers = {"lite": tier_rows(lite_run, TIER_SIMS),
             "classic": tier_rows(classic_run, TIER_SIMS),
             "deluxe": tier_rows(deluxe_run, sims)}
    corr_team_sd = round(sum(sc.layer_residual_sd(v, CONF_SD) for v in sigma_team_dict.values())
                         / len(sigma_team_dict), 2)

    sim_doc = {
        "meta": {
            "league": "cfb", "season": SEASON,
            "title_game": "2026 CFP National Championship",
            "generated_at": today_iso, "sims": sims, "model": "points-v3",
            "seed": SEASON,
            "hfa": HFA, "sigma_game": SIGMA_GAME, "sigma_season": SIGMA_SEASON,
            "sigma_season_eff": round(sigma_base, 2),
            "corr": {"hfa_sd": HFA_SD, "conf_sd": CONF_SD, "team_sd": corr_team_sd},
            "regress": REGRESS, "k_rec": K_REC,
            "strength_seasons": [s for s, _ in STRENGTH_SEASONS],
            "market": market_note,
            "market_weight": W_MARKET, "poll_weight": W_POLL,
            "market_ratings": market_ratings_kind,
            "tiers": ["lite", "classic", "deluxe"],
            "poll": {"label": poll_label, "date": poll_date},
            "conferences": sorted(state["conf_members"]),
            "teams": len(id_list),
            "schedule_games": len(state["remaining"]) + games_played,
            "games_played": games_played,
            # non-empty only when the scoreboard under-indexed a team and its
            # own schedule endpoint filled the gap - a silent repair would
            # hide an upstream ESPN problem that is worth seeing in the data
            "schedule_backfill": [
                {"team": names.get(t, t), "scoreboard": before, "after": after}
                for t, before, after in repaired
            ],
            "source": "ESPN FBS standings, schedules, AP poll, posted lines + national-title futures",
            "notes": "Opponent-adjusted margins (three seasons, FCS pooled) blended with "
                     "futures- and AP-poll-implied ratings; the real FBS schedule, all ten "
                     "conference title games and the 12-team straight-seeded playoff "
                     "simulated with correlated per-team/conference/HFA season noise and "
                     "common random numbers. Conference tie-breaks approximated (record, "
                     "then head-to-head); the selection committee is modeled as rating "
                     "plus record, a stated proxy.",
        },
        "table": table,
        "tiers": tiers,
    }

    hist_rows = {r["slug"]: {
        "xw": round(r["exp_wins"], 1),
        "po": round(r["p_playoff"], 1),
        "conf": round(r["p_conf"], 1),
        "title": round(r["p_natty"], 1),
    } for r in table if r["slug"]}
    hist_doc = None
    if os.path.exists(OUT_HIST):
        try:
            hist_doc = json.load(io.open(OUT_HIST, encoding="utf-8"))
        except Exception:
            hist_doc = None
    hist_doc = sc.upsert_snapshot(hist_doc, today_iso, games_played, hist_rows,
                                  "cfb", SEASON, HISTORY_KEEP)

    ledger = []
    if os.path.exists(OUT_PRED):
        try:
            ledger = json.load(io.open(OUT_PRED, encoding="utf-8")).get("ledger", [])
        except Exception:
            ledger = []
    results_by_id = {e["id"]: (e["hs"], e["as"]) for e in events
                     if e["completed"] and e["hs"] is not None and e["as"] is not None}
    idx = state["idx"]

    def rating_of(tid):
        i = idx.get(tid, -1)
        return ratings_list[i] if i >= 0 else state["r_fcs"]

    def lite_rating_of(tid):
        i = idx.get(tid, -1)
        return ratings_list_lite[i] if i >= 0 else state["r_fcs"]

    def classic_rating_of(tid):
        i = idx.get(tid, -1)
        return ratings_list_classic[i] if i >= 0 else state["r_fcs"]

    ledger = grade_and_extend(ledger, results_by_id, upcoming, rating_of,
                              lite_rating_of, classic_rating_of, today_iso,
                              ap_set, poll_label, poll_fresh, lookup,
                              leverage_by_gid=deluxe_run["leverage"],
                              id_by_name=id_by_name,
                              is_fbs=lambda tid: idx.get(tid, -1) >= 0,
                              meta_by_gid=load_meta_market())
    pred_doc = {
        "meta": {"season": SEASON, "generated_at": today_iso,
                 "match_blend_weight": MATCH_BLEND_W, "horizon_days": WINDOW_DAYS,
                 "scope": "games involving AP Top 25 teams only",
                 "tiers": ["lite", "classic", "market", "blend"],
                 "poll": {"label": poll_label, "date": poll_date, "fresh": poll_fresh},
                 "odds_source": "ESPN posted lines (moneyline, else spread)",
                 "results_source": "ESPN final scores"},
        "record": ledger_record(ledger),
        "ledger": ledger,
    }
    return sim_doc, pred_doc, hist_doc


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []
    total = [0]

    def check(name, cond):
        total[0] += 1
        if not cond:
            fails.append(name)

    check("phi-mid", abs(phi(0.0) - 0.5) < 1e-9)
    p = home_win_prob(4.0, -4.0)
    check("winprob-favourite", 0.70 < p < 0.80)
    check("winprob-neutral", abs(home_win_prob(0, 0, 0.0) - 0.5) < 1e-9)

    # conference ordering: pct beats raw wins; h2h breaks full ties
    rng = random.Random(3)
    cw = {0: 7, 1: 6, 2: 6, 3: 1}
    cl = {0: 2, 1: 2, 2: 2, 3: 7}
    h2h = {(2, 1): 1}
    order = order_conference([0, 1, 2, 3], cw, cl, h2h, rng)
    check("conf-order", order[0] == 1 or order[0] == 2 or order[0] == 0)
    check("conf-h2h", order.index(2) < order.index(1))
    check("conf-pct", order[0] == 0 or (cw[order[0]] / (cw[order[0]] + cl[order[0]])) >=
          (cw[0] / (cw[0] + cl[0])) - 1e-9)

    # committee: five champs auto even from outside the top 12; straight seeding
    rng = random.Random(4)
    scores = {i: 100.0 - i for i in range(30)}          # 0 strongest
    champs = {0, 5, 20, 25, 28}                          # three weak champs
    seeds, first_out = committee_field(scores, champs, rng)
    check("field-size", len(seeds) == 12)
    check("field-champs-in", champs <= set(seeds))
    check("field-straight", seeds == sorted(seeds, key=lambda i: -scores[i]))
    check("field-at-large", 1 in seeds and 2 in seeds)   # best non-champs in
    check("field-bumped", 9 not in seeds or len([c for c in champs if scores[c] < scores[9]]) < 3)
    check("field-first-out", first_out is not None and first_out not in set(seeds)
          and scores[first_out] == max(scores[i] for i in scores if i not in set(seeds)))

    # bracket: strongest ratings should win most; runs to one champion
    rng = random.Random(5)
    r = {i: (30.0 - 3 * i) for i in range(12)}
    wins = defaultdict(int)
    def sg(rh, ra, hfa):
        return rng.random() < home_win_prob(rh, ra, hfa)
    for _ in range(400):
        wins[run_cfp(list(range(12)), r, rng, sg)] += 1
    check("cfp-favourite", wins[0] == max(wins.values()))
    check("cfp-total", sum(wins.values()) == 400)

    # log-odds fit + blend direction
    a, b = _fit_rating_from_logodds([(-3.0, -3.0), (-2.0, -1.0), (-1.0, 1.0), (0.0, 3.0)])
    check("lofit", abs(b - 2.0) < 1e-9 and abs(a - 3.0) < 1e-9)
    ratings = {"A": 0.0, "B": 0.0, "C": 0.0}
    blended = blend_priors(ratings, (0.0, 2.0), {"A": 0.4, "B": 0.05, "C": 0.05},
                           {"A": 900.0, "B": 100.0}, {})
    check("blend-favourite-up", blended["A"] > blended["B"] and blended["A"] > blended["C"])

    # prior fade: a team with a full season played takes almost no prior
    gp = {"A": 12, "B": 0}
    faded = blend_priors({"A": 0.0, "B": 0.0}, (0.0, 2.0),
                         {"A": 0.9, "B": 0.9}, {}, gp)
    check("prior-fades", faded["A"] < faded["B"])

    # conference naming: exact match, never substring (the MAC/American trap)
    check("conf-short-mac", conf_short("Mid-American Conference") == "MAC")
    check("conf-short-aac", conf_short("American Conference") == "American"
          and conf_short("American Athletic Conference") == "American")
    check("conf-short-sec", conf_short("Southeastern Conference") == "SEC")
    check("conf-short-fallback", conf_short("Big Sky Conference") == "Big Sky")

    # CCG identification + slug mapping
    check("is-ccg", is_ccg({"note": "Big Ten Championship", "st": 2})
          and not is_ccg({"note": "Big Ten Championship", "st": 3})
          and not is_ccg({"note": "", "st": 2}))
    lookup = {name_key("Miami FL"): "miami-fl-cfb", name_key("Ohio State"): "ohio-state-cfb",
              name_key("San Jose State"): "san-jose-state-cfb"}
    check("slug-override", page_slug_for("Miami", lookup) == "miami-fl-cfb")
    check("slug-plain", page_slug_for("Ohio State", lookup) == "ohio-state-cfb")
    check("slug-accent", page_slug_for("San José State", lookup) == "san-jose-state-cfb")
    check("slug-miss", page_slug_for("Nowhere A&M", lookup) is None)

    # grading: home win graded, tie voids, poll gate blocks new entries
    led = [{"event_id": "1", "date": "2026-09-12", "home": "Ohio State", "away": "Texas",
            "home_slug": "ohio-state-cfb", "away_slug": "texas-cfb",
            "model": {"pH": 0.7}, "pick": "H", "predicted_at": "2026-09-08"},
           {"event_id": "2", "date": "2026-09-12", "home": "Georgia", "away": "Alabama",
            "home_slug": "georgia-cfb", "away_slug": "alabama-cfb",
            "model": {"pH": 0.5}, "pick": "H", "predicted_at": "2026-09-08"}]
    graded = grade_and_extend(led, {"1": (31, 17), "2": (20, 20)}, [],
                              lambda t: 0.0, lambda t: 0.0, lambda t: 0.0,
                              "2026-09-13", {}, "Week 3", True, {})
    by_id = {e["event_id"]: e for e in graded}
    check("grade-win", by_id["1"]["pick_correct"] is True
          and abs(by_id["1"]["model_brier"] - 0.18) < 1e-9)
    check("grade-tie", by_id["2"]["result"] == "T" and "model_brier" not in by_id["2"])
    rec = ledger_record(graded)
    check("record-skips-tie", rec["graded"] == 1)
    up = [("3", "2026-09-19", "194", "333", "Ohio State", "Alabama", 0.55,
           "2026-09-19T19:30:00Z", False, -3.5)]
    stale = grade_and_extend(list(graded), {}, up, lambda t: 0.0, lambda t: 0.0,
                             lambda t: 0.0, "2026-09-14", {"194": 1}, "Week 3", False, {})
    check("poll-gate-blocks", all(e["event_id"] != "3" for e in stale))
    fresh = grade_and_extend(list(graded), {}, up, lambda t: 2.0 if t == "194" else 0.0,
                             lambda t: 1.0 if t == "194" else 0.0,
                             lambda t: 1.5 if t == "194" else 0.0,
                             "2026-09-14", {"194": 1}, "Week 3", True, {})
    e3 = next(e for e in fresh if e["event_id"] == "3")
    check("poll-gate-adds", e3["ap"]["home"] == 1 and e3["ap"]["away"] is None
          and e3["kickoff"] == "2026-09-19T19:30:00Z" and e3["week"] == "Week 3")
    check("blend-pick", e3["pick"] == "H" and abs(e3["blend"]["pH"] -
          (0.5 * 0.55 + 0.5 * e3["model"]["pH"])) < 1e-4)
    check("tier-fields-at-creation", "lite" in e3 and "classic" in e3
          and "backfilled" not in e3["lite"] and "backfilled" not in e3["classic"])
    check("spread-carried", e3["market"]["spread"] == -3.5)

    # lite/classic backfill onto a pre-points-v3 frozen entry (no result yet,
    # so the freeze is not violated), plus lite_brier/classic_brier grading
    old = [{"event_id": "9", "date": "2026-09-12", "home": "Ohio State", "away": "Texas",
            "home_slug": "ohio-state-cfb", "away_slug": "texas-cfb",
            "model": {"pH": 0.7}, "pick": "H", "predicted_at": "2026-09-08"}]
    id_by_name = {"Ohio State": "194", "Texas": "251"}
    backfilled = grade_and_extend(old, {}, [], lambda t: 0.0,
                                  lambda t: 1.0 if t == "194" else -1.0,
                                  lambda t: 0.5 if t == "194" else -0.5,
                                  "2026-09-10", {}, "Week 3", True, {},
                                  id_by_name=id_by_name)
    e9 = backfilled[0]
    check("lite-backfilled", e9["lite"].get("backfilled") == "2026-09-10")
    check("classic-backfilled", e9["classic"].get("backfilled") == "2026-09-10")
    graded9 = grade_and_extend(backfilled, {"9": (31, 17)}, [], lambda t: 0.0,
                               lambda t: 0.0, lambda t: 0.0, "2026-09-13", {}, "Week 3", True, {})
    e9g = graded9[0]
    check("lite-brier-graded", "lite_brier" in e9g and "classic_brier" in e9g)
    rec9 = ledger_record(graded9)
    check("record-lite-classic-brier", rec9["lite_brier"] is not None
          and rec9["classic_brier"] is not None)

    # An FCS visitor resolves to no FBS id. It must still be priced by every
    # tier, from the pooled FCS rating, or the tiers end up scored on different
    # game sets and their Brier scores stop being comparable (2026-09-04).
    fcs = [{"event_id": "11", "date": "2026-09-12", "home": "Ohio State",
            "away": "Furman", "home_slug": "ohio-state-cfb", "away_slug": None,
            "model": {"pH": 0.99}, "pick": "H", "predicted_at": "2026-09-08"}]
    fcs_out = grade_and_extend(fcs, {}, [], lambda t: 0.0,
                               lambda t: 20.0 if t == "194" else -18.0,
                               lambda t: 18.0 if t == "194" else -18.0,
                               "2026-09-10", {}, "Week 3", True, {},
                               id_by_name={"Ohio State": "194"})
    e11 = fcs_out[0]
    check("fcs-tiers-backfilled", "lite" in e11 and "classic" in e11)
    check("fcs-priced-from-the-pooled-rating", e11["lite"]["pH"] > 0.95)
    check("fcs-opponent-marked", e11.get("fcs_opponent") is True)

    # Two unresolved names is not an FBS-v-FCS game, it is a resolution failure,
    # and pricing it 50/50 would be worse than leaving it alone.
    ghost = [{"event_id": "12", "date": "2026-09-12", "home": "Nowhere A&M",
              "away": "Furman", "home_slug": None, "away_slug": None,
              "model": {"pH": 0.5}, "pick": "H", "predicted_at": "2026-09-08"}]
    ghost_out = grade_and_extend(ghost, {}, [], lambda t: 0.0, lambda t: 0.0,
                                 lambda t: 0.0, "2026-09-10", {}, "Week 3", True, {},
                                 id_by_name={"Ohio State": "194"})
    check("both-sides-unresolved-still-skipped",
          "lite" not in ghost_out[0] and "fcs_opponent" not in ghost_out[0])

    # leverage refreshes on an ungraded entry every run
    lev_entry = [{"event_id": "10", "date": "2026-09-19", "home": "Ohio State",
                 "away": "Texas", "home_slug": "ohio-state-cfb", "away_slug": "texas-cfb",
                 "model": {"pH": 0.6}, "pick": "H", "predicted_at": "2026-09-08"}]
    lev_out = grade_and_extend(lev_entry, {}, [], lambda t: 0.0, lambda t: 0.0,
                               lambda t: 0.0, "2026-09-14", {}, "Week 3", True, {},
                               leverage_by_gid={"10": {"home": 5.0, "away": -2.0, "game": 3.0}})
    check("leverage-refreshed", lev_out[0]["leverage"]["game"] == 3.0)

    # kickoff parsing
    check("kickoff-iso", kickoff_iso("2026-08-29T16:00Z") == "2026-08-29T16:00:00Z"
          and kickoff_iso("garbage") is None and kickoff_iso(None) is None)

    # a tiny end-to-end sim: two 2-team conferences, champ auto-bids hold
    ids = ["a", "b", "c", "d"]
    conf_of = {"a": "East", "b": "East", "c": "West", "d": "West"}
    events = []
    eid = 0
    for h, a2 in [("a", "b"), ("c", "d"), ("a", "c"), ("b", "d"),
                  ("a", "d"), ("b", "c")]:
        eid += 1
        events.append({"id": str(eid), "date": "2026-10-01", "kick": "",
                       "week": eid, "st": 2, "home": h, "away": a2,
                       "hs": None, "as": None, "completed": False,
                       "neutral": False,
                       "conf_game": conf_of[h] == conf_of[a2], "note": ""})
    state, gp2, _ = prepare_state(set(ids), ids, conf_of, events)
    state["r_fcs"] = -18.0
    check("prepare-state-gid-index", state["n_full"] == 6 and len(state["gid_pos"]) == 6)
    run = simulate(state, [8.0, 0.0, 0.0, -8.0], 400, seed=7)
    acc = run["acc"]
    check("mini-natty-sum", sum(acc[i]["natty"] for i in range(4)) == 400)
    check("mini-favourite", acc[0]["natty"] == max(acc[i]["natty"] for i in range(4)))
    check("mini-ccg", all(acc[i]["ccg"] > 0 for i in range(4)))
    check("mini-conf-sum", sum(acc[i]["conf"] for i in range(4)) == 2 * 400)
    check("mini-win-lists", len(run["win_lists"][0]) == 400)

    # CRN determinism: same seed -> identical accumulators
    run_a = simulate(state, [8.0, 0.0, 0.0, -8.0], 300, seed=11)
    run_b = simulate(state, [8.0, 0.0, 0.0, -8.0], 300, seed=11)
    check("sim-crn-deterministic", run_a["acc"] == run_b["acc"])

    # leverage collection: a game in window_gids gets a home/away/game swing;
    # a game outside it collects nothing
    run_window = simulate(state, [8.0, 0.0, 0.0, -8.0], 300, seed=11, window_gids={"1"})
    check("sim-leverage-present", "1" in run_window["leverage"] and "2" not in run_window["leverage"])
    lev1 = run_window["leverage"]["1"]
    check("sim-leverage-shape", set(lev1) == {"home", "away", "game"}
          and abs(lev1["game"] - (lev1["home"] + lev1["away"])) < 1e-6)

    # p_bubble: every sim credits exactly two teams (last-in seed 12, and
    # the best team left out) in a field with more than 12 teams -- the
    # mini fixture only has 4 teams (all make the CFP every sim), so bubble
    # counts are all zero there; check the shape instead via a wider probe.
    check("mini-bubble-shape", set(run["bubble"]) == {0, 1, 2, 3})

    # adaptive sigma / team sigma / conference residual sd (CFB-scaled)
    check("sigma-full-season", abs(sc.adaptive_sigma(1.0, SIGMA_SEASON, SIGMA_FLOOR_FRAC)
          - SIGMA_SEASON) < 1e-9)
    check("sigma-floor", abs(sc.adaptive_sigma(0.0, SIGMA_SEASON, SIGMA_FLOOR_FRAC)
          - SIGMA_SEASON * SIGMA_FLOOR_FRAC) < 1e-9)
    check("sigma-frac", abs(sc.adaptive_sigma(0.25, SIGMA_SEASON, SIGMA_FLOOR_FRAC)
          - SIGMA_SEASON * math.sqrt(0.25)) < 1e-9)
    check("team-sigma-no-market", sc.team_sigma(3.0, 1.0, None, DISAGREE_K) == 3.0)
    check("team-sigma-disagree", sc.team_sigma(3.0, 4.0, -2.0, DISAGREE_K) > 3.0)
    check("conf-residual-floor", abs(sc.layer_residual_sd(0.5, CONF_SD) - 0.5) < 1e-9)
    check("conf-residual-normal",
          abs(sc.layer_residual_sd(3.0, CONF_SD) - math.sqrt(9.0 - CONF_SD ** 2)) < 1e-9)

    # percentiles / leverage_from_counts / band_for (shared module, exercised
    # here with CFB-shaped messy inputs)
    check("percentiles-p10", sc.percentiles([9, 3, 12, 6, 15], 10) == 3)
    check("percentiles-p90", sc.percentiles([9, 3, 12, 6, 15], 90) == 15)
    check("percentiles-empty", sc.percentiles([], 50) is None)
    check("leverage-basic", abs(sc.leverage_from_counts(70, 100, 15, 100) - 55.0) < 1e-9)
    check("leverage-zero-denom", sc.leverage_from_counts(0, 0, 5, 10) == 0.0)
    check("band-solid", sc.band_for(92) == "solid")
    check("band-tossup", sc.band_for(40) == "tossup")
    check("band-out", sc.band_for(4) == "out")

    # market_spread: raw posted line, negative = home favoured; missing odds
    check("market-spread-raw", sc.market_spread({"odds": [{"spread": -6.5}]}) == -6.5)
    check("market-spread-missing", sc.market_spread({"odds": []}) is None)

    # implied_ratings_from_spreads: neutral games skip the HFA adjustment
    prior0 = {"a": 0.0, "b": 0.0, "c": 0.0, "d": 0.0}
    obs = [("a", "b", -3.0, False), ("c", "d", -3.0, True)]
    r_impl, n_impl = sc.implied_ratings_from_spreads(obs, prior0, lam=SPREAD_LAMBDA, hfa=HFA)
    check("spread-n-count", n_impl == 2)
    check("spread-favourite-up", r_impl["a"] > r_impl["b"])
    # same posted spread (-3), but the neutral game has no HFA to absorb
    # part of it, so the implied rating gap has to be bigger
    check("spread-neutral-larger-gap", (r_impl["c"] - r_impl["d"]) > (r_impl["a"] - r_impl["b"]) > 0)
    check("spread-no-obs", sc.implied_ratings_from_spreads([], prior0)[1] == 0)

    # upsert_snapshot (cfb variant): fresh file, same-date replace, keep-cap
    doc = sc.upsert_snapshot(None, "2026-09-01", 40,
                             {"ohio-state-cfb": {"xw": 10.2, "po": 78.0, "conf": 55.0, "title": 12.0}},
                             "cfb", SEASON, keep=180)
    check("hist-fresh", len(doc["snapshots"]) == 1 and doc["meta"]["league"] == "cfb")
    doc = sc.upsert_snapshot(doc, "2026-09-01", 45,
                             {"ohio-state-cfb": {"xw": 10.4, "po": 79.0, "conf": 56.0, "title": 12.5}},
                             "cfb", SEASON, keep=180)
    check("hist-replace-same-date",
          len(doc["snapshots"]) == 1 and doc["snapshots"][0]["games_played"] == 45)
    doc2 = None
    for k in range(5):
        doc2 = sc.upsert_snapshot(doc2, "2026-08-%02d" % (k + 1), k, {}, "cfb", SEASON, keep=3)
    check("hist-cap", len(doc2["snapshots"]) == 3 and doc2["snapshots"][0]["date"] == "2026-08-03")

    # market prob from moneyline + spread paths
    comp = {"odds": [{"homeTeamOdds": {"moneyLine": -160}, "awayTeamOdds": {"moneyLine": 140}}]}
    mp = market_home_prob(comp)
    check("ml-devig", 0.58 < mp < 0.65)
    check("spread-prob", 0.56 < market_home_prob({"odds": [{"spread": -3.5}]}) < 0.62)

    # score parsing across both ESPN shapes (scoreboard string vs schedule obj)
    check("score-str", _score_val("33") == 33)
    check("score-obj", _score_val({"value": 33.0, "displayValue": "33"}) == 33)
    check("score-none", _score_val(None) is None and _score_val({}) is None)

    # backfill: an under-indexed team is repaired from its own schedule
    # endpoint; a team already at the floor is never fetched; and a wholesale
    # scoreboard failure bails out instead of stampeding ESPN
    bf_ids = ["x", "y", "z"]
    bf_conf = {"x": "East", "y": "East", "z": "West"}
    bf_names = {t: t.upper() for t in bf_ids}

    def bf_ev(eid, h, a):
        return {"id": eid, "date": "2026-09-%02d" % (int(eid[-1]) + 1),
                "kick": "", "week": 1, "st": 2, "home": h, "away": a,
                "hs": None, "as": None, "hloc": "", "aloc": "",
                "completed": False, "neutral": False,
                "conf_game": bf_conf[h] == bf_conf.get(a), "note": "",
                "mkt": None}

    # y and z start full (11 mutual games), x holds only one of them
    seed = [bf_ev("s%d" % k, "y", "z") for k in range(11)]
    seed.append(bf_ev("s99", "x", "y"))
    calls = []
    real_fetch = globals()["team_schedule_events"]

    def fake_fetch(team_id, season, conf_of):
        calls.append(team_id)
        # returns x's full slate, including the one game already on the board
        return [bf_ev("s99", "x", "y")] + [bf_ev("x%d" % k, "x", "z")
                                           for k in range(11)]

    globals()["team_schedule_events"] = fake_fetch
    try:
        merged, rep = backfill_short_schedules(seed, bf_ids, bf_names,
                                               bf_conf, 2026)
        # everything now at the floor -> second pass fetches nothing
        calls_after_repair = list(calls)
        _, rep2 = backfill_short_schedules(merged, bf_ids, bf_names,
                                           bf_conf, 2026)
        noop_quiet = calls == calls_after_repair
        # 20 teams short is an outage, not a gap: bail without fetching
        calls[:] = []
        wide = ["t%d" % k for k in range(20)]
        _, rep3 = backfill_short_schedules([], wide, {},
                                           dict.fromkeys(wide, "East"), 2026)
        outage_quiet = calls == []
    finally:
        globals()["team_schedule_events"] = real_fetch

    check("backfill-fires-only-short", calls_after_repair == ["x"])
    check("backfill-dedups", len({e["id"] for e in merged}) == len(merged))
    check("backfill-keeps-original", sum(1 for e in merged if e["id"] == "s99") == 1)
    check("backfill-lifts", len(merged) == len(seed) + 11)
    check("backfill-reports", rep == [("x", 1, 12)])
    check("backfill-noop", rep2 == [] and noop_quiet)
    check("backfill-outage-bails", rep3 == [] and outage_quiet)

    if fails:
        print("SELF-TEST FAIL:", ", ".join(fails))
        sys.exit(1)
    print("self-test OK (%d checks)" % total[0])


def main():
    if "--self-test" in sys.argv:
        self_test(); return
    sims = DEFAULT_SIMS
    if "--sims" in sys.argv:
        sims = int(sys.argv[sys.argv.index("--sims") + 1])
    sim_doc, pred_doc, hist_doc = build(sims)
    m = sim_doc["meta"]
    print("teams %d | schedule %d games, %d played | %s"
          % (m["teams"], m["schedule_games"], m["games_played"], m["market"]))
    print("tiers: %s | market_ratings: %s | sigma_eff: %.2f"
          % (m["tiers"], m["market_ratings"], m["sigma_season_eff"]))
    for r in sim_doc["table"][:10]:
        print("  %-22s natty %5.1f%%  playoff %5.1f%%  conf %5.1f%%  xW %.1f  band %s"
              % (r["name"], r["p_natty"], r["p_playoff"], r["p_conf"], r["exp_wins"], r["band"]))
    up = [e for e in pred_doc["ledger"] if not e.get("result")]
    print("ledger: %d entries (%d graded, %d upcoming) | poll %s %s fresh=%s"
          % (len(pred_doc["ledger"]), pred_doc["record"]["graded"], len(up),
             pred_doc["meta"]["poll"]["label"], pred_doc["meta"]["poll"]["date"],
             pred_doc["meta"]["poll"]["fresh"]))
    if "--dry" in sys.argv:
        priced = [e for e in up if e.get("market")]
        if priced:
            gap = sum(abs(e["model"]["pH"] - e["market"]["pH"]) for e in priced) / len(priced)
            print("model vs market on %d priced games: mean |pH gap| %.3f" % (len(priced), gap))
            for e in priced:
                print("    %-18s at %-18s model %.2f market %.2f"
                      % (e["away"][:18], e["home"][:18], e["model"]["pH"], e["market"]["pH"]))
        print("dry run; nothing written."); return
    with io.open(OUT_SIM, "w", encoding="utf-8", newline="") as f:
        json.dump(sim_doc, f, separators=(",", ":"), ensure_ascii=False)
    with io.open(OUT_PRED, "w", encoding="utf-8", newline="") as f:
        json.dump(pred_doc, f, separators=(",", ":"), ensure_ascii=False)
    with io.open(OUT_HIST, "w", encoding="utf-8", newline="") as f:
        json.dump(hist_doc, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote cfb-sim.json + cfb-predictions.json + cfb-sim-history.json")


if __name__ == "__main__":
    main()
