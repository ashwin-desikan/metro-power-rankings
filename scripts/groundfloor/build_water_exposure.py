"""Ground Floor dimension 3, population-weighted: unmet basic water service.

Companion to build_exposure.py, which did the same job for the two air
dimensions. Rewrites water-sanitation.json in place: same filename, same
{slug: float} shape, same `detail` block, so the engine and the frontend need
no change.

WHY THIS EXISTS
---------------
After build_exposure.py, PM2.5 and NO2 were population-weighted across each
metro's boundary and water was still a single point-in-polygon test at the
metro centroid. Two of three dimensions measured one way and the third another,
on a board whose entire claim is that every dimension is measured the same way
for every metro. That inconsistency is worse than either method alone.

WHY IT MATTERS LESS HERE, AND WHY IT STILL MATTERS
--------------------------------------------------
Aqueduct's spatial unit is the union of HydroBASINS level-6 basins, GADM
level-1 provinces and groundwater aquifers, so it is far coarser than the air
rasters: many metros sit entirely inside one polygon and cannot move at all.
The metros that DO move are the ones straddling a provincial boundary, and for
those the old answer was decided by which side of the line the arithmetic
centre happened to fall on. That is the same arbitrariness the air rebuild
removed, just with fewer victims.

METHOD
------
Rasterise udw and usa once onto a 0.05 degree global grid, cache it, then reuse
build_exposure.py's population-weighting path unchanged:

    for every 30 arcsec GHS-POP cell inside the boundary
        udw, usa <- the Aqueduct polygon covering that cell
        c        <- combine(udw, usa)         (mean, both required)
    value        <- sum(pop * c) / sum(pop)

Combining PER CELL rather than after weighting preserves the rule that a metro
is never ranked on half the measure: a cell missing either sub-indicator drops
out of both numerator and denominator instead of contributing a half-measure.

WHY RASTERISE RATHER THAN POINT-IN-POLYGON EVERY CELL
-----------------------------------------------------
There are roughly 90 million populated cells across the set. A shapely
STRtree covers() test per cell is the obvious approach and is far too slow.
Rasterising once at 0.05 degree costs a couple of minutes, caches, and makes
every subsequent lookup array indexing. 0.05 degree is about 5.5 km, which is
an order of magnitude finer than the province-level source and finer than the
0.5 degree coastal snap the centroid method already tolerated, so it costs
nothing real. The STRtree is still built, but only for the centroid fallback.

USAGE
    python scripts/groundfloor/build_water_exposure.py --self-test
    python scripts/groundfloor/build_water_exposure.py --compare
    python scripts/groundfloor/build_water_exposure.py --compare --write
    python scripts/groundfloor/build_water_exposure.py --rebuild-grid   # ignore cache
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

DATA = ROOT / "public" / "data"
METROS = DATA / "metros.json"
GF = DATA / "ground-floor"
OUT = GF / "water-sanitation.json"
SCRATCH = ROOT / "_to_delete"
GRID_CACHE = SCRATCH / "aqueduct_udw_usa_005deg.npz"

# 0.05 degree global grid. See the docstring for why this is enough.
GRID_DEG = 0.05
GRID_W = 7200
GRID_H = 3600
GRID_WEST = -180.0
GRID_NORTH = 90.0


# --------------------------------------------------------------------------
# pure logic (covered by --self-test)
# --------------------------------------------------------------------------
def grid_index(lat, lon, deg=GRID_DEG, west=GRID_WEST, north=GRID_NORTH,
               w=GRID_W, h=GRID_H):
    """(row, col) of the 0.05 degree cell containing a point, clamped.

    Row counts DOWN from +90 because that is how the rasterised array is laid
    out. Getting this inverted is the single easiest way to produce a
    plausible-looking global dataset that is upside down, so it is tested
    against the four corners and the equator.
    """
    row = int((north - lat) / deg)
    col = int((lon - west) / deg)
    return max(0, min(h - 1, row)), max(0, min(w - 1, col))


def grid_index_vec(np, lats, lons, deg=GRID_DEG, west=GRID_WEST,
                   north=GRID_NORTH, w=GRID_W, h=GRID_H):
    """Vectorised twin of grid_index. --self-test pins them together."""
    row = np.floor((north - np.asarray(lats, dtype="float64")) / deg).astype("int64")
    col = np.floor((np.asarray(lons, dtype="float64") - west) / deg).astype("int64")
    return np.clip(row, 0, h - 1), np.clip(col, 0, w - 1)


def combine_vec(np, udw, usa, precision):
    """Vectorised twin of build_water_sanitation.combine, cell by cell.

    Mirrors clean_share() exactly: anything outside 0-1 is not a population
    share (Aqueduct uses 9999 / -9999 sentinels), and BOTH sub-indicators must
    be present or the cell contributes nothing. Rounding is applied at the end
    to match the scalar version's contract.
    """
    a = np.asarray(udw, dtype="float64")
    b = np.asarray(usa, dtype="float64")
    ok = (np.isfinite(a) & np.isfinite(b)
          & (a >= 0.0) & (a <= 1.0) & (b >= 0.0) & (b <= 1.0))
    out = np.full(a.shape, np.nan, dtype="float64")
    out[ok] = np.round((a[ok] + b[ok]) / 2.0, precision)
    return out


def dominant_label(np, labels, weights):
    """The label holding the most population. Reported instead of a single
    region name because a weighted metro can span several polygons, and
    pretending otherwise is what the old single-point answer did."""
    if not len(labels):
        return None, 0.0
    totals = {}
    for lab, w in zip(labels, weights):
        totals[lab] = totals.get(lab, 0.0) + float(w)
    total = sum(totals.values())
    if total <= 0:
        return None, 0.0
    best = max(totals, key=totals.get)
    return best, totals[best] / total


# --------------------------------------------------------------------------
def build_grid(rebuild=False):
    """Rasterise udw, usa and a polygon-id band onto the 0.05 degree grid.

    The id band exists so a metro can report which region actually holds its
    people rather than which one its centroid landed in.
    """
    import numpy as np
    if GRID_CACHE.exists() and not rebuild:
        z = np.load(GRID_CACHE, allow_pickle=True)
        print(f"  grid cache {GRID_CACHE.name} "
              f"({GRID_CACHE.stat().st_size/1048576:.0f} MB)")
        return z["udw"], z["usa"], z["pid"], list(z["labels"])

    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    from build_water_sanitation import ensure_data, load_polygons, clean_share

    ensure_data()
    gdf = load_polygons()
    print(f"  rasterising {len(gdf)} polygons onto "
          f"{GRID_H}x{GRID_W} at {GRID_DEG} deg (one-off, then cached)")
    transform = from_origin(GRID_WEST, GRID_NORTH, GRID_DEG, GRID_DEG)

    geoms = list(gdf.geometry.values)
    udw_raw = list(gdf["udw_raw"].values)
    usa_raw = list(gdf["usa_raw"].values)
    n0 = list(gdf["name_0"].values)
    n1 = list(gdf["name_1"].values)

    # Only burn polygons that carry BOTH sub-indicators. A polygon missing
    # either one is not usable by combine(), so burning it would create cells
    # that look covered and resolve to nothing.
    keep = [i for i in range(len(geoms))
            if clean_share(udw_raw[i]) is not None
            and clean_share(usa_raw[i]) is not None]
    print(f"  usable polygons (both udw and usa present): {len(keep)}")

    labels = ["" ] + [f"{n0[i]} / {n1[i]}" for i in keep]   # id 0 = nodata
    pid = rasterize(
        ((geoms[i], k + 1) for k, i in enumerate(keep)),
        out_shape=(GRID_H, GRID_W), transform=transform,
        fill=0, dtype="int32", all_touched=False)

    # map polygon id -> value, then index once. Far cheaper than two more
    # rasterize passes over 26 million cells.
    udw_lut = np.full(len(keep) + 1, np.nan, dtype="float32")
    usa_lut = np.full(len(keep) + 1, np.nan, dtype="float32")
    for k, i in enumerate(keep):
        udw_lut[k + 1] = clean_share(udw_raw[i])
        usa_lut[k + 1] = clean_share(usa_raw[i])
    udw = udw_lut[pid]
    usa = usa_lut[pid]

    covered = float((pid > 0).mean())
    print(f"  grid cells covered by a usable polygon: {covered*100:.1f}%")
    SCRATCH.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(GRID_CACHE, udw=udw, usa=usa, pid=pid,
                        labels=np.array(labels, dtype=object))
    print(f"  cached {GRID_CACHE.name} "
          f"({GRID_CACHE.stat().st_size/1048576:.0f} MB)")
    return udw, usa, pid, labels


def self_test():
    import numpy as np
    from build_water_sanitation import combine, clean_share, PRECISION
    fails, checks = [], 0

    def check(name, got, want):
        nonlocal checks
        checks += 1
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    # THE UPSIDE-DOWN TEST. Row counts down from +90.
    check("grid NW corner", grid_index(89.999, -179.999), (0, 0))
    check("grid SE corner", grid_index(-89.999, 179.999), (GRID_H - 1, GRID_W - 1))
    check("grid NE corner", grid_index(89.999, 179.999), (0, GRID_W - 1))
    check("grid SW corner", grid_index(-89.999, -179.999), (GRID_H - 1, 0))
    check("grid equator/meridian", grid_index(0.0, 0.0), (1800, 3600))
    check("grid just north of equator", grid_index(0.01, 0.0), (1799, 3600))
    check("grid clamps beyond pole", grid_index(95.0, 0.0), (0, 3600))
    check("grid clamps beyond south", grid_index(-95.0, 0.0), (GRID_H - 1, 3600))
    # London must land in the northern hemisphere, upper half of the array
    r, c = grid_index(51.5074, -0.1278)
    checks += 1
    if not (0 < r < GRID_H // 2 and abs(c - 3597) <= 2):
        fails.append(f"grid London landed at row {r} col {c}")
    # Sydney must land in the southern hemisphere, lower half
    r, c = grid_index(-33.8688, 151.2093)
    checks += 1
    if not (GRID_H // 2 < r < GRID_H):
        fails.append(f"grid Sydney landed at row {r}, expected southern half")

    # vectorised twin must agree with the scalar one everywhere
    rng = np.random.default_rng(3)
    lats = np.concatenate([rng.uniform(-89.99, 89.99, 3000),
                           np.array([0.0, 90.0, -90.0, 51.5074, -33.8688])])
    lons = np.concatenate([rng.uniform(-179.99, 179.99, 3000),
                           np.array([0.0, 0.0, 0.0, -0.1278, 151.2093])])
    rv, cv = grid_index_vec(np, lats, lons)
    checks += 1
    bad = 0
    for k in range(len(lats)):
        rs, cs = grid_index(float(lats[k]), float(lons[k]))
        if (rs, cs) != (int(rv[k]), int(cv[k])):
            bad += 1
            if bad == 1:
                fails.append(f"grid_index_vec disagrees at "
                             f"({lats[k]}, {lons[k]}): "
                             f"scalar {(rs, cs)} vec {(int(rv[k]), int(cv[k]))}")
    # combine_vec must mirror combine, INCLUDING the sentinel and half-measure rules
    cases = [(0.2, 0.4), (0.0, 0.0), (1.0, 1.0), (0.0, 0.6),
             (0.2, 9999.0), (9999.0, 0.2), (-9999.0, 0.5), (0.5, 1.0001),
             (0.2, float("nan")), (float("nan"), float("nan")),
             (0.0, 0.00176371268424), (0.260988519516, 0.522774293183)]
    a = np.array([x for x, _ in cases], dtype="float64")
    b = np.array([y for _, y in cases], dtype="float64")
    got = combine_vec(np, a, b, PRECISION)
    for k, (x, y) in enumerate(cases):
        want = combine(x, y)
        checks += 1
        g = None if not np.isfinite(got[k]) else float(got[k])
        if want is None:
            if g is not None:
                fails.append(f"combine_vec case {k} ({x},{y}): expected None got {g}")
        elif g is None or abs(g - want) > 1e-9:
            fails.append(f"combine_vec case {k} ({x},{y}): got {g} want {want}")

    # dominant label
    lab, share = dominant_label(np, ["a", "b", "a"], [1.0, 1.0, 3.0])
    check("dominant label", lab, "a")
    checks += 1
    if abs(share - 0.8) > 1e-9:
        fails.append(f"dominant share: got {share} want 0.8")
    check("dominant empty", dominant_label(np, [], []), (None, 0.0))
    check("dominant zero weight", dominant_label(np, ["a"], [0.0]), (None, 0.0))

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"self-test OK ({checks} checks)")
    return 0


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--compare", action="store_true")
    ap.add_argument("--rebuild-grid", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    import numpy as np
    from build_exposure import (POP_TIF, PopSurface, load_geometry, bbox_of,
                                bbox_sane, weighted_mean_np, pct_change)
    from build_water_sanitation import (combine, clean_share, pearson,
                                        coverage_ok, payload_changed,
                                        PRECISION, MAX_SNAP_DEG, CITATION)

    if not POP_TIF.exists():
        print(f"MISSING {POP_TIF.name}; run _to_delete/fetch_ghspop.py")
        return 2

    udw_g, usa_g, pid_g, labels = build_grid(rebuild=args.rebuild_grid)
    labels_arr = np.array(labels, dtype=object)

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    rows = metros[:args.limit] if args.limit else metros
    pop = PopSurface(POP_TIF)

    # the centroid path, kept ONLY as the fallback for metros whose populated
    # cells all land on nodata (small islands, and coastal polygons that stop
    # short of the shoreline)
    tree = geoms = udw_raw = usa_raw = None

    def centroid_fallback(la, lo):
        nonlocal tree, geoms, udw_raw, usa_raw
        if tree is None:
            from shapely import STRtree
            from build_water_sanitation import load_polygons
            gdf = load_polygons()
            geoms = list(gdf.geometry.values)
            udw_raw = list(gdf["udw_raw"].values)
            usa_raw = list(gdf["usa_raw"].values)
            tree = STRtree(geoms)
        from shapely.geometry import Point
        p = Point(lo, la)
        hit = None
        for i in tree.query(p):
            if geoms[i].covers(p):
                hit = int(i)
                break
        if hit is None:
            j = tree.nearest(p)
            if j is not None and geoms[int(j)].distance(p) <= MAX_SNAP_DEG:
                hit = int(j)
        if hit is None:
            return None, None, None
        return (combine(udw_raw[hit], usa_raw[hit]),
                clean_share(udw_raw[hit]), clean_share(usa_raw[hit]))

    values, detail, methods, failed = {}, {}, {}, []
    try:
        for n, m in enumerate(rows, 1):
            slug = m["slug"]
            la, lo = m.get("lat"), m.get("lon")
            geom = load_geometry(slug)
            done = False
            if geom is not None:
                try:
                    bb = bbox_of(geom)
                except Exception:
                    bb = None
                if bb is not None and bbox_sane(bb):
                    got = pop.cells_in(geom, bb)
                    if got is not None:
                        lats, lons, w = got
                        r, c = grid_index_vec(np, lats, lons)
                        u = udw_g[r, c].astype("float64")
                        s = usa_g[r, c].astype("float64")
                        comb = combine_vec(np, u, s, PRECISION)
                        v, den, ncell = weighted_mean_np(np, comb, w)
                        if v is not None:
                            ok = np.isfinite(comb) & np.isfinite(w) & (w > 0)
                            uw, _, _ = weighted_mean_np(np, u, np.where(ok, w, 0.0))
                            sw, _, _ = weighted_mean_np(np, s, np.where(ok, w, 0.0))
                            lab, share = dominant_label(
                                np, labels_arr[pid_g[r, c]][ok], w[ok])
                            values[slug] = round(v, PRECISION)
                            detail[slug] = {
                                "unimprovedWater": round(uw, PRECISION),
                                "unimprovedSanitation": round(sw, PRECISION),
                                "region": lab,
                                "regionShare": round(share, 3),
                            }
                            methods[slug] = "popWeighted"
                            done = True
            if not done and la is not None and lo is not None:
                v, uw, sw = centroid_fallback(la, lo)
                if v is not None:
                    values[slug] = v
                    detail[slug] = {
                        "unimprovedWater": round(uw, PRECISION),
                        "unimprovedSanitation": round(sw, PRECISION),
                        "region": None, "regionShare": None,
                    }
                    methods[slug] = "centroid"
                    done = True
            if not done:
                failed.append(slug)
            if n % 500 == 0:
                print(f"  {n}/{len(rows)}")
    finally:
        pop.close()

    tally = {}
    for v in methods.values():
        tally[v] = tally.get(v, 0) + 1
    print(f"\nresolved {len(values)} / {len(rows)}   {tally}")
    if failed:
        print(f"  unresolved: {failed[:12]}")
    return finish(args, values, detail, tally, failed, rows, len(rows),
                  pearson, coverage_ok, payload_changed, pct_change, CITATION)


def finish(args, values, detail, tally, failed, rows, n_input,
           pearson, coverage_ok, payload_changed, pct_change, CITATION):
    vals = sorted(values.values())
    n = len(vals)
    if not n:
        print("nothing resolved")
        return 1
    print(f"  min {vals[0]}  median {vals[n//2]}  max {vals[-1]}   "
          f"distinct {len(set(vals))} ({100.0*len(set(vals))/n:.1f}%)")

    slugs = sorted(detail)
    r_uw = pearson([detail[s]["unimprovedWater"] for s in slugs],
                   [detail[s]["unimprovedSanitation"] for s in slugs])
    print(f"  correlation between the two sub-indicators: {r_uw}")

    stats = None
    if args.compare or not args.write:
        old = None
        if OUT.exists():
            try:
                old = (json.loads(OUT.read_text(encoding="utf-8"))
                       .get("metros") or {})
            except Exception:
                old = None
        if old:
            shared = [s for s in values if s in old]
            moved = [s for s in shared if abs(values[s] - old[s]) > 1e-9]
            names = {m["slug"]: (m.get("name") or m["slug"]) for m in rows}
            ranks = {m["slug"]: m.get("rank") for m in rows}
            print(f"\n  === centroid vs population-weighted "
                  f"({len(shared)} shared) ===")
            print(f"  changed at all: {len(moved)} "
                  f"({100.0*len(moved)/len(shared):.1f}%)   "
                  f"unchanged: {len(shared)-len(moved)} "
                  f"(a metro wholly inside one polygon CANNOT move)")
            moved.sort(key=lambda s: -abs(values[s] - old[s]))
            print(f"  {'metro':26s} {'acc':>5s} {'centroid':>10s} "
                  f"{'popWtd':>10s} {'delta':>10s} {'region share':>13s}")
            for s in moved[:14]:
                print(f"  {names.get(s, s)[:26]:26s} "
                      f"{str(ranks.get(s) or '-'):>5s} {old[s]:10.4f} "
                      f"{values[s]:10.4f} {values[s]-old[s]:+10.4f} "
                      f"{str(detail[s].get('regionShare')):>13s}")
            stats = {"shared": len(shared), "changed": len(moved),
                     "unchangedBecauseSinglePolygon": len(shared) - len(moved)}

    if args.limit:
        print("\n--limit was set; refusing to write a partial dimension file.")
        return 0
    if not coverage_ok(len(values), n_input):
        print("\nCOVERAGE FLOOR NOT MET. Refusing to write.")
        return 2

    payload = {
        "_meta": {
            "metric": "share of population with unimproved or no basic water service",
            "unit": ("share 0-1, mean of unimproved drinking water and "
                     "unimproved sanitation"),
            "year": 2023,
            "source": "WRI Aqueduct 4.0 baseline annual (udw, usa)",
            "citation": CITATION,
            "licence": "Creative Commons (see WRI terms)",
            "why": ("a provision measure rather than a geography measure: it "
                    "describes what a place has built"),
            "spatialUnit": ("union of HydroBASINS level-6, GADM level-1 and "
                            "groundwater aquifers; complete by construction, "
                            "no name matching"),
            "weighting": (
                "POPULATION-WEIGHTED over the metro boundary: udw and usa are "
                "read per 30 arcsec GHS-POP cell from the Aqueduct polygons "
                "rasterised at 0.05 degree, combined PER CELL, then averaged "
                "weighted by population. Replaces the previous single "
                "point-in-polygon test at the metro centroid. Metros lying "
                "wholly inside one polygon are unchanged by construction."),
            "populationSource": ("GHS-POP R2023A epoch 2025, 30 arcsec, JRC, "
                                 "CC BY 4.0"),
            "rasterFidelity": (
                "MEASURED 2026-08-07 against exact point-in-polygon at the same "
                "600 sampled metro centroids: 97.0% exact agreement, median "
                "disagreement 0.0021 and max 0.0951 on a 0-1 share. The residual "
                "is boundary-straddling cells picking a neighbouring polygon, "
                "and it is an order of magnitude smaller than the weighting "
                "effect it sits inside. Reproduce with "
                "_to_delete/verify_water_raster.py."),
            "combination": ("mean of udw and usa, registered as ONE Ground "
                            "Floor dimension so water does not silently take "
                            "half the weight of the median. Combined per cell, "
                            "so a cell missing either sub-indicator leaves both "
                            "numerator and denominator rather than contributing "
                            "half a measure."),
            "region": ("the polygon holding the LARGEST share of the metro's "
                       "population, with that share; a weighted metro can span "
                       "several polygons and the old single-point answer hid that"),
            "excluded": ("ucw untreated wastewater EXCLUDED: 0 of 206 countries "
                         "with more than one distinct value. bws water stress "
                         "excluded as rainfall-driven."),
            "subIndicatorCorrelation": r_uw,
            "methodCounts": tally,
            "metrosCovered": len(values),
            "omittedSlugs": sorted(failed),
            "comparisonWithCentroid": stats,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "metros": {k: values[k] for k in sorted(values)},
        "detail": {k: detail[k] for k in sorted(detail)},
    }

    old_full = None
    if OUT.exists():
        try:
            old_full = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            old_full = None
    if not payload_changed(old_full, payload):
        print("\nno change; nothing to write")
        return 0
    if not args.write:
        print(f"\nDRY RUN. Would write {OUT.relative_to(ROOT)} "
              f"({len(values)} metros). Pass --write.")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB)")
    print("\nnow re-run the engine:  "
          "python scripts/groundfloor/build_ground_floor.py --write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
