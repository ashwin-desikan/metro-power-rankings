#!/usr/bin/env python3
"""
Zone Zero Cup — v1 unified multi-pillar engine (INTERNAL VALIDATION).

Merges the Olympic pillar with team-sport pillars on a single common scale,
applies exponential recency decay, a Summer/Winter weight, per-sport prestige
multipliers, a tiered competition-value table with a tunable FLAGSHIP boost,
and a best-N per-sport cap. Writes internal/zzc-v1-output.md.

Competition tiers (champion / runner-up / third), boostable flagship:
    flagship      : the quadrennial world title (Football WC, Cricket ODI WC,
                    Rugby WC, FIBA WC, World Cup of Hockey). x FLAGSHIP_BOOST.
    world         : other / annual world championships (T20 WC, WTC, IIHF Worlds,
                    Handball & Volleyball Worlds).
    continental   : Euros, Copa, Asian Cup, Six Nations, Rugby Championship, etc.
    intercontinental: Confederations Cup, Nations League.
Olympic medals use gold/silver/bronze = 4/2/1 on the same scale (Winter x0.5).
Prestige multiplier scales the merged canonical sport. All knobs are tunable
and would be published on the methodology page.
"""
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "public", "data")
OUT_MD = os.path.join(ROOT, "internal", "zzc-v1-output.md")
OUT_JSON = os.path.join(ROOT, "public", "data", "zone-zero-cup.json")

NOW = 2026
HALFLIFE = 8                  # years; very harsh decay, current-era index (user-locked)
HALFLIFE_LOCKED = 8           # restore point after the sensitivity sweep mutates HALFLIFE
CAP = 10
WINTER_WEIGHT = 0.5
PERCAP_MIN = 20
FLAGSHIP_BOOST = 7.0          # the calibration lever the user is choosing

# Nations under blanket international suspension -> last eligible year.
# Their standing takes an inactivity decay for every cycle missed (factual
# competitive-status adjustment; published on the methodology page).
SUSPENDED = {"russia": 2022, "belarus": 2022}
SUSPEND_HALFLIFE = 3.0        # years; sharper than normal decay (user-locked)

# Diminishing returns within a sport: a sport's raw total is raised to GAMMA
# (concave, <1) so high-event Olympic sports (swimming ~35 golds/Games) don't
# run away on event count. Applied to pre-prestige raw, then prestige scales.
DIMINISH_GAMMA = 0.6

# Current-standing layer: live world ranking -> present-day strength, so a
# nation strong RIGHT NOW (high Elo/rating) is rewarded even without a recent
# title, and a side coasting on stale titles (Italy: 4 WCs but missed the last
# three + mid Elo) is corrected. Treated as a NOW-dated contribution (no decay).
RANK_TOP = 16.0               # strength awarded to a current world #1
RANK_HL_POSITIONS = 8.0       # halves every N ranking positions

W_G, W_S, W_B = 4, 2, 1
TIER = {                      # (champion, runner_up, third)  [pre-boost]
    "flagship": (6.0, 3.0, 1.5),
    "world": (4.0, 2.0, 1.0),
    "continental": (2.0, 1.0, 0.0),
    "intercontinental": (1.0, 0.0, 0.0),
}

PRESTIGE = {
    "Football": 3.0, "Cricket": 2.0, "Basketball": 2.0,
    "Rugby Union": 1.5, "Ice Hockey": 1.5, "Baseball": 1.5,
    "Women's Football": 1.25,  # own pillar; deliberately below the half-of-men's
                               # pattern the other women's lines follow (Ashwin, 2026-09-04)
    # Recalibrated 2026-09-04 after Gemini read the by-sport board and called
    # handball ahead of tennis the main structural anomaly on it. That is right.
    # Handball is deep and well funded across Northern and Central Europe and has
    # close to no footprint in the Americas, Africa, Australasia or most of Asia,
    # and it was outscoring a sport with four annual events each larger than the
    # handball world championship. Volleyball keeps more of its weight because
    # its case is participation and it has genuine elite leagues on three
    # continents. Handball 1.2 to 1.0, volleyball 1.2 to 1.1, tennis 0.7 to 0.9.
    "Volleyball": 1.1, "Handball": 1.0,
    "Athletics": 1.0,   # the foundational Olympic sport (track & field); lifted above the 0.5 Olympic default
    "Rugby League": 0.4,   # contested at a high level by ~2-4 nations; low depth
    "Women's Basketball": 1.0, "Women's Volleyball": 0.55, "Women's Handball": 0.5,  # ~half the men's, like Women's Football
    "Women's Ice Hockey": 0.75,   # half of Ice Hockey's 1.5, the same rule
    # Racquet / precision individual sports, hugely popular across large-population
    # regions (golf worldwide; tennis global; badminton & table tennis across Asia).
    # Lifted from their earlier suppressed levels so they are not collectively
    # underweighted, while still below the major team sports.
    "Tennis": 0.9, "Golf": 0.6, "Badminton": 0.6, "Table Tennis": 0.6,
    # Road cycling: a year-round professional sport with a national-team world
    # championship, held at the Olympic default of 0.5 only because nobody had
    # given it a line of its own. Lifted just below athletics.
    "Cycling Road": 0.9,
}

# Default prestige for Olympic-programme sports (everything not in PRESTIGE):
# a downweight lever so the many individual Olympic disciplines don't collectively
# outweigh the major globally-followed team sports. (user-set)
OLYMPIC_PRESTIGE = 0.5

# Country-specific prestige overrides: a sport that is globally shallow (low
# PRESTIGE) but culturally major in a particular country gets a higher effective
# prestige for THAT nation only, so its domestic stature is reflected without
# inflating the sport everywhere. Keyed by (folded slug, canonical sport);
# overrides PRESTIGE for that one nation-sport pair. (user-curated)
COUNTRY_SPORT_PRESTIGE = {
    ("australia", "Rugby League"): 1.5,      # ~Aussie Rules stature; AUS dominate the RLWC
    ("new-zealand", "Rugby League"): 1.5,    # the Kiwis, a genuine RL nation
    ("great-britain", "Rugby League"): 1.5,  # northern England's game (folds England)
    ("india", "Hockey"): 2.5,                # field hockey, the historic national sport (8 Olympic golds)
    ("pakistan", "Hockey"): 2.5,             # field hockey, national sport (most World Cups)
    ("cuba", "Baseball"): 2.0,               # baseball, the national sport
    ("chinese-taipei", "Baseball"): 2.0,     # baseball, the national sport of Taiwan
    ("netherlands", "Hockey"): 1.5,          # field hockey, elite men's & women's program
}

# Disciplines the Cup scores as one pillar. The test is the one this table has
# always applied, made explicit: the same activity in a different format is one
# sport, and a different activity under a shared federation is not. 3x3 is
# basketball on half a court; beach volleyball is volleyball on sand; short track
# is speed skating on a smaller oval; the 10km marathon swim is the same freestyle
# stroke over a longer course, and the same swimmers contest both. Figure skating
# shares a federation with speed skating and is a different activity, so it keeps
# its own pillar, and the same reasoning keeps slalom apart from sprint canoeing,
# BMX freestyle apart from BMX racing, and diving and water polo apart from the
# pool they share.
#
# The merge happens before the cap and before diminishing returns, which is the
# point of it. Left split, a nation deep in one sport spends two of its ten
# scoring slots on it and gets two separate concave curves instead of one, so
# splitting a sport quietly pays better than winning at it.
OLY_CANON = {
    "3x3 Basketball": "Basketball", "Basketball": "Basketball",
    "Beach Volleyball": "Volleyball", "Volleyball": "Volleyball",
    "Short Track Speed Skating": "Speed Skating", "Speed Skating": "Speed Skating",
    "Marathon Swimming": "Swimming", "Swimming": "Swimming",
    "Football": "Football", "Handball": "Handball", "Ice Hockey": "Ice Hockey",
    "Rugby": "Rugby Union", "Rugby sevens": "Rugby Union", "Rugby Sevens": "Rugby Union",
    "Baseball": "Baseball",
}

