# -*- coding: utf-8 -*-
"""Build public/data/election-systems.json: the electoral-system layer.

TWO THINGS LIVE HERE.

1. THE GALLAGHER INDEX, computed from data the atlas already holds.
   Every hub JSON records, per election, each party's vote share and seat
   count. That is exactly what the least-squares index of disproportionality
   needs:

       LSq = sqrt( 0.5 * sum over parties of (vote% - seat%)^2 )

   0 means seats matched votes exactly. Around 1 is the Netherlands. Around 3
   is New Zealand under MMP. Above 15 is a first-past-the-post landslide, and
   the United Kingdom in 2024 set a national record above 23. Nobody publishes
   this across thirty-five countries and two centuries, and the numbers were
   sitting in the repo the whole time.

   Method notes that matter for comparability:
   * Unlisted parties are folded into a single "Others" bucket, with the
     residual vote share against the residual seat share. Dropping them instead
     would flatter every country with a long tail.
   * An election is skipped when the listed vote shares total under
     MIN_VOTE_COVERAGE, because the residual bucket would then be doing more
     work than the data.
   * Seat totals must reconcile with totalSeats within SEAT_SLACK seats.
   * Presidential contests are never scored: a single-winner office has no
     seat share to compare.
   Every skip is counted and reported, so a thin country is visible as thin
   rather than silently absent.

2. THE SYSTEM TABLE, which is editorial and hand-maintained. What family each
   chamber belongs to, its district magnitude, its threshold. This cannot be
   derived from results and is not guessed: where a country has changed system,
   the entry says so, because that is usually what the index is showing.

Usage:
    python scripts/elections/build_systems.py [--write] [--self-test]
"""
import json
import math
import os
import sys
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(DATA, "election-systems.json")

# Tuned against the atlas as it actually is, not as it should be. Spain 2023
# lists six parties covering 93% of the vote and 336 of 350 seats; Israel
# 2022 lists eight covering 83.8% and 111 of 120. Both are perfectly
# scoreable. Demanding 90% coverage and a five-seat reconciliation threw
# away every modern Spanish and Israeli election for no gain.
MIN_VOTE_COVERAGE = 80.0   # listed vote shares must total at least this
MAX_RESIDUAL_SEATS = 0.15  # the Others bucket may hold at most this share
SEAT_OVERSHOOT = 2         # listed seats may exceed totalSeats by this much

# --------------------------------------------------------------------------
# The system table. family drives the grouping on the page; `changed` marks a
# country whose index series spans more than one system, which is the single
# most important caveat when comparing two eras of the same country.
FAMILY = {
    "fptp": "First past the post",
    "mmp": "Mixed-member proportional",
    "mmm": "Mixed-member majoritarian",
    "list-pr": "Party-list proportional",
    "stv": "Single transferable vote",
    "irv": "Instant-runoff (preferential)",
    "two-round": "Two-round majority",
    "bonus-pr": "Proportional with a majority bonus",
    "other": "Other or non-competitive",
}

