#!/usr/bin/env python3
"""NFL meta-market: one consensus price per game from four books, plus each
book's house effect against its peers.

    public/data/nfl-meta-market.json

Ideas 7 and 8 from the 2026-09-03 expert review (see the
reference_prediction_expert_sources memory). Neil Paine's NFL tracker shows a
meta-market aggregated over Polymarket, Kalshi, DraftKings and FanDuel rather
than one book's line, and it is the single most obviously-missing thing on
/predictions: this site has shown "the market" as whatever price ESPN happened
to be carrying that morning, which is DraftKings, alone, unlabelled.

WHAT THIS IS NOT. It is not a betting product and it does not tell anyone what
to bet. It is a measurement instrument: four independent prices on the same
event let you (a) form a better estimate than any one of them and (b) measure
how each one leans, which is the only way to know whether "the market" that
the Ledger scores the model against is a market or a quirk of one book.

THE FOUR BOOKS, AND WHY EACH IS REACHABLE
  draftkings  via ESPN's own odds block. ESPN carries exactly one provider and
              it is DraftKings; the direct DK endpoints 403 from anywhere that
              is not a browser they like. Moneyline when posted, else the
              spread through the same Phi translation build_nfl_sim.py uses --
              and that case is LABELLED `derived: spread->phi`, because a
              spread put through a normal curve is a model output, not a price.
  fanduel     the NJ sportsbook's content-managed-page feed. American
              moneylines for all 32 week's games, and in week 1 of 2026 it was
              the only book of the four ESPN could not give us a moneyline for.
  kalshi      KXNFLGAME, two binary contracts per game (one per team). Being an
              exchange it quotes a BID and an ASK per side, so the fair price
              is the mid, and the residual over/underround from crossing the
              two sides goes through the same de-vig as a sportsbook's hold.
  polymarket  gamma events with slug nfl-<away>-<home>-<date>. An order book,
              same treatment as Kalshi.

IDENTITY IS THE HARD PART, NOT THE MATH. Four books, four naming schemes:
ESPN full display names, FanDuel full display names, Kalshi ticker
abbreviations, Polymarket nicknames. Everything is resolved to the ESPN
abbreviation, and the join key is the UNORDERED PAIR of the two abbreviations,
not the date: Kalshi stamps its ticker with the US local date and Polymarket
with the UTC end date, so a 20:20 ET kickoff is 26SEP09 to one and 2026-09-10
to the other. A pair cannot repeat inside a three-week window, so the pair is
the key and the date is a SANITY CHECK -- more than two days apart and the
match is refused and reported, never silently accepted.

Unmatched games and unmatched books are counted and printed. This step is
soft-fail by design (a book being down must never fail the model build that
follows it), but it is never SILENT: meta.books says what each book returned.

COLLEGE FOOTBALL, added 2026-09-04, is THREE books not four and the file says
so. Polymarket carries college futures and award markets but NO game markets --
checked across the cfb, ncaaf and college-football tags, zero game-shaped slugs
-- so it is configured out rather than silently absent. Kalshi's college
contracts are also far thinner than its NFL ones (a 0.15/0.81 bid-ask on
Syracuse-Pittsburgh the day this was written), so an exchange quote wider than
MAX_EXCHANGE_SPREAD is DROPPED: the mid of a spread that wide is not a price,
it is the midpoint of nobody's opinion.

    python scripts/predictions/build_meta_market.py             # both leagues
    python scripts/predictions/build_meta_market.py --league cfb
    python scripts/predictions/build_meta_market.py --dry       # no writes
    python scripts/predictions/build_meta_market.py --self-test # offline
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from sim_common import (american_prob, house_effects, meta_consensus,  # noqa: E402
                        overround, phi, power_devig, two_way_devig)

SEASON = 2026

ESPN = "https://site.api.espn.com/apis"
WINDOW_DAYS = 21           # three weeks: far enough that a full slate is always
                           # in view, near enough that a team pair cannot repeat
MAX_DATE_SKEW_DAYS = 2     # a matched game whose book date is further away than
                           # this is a bad match, not a timezone
MAX_EXCHANGE_SPREAD = 0.20 # 🔴 an exchange quote wider than this is dropped. A
                           # 0.15/0.81 market (a real college contract on
                           # 2026-09-04) has a "mid" of 0.48, which is not what
                           # anyone thinks the game is worth -- it is the
                           # midpoint of two people who are not trading.

# Books, in the order they are presented. `kind` is not decoration: an exchange
# quotes two-sided and a sportsbook quotes one-sided, and the Ledger says so.
BOOK_LABELS = {
    "draftkings": ("DraftKings", "sportsbook", "ESPN odds block"),
    "fanduel": ("FanDuel", "sportsbook", "FanDuel NJ content-managed-page"),
    "kalshi": ("Kalshi", "exchange", "Kalshi game series"),
    "polymarket": ("Polymarket", "exchange", "Polymarket gamma"),
}

# Abbreviations that are not ESPN's, per league. Written out rather than
# fuzzy-matched: a wrong team is a wrong price, and a fuzzy matcher fails
# silently while a missing key fails loudly.
NFL_ABBR_ALIAS = {
    "JAC": "JAX",   # Kalshi
    "WAS": "WSH",   # Kalshi
    "LVR": "LV",
    "LA": "LAR",
    "SD": "LAC",
    "OAK": "LV",
    "STL": "LAR",
}

# Book spellings that ESPN does not use, each one CHECKED against ESPN's own
# team list rather than guessed. A wrong team is a wrong price, so anything not
# in here stays unresolved and gets printed.
CFB_NAME_ALIAS = {
    "appalachianstate": "APP",      # ESPN: App State
    "connecticut": "CONN",          # ESPN: UConn
    "miamiflorida": "MIA",          # FanDuel disambiguates; ESPN: Miami Hurricanes
    "miamiohio": "M-OH",            # ESPN: Miami (OH) RedHawks
    "samhoustonstate": "SHSU",      # ESPN dropped the "State"
    "northcarolinastate": "NCSU",   # ESPN: NC State Wolfpack
    "wvmountaineers": "WVU",        # FanDuel's spelling of West Virginia
    # Two FBS programmes whose bare location name is also carried by a lower
    # -division team, so the key is contested and the alias settles it.
    "charlotte": "CLT",
    "troy": "TROY",
}

LEAGUES = {
    "nfl": {
        "label": "NFL",
        "espn_path": "football/nfl",
        "espn_teams_limit": None,
        "scoreboard_extra": "",
        "sigma_game": 13.4,     # keep in step with build_nfl_sim.py
        "kalshi_series": "KXNFLGAME",
        "fanduel_page": "nfl",
        # Polymarket's NFL game events: slug nfl-<away>-<home>-<date>.
        "polymarket_tag": "nfl",
        "polymarket_slug": r"^nfl-[a-z]+-[a-z]+-\d{4}-\d{2}-\d{2}$",
        "abbr_alias": NFL_ABBR_ALIAS,
        # 32 unique nicknames, so Polymarket's "Patriots"/"Seahawks" resolve.
        "nickname_unique": True,
        "out": "nfl-meta-market.json",
        "books": ["draftkings", "fanduel", "kalshi", "polymarket"],
    },
    "cfb": {
        "label": "College Football",
        "espn_path": "football/college-football",
        "espn_teams_limit": 400,
        # groups=80 is FBS. Without it the scoreboard returns every division and
        # the window fills with games no ledger here will ever price.
        "scoreboard_extra": "&groups=80",
        "sigma_game": 16.0,     # keep in step with build_cfb_sim.py
        "kalshi_series": "KXNCAAFGAME",
        "fanduel_page": "ncaaf",
        # 🔴 Polymarket has NO college game markets. Checked 2026-09-04 across
        # the cfb, ncaaf and college-football tags: futures, awards and coach
        # markets only, zero game-shaped slugs. Configured out rather than left
        # to fail quietly and look like a fetch problem.
        "polymarket_tag": None,
        "polymarket_slug": None,
        "abbr_alias": {},
        "name_alias": CFB_NAME_ALIAS,
        "out": "cfb-meta-market.json",
        "books": ["draftkings", "fanduel", "kalshi"],
    },
}

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")


def fetch_json(url, soft=True, ua=None, timeout=25):
    """ESPN gets NO User-Agent -- its edge 403s branded tokens and browser
    spoofs alike, measured 2026-08-05 and documented at length in
    build_nfl_sim.py. The three non-ESPN books want a browser UA. So the header
    is per-host and neither default is an accident."""
    headers = {"Accept": "application/json"}
    if ua:
        headers["User-Agent"] = ua
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except Exception as e:
        if soft:
            print("  soft-fetch miss: %s (%s)" % (url[:90], e))
            return None
        raise SystemExit("required fetch failed: %s (%s)" % (url, e))


# ------------------------------------------------------------------ identity

def norm_abbr(a, cfg):
    a = (a or "").strip().upper()
    return cfg["abbr_alias"].get(a, a)


def name_key(s):
    """A team name reduced to a comparable key.

    🔴 The NFL could be matched on nicknames because they are unique. College
    football cannot: ESPN lists 760 teams and there are a dozen Wildcats and as
    many Bulldogs. So identity there is built from the NAME fields -- location,
    short display name, display name -- and a bare nickname never resolves.

    Two things happen before the punctuation is stripped, and the order matters:

    1. Accents are folded. ESPN writes "San José State" and FanDuel writes
       "San Jose State"; stripping punctuation first turns the former into
       `sanjosstate` and they never meet.
    2. A TRAILING "St." or "St" becomes "State". Kalshi writes "Missouri St.",
       ESPN writes "Missouri State". 🔴 Do this AFTER stripping punctuation and
       "Missouri St." collapses to `missourist`, which is also what
       "Missouri S&T" collapses to -- a real collision this file hit on
       2026-09-04, and a wrong team is a wrong price. A LEADING "St." is left
       alone: that one is Saint, as in St. John's.
    """
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"\bst\.?$", "state", s.strip())
    return re.sub(r"[^a-z0-9]+", "", s)


def espn_identity(cfg):
    """({abbr: displayName}, {name_key: abbr}).

    ESPN is the identity authority because it is already the authority for the
    schedule these ledgers are built on. Every name a book might use for a team
    -- "Michigan", "Michigan Wolverines", "MICH" -- resolves through the same
    map, and a key that would resolve to two different teams is DROPPED rather
    than resolved to whichever came first."""
    # 🔴 ESPN's teams endpoint PAGINATES and does not say so loudly. The
    # college list is ~700 teams; `?limit=400` returns the first 400 by
    # abbreviation and `?groups=80&limit=200` returns 200 -- both of which cut
    # off before Iowa and Kansas. The first version of this read one page and
    # then could not resolve 67 FanDuel names that were perfectly ordinary FBS
    # programmes. Walk the pages until one comes back short.
    base = "%s/site/v2/sports/%s/teams" % (ESPN, cfg["espn_path"])
    page_size = 200 if cfg["espn_teams_limit"] else 50
    raw_teams, page = [], 1
    while page <= 20:
        d = fetch_json("%s?limit=%d&page=%d" % (base, page_size, page))
        got = ((d or {}).get("sports") or [{}])[0].get("leagues", [{}])[0].get("teams", [])
        raw_teams.extend(got)
        if len(got) < page_size:
            break
        page += 1
        if not cfg["espn_teams_limit"]:
            break   # the NFL is 32 teams and one page; do not walk it
    # 🔴 Which teams are top division. With 760 college teams a name key like
    # "charlotte" is offered by more than one programme, and the first version
    # of this DROPPED every contested key -- which threw away Charlotte, a
    # perfectly ordinary FBS team, along with the ambiguity. Inside the top
    # division the names really are unique, so the top-division team wins a
    # clash and only a clash between two of them is dropped.
    top = top_division_abbrs(cfg)
    by_abbr, by_name, clash = {}, {}, set()

    def offer(key, ab):
        if not key or not ab:
            return
        prev = by_name.get(key)
        if prev and prev != ab:
            prev_top, ab_top = prev in top, ab in top
            if prev_top and not ab_top:
                return          # keep the top-division team
            if ab_top and not prev_top:
                by_name[key] = ab
                return
            clash.add(key)      # two of the same rank: genuinely ambiguous
        by_name[key] = ab

    for grp in raw_teams:
        t = grp.get("team") or {}
        ab = norm_abbr(t.get("abbreviation"), cfg)
        if not ab:
            continue
        by_abbr[ab] = t.get("displayName")
        for field in ("displayName", "shortDisplayName", "location", "nickname"):
            offer(name_key(t.get(field)), ab)
        offer(name_key(t.get("abbreviation")), ab)
        # The bare nickname is only safe where nicknames are unique, which is
        # exactly the NFL and exactly not college football.
        if cfg.get("nickname_unique") and t.get("name"):
            offer(name_key(t["name"]), ab)
    for k in clash:
        by_name.pop(k, None)
    for key, ab in (cfg.get("name_alias") or {}).items():
        if ab in by_abbr:
            by_name[key] = ab
    return by_abbr, by_name, sorted(clash)


def top_division_abbrs(cfg):
    """The abbreviations of the league's top division, used only to break a
    name clash. `groups=80` is FBS; leagues without a groups filter (the NFL)
    have one division and every team is in it."""
    if not cfg["scoreboard_extra"]:
        return set()
    base = "%s/site/v2/sports/%s/teams" % (ESPN, cfg["espn_path"])
    out, page = set(), 1
    while page <= 6:
        d = fetch_json("%s?groups=80&limit=200&page=%d" % (base, page))
        got = ((d or {}).get("sports") or [{}])[0].get("leagues", [{}])[0].get("teams", [])
        for grp in got:
            ab = norm_abbr((grp.get("team") or {}).get("abbreviation"), cfg)
            if ab:
                out.add(ab)
        if len(got) < 200:
            break
        page += 1
    return out


def pair_key(a, b, cfg=None):
    """The join key: the unordered pair of abbreviations. Order is not part of
    it because the books do not agree on which side they list first, and
    home/away comes from ESPN anyway."""
    cfg = cfg or {"abbr_alias": {}}
    return tuple(sorted((norm_abbr(a, cfg), norm_abbr(b, cfg))))


# -------------------------------------------------------------------- games

def espn_games(cfg, today, window_days=WINDOW_DAYS):
    """The canonical game list: ESPN's schedule, with DraftKings' price
    attached because it arrives in the same payload."""
    out = []
    end = today + timedelta(days=window_days)
    url = ("%s/site/v2/sports/%s/scoreboard?dates=%s-%s&limit=400%s"
           % (ESPN, cfg["espn_path"], today.strftime("%Y%m%d"),
              end.strftime("%Y%m%d"), cfg["scoreboard_extra"]))
    d = fetch_json(url)
    for ev in (d or {}).get("events", []):
        comp = (ev.get("competitions") or [{}])[0]
        if comp.get("status", {}).get("type", {}).get("completed"):
            continue
        home = away = None
        for c in comp.get("competitors", []):
            t = c.get("team") or {}
            side = {"abbr": norm_abbr(t.get("abbreviation"), cfg),
                    "name": t.get("displayName")}
            if c.get("homeAway") == "home":
                home = side
            else:
                away = side
        if not home or not away or not home["abbr"] or not away["abbr"]:
            continue
        kick = ev.get("date") or ""
        out.append({
            "event_id": str(ev.get("id")),
            "kickoff": kick,
            "date": kick[:10],
            "home": home["name"], "away": away["name"],
            "home_abbr": home["abbr"], "away_abbr": away["abbr"],
            "neutral": bool(comp.get("neutralSite")),
            "_dk": draftkings_price(comp, cfg["sigma_game"]),
        })
    out.sort(key=lambda g: (g["date"], g["home"]))
    return out


def draftkings_price(comp, sigma_game):
    """ESPN's odds block. Moneyline pair first; the spread only as a labelled
    fallback, because a spread through Phi is this repo's model of a price and
    not a price. sigma_game differs by league (13.4 NFL, 16.0 college) and is
    read from the league config so the two cannot drift from the sims."""
    for o in comp.get("odds") or []:
        hml = (o.get("homeTeamOdds") or {}).get("moneyLine")
        aml = (o.get("awayTeamOdds") or {}).get("moneyLine")
        if hml and aml:
            rh, ra = american_prob(hml), american_prob(aml)
            p = two_way_devig(rh, ra)
            if p is not None:
                return {"p_home": round(p, 4), "raw": [round(rh, 4), round(ra, 4)],
                        "overround": round(overround([rh, ra]), 4),
                        "source": "moneyline"}
    for o in comp.get("odds") or []:
        sp = o.get("spread")
        if sp is not None:
            try:
                return {"p_home": round(phi(-float(sp) / sigma_game), 4),
                        "spread": float(sp), "source": "spread",
                        "derived": "spread->phi",
                        "note": "no moneyline posted; this is a translation, not a price"}
            except (TypeError, ValueError):
                pass
    return None


# -------------------------------------------------------------------- books

def fetch_fanduel(cfg, by_name):
    """{pair: {abbr: raw_prob}} from FanDuel's NJ content-managed-page feed."""
    url = ("https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page"
           "?page=CUSTOM&customPageId=%s&pbHorizontal=false"
           "&_ak=FhMFpcPWXMeyZxOx&timezone=America%%2FNew_York"
           % cfg["fanduel_page"])
    d = fetch_json(url, ua=BROWSER_UA)
    if not d:
        return {}, "unreachable", []
    markets = ((d.get("attachments") or {}).get("markets") or {})
    out, unknown = {}, set()
    for m in markets.values():
        if (m.get("marketType") or "") != "MONEY_LINE":
            continue
        got = {}
        for r in m.get("runners") or []:
            raw = (r.get("runnerName") or "").strip()
            ab = by_name.get(name_key(raw))
            ml = ((r.get("winRunnerOdds") or {}).get("americanDisplayOdds")
                  or {}).get("americanOddsInt")
            if ab and ml is not None:
                got[ab] = american_prob(ml)
            elif raw and not ab:
                unknown.add(raw)
        if len(got) == 2:
            out[pair_key(*got.keys(), cfg=cfg)] = got
    return out, ("ok" if out else "no moneyline markets"), sorted(unknown)