# Women's Olympic team-sport medals are split out of the gender-mixed breakdown
# into their own canonical slots (the men's/mixed slot becomes men's-only). Source:
# public/data/olympics/womens-team-medals.json (scripts/olympics/build_womens_team_medals.py).
WOMENS_TEAM_CANON = {
    "Basketball": "Women's Basketball", "3x3 Basketball": "Women's Basketball",
    "Volleyball": "Women's Volleyball", "Beach Volleyball": "Women's Volleyball",
    "Handball": "Women's Handball", "Field Handball": "Women's Handball",
    "Hockey": "Women's Hockey", "Water Polo": "Women's Water Polo",
    # Added 2026-09-04. The women's tournament has been on the programme since
    # 1998 and its medal table is not the men's: Canada and the United States
    # have taken every gold, which the mixed row was hiding. This splits the
    # Olympic half only. The Ice Hockey title pillar reads the IIHF men's world
    # championship, so Women's Ice Hockey is currently Olympic medals alone and
    # is understated until the women's worlds are added to hockey/nations.json.
    "Ice Hockey": "Women's Ice Hockey",
}

FOLD = {
    "england": "great-britain", "scotland": "great-britain",
    "wales": "great-britain", "northern-ireland": "great-britain",
    "ireland": "ireland",
    "czech-republic": "czechia", "cote-d-ivoire": "ivory-coast",
    "united-kingdom": "great-britain",
}
COMPOSITE = {"west-indies", "team-europe"}   # multi-nation teams (distributed, see below)
# West Indies cricket (a multi-nation side) is distributed equally across its core
# cricketing member nations rather than parked on a composite entry, so the islands
# that supply the players get the credit and appear in the per-capita view. The
# non-cricketing micro-territories (Anguilla, Montserrat, BVI, USVI) are excluded.
# West Indies cricket merit is split across member territories in proportion to
# how many West Indies Test cricketers each has produced (the fairest measure of
# contribution to the team's success). Big three from the player-production data
# (of 385 men 1928-2022: Barbados 98, Jamaica 83, Trinidad 83); Guyana the clear
# fourth; the small Windwards minor (approximate).
WI_DISTRIBUTE = {"barbados": 98, "jamaica": 83, "trinidad-tobago": 83, "guyana": 50,
                 "antigua-barbuda": 18, "grenada": 4, "saint-lucia": 3, "dominica": 2}
# Team Europe (2016 World Cup of Hockey) was an ad-hoc all-star side of European
# nations not otherwise represented; split evenly across them (equal weights)
# rather than standing as a "country" of its own.
EUROPE_DISTRIBUTE = {n: 1 for n in ["germany", "switzerland", "denmark", "slovakia",
                                    "slovenia", "france", "norway", "austria"]}
COMPOSITE_DISTRIBUTE = {"west-indies": WI_DISTRIBUTE, "team-europe": EUROPE_DISTRIBUTE}
# On top of the proportional split, every West Indies cricketing member gets a flat
# cricket upweight so each has a meaningful score (smallest floored at ~2.1). (user-set)
WI_CRICKET_FLOOR_BONUS = 1.8

# Codified national sports: domestically major, internationally negligible. They
# do NOT compete for cap slots; instead each grants a small fixed recognition
# bonus added on top of a nation's best-10 international sports. Tiered by global
# footprint: American football highest, Aussie rules a notch below, the rest a
# common token. (Lacrosse, speedway and the women's competitions are deferred.)
NATIONAL_SPORTS = [
    # (sport label, token, [nation slugs])
    ("American Football", 25.0, ["united-states"]),
    ("Australian Rules Football", 9.0, ["australia"]),
    ("Kabaddi", 5.5, ["india"]),
    ("Kabaddi", 2.5, ["bangladesh"]),
    ("Canadian Football", 2.5, ["canada"]),
    ("Gaelic Football", 2.5, ["ireland"]),
    ("Hurling", 2.5, ["ireland"]),
    ("Sumo", 6.0, ["japan"]),
    ("Bandy", 2.5, ["russia", "sweden"]),
    ("Pesäpallo", 2.5, ["finland"]),   # Finnish baseball, the national sport
    ("Rugby League", 2.5, ["papua-new-guinea"]),   # the one nation where RL is THE national sport
]

# Motorsport: a global sport with a weak national unit. The constructor is a
# company and the driver's nationality is a passport, so there is no national
# competition to build a pillar on. It enters the same way a national sport does:
# a recognition bonus added on top of the capped best-10, never competing for a
# cap slot. (Release 1a, Ashwin 2026-09-04; widened beyond Formula 1 in 1b.)
#
# Which series count. Any top-tier championship with a season-long drivers' title
# is credited, and how international its field is sets the weight rather than
# deciding entry. An earlier draft excluded a series whose champions were all one
# nationality, which put NASCAR among the national sports; Ashwin overruled it on
# 2026-09-04, and he is right. A concentrated winner list is a fact about a series
# worth recording, not grounds for refusing to record it, and splitting motorsport
# across two different kinds of row made the sport harder to read rather than more
# accurate. Endurance racing stays out for a different reason that still holds:
# its titles are won by mixed-nationality crews, so attribution is ambiguous by
# construction rather than merely uncertain.
#
# Formula 1 is read live from the F1 pipeline at weight 1.00. Every other series
# and its weight live in scripts/data/motorsport-series.json, which carries the
# reasoning per series.
#
# BETA is anchored against the existing national-sport tokens, which run 2.5
# (hurling) to 25.0 (American football, the USA's biggest domestic sport). CAP
# binds only on a genuine dynasty across several series at once.
# Raised 2.0 to 2.3 on 2026-09-04. The argument, from Gemini and accepted by
# Ashwin, is footprint: Formula 1 alone runs a year-round professional economy
# above a billion and a half viewers, and motorsport was scoring below swimming
# and level with wrestling, two sports with little professional life outside the
# Games. The reservation stands and is worth writing down rather than burying:
# this is a ranking of nations, and motorsport's national unit is the weakest on
# the board, a driver's passport attached to a company's car. The raise is a
# judgement about how much of the sporting world the row should represent, not a
# claim that the attribution problem got better.
MOTORSPORT_BETA = 2.3
MOTORSPORT_CAP = 18.0
MOTORSPORT_SERIES_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "motorsport-series.json")

# Drivers' championships are recorded by nationality as a demonym. Explicit map,
# because a wrong guess here silently credits the wrong country.
MOTORSPORT_NAT_SLUG = {
    "British": "great-britain", "German": "germany", "Brazilian": "brazil",
    "Argentine": "argentina", "Australian": "australia", "Austrian": "austria",
    "Finnish": "finland", "French": "france", "Italian": "italy",
    "Dutch": "netherlands", "Spanish": "spain", "American": "united-states",
    "New Zealander": "new-zealand", "South African": "south-africa",
    "Canadian": "canada", "Swedish": "sweden", "Mexican": "mexico",
    "Colombian": "colombia", "Swiss": "switzerland", "Portuguese": "portugal",
    "Belgian": "belgium", "Estonian": "estonia", "Norwegian": "norway",
    "Danish": "denmark", "Polish": "poland", "Russian": "russia",
}
# Kept under the old name so anything still importing it does not break.
F1_NAT_SLUG = MOTORSPORT_NAT_SLUG


def _motorsport_series():
    """Every credited series as (label, weight, [(year, nat, credit)]).

    Formula 1 comes from the live pipeline; the rest from the curated file. A
    missing or unreadable source returns nothing for that series rather than
    raising: the Cup should still build, one line lighter.
    """
    out = []
    path = os.path.join(D, "f1", "data.json")
    if not os.path.exists(path):
        print("  motorsport: f1/data.json missing, Formula 1 skipped")
    else:
        try:
            champs = json.load(open(path, encoding="utf-8")).get("champions") or []
            out.append(("Formula 1", 1.0,
                        [(r.get("season"), r.get("driver_nat"), 1.0) for r in champs]))
        except (ValueError, OSError) as e:
            print(f"  motorsport: f1/data.json unreadable ({e}), Formula 1 skipped")
    if not os.path.exists(MOTORSPORT_SERIES_FILE):
        print("  motorsport: motorsport-series.json missing, only Formula 1 counted")
        return out
    try:
        doc = json.load(open(MOTORSPORT_SERIES_FILE, encoding="utf-8"))
    except (ValueError, OSError) as e:
        print(f"  motorsport: motorsport-series.json unreadable ({e}), only Formula 1 counted")
        return out
    for sr in doc.get("series") or []:
        out.append((sr["label"], float(sr["weight"]),
                    [(c.get("year"), c.get("nat"), float(c.get("credit", 1.0)))
                     for c in sr.get("champions") or []]))
    return out


