#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate public/data/champions-history.json from public.champions.

This is step 2 of making the table the source of truth: prove the table can
reproduce the file the site already reads, BYTE FOR BYTE, before anything is
rewired. A diff here is not a nuisance, it is the audit telling you something
was lost in the migration.

Determinism requirements, all load-bearing because public/ is a Vercel build
path and a spurious diff costs one of two daily production builds:

  * key order   - the file is written with plain json.dump, so keys appear in
                  insertion order. FIELDS below fixes that order.
  * row order   - the file follows the workbook's row order, which is not
                  derivable from the data. source_ordinal preserves it.
  * separators  - (",", ":") compact, no spaces, matching the original.
  * ensure_ascii=False, no trailing newline, UTF-8.
  * numbers     - tierGuide is a float in the original (1.0, not 1), tier and
                  year are ints. Emitting 1 where the file says 1.0 is a diff.

    python build_champions.py --check      # compare only, write nothing
    python build_champions.py              # write the file
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
OUT = ROOT / "public" / "data" / "champions-history.json"
EXTRA = ROOT / "public" / "data" / "champions-metro-extra.json"
URL = "https://nmprqkmymrdknffwnuur.supabase.co"
KEY = (ROOT / "scripts" / "mktcap" / "supabase_key.txt").read_text(encoding="utf-8").strip()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
SOURCE = "champions-history.json"

# Exact key order of the original writer. Do not sort.
FIELDS = ["sport", "competition", "compSlug", "eraName", "season", "year",
          "champion", "canonical", "metro", "metroSlug", "date", "scope",
          "scopeType", "tier", "tierGuide", "isCurrent", "dateAwarded",
          "nextAwardedDate"]

COLUMNS = ("sport,competition,comp_slug,era_name,season,year,team_name,"
           "canonical_name,metro,metro_slug,match_date,scope,scope_type,tier,"
           "tier_guide,is_current,date_awarded,next_awarded_date,source_ordinal,"
           "season_numeric")


def as_num(s):
    """Reproduce a season the source carried as a JSON number."""
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return s


def fetch():
    rows, offset = [], 0
    while True:
        # footy-finalizer rows (scripts/ingest/footy_finalize.py) are part of
        # the BASE stream on purpose: an automated AFL/NRL premier must reach
        # /sports/champions and the Time Machine, not just metro pages. They
        # borrow the previous season's source_ordinal, so id.asc is the
        # tie-break that keeps the file deterministic (new row lands right
        # after the season it succeeds). push() only deletes source=SOURCE,
        # so these rows survive workbook re-pushes; when the workbook later
        # carries the same season, dedupe() below keeps one.
        r = requests.get(f"{URL}/rest/v1/champions", headers=H, timeout=120,
                         params={"select": COLUMNS + ",source,id",
                                 "source": f"in.(\"{SOURCE}\",\"footy-finalizer\")",
                                 "order": "source_ordinal.asc,id.asc",
                                 "limit": 1000, "offset": offset})
        r.raise_for_status()
        b = r.json()
        rows.extend(b)
        if len(b) < 1000:
            break
        offset += 1000
    # When the workbook catches up and carries a season the finalizer already
    # wrote, the workbook row wins and the finalizer's duplicate is dropped
    # (same contract as push()'s on_conflict key, minus era_name so a label
    # difference cannot double-list a premier).
    wb_keys = {(r["comp_slug"], str(r["season"]), r["team_name"])
               for r in rows if r.get("source") == SOURCE}
    out = [r for r in rows
           if r.get("source") == SOURCE
           or (r["comp_slug"], str(r["season"]), r["team_name"]) not in wb_keys]
    if len(out) != len(rows):
        print(f"base stream: dropped {len(rows) - len(out)} finalizer row(s) "
              f"now covered by the workbook")
    return out


def to_row(r):
    # The original emits "" for absent strings (the workbook's cell() returns
    # ""), and None only where the writer explicitly falls back to None.
    return {
        "sport":           r["sport"] or "",
        "competition":     r["competition"] or "",
        "compSlug":        r["comp_slug"] or "",
        "eraName":         r["era_name"] or "",
        "season":          (as_num(r["season"]) if r.get("season_numeric")
                            else (r["season"] or "")),
        "year":            r["year"],
        "champion":        r["team_name"] or "",
        "canonical":       r["canonical_name"] or "",
        "metro":           r["metro"] or "",
        "metroSlug":       r["metro_slug"] or "",
        "date":            r["match_date"] or "",
        "scope":           r["scope"],
        "scopeType":       r["scope_type"] or "",
        "tier":            r["tier"],
        # float in the original, so 1 must serialise as 1.0
        "tierGuide":       float(r["tier_guide"]) if r["tier_guide"] is not None else None,
        "isCurrent":       bool(r["is_current"]),
        "dateAwarded":     r["date_awarded"] or None,
        "nextAwardedDate": r["next_awarded_date"] or None,
    }


def render(rows):
    return json.dumps([{k: row[k] for k in FIELDS} for row in rows],
                      ensure_ascii=False, separators=(",", ":"))


