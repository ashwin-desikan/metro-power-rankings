#!/usr/bin/env python3
"""
build_order_data.py

Builds the Order layer's two datasets from JSON already committed in
public/data. No network. Deterministic. Re-runnable.

  public/data/order/order-grid.json        the Force x Integrity typology
  public/data/order/recognition-gap.json   latent vs recognised power

WHY THE AXES ARE WHAT THEY ARE
------------------------------
The grid is the project's own Force x Integrity matrix (Velvet Rock Canon I /
The Architecture of Universal Order) applied to states. Force is the capacity
to execute and to move. Integrity is alignment with something above the actor,
which in a state is law that binds the ruler.

Both axes are PERCENTILES AGAINST CONTEMPORARIES, not absolute scores, for the
same reason the Power Atlas ranks a state against its own era: an absolute
scale invites a reading of history as a climb toward a finish line, and the
canon's Cell 7 is an asymptote, not a destination. Plotting position is
(rank - 0.5) / n, so no country ever scores 100 on either axis and the
Approach score can never reach 100. That bound is the point, not a rounding
artefact.

WHAT IS DELIBERATELY MISSING IN v1
----------------------------------
Force carries reach, material mass and, since 2026-09-05, an administrative leg
weighted 0.25 against 0.75 for recognised power. That quarter is split half and
half between tax revenue and general government final consumption, because the
tax series is CENTRAL government and on its own reads federal states low for a
definitional reason rather than a real one -- Germany 19th percentile, the
United States 18th, below Brazil. A country with neither reading is scored on
recognised power alone. Integrity is a single V-Dem cross-section plus
constitutional durability, so the grid is one year, not a panel. The full
V-Dem panel (v2clrspct, v2x_corr, v2xlg_legcon) is what turns it into a time
series. Both gaps are stated on the page rather than papered over.

USAGE
    python3 scripts/order/build_order_data.py --self-test
    python3 scripts/order/build_order_data.py --dry-run
    python3 scripts/order/build_order_data.py
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "public", "data")
OUT_DIR = os.path.join(DATA, "order")

# Oldest constitution in the CCP chronology, used to put durability on 0..1.
OLDEST_CONSTITUTION_YEARS = 236

# The nine positions a real state can occupy. Index is [force][integrity] with
# 0 = low, 1 = mid, 2 = high.
#
# 🔴 THE VANGUARD IS NOT IN THIS TABLE, AND MUST NOT BE ADDED TO IT.
# The canon defines Cell 7, the Vanguard, as total force and total integrity at
# once: an unconditioned ideal, approached and never finitely held. A tertile of
# a ranked field is not that. The top third of any class is still only the top
# third, and calling it the ideal turns a description into a podium, which is
# what this board must never be. So the top-right BAND is named for what those
# states are doing, and the Vanguard sits off the grid as the corner the axes
# point at. build_grid asserts that nothing is ever assigned to it.
CELLS = {
    (0, 2): ("pure-witness", "The Pure Witness", "Constraint without capacity."),
    (0, 1): ("passenger", "Passenger", "Neither the means nor the binding."),
    (0, 0): ("noise", "The Noise", "Little of either, and little say in its own affairs."),
    (1, 2): ("stabilizer", "Stabilizer", "Bound, competent, and not trying to move the world."),
    (1, 1): ("institutional-machine", "The Institutional Machine", "Process intact, motion stalled."),
    (1, 0): ("asymmetric-exploit", "Asymmetric Exploit", "Means enough to act, little above the actor."),
    (2, 2): ("the-approach", "The Approach", "As near as anyone gets, which is not near."),
    (2, 1): ("opportunist", "Opportunist", "High capacity, thin binding."),
    (2, 0): ("terminal-void", "The Terminal Void", "Force without constraint."),
}

# The corner itself. Never a cell, never populated, never earned.
VANGUARD = {
    "key": "vanguard",
    "name": "The Vanguard",
    "blurb": "All the capacity there is, and something above it holding all of it in check.",
    "occupiable": False,
    "why": (
        "The two axes pull against each other. A state with total capacity has "
        "nothing above it, and a state with something above it does not have "
        "total capacity. The corner is not a target nobody has reached yet. It is "
        "a condition no state can hold, which is why the distance to it is "
        "reported for every country and the position itself stays empty."
    ),
}

# If a future data change ever brings a state closer to the corner than this,
# the build stops rather than quietly publishing an arrival.
MIN_PLAUSIBLE_DISTANCE = 25.0

FORCE_W = {"rec": 0.75, "tax": 0.125, "govcons": 0.125}
INTEGRITY_W = {"ruleOfLaw": 0.65, "durability": 0.25, "stability": 0.10}


def load(name: str):
    with open(os.path.join(DATA, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def plotting_position(values: dict[str, float]) -> dict[str, float]:
    """Percentile on 0..100 by the Hazen position, (rank - 0.5) / n.

    Ties share the mean of the positions they span, so two identical inputs
    can never be separated by the ordering of the input file. The maximum is
    strictly below 100 for every n, which is what keeps the Approach score
    open-ended.
    """
    if not values:
        return {}
    ordered = sorted(values.items(), key=lambda kv: kv[1])
    n = len(ordered)
    out: dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and ordered[j + 1][1] == ordered[i][1]:
            j += 1
        pos = ((i + j) / 2.0 + 0.5) / n * 100.0
        for k in range(i, j + 1):
            out[ordered[k][0]] = pos
        i = j + 1
    return out


def force_score(rec_pct: float, tax_pct, gov_pct) -> float:
    """Force on 0..100: recognised power blended with an administrative leg,
    all three as percentiles against contemporaries.

    Reach and mass are what a state HAS; what it can collect and spend is what
    it can REACH INTO, and a state that cannot do that cannot do much with the
    mass it sits on. Weighted 3:1 towards recognised power, which covers every
    country on the board where the fiscal readings do not.

    The administrative quarter is carried by TWO readings, half each, because
    neither is clean alone. Tax revenue is the CENTRAL government series, so it
    reads federal states low for a definitional reason and not a real one:
    Germany sits at the 19th percentile on it and the United States at the
    18th, below Brazil, because the Laender and the states collect the rest.
    Government consumption is general-government and covers 28 more countries,
    but it is spending rather than the capacity to raise it. Together they
    disagree in the right places.

    Reweight rather than impute, the same rule the Integrity axis uses: the
    administrative quarter goes to whichever readings exist, and a country with
    neither is scored on recognised power alone rather than on a guess that
    would place it by invention.
    """
    legs = [(FORCE_W["tax"], tax_pct), (FORCE_W["govcons"], gov_pct)]
    present = [(w, v) for w, v in legs if v is not None]
    if not present:
        return rec_pct
    mass = sum(w for w, _ in present)
    admin = sum(w * v for w, v in present) / mass
    return FORCE_W["rec"] * rec_pct + (1.0 - FORCE_W["rec"]) * admin


EDGES = (100.0 / 3.0, 200.0 / 3.0)


def edge_margin(force_pct: float, integrity_pct: float):
    """How far a country sits from a DIFFERENT cell, and which axis decides it.

    Cell membership is a tertile of each axis, so a country 0.4 from a band
    edge holds its position by a margin far smaller than the measurement error
    in its inputs, while the score itself is not in doubt at all. Publishing
    the position without this reads a knife edge as a settled fact -- and the
    2026-09-05 Force change moved 24 countries across an edge without moving
    most of them very far."""
    df = min(abs(force_pct - e) for e in EDGES)
    di = min(abs(integrity_pct - e) for e in EDGES)
    return round(min(df, di), 1), ("force" if df <= di else "integrity")


def band(pct: float) -> int:
    """Tertile of the percentile axis: 0 low, 1 mid, 2 high."""
    if pct < 100.0 / 3.0:
        return 0
    if pct < 200.0 / 3.0:
        return 1
    return 2


def vanguard_distance(force_share: float, integrity_raw: float) -> float:
    """How far a state is from the corner, on ABSOLUTE terms, 0 to 100.

    Deliberately NOT computed from the percentile axes. A percentile puts the top
    of the field at the top of the scale, so under percentiles the leader of any
    era is always a whisker from the corner and the ideal reads as a finish line
    somebody has practically crossed. That is the opposite of what it means.

    The inputs here are absolute: force is the state's share of world recognised
    power, where 1.0 would be every bit of it, and integrity is the raw 0..1
    composite. Nothing is near (1, 1) and nothing can be, because holding all the
    capacity and being wholly bound are the same contradiction written twice.
    Higher means further away.
    """
    f = max(0.0, min(1.0, force_share))
    i = max(0.0, min(1.0, integrity_raw))
    return round(math.sqrt(((1.0 - f) ** 2 + (1.0 - i) ** 2) / 2.0) * 100.0, 1)


def durability(row):
    """Constitutional durability on 0..1, and how it was arrived at.

    Three cases, kept apart on purpose:

    * an adoption year is recorded, so durability is the log age against the
      oldest surviving constitution;
    * no adoption year because the order is UNCODIFIED (the CCP characteristics
      file says so, and the chronology records no replacement and no suspension
      since 1789). That is a fact about the country, not a hole in the data, and
      the honest reading of "never replaced" is maximal durability;
    * no adoption year and no uncodified flag. That is a HOLE, and the row scores
      on the other components rather than on a guess. This used to cover fifteen
      states whose constitution predates their entry into the Correlates of War
      system, so the chronology panel never carried their founding event. Those
      now come in through scripts/civic/constitution-adoption-overrides.json,
      each with a source and a note, and the bucket is down to entities the
      chronology has no characteristics for at all.
    """
    age = row.get("ageYears")
    if age is not None and age >= 0:
        # Age zero is a real reading, not a missing one. A constitution adopted
        # this year has no track record, which is exactly what a durability of
        # zero should say. Guinea, 2025, is the live case.
        return min(1.0, math.log(1.0 + age) / math.log(1.0 + OLDEST_CONSTITUTION_YEARS)), "age"
    chars = row.get("chars") or {}
    if chars.get("uncodified") is True and not row.get("systemsSince1789") and not row.get("suspensions"):
        return 1.0, "uncodified"
    return None, "unavailable"


def stability(suspensions, interims):
    events = (suspensions or 0) + (interims or 0)
    return max(0.0, 1.0 - min(events, 3) / 3.0)


def build_grid():
    ph = load("power-history.json")
    year = max(int(y) for y in ph["byYear"].keys())
    rows = ph["byYear"][str(year)]

    countries = {c["slug"]: c for c in load("countries.json")}
    ind = load("country-indicators.json")["countries"]
    const = {c["slug"]: c for c in load("constitutions.json")["countries"]}

    raw = {}
    for r in rows:
        slug = r["slug"]
        rec = r.get("rec")
        lat = r.get("lat")
        if rec is None:
            continue
        c = const.get(slug) or {}
        inds = (ind.get(slug) or {}).get("indicators") or {}
        rl = inds.get("ruleOfLaw", {}).get("value")
        tax = inds.get("taxRevenuePct", {}).get("value")
        govcons = inds.get("govConsumptionPct", {}).get("value")
        dur, dur_source = durability(c)
        stab = stability(c.get("suspensions"), c.get("interims"))
        raw[slug] = {
            "slug": slug,
            "name": (countries.get(slug) or {}).get("name") or r.get("name") or slug,
            "continent": (countries.get(slug) or {}).get("continent"),
            "rec": rec,
            "lat": lat,
            "share": r.get("share"),
            "powerRank": r.get("rank"),
            "tier": r.get("tier"),
            "ruleOfLaw": rl,
            "taxRevenuePct": tax,
            "taxRevenueYear": inds.get("taxRevenuePct", {}).get("year"),
            "govConsumptionPct": govcons,
            "govConsumptionYear": inds.get("govConsumptionPct", {}).get("year"),
            "constitutionAge": c.get("ageYears"),
            "constitutionAdopted": c.get("adopted"),
            "suspensions": c.get("suspensions"),
            "amendPerDecade": c.get("amendPerDecade"),
            "durability": None if dur is None else round(dur, 4),
            "durabilitySource": dur_source,
            "uncodified": bool((c.get("chars") or {}).get("uncodified")),
            "constitutionForm": (
                "uncodified" if (c.get("chars") or {}).get("uncodified")
                else "codified" if c.get("adopted") is not None
                else "unrecorded"
            ),
            "adoptedSource": c.get("adoptedSource"),
            "adoptedNote": c.get("adoptedNote"),
            "constitutionDocs": (c.get("chars") or {}).get("documents"),
            "constitutionWords": (c.get("chars") or {}).get("words"),
            "stability": round(stab, 4),
        }

    # Rule of law is the one component with no substitute: without it there is
    # no Integrity axis at all, so the row is listed as unscored rather than
    # scored on a thinner basis that would not be comparable.
    scored = {s: v for s, v in raw.items() if v["ruleOfLaw"] is not None}

    # Two percentile legs, each ranked over the countries that have it. The tax
    # leg is ranked among its own 154 rather than against the whole board, so a
    # missing reading never reads as a low one.
    rec_pct = plotting_position({s: v["rec"] for s, v in scored.items()})
    tax_pct = plotting_position(
        {s: v["taxRevenuePct"] for s, v in scored.items() if v["taxRevenuePct"] is not None})
    gov_pct = plotting_position(
        {s: v["govConsumptionPct"] for s, v in scored.items() if v["govConsumptionPct"] is not None})
    force_pct = {s: force_score(rec_pct[s], tax_pct.get(s), gov_pct.get(s)) for s in scored}
    integ_raw = {}
    for s, v in scored.items():
        if v["durability"] is None:
            # Reweight rather than impute. The missing mass goes to the two
            # components that are present, in their existing proportion.
            w = INTEGRITY_W["ruleOfLaw"] + INTEGRITY_W["stability"]
            integ_raw[s] = (
                INTEGRITY_W["ruleOfLaw"] / w * v["ruleOfLaw"]
                + INTEGRITY_W["stability"] / w * v["stability"]
            )
        else:
            integ_raw[s] = (
                INTEGRITY_W["ruleOfLaw"] * v["ruleOfLaw"]
                + INTEGRITY_W["durability"] * v["durability"]
                + INTEGRITY_W["stability"] * v["stability"]
            )
    integ_pct = plotting_position(integ_raw)

    out = []
    for s, v in scored.items():
        f = round(force_pct[s], 1)
        i = round(integ_pct[s], 1)
        key, name, blurb = CELLS[(band(f), band(i))]
        margin, margin_axis = edge_margin(f, i)
        row = dict(v)
        row.update({
            "force": f,
            "forceRecPct": round(rec_pct[s], 1),
            "forceTaxPct": None if s not in tax_pct else round(tax_pct[s], 1),
            "forceGovConsPct": None if s not in gov_pct else round(gov_pct[s], 1),
            "integrity": i,
            "integrityRaw": round(integ_raw[s], 4),
            "cell": key,
            "cellName": name,
            "cellMargin": margin,
            "cellMarginAxis": margin_axis,
            "cellBlurb": blurb,
            "vanguardDistance": vanguard_distance(v["rec"], integ_raw[s]),
            "imbalance": round(f - i, 1),
        })
        out.append(row)

    # The invariant, checked against real data on every build.
    stray = [r["slug"] for r in out if r["cell"] == VANGUARD["key"]]
    if stray:
        raise SystemExit(f"the Vanguard is not a position a state can hold: {stray}")
    closest = min(r["vanguardDistance"] for r in out)
    if closest < MIN_PLAUSIBLE_DISTANCE:
        raise SystemExit(
            f"a state came within {closest} of the corner, under the floor of "
            f"{MIN_PLAUSIBLE_DISTANCE}. Check the inputs before publishing an arrival."
        )

    # Alphabetical. The board has no overall ranking on purpose: every ordering
    # it offers is a named question, and the page chooses it.
    out.sort(key=lambda r: r["name"])

    unscored = sorted(
        (
            {
                "slug": s,
                "name": v["name"],
                "missing": ["rule of law"],
            }
            for s, v in raw.items() if s not in scored
        ),
        key=lambda r: r["name"],
    )

    counts = {}
    for r in out:
        counts[r["cell"]] = counts.get(r["cell"], 0) + 1

    return {
        "built": date.today().isoformat(),
        "year": year,
        "meta": {
            "title": "The Order Grid",
            "axes": {
                "force": "Recognised power in the Power Atlas (0.75) -- spending, productive economy, reach and standing -- blended with an administrative leg (0.25) carried half and half by tax revenue and government consumption, both as a share of GDP. Each a percentile against contemporaries. Two fiscal readings rather than one because tax revenue is the central government series and reads federal states low for a definitional reason; a country with neither reading is scored on recognised power alone rather than on a guess.",
                "integrity": "V-Dem rule of law (0.65), constitutional durability (0.25) and freedom from suspension (0.10). Percentile against contemporaries.",
            },
            "vanguard": VANGUARD,
            "vanguardDistance": (
                "Distance from the corner on absolute terms, 0 to 100, where higher is further "
                "away. Force is the state's share of world recognised power; integrity is the raw "
                "0 to 1 composite. Not derived from the percentile axes, which would put the "
                "leader of any field a whisker from the ideal."
            ),
            "bandMargin": (
                "Each axis is cut into thirds, so the nine positions are labels on a continuous "
                "score. A country sitting a fraction of a point from a band edge holds its "
                "position by less than the measurement error in its own inputs, while its score "
                "is not in doubt at all. Every row carries how far it is from a different "
                "position, and which of the two axes decides it, so a knife edge does not read "
                "as a settled fact."
            ),
            "fiscalUnderstatement": (
                "The administrative leg is what a state raises and spends as a share of GDP, and "
                "that understates any state funded off the tax line. Singapore is the clear case: "
                "tax revenue 13.6% of GDP and government consumption 10.3%, both near the bottom "
                "of the field, for a state nobody would call administratively weak. It funds "
                "itself substantially from land sales, returns on its reserves, and mandatory "
                "savings that are not counted as tax. The reading is accurate and the inference "
                "from it is wrong, which is why the leg is a quarter of the axis rather than half."
            ),
            "notAMoralityRanking": (
                "Force is not goodness and integrity is not virtue. A state can be capable, bound "
                "by law, and still do great harm. This describes conditions, never worth."
            ),
            "pending": [
                "A general-government TAX series. The one behind the Force axis is central "
                "government (GC.TAX.TOTL.GD.ZS), which reads federal states low for a "
                "definitional reason; pairing it with general-government consumption softens "
                "that without curing it.",
                "The full V-Dem panel, which turns one cross-section into a time series.",
            ],
            "sources": [
                "Correlates of War National Material Capabilities v6.0 and Maddison Project Database 2023, via the site Power Atlas",
                "V-Dem rule of law via Our World in Data",
                "Comparative Constitutions Project, Chronology of Constitutional Events v6.0",
                "World Bank Open Data, tax revenue and general government final consumption (% of GDP), via build-country-indicators.py",
            ],
            "weights": {"force": FORCE_W, "integrity": INTEGRITY_W},
            "cells": [
                {"key": k, "name": n, "blurb": b, "force": f, "integrity": i}
                for (f, i), (k, n, b) in CELLS.items()
            ],
            "coverage": {
                "inPowerAtlas": len(raw),
                "scored": len(out),
                "unscored": len(unscored),
                "forceWithBothLegs": sum(1 for r in out
                                         if r["forceTaxPct"] is not None and r["forceGovConsPct"] is not None),
                "forceWithOneLeg": sum(1 for r in out
                                       if (r["forceTaxPct"] is None) != (r["forceGovConsPct"] is None)),
                "forceRecOnly": sum(1 for r in out
                                    if r["forceTaxPct"] is None and r["forceGovConsPct"] is None),
                "durabilityFromAge": sum(1 for r in out if r["durabilitySource"] == "age"),
                "durabilityUncodified": sum(1 for r in out if r["durabilitySource"] == "uncodified"),
                "durabilityUnavailable": sum(1 for r in out if r["durabilitySource"] == "unavailable"),
                "cellCounts": counts,
                "cellMarginUnder5": sum(1 for r in out if r["cellMargin"] < 5.0),
                "cellMarginUnder1": sum(1 for r in out if r["cellMargin"] < 1.0),
                "vanguardCount": 0,
                "closestDistance": min((r["vanguardDistance"] for r in out), default=None),
                "closestName": (min(out, key=lambda r: r["vanguardDistance"])["name"] if out else None),
                "medianDistance": (round(sorted(r["vanguardDistance"] for r in out)[len(out) // 2], 1) if out else None),
            },
        },
        "countries": out,
        "unscored": unscored,
    }


def build_gap():
    ph = load("power-history.json")
    countries = {c["slug"]: c for c in load("countries.json")}
    years = [y for y in ph["years"] if y >= 1816]

    ever_top = set()
    for y in years:
        for r in ph["byYear"][str(y)][:8]:
            ever_top.add(r["slug"])

    series = {s: [] for s in ever_top}
    for y in years:
        for r in ph["byYear"][str(y)]:
            if r["slug"] in series and r.get("lat") is not None and r.get("rec") is not None:
                series[r["slug"]].append([y, round(r["lat"] - r["rec"], 5)])

    latest = max(int(y) for y in ph["byYear"].keys())
    current = []
    for r in ph["byYear"][str(latest)]:
        if r.get("lat") is None or r.get("rec") is None:
            continue
        current.append({
            "slug": r["slug"],
            "name": (countries.get(r["slug"]) or {}).get("name") or r["slug"],
            "rank": r.get("rank"),
            "tier": r.get("tier"),
            "share": r.get("share"),
            "lat": r["lat"],
            "rec": r["rec"],
            "gap": round(r["lat"] - r["rec"], 5),
        })
    current.sort(key=lambda r: -abs(r["gap"]))

    return {
        "built": date.today().isoformat(),
        "year": latest,
        "meta": {
            "title": "The Recognition Gap",
            "definition": "Latent material mass minus recognised standing, both as a share of world power in the same year.",
            "reading": {
                "positive": "Mass the world has not yet priced in.",
                "negative": "Standing the material base no longer supports.",
            },
            "seriesFrom": years[0],
            "seriesNote": "Series start at 1816, where the Correlates of War capability data begins. Earlier Power Atlas years are benchmark-interpolated and carry wide error bars.",
            "openQuestion": "Whether the gap leads war onset is an open question on this site, not a finding. It needs an initiation coding the war dataset does not yet carry.",
            "sources": ["Correlates of War NMC v6.0", "Maddison Project Database 2023", "site country score and curated status layer"],
        },
        "current": current,
        "series": {s: v for s, v in sorted(series.items()) if v},
    }


def self_test() -> int:
    fails = []

    pp = plotting_position({"a": 1.0, "b": 2.0, "c": 3.0})
    if not (0 < pp["a"] < pp["b"] < pp["c"] < 100):
        fails.append(f"plotting position not strictly inside 0..100: {pp}")
    if abs(pp["a"] - 16.666) > 0.01 or abs(pp["c"] - 83.333) > 0.01:
        fails.append(f"plotting position values wrong: {pp}")

    tied = plotting_position({"a": 5.0, "b": 5.0})
    if tied["a"] != tied["b"]:
        fails.append("ties must not be separated by input order")

    big = plotting_position({str(i): float(i) for i in range(1000)})
    if max(big.values()) >= 100:
        fails.append("plotting position reached 100, the Approach bound is broken")

    if VANGUARD["key"] in {k for k, _, _ in CELLS.values()}:
        fails.append("the Vanguard must not be one of the nine positions")
    if VANGUARD.get("occupiable") is not False:
        fails.append("the Vanguard must be marked unoccupiable")
    if vanguard_distance(1.0, 1.0) != 0.0:
        fails.append("the corner itself must sit at distance zero")
    best_case = vanguard_distance(0.35, 0.97)
    if best_case < MIN_PLAUSIBLE_DISTANCE:
        fails.append(f"the strongest plausible state must stay far from the corner, got {best_case}")
    if vanguard_distance(0.0, 0.0) < 99:
        fails.append("the empty case should be almost the whole way out")
    if vanguard_distance(0.05, 0.99) <= vanguard_distance(0.35, 0.99):
        fails.append("distance must fall as capacity rises, all else equal")

    if abs(sum(FORCE_W.values()) - 1.0) > 1e-9:
        fails.append(f"the Force weights must sum to 1: {FORCE_W}")
    if FORCE_W["tax"] != FORCE_W["govcons"]:
        fails.append("the two fiscal readings are half each of one leg; neither leads")
    if force_score(60.0, None, None) != 60.0:
        fails.append("no fiscal reading at all must reweight onto recognised power, not impute")
    if force_score(90.0, None, None) <= force_score(90.0, 10.0, 10.0):
        fails.append("a missing reading must never score worse than a low one")
    if abs(force_score(100.0, 0.0, 0.0) - 75.0) > 1e-9 or abs(force_score(0.0, 100.0, 100.0) - 25.0) > 1e-9:
        fails.append("Force blend is not 0.75 recognised power / 0.25 administrative")
    if abs(force_score(40.0, 40.0, 40.0) - 40.0) > 1e-9:
        fails.append("three equal legs must leave the score where it was")
    if not (force_score(50.0, 10.0, 10.0) < force_score(50.0, 50.0, 50.0) < force_score(50.0, 90.0, 90.0)):
        fails.append("Force must rise with the administrative leg, all else equal")
    # one reading present carries the whole administrative quarter -- the
    # federal-state artifact is why neither is allowed to be the only one when
    # both exist, but a country with one reading is not penalised for the other.
    if abs(force_score(50.0, 90.0, None) - force_score(50.0, None, 90.0)) > 1e-9:
        fails.append("the two fiscal legs must be interchangeable when only one is present")
    if abs(force_score(50.0, 90.0, None) - (0.75 * 50.0 + 0.25 * 90.0)) > 1e-9:
        fails.append("a single present reading must carry the full administrative quarter")
    if abs(force_score(50.0, 20.0, 80.0) - force_score(50.0, 50.0, 50.0)) > 1e-9:
        fails.append("two present readings are averaged, half each")

    m, ax = edge_margin(33.7, 90.0)
    if m != 0.4 or ax != "force":
        fails.append(f"edge margin should read 0.4 on force, got {m} on {ax}")
    m, ax = edge_margin(50.0, 67.0)
    if ax != "integrity":
        fails.append("the binding axis is whichever edge is nearer, here integrity")
    if edge_margin(50.0, 50.0)[0] != round(200.0 / 3.0 - 50.0, 1):
        fails.append("the middle of a band is its own distance from the nearer edge")
    if edge_margin(66.7, 33.3)[0] > 0.1:
        fails.append("a country sitting on both edges has no margin at all")
    if edge_margin(0.0, 100.0)[0] != round(100.0 / 3.0, 1):
        fails.append("the extremes are a full third from the nearest edge")

    if band(0) != 0 or band(50) != 1 or band(99.9) != 2:
        fails.append("band thresholds wrong")

    if durability({"ageYears": None})[0] is not None:
        fails.append("a missing age with no uncodified flag must give None")
    zero, zsrc = durability({"ageYears": 0})
    if zero != 0.0 or zsrc != "age":
        fails.append("an age of zero is a real reading and must score zero, not None")
    d1, _ = durability({"ageYears": 1})
    d2, src = durability({"ageYears": 200})
    if not (0 < d1 < d2 <= 1) or src != "age":
        fails.append(f"durability not monotone in 0..1: {d1} {d2}")
    unc, src = durability({"ageYears": None, "chars": {"uncodified": True}, "systemsSince1789": 0, "suspensions": 0})
    if unc != 1.0 or src != "uncodified":
        fails.append("an uncodified order with no replacement or suspension should read as maximally durable")
    # A country that lost its adoption year upstream must not be silently
    # treated as uncodified. Norway is the live case.
    hole, src = durability({"ageYears": None, "chars": {"uncodified": False}, "systemsSince1789": 0, "suspensions": 0})
    if hole is not None or src != "unavailable":
        fails.append("a missing adoption year must read as unavailable, never as uncodified")

    if stability(0, 0) != 1.0 or stability(9, 9) != 0.0:
        fails.append("stability bounds wrong")

    if len(CELLS) != 9:
        fails.append("the grid must have nine positions")
    if "vanguard" in {k for k, _, _ in CELLS.values()}:
        fails.append("the Vanguard leaked back into the grid")

    for msg in fails:
        print(f"FAIL {msg}")
    print("self-test: " + ("PASS" if not fails else f"{len(fails)} FAILURE(S)"))
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true", help="pure logic only, no files read")
    ap.add_argument("--dry-run", action="store_true", help="build and report, write nothing")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    if self_test():
        print("refusing to build on a failing self-test")
        return 1

    grid = build_grid()
    gap = build_gap()

    cov = grid["meta"]["coverage"]
    print(f"grid  year {grid['year']}: {cov['scored']} scored, {cov['unscored']} unscored")
    print(f"  Force: {cov['forceWithBothLegs']} on both fiscal legs, "
          f"{cov['forceWithOneLeg']} on one, "
          f"{cov['forceRecOnly']} on recognised power alone")
    print(f"  Vanguard: {cov['vanguardCount']} states. Closest anything gets is "
          f"{cov['closestName']} at {cov['closestDistance']}, median {cov['medianDistance']}.")
    for c in grid["meta"]["cells"]:
        print(f"  {c['name']:<28} {cov['cellCounts'].get(c['key'], 0):>4}")
    print(f"gap   {len(gap['current'])} states in {gap['year']}, {len(gap['series'])} series from {gap['meta']['seriesFrom']}")

    if args.dry_run:
        print("dry run, nothing written")
        return 0

    os.makedirs(OUT_DIR, exist_ok=True)
    for name, payload in (("order-grid.json", grid), ("recognition-gap.json", gap)):
        path = os.path.join(OUT_DIR, name)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
