#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reload the champions-history lineage into public.champions with the FULL
19-field contract, in file order.

The first migration carried 14 of the 19 fields that champions-history.json
actually holds, dropping scope, tier, isCurrent, dateAwarded and nextAwardedDate.
Rather than patch 6,671 rows, this deletes that lineage and reloads it complete,
recording each row's position so the generator can reproduce file order.

Reads the JSON rather than the workbook deliberately: the JSON is the workbook's
own output, so round-tripping through it is the exact identity test we want, and
it does not require the workbook to be present.

    python reload_history.py            # dry run
    python reload_history.py --write
"""

import argparse
import io
import json
import sys
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / "public" / "data" / "champions-history.json"
URL = "https://nmprqkmymrdknffwnuur.supabase.co"
KEY = (ROOT / "scripts" / "mktcap" / "supabase_key.txt").read_text(encoding="utf-8").strip()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
SOURCE = "champions-history.json"


def as_float(v):
    """tierGuide is a float in the source and uses fractional values (0.01).
    Rounding it to an int destroys them, which the byte-identity audit caught."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def as_int(v):
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    rows = json.loads(io.open(SRC, encoding="utf-8").read())
    print(f"source rows: {len(rows):,}")

    out = []
    for i, r in enumerate(rows):
        slug = r.get("metroSlug") or None
        out.append({
            "sport": r.get("sport") or "Unknown",
            "competition": r["competition"],
            "comp_slug": r.get("compSlug"),
            "era_name": r.get("eraName") or "",
            "season": str(r.get("season") if r.get("season") not in (None, "")
                          else (r.get("year") or "")),
            "season_numeric": isinstance(r.get("season"), (int, float)),
            "year": as_int(r.get("year")),
            "team_name": r.get("champion") or r.get("canonical") or "",
            "canonical_name": r.get("canonical") or "",   # never fall back: the source keeps "" 
            "metro": r.get("metro") or None,
            "metro_slug": slug,
            "metro_status": "resolved" if slug else "unresolved",
            "match_date": (r.get("date") or None) or None,
            "scope": r.get("scope") or None,
            "scope_type": r.get("scopeType") or None,
            "tier": as_int(r.get("tier")),
            "tier_guide": as_float(r.get("tierGuide")),
            "is_current": bool(r.get("isCurrent")),
            "date_awarded": (r.get("dateAwarded") or None) or None,
            "next_awarded_date": (r.get("nextAwardedDate") or None) or None,
            "source_ordinal": i,
            "placement": "champion",
            "is_club": True,
            "source": SOURCE,
        })

    # Duplicate natural keys inside the file itself would make a faithful
    # round-trip impossible; check before writing anything.
    keys = {}
    for r in out:
        k = (r["comp_slug"], r["season"], r["placement"], r["team_name"], r["era_name"])
        keys.setdefault(k, []).append(r["source_ordinal"])
    dupes = {k: v for k, v in keys.items() if len(v) > 1}
    print(f"distinct natural keys: {len(keys):,}   colliding keys: {len(dupes)}")
    for k, v in list(dupes.items())[:8]:
        print("   ", k, "at ordinals", v)
    if dupes:
        print("\n!! Colliding keys cannot both survive the unique constraint.")
        print("   The generator will be short by", sum(len(v) - 1 for v in dupes.values()), "rows.")

    if not args.write:
        print("\nDRY RUN. --write to apply.")
        return

    d = requests.delete(f"{URL}/rest/v1/champions",
                        headers={**H, "Prefer": "return=minimal"},
                        params={"source": f"eq.{SOURCE}"}, timeout=180)
    print("delete:", d.status_code)
    if d.status_code >= 300:
        print(d.text[:300]); sys.exit(1)

    done = 0
    for i in range(0, len(out), 500):
        batch = out[i:i + 500]
        r = requests.post(
            f"{URL}/rest/v1/champions"
            "?on_conflict=comp_slug,season,placement,team_name,era_name",
            headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=batch, timeout=180)
        if r.status_code >= 300:
            print(f"FAILED at {i}: {r.status_code} {r.text[:400]}"); sys.exit(1)
        done += len(batch)
        print(f"  loaded {done:,}/{len(out):,}", end="\r")
    print(f"\nloaded {done:,}")


if __name__ == "__main__":
    main()
