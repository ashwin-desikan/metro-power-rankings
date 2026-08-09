#!/usr/bin/env python3
"""Per-metro skyscraper tier counts from SKYDB, for public/data/skyscrapers.json.

Replaces the hand-curated Skyscrapers sheet as the source of the 150m+/200m+/
300m+ counts. The sheet is not deleted - it becomes the regression test that
check-skyscrapers.mjs runs the API pull against.

WHAT THIS PUBLISHES, AND WHY THAT IS THE LINE. SKYDB's API notice states the
endpoint is not a licence to store, copy, redistribute, resell or re-publish.
So this emits COUNTS - derived aggregate statistics - and never a record. No
building names, no heights, no ids, no coordinates leave Supabase through this
file. The 350m+ list the site does show (detail.supertallStructures) stays on
the workbook's own Tower_Data sheet; SKYDB is used to audit that list for gaps,
not to supply it.

Attaching a metro is done by point-in-polygon in _to_delete/sky_pip.py, not
here, and not by name. SKYDB labels 84 Shenzhen buildings as Hong Kong; the
boundaries put them in Guangzhou, which is where they are.

Two filters, both deliberate:

  1. structural_kind = 'building'. The CN Tower and Tokyo Tower are in the
     dataset on purpose, but a "skyscrapers" count that includes them does not
     mean what the sheet means.
  2. Height-to-floors at or under MAX_M_PER_FLOOR where floors are known. The
     upstream data carries a six-storey Toronto building at 221.89 m. 56 rows
     fail this. They are corruption, not architecture.

Usage:
  python scripts/build-skyscrapers.py            write public/data/skyscrapers.json
  python scripts/build-skyscrapers.py --dry-run  print the summary, write nothing
"""
import json, os, sys, datetime, collections, urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "skyscrapers.json")
SUPA = "https://nmprqkmymrdknffwnuur.supabase.co"
TIERS = (150, 200, 300)
MAX_M_PER_FLOOR = 12
MIN_FLOORS_TO_JUDGE = 4
# A run that collapses must not overwrite a good file.
MIN_ROWS = 8000


def supa_key():
    p = os.path.join(ROOT, "scripts", "mktcap", "supabase_key.txt")
    if not os.path.exists(p):
        sys.exit(f"missing Supabase key at {p}")
    return open(p, encoding="utf-8").read().strip()


def fetch(key):
    h = {"apikey": key, "Authorization": "Bearer " + key}
    rows, off = [], 0
    while True:
        url = (f"{SUPA}/rest/v1/skydb_structures?select=skydb_id,metro_slug,"
               f"city_name,height_m,floors,structural_kind,metro_source"
               f"&order=skydb_id&limit=1000&offset={off}")
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=120) as r:
            chunk = json.load(r)
        if not chunk:
            return rows
        rows.extend(chunk)
        off += 1000


def is_plausible_building(r):
    if r.get("structural_kind") != "building":
        return False
    f, hm = r.get("floors"), r.get("height_m")
    if f and hm and f >= MIN_FLOORS_TO_JUDGE and hm / f > MAX_M_PER_FLOOR:
        return False
    return True


def main():
    dry = "--dry-run" in sys.argv
    rows = fetch(supa_key())
    print(f"skydb_structures rows: {len(rows):,}")
    if len(rows) < MIN_ROWS:
        sys.exit(f"REFUSING: only {len(rows):,} rows, expected at least {MIN_ROWS:,}. "
                 "A collapsed fetch must not overwrite a good file.")

    buildings = [r for r in rows if is_plausible_building(r)]
    dropped_kind = sum(1 for r in rows if r.get("structural_kind") != "building")
    dropped_ratio = len(rows) - len(buildings) - dropped_kind
    placed = [r for r in buildings if r.get("metro_slug")]
    print(f"  not a building        : {dropped_kind:,}")
    print(f"  implausible m/floor   : {dropped_ratio:,}")
    print(f"  buildings kept        : {len(buildings):,}")
    print(f"  with a metro          : {len(placed):,}")
    print(f"  no metro (left out)   : {len(buildings) - len(placed):,}")

    tiers = collections.defaultdict(lambda: [0, 0, 0])
    by_city = collections.defaultdict(collections.Counter)
    for r in placed:
        h = r.get("height_m") or 0
        slug = r["metro_slug"]
        t = tiers[slug]
        for i, cut in enumerate(TIERS):
            if h >= cut:
                t[i] += 1
        if h >= TIERS[0] and r.get("city_name"):
            by_city[slug][r["city_name"]] += 1

    metros = {}
    for slug, t in sorted(tiers.items()):
        if not t[0]:
            continue          # nothing at 150m+; do not emit an empty metro
        top = by_city[slug].most_common(1)
        metros[slug] = {
            # Same four keys the detail files already carry, so lib/data.ts and
            # every consumer stay untouched.
            "city": top[0][0] if top else "",
            "over150m": t[0],
            "over200m": t[1],
            "over300m": t[2],
        }

    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc)
                             .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "skydb.net API, completed structures, architectural height",
        "licence": ("Aggregate counts only. The SKYDB API notice states the "
                    "endpoint is not a licence to store, copy, redistribute, "
                    "resell or re-publish; no individual record is emitted here."),
        "method": ("point-in-polygon against public/data/metro-boundaries, with a "
                   "1 km coastline snap; no name matching"),
        "filters": {
            "structural_kind": "building",
            "max_m_per_floor": MAX_M_PER_FLOOR,
        },
        "totals": {
            "metros": len(metros),
            "over150m": sum(v["over150m"] for v in metros.values()),
            "over200m": sum(v["over200m"] for v in metros.values()),
            "over300m": sum(v["over300m"] for v in metros.values()),
            "buildingsWithoutMetro": len(buildings) - len(placed),
            # How the metro was decided, kept visible rather than averaged away.
            # 'polygon' is containment against the real boundary. 'city-consensus'
            # is a coordinate-less row placed because every other building SKYDB
            # labels with that city lands in one metro - a weaker claim, and it
            # stays labelled as one.
            "placedByPolygon": sum(1 for r in placed
                                   if (r.get("metro_source") or "polygon") == "polygon"),
            "placedByCityConsensus": sum(1 for r in placed
                                         if r.get("metro_source") == "city-consensus"),
        },
        "metros": metros,
    }

    print(f"\nmetros with a count: {payload['totals']['metros']:,}")
    print(f"  150m+ {payload['totals']['over150m']:,}   "
          f"200m+ {payload['totals']['over200m']:,}   "
          f"300m+ {payload['totals']['over300m']:,}")

    if dry:
        print("\n--dry-run; nothing written")
        return 0
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"\nwrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