def motorsport_bonus(detail=False):
    """Decayed drivers' titles across the credited series, by nationality.

    Same half-life as everything else in the Cup, so a 1990 title is worth
    little and the board reflects who is winning now. Returns {slug: points}
    with the cap applied, or with detail=True also the per-series breakdown.
    """
    unmapped, dec = set(), defaultdict(float)
    by_series = defaultdict(lambda: defaultdict(float))
    for label, weight, rows in _motorsport_series():
        for yr, nat, credit in rows:
            if not nat or not yr:
                continue
            slug = MOTORSPORT_NAT_SLUG.get(nat)
            if not slug:
                unmapped.add(nat)
                continue
            v = weight * credit * 0.5 ** ((NOW - int(yr)) / HALFLIFE_LOCKED)
            dec[fold(slug)] += v
            by_series[label][fold(slug)] += v
    if unmapped:
        print(f"  motorsport: UNMAPPED nationalities, no credit given: {sorted(unmapped)}")
    pts = {s: min(MOTORSPORT_CAP, MOTORSPORT_BETA * v) for s, v in dec.items() if v > 0}
    return (pts, {k: dict(v) for k, v in by_series.items()}) if detail else pts


# Domestic-strength / foundational boosts: additive to merit like the national
# sports above, BUT for sports the nation ALREADY scores in. They are NOT shown
# as a separate "national sports" recognition line (that would visually duplicate
# the sport's existing pillar). Credits domestic-league strength / historic role
# the international title-and-ranking model misses.
DOMESTIC_BOOST = [
    ("Handball", 5.0, ["germany"]),            # the Bundesliga is the world's strongest handball league
    ("Football", 14.0, ["great-britain"]),     # home of the modern game + the strongest domestic league (Premier League)
    ("Rugby League", 2.0, ["great-britain"]),  # the sport's heartland (Super League, Challenge Cup)
    ("Rugby League", 4.0, ["australia"]),      # the dominant RL nation; the NRL is the premier league
    ("Futsal", 3.0, ["spain"]),                # a hugely popular sport in Spain
    ("Basketball", 4.0, ["china"]),             # basketball is enormously popular in China
]

_DC = {}
def decay(year):
    if year not in _DC:
        _DC[year] = 0.5 ** ((NOW - year) / HALFLIFE)
    return _DC[year]


# Football uses a much gentler, heritage-style decay: it is the one sport where
# all-time World Cup pedigree is the defining measure, so a 1970 or 1994 title
# should still count heavily. This is what keeps Brazil (five World Cups, the
# most ever) at the head of the football order despite none since 2002.
FOOTBALL_HALFLIFE = 45
_FBDC = {}
def fb_decay(year):
    if year not in _FBDC:
        _FBDC[year] = 0.5 ** ((NOW - year) / FOOTBALL_HALFLIFE)
    return _FBDC[year]


def years(v):
    if not v:
        return []
    if isinstance(v, list):
        return [int(y) for y in v]
    return [int(x) for x in re.findall(r"(19\d{2}|20\d{2})", str(v))]


def fold(slug):
    return FOLD.get(slug, slug)


def tier_pts(tier, finish, boost):
    c, r, t = TIER[tier]
    val = {"champion": c, "runner_up": r, "third": t}[finish]
    if tier == "flagship":
        val *= boost
    return val


# ---------------------------------------------------------------- pillars
def olympic_contribs(boost):
    bd = json.load(open(os.path.join(D, "olympics", "medals-breakdown.json"), encoding="utf-8"))
    slugs, sports, rows = bd["slugs"], bd["sports"], bd["rows"]
    # women's team-sport medals, keyed identically to the mixed breakdown, so the
    # men's contribution is exactly (mixed - women's). Same lineage fold + slugs.
    wm = {}
    wpath = os.path.join(D, "olympics", "womens-team-medals.json")
    if os.path.exists(wpath):
        wd = json.load(open(wpath, encoding="utf-8"))
        wsl, wsp = wd["slugs"], wd["sports"]
        for si, year, season, spi, g, s, b in wd["rows"]:
            wm[(wsl[si], year, season, wsp[spi])] = (g, s, b)
    out = []
    for si, year, season, spi, g, s, b in rows:
        base = W_G * g + W_S * s + W_B * b
        if base == 0:
            continue
        sw = WINTER_WEIGHT if season == 1 else 1.0
        spname = sports[spi]
        # Olympic football excluded from the men's Football pillar (mixed-gender;
        # scored via the dedicated men's/women's football pillars instead).
        if OLY_CANON.get(spname, spname) == "Football":
            continue
        if spname in WOMENS_TEAM_CANON:
            wg, ws, wb = wm.get((slugs[si], year, season, spname), (0, 0, 0))
            men_base = W_G * (g - wg) + W_S * (s - ws) + W_B * (b - wb)
            wom_base = W_G * wg + W_S * ws + W_B * wb
            slug = fold(slugs[si]); dk = decay(year) * sw
            if men_base != 0:
                out.append((slug, OLY_CANON.get(spname, spname), men_base * dk))
            if wom_base != 0:
                out.append((slug, WOMENS_TEAM_CANON[spname], wom_base * dk))
            continue
        out.append((fold(slugs[si]), OLY_CANON.get(spname, spname), base * decay(year) * sw))
    return out


def _titles(out, slug, sport, ylist, finish, tier, boost):
    pts = tier_pts(tier, finish, boost)
    if pts == 0:
        return
    s = fold(slug)
    for y in ylist:
        out.append((s, sport, pts * decay(y)))


def _conf_strength(comp):
    """Confederation strength for a continental football title — not all
    continental crowns are equal (a CONCACAF Gold Cup is not a Euros)."""
    c = (comp or "").lower()
    if "european championship" in c or "copa" in c:
        return 1.0                      # UEFA, CONMEBOL
    if "nations league" in c:
        return 0.35 if "uefa" in c else 0.15
    if "confederations" in c:
        return 0.5                      # featured continental champions globally
    if "gold cup" in c or "asian cup" in c or "africa cup" in c:
        return 0.35                     # CONCACAF, AFC, CAF: weaker confederations
    if "oceania" in c or "ofc" in c:
        return 0.2                      # OFC
    return 0.5                          # unknown continental: conservative


def football_contribs(boost):
    f = json.load(open(os.path.join(D, "international", "finals.json"), encoding="utf-8"))
    cat_tier = {"WC": "flagship", "CON": "continental",
                "INTER": "intercontinental", "OTHER": "intercontinental"}
    out = []
    for slug, lst in f.items():
        for e in lst:
            if e.get("competition") == "Olympic Games":
                continue
            tier = cat_tier.get(e.get("category"))
            yr = e.get("year")
            if not tier or not yr:
                continue
            finish = "champion" if e.get("result") == "W" else "runner_up"
            pts = tier_pts(tier, finish, boost)
            if tier != "flagship":      # weight non-World-Cup titles by confederation
                pts *= _conf_strength(e.get("competition"))
            if not pts:
                continue
            # Only WINNING the World Cup gets the gentle heritage decay; runner-up
            # finishes and all continental titles stay on the normal recency clock,
            # so eternal World-Cup pedigree (Brazil's five) leads without rewarding
            # ancient losing finalists.
            d = fb_decay(int(yr)) if (tier == "flagship" and finish == "champion") else decay(int(yr))
            out.append((fold(slug), "Football", pts * d))
    return out


