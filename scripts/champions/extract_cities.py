#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Propose a home city for every club in the remaining honour-roll portals.

Most clubs in these leagues carry their city in the name (Copra Nordmeccanica
PIACENZA, THW KIEL, Avangard OMSK, Chennai Super Kings). So rather than hand-map
233 clubs, try every token and token-pair in the name against the metro names of
that league's country, accept only EXACT matches, and hand-map the residue.

Nothing here is a guess: an exact match on a metro name inside the club name is
evidence; anything else is printed for curation.

    python extract_cities.py
"""

import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
D = ROOT / "public" / "data"

# Roll key -> the country whose metros it should match against. Multi-country
# competitions list every candidate; a hit in any of them counts.
ROLL_COUNTRY = {
    "county":     ["United Kingdom"],
    "superleague": ["United Kingdom", "France"],          # Catalans Dragons
    "superlega":  ["Italy"],
    "plusliga":   ["Poland"],
    "svleague":   ["Japan"],
    "bundesliga": ["Germany"],
    "khl":        ["Russia", "Czech Republic", "Belarus", "Kazakhstan",
                   "Latvia", "Finland", "Slovakia", "Croatia"],
    "ipl":        ["India"],
    "bbl":        ["Australia"],
    "psl":        ["Pakistan"],
    "cpl":        ["Trinidad & Tobago", "Jamaica", "Guyana", "Barbados",
                   "Saint Lucia", "St. Kitts & Nevis"],
    "bpl":        ["Bangladesh"],
    "blast":      ["United Kingdom"],
    "smash":      ["New Zealand"],
    "hundred":    ["United Kingdom"],
    "sa20":       ["South Africa"],
    "ilt20":      ["United Arab Emirates"],
    "lpl":        ["Sri Lanka"],
}

sys.path.insert(0, str(HERE))
from hand_cities import HAND_CITY  # noqa: E402

SOURCES = [
    ("cricket-county", D / "honours" / "cricket-county.json"),
    ("rugby-league", D / "honours" / "rugby-league.json"),
    ("volleyball-domestic", D / "honours" / "volleyball-domestic.json"),
    ("handball-domestic", D / "honours" / "handball-domestic.json"),
    ("hockey-domestic", D / "honours" / "hockey-domestic.json"),
    ("cricket-t20", D / "cricket" / "t20-leagues.json"),
]

_CHARMAP = {"ı": "i", "İ": "i", "đ": "d", "Đ": "d",
            "ł": "l", "Ł": "l", "ø": "o", "ß": "ss"}


def fold(s):
    s = "".join(_CHARMAP.get(c, c) for c in (s or ""))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def split_names(v):
    """Shared titles: basketball uses ' & ', county cricket uses ', '."""
    if not v:
        return []
    parts = re.split(r"\s*&\s*|,\s*", str(v))
    return [p.strip() for p in parts if p.strip()]


def main():
    metros = json.load(io.open(D / "metros.json", encoding="utf-8"))
    metros = metros if isinstance(metros, list) else metros.get("metros")
    metros = list(metros.values() if isinstance(metros, dict) else metros)
    by_country = defaultdict(dict)
    for m in metros:
        by_country[m.get("country")][fold(m.get("name"))] = (m["slug"], m.get("name"))

    # Tier 2: the workbook member rows. A club town that is not itself a metro
    # (Batley, Dewsbury) is very often a MEMBER of one, and the Counties sheet
    # maps English county names straight to a metro, which is exactly what
    # county cricket and rugby league need. Same ground truth the boundary
    # builder unions into polygons.
    member = {}
    try:
        from python_calamine import CalamineWorkbook
        wb = CalamineWorkbook.from_path(
            r"C:\Users\ashwi\OneDrive\Excel Files\MetroAreas.xlsx")
        for sheet, c_name in (("Counties", "Distri rrondissement/County"),
                              ("Municipality", "Municipality")):
            rows = wb.get_sheet_by_name(sheet).to_python()
            hdr = [str(h).strip() for h in rows[0]]
            ic, im, ima = hdr.index("Country"), hdr.index(c_name), hdr.index("Metro Area")
            for r in rows[1:]:
                if len(r) <= max(ic, im, ima):
                    continue
                ctry, nm, ma = (str(r[ic] or "").strip(), str(r[im] or "").strip(),
                                str(r[ima] or "").strip())
                if nm and ma:
                    member.setdefault((fold(nm), ctry), set()).add(ma)
        print(f"  member index: {len(member):,} (name, country) keys")
    except Exception as e:
        print(f"  member index unavailable ({e})")

    UK = {"United Kingdom", "England", "Wales", "Scotland", "Northern Ireland"}
    slug_of = {}
    for m in metros:
        c = m.get("country")
        slug_of.setdefault((fold(m.get("name")), c), m["slug"])
        if c == "United Kingdom":
            for alias in UK:
                slug_of.setdefault((fold(m.get("name")), alias), m["slug"])

    resolved, residue = {}, []
    for portal, p in SOURCES:
        if not p.exists():
            continue
        d = json.load(io.open(p, encoding="utf-8"))
        for key, roll in d["rolls"].items():
            countries = list(ROLL_COUNTRY.get(key, []))
            # The two workbook sheets disagree on the UK's name.
            if "United Kingdom" in countries:
                countries += ["England", "Wales", "Scotland", "Northern Ireland"]
            pool = {}
            for c in countries:
                pool.update(by_country.get(c, {}))
            clubs = set()
            for r in roll:
                for who in (r.get("winner"), r.get("ru")):
                    clubs.update(split_names(who))
            for club in sorted(clubs):
                # Wikipedia disambiguators leak into names.
                name = re.sub(r"\s*\((?:ice hockey|football|basketball)\)$",
                              "", club).strip()
                toks = fold(name).split()
                hit = None
                # Longest span first, so "Kedzierzyn Kozle" beats "Kedzierzyn".
                for span in range(min(3, len(toks)), 0, -1):
                    for i in range(len(toks) - span + 1):
                        cand = " ".join(toks[i:i + span])
                        if cand in pool:
                            hit = pool[cand]
                            break
                    if hit:
                        break
                tier = "metro-name" if hit else None
                # A hand-mapped home city goes through the SAME tiers, so a
                # misspelling fails loudly rather than resolving to something
                # plausible.
                if not hit and club in HAND_CITY:
                    hc = fold(HAND_CITY[club])
                    if hc in pool:
                        hit, tier = pool[hc], "hand-city"
                    else:
                        found = set()
                        for c in countries:
                            for ma in member.get((hc, c), ()):
                                sl = slug_of.get((fold(ma), c))
                                if sl:
                                    found.add((sl, ma))
                        if len(found) == 1:
                            hit, tier = found.pop(), "hand-city-member"
                if not hit:
                    # Try the whole name, then each token span, as a member row.
                    cands = [fold(name)] + [
                        " ".join(toks[i:i + span])
                        for span in range(min(3, len(toks)), 0, -1)
                        for i in range(len(toks) - span + 1)]
                    for cand in cands:
                        found = set()
                        for c in countries:
                            for ma in member.get((cand, c), ()):
                                sl = slug_of.get((fold(ma), c))
                                if sl:
                                    found.add((sl, ma))
                        if len(found) == 1:
                            hit = found.pop()
                            tier = "workbook-member"
                            break
                        if len(found) > 1:
                            break      # ambiguous, do not choose
                if hit:
                    resolved[club] = {"portal": portal, "roll": key,
                                      "metro": hit[1], "metro_slug": hit[0],
                                      "tier": tier, "countries": countries}
                else:
                    residue.append((portal, key, club, countries))

    print(f"auto-resolved by name: {len(resolved)}")
    print(f"needs a hand mapping : {len(residue)}\n")
    print("=== AUTO-RESOLVED ===")
    for c in sorted(resolved):
        r = resolved[c]
        print(f"  {c:38s} -> {r['metro']} ({r['metro_slug']})  [{r.get('tier')}]")
    tiers = {}
    for r in resolved.values():
        tiers[r.get("tier")] = tiers.get(r.get("tier"), 0) + 1
    print("\nby tier:", tiers)
    bad = [c for c in HAND_CITY if c not in resolved]
    if bad:
        print(f"\n!! {len(bad)} HAND-MAPPED CITIES THAT DID NOT RESOLVE:")
        for c in sorted(bad):
            print(f"   {c:34s} city='{HAND_CITY[c]}'")
    print("\n=== RESIDUE, grouped by roll ===")
    byroll = defaultdict(list)
    for portal, key, club, _ in residue:
        byroll[f"{portal}/{key}"].append(club)
    for k in sorted(byroll):
        print(f"\n-- {k} ({len(byroll[k])})")
        for c in byroll[k]:
            print("   ", c)

    io.open(ROOT / "_to_delete" / "auto_cities.json", "w",
            encoding="utf-8").write(json.dumps(resolved, ensure_ascii=False, indent=1))
    print(f"\nwrote _to_delete/auto_cities.json")


if __name__ == "__main__":
    main()
