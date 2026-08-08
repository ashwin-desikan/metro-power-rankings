#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Load every champion the site tracks into public.champions in Supabase.

Sources, in order of size:
  1. public/data/champions-history.json      (the 108 workbook competitions)
  2. public/data/honours/*.json              (the honour-roll leagues)
  3. public/data/rugby-union/clubs.json      (club rugby union)

The table is the source of truth from here on; build scripts regenerate the
JSON from it. This loader is idempotent: it upserts on
(comp_slug, season, placement, team_name), so re-running is safe and a
re-scrape only changes what actually changed.

DRY RUN by default, --write to apply, matching the house convention in
scripts/mktcap/refresh.py.

Usage:
    python load_champions.py            # dry run, prints the plan
    python load_champions.py --write
"""

import argparse
import io
import json
import os
import re
import sys
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DATA = ROOT / "public" / "data"
SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co"
KEY_FILE = ROOT / "scripts" / "mktcap" / "supabase_key.txt"
TABLE = "champions"
CHUNK = 500

# Portal -> (sport, the JSON file). Every roll inside a portal becomes its own
# competition, named from the portal's own labels map.
PORTALS = {
    "basketball-domestic": ("Basketball", "basketball"),
    "cricket-county":      ("Cricket", "cricket"),
    "rugby-league":        ("Rugby League", "rugby-league"),
    "volleyball-domestic": ("Volleyball", "volleyball"),
    "handball-domestic":   ("Handball", "handball"),
    "hockey-domestic":     ("Ice Hockey", "hockey"),
    # Same roll shape, different home: scripts/cricket/build_t20_leagues.py.
    "cricket-t20":         ("Cricket", "cricket-t20"),
}

# The basketball section labels carry the country before an em dash.
COUNTRY_FROM_LABEL = re.compile(r"^([^—]+)—")


def as_int(v):
    """champions-history.json carries year/tierGuide as floats ("1.0"), which
    Postgres rejects for an integer column."""
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def load(p):
    return json.load(io.open(p, encoding="utf-8"))


def split_names(v):
    """Shared titles. Basketball prints "A & B"; county cricket prints "A, B".
    Either way it is two champions, so it becomes two rows."""
    if not v:
        return []
    return [x.strip() for x in re.split(r"\s*&\s*|,\s*", str(v)) if x.strip()]


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--only", help="load just one source: history|honours|rugby")
    args = ap.parse_args()

    metros = load(DATA / "metros.json")
    metros = metros if isinstance(metros, list) else metros.get("metros")
    metros = list(metros.values() if isinstance(metros, dict) else metros)
    country_by_slug = {m["slug"]: m.get("country") for m in metros}

    # Basketball resolution, then the other portals' resolution. Both are
    # produced by the three-tier resolver; neither contains a guess.
    club_metros = {}
    for rel in ("club_metros.json", "auto_cities.json"):
        f = ROOT / "_to_delete" / rel
        if f.exists():
            for k, v in load(f).items():
                cur = club_metros.setdefault(k, {})
                for kk, vv in v.items():
                    if vv is not None and cur.get(kk) is None:
                        cur[kk] = vv

    rows = []

    # ---- 1. champions-history.json ---------------------------------------
    if args.only in (None, "history"):
        src = DATA / "champions-history.json"
        for r in load(src):
            slug = r.get("metroSlug") or None
            rows.append({
                "sport": r.get("sport") or "Unknown",
                "competition": r["competition"],
                "comp_slug": r.get("compSlug") or slugify(r["competition"]),
                "era_name": r.get("eraName") or "",
                "country": country_by_slug.get(slug),
                "season": str(r.get("season") or r.get("year") or ""),
                "year": as_int(r.get("year")),
                "match_date": (r.get("date") or None) or None,
                "placement": "champion",
                "team_name": r.get("champion") or r.get("canonical") or "",
                "canonical_name": r.get("canonical") or r.get("champion") or None,
                "city": None,
                "metro": r.get("metro") or None,
                "metro_slug": slug,
                "metro_status": "resolved" if slug else "unresolved",
                "is_club": True,
                "scope_type": r.get("scopeType") or None,
                "tier_guide": as_int(r.get("tierGuide")),
                "source": "champions-history.json",
            })

    # ---- 2. honour rolls --------------------------------------------------
    if args.only in (None, "honours"):
        for portal, (sport, prefix) in PORTALS.items():
            p = (DATA / "cricket" / "t20-leagues.json") if portal == "cricket-t20" \
                else (DATA / "honours" / f"{portal}.json")
            if not p.exists():
                continue
            d = load(p)
            for key, roll in d["rolls"].items():
                label = d["labels"].get(key, key)
                m = COUNTRY_FROM_LABEL.match(label)
                country = m.group(1).strip() if m else None
                comp_slug = f"{prefix}-{key}"
                for r in roll:
                    for placement, who in (("champion", r["winner"]),
                                           ("runner_up", r.get("ru"))):
                        if not who:
                            continue
                        # A shared title is two rows, one per co-champion.
                        for name in split_names(who):
                            info = club_metros.get(name, {})
                            slug = info.get("metro_slug")
                            rows.append({
                                "sport": sport,
                                "competition": label,
                                "comp_slug": comp_slug,
                                "era_name": r.get("era") or "",
                                "country": info.get("country") or country,
                                "season": r["season"],
                                "year": as_int(year_of(r["season"])),
                                "match_date": None,
                                "placement": placement,
                                "team_name": name,
                                "canonical_name": name,
                                "city": info.get("city"),
                                "metro": info.get("metro"),
                                "metro_slug": slug,
                                "metro_status": ("resolved" if slug else
                                                 ("not_a_club"
                                                  if info.get("is_club") is False
                                                  else "unresolved")),
                                "is_club": info.get("is_club", True),
                                "scope_type": "club",
                                "tier_guide": None,
                                "source": f"honours/{portal}.json",
                            })

    # ---- 3. club rugby union ---------------------------------------------
    if args.only in (None, "rugby"):
        p = DATA / "rugby-union" / "clubs.json"
        if p.exists():
            rows.extend(rugby_rows(load(p)))

    # ---- report + write ---------------------------------------------------
    by_source = {}
    for r in rows:
        by_source[r["source"]] = by_source.get(r["source"], 0) + 1
    print(f"rows built: {len(rows):,}")
    for s in sorted(by_source):
        print(f"  {s:34s} {by_source[s]:6,d}")
    res = sum(1 for r in rows if r["metro_status"] == "resolved")
    print(f"\nwith a metro: {res:,} ({100*res/max(len(rows),1):.1f}%)")

    # Drop exact duplicates on the upsert key: the same club can appear twice in
    # a season only as a shared title, which team_name already separates.
    seen, deduped = set(), []
    for r in rows:
        k = (r["comp_slug"], r["season"], r["placement"], r["team_name"], r["era_name"])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(r)
    if len(deduped) != len(rows):
        print(f"dropped {len(rows)-len(deduped):,} duplicate keys")
    rows = deduped

    if not args.write:
        print("\nDRY RUN. Pass --write to apply.")
        return

    key = KEY_FILE.read_text(encoding="utf-8").strip()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    url = (f"{SUPABASE_URL}/rest/v1/{TABLE}"
           f"?on_conflict=comp_slug,season,placement,team_name,era_name")
    done = 0
    for i in range(0, len(rows), CHUNK):
        batch = rows[i:i + CHUNK]
        resp = requests.post(url, headers=headers, json=batch, timeout=120)
        if resp.status_code >= 300:
            print(f"\nFAILED at row {i}: {resp.status_code} {resp.text[:400]}")
            sys.exit(1)
        done += len(batch)
        print(f"  upserted {done:,}/{len(rows):,}", end="\r")
    print(f"\nupserted {done:,} rows")


def year_of(season):
    """'2025-26' -> 2026, '1957' -> 1957. The ending year, as ChampionsHistory
    uses, so the two sets sort together."""
    s = (season or "").replace("–", "-")
    m = re.match(r"^(\d{4})(?:-(\d{2,4}))?$", s)
    if not m:
        return None
    if not m.group(2):
        return int(m.group(1))
    tail = m.group(2)
    return int(tail) if len(tail) == 4 else int(m.group(1)[:2] + tail) \
        if int(tail) >= int(m.group(1)[2:]) else int(m.group(1)) + 1


def rugby_rows(d):
    """Club rugby union. The file is club-centric - a list of clubs, each with
    honours[{comp, titles, years[]}] - and already carries a resolved metro, so
    exploding years into season rows gets both the results and the metros.
    No runners-up are recorded in this source."""
    out = []
    if not isinstance(d, list):
        print("  rugby: unexpected shape, skipped")
        return out
    for club in d:
        name = club.get("name")
        slug = club.get("metro_slug") or None
        for h in club.get("honours") or []:
            comp = h.get("comp") or club.get("league") or "Rugby Union"
            for yr in h.get("years") or []:
                season = str(yr)
                out.append({
                    "sport": "Rugby Union",
                    "competition": comp,
                    "comp_slug": f"rugby-union-{slugify(comp)}",
                    "era_name": "",
                    "country": None,
                    "season": season,
                    "year": as_int(year_of(season)),
                    "match_date": None,
                    "placement": "champion",
                    "team_name": name,
                    "canonical_name": name,
                    "city": None,
                    "metro": club.get("metro"),
                    "metro_slug": slug,
                    "metro_status": "resolved" if slug else "unresolved",
                    "is_club": True,
                    "scope_type": "club",
                    "tier_guide": None,
                    "source": "rugby-union/clubs.json",
                })
    return out


if __name__ == "__main__":
    main()