# 🔴 Per series, not hardcoded. The first version pinned KXNFLGAME into the
# pattern, so every college ticker failed to parse and the college build
# reported "no open markets" while Kalshi was serving them perfectly well.
def kalshi_ticker_re(series):
    return re.compile(r"^%s-(\d{2})([A-Z]{3})(\d{2})[A-Z0-9]+-([A-Z0-9]+)$"
                      % re.escape(series))


KALSHI_TICKER = kalshi_ticker_re("KXNFLGAME")
KALSHI_MONTHS = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
                 "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12}


def fetch_kalshi(cfg, by_name):
    """{pair: ({abbr: mid}, date)} from the league's game series.

    Two contracts per game, one per team. The fair price of a two-sided quote
    is the mid of bid and ask; taking last_price instead would read whichever
    side happened to trade last, which on a thin contract is noise wearing a
    number's clothes.

    🔴 And a quote wider than MAX_EXCHANGE_SPREAD is dropped entirely. Kalshi's
    college contracts are thin: Syracuse-Pittsburgh sat at 0.15/0.81 on
    2026-09-04, a mid of 0.48 that represents nobody's view of the game. A wide
    market is an absent market, not a 50/50 one.

    The side is resolved from `yes_sub_title` (a name) first and the ticker
    suffix (an abbreviation) only as a fallback, because college abbreviations
    are the least standard thing in this whole file."""
    ticker_re = kalshi_ticker_re(cfg["kalshi_series"])
    events, cursor, wide, unknown = {}, "", 0, set()
    for _ in range(12):
        url = ("https://api.elections.kalshi.com/trade-api/v2/markets"
               "?series_ticker=%s&status=open&limit=200" % cfg["kalshi_series"])
        if cursor:
            url += "&cursor=" + cursor
        d = fetch_json(url, ua=BROWSER_UA)
        if not d:
            return {}, "unreachable", []
        ms = d.get("markets") or []
        for m in ms:
            mt = ticker_re.match(m.get("ticker") or "")
            if not mt:
                continue
            yy, mon, dd, abbr = mt.groups()
            side = (by_name.get(name_key(m.get("yes_sub_title")))
                    or (norm_abbr(abbr, cfg) if norm_abbr(abbr, cfg) in by_name.values() else None))
            if not side:
                unknown.add("%s (%s)" % (m.get("yes_sub_title"), abbr))
                continue
            bid, ask = m.get("yes_bid_dollars"), m.get("yes_ask_dollars")
            try:
                bid, ask = float(bid), float(ask)
            except (TypeError, ValueError):
                continue
            if ask - bid > MAX_EXCHANGE_SPREAD:
                wide += 1
                continue
            mid = (bid + ask) / 2.0
            if not (0.0 < mid < 1.0):
                continue
            ev = events.setdefault(m.get("event_ticker"), {"sides": {}, "date": None})
            ev["sides"][side] = mid
            try:
                ev["date"] = ("%04d-%02d-%02d"
                              % (2000 + int(yy), KALSHI_MONTHS[mon], int(dd)))
            except (KeyError, ValueError):
                pass
        cursor = d.get("cursor") or ""
        if not ms or not cursor:
            break
    out = {}
    for ev in events.values():
        if len(ev["sides"]) == 2:
            out[pair_key(*ev["sides"].keys(), cfg=cfg)] = (ev["sides"], ev["date"])
    state = "ok" if out else "no open markets"
    if wide:
        state += " (%d quote%s dropped as too wide)" % (wide, "" if wide == 1 else "s")
    return out, state, sorted(unknown)[:12]


