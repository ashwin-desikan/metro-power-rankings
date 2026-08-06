"""Ground Floor dimension 3: unmet basic water and sanitation service.

WHY THIS ONE
------------
Dimensions 1 and 2 are both "what is in the air you breathe". This is a
different KIND of condition: what share of the population lacks improved
drinking water or improved sanitation. It is a provision measure, not a
geography measure -- it describes what a place has built, which is what the
Ground Floor is for.

Source: WRI Aqueduct 4.0, baseline annual. Spatial unit is the union of
HydroBASINS level-6 basins, GADM level-1 provinces and groundwater aquifers,
so every land coordinate falls inside exactly one polygon: complete by
construction, point-in-polygon, NO NAME MATCHING. Creative Commons.
Indicators `udw` (unimproved/no drinking water) and `usa` (unimproved/no
sanitation), both expressed as a population share 0-1.

WHAT WAS MEASURED BEFORE BUILDING (2026-08-06)
-----------------------------------------------
The survey-derived indicators had to be tested for whether they actually vary
below country level, or are a country indicator wearing a metro costume --
the thing we excluded HDI, Gini and life expectancy from the rank for.

    indicator                     distinct globally   countries with >1 value
    udw unimproved drinking water        6,066            166 / 218  (76%)
    usa unimproved sanitation            6,171            166 / 218  (76%)
    ucw untreated wastewater               105              0 / 206  ( 0%)
    bws baseline water stress           12,278            168 / 212  (79%)

udw and usa are genuinely sub-national (669 distinct values inside the USA
alone, 679 in China, 352 in India). **ucw is a single value per country and is
therefore EXCLUDED** -- it was on the original candidate list and did not
survive the test. bws passes the variation test but is substantially driven by
rainfall, the same biome confound that ruled out raw vegetation, so it is not
used either.

WHY ONE DIMENSION AND NOT TWO
-----------------------------
udw and usa are registered as a SINGLE Ground Floor dimension, their mean.
Registering both would give water half the weight of a four-dimension median
while air gets the other half by accident rather than by decision. The two are
combined here, visibly, rather than quietly double-counted. Both raw values
are kept in the output so the split is always inspectable, and the measured
correlation between them is written into the metadata.

USAGE
    python scripts/groundfloor/build_water_sanitation.py --self-test
    python scripts/groundfloor/build_water_sanitation.py            # dry run
    python scripts/groundfloor/build_water_sanitation.py --write
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
METROS = DATA / "metros.json"
GF = DATA / "ground-floor"
OUT = GF / "water-sanitation.json"

SCRATCH = ROOT / "_to_delete"
ZIP = SCRATCH / "aqueduct-4-0-water-risk-data.zip"
GDB = SCRATCH / "aqueduct40" / "Aq40_Y2023D07M05.gdb"
GDB_PREFIX = "Aqueduct40_waterrisk_download_Y2023M07D05/GDB/Aq40_Y2023D07M05.gdb/"
URL = "https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip"
LAYER = "baseline_annual"

COVERAGE_FLOOR = 0.95
PRECISION = 6                   # shares are 0-1, so more dp than the rasters
MAX_SNAP_DEG = 0.5              # nearest-polygon fallback cap for coastal points

CITATION = ("WRI Aqueduct 4.0 baseline annual water risk indicators "
            "(doi:10.46830/writn.23.00061), indicators udw and usa. "
            "Creative Commons.")


# --------------------------------------------------------------------------
# pure logic
# --------------------------------------------------------------------------
def clean_share(v):
    """Aqueduct uses 9999 / -9999 as sentinels and these fields are population
    SHARES, so anything outside 0-1 is not a share. Returns None if unusable."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:                      # NaN
        return None
    if f < 0.0 or f > 1.0:
        return None
    return f


def combine(udw, usa):
    """Single 'unmet basic water service' figure: the mean of the two shares.

    Mean, not max: max would let one bad service hide the other entirely, and
    a place with terrible sanitation but good water would be indistinguishable
    from one where both fail. Returns None unless BOTH are present, so a metro
    is never ranked on half the measure.
    """
    a, b = clean_share(udw), clean_share(usa)
    if a is None or b is None:
        return None
    return round((a + b) / 2.0, PRECISION)


