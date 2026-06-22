#!/usr/bin/env python3
"""
One-off seeder: build the canonical Rivalries.xlsx (repo root, gitignored) from
Ashwin's two hand-tracked files (football derbies + national, and CFB). After
this, Rivalries.xlsx is the source of truth Ashwin maintains in Excel and
scripts/build-rivalries.py turns into public/data/rivalries.json.

Stores ONE canonical row per pair (direction-collapsed); the builder mirrors
A<->B. Columns:
  Sport, Scope, LeagueHint, Rivalry, Team A, Team B, Country, Trophy, Type, Tier, Blurb, Wikipedia

Usage (host): python scripts/_seed_rivalries.py
"""
import csv
import os
import re
import unicodedata

import openpyxl

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS = r"C:\Users\ashwi\AppData\Roaming\Claude\local-agent-mode-sessions\72950ca8-25bf-4efa-a072-cf242b751532\9b1b1944-7c0a-44be-bca1-0e7e1e7656a6\local_82d934ab-c3b7-4286-a3aa-d82db7faa64a\uploads"
OUT = os.path.join(REPO, "Rivalries.xlsx")

HEADER = ["Sport", "Scope", "LeagueHint", "Rivalry", "Team A", "Team B",
          "Country", "Trophy", "Type", "Tier", "Blurb", "Wikipedia"]


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def load_country_names():
    import json
    p = os.path.join(REPO, "public", "data", "countries.json")
    names = set()
    for c in json.load(open(p, encoding="utf-8")):
        if c.get("name"):
            names.add(c["name"].strip())
    # a few football-team spellings that differ from the country row
    names |= {"United States", "England", "Scotland", "Wales", "Northern Ireland"}
    return names


def main():
    countries = load_country_names()
    rows = []
    seen = set()  # (sport, frozenset(normA, normB))

    def add(sport, scope, league, rivalry, a, b, country="", trophy="", typ="", tier="", blurb="", wiki=""):
        a, b = a.strip(), b.strip()
        if not a or not b:
            return
        key = (sport, frozenset((norm(a), norm(b))))
        if key in seen:
            return
        seen.add(key)
        rows.append([sport, scope, league, rivalry, a, b, country, trophy, typ, tier, blurb, wiki])

    # --- Football (clubs + national) ---
    with open(os.path.join(UPLOADS, "rivalries.txt"), encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            a, b = r["Cur. Name"].strip(), r["Opp. Name"].strip()
            is_natl = a in countries and b in countries
            add(
                "Football",
                "National" if is_natl else "Club",
                "" if is_natl else "",
                r["Derby"].strip(),
                a, b,
                r.get("Cur. Country", "").strip(),
            )

    # --- College Football ---
    with open(os.path.join(UPLOADS, "cfbrivalries.txt"), encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            a = (r.get("Cur. Name") or "").strip()
            b = (r.get("Opp Team.") or "").strip()
            conf_riv = (r.get("Conf. Rivalry") or "").strip().upper() == "Y"
            state_riv = (r.get("State Rivalry") or "").strip().upper() == "Y"
            typ = []
            if conf_riv:
                typ.append("In-conference")
            if state_riv:
                typ.append("Same state")
            add(
                "College Football", "College", "CFB",
                (r.get("Rivalry") or "").strip(),
                a, b,
                "United States",
                trophy=(r.get("Rivalry") or "").strip(),  # CFB rivalry names are usually the trophy/game
                typ=", ".join(typ),
            )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rivalries"
    ws.append(HEADER)
    for row in rows:
        ws.append(row)
    ws.freeze_panes = "A2"
    wb.save(OUT)

    import collections
    by_sport = collections.Counter(r[0] for r in rows)
    by_scope = collections.Counter(r[1] for r in rows)
    print(f"Wrote {OUT}: {len(rows)} canonical rivalries")
    print("  by sport:", dict(by_sport))
    print("  by scope:", dict(by_scope))


if __name__ == "__main__":
    main()
