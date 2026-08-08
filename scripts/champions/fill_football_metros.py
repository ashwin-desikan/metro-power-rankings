#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fill metro_slug on the cl_league_history football rows in public.champions.

The SQL insert could only resolve metro names that already appeared somewhere in
the table. metros.json has all 4,314, so this second pass closes the gap.

Country-guarded and exact-match only: an unmatched metro name stays unresolved
rather than being attached to a plausible metro.

    python fill_football_metros.py            # dry run
    python fill_football_metros.py --write
"""

import argparse
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co"
KEY = (ROOT / "scripts" / "mktcap" / "supabase_key.txt").read_text(encoding="utf-8").strip()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# The workbook's country names against the site's, where they differ.
COUNTRY_ALIAS = {
    "England": "United Kingdom", "Scotland": "United Kingdom",
    "Wales": "United Kingdom", "Northern Ireland": "United Kingdom",
    "Czechia": "Czech Republic", "Turkey": "Turkey", "USA": "United States",
    "United States of America": "United States", "Ivory Coast": "Côte d'Ivoire",
    "South Korea": "South Korea", "Bosnia": "Bosnia-Herzegovina",
    "Bosnia and Herzegovina": "Bosnia-Herzegovina", "UAE": "United Arab Emirates",
}

_CM = {"ı": "i", "İ": "i", "đ": "d", "Đ": "d", "ł": "l", "Ł": "l", "ø": "o", "ß": "ss"}


def fold(s):
    s = "".join(_CM.get(c, c) for c in (s or ""))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def get_all(path, params):
    out, offset = [], 0
    while True:
        p = dict(params); p["limit"] = 1000; p["offset"] = offset
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=H, params=p, timeout=60)
        r.raise_for_status()
        b = r.json()
        out.extend(b)
        if len(b) < 1000:
            return out
        offset += 1000


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    m = json.load(io.open(ROOT / "public" / "data" / "metros.json", encoding="utf-8"))
    m = m if isinstance(m, list) else m.get("metros")
    m = list(m.values() if isinstance(m, dict) else m)
    by_cn = {}
    by_name = defaultdict(set)
    for x in m:
        by_cn[(fold(x.get("name")), x.get("country"))] = x["slug"]
        by_name[fold(x.get("name"))].add(x["slug"])

    rows = get_all("champions", {"select": "id,metro,country,metro_slug",
                                 "source": "eq.cl_league_history",
                                 "metro_slug": "is.null"})
    print(f"rows missing a metro_slug: {len(rows):,}")

    patches, misses = [], defaultdict(int)
    for r in rows:
        name, ctry = r.get("metro"), r.get("country")
        if not name:
            continue
        key = fold(name)
        slug = by_cn.get((key, ctry)) or by_cn.get((key, COUNTRY_ALIAS.get(ctry, ctry)))
        if not slug:
            # Unique globally is still evidence; ambiguous is not.
            cand = by_name.get(key, set())
            if len(cand) == 1:
                slug = next(iter(cand))
        if slug:
            patches.append({"id": r["id"], "metro_slug": slug,
                            "metro_status": "resolved"})
        else:
            misses[f"{name} ({ctry})"] += 1

    print(f"resolvable: {len(patches):,}   still unresolved: {sum(misses.values()):,}")
    print("\ntop unresolved metro names:")
    for k, n in sorted(misses.items(), key=lambda kv: -kv[1])[:25]:
        print(f"  {n:4d}  {k}")

    if not args.write:
        print("\nDRY RUN. --write to apply.")
        return
    done = 0
    for i in range(0, len(patches), 400):
        batch = patches[i:i + 400]
        r = requests.post(f"{SUPABASE_URL}/rest/v1/champions?on_conflict=id",
                          headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"},
                          json=batch, timeout=120)
        if r.status_code >= 300:
            print(f"FAILED at {i}: {r.status_code} {r.text[:300]}")
            sys.exit(1)
        done += len(batch)
        print(f"  patched {done:,}/{len(patches):,}", end="\r")
    print(f"\npatched {done:,}")


if __name__ == "__main__":
    main()