SYSTEMS = {
    "uk": ("fptp", "650 single-member seats, plurality", None, "Unchanged since the last multi-member seats went in 1950."),
    "us": ("fptp", "435 single-member districts, plurality", None, "Districts are drawn by the states, so the index carries redistricting as well as the system."),
    "ca": ("fptp", "343 single-member seats, plurality", None, "Two referendums on changing it have failed at provincial level."),
    "in": ("fptp", "543 single-member seats, plurality", None, "The largest FPTP electorate in the world."),
    "au": ("irv", "151 single-member seats, instant-runoff (preferential)", None, "Preferential voting with compulsory turnout; the Senate uses STV."),
    "nz": ("mmp", "72 electorates topped up to 120 from party lists", "5% or one electorate", "FPTP until 1993. The index falls off a cliff at 1996, which is the reform itself."),
    "de": ("mmp", "630 seats, half constituency half list", "5% or three constituencies", "The 2023 reform removed overhang seats from 2025."),
    "jp": ("mmm", "289 districts plus 176 by list in 11 blocs", None, "SNTV multi-member districts until 1993."),
    "kr": ("mmm", "254 districts plus 46 by list", "3%", "A semi-mixed top-up since 2020."),
    "tw": ("mmm", "73 districts, 34 by list, 6 indigenous", "5%", "SNTV until 2008."),
    "it": ("bonus-pr", "Closed-list PR with a bonus to the largest coalition", "3% party, 10% coalition", "Changed repeatedly: PR to 1993, mixed to 2005, bonus-PR, Rosatellum from 2017, and a new bonus-PR law legislated in 2026."),
    "es": ("list-pr", "350 seats over 52 provinces, D'Hondt", "3% within a province", "Small provinces elect two or three members, so the system is far less proportional than the label suggests."),
    "pl": ("list-pr", "460 seats over 41 constituencies, D'Hondt", "5% party, 8% coalition", "The Senate is 100 single-member seats, decided in 2023 by an opposition pact rather than by vote share."),
    "nl": ("list-pr", "150 seats, one national district", "one seat, about 0.67%", "The purest large-country PR in the atlas, and reliably the lowest index."),
    "be": ("list-pr", "150 seats over 11 constituencies, D'Hondt", "5% per constituency", "Split Dutch and French electorates; compulsory voting."),
    "dk": ("list-pr", "175 seats plus 4, with levelling seats", "2%", "Levelling seats are explicitly there to hold the index down."),
    "ch": ("list-pr", "200 seats over 26 cantons, open lists", None, "Panachage lets voters split a list across parties."),
    "il": ("list-pr", "120 seats, one national district", "3.25%", "Threshold raised from 2% in 2014, which pushed small parties into joint lists."),
    "za": ("list-pr", "400 seats, closed national and regional lists", None, "No threshold at all."),
    "br": ("list-pr", "513 deputies over 27 states, open lists", "party performance clause", "The presidency is a separate two-round contest."),
    "ar": ("list-pr", "257 deputies, half renewed every two years", "3% of the roll", "Presidential elections use a reduced-threshold runoff."),
    "id": ("list-pr", "580 seats over 84 districts, open lists", "4% nationally", None),
    "eu": ("list-pr", "720 seats, each member state its own system", "up to 5%, set nationally", "Twenty-seven national systems reported as one chamber, so read the index as an aggregate."),
    "fr": ("two-round", "577 single-member seats, two rounds", "12.5% of the roll to reach round two", "PR was used once, in 1986."),
    "my": ("fptp", "222 single-member seats, plurality", None, None),
    "sg": ("fptp", "Group representation constituencies, plurality by team", None, "Multi-member blocs are won whole, which pushes the index high."),
    "ng": ("fptp", "360 single-member seats, plurality", None, "The presidency additionally needs 25% in two-thirds of the states."),
    "tr": ("list-pr", "600 seats over 87 districts, D'Hondt", "7% for an alliance", "Threshold cut from 10% in 2022."),
    "ru": ("mmm", "225 districts plus 225 by list", "5%", "Not a competitive system: the index measures the arithmetic, not consent."),
    "ua": ("list-pr", "450 seats, mixed until 2019", "5%", "Elections suspended under martial law."),
    "iq": ("list-pr", "329 seats, multi-member governorates", None, "Switched between systems repeatedly since 2005."),
    "ps": ("list-pr", "132 seats, half list half district in 2006", "2%", "One competitive legislative election on record."),
    "mx": ("mmm", "300 districts plus 200 by list", "3%", None),
    "cn": ("other", "Indirect election to the National People's Congress", None, "No competitive contest; listed for completeness."),
    "va": ("other", "Conclave of cardinal electors, two-thirds majority", None, "Not a polity-wide ballot, so it carries no index."),
    "gr": ("bonus-pr", "300 seats, PR with a bonus to the largest party", "3%", "The bonus has been as large as fifty seats, was abolished for May 2023 and restored for June, which is why two votes six weeks apart produced different parliaments."),
    "at": ("list-pr", "183 seats over 39 regional districts, three allocation tiers", "4% or one regional seat", "Three tiers make the final result close to the national vote."),
    "pt": ("list-pr", "230 seats over 22 districts, D'Hondt, closed lists", None, "No national threshold, but districts range from two seats to forty-eight, so the small interior ones are effectively two-party."),
    "ie": ("stv", "174 seats in 3-, 4- and 5-seat constituencies, single transferable vote", None, "The only national PR-STV system in this atlas. Seats follow the final count, not first preferences."),
    "ph": ("fptp", "Presidency by simple plurality, one six-year term", None, "No runoff, so pluralities under 40% have repeatedly been enough to win."),
    "eg": ("other", "596 seats: individual constituencies plus absolute-majority closed lists", None, "A list plurality takes every seat on the list, which is why the pro-government coalition has swept them since 2015."),
    "hu": ("mmm", "199 seats: 106 single-member constituencies plus 93 by national list", "5% party, 10% two-party alliance", "The winner's surplus constituency votes are added to its list total, so coming first is rewarded twice. The chamber was 386 seats with a second round until the 2011 reform."),
    "no": ("list-pr", "150 district seats over 19 counties plus 19 levelling seats, modified Sainte-Lague", "4% for levelling seats", "The Storting cannot be dissolved, so every term runs four years and minority government is normal."),
    "se": ("list-pr", "310 constituency seats plus 39 adjustment seats, modified Sainte-Lague", "4% nationally or 12% in one constituency", "One chamber since 1970; before that only the Second Chamber was directly elected, on a graded franchise until 1911."),
    "co": ("list-pr", "100 senators elected in a single national district, plus reserved seats", "3% of the national vote since 2003", "The congressional series here is the Senate. Before 2003 parties could run unlimited personal lists, which is why the field ran to sixty-odd parties."),
    "cd": ("list-pr", "500 seats in constituencies from one to seventeen members, open list", "no effective threshold", "More than a hundred parties won seats in 2011. Vote shares survive for 1960, 1965, 1970, 1977 and 2023; the other six assemblies record seats only, so they carry no index."),
    "cl": ("list-pr", "155 deputies over 28 districts, D'Hondt with open lists", "no national threshold", "The dictatorship's binomial system paired every district from 1989 to 2013 and handed the second seat to the runner-up list unless the leader doubled its vote; proportional districts replaced it in 2017."),
    "pk": ("fptp", "266 single-member seats by plurality, plus 70 reserved seats shared out in proportion", None, "The reserved bench of 60 women's and 10 minority seats is allocated on the general seats each party won, so it amplifies whoever came first. The 1962 and 1965 assemblies were chosen by an electoral college and carry no vote shares."),
    "ir": ("two-round", "290 seats, multi-member districts, absolute majority with a second round", "20% of the vote in the first round", "No index. The Majlis articles report blocs and their seats, and where a Percentage row exists it is usually the share of seats rather than of votes, so there is nothing to compare a seat share against. The Guardian Council vets every candidate in any case, so the field is settled before the count."),
    # Wave 5 (2026-09-08).
    "pe": ("list-pr", "130-seat Chamber of Deputies by open-list D'Hondt over 27 regional districts", "5% of the national vote", "The congressional series is the Chamber of Deputies throughout: bicameral to 1992, a single chamber from 1995 to 2021, and bicameral again from 2026, when a 60-seat Senate returned beside it."),
    "ke": ("fptp", "290 single-member seats by plurality, plus 47 county women's seats and 12 nominated members", None, "The women's and nominated seats top up a first-past-the-post base rather than forming a proportional tier. Everything before 1963 was a settler franchise, and the three presidential elections of 1978 to 1983 were unopposed."),
    "bd": ("fptp", "300 single-member seats by plurality, plus 50 women's seats shared out by general-seat share", None, "Five of the thirteen elections were boycotted by one of the two main parties, and 2014 returned more than half the house unopposed; those years carry no index because there was no contest to measure."),
    "et": ("fptp", "547 single-member seats by plurality", None, "Multi-party only since 1994, and every election since has returned one governing coalition with all but a handful of seats, so the index reads a landslide where it can read anything."),
    "vn": ("other", "500 seats in two- and three-member districts, absolute majority with a second round, every candidate vetted by the Fatherland Front", None, "No index. Every seat goes to the Communist Party or to a vetted independent, and the tables report seats without vote shares."),
    "ae": ("other", "20 of 40 Federal National Council seats by single non-transferable vote in an electoral college the rulers appoint; the other 20 appointed", None, "No index. Parties are banned, every seat returns an independent, and the electorate is chosen: 6,595 members in 2006, 398,879 in 2023."),
    "dd": ("other", "A single National Front list to 1986; party-list proportional representation with no threshold in March 1990", None, "No index before 1990: the seats were shared out by quota before the vote and the list was approved by 99% each time. The one free election, 18 March 1990, is scored, and the state was dissolved that October."),
    "cz": ("list-pr", "200 seats over 14 regions, D'Hondt", "5% for a party, higher for coalitions", "The federal Czechoslovak chamber before 1993 used list PR too; today's Chamber of Deputies succeeds the Czech National Council, renamed at independence in 1993."),
    "sk": ("list-pr", "150 seats in one nationwide constituency, closed lists", "5%", "No runoff or majority rule applies to parliament; coalitions are settled after the count. The presidency is a separate two-round vote, decided by parliament from 1993 to 1998 and by voters since 1999."),
    "ro": ("list-pr", "330 Chamber of Deputies seats, closed-list D'Hondt by county", "5%", "The Senate is elected the same way beside it; this hub reports the Chamber. The president is chosen separately by two-round majority."),
    "fi": ("list-pr", "200 seats over 13 districts, open lists, D'Hondt", None, "No legal threshold, but Finland's small districts set an effective one, and no party has won a majority since 1917; every government is a coalition."),
    "th": ("mmm", "400 single-member constituencies plus 100 party-list seats, parallel", None, "Parallel and non-compensatory since 2007 and 2011; 2019 briefly used a single-ballot compensatory version before reverting for 2023. The House sits under six coups since 1947."),
    "ve": ("mmm", "277 National Assembly seats, most in single-member and plurinominal districts with a party-list top-up", None, "The president is chosen by simple plurality with no second round. The main opposition boycotted three of the last four legislative elections and disputes the 2024 presidential count, which was never published by precinct."),
    "vd": ("fptp", "Single-member plurality to 1963, then multi-member provinces by d'Hondt in 1966 and by multiple non-transferable vote in 1971", None, "Candidates stood as individuals for the lower house of 1967 and 1971, so those years carry no party shares. The republic ended on 30 April 1975."),
    # Wave 6 (2026-09-08).
    "ma": ("list-pr", "305 seats over 92 local constituencies (2-6 seats each), closed lists, plus 90 supplementary list seats", None, "A 2021 law replaced the reserved national list with twelve regional lists and removed the local and national thresholds, previously 6% and 3%. From 1970 to 1993 a large minority of seats were instead chosen by communal councillors and professional colleges rather than by direct vote."),
    "cu": ("plurality/list", "the National Assembly's single approved list has taken every seat since 1993", None, "One list, no opposition; the republic-era House used first-past-the-post multi-party contests instead."),
    "jm": ("fptp", "first-past-the-post in single-member constituencies", None, "Two parties, JLP and PNP, have held every seat since 1944 except a handful for minor parties and independents."),
    "wi": ("fptp", "single- and multi-member constituencies across ten territories", None, "The Federation's only election, in 1958; it dissolved in 1962 before a second could be held."),
}