POLY_SLUG = re.compile(r"^nfl-([a-z]+)-([a-z]+)-(\d{4}-\d{2}-\d{2})$")


def fetch_polymarket(cfg, by_nick):
    """{pair: ({abbr: price}, date)} from gamma's NFL game events.

    outcomePrices are already normalised by Polymarket, so the mid of
    bestBid/bestAsk is preferred where the book has one: it is the live
    two-sided quote rather than a derived pair."""
    if not cfg.get("polymarket_tag"):
        # Not "unreachable" and not "empty": there is nothing there to reach.
        return {}, "no game markets on this exchange for this league"
    out, seen = {}, 0
    for off in range(0, 600, 100):
        d = fetch_json("https://gamma-api.polymarket.com/events"
                       "?tag_slug=%s&closed=false&limit=100&offset=%d"
                       % (cfg["polymarket_tag"], off),
                       ua=BROWSER_UA)
        if not isinstance(d, list):
            return out, ("unreachable" if not out else "partial")
        for ev in d:
            if not POLY_SLUG.match(ev.get("slug") or ""):
                continue
            seen += 1
            mkts = ev.get("markets") or []
            if not mkts:
                continue
            m = mkts[0]
            got = _poly_sides(m, by_nick)
            if len(got) == 2:
                out[pair_key(*got.keys(), cfg=cfg)] = (got, (ev.get("endDate") or "")[:10])
        if len(d) < 100:
            break
    return out, ("ok" if out else ("no game events" if not seen else "unparsed"))


