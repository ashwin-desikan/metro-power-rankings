"""Give every metro a hexagonal address, and a measured footprint.

Two artifacts from one pass over the Overture-derived boundaries:

1. public/data/h3/metro-cells-r6.json
   slug -> the H3 resolution-6 cells (~36 km2 each) covering the metro.
   This is a JOIN KEY, not an analysis unit. Any external dataset that can be
   expressed as H3 cells -- census grids, mobility panels, ad-exposure logs,
   client first-party data -- can be attached to a metro by set intersection,
   with no name matching, no fuzzy geocoding and no per-source matcher script.
   That is the whole value: today every new geographic source needs its own
   bespoke reconciliation against the workbook.

2. public/data/metro-footprint.json
   slug -> {areaKm2, ghsPop, popRatio, cellsR6}
   Measured land area and an INDEPENDENT gridded population for every metro,
   from GHS-POP, summed inside the same boundary. popRatio is gridded over
   workbook population, so it is a standing audit of both the boundary and the
   workbook: values near 1.00 confirm each other, values far from 1.00 mark a
   definitional disagreement worth a human look.

WHY H3 IS NOT USED FOR THE GROUND FLOOR NUMBERS
-----------------------------------------------
It would make them worse. See the header of scripts/groundfloor/build_exposure.py:
binning 1 km population and 0.1 degree concentration onto hexagons before
averaging inserts a resampling step that costs accuracy for nothing. Hexagons
are for joining and for drawing. The integral is computed at native resolution.

RESOLUTION CHOICE
-----------------
Resolution 6 averages 36.13 km2 per cell (edge ~3.7 km). At r7 (5.16 km2) the
global metro footprint is roughly seven times the cell count for a precision no
current consumer needs, and the artifact stops being shippable. Cells are
CENTER-CONTAINED, so a metro smaller than one cell can polyfill to nothing; such
metros fall back to the single cell containing their representative point, which
is the right answer rather than an empty list.

USAGE
    python scripts/build_metro_grid.py --self-test
    python scripts/build_metro_grid.py --limit 200
    python scripts/build_metro_grid.py --write
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
METROS = DATA / "metros.json"
BOUNDARIES = DATA / "metro-boundaries"
OUT_CELLS = DATA / "h3" / "metro-cells-r6.json"
OUT_FOOT = DATA / "metro-footprint.json"

sys.path.insert(0, str(ROOT / "scripts" / "groundfloor"))

RES = 6
COVERAGE_FLOOR = 0.95
# 30 arcsec at the equator. North-south is constant; east-west shrinks with
# cos(latitude), which is why area is summed per cell rather than counted.
CELL_DEG = 30.0 / 3600.0
KM_PER_DEG = 111.32


# --------------------------------------------------------------------------
# pure logic (covered by --self-test)
# --------------------------------------------------------------------------
def representative_point(geom):
    """A point guaranteed to be inside-ish: the centroid of the largest ring's
    vertices. Only used for metros too small to polyfill, where any point in the
    polygon lands in the same cell anyway."""
    t = geom.get("type")
    rings = (geom["coordinates"] if t == "Polygon"
             else [r for poly in geom["coordinates"] for r in poly])
    biggest = max(rings, key=len)
    xs = [c[0] for c in biggest]
    ys = [c[1] for c in biggest]
    return sum(ys) / len(ys), sum(xs) / len(xs)


def cell_km2_at(lat, cell_deg=CELL_DEG, km_per_deg=KM_PER_DEG):
    """Area of one 30 arcsec cell at a given latitude.

    North-south extent is constant; east-west shrinks with cos(latitude).
    Counting cells and multiplying by a single constant overstates high-latitude
    metros by a lot: at 60N a cell is half the area it is at the equator.
    """
    import math
    ns = cell_deg * km_per_deg
    ew = cell_deg * km_per_deg * math.cos(math.radians(lat))
    return ns * max(ew, 0.0)


def pop_ratio(gridded, workbook):
    """Gridded population over workbook population. None when unusable."""
    if not workbook or workbook <= 0 or gridded is None:
        return None
    return round(gridded / workbook, 3)


def ratio_flag(ratio, lo=0.75, hi=1.30):
    """ok / low / high / unknown. A standing audit, not a correction: the
    workbook is ground truth for population, so a flag is a prompt for a human
    to look at the BOUNDARY, never a licence to overwrite the workbook."""
    if ratio is None:
        return "unknown"
    if ratio < lo:
        return "low"
    if ratio > hi:
        return "high"
    return "ok"


def payload_changed(old, new):
    if not isinstance(old, dict):
        return True
    return old.get("metros") != new.get("metros")


def self_test():
    fails, checks = [], 0

    def check(name, got, want):
        nonlocal checks
        checks += 1
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    def close(name, got, want, tol=1e-6):
        nonlocal checks
        checks += 1
        if got is None or abs(got - want) > tol:
            fails.append(f"{name}: got {got!r} want ~{want!r}")

    sq = {"type": "Polygon",
          "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    la, lo = representative_point(sq)
    close("rep point lat", la, 0.4)
    close("rep point lon", lo, 0.4)
    multi = {"type": "MultiPolygon",
             "coordinates": [[[[10, 10], [10.1, 10], [10, 10.1], [10, 10]]],
                             [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]]}
    la, lo = representative_point(multi)
    close("rep point picks largest ring", la, 0.4)

    # the cos(latitude) correction: a cell at 60N is half an equatorial one
    close("cell area equator", cell_km2_at(0.0), (CELL_DEG * KM_PER_DEG) ** 2, 1e-9)
    checks += 1
    if not abs(cell_km2_at(60.0) / cell_km2_at(0.0) - 0.5) < 1e-3:
        fails.append("cell area at 60N should be half the equatorial area")
    checks += 1
    if not cell_km2_at(89.9) < cell_km2_at(45.0) < cell_km2_at(0.0):
        fails.append("cell area must shrink monotonically toward the pole")
    close("cell area at pole", cell_km2_at(90.0), 0.0, 1e-9)

    close("pop ratio", pop_ratio(1100.0, 1000), 1.1)
    check("pop ratio zero workbook", pop_ratio(1100.0, 0), None)
    check("pop ratio none workbook", pop_ratio(1100.0, None), None)
    check("pop ratio none gridded", pop_ratio(None, 1000), None)

    check("flag ok", ratio_flag(1.02), "ok")
    check("flag low", ratio_flag(0.65), "low")
    check("flag high", ratio_flag(1.51), "high")
    check("flag boundary low", ratio_flag(0.75), "ok")
    check("flag boundary high", ratio_flag(1.30), "ok")
    check("flag unknown", ratio_flag(None), "unknown")

    check("changed vs none", payload_changed(None, {"metros": {}}), True)
    check("changed same", payload_changed({"metros": {"a": 1}}, {"metros": {"a": 1}}), False)
    check("changed ignores meta",
          payload_changed({"metros": {"a": 1}, "_meta": {"generatedAt": "x"}},
                          {"metros": {"a": 1}, "_meta": {"generatedAt": "y"}}), False)

    # H3 contract. If these break, the resolution table or the API changed.
    import h3
    checks += 1
    if h3.get_resolution(h3.latlng_to_cell(51.5074, -0.1278, RES)) != RES:
        fails.append("h3 round trip lost the resolution")
    # a polygon smaller than one r6 cell polyfills to NOTHING under centre
    # containment. This is the case the fallback exists for.
    tiny = {"type": "Polygon",
            "coordinates": [[[0.0, 51.5], [0.001, 51.5], [0.001, 51.501],
                             [0.0, 51.501], [0.0, 51.5]]]}
    checks += 1
    if len(h3.geo_to_cells(tiny, RES)) != 0:
        fails.append("expected a sub-cell polygon to polyfill to zero cells at "
                     f"r{RES}; the fallback may no longer be needed")
    checks += 1
    if len(h3.geo_to_cells(sq, RES)) < 100:
        fails.append("a 1x1 degree box should cover many r6 cells")

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
    ap.add_argument("--write", action="store_true",
                    help="write metro-footprint.json")
    ap.add_argument("--write-cells", action="store_true",
                    help="ALSO write the monolithic r6 cell index. Measured "
                         "2026-08-07: ~12 MB for 652,714 cells, against a ~2.5 MB "
                         "house maximum for a public data file. Do not ship this "
                         "until something consumes it, and when something does, "
                         "prefer per-metro files under public/data/h3/<slug>.json "
                         "to match the metro-boundaries convention.")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-population", action="store_true",
                    help="H3 cells only; skip the GHS-POP footprint pass")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    import h3
    import numpy as np
    from build_exposure import POP_TIF, PopSurface, load_geometry, bbox_of, bbox_sane

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    rows = metros[:args.limit] if args.limit else metros
    print(f"metros: {len(rows)}   resolution r{RES} "
          f"({h3.average_hexagon_area(RES, unit='km^2'):.2f} km2 per cell)")

    pop = None
    if not args.no_population:
        if not POP_TIF.exists():
            print(f"MISSING {POP_TIF.name}; run _to_delete/fetch_ghspop.py "
                  f"or pass --no-population")
            return 2
        pop = PopSurface(POP_TIF)

    cells_out, foot_out = {}, {}
    n_fallback = n_nobound = 0
    try:
        for n, m in enumerate(rows, 1):
            slug = m["slug"]
            geom = load_geometry(slug)
            if geom is None:
                n_nobound += 1
                continue
            try:
                bb = bbox_of(geom)
            except Exception:
                n_nobound += 1
                continue
            if not bbox_sane(bb):
                # antimeridian or corrupt: a hex set spanning the planet is
                # worse than no hex set at all
                n_nobound += 1
                continue
            cells = sorted(h3.geo_to_cells(geom, RES))
            if not cells:
                la, lo = representative_point(geom)
                cells = [h3.latlng_to_cell(la, lo, RES)]
                n_fallback += 1
            cells_out[slug] = cells

            entry = {"cellsR6": len(cells)}
            if pop is not None:
                got = pop.cells_in(geom, bb)
                if got is not None:
                    lats, lons, w = got
                    area = float(np.sum([cell_km2_at(float(v)) for v in lats])) \
                        if len(lats) < 4000 else float(
                            (CELL_DEG * KM_PER_DEG) ** 2
                            * np.sum(np.cos(np.radians(lats))))
                    gp = float(w.sum())
                    entry["areaKm2"] = round(area, 1)
                    entry["ghsPop"] = round(gp)
                    ratio = pop_ratio(gp, m.get("pop"))
                    entry["popRatio"] = ratio
                    entry["popFlag"] = ratio_flag(ratio)
            foot_out[slug] = entry
            if n % 500 == 0:
                print(f"  {n}/{len(rows)}")
    finally:
        if pop is not None:
            pop.close()

    total_cells = sum(len(v) for v in cells_out.values())
    print(f"\nmetros with cells: {len(cells_out)}   no usable boundary: {n_nobound}"
          f"   sub-cell fallback: {n_fallback}")
    print(f"total r{RES} cells: {total_cells:,}   "
          f"median per metro: {int(np.median([len(v) for v in cells_out.values()]))}"
          f"   max: {max(len(v) for v in cells_out.values()):,}")
    if foot_out and "popRatio" in next(iter(foot_out.values()), {}):
        flags = {}
        for e in foot_out.values():
            flags[e.get("popFlag", "unknown")] = flags.get(e.get("popFlag", "unknown"), 0) + 1
        ratios = [e["popRatio"] for e in foot_out.values() if e.get("popRatio")]
        print(f"popRatio: median {np.median(ratios):.3f}   flags {flags}")
    return finish(args, cells_out, foot_out, total_cells, n_fallback, len(rows))


def finish(args, cells_out, foot_out, total_cells, n_fallback, n_input):
    if not cells_out:
        print("nothing built")
        return 1
    if len(cells_out) < COVERAGE_FLOOR * n_input and not args.limit:
        print(f"COVERAGE FLOOR NOT MET ({len(cells_out)}/{n_input}). "
              f"Refusing to write.")
        return 2

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    cells_payload = {
        "_meta": {
            "what": f"H3 resolution-{RES} cells covering each metro boundary",
            "purpose": ("a JOIN KEY for attaching external gridded or point data "
                        "to metros by set intersection, and a presentation grid. "
                        "NOT an analysis unit: see the module docstring and "
                        "scripts/groundfloor/build_exposure.py for why the Ground "
                        "Floor numbers are computed at native raster resolution "
                        "instead."),
            "resolution": RES,
            "avgCellAreaKm2": 36.13,
            "containment": ("centre-contained (h3.geo_to_cells). Metros smaller "
                            "than one cell polyfill to nothing and fall back to "
                            "the single cell holding their representative point."),
            "subCellFallbacks": n_fallback,
            "boundarySource": ("Overture Maps division_area, simplified; see "
                               "scripts/build-metro-boundaries.py"),
            "metros": len(cells_out),
            "totalCells": total_cells,
            "generatedAt": stamp,
        },
        "metros": {k: cells_out[k] for k in sorted(cells_out)},
    }
    foot_payload = {
        "_meta": {
            "what": ("measured land area and independent gridded population per "
                     "metro, summed inside the Overture-derived boundary"),
            "areaMethod": ("sum of 30 arcsec cell areas inside the boundary, each "
                           "scaled by cos(latitude); counting cells against one "
                           "constant overstates high-latitude metros badly"),
            "populationSource": ("GHS-POP R2023A epoch 2025, 30 arcsec, JRC, "
                                 "CC BY 4.0"),
            "popRatio": ("gridded population divided by the workbook population. "
                         "This is an AUDIT, not a correction: the workbook stays "
                         "ground truth for population. A flag of low or high "
                         "means look at the BOUNDARY."),
            "flagThresholds": {"low": "< 0.75", "high": "> 1.30"},
            "metros": len(foot_out),
            "generatedAt": stamp,
        },
        "metros": {k: foot_out[k] for k in sorted(foot_out)},
    }

    if args.limit:
        print("\n--limit was set; refusing to write partial files.")
        return 0
    est_c = len(json.dumps(cells_payload, separators=(",", ":"))) / 1024 / 1024
    est_f = len(json.dumps(foot_payload, separators=(",", ":"))) / 1024
    if not args.write:
        print(f"\nDRY RUN. Would write:")
        print(f"  {OUT_FOOT.relative_to(ROOT)}  ~{est_f:.0f} KB")
        print(f"  {OUT_CELLS.relative_to(ROOT)}  ~{est_c:.1f} MB "
              f"(only with --write-cells)")
        print("Pass --write.")
        return 0

    targets = [(OUT_FOOT, foot_payload)]
    if args.write_cells:
        targets.append((OUT_CELLS, cells_payload))
    else:
        print(f"\n  skipping {OUT_CELLS.name} (~{est_c:.1f} MB, no consumer yet). "
              f"Pass --write-cells to force.")
    for path, payload in targets:
        old = None
        if path.exists():
            try:
                old = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                old = None
        if not payload_changed(old, payload):
            print(f"  {path.name}: no change")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, separators=(",", ":")) + "\n",
                        encoding="utf-8")
        print(f"  wrote {path.relative_to(ROOT)} "
              f"({path.stat().st_size/1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