# ------------------------------------------------------------------ scoring --

def gallagher(pairs, total_seats):
    """pairs: [(vote_share, seats)]. Returns (index, why) with one of them None."""
    if not total_seats or total_seats <= 0:
        return None, "no seat total"
    if not pairs:
        return None, "no parties recorded"
    # The commonest gap in this atlas by far: seats recorded, vote shares not.
    # New Zealand and Japan post-war are entirely in this state. Naming it
    # separately turns "we cannot score this" into a to-do somebody can act on.
    if all(v is None for v, _ in pairs):
        return None, "no vote shares recorded"
    listed_votes = sum(v for v, _ in pairs if v is not None)
    listed_seats = sum(s for _, s in pairs if s is not None)
    # A single list holding effectively all the votes and all the seats is not a
    # measurable contest: it scores a perfect zero and would have made Iran the
    # most proportional system in the atlas on the strength of three one-row
    # tables. Zaire's 1977 assembly and Hungary's People's Front years are the
    # same shape.
    scoring = [(v, sp) for v, sp in pairs if v is not None]
    if len(scoring) == 1 and scoring[0][0] >= 95.0:
        return None, "single-list result"
    if listed_votes < MIN_VOTE_COVERAGE:
        return None, "vote coverage %.1f%%" % listed_votes
    if listed_votes > 105.0:
        return None, "vote shares total %.1f%%" % listed_votes
    if listed_seats > total_seats + SEAT_OVERSHOOT:
        return None, "seats %d exceed total %d" % (listed_seats, total_seats)

    terms = []
    for v, s in pairs:
        if v is None or s is None:
            continue
        terms.append((v - 100.0 * s / total_seats) ** 2)
    # The residual: everyone not listed, as one bucket.
    rv = max(0.0, 100.0 - listed_votes)
    rs = max(0.0, 100.0 - 100.0 * listed_seats / total_seats)
    if rs > MAX_RESIDUAL_SEATS * 100.0:
        return None, "residual holds %.1f%% of seats" % rs
    if rv > 0 or rs > 0:
        terms.append((rv - rs) ** 2)
    return math.sqrt(0.5 * sum(terms)), None