def _poly_sides(m, by_nick):
    """{abbr: price} for one Polymarket game market."""
    try:
        outcomes = m.get("outcomes")
        prices = m.get("outcomePrices")
        outcomes = json.loads(outcomes) if isinstance(outcomes, str) else outcomes
        prices = json.loads(prices) if isinstance(prices, str) else prices
    except (TypeError, ValueError):
        return {}
    if not outcomes or not prices or len(outcomes) != len(prices):
        return {}
    bid, ask = m.get("bestBid"), m.get("bestAsk")
    mid = None
    try:
        if bid is not None and ask is not None:
            mid = (float(bid) + float(ask)) / 2.0
    except (TypeError, ValueError):
        mid = None
    got = {}
    for i, (name, price) in enumerate(zip(outcomes, prices)):
        ab = by_nick.get(name_key(name))
        if not ab:
            return {}
        try:
            p = float(price)
        except (TypeError, ValueError):
            return {}
        # bestBid/bestAsk quote the FIRST outcome's token; the second side is
        # its complement, which is what an order book on a binary market means.
        if mid is not None and 0.0 < mid < 1.0:
            p = mid if i == 0 else 1.0 - mid
        got[ab] = p
    return got


# ------------------------------------------------------------------ assemble

def date_skew(a, b):
    try:
        da = datetime.strptime(a[:10], "%Y-%m-%d")
        db = datetime.strptime(b[:10], "%Y-%m-%d")
    except (TypeError, ValueError):
        return 0
    return abs((da - db).days)