def coverage_ok(n_have, n_total, floor=COVERAGE_FLOOR):
    if n_total <= 0:
        return False
    return (n_have / n_total) >= floor


def payload_changed(old, new):
    if not isinstance(old, dict):
        return True
    return old.get("metros") != new.get("metros")


def pearson(xs, ys):
    n = len(xs)
    if n < 2 or len(ys) != n:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    if dx == 0 or dy == 0:
        return None
    return round(num / (dx * dy), 4)


# --------------------------------------------------------------------------
def ensure_data():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    if not ZIP.exists() or ZIP.stat().st_size < 1_000_000:
        print("downloading Aqueduct 4.0 (~250 MB) ...")
        with urllib.request.urlopen(URL, timeout=1800) as r, open(ZIP, "wb") as f:
            while True:
                c = r.read(1 << 20)
                if not c:
                    break
                f.write(c)
        print(f"  {ZIP.stat().st_size/1024/1024:.1f} MB")
    if not GDB.exists():
        print("extracting geodatabase ...")
        GDB.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(ZIP) as z:
            for n in z.namelist():
                if n.startswith(GDB_PREFIX) and not n.endswith("/"):
                    with z.open(n) as src, open(GDB / Path(n).name, "wb") as dst:
                        dst.write(src.read())
    return GDB


def load_polygons():
    import pyogrio
    cols = ["string_id", "gid_0", "name_0", "name_1", "udw_raw", "usa_raw"]
    gdf = pyogrio.read_dataframe(str(GDB), layer=LAYER, columns=cols)
    return gdf


