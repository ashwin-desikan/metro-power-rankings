#!/usr/bin/env python3
"""
Extract rivalries for one of our covered leagues from a fetched Wikipedia
"List of <league> rivalries" page (action=raw rendered text), validating every
team against our own franchise file so only real, linkable franchises survive.
Emits a CSV of canonical rows ready to merge into Rivalries.xlsx.

Usage:
  python scripts/_rivalry_from_wiki.py --file <wiki.txt> --league mlb --out <csv>

league in {nfl,nba,nhl,mlb}. (CBB handled separately - different data shape.)
"""
import argparse
import csv
import json
import os
import re
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LEAGUE_CFG = {
    "nfl": {"sport": "American Football", "hint": "NFL"},
    "nba": {"sport": "Basketball", "hint": "NBA"},
    "nhl": {"sport": "Hockey", "hint": "NHL"},
    "mlb": {"sport": "Baseball", "hint": "MLB"},
}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def load_universe(league):
    """variant-norm -> (canonical, nickname) for a major league franchise file."""
    p = os.path.join(REPO, "public", "data", league, "franchises.json")
    d = json.load(open(p, encoding="utf-8"))
    rows = d if isinstance(d, list) else (d.get("franchises") or d.get("teams") or list(d.values())[0])
    uni = {}
    for r in rows:
        canonical = r.get("canonical") or r.get("display_name") or r.get("name")
        nick = r.get("name") or r.get("team") or canonical
        city = r.get("city") or ""
        team = r.get("team") or ""
        variants = {canonical, r.get("display_name"), r.get("name"), r.get("team")}
        if city and team:
            variants.add(f"{city} {team}")
        for v in variants:
            if v:
                uni.setdefault(norm(v), (canonical, nick))
    return uni


LINK = re.compile(r"\[([^\]]+)\]\((https?://en\.wikipedia\.org/wiki/[^)]+)\)")


def plain(line):
    # [[12]](cite) ref markers -> drop; [label](url) -> label
    line = re.sub(r"\[\[?\d+\]\]?\([^)]*\)", "", line)
    line = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", line)
    return re.sub(r"\s+", " ", line).strip()


# Only treat a paragraph as a rivalry definition if it reads like one: starts
# like a description and carries a rivalry keyword. This drops intro/list
# paragraphs that merely mention several teams. The name is derived from the two
# nicknames (e.g. "Yankees-Red Sox"), which is accurate and avoids mis-scraping
# prose; named series can be curated in the workbook later.
START = re.compile(r"^\s*(The|A|An|There|Dating|Since)\b", re.I)
KEY = re.compile(r"\b(rivalr|derby|series|classic|battle|war|cup|showdown|clasico)\b", re.I)


def extract(path, league):
    uni = load_universe(league)
    seen = set()
    rows = []
    skipped_multi = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for raw in f:
            txt = plain(raw)
            if not (START.match(txt) and KEY.search(txt)):
                continue
            franchises = []
            for label, _url in LINK.findall(raw):
                hit = uni.get(norm(label))
                if hit and hit not in franchises:
                    franchises.append(hit)
            if len(franchises) < 2:
                continue
            (canA, nickA), (canB, nickB) = franchises[0], franchises[1]
            key = frozenset((canA, canB))
            if key in seen:
                continue
            seen.add(key)
            rows.append([canA, canB, f"{nickA}–{nickB}"])
            if len(franchises) > 2:
                skipped_multi.append(f"{nickA}-{nickB}: line also named {[c for c,_ in franchises[2:]]}")
    return rows, skipped_multi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--league", required=True, choices=list(LEAGUE_CFG))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    cfg = LEAGUE_CFG[args.league]
    rows, flags = extract(args.file, args.league)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sport", "Scope", "LeagueHint", "Rivalry", "Team A", "Team B",
                    "Country", "Trophy", "Type", "Tier", "Blurb", "Wikipedia"])
        for canA, canB, name in rows:
            w.writerow([cfg["sport"], "Club", cfg["hint"], name, canA, canB, "United States", "", "", "", "", ""])
    print(f"{args.league}: {len(rows)} rivalries -> {args.out}")
    for r in rows:
        print(f"  {r[2]:28} {r[0]} v {r[1]}")
    if flags:
        print("FLAGS:")
        for fl in flags[:20]:
            print("  -", fl)


if __name__ == "__main__":
    main()