def womensfootball_contribs(boost):
    """Women's Football pillar: WWC (flagship), Women's Euros (continental),
    Finalissima (intercontinental). Olympic women's football is excluded (it
    lives in the Olympic backbone, exactly as men's Olympic football is)."""
    out = []
    wwc = json.load(open(os.path.join(D, "football", "womens-world-cup.json"), encoding="utf-8"))
    for e in wwc.get("editions", []):
        y = int(e["year"])
        if e.get("champion_slug"):
            _titles(out, e["champion_slug"], "Women's Football", [y], "champion", "flagship", boost)
        if e.get("runner_up_slug"):
            _titles(out, e["runner_up_slug"], "Women's Football", [y], "runner_up", "flagship", boost)
    eu = json.load(open(os.path.join(D, "wintl", "euros.json"), encoding="utf-8"))
    enames = {n["name"]: n["slug"] for n in eu.get("nations", [])}
    for f in eu.get("finals", []):
        y = int(re.match(r"(\d{4})", str(f.get("year"))).group(1))
        cs, rs = enames.get(f.get("champion")), enames.get(f.get("runner_up"))
        if cs:
            _titles(out, cs, "Women's Football", [y], "champion", "continental", boost)
        if rs:
            _titles(out, rs, "Women's Football", [y], "runner_up", "continental", boost)
    fi = json.load(open(os.path.join(D, "wintl", "finalissima.json"), encoding="utf-8"))
    fnames = {n["name"]: n["slug"] for n in fi.get("nations", [])}
    for f in fi.get("finals", []):
        y = int(re.match(r"(\d{4})", str(f.get("year"))).group(1))
        cs = fnames.get(f.get("champion"))
        if cs:
            _titles(out, cs, "Women's Football", [y], "champion", "intercontinental", boost)
    return out


def cricket_contribs(boost):
    teams = json.load(open(os.path.join(D, "cricket", "teams.json"), encoding="utf-8"))
    comp_tier = {"wc": "flagship", "t20wc": "world", "wtc": "world",
                 "ct": "continental", "asia": "continental"}
    out = []
    for t in teams:
        hon = t.get("honours") or {}
        for comp, tier in comp_tier.items():
            blk = hon.get(comp) or {}
            _titles(out, t["slug"], "Cricket", years(blk.get("title_years")), "champion", tier, boost)
            _titles(out, t["slug"], "Cricket", years(blk.get("ru_years")), "runner_up", tier, boost)
    return out


def rugby_contribs(boost):
    teams = json.load(open(os.path.join(D, "rugby-union", "teams.json"), encoding="utf-8"))
    out = []
    for t in teams:
        rwc = t.get("rwc") or {}
        _titles(out, t["slug"], "Rugby Union", years(rwc.get("title_years")), "champion", "flagship", boost)
        ch = t.get("championships") or {}
        # Six Nations + The Rugby Championship / Tri-Nations = continental tier
        _titles(out, t["slug"], "Rugby Union", years(ch.get("five_six_years")), "champion", "continental", boost)
        _titles(out, t["slug"], "Rugby Union", years(ch.get("trc_years")), "champion", "continental", boost)
    return out


def _medal_years(path, sport, fields, boost):
    data = json.load(open(path, encoding="utf-8"))
    out = []
    for rec in data:
        for key, (tier, finish) in fields.items():
            _titles(out, rec.get("slug"), sport, years(rec.get(key)), finish, tier, boost)
    return out


def basketball_contribs(boost):
    return _medal_years(os.path.join(D, "basketball", "nations.json"), "Basketball",
                        {"wc_title_years": ("flagship", "champion"),
                         "wc_ru_years": ("flagship", "runner_up")}, boost)


def hockey_contribs(boost):
    return _medal_years(os.path.join(D, "hockey", "nations.json"), "Ice Hockey",
                        {"wc_title_years": ("flagship", "champion"), "wc_ru_years": ("flagship", "runner_up"),
                         "worlds_gold_years": ("world", "champion"), "worlds_silver_years": ("world", "runner_up"),
                         "worlds_bronze_years": ("world", "third")}, boost)


def handball_contribs(boost):
    return _medal_years(os.path.join(D, "handball", "nations.json"), "Handball",
                        {"worlds_gold_years": ("world", "champion"), "worlds_silver_years": ("world", "runner_up"),
                         "worlds_bronze_years": ("world", "third")}, boost)


def volleyball_contribs(boost):
    return _medal_years(os.path.join(D, "volleyball", "nations.json"), "Volleyball",
                        {"worlds_gold_years": ("world", "champion"), "worlds_silver_years": ("world", "runner_up"),
                         "worlds_bronze_years": ("world", "third")}, boost)


def baseball_contribs(boost):
    d = json.load(open(os.path.join(D, "baseball", "teams.json"), encoding="utf-8"))
    out = []
    for t in d:
        _titles(out, t["slug"], "Baseball", years(t.get("title_years")), "champion", "flagship", boost)
        _titles(out, t["slug"], "Baseball", years(t.get("ru_years")), "runner_up", "flagship", boost)
    return out


def rugby_league_contribs(boost):
    d = json.load(open(os.path.join(D, "rugby-league-intl", "teams.json"), encoding="utf-8"))
    out = []
    for t in d:
        # title_years entries can be reign ranges ('1985-1988'); take the first year (one title)
        # NOT flagship tier: the RL World Cup is not a globally contested marquee
        for entry in (t.get("title_years") or []):
            m = re.match(r"(\d{4})", str(entry))
            if m:
                _titles(out, t["slug"], "Rugby League", [int(m.group(1))], "champion", "world", boost)
        for entry in (t.get("ru_years") or []):
            m = re.match(r"(\d{4})", str(entry))
            if m:
                _titles(out, t["slug"], "Rugby League", [int(m.group(1))], "runner_up", "world", boost)
    return out


# Depth discount on the current-ranking layer for narrow sports: being roughly
# 10th in a ~12-nation sport is not worth being 10th in 200-nation football, so
# cricket and baseball associates with no titles don't bank a large ranking bonus.
def golf_contribs(boost):
    # Men's majors (The Open, U.S. Open, PGA, Masters) as world-tier titles, one
    # per championship per year, 8y decay. Non-Olympic, so merges cleanly with the
    # Olympic golf medals already in the canonical "Golf" slot. Ryder Cup is
    # excluded: it is USA vs Europe, a continent, not a nation.
    recs = json.load(open(os.path.join(D, "majors", "zzc-titles.json"), encoding="utf-8"))["nations"]
    out = []
    for r in recs:
        _titles(out, r["slug"], "Golf", r.get("golf_years") or [], "champion", "world", boost)
    return out


def tennis_contribs(boost):
    # Grand Slam singles titles (men's + women's) plus the Davis Cup, all world
    # tier, 8y decay; merges with Olympic tennis medals in the "Tennis" slot.
    # Occupation-era unrecognized titles are excluded upstream in the feed.
    recs = json.load(open(os.path.join(D, "majors", "zzc-titles.json"), encoding="utf-8"))["nations"]
    out = []
    for r in recs:
        _titles(out, r["slug"], "Tennis", r.get("slam_years") or [], "champion", "world", boost)
        _titles(out, r["slug"], "Tennis", r.get("davis_title_years") or [], "champion", "world", boost)
        _titles(out, r["slug"], "Tennis", r.get("davis_ru_years") or [], "runner_up", "world", boost)
    return out


RANK_SPORT_WEIGHT = {"Cricket": 0.35, "Baseball": 0.35}


def rank_strength(rank):
    if not rank or rank < 1:
        return 0.0
    return RANK_TOP * (0.5 ** ((rank - 1) / RANK_HL_POSITIONS))


