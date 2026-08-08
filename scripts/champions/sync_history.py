#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shared push/emit for the champions-history lineage.

Step 3 of making public.champions the source of truth. The workbook stops being
the thing the site reads and becomes an INPUT to the table:

    Champions_History.xlsx
        -> build-champions-history.py (parses, unchanged)
        -> sync_history.push()        (workbook wins for this lineage)
        -> public.champions
        -> sync_history.emit()        (byte-identical generator)
        -> public/data/champions-history.json

The workbook still wins for these rows, exactly like sync_city_lookup.py: every
run makes the table reflect the sheet. What changes is that the table is now the
thing everything else reads from, so honour rolls, football and metro pages can
all be served from one place.
"""

import io
import json
import os
import subprocess
import sys
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
URL = "https://nmprqkmymrdknffwnuur.supabase.co"
SOURCE = "champions-history.json"


def _key():
    return (ROOT / "scripts" / "mktcap" / "supabase_key.txt").read_text(
        encoding="utf-8").strip()


def _headers():
    k = _key()
    return {"apikey": k, "Authorization": f"Bearer {k}",
            "Content-Type": "application/json"}


def as_float(v):
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


def to_db_rows(rows):
    """The 19-field JSON contract -> champions columns, losslessly.

    Every mapping here is load-bearing and was arrived at by diffing:
      * tier_guide stays a FLOAT (0.01 exists and an int column truncated it)
      * canonical is never backfilled from champion (the source keeps "")
      * season_numeric records whether the source used a number or a string
      * source_ordinal preserves workbook row order
    """
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
            "canonical_name": r.get("canonical") or "",
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
    return out


def push(rows):
    """Make the table reflect the workbook for this lineage. Delete-then-insert
    rather than upsert, so a row REMOVED from the workbook also disappears here
    instead of lingering forever."""
    db = to_db_rows(rows)
    H = _headers()
    d = requests.delete(f"{URL}/rest/v1/champions",
                        headers={**H, "Prefer": "return=minimal"},
                        params={"source": f"eq.{SOURCE}"}, timeout=180)
    if d.status_code >= 300:
        raise SystemExit(f"champions delete failed: {d.status_code} {d.text[:300]}")
    for i in range(0, len(db), 500):
        r = requests.post(
            f"{URL}/rest/v1/champions"
            "?on_conflict=comp_slug,season,placement,team_name,era_name",
            headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=db[i:i + 500], timeout=180)
        if r.status_code >= 300:
            raise SystemExit(f"champions insert failed at {i}: "
                             f"{r.status_code} {r.text[:300]}")
    return len(db)


def emit():
    """Regenerate the JSON from the table."""
    gen = HERE / "build_champions.py"
    p = subprocess.run([sys.executable, str(gen)], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    sys.stdout.write(p.stdout or "")
    if p.returncode != 0:
        sys.stderr.write(p.stderr or "")
        raise SystemExit("champions generator failed")
