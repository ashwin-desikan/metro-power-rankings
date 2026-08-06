"""Ground Floor: annual mean PM2.5 per metro, from satellite-derived SatPM2.5.

First dimension of the Ground Floor conditions layer. See GROUND-FLOOR-SPEC.md.

WHY THIS SOURCE
---------------
The Ground Floor rank needs inputs complete BY CONSTRUCTION. The site's own 16
dimensions are not: measured 2026-08-06, the median metro has ONE non-zero
dimension out of fourteen and 34% have none, so no per-capita ratio of them can
rank. Ground-station networks (OpenAQ, WAQI) are sparsest exactly where air is
worst. A global gridded product returns a value for every land cell.

Source: SatPM2.5 V6GL03, Atmospheric Composition Analysis Group, Washington
University in St. Louis. Satellite AOD + chemical transport model, calibrated
against ground monitors with a CNN. Global, 0.1 degree, annual, CC BY 4.0,
distributed via the AWS Registry of Open Data (no key, no rate limit).
One 5 MB file per year, 1998-2024.

WHY NOT CAMS / Open-Meteo (built, then rejected, 2026-08-06)
------------------------------------------------------------
The first version of this script pulled CAMS reanalysis hourly PM2.5 and
averaged it. It looked right on London (9.57 against a real 9-11) and was
WRONG ON RANK ORDER, which is the one thing a ranking cannot survive:

    metro         CAMS      SatPM2.5   published
    Delhi         80.3       96.5       99.6   (IQAir 2025)
    Beijing       83.4       45.0       ~30-35
    New York      13.2        7.8        7.3   (US country mean)
    Los Angeles   23.7       14.6       ~12
    Tokyo         26.9       13.6       ~9-11

CAMS put Delhi and Beijing level when Delhi is roughly twice Beijing, and put
Los Angeles above the most polluted city in America. Cause: CAMS total PM2.5
includes natural aerosol (sea salt, desert dust), so coastal metros are
inflated for having a coastline. The tell was a near-neighbour check --
CAMS gave coastal Jeddah 79.2 against inland Mecca 44.7; SatPM2.5 gives
Jeddah 44.0 against Mecca 61.5, which is the correct physical picture.

If anyone proposes "just use the free weather API", this is why not.
The rejected implementation is kept at _to_delete/build_air_quality_CAMS_rejected.py
until this one has shipped.

THE -999 TRAP
-------------
The raster has NO NaNs. Ocean and no-data cells carry -999, and they are 63%
of the grid. A sampler that tests for NaN silently returns -999 for any metro
whose centroid lands on water, and that value ranks. Always test the sentinel.
Covered by ten self-test cases; do not simplify is_missing().

USAGE
    python scripts/groundfloor/build_air_quality.py --self-test
    python scripts/groundfloor/build_air_quality.py --validate   # vs references
    python scripts/groundfloor/build_air_quality.py              # dry run
    python scripts/groundfloor/build_air_quality.py --write
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
METROS = DATA / "metros.json"
OUT = DATA / "ground-floor" / "air-quality.json"
# raster lives in the gitignored scratch dir: 5 MB of source data does not
# belong in git, and it is one download away on any machine.
RASTER_DIR = ROOT / "_to_delete"

YEAR = 2024                     # latest complete year in V6GL03
VERSION = "V6GL03"
BUCKET = "https://satpmdata.s3.us-east-1.amazonaws.com"
MISSING = -900.0                # anything at or below is the -999 fill
MAX_WIDEN = 8                   # cells; 0.1deg each, so up to ~90km
COVERAGE_FLOOR = 0.95

# Stored decimal places. NOT a claim of measurement accuracy -- it is the
# model's grid value, and the display layer should round to 1dp.
# Measured 2026-08-06, distinct values across 4,304 metros:
#     2dp -> 2,133 (49.6%)     4dp -> 4,238 (98.5%)     unrounded -> 4,284 (99.5%)
# Rounding to 2dp manufactures ~2,150 FALSE TIES, and a median-of-ranks
# composite would hand all of them the same average rank, throwing away real
# ordering the model actually has. Genuine ties -- two metros in one 0.1deg
# cell, e.g. Detroit and Windsor -- number just 20. Keep the precision for the
# rank; round for the reader.
PRECISION = 4
WHO_ANNUAL_GUIDELINE = 5.0      # ug/m3, WHO 2021 AQG

CITATION = ("SatPM2.5 V6GL03, Atmospheric Composition Analysis Group, "
            "Washington University in St. Louis, via the AWS Registry of Open "
            "Data (registry.opendata.aws/surface-pm2-5-v6gl). CC BY 4.0. "
            "Method: van Donkelaar et al., Environ. Sci. Technol. 2021, "
            "doi:10.1021/acs.est.1c05309")

# Independently-sourced reference values, gathered 2026-08-06 from the IQAir
# 2025 World Air Quality Report. Used by --validate. These are a SANITY BAND,
# not ground truth, and they are a different calendar year to the raster.
REFERENCES = [
    ("delhi", 28.6139, 77.2090, 85, 115, "IQAir 2025: 99.6"),
    ("seattle", 47.6062, -122.3321, 3.5, 7.0, "cleanest major US city: 4.5"),
    ("el-paso", 31.7619, -106.4850, 8.0, 14.0, "most polluted US city: 11.4"),
    ("new-york", 40.7128, -74.0060, 5.5, 10.0, "US country mean 7.3"),
    ("london", 51.5074, -0.1278, 7.0, 12.0, "real-world 9-11"),
    ("beijing", 39.9042, 116.4074, 28, 50, "real-world 30-35"),
    ("tokyo", 35.6762, 139.6503, 8.0, 16.0, "real-world 9-11"),
    ("lagos", 6.5244, 3.3792, 30, 55, "real-world 40-50"),
    ("sydney", -33.8688, 151.2093, 4.0, 9.0, "real-world 6-8"),
    ("mexico-city", 19.4326, -99.1332, 16, 28, "real-world ~20"),
]


# --------------------------------------------------------------------------
# pure logic (covered by --self-test, no network, no raster)
# --------------------------------------------------------------------------
def is_missing(v, sentinel=MISSING):
    """The -999 trap. A sampler that only tests NaN ranks ocean cells."""
    if v is None:
        return True
    try:
        f = float(v)
    except (TypeError, ValueError):
        return True
    return f != f or f <= sentinel      # f != f catches NaN


def nearest_index(axis_first, axis_delta, axis_len, value):
    """Index of the grid cell whose centre is nearest `value`, clamped."""
    if axis_len < 1:
        raise ValueError("empty axis")
    idx = int(round((value - axis_first) / axis_delta))
    return max(0, min(axis_len - 1, idx))


def window_bounds(i, j, r, n_rows, n_cols):
    """Clamped square neighbourhood, radius r in cells."""
    return (max(0, i - r), min(n_rows, i + r + 1),
            max(0, j - r), min(n_cols, j + r + 1))


def coverage_ok(n_have, n_total, floor=COVERAGE_FLOOR):
    if n_total <= 0:
        return False
    return (n_have / n_total) >= floor


def payload_changed(old, new):
    if not isinstance(old, dict):
        return True
    return old.get("metros") != new.get("metros")


def raster_key(year=YEAR):
    return (f"{VERSION}/CoarseResolution/GL/Annual/"
            f"{VERSION}.CNNPM25.0p10.GL.{year}01-{year}12.nc")


# --------------------------------------------------------------------------
# raster
# --------------------------------------------------------------------------
def ensure_raster(year=YEAR):
    RASTER_DIR.mkdir(parents=True, exist_ok=True)
    key = raster_key(year)
    dest = RASTER_DIR / key.rsplit("/", 1)[-1]
    if dest.exists() and dest.stat().st_size > 1_000_000:
        return dest
    url = f"{BUCKET}/{key}"
    print(f"downloading {url}")
    with urllib.request.urlopen(url, timeout=600) as r, open(dest, "wb") as f:
        total = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
    print(f"  {total/1024/1024:.1f} MB")
    return dest


class Sampler:
    def __init__(self, path):
        import h5py
        import numpy as np
        self.np = np
        with h5py.File(path, "r") as f:
            self.pm = f["PM25"][:]
            lat = f["lat"][:]
            lon = f["lon"][:]
        self.lat0, self.lon0 = float(lat[0]), float(lon[0])
        self.dlat = float(lat[1] - lat[0])
        self.dlon = float(lon[1] - lon[0])
        self.lat_min, self.lat_max = float(lat.min()), float(lat.max())
        self.rows, self.cols = self.pm.shape

    def sample(self, la, lo):
        """Returns (value, widen_radius). radius 0 = exact cell was valid,
        -1 = nothing valid within MAX_WIDEN, -2 = outside the raster's
        latitude band.

        The -2 case matters: nearest_index CLAMPS, so without this guard an
        Arctic metro would silently receive an edge-row value from a latitude
        it does not occupy. Measured 2026-08-06: exactly one metro in the set
        is affected (Longyearbyen, 78.2N, pop ~2,600) against a raster that
        stops at 69.95N. One wrong value is worse than one absent value.
        """
        np = self.np
        if not (self.lat_min <= la <= self.lat_max):
            return None, -2
        i = nearest_index(self.lat0, self.dlat, self.rows, la)
        j = nearest_index(self.lon0, self.dlon, self.cols, lo)
        v = float(self.pm[i, j])
        if not is_missing(v):
            return round(v, PRECISION), 0
        for r in range(1, MAX_WIDEN + 1):
            i0, i1, j0, j1 = window_bounds(i, j, r, self.rows, self.cols)
            w = self.pm[i0:i1, j0:j1]
            good = w[w > MISSING]
            good = good[good == good]
            if good.size:
                return round(float(np.mean(good)), PRECISION), r
        return None, -1


# --------------------------------------------------------------------------
# self-test
# --------------------------------------------------------------------------
def self_test():
    fails, checks = [], 0

    def check(name, got, want):
        nonlocal checks
        checks += 1
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    # THE -999 TRAP. These are the cases that would have shipped ocean values.
    check("missing -999", is_missing(-999.0), True)
    check("missing -999 int", is_missing(-999), True)
    check("missing below sentinel", is_missing(-1000.0), True)
    check("missing nan", is_missing(float("nan")), True)
    check("missing none", is_missing(None), True)
    check("missing non-numeric", is_missing("x"), True)
    check("valid zero", is_missing(0.0), False)
    check("valid small", is_missing(0.01), False)
    check("valid typical", is_missing(9.57), False)
    check("valid high", is_missing(136.0), False)

    check("idx first", nearest_index(-59.95, 0.1, 1300, -59.95), 0)
    check("idx last", nearest_index(-59.95, 0.1, 1300, 69.95), 1299)
    check("idx clamps low", nearest_index(-59.95, 0.1, 1300, -90.0), 0)
    check("idx clamps high", nearest_index(-59.95, 0.1, 1300, 90.0), 1299)
    check("idx rounds to nearest", nearest_index(0.0, 0.1, 100, 0.16), 2)
    checks += 1
    try:
        nearest_index(0.0, 0.1, 0, 1.0)
        fails.append("idx: empty axis should raise")
    except ValueError:
        pass

    check("window interior", window_bounds(10, 10, 1, 100, 100), (9, 12, 9, 12))
    check("window clamps origin", window_bounds(0, 0, 2, 100, 100), (0, 3, 0, 3))
    check("window clamps edge", window_bounds(99, 99, 2, 100, 100), (97, 100, 97, 100))

    check("coverage full", coverage_ok(4305, 4305), True)
    check("coverage edge", coverage_ok(95, 100, 0.95), True)
    check("coverage below", coverage_ok(94, 100, 0.95), False)
    check("coverage zero", coverage_ok(0, 0), False)

    check("changed vs none", payload_changed(None, {"metros": {"a": 1}}), True)
    check("changed same", payload_changed({"metros": {"a": 1}}, {"metros": {"a": 1}}), False)
    check("changed diff", payload_changed({"metros": {"a": 1}}, {"metros": {"a": 2}}), True)
    check("changed ignores meta",
          payload_changed({"metros": {"a": 1}, "_meta": {"generatedAt": "x"}},
                          {"metros": {"a": 1}, "_meta": {"generatedAt": "y"}}), False)

    check("raster key 2024", raster_key(2024),
          "V6GL03/CoarseResolution/GL/Annual/V6GL03.CNNPM25.0p10.GL.202401-202412.nc")

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"self-test OK ({checks} checks)")
    return 0


def validate(sampler):
    print("=== validation vs independently-sourced references ===")
    bad = 0
    for slug, la, lo, lo_b, hi_b, note in REFERENCES:
        v, r = sampler.sample(la, lo)
        if v is None:
            print(f"  {slug:14s} NO DATA                  {note}")
            bad += 1
            continue
        ok = lo_b <= v <= hi_b
        bad += (not ok)
        print(f"  {slug:14s} {v:7.2f}  band {lo_b}-{hi_b}  "
              f"{'OK' if ok else 'OUT OF BAND'}   {note}")
    print(f"  {len(REFERENCES)-bad}/{len(REFERENCES)} within band")
    return bad


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--year", type=int, default=YEAR)
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    path = ensure_raster(args.year)
    sampler = Sampler(path)
    print(f"raster {path.name}  grid {sampler.rows}x{sampler.cols}")

    if args.validate:
        return 1 if validate(sampler) else 0

    bad = validate(sampler)
    if bad:
        print(f"\nWARNING: {bad} reference metros out of band. "
              f"Inspect before trusting the rank.")

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    values, widened, failed, out_of_band = {}, {}, [], []
    for m in metros:
        la, lo = m.get("lat"), m.get("lon")
        if la is None or lo is None:
            failed.append(m["slug"])
            continue
        v, r = sampler.sample(la, lo)
        if v is None:
            (out_of_band if r == -2 else failed).append(m["slug"])
        else:
            values[m["slug"]] = v
            if r:
                widened[m["slug"]] = r

    print(f"\nresolved {len(values)} / {len(metros)}")
    print(f"  exact cell: {len(values)-len(widened)}   widened: {len(widened)}"
          f"   outside raster latitude band: {len(out_of_band)}"
          f"   otherwise unresolved: {len(failed)}")
    if widened:
        worst = sorted(widened.items(), key=lambda kv: -kv[1])[:6]
        print(f"  widest searches: {worst}")
    if out_of_band:
        print(f"  out of band (deliberately omitted, not clamped): {out_of_band}")
    if failed:
        print(f"  unresolved slugs: {failed[:10]}")

    vals = sorted(values.values())
    n = len(vals)
    print(f"  min {vals[0]}  p25 {vals[n//4]}  median {vals[n//2]}  "
          f"p75 {vals[3*n//4]}  max {vals[-1]}")
    over = sum(1 for v in vals if v > WHO_ANNUAL_GUIDELINE)
    print(f"  above WHO guideline ({WHO_ANNUAL_GUIDELINE}): {over} "
          f"({100.0*over/n:.1f}%)")
    print(f"  distinct values: {len(set(vals))} ({100.0*len(set(vals))/n:.1f}%)")

    if not coverage_ok(len(values), len(metros)):
        print("\nCOVERAGE FLOOR NOT MET. Refusing to write.")
        return 2

    payload = {
        "_meta": {
            "metric": "annual mean PM2.5",
            "unit": "ug/m3",
            "year": args.year,
            "source": f"SatPM2.5 {VERSION} (0.1 deg global, CNN-derived)",
            "citation": CITATION,
            "licence": "CC BY 4.0",
            "sampling": ("nearest grid cell to metro centroid; where that cell "
                         "is the -999 ocean/no-data fill, the mean of the "
                         "nearest valid square neighbourhood"),
            "limitation": ("centroid sample, not area- or population-weighted "
                           "over the metro boundary"),
            "precisionNote": (f"stored to {PRECISION} dp to preserve rank order, "
                              "which 2 dp destroys by manufacturing ties. This is "
                              "the model's grid precision, NOT measurement "
                              "accuracy: round to 1 dp for display."),
            "omitted": ("metros outside the raster latitude band "
                        f"({sampler.lat_min:.2f}..{sampler.lat_max:.2f}) are "
                        "omitted rather than clamped to an edge row"),
            "omittedSlugs": sorted(out_of_band),
            "whoAnnualGuideline": WHO_ANNUAL_GUIDELINE,
            "metrosCovered": len(values),
            "metrosWidened": len(widened),
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "metros": {k: values[k] for k in sorted(values)},
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
        print(f"\nDRY RUN. Would write {OUT.relative_to(ROOT)} "
              f"({len(values)} metros). Pass --write.")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
