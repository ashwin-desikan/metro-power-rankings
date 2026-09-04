#!/usr/bin/env python3
"""
build_order_trajectory.py

Direction of travel for the Order layer. Offline, deterministic, no network.

  public/data/order/trajectory.json

WHY THIS EXISTS
---------------
The Order Grid describes where a state stands. Standing still is the least
interesting thing about an ideal nothing can reach: if the corner is
unattainable, the only question worth asking is which way a country is moving
and how fast. This file answers that from data already committed in the repo.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
It does not blend the signals into one number. Their coverage is wildly
different: the force trend exists for every ranked state, the accountability
drift for forty, the flagged-leader panel for sixty-six. A composite would hide
that behind a single decimal, and the reader would have no way to tell a country
that is genuinely stable from one that simply has no data. Every signal is
reported on its own, with its own coverage stated.

🔴 THE FLAGGED-LEADER PANEL IS A CURATED LIST, NOT A MEASUREMENT.
Thirteen sitting leaders are flagged out of roughly two hundred. The absence of
a flag is not evidence of anything, and any page using this must say so. See
scripts/data/warn-flags.json for the criteria and the evidence behind each name.

USAGE
    python3 scripts/order/build_order_trajectory.py --self-test
    python3 scripts/order/build_order_trajectory.py --dry-run
    python3 scripts/order/build_order_trajectory.py
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import statistics
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(DATA, "order", "trajectory.json")

WARN_GLYPH = "⚠"
NOW = date.today().year
RECENT_YEARS = 10          # "recently entered a flagged period"
STRESS_WINDOW = 25         # constitutional events counted as current stress
HISTORY_FROM = 1900        # the flagged-leadership panel is reported from here

# Election hub codes that are not an ISO2 country code.
HUB_OVERRIDES = {"uk": "united-kingdom", "tw": "taiwan", "va": "vatican-city", "eu": None}


def load(name):
    with open(os.path.join(DATA, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def year_of(s):
    """First four digits of an ISO-ish date, or None. Never guesses."""
    if not s:
        return None
    m = re.match(r"^(\d{4})", str(s))
    return int(m.group(1)) if m else None


def bare(name):
    return re.sub(r"^[⚠️\U0001f451\s]+", "", name or "").strip()


def merge_spells(terms, gap=1):
    """Fold consecutive flagged terms into one spell.

    Argentina's junta is four flagged entries between 1976 and 1983 and one
    period of history. Counting it as four would make recurrence meaningless,
    which is the whole point of the recurrence signal.
    """
    spells = []
    for start, end, who in sorted(terms, key=lambda t: (t[0] if t[0] is not None else 0)):
        if start is None:
            continue
        if spells and spells[-1]["to"] is not None and start - spells[-1]["to"] <= gap:
            spells[-1]["to"] = end if (end is None or spells[-1]["to"] is None) else max(spells[-1]["to"], end)
            spells[-1]["who"].append(who)
            if end is None:
                spells[-1]["to"] = None
        else:
            spells.append({"from": start, "to": end, "who": [who]})
    return spells


def overlap_years(spells, since, until):
    total = 0
    for sp in spells:
        a = max(sp["from"], since)
        b = (sp["to"] if sp["to"] is not None else until)
        if b > a:
            total += b - a
    return total


def flagged_panel():
    """Per country: every spell under a leader carrying the warning glyph."""
    out = {}
    for path in sorted(glob.glob(os.path.join(DATA, "leaders", "*.json"))):
        slug = os.path.basename(path)[:-5]
        if slug.startswith("_"):
            continue
        try:
            entries = json.load(open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if not isinstance(entries, list):
            continue
        terms, flagged_terms = [], []
        for e in entries:
            name = e.get("name") or ""
            start, end = year_of(e.get("start")), year_of(e.get("end"))
            if start is not None:
                terms.append((start, end, bare(name), bool(e.get("current"))))
            if WARN_GLYPH in name and start is not None:
                flagged_terms.append((start, end, bare(name)))
        if not terms:
            continue
        spells = merge_spells(flagged_terms)
        current = next((t for t in terms if t[3]), None)
        currently_flagged = any(sp["to"] is None for sp in spells)
        entered = max((sp["from"] for sp in spells if sp["to"] is None), default=None)
        ended = [sp["to"] for sp in spells if sp["to"] is not None]
        out[slug] = {
            "spells": spells,
            "spellCount": len(spells),
            "currentlyFlagged": currently_flagged,
            "flaggedSince": entered,
            "yearsSinceLastFlagEnded": (NOW - max(ended)) if (ended and not currently_flagged) else None,
            "yearsFlaggedSince1900": overlap_years(spells, HISTORY_FROM, NOW),
            "enteredFlagWithin": (NOW - entered) if entered is not None else None,
            "currentLeader": current[2] if current else None,
            "currentLeaderSince": current[0] if current else None,
            "leadersSince2000": sum(1 for t in terms if t[0] and t[0] >= 2000),
            "medianTenure": (
                round(statistics.median([
                    (t[1] - t[0]) for t in terms if t[0] and t[1] and t[1] >= t[0]
                ]), 1) if sum(1 for t in terms if t[0] and t[1]) >= 3 else None
            ),
        }
    return out


def force_trend(ph, slug, back):
    y = NOW - back
    if str(y) not in ph["byYear"]:
        return None
    row = next((r for r in ph["byYear"][str(y)] if r["slug"] == slug), None)
    return row.get("rec") if row else None


def build():
    ph = load("power-history.json")
    countries = {c["slug"]: c for c in load("countries.json")}
    const = {c["slug"]: c for c in load("constitutions.json")["countries"]}
    systems = load("constitutions.json")["systems"]
    grid = {c["slug"]: c for c in load(os.path.join("order", "order-grid.json"))["countries"]}
    wars = load("conflicts.json")["wars"]
    hubs = {h["code"]: h for h in load("election-systems.json")["hubs"]}
    ind = load("country-indicators.json")["countries"]
    panel = flagged_panel()

    iso2 = {}
    for slug, v in ind.items():
        code = (v.get("iso2") or "").lower()
        if code:
            iso2[code] = slug
    hub_by_slug = {}
    for code, h in hubs.items():
        slug = HUB_OVERRIDES.get(code, iso2.get(code))
        if slug:
            hub_by_slug[slug] = h

    sys_by_slug = {}
    for s in systems:
        sys_by_slug.setdefault(s["slug"], []).append(s)

    war_by_slug = {}
    for w in wars:
        start = year_of(w.get("start"))
        for side in ("sideA", "sideB"):
            for p in w.get(side) or []:
                if p.get("slug") and p.get("principal"):
                    rec = war_by_slug.setdefault(p["slug"], {"since2000": 0, "ongoing": 0, "total": 0})
                    rec["total"] += 1
                    if start and start >= 2000:
                        rec["since2000"] += 1
                    if w.get("ongoing"):
                        rec["ongoing"] += 1

    latest = max(int(y) for y in ph["byYear"].keys())
    rows = []
    for slug in sorted(set(list(grid.keys()) + list(panel.keys()))):
        if slug not in countries:
            continue
        g = grid.get(slug)
        now = force_trend(ph, slug, 0) if str(latest) in ph["byYear"] else None
        now = (g or {}).get("rec", now)
        f20, f50 = force_trend(ph, slug, 20), force_trend(ph, slug, 50)

        c = const.get(slug) or {}
        ruptures = [
            s for s in sys_by_slug.get(slug, [])
            if s.get("end") and s["end"] >= NOW - STRESS_WINDOW
        ]
        hub = hub_by_slug.get(slug)
        turnout = (hub or {}).get("turnout") or {}
        t_latest = (turnout.get("latest") or {}).get("turnout")
        t_median = turnout.get("medianPost1945") or turnout.get("median")
        lsq_latest = ((hub or {}).get("latest") or {}).get("lsq")
        lsq_median = (hub or {}).get("median")

        p = panel.get(slug) or {}
        rows.append({
            "slug": slug,
            "name": countries[slug].get("name") or slug,
            "onGrid": slug in grid,
            "cell": (g or {}).get("cell"),
            "cellName": (g or {}).get("cellName"),
            "flags": {
                "currentlyFlagged": p.get("currentlyFlagged", False),
                "flaggedSince": p.get("flaggedSince"),
                "enteredFlagWithin": p.get("enteredFlagWithin"),
                "newlyFlagged": bool(p.get("enteredFlagWithin") is not None and p["enteredFlagWithin"] <= RECENT_YEARS),
                "spellCount": p.get("spellCount", 0),
                "yearsFlaggedSince1900": p.get("yearsFlaggedSince1900", 0),
                "yearsSinceLastFlagEnded": p.get("yearsSinceLastFlagEnded"),
                "spells": p.get("spells", []),
            },
            "force": {
                "now": now,
                "back20": f20,
                "back50": f50,
                "delta20": (round(now - f20, 5) if (now is not None and f20 is not None) else None),
                "delta50": (round(now - f50, 5) if (now is not None and f50 is not None) else None),
            },
            "constitution": {
                "adopted": c.get("adopted"),
                "ageYears": c.get("ageYears"),
                "uncodified": bool((c.get("chars") or {}).get("uncodified")),
                "systemsSince1789": c.get("systemsSince1789"),
                "suspensions": c.get("suspensions"),
                "interims": c.get("interims"),
                "rupturesInWindow": len(ruptures),
                "lastRupture": max((s["end"] for s in ruptures), default=None),
                "endedLastOrder": (
                    max(ruptures, key=lambda s: s["end"])["outcome"] if ruptures else None
                ),
            },
            "leadership": {
                "currentLeader": p.get("currentLeader"),
                "since": p.get("currentLeaderSince"),
                "tenureYears": (NOW - p["currentLeaderSince"]) if p.get("currentLeaderSince") else None,
                "medianTenure": p.get("medianTenure"),
                "leadersSince2000": p.get("leadersSince2000"),
            },
            "accountability": ({
                "turnoutLatest": t_latest,
                "turnoutMedianPost1945": t_median,
                "turnoutDelta": (round(t_latest - t_median, 2) if (t_latest is not None and t_median is not None) else None),
                "disproportionalityLatest": lsq_latest,
                "disproportionalityMedian": lsq_median,
                "disproportionalityDelta": (round(lsq_latest - lsq_median, 2) if (lsq_latest is not None and lsq_median is not None) else None),
            } if hub else None),
            "conflict": war_by_slug.get(slug, {"since2000": 0, "ongoing": 0, "total": 0}),
        })

    cov = {
        "countries": len(rows),
        "onGrid": sum(1 for r in rows if r["onGrid"]),
        "withFlagHistory": sum(1 for r in rows if r["flags"]["spellCount"]),
        "currentlyFlagged": sum(1 for r in rows if r["flags"]["currentlyFlagged"]),
        "newlyFlagged": sum(1 for r in rows if r["flags"]["newlyFlagged"]),
        "withForceTrend": sum(1 for r in rows if r["force"]["delta20"] is not None),
        "withAccountability": sum(1 for r in rows if r["accountability"]),
        "withRuptureInWindow": sum(1 for r in rows if r["constitution"]["rupturesInWindow"]),
    }

    return {
        "built": date.today().isoformat(),
        "year": NOW,
        "meta": {
            "title": "Direction of travel",
            "thesis": (
                "The corner cannot be reached, so the question worth asking is which way a "
                "country is moving. These are the signals that can be measured from what this "
                "site already holds, reported separately because their coverage differs."
            ),
            "noComposite": (
                "Deliberately not blended into one score. The force trend covers every ranked "
                "state, the accountability drift forty, the flagged-leader panel sixty-six. One "
                "number would hide that, and a reader could not tell a stable country from an "
                "unmeasured one."
            ),
            "curatedFlagWarning": (
                "The flagged-leader panel is a curated editorial list against a written criterion "
                "(atrocities, systemic subversion, criminal conviction), not a measurement of "
                "every country. Thirteen sitting leaders are flagged. The absence of a flag is "
                "not evidence of anything."
            ),
            "signals": {
                "flags": "Spells under a leader carrying the warning glyph, merged where consecutive. Entering a spell is the largest single move a country can make on this board; holding one for decades is not a movement at all.",
                "force": "Change in recognised share of world power over 20 and 50 years.",
                "constitution": "Orders replaced or interrupted in the last 25 years, plus suspensions and interims on the whole record.",
                "leadership": "Current leader's tenure against the country's own median, and how many leaders it has had since 2000.",
                "accountability": "Turnout against the country's own post-1945 median, and how far the last election's seats strayed from its votes against its own median.",
                "conflict": "Wars entered as a principal since 2000, and how many are still running.",
            },
            "windows": {"recentFlagYears": RECENT_YEARS, "stressWindow": STRESS_WINDOW, "panelFrom": HISTORY_FROM},
            "coverage": cov,
            "sources": [
                "Site leadership histories, 315 country files, with the editorial warning glyph",
                "scripts/data/warn-flags.json, the criteria and evidence behind each flag",
                "Correlates of War and Maddison via the site Power Atlas",
                "Comparative Constitutions Project, Chronology of Constitutional Events v6.0",
                "Site elections atlas, turnout and Gallagher index",
                "Site interstate war record",
            ],
        },
        "countries": rows,
    }


def self_test():
    fails = []

    if year_of("1976-03-24") != 1976 or year_of(None) is not None or year_of("n/a") is not None:
        fails.append("year_of must read a leading year or return None, never guess")

    if bare("⚠️ Donald Trump") != "Donald Trump":
        fails.append("the glyph must be stripped for matching")

    # Argentina's junta: four consecutive terms, one spell.
    junta = [(1976, 1981, "a"), (1981, 1981, "b"), (1981, 1982, "c"), (1982, 1983, "d")]
    sp = merge_spells(junta)
    if len(sp) != 1 or sp[0]["from"] != 1976 or sp[0]["to"] != 1983:
        fails.append(f"consecutive flagged terms must merge into one spell, got {sp}")

    # A gap of decades is two spells, which is the recurrence signal.
    two = merge_spells([(1930, 1945, "a"), (2016, None, "b")])
    if len(two) != 2 or two[1]["to"] is not None:
        fails.append(f"separated spells must stay separate and an open spell stays open, got {two}")

    if overlap_years([{"from": 1990, "to": 2000}], 1900, 2026) != 10:
        fails.append("closed spell should contribute its own length")
    if overlap_years([{"from": 2020, "to": None}], 1900, 2026) != 6:
        fails.append("an open spell should run to the current year")
    if overlap_years([{"from": 1880, "to": 1910}], 1900, 2026) != 10:
        fails.append("a spell starting before the window should only count inside it")

    for msg in fails:
        print(f"FAIL {msg}")
    print("self-test: " + ("PASS" if not fails else f"{len(fails)} FAILURE(S)"))
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if self_test():
        print("refusing to build on a failing self-test")
        return 1

    payload = build()
    cov = payload["meta"]["coverage"]
    print(f"trajectory: {cov['countries']} countries, {cov['onGrid']} of them on the grid")
    print(f"  flagged leadership history: {cov['withFlagHistory']} countries, "
          f"{cov['currentlyFlagged']} flagged now, {cov['newlyFlagged']} newly flagged")
    print(f"  force trend: {cov['withForceTrend']}   accountability: {cov['withAccountability']}   "
          f"constitutional rupture in {STRESS_WINDOW}y: {cov['withRuptureInWindow']}")

    if a.dry_run:
        print("dry run, nothing written")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
