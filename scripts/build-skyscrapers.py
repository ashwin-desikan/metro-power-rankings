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
# Era stats are withheld below these. A median completion year computed from
# two buildings is not a fact about a skyline.
MIN_YEARS_FOR_ERA = 5
MIN_YEAR_COVERAGE = 0.6
# Anything outside this is a data-entry artefact, not a completion date. The
# set does contain a building dated 1310.
YEAR_MIN, YEAR_MAX = 1850, 2035


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
               f"city_name,height_m,floors,structural_kind,metro_source,year"
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
    years = collections.defaultdict(list)
    for r in placed:
        h = r.get("height_m") or 0
        slug = r["metro_slug"]
        t = tiers[slug]
        for i, cut in enumerate(TIERS):
            if h >= cut:
                t[i] += 1
        if h >= TIERS[0] and r.get("city_name"):
            by_city[slug][r["city_name"]] += 1
        y = r.get("year")
        if h >= TIERS[0] and isinstance(y, int) and YEAR_MIN <= y <= YEAR_MAX:
            years[slug].append(y)

    total_with_year = sum(len(v) for v in years.values())
    print(f"  with a usable year    : {total_with_year:,} "
          f"({100 * total_with_year / max(len(placed), 1):.0f}% of placed)")

    metros = {}
    for slug, t in sorted(tiers.items()):
        if not t[0]:
            continue          # nothing at 150m+; do not emit an empty metro
        top = by_city[slug].most_common(1)
        entry = {
            # Same four keys the detail files already carry, so lib/data.ts and
            # every consumer stay untouched.
            "city": top[0][0] if top else "",
            "over150m": t[0],
            "over200m": t[1],
            "over300m": t[2],
        }

        # WHEN the skyline happened, not just how big it is. 98% of buildings
        # carry a completion year, and the global distribution is lopsided
        # enough to be the more interesting number: 86% of everything over
        # 150 m was finished after 2000 and nearly three quarters after 2010.
        # A median year separates Chicago from Chengdu in a way no count does.
        #
        # Emitted only when the sample can support it. A "median year" drawn
        # from two buildings, or from a metro where most years are missing, is
        # a number that looks authoritative and means nothing - so it is
        # withheld rather than published with a caveat nobody reads.
        ys = sorted(years.get(slug, []))
        if len(ys) >= MIN_YEARS_FOR_ERA and len(ys) / t[0] >= MIN_YEAR_COVERAGE:
            mid = len(ys) // 2
            median = ys[mid] if len(ys) % 2 else (ys[mid - 1] + ys[mid]) // 2
            decades = collections.Counter((y // 10) * 10 for y in ys)
            entry.update({
                "medianYear": median,
                "earliest": ys[0],
                "pctSince2000": round(100 * sum(1 for y in ys if y >= 2000) / len(ys)),
                "pctSince2010": round(100 * sum(1 for y in ys if y >= 2010) / len(ys)),
                # Denominator, so nobody has to guess what the percentages are of.
                "datedCount": len(ys),
                "decades": {str(k): v for k, v in sorted(decades.items())},
            })
        metros[slug] = entry

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
    era = [v for v in metros.values() if "medianYear" in v]
    print(f"  metros with era stats: {len(era):,} of {len(metros):,}")
    if era:
        oldest = sorted(era, key=lambda v: v["medianYear"])[:5]
        newest = sorted(era, key=lambda v: -v["medianYear"])[:5]
        inv = {id(v): k for k, v in metros.items()}
        print("    oldest skylines by median year: "
              + ", ".join(f"{inv[id(v)]} {v['medianYear']}" for v in oldest))
        print("    newest skylines by median year: "
              + ", ".join(f"{inv[id(v)]} {v['medianYear']}" for v in newest))

    if dry:
        print("\n--dry-run; nothing written")
        return 0
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"\nwrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