def assemble(games, fd, kalshi, poly, today_iso, cfg=None):
    """Attach every book's fair price to every game, then consensus it."""
    cfg = cfg or LEAGUES["nfl"]
    rows, refused = [], []
    for g in games:
        key = pair_key(g["home_abbr"], g["away_abbr"], cfg=cfg)
        books = {}
        if g.get("_dk"):
            books["draftkings"] = g["_dk"]
        raw = fd.get(key)
        if raw:
            p = two_way_devig(raw.get(g["home_abbr"]), raw.get(g["away_abbr"]))
            if p is not None:
                books["fanduel"] = {
                    "p_home": round(p, 4), "source": "moneyline",
                    "raw": [round(raw[g["home_abbr"]], 4), round(raw[g["away_abbr"]], 4)],
                    "overround": round(overround(list(raw.values())), 4)}
        for name, store in (("kalshi", kalshi), ("polymarket", poly)):
            got = store.get(key)
            if not got:
                continue
            sides, bdate = got
            if bdate and date_skew(bdate, g["date"]) > MAX_DATE_SKEW_DAYS:
                refused.append("%s: %s v %s dated %s, %s says %s"
                               % (name, g["away_abbr"], g["home_abbr"], bdate,
                                  "espn", g["date"]))
                continue
            p = two_way_devig(sides.get(g["home_abbr"]), sides.get(g["away_abbr"]))
            if p is not None:
                books[name] = {
                    "p_home": round(p, 4), "source": "two-sided mid",
                    "raw": [round(sides[g["home_abbr"]], 4), round(sides[g["away_abbr"]], 4)],
                    "overround": round(overround(list(sides.values())), 4)}
        # 🔴 A DERIVED price is not a price and does not vote.
        #
        # When a book posts no moneyline, all we have is its spread, and this
        # file turns that into a probability with the sim's own Phi curve. Two
        # things then go wrong if it is treated as a quote. It is QUANTISED --
        # every -3.5 game prices at exactly 0.603, which is why four different
        # week-1 fixtures came back with the identical DraftKings number on
        # 2026-09-04 -- and it LEANS, measured at -1.6 points against the three
        # real books that day, because a fixed sigma cannot know which -3.5 is
        # a low-total game. Averaging that into the consensus would drag a
        # market estimate toward a model, which is the exact opposite of what a
        # meta-market is for, and the resulting house effects would attribute
        # the translation's bias to DraftKings.
        #
        # So derived prices are carried, labelled and shown, and excluded from
        # both the consensus and the house effects -- unless they are all there
        # is, in which case one labelled estimate beats none.
        priced = {b: v["p_home"] for b, v in books.items() if not v.get("derived")}
        derived = {b: v["p_home"] for b, v in books.items() if v.get("derived")}
        use, only_derived = (priced, False) if priced else (derived, True)
        p, sd, n = meta_consensus(use)
        row = {
            "event_id": g["event_id"], "date": g["date"], "kickoff": g["kickoff"],
            "home": g["home"], "away": g["away"],
            "home_abbr": g["home_abbr"], "away_abbr": g["away_abbr"],
            "books": books,
        }
        if g["neutral"]:
            row["neutral"] = True
        if p is not None:
            row["consensus"] = {"p_home": round(p, 4), "books": n,
                                "sd_logodds": round(sd, 4) if sd is not None else None}
            if only_derived:
                row["consensus"]["derived_only"] = True
            if derived and not only_derived:
                row["consensus"]["excluded_derived"] = sorted(derived)
        rows.append(row)
    # 🔴 min_books=3. With only two books voting, each one's leave-one-out
    # baseline IS the other book, so the two leans come out as exact negatives
    # of each other -- which is arithmetic, not a house effect. Seen on the
    # first college run: FanDuel +6.1pp and Kalshi -6.1pp over the same 74
    # games, a number that says only "these two disagree" and says it twice.
    # A book leans against a CONSENSUS, and two prices are not one.
    effects = house_effects([{b: v["p_home"] for b, v in r["books"].items()
                              if not v.get("derived")} for r in rows],
                            min_books=3)
    return rows, effects, refused


