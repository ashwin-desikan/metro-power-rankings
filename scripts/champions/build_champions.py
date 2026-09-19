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
import datetime
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
OUT = ROOT / "public" / "data" / "champions-history.json"
EXTRA = ROOT / "public" / "data" / "champions-metro-extra.json"
CURRENT = ROOT / "public" / "data" / "champions-current.json"
GOLF_MONTHS = ROOT / "public" / "data" / "majors" / "golf-months.json"

# Ledger competition name -> the name golf.json uses. lib/majors.ts held this
# map and did the join itself, which meant /teams/golf paid a 2.6 MB
# readFileSync of the whole ledger to learn twelve integers a year. The map
# lives here now and the site reads the result.
GOLF_HISTORY_NAME = {
    "US Open Championship": "U.S. Open",
    "Masters Tournament": "Masters Tournament",
    "PGA Championship": "PGA Championship",
    "The Open Championship": "The Open Championship",
}
URL = "https://nmprqkmymrdknffwnuur.supabase.co"
def _key():
    """The service key, from the untracked file or from the environment.

    The file is the original source and stays first. The env fallback exists
    because the file is gitignored and simply is not present in the mini's
    clone, so a runner calling this script died on FileNotFoundError before
    reaching a single row. config.env already carries SUPABASE_SERVICE_KEY for
    every other job, so the fallback needs no new secret anywhere.
    """
    f = ROOT / "scripts" / "mktcap" / "supabase_key.txt"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    k = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_WRITE_KEY") or "").strip()
    if not k:
        raise SystemExit("no Supabase key: create scripts/mktcap/supabase_key.txt "
                         "or set SUPABASE_SERVICE_KEY")
    return k


KEY = _key()
# Only a JWT belongs in Authorization; an sb_secret_ key is an apikey and is
# rejected as a Bearer token.
H = {"apikey": KEY}
if KEY.count(".") == 2:
    H["Authorization"] = f"Bearer {KEY}"
SOURCE = "champions-history.json"

# Exact key order of the original writer. Do not sort.
FIELDS = ["sport", "competition", "compSlug", "eraName", "season", "year",
          "champion", "canonical", "metro", "metroSlug", "date", "scope",
          "scopeType", "tier", "tierGuide", "isCurrent", "dateAwarded",
          "nextAwardedDate"]

# Emitted only where true, so every row that does not need one stays byte-identical
# to what it was before this field existed. render() appends these after FIELDS.
OPTIONAL_FIELDS = ["nextAwardedEstimated"]


