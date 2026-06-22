#!/usr/bin/env python3
"""
Append rivalries to Rivalries.xlsx from a list of Wikipedia rivalry-article
titles (one per line), e.g. "Red Sox-Yankees rivalry". Each "A-B rivalry" title
is split on the en-dash, both sides validated against our franchise/team file,
and only fully-resolved pairs are added (deduped). Named series with no two
teams in the title (e.g. "Subway Series") are printed as flags for manual entry.

Usage:
  python scripts/_rivalry_from_titles.py --titles data/cat-mlb.txt --league mlb
  python scripts/_rivalry_from_titles.py --titles data/cat-cbb.txt --league cbb
"""
import argparse
import json
import os
import re
import unicodedata

import openpyxl

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(REPO, "Rivalries.xlsx")

LEAGUE_CFG = {
    "nfl": {"sport": "American Football", "hint": "NFL", "src": "nfl/franchises.json"},
    "nba": {"sport": "Basketball", "hint": "NBA", "src": "nba/franchises.json"},
    "nhl": {"sport": "Hockey", "hint": "NHL", "src": "nhl/franchises.json"},
    "mlb": {"sport": "Baseball", "hint": "MLB", "src": "mlb/franchises.json"},
    "cbb": {"sport": "Basketball", "hint": "NCAAM", "src": "cbb/data.json"},
}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def load_universe(league):
    cfg = LEAGUE_CFG[league]
    p = os.path.join(REPO, "public", "data", cfg["src"])
    d = json.load(open(p, encoding="utf-8"))
    uni = {}
    if league == "cbb":
        teams = d.get("teams") if isinstance(d, dict) else d
        for t in teams:
            name = t.get("name") or t.get("school") or t.get("display_name")
            if not name:
                continue
            for v in {name, t.get("school"), t.get("display_name"), t.get("short")}:
                if v:
                    uni.setdefault(norm(v), (name, name))
        # Wikipedia title short-forms -> our canonical school name.
        CBB_ALIAS = {
            "Carolina": "North Carolina", "NC State": "North Carolina State",
            "UConn": "Connecticut", "Penn": "Pennsylvania", "UMass": "Massachusetts",
            "VCU": "Virginia Commonwealth", "Saint Mary's": "Saint Mary's (CA)",
            "Ole Miss": "Mississippi", "Pitt": "Pittsburgh", "SMU": "SMU",
            "St. John's": "St. John's (NY)", "Saint Joseph's": "Saint Joseph's",
            "William & Mary": "William & Mary", "UAB": "UAB",
        }
        for alias, target in CBB_ALIAS.items():
            tgt = uni.get(norm(target))
            if tgt:
                uni.setdefault(norm(alias), tgt)
        return uni
    rows = d if isinstance(d, list) else (d.get("franchises") or d.get("teams") or list(d.values())[0])
    for r in rows:
        canonical = r.get("canonical") or r.get("display_name") or r.get("name")
        nick = r.get("team") or r.get("name") or canonical
        city = r.get("city") or ""
        team = r.get("team") or ""
        for v in {canonical, r.get("display_name"), r.get("name"), r.get("team"),
                  f"{city} {team}".strip() if city and team else None}:
            if v:
                uni.setdefault(norm(v), (canonical, nick))
    return uni


def parse_pair(title):
    t = re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()           # drop trailing "(basketball)"
    t = re.sub(r"\s+(?:men's|women's)?\s*(?:basketball\s+)?(?:rivalry|rivalries)$", "", t, flags=re.I).strip()
    for dash in ("–", "—", "—", "–"):
        if dash in t:
            a, b = t.split(dash, 1)
            return a.strip(), b.strip()
    if " vs " in t.lower():
        a, b = re.split(r"\s+vs\.?\s+", t, 1, flags=re.I)
        return a.strip(), b.strip()
    return None


def load_existing(ws):
    it = ws.iter_rows(values_only=True)
    header = list(next(it))
    idx = {h: i for i, h in enumerate(header)}
    seen = set()
    for r in it:
        sport = r[idx["Sport"]] if r[idx["Sport"]] else ""
        a = r[idx["Team A"]] or ""
        b = r[idx["Team B"]] or ""
        if sport and a and b:
            seen.add((sport, frozenset((norm(a), norm(b)))))
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--titles", required=True)
    ap.add_argument("--league", required=True, choices=list(LEAGUE_CFG))
    args = ap.parse_args()
    cfg = LEAGUE_CFG[args.league]
    uni = load_universe(args.league)

    wb = openpyxl.load_workbook(XLSX)
    ws = wb["Rivalries"]
    seen = load_existing(ws)

    added, flags = [], []
    for line in open(args.titles, encoding="utf-8"):
        title = line.strip()
        if not title:
            continue
        if "women's" in title.lower():
            continue  # men's only
        pr = parse_pair(title)
        if not pr:
            flags.append(f"named series (no teams in title): {title}")
            continue
        a, b = pr
        ha, hb = uni.get(norm(a)), uni.get(norm(b))
        if not ha or not hb:
            miss = [x for x, h in ((a, ha), (b, hb)) if not h]
            flags.append(f"unresolved {title}  ->  {miss}")
            continue
        canA, nickA = ha
        canB, nickB = hb
        key = (cfg["sport"], frozenset((norm(canA), norm(canB))))
        if key in seen:
            continue
        seen.add(key)
        row = [cfg["sport"], "Club" if args.league != "cbb" else "College", cfg["hint"],
               f"{nickA}–{nickB}", canA, canB, "United States", "", "", "", "", ""]
        ws.append(row)
        added.append((canA, canB))

    wb.save(XLSX)
    print(f"{args.league}: added {len(added)} rivalries to Rivalries.xlsx")
    for a, b in added:
        print(f"  + {a} v {b}")
    if flags:
        print("FLAGS (not added):")
        for fl in flags:
            print("  -", fl)


if __name__ == "__main__":
    main()