def score_election(e):
    parties = e.get("parties") or []
    pairs = [(p.get("share"), p.get("seats")) for p in parties]
    return gallagher(pairs, e.get("totalSeats"))


def vote_coverage(e):
    return sum(p.get("share") or 0.0 for p in (e.get("parties") or []))


def turnout_stats(elections):
    """Turnout across a hub's primary series.

    "Primary" means the array the hub leads with: the legislative record for
    most, the presidential one for the United States, Argentina and Taiwan,
    whose hubs are built that way. That is the series each hub actually shows,
    so it is the one to compare, and the page says which it is.
    """
    rows = [(e.get("year"), e.get("turnout"), e.get("unfree")) for e in elections]
    rows = [(y, t, u) for y, t, u in rows if y is not None and t is not None]
    if not rows:
        return None
    rows.sort()
    # Rituals report turnout near 100% by construction. They stay in the high
    # and low figures, which is where they are informative, and out of the
    # median, which is where they would simply lie.
    honest = [t for _, t, u in rows if u != "unfree"]
    modern = [t for y, t, u in rows if y >= 1945 and u != "unfree"]
    hi = max(rows, key=lambda r: r[1])
    lo = min(rows, key=lambda r: r[1])
    return {
        "n": len(rows),
        "latest": {"year": rows[-1][0], "turnout": rows[-1][1]},
        "median": _median(honest),
        "medianPost1945": _median(modern),
        "high": {"year": hi[0], "turnout": hi[1], "unfree": hi[2] or None},
        "low": {"year": lo[0], "turnout": lo[1], "unfree": lo[2] or None},
    }


