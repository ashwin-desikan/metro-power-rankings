#!/usr/bin/env python3
"""Attach metro_slug to skydb_structures by point-in-polygon.

Step 2 of the monthly SKYDB pipeline:

    fetch_structures.py  ->  attach_metros.py  ->  ../build-skyscrapers.py

WHY CONTAINMENT AND NOT THE CITY NAME SKYDB ALREADY GIVES US. Because the city
name is wrong often enough to matter and wrong in a way that looks right.
SKYDB labels 84 buildings as Hong Kong that sit at latitude 22.53 in Futian and
Luohu - Excellence Century Plaza, Shenzhen Energy Headquarters, China Resources
Hubei, Vanke One City. Hong Kong Island is at 22.28. A name join files all 84
under Hong Kong and the total still looks plausible. The polygon puts them in
Guangzhou, which is where they physically are. This is the sixth time in this
project that a name has turned out not to be an identifier.

AMBIGUITY. Boundaries overlap in a few conurbations. Where a point is inside
more than one, the smallest-area containing metro wins as the more specific
claim, and the count is reported rather than hidden. Today that is 2 rows.

THE COASTLINE SNAP IS MEASURED, NOT ASSUMED. The first pass left 168 structures
outside every boundary. Measuring each against its nearest boundary split them
cleanly: 108 under 1 km, then a gap, then the next case at 1.2 km. The near band
is all waterfront on reclaimed or quayside land just outside a generalised
coastline - Lakhta Center, One Barangaroo, the Miami Biscayne Bay strip, Doha
West Bay, Haeundae. The far band is other cities entirely: Sejong 6 km from
Daejeon, Taizhou 25-29 km from Wenzhou. So the threshold sits in an empty gap
rather than cutting through a cluster. Distances are geodesic, not degrees,
because a degree of longitude is not a degree of latitude anywhere but the
equator.

Anything beyond the snap stays NULL. There is no nearest-metro fallback: a
structure in a town we have no metro for is correctly unplaced, and inventing a
home for it would be indistinguishable from a real assignment downstream.

Usage:
  python scripts/skydb/attach_metros.py            report only, write nothing
  python scripts/skydb/attach_metros.py --write    persist metro_slug
"""
import json, os, sys, glob, time, urllib.request, collections

sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

from shapely.geometry import shape, Point
from shapely.strtree import STRtree
from shapely.prepared import prep
from shapely.ops import nearest_points
from pyproj import Geod

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BDIR = os.path.join(ROOT, "public", "data", "metro-boundaries")
SUPA = "https://nmprqkmymrdknffwnuur.supabase.co"
GEOD = Geod(ellps="WGS84")
SNAP_KM = 1.0
PAGE = 1000
BATCH = 200
# A run that suddenly places far fewer rows than last time is a regression, not
# a fact about the world. Refuse rather than blank out good assignments.
MIN_PLACED_RATIO = 0.9


def supa_key():
    p = os.path.join(ROOT, "scripts", "mktcap", "supabase_key.txt")
    if not os.path.exists(p):
        sys.exit(f"missing Supabase key at {p}")
    return open(p, encoding="utf-8").read().strip()


KEY = supa_key()
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}


def get(path):
    req = urllib.request.Request(f"{SUPA}/rest/v1/{path}", headers=H)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def patch(path, body):
    req = urllib.request.Request(
        f"{SUPA}/rest/v1/{path}", data=json.dumps(body).encode("utf-8"),
        headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="PATCH")
    with urllib.request.urlopen(req, timeout=120) as r:
        r.read()


def load_boundaries():
    geoms, slugs = [], []
    for f in sorted(glob.glob(os.path.join(BDIR, "*.geojson"))):
        try:
            gj = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print(f"  unreadable {os.path.basename(f)}: {e}")
            continue
        for feat in gj.get("features", []):
            g = feat.get("geometry")
            if not g:
                continue
            try:
                sh = shape(g)
            except Exception as e:
                print(f"  bad geometry in {os.path.basename(f)}: {e}")
                continue
            if not sh.is_valid:
                sh = sh.buffer(0)
            if sh.is_empty:
                continue
            geoms.append(sh)
            slugs.append((feat.get("properties") or {}).get("slug")
                         or os.path.basename(f)[:-len(".geojson")])
    return geoms, slugs