def ranking_contribs(boost):
    """Current-standing layer: live world rankings -> present-day strength (no decay)."""
    out = []
    # football Elo
    idx = json.load(open(os.path.join(D, "international", "index.json"), encoding="utf-8"))["teams"]
    for t in idx:
        v = rank_strength(t.get("elo_rank"))
        if v:
            out.append((fold(t["slug"]), "Football", v))
    # basketball FIBA — full ranking file (160 nations) so ranking-only sides
    # like Great Britain are included, not just the medal/World-Cup honour list
    for t in json.load(open(os.path.join(D, "basketball", "fiba_ranking.json"), encoding="utf-8"))["teams"]:
        sl = t.get("country_slug") or t.get("slug")
        v = rank_strength(t.get("rank"))
        if sl and v:
            out.append((fold(sl), "Basketball", v))
    # rugby union World Rugby ranking
    for t in json.load(open(os.path.join(D, "rugby-union", "teams.json"), encoding="utf-8")):
        v = rank_strength((t.get("ranking") or {}).get("current"))
        if v:
            out.append((fold(t["slug"]), "Rugby Union", v))
    # cricket: ONE ranking signal per nation = best (lowest) rank across the
    # three formats, so cricket is not triple-counted vs single-ranking sports
    cteams = json.load(open(os.path.join(D, "cricket", "teams.json"), encoding="utf-8"))
    name2slug = {t["name"]: t["slug"] for t in cteams}
    cr = json.load(open(os.path.join(D, "cricket", "hub.json"), encoding="utf-8")).get("current_rankings", {})
    cbest = {}
    for fmt, blk in cr.items():
        for row in (blk.get("rows") or []):
            slug = name2slug.get(row.get("team"))
            rk = row.get("rank")
            if slug and rk and (slug not in cbest or rk < cbest[slug]):
                cbest[slug] = rk
    for slug, rk in cbest.items():
        v = rank_strength(rk) * RANK_SPORT_WEIGHT.get("Cricket", 1.0)
        if v:
            out.append((fold(slug), "Cricket", v))
    # ice hockey (IIHF) + baseball (WBSC) current world rankings -> engine slug
    for fn, sport in (("hockey-men", "Ice Hockey"), ("baseball-men", "Baseball"), ("volleyball-men", "Volleyball"), ("handball-men", "Handball")):
        rk = json.load(open(os.path.join(D, "rankings", fn + ".json"), encoding="utf-8"))
        for row in rk["rows"]:
            es = row.get("engineSlug")
            v = rank_strength(row.get("rank")) * RANK_SPORT_WEIGHT.get(sport, 1.0)
            if es and v:
                out.append((fold(es), sport, v))
    # women's football (FIFA) -> best rank per folded slug (home nations fold to GB)
    wbest = {}
    for row in json.load(open(os.path.join(D, "rankings", "womens-football.json"), encoding="utf-8"))["rows"]:
        es = row.get("engineSlug")
        if not es:
            continue
        s = fold(es)
        if s not in wbest or row["rank"] < wbest[s]:
            wbest[s] = row["rank"]
    for s, r in wbest.items():
        v = rank_strength(r)
        if v:
            out.append((s, "Women's Football", v))
    return out


# Extra ranking-only sports: water polo, futsal, table tennis, badminton. No
# title pillar and not in the League hubs; they contribute solely via the
# current-standing layer (snapshot in public/data/rankings/zzc-extra.json, built
# by scripts/build_extra_rankings.py). Water polo / table tennis / badminton are
# Olympic, so this merges into their existing canonical slots; Futsal is new.
EXTRA_RANK_WEIGHT = 1.0
def extra_ranking_contribs(boost):
    path = os.path.join(D, "rankings", "zzc-extra.json")
    if not os.path.exists(path):
        return []
    data = json.load(open(path, encoding="utf-8"))
    # Fold home nations (England/Scotland/Wales/NI -> Great Britain) by BEST
    # rank rather than summing each member, so a multi-home-nation side such as
    # GB netball is credited with its strongest member (England), not an
    # inflated stack of all four. Matches the best-per-folded-slug rule the
    # other current-ranking layers use.
    best = {}
    for sport, blk in data["sports"].items():
        for slug, rank in blk["ranks"]:
            if slug in SUSPENDED:
                continue
            k = (fold(slug), sport)
            if k not in best or rank < best[k]:
                best[k] = rank
    out = [(slug, sport, rank_strength(rank) * EXTRA_RANK_WEIGHT)
           for (slug, sport), rank in best.items()]
    return out


# --- Netball: title pillar (Netball World Cup) -----------------------------
# Netball is women's-only and off the Olympic programme, so its world title is
# its definitive achievement. Scored as a world championship (no x7 flagship
# boost, which is reserved for globally-contested sports) on the standard
# 8-year recency decay, paired with the current-standing rank from
# zzc-extra.json. Placement bases: champion 4, runner-up 2, third 1, fourth
# 0.5. Source: Netball World Cup results 1963-2023 (user-supplied).
NETBALL_BASE = {"C": 4.0, "R": 2.0, "3": 1.0, "4": 0.5}
NETBALL_WC = {
    "australia":       {"C": [1963, 1971, 1975, 1979, 1983, 1991, 1995, 1999,
                              2007, 2011, 2015, 2023],
                        "R": [1967, 1987, 2003, 2019]},
    "new-zealand":     {"C": [1967, 1979, 1987, 2003, 2019],
                        "R": [1963, 1971, 1983, 1991, 1999, 2007, 2011, 2015],
                        "3": [1975], "4": [2023]},
    "trinidad-tobago": {"C": [1979], "R": [1987], "3": [1983],
                        "4": [1963, 1971, 1975]},
    "england":         {"R": [1975, 2023],
                        "3": [1963, 1971, 1999, 2011, 2015, 2019],
                        "4": [1967, 1979, 1983, 1987, 1991, 1995]},
    "south-africa":    {"R": [1995], "3": [1967], "4": [2019]},
    "jamaica":         {"3": [1991, 2003, 2007, 2023],
                        "4": [1971, 1999, 2011, 2015]},
}


# --- Road cycling: title pillar --------------------------------------------
# Road cycling was scored from Olympic medals alone, which gave the entire sport
# 20.9 points on the board: below golf, and barely half of track cycling. The
# cause is structural rather than a missing file. The Games award two road events
# per gender against six or more on the track, so an Olympic-only pillar measures
# how many medals the IOC hands out and not how much of the sport there is. The
# Tour, the Giro, the Vuelta and the world championship road race counted for
# nothing at all. (Ashwin, 2026-09-04.)
#
# The world championship road race is deliberately the highest-scoring line here.
# It is the one race contested by national teams rather than trade teams, which
# makes it the properly national title in a sport that spends the rest of the
# year racing for companies, and this is a ranking of nations. The Tour sits just
# below it, and the other Grand Tours below that.
#
# Women's editions are scored on the same scale as the men's and land in the same
# pillar, on the argument the Cup already applies to athletics, swimming and
# tennis: one sport, both genders, one row. The women's Grand Tours are recent,
# so they contribute what their short history earns rather than a token.
ROAD_CYCLING_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "road-cycling.json")
ROAD_TIER_PTS = {
    "worlds_men": 3.5, "worlds_women": 3.5,
    "tour": 3.0, "giro": 2.0, "vuelta": 1.75,
    "tdf_femmes": 2.0, "giro_women": 1.5,
}
# Cycling demonyms the motorsport map does not carry.
ROAD_NAT_EXTRA = {
    "Latvian": "latvia", "Slovak": "slovakia", "Portuguese": "portugal",
    "Norwegian": "norway", "Lithuanian": "lithuania", "Belarusian": "belarus",
    "Swedish": "sweden", "Kazakh": "kazakhstan", "Ecuadorian": "ecuador",
    "Luxembourgish": "luxembourg", "Colombian": "colombia",
    "Slovenian": "slovenia", "Danish": "denmark", "Belgian": "belgium",
    "Swiss": "switzerland", "Russian": "russia", "Polish": "poland",
}


def road_cycling_contribs(boost):
    """Grand Tour and world championship road titles, by rider nationality.

    The Tour de France winner list is NOT duplicated here. The site already
    holds it in champions-history.json from 1903, and this reads that record so
    the two can never disagree; only the riders' nationalities come from the
    curated file. The seven Tours the UCI annulled are skipped explicitly,
    because champions-history still lists the original rider.

    A missing or unreadable source drops that part rather than raising.
    """
    if not os.path.exists(ROAD_CYCLING_FILE):
        print("  road cycling: road-cycling.json missing, pillar skipped")
        return []
    try:
        doc = json.load(open(ROAD_CYCLING_FILE, encoding="utf-8"))
    except (ValueError, OSError) as e:
        print(f"  road cycling: road-cycling.json unreadable ({e}), pillar skipped")
        return []
    nat_slug = dict(MOTORSPORT_NAT_SLUG)
    nat_slug.update(ROAD_NAT_EXTRA)
    unmapped, acc = set(), defaultdict(float)

    def credit(nat, year, key):
        slug = nat_slug.get(nat)
        if not slug:
            unmapped.add(nat)
            return
        acc[fold(slug)] += ROAD_TIER_PTS[key] * decay(int(year))

    for key in ("worlds_men", "worlds_women", "giro", "vuelta",
                "tdf_femmes", "giro_women"):
        for year, nat in doc.get(key) or []:
            credit(nat, year, key)

    # The Tour, read from the site's own champions record.
    vacated = set(doc.get("tdf_vacated") or [])
    riders = doc.get("riders") or {}
    hist = os.path.join(D, "champions-history.json")
    if not os.path.exists(hist):
        print("  road cycling: champions-history.json missing, Tour de France skipped")
    else:
        try:
            rows = json.load(open(hist, encoding="utf-8"))
        except (ValueError, OSError) as e:
            print(f"  road cycling: champions-history unreadable ({e}), Tour skipped")
            rows = []
        unknown_riders = set()
        for r in rows:
            if r.get("sport") != "Cycling" or r.get("competition") != "Tour de France":
                continue
            yr = r.get("year")
            if not yr or int(yr) < 1990 or int(yr) in vacated:
                continue
            nat = riders.get(r.get("champion") or "")
            if not nat:
                unknown_riders.add(r.get("champion"))
                continue
            credit(nat, yr, "tour")
        if unknown_riders:
            print("  road cycling: Tour winners with no nationality on file, "
                  f"no credit given: {sorted(unknown_riders)}")
    if unmapped:
        print(f"  road cycling: UNMAPPED nationalities: {sorted(unmapped)}")
    return [(sl, "Cycling Road", v) for sl, v in acc.items() if v > 0]