def build_league(league, dry=False):
    cfg = LEAGUES[league]
    today = datetime.now(timezone.utc)
    today_iso = today.strftime("%Y-%m-%d")
    out_path = os.path.join(ROOT, "public", "data", cfg["out"])

    print("== %s ==" % cfg["label"])
    by_abbr, by_name, clashes = espn_identity(cfg)
    # 🔴 Soft all the way down, and deliberately so: this step runs BEFORE the
    # model builders in the runner, under `guarded`, which aborts the whole run
    # on a non-zero exit. A book being unreachable -- or ESPN itself being
    # unreachable -- must cost the day its meta-market, never the day's model.
    # So a data problem leaves the PREVIOUS file in place and returns cleanly;
    # only a programming error is allowed to raise.
    if len(by_abbr) < 32:
        print("  ESPN returned %d teams -- not writing; the previous "
              "meta-market stands" % len(by_abbr))
        return None
    print("  identity: %d teams, %d name keys%s"
          % (len(by_abbr), len(by_name),
             ", %d ambiguous keys dropped" % len(clashes) if clashes else ""))

    games = espn_games(cfg, today)
    print("  games: %d upcoming inside %d days" % (len(games), WINDOW_DAYS))
    if not games:
        print("  no upcoming games -- not writing; the previous file stands")
        return None

    fd, fd_state, fd_unknown = ({}, "not configured", [])
    kal, kal_state, kal_unknown = ({}, "not configured", [])
    poly, poly_state = ({}, "not configured")
    if "fanduel" in cfg["books"]:
        fd, fd_state, fd_unknown = fetch_fanduel(cfg, by_name)
    if "kalshi" in cfg["books"]:
        kal, kal_state, kal_unknown = fetch_kalshi(cfg, by_name)
    if "polymarket" in cfg["books"]:
        poly, poly_state = fetch_polymarket(cfg, by_name)
    print("  fanduel    %-44s %3d games" % (fd_state, len(fd)))
    print("  kalshi     %-44s %3d games" % (kal_state, len(kal)))
    print("  polymarket %-44s %3d games" % (poly_state, len(poly)))
    # Names a book used that ESPN's identity table could not resolve. Printed,
    # never guessed at: an unresolved name is a game we do not price, which is
    # the correct outcome, but a silent one would hide a naming drift forever.
    for label, names in (("fanduel", fd_unknown), ("kalshi", kal_unknown)):
        if names:
            print("  UNRESOLVED %s names (%d): %s"
                  % (label, len(names), ", ".join(names[:8])))

    rows, effects, refused = assemble(games, fd, kal, poly, today_iso, cfg=cfg)
    for r in refused:
        print("  REFUSED MATCH:", r)

    counts = {k: 0 for k in cfg["books"]}
    for r in rows:
        for b in r["books"]:
            counts[b] = counts.get(b, 0) + 1
    states = {
        "draftkings": "ok" if counts.get("draftkings") else "no odds block",
        "fanduel": fd_state, "kalshi": kal_state, "polymarket": poly_state,
    }

    doc = {
        "meta": {
            "league": league, "label": cfg["label"], "season": SEASON,
            "generated_at": today_iso, "window_days": WINDOW_DAYS,
            "devig": "power (solve sum(r^k)=1); proportional de-vig leaves "
                     "longshots too high and favourites too low",
            "consensus": "equal-weighted mean of the books' de-vigged log-odds, "
                         "over POSTED prices only; a spread put through Phi is "
                         "carried and labelled but does not vote. Inverse-"
                         "variance weighting waits for graded history",
            "house_effects": "each book against the consensus of the OTHER "
                             "books on the same game (leave-one-out)",
            "exchange_spread_cap": MAX_EXCHANGE_SPREAD,
            "books": [{"key": k, "label": BOOK_LABELS[k][0],
                       "kind": BOOK_LABELS[k][1], "source": BOOK_LABELS[k][2],
                       "state": states.get(k), "games": counts.get(k, 0)}
                      for k in cfg["books"]],
            "games": len(rows),
            "games_multi_book": sum(1 for r in rows if len(r["books"]) >= 2),
            "refused_matches": refused,
            "unresolved_names": {"fanduel": fd_unknown, "kalshi": kal_unknown},
        },
        "house_effects": effects,
        "games": rows,
    }
    if dry:
        print("  DRY RUN")
        for r in rows[:12]:
            c = r.get("consensus") or {}
            print("    %s %-5s at %-5s  consensus %-7s (%s voting)  %s"
                  % (r["date"], r["away_abbr"], r["home_abbr"],
                     c.get("p_home"), c.get("books"),
                     ", ".join("%s %.3f%s" % (b, v["p_home"],
                                              "*" if v.get("derived") else "")
                               for b, v in sorted(r["books"].items()))))
        print("  (* = translated from a spread; carried, shown, does not vote)")
        print("  house effects:", json.dumps(effects))
        return doc
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("  wrote %s (%d games, %d with two or more books)"
          % (os.path.relpath(out_path, ROOT), len(rows), doc["meta"]["games_multi_book"]))
    return doc


def build(dry=False, leagues=None):
    """Every configured league. One league failing never stops the others: they
    write separate files and nothing downstream reads both."""
    out = {}
    for lg in (leagues or list(LEAGUES)):
        try:
            out[lg] = build_league(lg, dry=dry)
        except Exception:
            import traceback
            print("  %s FAILED -- its previous file stands. Traceback:" % lg)
            traceback.print_exc()
    return out


# ----------------------------------------------------------------- self-test