def plus_one_year(iso):
    """'2026-08-16' -> '2027-08-16'. 29 Feb steps back to the 28th."""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(iso or "").strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if mo == 2 and d == 29:
        d = 28
    try:
        return datetime.date(y + 1, mo, d).isoformat()
    except ValueError:
        return None

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
        # majors-ingest rows (scripts/champions/majors_to_champions.py, the
        # golf and tennis majors appended by the daily ingest, and the hand
        # insert of 2026-09-11 for the IBF heavyweight title) ride the same
        # base stream for the same reason.
        r = requests.get(f"{URL}/rest/v1/champions", headers=H, timeout=120,
                         params={"select": COLUMNS + ",source,id",
                                 # cricket-finalizer (scripts/ingest/cricket_finalize.py)
                                 # joins for the same reason footy-finalizer did: an
                                 # automatically promoted cricket champion must reach
                                 # /sports/champions and the Time Machine, not just sit
                                 # in the table. Added 2026-09-19.
                                 "source": f"in.(\"{SOURCE}\",\"footy-finalizer\",\"majors-ingest\",\"cricket-finalizer\")",
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
    #
    # 🔴 THE NEXT-TITLE DATE NOW HAS A PRODUCER. It used to be nothing but a
    # hand-typed workbook cell: the ZoneZero import of 2026 seeded 92 of them
    # and every current champion added afterwards shipped with a blank "Next
    # title" -- The Hundred and three heavyweight belts, and every future
    # AFL/NRL premier the finalizer appends. A rule is the right home for
    # "a year from now", so when a CURRENT champion carries no published date
    # we mint one from the date it was won and MARK IT ESTIMATED. A guess that
    # says it is a guess is honest; a blank cell is just missing.
    #
    # Only current rows get one. A retired row's next title already happened.
    is_current = bool(r["is_current"])
    awarded = r["date_awarded"] or None
    nxt = r["next_awarded_date"] or None
    estimated = False
    if nxt is None and is_current:
        nxt = plus_one_year(awarded)
        estimated = nxt is not None
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
        "isCurrent":       is_current,
        "dateAwarded":     awarded,
        "nextAwardedDate": nxt,
        "nextAwardedEstimated": estimated,
    }


def render(rows):
    out = []
    for row in rows:
        d = {k: row[k] for k in FIELDS}
        # Falsy optional fields are dropped, which is what keeps every row that
        # carries a published date byte-identical to the pre-rule output.
        for k in OPTIONAL_FIELDS:
            if row.get(k):
                d[k] = row[k]
        out.append(d)
    return json.dumps(out, ensure_ascii=False, separators=(",", ":"))


def build_current(rows, check=False):
    """Step 5: the reigning holders on their own, so the board can read them live.

    lib/champions.ts already throws away everything except the isCurrent rows of
    this 2.6 MB ledger, and /sports/champions is the one surface that has to
    show a new champion the day it is won. Emitting those rows as their own
    small file lets lib/championsCurrent.ts fetch them from GitHub raw on an
    hourly ISR interval, which in turn lets majors-ingest.yml and
    footy-refresh.yml commit a champion with [vercel skip] instead of spending a
    paid production build. The US Open champions cost one on 2026-09-14
    (6871c2a9d): three changed lines, a full Turbo build.

    Same row shape and the same renderer as champions-history.json, so the
    reader parses one format rather than two, and a field added to FIELDS
    reaches both files at once.
    """
    cur = [r for r in rows if r.get("isCurrent")]
    text = render(cur)
    old = io.open(CURRENT, encoding="utf-8").read() if CURRENT.exists() else ""
    same = text == old
    print(f"champions-current.json: {len(cur):,} reigning holders "
          f"({'unchanged' if same else 'CHANGED'})")

    # Shrink guard, for the same reason the ledger has one: a competition does
    # not stop having a reigning holder, so a net loss is a bad read upstream,
    # not news. Without this a partial Supabase page would silently empty the
    # board, and because the board is now read at RUNTIME it would do so
    # without a deploy to notice.
    if old:
        before = len(json.loads(old))
        if len(cur) < before:
            print(f"ERROR: would drop {before - len(cur):,} reigning holders "
                  f"({before:,} -> {len(cur):,}). Refusing to write. "
                  f"Check the table before re-running.")
            sys.exit(5)

    if not check and not same:
        io.open(CURRENT, "w", encoding="utf-8", newline="").write(text)
        print(f"wrote {CURRENT}")
    return len(cur)


def build_golf_months(rows, check=False):
    """Step 6: the real month each golf major was played.

    /teams/golf orders each season's four majors by the calendar rather than by
    name (the PGA closed the year through 2018, then moved to May), and the only
    place carrying a date for them is this ledger. lib/majors.ts used to join the
    two itself, which cost that page a readFileSync of all 2.6 MB to end up with
    about a dozen integers per season, and left it depending on a build-time file
    read that the Vercel tracer does not reliably trace for that route.

    Emitting the join here makes it a 20 KB static import instead, which is the
    shape scripts/DATA-READS-RECIPE.md prescribes for a small fixed file after
    lib/international.ts silently shipped an empty hub on 2026-09-15.

    Key: "<year>|<golf.json tournament name>", value: month 1-12.
    """
    months = {}
    for r in rows:
        g = GOLF_HISTORY_NAME.get(r.get("competition") or "")
        if not g or not r.get("year") or not r.get("date"):
            continue
        m = str(r["date"])[5:7]
        if m.isdigit() and 1 <= int(m) <= 12:
            months[f"{r['year']}|{g}"] = int(m)

    # Sorted, so a rerun with unchanged data produces an unchanged file rather
    # than a reordered one and a commit that means nothing.
    text = json.dumps(dict(sorted(months.items())), ensure_ascii=False,
                      separators=(",", ":"))
    old = io.open(GOLF_MONTHS, encoding="utf-8").read() if GOLF_MONTHS.exists() else ""
    same = text == old
    print(f"golf-months.json: {len(months):,} dated majors "
          f"({'unchanged' if same else 'CHANGED'})")
    if not check and not same:
        io.open(GOLF_MONTHS, "w", encoding="utf-8", newline="").write(text)
        print(f"wrote {GOLF_MONTHS}")
    return len(months)


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
                                 "source": f"not.in.(\"{SOURCE}\",\"footy-finalizer\",\"majors-ingest\")",
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

    rows = [to_row(r) for r in db]
    text = render(rows)
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
        build_current(rows, check=True)
        build_golf_months(rows, check=True)
        build_extra(check=True)
        return

    # 🔴 SHRINK GUARD. This runs nightly from a Supabase table and commits the
    # result, so a partial read or a bad delete upstream would quietly publish a
    # smaller ledger and nobody would notice for months. That is exactly how the
    # conflicts dataset lost five centuries of war between 2026-05 and 2026-09.
    # The ledger only ever grows, so ANY net row loss is a stop.
    if old:
        before, after = len(json.loads(old)), len(json.loads(text))
        if after < before:
            print(f"ERROR: would drop {before - after:,} rows "
                  f"({before:,} -> {after:,}). Refusing to write. "
                  f"Check the table before re-running.")
            sys.exit(4)

    io.open(OUT, "w", encoding="utf-8", newline="").write(text)
    print(f"wrote {OUT}")
    build_current(rows)
    build_golf_months(rows)
    build_extra()


if __name__ == "__main__":
    main()