def build_extra(check=False):
    """Step 4: the club titles the metro pages could not previously show.

    champions-history.json holds 4,332 rows with a metro. The table holds far
    more, because the honour rolls, club rugby, domestic T20 and the football
    workbook were never part of that file. This emits the DIFFERENCE, in the
    same ChampHistoryRow shape, for metro pages only.

    Deliberately excluded, and each exclusion matters:
      * entity_type <> 'club'   - a metro did not win the World Cup
      * placement  <> champion  - runners-up belong on the honour-roll pages
      * metro_slug is null      - nothing to attach it to
      * source = champions-history.json - already in the main file
    """
    rows, offset = [], 0
    while True:
        r = requests.get(f"{URL}/rest/v1/champions", headers=H, timeout=120,
                         params={"select": COLUMNS + ",season_numeric,id",
                                 "entity_type": "eq.club",
                                 "placement": "eq.champion",
                                 "metro_slug": "not.is.null",
                                 # footy-finalizer rows ride the BASE stream
                                 # (see fetch()); listing them here too would
                                 # double-count the premier on metro pages.
                                 "source": f"not.in.(\"{SOURCE}\",\"footy-finalizer\")",
                                 # id.asc makes the order TOTAL. Without it the
                                 # sort has ties, and limit/offset paging over a
                                 # non-deterministic order can skip or repeat
                                 # rows between pages.
                                 "order": "year.desc,competition.asc,team_name.asc,id.asc",
                                 "limit": 1000, "offset": offset})
        r.raise_for_status()
        b = r.json()
        rows.extend(b)
        if len(b) < 1000:
            break
        offset += 1000

    # ---- de-duplicate against the base file, and within itself ------------
    # Several competitions are carried under two comp_slugs by two upstreams
    # (KHL vs "KHL — Gagarin Cup", IPL vs IPL, Top 14 vs Top 14, MLS twice).
    # A metro page must not list the same title twice.
    #
    # The key is the ALIAS GROUP, not the club and year: Real Madrid winning
    # La Liga and the Champions League in one year is two real titles, and a
    # club/year key would wrongly collapse it. Alias groups come from
    # champion_competitions.alias_of, so this is data-driven rather than a
    # heuristic and a new duplicate is fixed by one row in the registry.
    ar = requests.get(f"{URL}/rest/v1/champion_competitions", headers=H, timeout=60,
                      params={"select": "comp_slug,alias_of", "limit": 2000})
    ar.raise_for_status()
    canon = {}
    for a in ar.json():
        canon[a["comp_slug"]] = a.get("alias_of") or a["comp_slug"]

    def group(slug):
        seen, cur = set(), slug
        while canon.get(cur, cur) != cur and cur not in seen:
            seen.add(cur)
            cur = canon[cur]
        return cur

    def key(comp_slug, year, club):
        return (group(comp_slug or ""), year, (club or "").strip().lower())

    base_rows = json.loads(io.open(OUT, encoding="utf-8").read()) if OUT.exists() else []
    base_keys = {key(r.get("compSlug"), r.get("year"),
                     r.get("canonical") or r.get("champion")) for r in base_rows}

    # Sort BEFORE de-duplicating. "First one wins" is only meaningful if the
    # order is fixed; otherwise which of two duplicate rows survives -- and
    # therefore which metro, era and season the page shows -- depends on what
    # Postgres happened to return, and the file churns on every rerun.
    def order_key(x):
        return (-(x["year"] or 0), x["competition"] or "", x["team_name"] or "",
                x["season"] or "", x["comp_slug"] or "", x["era_name"] or "",
                x["metro_slug"] or "", x["id"])

    rows.sort(key=order_key)

    kept, dropped_base, dropped_self, seen_keys = [], 0, 0, set()
    for r in rows:
        k = key(r["comp_slug"], r["year"], r["canonical_name"] or r["team_name"])
        if k in base_keys:
            dropped_base += 1
            continue
        if k in seen_keys:
            dropped_self += 1
            continue
        seen_keys.add(k)
        kept.append(r)
    print(f"  de-duplicated: {dropped_base:,} already in champions-history, "
          f"{dropped_self:,} repeated within the extras")
    rows = kept

    # Already ordered by order_key above, which is TOTAL, so a rerun with
    # unchanged data produces an unchanged file and no spurious Vercel build.
    text = json.dumps([{k: v for k, v in to_row(r).items() if k in FIELDS}
                       for r in rows], ensure_ascii=False, separators=(",", ":"))
    old = io.open(EXTRA, encoding="utf-8").read() if EXTRA.exists() else ""
    same = text == old
    metros = len({r["metro_slug"] for r in rows})
    print(f"champions-metro-extra.json: {len(rows):,} club titles across "
          f"{metros} metros ({'unchanged' if same else 'CHANGED'})")
    if not check and not same:
        io.open(EXTRA, "w", encoding="utf-8", newline="").write(text)
        print(f"wrote {EXTRA}")
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    db = fetch()
    print(f"rows from the table: {len(db):,}")
    missing = [r for r in db if r.get("source_ordinal") is None]
    if missing:
        print(f"!! {len(missing)} rows have no source_ordinal; order is not reproducible")

    text = render([to_row(r) for r in db])
    old = io.open(OUT, encoding="utf-8").read() if OUT.exists() else ""

    if text == old:
        print(f"BYTE-IDENTICAL to {OUT.name} ({len(text):,} bytes)")
    else:
        print(f"DIFFERS. generated {len(text):,} bytes vs existing {len(old):,}")
        a, b = json.loads(old) if old else [], json.loads(text)
        print(f"  rows: existing {len(a):,}  generated {len(b):,}")
        shown = 0
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                diff = {k: (x.get(k), y.get(k)) for k in set(x) | set(y)
                        if x.get(k) != y.get(k)}
                print(f"  row {i} {x.get('competition')} {x.get('season')}: {diff}")
                shown += 1
                if shown >= 12:
                    print("  ...")
                    break
        if shown == 0 and len(a) == len(b):
            print("  same objects, different serialisation (key order or number format)")

    if args.check:
        build_extra(check=True)
        return
    io.open(OUT, "w", encoding="utf-8", newline="").write(text)
    print(f"wrote {OUT}")
    build_extra()


if __name__ == "__main__":
    main()