def fetch_rows():
    rows, off = [], 0
    while True:
        chunk = get("skydb_structures?select=skydb_id,name,city_name,country_name,"
                    f"lat,lon,height_m,metro_slug&order=skydb_id&limit={PAGE}&offset={off}")
        if not chunk:
            return rows
        rows.extend(chunk)
        off += PAGE


def main():
    write = "--write" in sys.argv

    t0 = time.time()
    geoms, slugs = load_boundaries()
    if len(geoms) < 1000:
        sys.exit(f"only {len(geoms)} boundaries loaded; refusing to run against a "
                 "partial boundary set")
    areas = [g.area for g in geoms]
    prepared = [prep(g) for g in geoms]
    tree = STRtree(geoms)
    print(f"boundaries: {len(geoms):,} in {time.time()-t0:.1f}s")

    rows = fetch_rows()
    print(f"structures: {len(rows):,}")
    already = sum(1 for r in rows if r.get("metro_slug"))
    no_coord = [r for r in rows if r["lat"] is None or r["lon"] is None]
    print(f"  currently placed : {already:,}")
    print(f"  no coordinates   : {len(no_coord):,}")

    matched, ambiguous, outside = {}, [], []
    for r in rows:
        if r["lat"] is None or r["lon"] is None:
            continue
        pt = Point(r["lon"], r["lat"])
        hits = [i for i in tree.query(pt) if prepared[i].contains(pt)]
        if not hits:
            outside.append(r)
            continue
        if len(hits) > 1:
            ambiguous.append((r, [slugs[i] for i in hits]))
            hits.sort(key=lambda i: areas[i])
        matched[r["skydb_id"]] = slugs[hits[0]]

    snapped, still_out = [], []
    for r in outside:
        pt = Point(r["lon"], r["lat"])
        i = tree.nearest(pt)
        a, b = nearest_points(pt, geoms[i])
        km = GEOD.inv(a.x, a.y, b.x, b.y)[2] / 1000.0
        if km <= SNAP_KM:
            matched[r["skydb_id"]] = slugs[i]
            snapped.append((km, r))
        else:
            still_out.append((km, r))

    print(f"  contained        : {len(matched) - len(snapped):,}")
    print(f"  ambiguous        : {len(ambiguous):,} (smallest containing metro wins)")
    print(f"  snapped <= {SNAP_KM} km : {len(snapped):,}"
          + (f" (furthest {max(k for k, _ in snapped):.2f} km)" if snapped else ""))
    print(f"  still outside    : {len(still_out):,}"
          + (f" (closest {min(k for k, _ in still_out):.1f} km)" if still_out else ""))
    print(f"  TOTAL PLACED     : {len(matched):,}")

    if ambiguous:
        print("\nambiguous (first 10):")
        for r, cands in ambiguous[:10]:
            print(f"  {(r['name'] or '?')[:38]:<38s} -> {cands}")

    if still_out:
        by_country = collections.Counter((r["country_name"] or "?") for _, r in still_out)
        print("\nunplaced by country:", dict(by_country.most_common(10)))

    if already and len(matched) < already * MIN_PLACED_RATIO:
        sys.exit(f"REFUSING TO WRITE: would place {len(matched):,} where {already:,} "
                 "are placed today. Investigate before rerunning.")

    if not write:
        print("\nno --write; nothing sent to Supabase")
        return 0

    changed = {sid: slug for sid, slug in matched.items()
               if next((r for r in rows if r["skydb_id"] == sid), {}).get("metro_slug") != slug}
    by_slug = collections.defaultdict(list)
    for sid, slug in changed.items():
        by_slug[slug].append(sid)
    print(f"\nwriting {len(changed):,} changed rows across {len(by_slug):,} metros")
    done = 0
    for slug, ids in by_slug.items():
        for i in range(0, len(ids), BATCH):
            b = ids[i:i + BATCH]
            patch(f"skydb_structures?skydb_id=in.({','.join(str(x) for x in b)})",
                  {"metro_slug": slug})
            done += len(b)
    print(f"wrote {done:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