def legislative_elections(doc):
    """Seat-allocating contests only. Presidential arrays are never scored."""
    return doc.get("elections") if "elections" in doc else doc.get("legislative") or []


# -------------------------------------------------------------------- build --

def build(load_hub, codes, today=None):
    """load_hub(code) -> parsed hub JSON. Pure, so the self-test can drive it."""
    today = today or date.today()
    hubs = []
    for code in codes:
        doc = load_hub(code)
        if doc is None:
            continue
        fam, chamber, threshold, note = SYSTEMS.get(code, ("other", "", None, None))
        primary = legislative_elections(doc)
        seat_based = any(e.get("totalSeats") for e in primary)
        scored, skipped = [], []
        for e in primary:
            idx, why = score_election(e)
            if idx is None:
                if why:
                    skipped.append({"id": e.get("id"), "year": e.get("year"), "why": why})
                continue
            scored.append({
                "id": e.get("id"),
                "year": e.get("year"),
                "label": e.get("label"),
                "lsq": round(idx, 2),
                "coverage": round(vote_coverage(e), 1),
                "turnout": e.get("turnout"),
                "unfree": e.get("unfree") or None,
                "caveat": bool(e.get("caveat")),
            })
        scored.sort(key=lambda r: r["year"])
        # Only outright rituals leave the median. A restricted franchise
        # ("partial") still allocated seats from votes, and excluding those
        # emptied Singapore's median entirely while telling the reader nothing.
        free = [r for r in scored if r["unfree"] != "unfree"]
        hubs.append({
            "code": code,
            "family": fam,
            "familyLabel": FAMILY.get(fam, fam),
            "chamber": chamber,
            "threshold": threshold,
            "note": note,
            "scored": len(scored),
            "skipped": len(skipped),
            "skippedSample": skipped[:3],
            "noVoteShares": sum(1 for r in skipped if r["why"] == "no vote shares recorded"),
            "notSeatBased": sum(1 for r in skipped if r["why"] == "no seat total"),
            "gapReason": _gap_reason(scored, skipped),
            "seriesKind": "legislative" if seat_based else "presidential",
            "turnout": turnout_stats(primary),
            "median": _median([r["lsq"] for r in free]) if free else None,
            "latest": scored[-1] if scored else None,
            "worst": max(scored, key=lambda r: r["lsq"]) if scored else None,
            "best": min(scored, key=lambda r: r["lsq"]) if scored else None,
            "series": scored,
        })
    hubs.sort(key=lambda h: (h["median"] is None, h["median"] if h["median"] is not None else 0))
    return {
        "built": today.isoformat(),
        "method": ("Gallagher least-squares index of disproportionality, computed from the "
                   "vote shares and seat counts already recorded for every legislative "
                   "election in this atlas. Unlisted parties are folded into one residual "
                   "bucket; an election whose listed vote shares total under %.0f%% is not "
                   "scored." % MIN_VOTE_COVERAGE),
        "families": FAMILY,
        "hubs": hubs,
    }