def netball_titles_contribs(boost):
    out = []
    for slug, places in NETBALL_WC.items():
        v = sum(NETBALL_BASE[p] * decay(y) for p, years in places.items() for y in years)
        if v > 0:
            out.append((fold(slug), "Netball", v))
    return out


PILLARS = [("olympics", olympic_contribs), ("football", football_contribs),
           ("womens_football", womensfootball_contribs),
           ("cricket", cricket_contribs), ("rugby", rugby_contribs),
           ("basketball", basketball_contribs), ("hockey", hockey_contribs),
           ("handball", handball_contribs), ("volleyball", volleyball_contribs),
           ("baseball", baseball_contribs), ("rugby_league", rugby_league_contribs),
           ("golf", golf_contribs), ("tennis", tennis_contribs),
           ("netball", netball_titles_contribs),
           ("road_cycling", road_cycling_contribs),
           ("ranking", ranking_contribs), ("extra_ranking", extra_ranking_contribs)]


def activity_factor(slug, suspend_hl):
    """Inactivity decay for nations under blanket international suspension."""
    last = SUSPENDED.get(slug)
    if not last:
        return 1.0
    return 0.5 ** ((NOW - last) / suspend_hl)


def compute(boost, suspend_hl=None, gamma=None, olyp=None):
    if suspend_hl is None:
        suspend_hl = SUSPEND_HALFLIFE
    if gamma is None:
        gamma = DIMINISH_GAMMA
    if olyp is None:
        olyp = OLYMPIC_PRESTIGE
    sport_pts = defaultdict(float)
    counts = {}
    for nm, fn in PILLARS:
        c = fn(boost)
        counts[nm] = len(c)
        for slug, sport, pts in c:
            sport_pts[(slug, sport)] += pts
    # distribute composite all-star teams (West Indies, Team Europe) across their
    # constituent nations so neither stands as a country of its own
    for comp, weights in COMPOSITE_DISTRIBUTE.items():
        tot = sum(weights.values())
        for key in [k for k in sport_pts if k[0] == comp]:
            v = sport_pts.pop(key)
            for m, w in weights.items():
                sport_pts[(m, key[1])] += v * w / tot
    # diminishing returns on pre-prestige raw, then prestige multiplier
    for k in sport_pts:
        pr = COUNTRY_SPORT_PRESTIGE.get(k, PRESTIGE.get(k[1], olyp))
        sport_pts[k] = (sport_pts[k] ** gamma) * pr
    # Domestic-strength boosts: a flat addition to the sport's OWN contribution, so
    # it shows up ON that sport in the breakdown (no separate recognition line) and
    # counts toward the capped merit. Credits domestic-league strength / historic
    # role the international title-and-ranking model misses.
    for sp, token, slugs in DOMESTIC_BOOST:
        for sl in slugs:
            sport_pts[(fold(sl), sp)] += token
    # West Indies members: flat cricket upweight on top of the proportional split.
    for m in WI_DISTRIBUTE:
        sport_pts[(m, "Cricket")] += WI_CRICKET_FLOOR_BONUS
    by_nation = defaultdict(list)
    for (slug, sport), pts in sport_pts.items():
        by_nation[slug].append((sport, pts))
    # A domestically-boosted sport is culturally core, so it ALWAYS counts toward
    # merit even if it falls outside the best-CAP sports.
    dom_keys = {(fold(sl), sp) for sp, _tok, slugs in DOMESTIC_BOOST for sl in slugs}
    merit, tops, sportmap = {}, {}, {}
    for slug, lst in by_nation.items():
        lst.sort(key=lambda x: x[1], reverse=True)
        af = activity_factor(slug, suspend_hl)
        capped = lst[:CAP]
        capped_sports = {sp for sp, _ in capped}
        extra = sum(p for sp, p in lst[CAP:] if (slug, sp) in dom_keys and sp not in capped_sports)
        merit[slug] = (sum(p for _, p in capped) + extra) * af
        tops[slug] = lst[:5]
        sportmap[slug] = {sp: p * af for sp, p in lst}
    return merit, tops, counts, sportmap


def major_titles():
    """Count world-level titles per nation across the team sports (flagship +
    secondary world championships; continental crowns and Olympics excluded)."""
    t = defaultdict(int)
    # football: FIFA World Cup wins
    f = json.load(open(os.path.join(D, "international", "finals.json"), encoding="utf-8"))
    for slug, lst in f.items():
        for e in lst:
            if e.get("category") == "WC" and e.get("result") == "W" and e.get("competition") != "Olympic Games":
                t[fold(slug)] += 1
    # cricket: ODI WC + T20 WC + World Test Championship
    for tm in json.load(open(os.path.join(D, "cricket", "teams.json"), encoding="utf-8")):
        hon = tm.get("honours") or {}
        for comp in ("wc", "t20wc", "wtc"):
            t[fold(tm["slug"])] += len(years((hon.get(comp) or {}).get("title_years")))
    # rugby union: Rugby World Cup
    for tm in json.load(open(os.path.join(D, "rugby-union", "teams.json"), encoding="utf-8")):
        t[fold(tm["slug"])] += len(years((tm.get("rwc") or {}).get("title_years")))
    # basketball: FIBA World Cup
    for tm in json.load(open(os.path.join(D, "basketball", "nations.json"), encoding="utf-8")):
        t[fold(tm["slug"])] += len(years(tm.get("wc_title_years")))
    # ice hockey: World Cup of Hockey + IIHF World Championships
    for tm in json.load(open(os.path.join(D, "hockey", "nations.json"), encoding="utf-8")):
        t[fold(tm["slug"])] += len(years(tm.get("wc_title_years"))) + len(years(tm.get("worlds_gold_years")))
    # handball + volleyball: World Championships
    for s in ("handball", "volleyball"):
        for tm in json.load(open(os.path.join(D, s, "nations.json"), encoding="utf-8")):
            t[fold(tm["slug"])] += len(years(tm.get("worlds_gold_years")))
    # baseball: World Baseball Classic
    for tm in json.load(open(os.path.join(D, "baseball", "teams.json"), encoding="utf-8")):
        t[fold(tm["slug"])] += len(years(tm.get("title_years")))
    # rugby league: World Cup (each title entry = one reign; ranges count once)
    for tm in json.load(open(os.path.join(D, "rugby-league-intl", "teams.json"), encoding="utf-8")):
        t[fold(tm["slug"])] += len(tm.get("title_years") or [])
    return t