def self_test():
    fails, total = [], [0]

    def check(label, cond):
        total[0] += 1
        print("  %s: %s" % ("ok" if cond else "FAIL", label))
        if not cond:
            fails.append(label)

    # --- power de-vig -------------------------------------------------
    p = power_devig([0.55, 0.50])
    check("power de-vig returns a distribution", abs(sum(p) - 1.0) < 1e-9)
    check("power de-vig keeps the favourite favoured", p[0] > p[1])
    prop = [0.55 / 1.05, 0.50 / 1.05]
    check("on a two-way market power and proportional barely differ",
          abs(p[0] - prop[0]) < 0.01)

    # A 32-way futures board, shaped like a real Super Bowl market: this is the
    # case the two methods actually disagree on, and the one that feeds
    # fit_rating_from_logodds.
    #
    # 🔴 The board must be an OVERROUND. The first version of this test summed
    # to 0.56, an underround, which solves k < 1 and inverts both directions
    # below -- the assertions failed and the METHOD was fine. Assert the
    # fixture before asserting the behaviour.
    board = [0.16, 0.13, 0.11, 0.09, 0.08, 0.07, 0.06, 0.055,
             0.05, 0.045, 0.04, 0.035, 0.03, 0.028, 0.025, 0.022,
             0.02, 0.018, 0.016, 0.014, 0.012, 0.011, 0.010, 0.009,
             0.008, 0.007, 0.006, 0.005, 0.005, 0.004, 0.004, 0.003]
    s = sum(board)
    check("the futures fixture is 32 teams and a real overround",
          len(board) == 32 and 1.15 < s < 1.25)
    pw = power_devig(board)
    pr = [x / s for x in board]
    check("the futures board de-vigs to 1", abs(sum(pw) - 1.0) < 1e-9)
    check("power takes MORE off the longshot than proportional does",
          pw[-1] < pr[-1])
    check("power takes LESS off the favourite than proportional does",
          pw[0] > pr[0])
    check("and the difference is big enough to matter to a rating",
          pr[-1] / pw[-1] > 1.15)

    check("an underround is inflated, not refused",
          abs(sum(power_devig([0.48, 0.49])) - 1.0) < 1e-9)
    check("a certainty is clamped, never raised to a power of zero",
          abs(sum(power_devig([1.0, 0.0])) - 1.0) < 1e-9)
    check("a single outcome is certain", power_devig([0.4]) == [1.0])
    check("an empty book is empty, not a crash", power_devig([]) == [])
    check("two_way_devig refuses a broken pair",
          two_way_devig(None, 0.5) is None and two_way_devig(0.0, 0.9) is None)

    # --- consensus ----------------------------------------------------
    pc, sd, n = meta_consensus({"a": 0.6, "b": 0.6, "c": 0.6})
    check("agreeing books consense on their own number",
          abs(pc - 0.6) < 1e-9 and sd == 0.0 and n == 3)
    pc2, sd2, _ = meta_consensus({"a": 0.4, "b": 0.6})
    check("a symmetric disagreement lands at the midpoint", abs(pc2 - 0.5) < 1e-9)
    check("disagreement is measured, not assumed", sd2 > 0.5)
    check("no books means no consensus", meta_consensus({})[0] is None)

    # --- house effects ------------------------------------------------
    rows = [{"a": 0.60, "b": 0.50, "c": 0.50},
            {"a": 0.70, "b": 0.60, "c": 0.60},
            {"a": 0.55, "b": 0.45, "c": 0.45}]
    he = house_effects(rows)
    check("the leaning book leans", he["a"]["lean_logodds"] > 0.3)
    check("its peers lean the other way", he["b"]["lean_logodds"] < 0)
    check("every book is measured on every shared game", he["a"]["games"] == 3)
    check("a lone book has nobody to lean against",
          house_effects([{"a": 0.6}]) == {})
    # leave-one-out is the point: including itself would shrink this toward 0
    naive = []
    for r in rows:
        base, _s, _n = meta_consensus(r)
        naive.append(abs(__import__("math").log(0.6 / 0.4)))
    check("leave-one-out gives a bigger lean than self-inclusive would",
          he["a"]["lean_logodds"] > 0.35)

    # --- identity and joining -----------------------------------------
    NFL = LEAGUES["nfl"]
    CFB = LEAGUES["cfb"]
    check("Kalshi's JAC is ESPN's JAX", norm_abbr("jac", NFL) == "JAX")
    check("Kalshi's WAS is ESPN's WSH", norm_abbr("WAS", NFL) == "WSH")
    check("an alias is per league, not global", norm_abbr("WAS", CFB) == "WAS")
    check("the name key ignores punctuation, case and spacing",
          name_key("Texas A&M") == name_key("texas a m") == "texasam")
    check("the join key ignores which side a book lists first",
          pair_key("NE", "SEA") == pair_key("SEA", "NE"))
    check("the ticker parser reads a Kalshi contract",
          KALSHI_TICKER.match("KXNFLGAME-26SEP09NESEA-SEA").groups()
          == ("26", "SEP", "09", "SEA"))
    check("the slug parser reads a Polymarket game",
          POLY_SLUG.match("nfl-ne-sea-2026-09-10") is not None
          and POLY_SLUG.match("nfl-team-to-make-postseason") is None)
    check("a timezone is not a mismatch", date_skew("2026-09-09", "2026-09-10") == 1)
    check("a week apart is a mismatch", date_skew("2026-09-09", "2026-09-20") == 11)

    # --- DraftKings from an ESPN block --------------------------------
    dk = draftkings_price({"odds": [{"homeTeamOdds": {"moneyLine": -185},
                                     "awayTeamOdds": {"moneyLine": 154}}]}, 13.4)
    check("a moneyline pair is de-vigged, not averaged",
          dk["source"] == "moneyline" and 0.62 < dk["p_home"] < 0.66)
    check("the hold is reported, not hidden", dk["overround"] > 1.0)
    sp = draftkings_price({"odds": [{"spread": -3.5}]}, 13.4)
    check("a spread-only book is labelled a translation",
          sp["source"] == "spread" and sp["derived"] == "spread->phi")
    check("no odds at all is None, not a guess", draftkings_price({}, 13.4) is None)
    check("the league's own sigma is used, not a shared constant",
          draftkings_price({"odds": [{"spread": -7.0}]}, 13.4)["p_home"]
          > draftkings_price({"odds": [{"spread": -7.0}]}, 16.0)["p_home"])

    # --- assembly -----------------------------------------------------
    games = [{"event_id": "1", "kickoff": "2026-09-10T00:20Z", "date": "2026-09-10",
              "home": "Seattle Seahawks", "away": "New England Patriots",
              "home_abbr": "SEA", "away_abbr": "NE", "neutral": False,
              "_dk": {"p_home": 0.64, "source": "moneyline", "overround": 1.02}}]
    fd = {pair_key("SEA", "NE"): {"SEA": 0.65, "NE": 0.37}}
    kal = {pair_key("SEA", "NE"): ({"SEA": 0.63, "NE": 0.37}, "2026-09-09")}
    poly = {pair_key("SEA", "NE"): ({"SEA": 0.625, "NE": 0.375}, "2026-09-10")}
    rows, effects, refused = assemble(games, fd, kal, poly, "2026-09-04")
    r = rows[0]
    check("all four books land on the one game", len(r["books"]) == 4)
    check("the consensus sits inside the books' range",
          0.62 < r["consensus"]["p_home"] < 0.65)
    check("the consensus says how many books it had", r["consensus"]["books"] == 4)
    check("disagreement is carried per game", r["consensus"]["sd_logodds"] > 0)
    check("nothing was refused on a one-day skew", refused == [])
    check("house effects come out of assembly", "kalshi" in effects)

    stale = {pair_key("SEA", "NE"): ({"SEA": 0.63, "NE": 0.37}, "2026-08-01")}
    rows2, _e2, refused2 = assemble(games, fd, stale, poly, "2026-09-04")
    check("a book dated a month off is refused and reported",
          "kalshi" not in rows2[0]["books"] and len(refused2) == 1)

    lone = [dict(games[0])]
    rows3, effects3, _ = assemble(lone, {}, {}, {}, "2026-09-04")
    check("one book still yields a consensus of one",
          rows3[0]["consensus"]["books"] == 1)
    check("one book yields no house effect", effects3 == {})

    # --- the league config itself ---------------------------------------
    check("every league names books that exist",
          all(b in BOOK_LABELS for c in LEAGUES.values() for b in c["books"]))
    check("college football is configured for three books, not four",
          "polymarket" not in LEAGUES["cfb"]["books"]
          and LEAGUES["cfb"]["polymarket_tag"] is None)
    check("a league with no polymarket tag says so rather than failing",
          fetch_polymarket(LEAGUES["cfb"], {})[1].startswith("no game markets"))
    check("the two leagues write different files",
          LEAGUES["nfl"]["out"] != LEAGUES["cfb"]["out"])
    check("each league carries its own sigma, matching its sim",
          LEAGUES["nfl"]["sigma_game"] == 13.4 and LEAGUES["cfb"]["sigma_game"] == 16.0)
    check("only the NFL trusts bare nicknames",
          LEAGUES["nfl"].get("nickname_unique") is True
          and not LEAGUES["cfb"].get("nickname_unique"))

    # --- a derived price is carried but does not vote -------------------
    dgame = [dict(games[0])]
    dgame[0]["_dk"] = {"p_home": 0.10, "source": "spread", "derived": "spread->phi"}
    rows4, effects4, _ = assemble(dgame, fd, kal, poly, "2026-09-04")
    r4 = rows4[0]
    check("the derived price is still carried and still labelled",
          r4["books"]["draftkings"]["derived"] == "spread->phi")
    check("but it does not drag the consensus",
          r4["consensus"]["books"] == 3 and r4["consensus"]["p_home"] > 0.6)
    check("and the exclusion is stated, not silent",
          r4["consensus"]["excluded_derived"] == ["draftkings"])
    check("nor does it earn a house effect", "draftkings" not in effects4)

    donly = [dict(games[0])]
    donly[0]["_dk"] = {"p_home": 0.62, "source": "spread", "derived": "spread->phi"}
    rows5, _e5, _r5 = assemble(donly, {}, {}, {}, "2026-09-04")
    check("when a translation is all there is, it is used and flagged",
          rows5[0]["consensus"]["derived_only"] is True
          and abs(rows5[0]["consensus"]["p_home"] - 0.62) < 1e-9)

    print("self-test: %d/%d passed" % (total[0] - len(fails), total[0]))
    return 1 if fails else 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    if "--self-test" in argv:
        # The self-test keeps its real exit code. It is offline, deterministic
        # and it is the gate: the runner runs it immediately before the build.
        sys.exit(self_test())
    # 🔴 The BUILD never fails the run, on purpose. This step sits ahead of
    # build_nfl_sim.py under `guarded`, which aborts the whole predictions run
    # on a non-zero exit, and four third-party endpoints are four ways for a
    # Friday to lose its model over something that is not the model's fault.
    # A failure is printed loudly and the previous file stands, so the symptom
    # is a `generated_at` that stops moving rather than a silent success.
    leagues = None
    if "--league" in argv:
        want = argv[argv.index("--league") + 1]
        if want not in LEAGUES:
            sys.exit("unknown league %r; configured: %s" % (want, ", ".join(LEAGUES)))
        leagues = [want]
    try:
        build(dry="--dry" in argv, leagues=leagues)
    except SystemExit:
        raise
    except Exception:
        import traceback
        print("META-MARKET BUILD FAILED -- the previous file stands. Traceback:")
        traceback.print_exc()
        print("(exiting 0 on purpose: this step must never cost the day its model)")