def _gap_reason(scored, skipped):
    """Why a hub has no series, in words, rather than an empty row.

    An empty cell reads as an oversight. Naming the cause turns it into a
    to-do: three of these are fixed by adding vote shares to data the atlas
    already holds.
    """
    if scored or not skipped:
        return None
    why = [r["why"] for r in skipped]
    if all(w == "no seat total" for w in why):
        return ("This hub records single-winner contests, which have no seat "
                "share to compare a vote share against.")
    if all(w == "no vote shares recorded" for w in why):
        return ("Seats are on file but vote shares are not, so the index cannot "
                "be computed. Adding the shares would unlock the whole series.")
    top = max(set(why), key=why.count)
    return "No election met the scoring rules; the commonest reason was: %s." % top


def _median(xs):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return round(s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0, 2)


def _loader(code):
    path = os.path.join(DATA, "%s-elections.json" % code)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- self-test --

def _self_test():
    fails = []

    def check(label, got, want, tol=None):
        ok = abs(got - want) <= tol if (tol is not None and got is not None) else got == want
        if not ok:
            fails.append("%s: got %r, want %r" % (label, got, want))

    # Perfect proportionality: two parties, votes equal seats exactly.
    idx, why = gallagher([(50.0, 50), (50.0, 50)], 100)
    check("perfect PR", round(idx, 6), 0.0)

    # Textbook single case: 45% of the vote takes 60% of the seats, 55% takes
    # 40%. Deviations are 15 and -15, so LSq = sqrt(0.5*(225+225)) = 15.
    idx, why = gallagher([(45.0, 60), (55.0, 40)], 100)
    check("hand-computed 15", round(idx, 6), 15.0)

    # The residual bucket must count. Listed parties take 90% of votes and 100
    # of 100 seats: the missing 10% of voters got nothing, and that has to show.
    idx, why = gallagher([(45.0, 50), (45.0, 50)], 100)
    check("residual counted", round(idx, 4), round(math.sqrt(0.5 * (25 + 25 + 100)), 4))

    # Guards: thin vote coverage, impossible shares, seats that do not reconcile.
    check("thin coverage skipped", gallagher([(40.0, 50), (30.0, 50)], 100)[0], None)
    check("over-100 skipped", gallagher([(60.0, 50), (60.0, 50)], 100)[0], None)
    check("seat mismatch skipped", gallagher([(50.0, 10), (50.0, 10)], 100)[0], None)
    check("no total skipped", gallagher([(50.0, 50), (50.0, 50)], 0)[0], None)

    # A presidential array must never be scored: build() reads `legislative`,
    # never `presidential`.
    doc = {"presidential": [{"id": "x", "year": 2020, "totalSeats": 1,
                             "parties": [{"share": 51.0, "seats": 1}]}],
           "legislative": [{"id": "y", "year": 2020, "totalSeats": 100, "label": "L",
                            "parties": [{"share": 50.0, "seats": 50},
                                        {"share": 50.0, "seats": 50}]}]}
    out = build(lambda c: doc, ["nl"], date(2026, 8, 30))
    check("one legislative row", out["hubs"][0]["scored"], 1)
    check("that row is the legislative one", out["hubs"][0]["series"][0]["id"], "y")

    # Unfree contests are excluded from the median but stay in the series, so a
    # managed system cannot flatter its own headline number.
    doc2 = {"elections": [
        {"id": "a", "year": 2000, "totalSeats": 100, "label": "A", "unfree": "unfree",
         "parties": [{"share": 90.0, "seats": 99}, {"share": 10.0, "seats": 1}]},
        {"id": "b", "year": 2004, "totalSeats": 100, "label": "B",
         "parties": [{"share": 50.0, "seats": 50}, {"share": 50.0, "seats": 50}]}]}
    out = build(lambda c: doc2, ["za"], date(2026, 8, 30))
    h = out["hubs"][0]
    check("both scored", h["scored"], 2)
    check("median excludes the unfree row", h["median"], 0.0)

    # A single list holding all the votes and all the seats is not measurable
    # proportionality, and scoring it as a perfect zero made Iran the most
    # proportional system in the atlas off three one-row tables.
    check("single list not scored", gallagher([(99.0, 100)], 100)[0], None)
    check("single list says why", gallagher([(99.0, 100)], 100)[1], "single-list result")
    check("a genuine one-party sweep with a rival still scores",
          gallagher([(90.0, 99), (10.0, 1)], 100)[0] is not None, True)

    # Turnout: rituals stay in the extremes and out of the median.
    t = turnout_stats([
        {"year": 1950, "turnout": 60.0},
        {"year": 1960, "turnout": 70.0},
        {"year": 1970, "turnout": 99.9, "unfree": "unfree"},
        {"year": 1980, "turnout": 80.0},
    ])
    check("turnout median ignores the ritual", t["medianPost1945"], 70.0)
    check("the ritual is still the high", t["high"]["year"], 1970)
    check("latest is the latest", t["latest"]["year"], 1980)
    check("turnout n counts every row", t["n"], 4)
    check("no turnout at all returns None", turnout_stats([{"year": 1950}]), None)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("build_systems self-test OK (19 checks)")
    return 0


def main():
    if "--self-test" in sys.argv:
        return _self_test()
    doc = build(_loader, sorted(SYSTEMS))
    tot = sum(h["scored"] for h in doc["hubs"])
    skip = sum(h["skipped"] for h in doc["hubs"])
    print("scored %d legislative elections across %d hubs (%d skipped)"
          % (tot, len(doc["hubs"]), skip))
    for h in doc["hubs"]:
        if not h["scored"]:
            print("  %-3s %-22s NO SERIES (%d skipped) %s"
                  % (h["code"], h["familyLabel"], h["skipped"], h["gapReason"] or ""))
            continue
        if h["median"] is None:
            print("  %-3s %-22s %d scored, all rituals: no median"
                  % (h["code"], h["familyLabel"], h["scored"]))
            continue
        print("  %-3s %-22s median %5.2f   latest %s %5.2f   worst %s %5.2f   n=%d"
              % (h["code"], h["familyLabel"], h["median"],
                 h["latest"]["year"], h["latest"]["lsq"],
                 h["worst"]["year"], h["worst"]["lsq"], h["scored"]))
    if "--write" in sys.argv:
        json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("wrote public/data/election-systems.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