def best_world_ranking():
    """Best (lowest) current world ranking per nation across ranked sports -> (rank, sport)."""
    best = {}

    def consider(slug, rank, sport):
        s = fold(slug)
        if rank and rank >= 1 and (s not in best or rank < best[s][0]):
            best[s] = (rank, sport)

    for tm in json.load(open(os.path.join(D, "international", "index.json"), encoding="utf-8"))["teams"]:
        consider(tm["slug"], tm.get("elo_rank"), "Football")
    for t in json.load(open(os.path.join(D, "basketball", "fiba_ranking.json"), encoding="utf-8"))["teams"]:
        consider(t.get("country_slug") or t.get("slug"), t.get("rank"), "Basketball")
    for tm in json.load(open(os.path.join(D, "rugby-union", "teams.json"), encoding="utf-8")):
        consider(tm["slug"], (tm.get("ranking") or {}).get("current"), "Rugby Union")
    cteams = json.load(open(os.path.join(D, "cricket", "teams.json"), encoding="utf-8"))
    n2s = {tm["name"]: tm["slug"] for tm in cteams}
    cr = json.load(open(os.path.join(D, "cricket", "hub.json"), encoding="utf-8")).get("current_rankings", {})
    for fmt, blk in cr.items():
        for row in (blk.get("rows") or []):
            if row.get("team") in n2s:
                consider(n2s[row["team"]], row.get("rank"), "Cricket")
    for fn, sport in (("hockey-men", "Ice Hockey"), ("baseball-men", "Baseball"), ("volleyball-men", "Volleyball"), ("handball-men", "Handball")):
        rk = json.load(open(os.path.join(D, "rankings", fn + ".json"), encoding="utf-8"))
        for row in rk["rows"]:
            if row.get("engineSlug"):
                consider(fold(row["engineSlug"]), row.get("rank"), sport)
    for row in json.load(open(os.path.join(D, "rankings", "womens-football.json"), encoding="utf-8"))["rows"]:
        if row.get("engineSlug"):
            consider(fold(row["engineSlug"]), row.get("rank"), "Women's Football")
    return best


def all_world_rankings():
    """Current world ranking per nation per sport (where a ranking exists)."""
    out = defaultdict(dict)

    def put(slug, sport, rank):
        s = fold(slug)
        if rank and rank >= 1 and (sport not in out[s] or rank < out[s][sport]):
            out[s][sport] = rank

    for tm in json.load(open(os.path.join(D, "international", "index.json"), encoding="utf-8"))["teams"]:
        put(tm["slug"], "Football", tm.get("elo_rank"))
    for t in json.load(open(os.path.join(D, "basketball", "fiba_ranking.json"), encoding="utf-8"))["teams"]:
        put(t.get("country_slug") or t.get("slug"), "Basketball", t.get("rank"))
    for tm in json.load(open(os.path.join(D, "rugby-union", "teams.json"), encoding="utf-8")):
        put(tm["slug"], "Rugby Union", (tm.get("ranking") or {}).get("current"))
    cteams = json.load(open(os.path.join(D, "cricket", "teams.json"), encoding="utf-8"))
    n2s = {tm["name"]: tm["slug"] for tm in cteams}
    cr = json.load(open(os.path.join(D, "cricket", "hub.json"), encoding="utf-8")).get("current_rankings", {})
    for fmt, blk in cr.items():
        for row in (blk.get("rows") or []):
            if row.get("team") in n2s:
                put(n2s[row["team"]], "Cricket", row.get("rank"))
    for fn, sport in (("hockey-men", "Ice Hockey"), ("baseball-men", "Baseball"), ("volleyball-men", "Volleyball"), ("handball-men", "Handball")):
        rk = json.load(open(os.path.join(D, "rankings", fn + ".json"), encoding="utf-8"))
        for row in rk["rows"]:
            if row.get("engineSlug"):
                put(fold(row["engineSlug"]), sport, row.get("rank"))
    for row in json.load(open(os.path.join(D, "rankings", "womens-football.json"), encoding="utf-8"))["rows"]:
        if row.get("engineSlug"):
            put(fold(row["engineSlug"]), "Women's Football", row.get("rank"))
    return out