# --------------------------------------------------------------------------
def self_test():
    fails, checks = [], 0

    def check(name, got, want):
        nonlocal checks
        checks += 1
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    # sentinels and out-of-range: these ARE present in Aqueduct (bws uses 9999)
    check("share zero", clean_share(0.0), 0.0)
    check("share one", clean_share(1.0), 1.0)
    check("share typical", clean_share(0.0603492304111), 0.0603492304111)
    check("share 9999 sentinel", clean_share(9999.0), None)
    check("share -9999 sentinel", clean_share(-9999.0), None)
    check("share above one", clean_share(1.0001), None)
    check("share negative", clean_share(-0.01), None)
    check("share nan", clean_share(float("nan")), None)
    check("share none", clean_share(None), None)
    check("share text", clean_share("x"), None)
    check("share numeric string", clean_share("0.25"), 0.25)

    check("combine both", combine(0.2, 0.4), 0.3)
    check("combine zeros", combine(0.0, 0.0), 0.0)
    check("combine ones", combine(1.0, 1.0), 1.0)
    # must NOT rank a metro on half the measure
    check("combine missing usa", combine(0.2, None), None)
    check("combine missing udw", combine(None, 0.4), None)
    check("combine sentinel", combine(0.2, 9999.0), None)
    # mean not max: these two must differ
    check("combine is mean not max", combine(0.0, 0.6), 0.3)
    # real values from the probe: London and Kinshasa
    check("combine london", combine(0.0, 0.00176371268424), 0.000882)
    check("combine kinshasa", combine(0.260988519516, 0.522774293183), 0.391881)

    check("coverage ok", coverage_ok(4300, 4305), True)
    check("coverage low", coverage_ok(3000, 4305), False)
    check("coverage zero total", coverage_ok(0, 0), False)
    check("changed", payload_changed(None, {"metros": {}}), True)
    check("unchanged", payload_changed({"metros": {"a": 1}}, {"metros": {"a": 1}}), False)
    check("pearson perfect", pearson([1, 2, 3], [1, 2, 3]), 1.0)
    check("pearson flat", pearson([1, 1, 1], [1, 2, 3]), None)

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
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    ensure_data()
    from shapely import STRtree
    from shapely.geometry import Point

    gdf = load_polygons()
    print(f"polygons: {len(gdf)}  crs {gdf.crs}")
    geoms = list(gdf.geometry.values)
    udw_col = list(gdf["udw_raw"].values)
    usa_col = list(gdf["usa_raw"].values)
    name0 = list(gdf["name_0"].values)
    name1 = list(gdf["name_1"].values)
    tree = STRtree(geoms)

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    values, detail, snapped, failed = {}, {}, [], []

    for m in metros:
        la, lo = m.get("lat"), m.get("lon")
        if la is None or lo is None:
            failed.append(m["slug"])
            continue
        p = Point(lo, la)
        hit = None
        for i in tree.query(p):
            if geoms[i].covers(p):
                hit = int(i)
                break
        snap = False
        if hit is None:
            # coastal centroids can fall just outside every polygon
            j = tree.nearest(p)
            if j is not None and geoms[int(j)].distance(p) <= MAX_SNAP_DEG:
                hit = int(j)
                snap = True
        if hit is None:
            failed.append(m["slug"])
            continue
        c = combine(udw_col[hit], usa_col[hit])
        if c is None:
            failed.append(m["slug"])
            continue
        values[m["slug"]] = c
        detail[m["slug"]] = {
            "unimprovedWater": round(clean_share(udw_col[hit]), PRECISION),
            "unimprovedSanitation": round(clean_share(usa_col[hit]), PRECISION),
            "region": f"{name0[hit]} / {name1[hit]}",
        }
        if snap:
            snapped.append(m["slug"])

    print(f"\nresolved {len(values)} / {len(metros)}")
    print(f"  inside a polygon: {len(values)-len(snapped)}   snapped to nearest: "
          f"{len(snapped)}   unresolved: {len(failed)}")
    if failed:
        print(f"  unresolved: {failed[:12]}")

    vals = sorted(values.values())
    n = len(vals)
    print(f"  min {vals[0]}  p25 {vals[n//4]}  median {vals[n//2]}  "
          f"p75 {vals[3*n//4]}  max {vals[-1]}")
    print(f"  distinct: {len(set(vals))} ({100.0*len(set(vals))/n:.1f}%)")

    slugs = sorted(detail)
    r_uw = pearson([detail[s]["unimprovedWater"] for s in slugs],
                   [detail[s]["unimprovedSanitation"] for s in slugs])
    print(f"\n  correlation between the two sub-indicators: {r_uw}")
    if r_uw is not None and r_uw > 0.95:
        print("  >0.95: they are effectively one measure; combining was right")
    elif r_uw is not None:
        print("  they diverge meaningfully (e.g. good water, poor sanitation), "
              "so the mean carries information neither alone does")

    for s in ("london", "new-york", "delhi", "dhaka", "lagos", "kinshasa", "sydney"):
        if s in detail:
            d = detail[s]
            print(f"    {s:12s} water {d['unimprovedWater']:.4f}  "
                  f"sanitation {d['unimprovedSanitation']:.4f}  -> {values[s]:.4f}"
                  f"   [{d['region']}]")

    if not coverage_ok(len(values), len(metros)):
        print("\nCOVERAGE FLOOR NOT MET. Refusing to write.")
        return 2

    payload = {
        "_meta": {
            "metric": "share of population with unimproved or no basic water service",
            "unit": "share 0-1, mean of unimproved drinking water and unimproved sanitation",
            "year": 2023,
            "source": "WRI Aqueduct 4.0 baseline annual (udw, usa)",
            "citation": CITATION,
            "licence": "Creative Commons (see WRI terms)",
            "why": ("a provision measure rather than a geography measure: it "
                    "describes what a place has built"),
            "spatialUnit": ("union of HydroBASINS level-6, GADM level-1 and "
                            "groundwater aquifers; point-in-polygon, no name matching"),
            "combination": ("mean of udw and usa, registered as ONE Ground Floor "
                            "dimension so water does not silently take half the "
                            "weight of the median"),
            "excluded": ("ucw untreated wastewater was a candidate and was "
                         "EXCLUDED: measured 0 of 206 countries with more than "
                         "one distinct value, i.e. country-level. bws water "
                         "stress excluded as rainfall-driven."),
            "subIndicatorCorrelation": r_uw,
            "metrosCovered": len(values),
            "metrosSnapped": len(snapped),
            "omittedSlugs": sorted(failed),
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "metros": {k: values[k] for k in sorted(values)},
        "detail": {k: detail[k] for k in sorted(detail)},
    }

    old = None
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            old = None
    if not payload_changed(old, payload):
        print("\nno change; nothing to write")
        return 0
    if not args.write:
        print(f"\nDRY RUN. Would write {OUT.relative_to(ROOT)} ({len(values)} metros).")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