def emit_json(merit, tops, special, name, sportmap):
    countries = json.load(open(os.path.join(D, "countries.json"), encoding="utf-8"))
    cmap = {c["slug"]: c for c in countries}
    # cup slug -> countries.json slug for genuine name divergences (no name match)
    ALIAS = {
        "great-britain": "united-kingdom",
        "czechia": "czech-republic",
        "chinese-taipei": "taiwan",
        "united-states-virgin-islands": "us-virgin-islands",
    }

    def _norm(s):
        s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
        s = re.sub(r"\b(?:and|the)\b", " ", s)  # "&"/"and"/"the" differences
        return re.sub(r"[^a-z0-9]+", "", s)

    byname = {_norm(c["name"]): c["slug"] for c in countries}

    def resolve(slug):
        # cup slug -> the countries.json slug for the /countries/[slug] route, or None
        if slug in cmap:
            return slug
        a = ALIAS.get(slug)
        if a in cmap:
            return a
        return byname.get(_norm(name.get(slug) or slug.replace("-", " ")))

    rslug = {s: resolve(s) for s in merit}

    def cget(slug, field):
        c = cmap.get(rslug.get(slug) or "")
        return c.get(field) if c else None

    continent = {s: cget(s, "continent") for s in merit}
    realpop = {}
    cname = {}
    for s in merit:
        p = cget(s, "pop")
        if p:
            realpop[s] = p
        n = cget(s, "name")
        if n:
            cname[s] = n
    indic = json.load(open(os.path.join(D, "country-indicators.json"), encoding="utf-8"))["countries"]
    gdp = {}
    for slug, ci in indic.items():
        v = (ci.get("indicators", {}).get("gdpUsd") or {}).get("value")
        if v:
            gdp[slug] = v
    titles = major_titles()
    bestrank = best_world_ranking()
    sportRanks = all_world_rankings()

    # National-sport recognition bonus: additive on top of the capped best-10,
    # so it isn't squeezed out of the cap for nations rich in international sports.
    nat_by_nation = defaultdict(list)
    for sp, token, slugs in NATIONAL_SPORTS:
        for sl in slugs:
            nat_by_nation[fold(sl)].append((sp, token, "national"))
    for sl, pts in motorsport_bonus().items():
        # A title from the 1950s decays to nothing. Crediting a visible 0.0 would
        # put a meaningless row on that country's page, so it is not credited.
        if round(pts, 1) > 0:
            nat_by_nation[sl].append(("Motorsport", round(pts, 1), "motorsport"))
    merit = {s: merit[s] + sum(t for _, t, _ in nat_by_nation.get(s, [])) for s in merit}

    overall = sorted(merit.items(), key=lambda kv: kv[1], reverse=True)
    orank = {s: i for i, (s, _) in enumerate(overall, 1)}
    pc = sorted(((s, merit[s] / (realpop[s] / 1e6)) for s in merit
                 if realpop.get(s) and not special.get(s) and s not in COMPOSITE),
                key=lambda x: x[1], reverse=True)
    pcrank = {s: i for i, (s, _) in enumerate(pc, 1)}
    pcval = dict(pc)
    pg = sorted(((s, merit[s] / (gdp[s] / 1e12)) for s in merit
                 if gdp.get(s) and not special.get(s) and s not in COMPOSITE),
                key=lambda x: x[1], reverse=True)
    pgrank = {s: i for i, (s, _) in enumerate(pg, 1)}
    pgval = dict(pg)

    rows = []
    for slug, mt in overall:
        br = bestrank.get(slug)
        rows.append({
            "slug": slug,
            "countrySlug": rslug.get(slug),
            "name": name.get(slug) or cname.get(slug) or slug.replace("-", " ").title(),
            "continent": continent.get(slug),
            "merit": round(mt, 1),
            "rank": orank[slug],
            "meritPerCapita": round(pcval[slug], 3) if slug in pcval else None,
            "rankPerCapita": pcrank.get(slug),
            "meritPerGdp": round(pgval[slug], 2) if slug in pgval else None,
            "rankPerGdp": pgrank.get(slug),
            "population": realpop.get(slug),
            "majorTitles": titles.get(slug, 0),
            "bestRank": (br[0] if br else None),
            "bestRankSport": (br[1] if br else None),
            "topSports": [{"sport": sp, "pts": round(p, 1)} for sp, p in tops.get(slug, [])],
            "sportMerit": {sp: round(p, 1) for sp, p in sorted(
                sportmap.get(slug, {}).items(), key=lambda kv: kv[1], reverse=True) if p > 0},
            "sportRank": dict(sportRanks.get(slug, {})),
            "nationalSports": [{"sport": sp, "pts": t, "kind": k}
                               for sp, t, k in nat_by_nation.get(slug, [])],
            "suspended": slug in SUSPENDED,
            "defunct": bool(special.get(slug)),
        })

    out = {
        "_meta": {
            "title": "Zone Zero Cup",
            "generated": NOW,
            "method": {
                "halflife": HALFLIFE_LOCKED, "cap": CAP, "winterWeight": WINTER_WEIGHT,
                "flagshipBoost": FLAGSHIP_BOOST, "diminishGamma": DIMINISH_GAMMA,
                "suspendHalflife": SUSPEND_HALFLIFE, "rankTop": RANK_TOP,
                "prestige": PRESTIGE, "suspended": SUSPENDED,
            },
            "count": len(rows),
        },
        "nations": rows,
    }
    json.dump(out, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return len(rows)


def preflight():
    """Refuse to regenerate the Cup when an upstream input has silently collapsed.

    In June 2026 a duplicate-header bug in the Int Tournaments sheet gutted
    international/finals.json (354 finals -> 4 rows / 2 teams) and
    womens-world-cup.json (9 editions -> 1 null-year edition). Because the Cup is
    only regenerated by hand, the damage never reached the live index; on a weekly
    cron it would have, silently, and the output would still have looked plausible.
    So fail loud instead. Floors sit well below healthy values (336 finals across
    69 teams; 9 editions), so only a genuine collapse trips them.
    """
    problems = []

    def load(rel):
        try:
            with open(os.path.join(D, rel), encoding="utf-8") as fh:
                return json.load(fh)
        except Exception as exc:
            problems.append(f"{rel}: unreadable ({exc})")
            return None

    f = load(os.path.join("international", "finals.json"))
    if isinstance(f, dict):
        rows = sum(len(v) for v in f.values())
        if rows < 250 or len(f) < 40:
            problems.append(
                f"international/finals.json: {rows} finals across {len(f)} teams (floor 250 / 40)")

    w = load(os.path.join("football", "womens-world-cup.json"))
    if isinstance(w, dict):
        eds = len(w.get("editions") or [])
        if eds < 8:
            problems.append(f"football/womens-world-cup.json: {eds} editions (floor 8)")

    if problems:
        print("ZZC PREFLIGHT FAILED - refusing to regenerate the Cup:")
        for p in problems:
            print("   -", p)
        print("Fix the upstream builder, then re-run (--force overrides).")
        if "--force" not in sys.argv:
            sys.exit(2)
        print("   --force given; continuing anyway.")


def main():
    preflight()
    teams = json.load(open(os.path.join(D, "olympics", "teams.json"), encoding="utf-8"))
    name = {t["slug"]: t["name"] for t in teams}
    special = {t["slug"]: bool(t.get("special")) for t in teams}
    tmed = {t["slug"]: t.get("total", 0) for t in teams}
    indic = json.load(open(os.path.join(D, "country-indicators.json"), encoding="utf-8"))["countries"]
    pop = {}
    for slug, ci in indic.items():
        ind = ci.get("indicators", {})
        gdp = (ind.get("gdpUsd") or {}).get("value")
        gpc = (ind.get("gdpPerCapitaUsd") or {}).get("value")
        if gdp and gpc:
            pop[slug] = gdp / gpc

    def nm_(s):
        return name.get(s, s.replace("-", " ").title() + ("*" if s in COMPOSITE else " (non-Oly)"))

    merit, tops, counts, sportmap = compute(FLAGSHIP_BOOST)
    absolute = sorted(merit.items(), key=lambda kv: kv[1], reverse=True)
    rank = {s: i for i, (s, _) in enumerate(absolute, 1)}

    pc = []
    for slug, mt in merit.items():
        if special.get(slug) or slug in COMPOSITE or tmed.get(slug, 0) < PERCAP_MIN or not pop.get(slug):
            continue
        pc.append((slug, mt, pop[slug], mt / (pop[slug] / 1e6)))
    pc.sort(key=lambda x: x[3], reverse=True)

    # half-life sensitivity: where East Germany (last active 1988) lands, + top 10
    def set_hl(h):
        global HALFLIFE
        HALFLIFE = h
        _DC.clear()

    hl_sens = {}
    for h in (20, 15, 12, 10, 8):
        set_hl(h)
        m = compute(FLAGSHIP_BOOST)[0]
        order = sorted(m.items(), key=lambda kv: kv[1], reverse=True)
        rk = {s: i for i, (s, _) in enumerate(order, 1)}
        hl_sens[h] = (rk.get("east-germany"), m.get("east-germany", 0), [s for s, _ in order[:10]])
    set_hl(HALFLIFE_LOCKED)
    _DC.clear()

    L = []
    L.append("# Zone Zero Cup — v1 multi-pillar proof (recalibrated)\n")
    L.append(f"Half-life {HALFLIFE}y, cap best {CAP}, Winter {WINTER_WEIGHT}, FLAGSHIP boost x{FLAGSHIP_BOOST}. "
             f"Prestige: " + ", ".join(f"{k} x{v}" for k, v in PRESTIGE.items()) + ".\n")
    L.append("Tiers: flagship world title (boosted) > annual/secondary worlds > continental > intercontinental.\n")
    L.append(f"Current-standing layer ON: live ranking -> present strength (RANK_TOP {RANK_TOP}, "
             f"halving every {RANK_HL_POSITIONS} places). Pillars now include Baseball (WBC) + Rugby League (RLWC).\n")
    L.append("Pillar rows: " + ", ".join(f"{k} {v}" for k, v in counts.items()) + ".\n")

    spot = ["australia", "new-zealand", "papua-new-guinea", "italy", "great-britain"]
    L.append("\n## Spotlight (does current standing temper stale titles?)\n")
    L.append("| Nation | Merit | Rank | Top sports |")
    L.append("|---|---|---|---|")
    for s in spot:
        if s in merit:
            ts = "; ".join(f"{sp} {p:.0f}" for sp, p in tops[s])
            L.append(f"| {nm_(s)} | {merit[s]:.0f} | #{rank[s]} | {ts} |")

    L.append("\n## Absolute merit (top 30) at x%g\n" % FLAGSHIP_BOOST)
    L.append("| # | Nation | Merit | Top sports |")
    L.append("|---|---|---|---|")
    for i, (slug, mt) in enumerate(absolute[:30], 1):
        mark = " ‡" if special.get(slug) else ""
        if slug in SUSPENDED:
            mark += " §"
        ts = "; ".join(f"{sp} {p:.0f}" for sp, p in tops[slug])
        L.append(f"| {i} | {nm_(slug)}{mark} | {mt:.0f} | {ts} |")

    L.append("\n## Per-capita merit (top 25, per million)\n")
    L.append("| # | Nation | Merit | Pop | Merit / M |")
    L.append("|---|---|---|---|---|")
    for i, (slug, mt, p, pm) in enumerate(pc[:25], 1):
        pf = f"{p/1e6:.1f}M" if p >= 1e6 else f"{p/1e3:.0f}k"
        L.append(f"| {i} | {nm_(slug)} | {mt:.0f} | {pf} | {pm:.2f} |")

    L.append("\n## Decay half-life sensitivity (East Germany, dissolved 1990, last active 1988)\n")
    L.append(f"Lower half-life = harsher decay, deep history fades faster. Locked: {HALFLIFE_LOCKED}y.\n")
    L.append("| Half-life | East Germany | Top 10 |")
    L.append("|---|---|---|")
    for h in (20, 15, 12, 10, 8):
        rk, mt, top = hl_sens[h]
        tag = " (locked)" if h == HALFLIFE_LOCKED else ""
        L.append(f"| {h}y{tag} | #{rk} ({mt:.0f}) | " + ", ".join(nm_(s) for s in top) + " |")

    open(OUT_MD, "w", encoding="utf-8").write("\n".join(L) + "\n")
    nrows = emit_json(merit, tops, special, name, sportmap)
    print("Emitted %s (%d nations)" % (OUT_JSON, nrows))
    print("Boost x%g, suspend %gy, gamma %g, half-life %gy | Top 8:" %
          (FLAGSHIP_BOOST, SUSPEND_HALFLIFE, DIMINISH_GAMMA, HALFLIFE_LOCKED),
          ", ".join(f"{nm_(s)}={v:.0f}" for s, v in absolute[:8]))
    print("East Germany rank by half-life:", {h: hl_sens[h][0] for h in (20, 15, 12, 10, 8)})
    print("Wrote", OUT_MD)


if __name__ == "__main__":
    main()
