"""Ground Floor dimension 2: annual mean ground-level NO2 per metro.

WHY NO2, SPECIFICALLY
---------------------
PM2.5 is a mixture. Some of it is combustion, some is dust, some is sea salt,
some is wildfire. The WUSTL product is monitor-calibrated so it handles that
honestly, but PM2.5 still partly measures where a metro IS.

NO2 does not. Ground-level NO2 is overwhelmingly combustion-derived: road
traffic, industry, power generation. There is no natural dust or sea-salt
component to confound it. It is close to a direct read on how a metro moves
people and makes power, which is exactly what the Ground Floor is for. It is
also unambiguous in direction, which built-up density is not.

Source: GlobalNO2_AiT, 0.1 degree, annual, 2005-2023, CC BY 4.0, Zenodo
10.5281/zenodo.13842191 (Mu and Tao; ESSD 2026). One 100 MB file for all 19
years. Same 0.1 degree grid as the PM2.5 raster, one year apart.

COLLINEARITY IS THE REAL TEST
-----------------------------
A second dimension only earns its place in a median-of-ranks composite if it
disagrees with the first. If NO2 rank and PM2.5 rank correlate at ~0.95, the
median of the two is just PM2.5 again and we have added cost without adding
information. --validate reports that correlation. Read it before trusting the
combined rank.

FILL VALUE DIFFERS FROM THE PM2.5 RASTER
----------------------------------------
This one uses NaN (69.5% of cells). SatPM2.5 uses -999 with no NaNs at all.
The sampler here tests BOTH, because a shared assumption about fill values is
exactly the kind of thing that silently ranks an ocean cell.

NOTE ON DUPLICATION: this script and build_air_quality.py share a sampling
shape. Deliberately NOT factored into a common module yet -- two examples is
too few to abstract from, and the fill-value difference above is a sign the
right abstraction is not obvious. Factor it when a third raster arrives.

USAGE
    python scripts/groundfloor/build_no2.py --self-test
    python scripts/groundfloor/build_no2.py --validate
    python scripts/groundfloor/build_no2.py            # dry run
    python scripts/groundfloor/build_no2.py --write
"""
from __future__ import annotations

import argparse
import bisect
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
METROS = DATA / "metros.json"
GF = DATA / "ground-floor"
OUT = GF / "no2.json"
RASTER = ROOT / "_to_delete" / "GlobalNO2_AIT_Annually.nc"
URL = "https://zenodo.org/api/records/13842191/files/Annually.nc/content"

VAR = "NO2_AiT"
BASE_YEAR = 2005                # time index 0
YEAR = 2023                     # latest in the file
MAX_WIDEN = 8
COVERAGE_FLOOR = 0.95
PRECISION = 4                   # same reasoning as build_air_quality.py
# Max distance between a metro's coordinate and the nearest axis value before
# we call it unsampled. 0.15 deg = 1.5 cells. Needed because this axis has
# dropped-row gaps of up to 1.9 degrees; see nearest_index().
MAX_CELL_OFFSET_DEG = 0.15

CITATION = ("GlobalNO2_AiT: 0.1 degree annual global ground-level NO2, "
            "Mu and Tao, Earth System Science Data 2026, "
            "Zenodo doi:10.5281/zenodo.13842191. CC BY 4.0.")

# Indicative ranges for well-known metros. NOT verified against a named report
# this session -- treat as an order-of-magnitude sanity band only. The load
# bearing validation here is the RANK SANITY and COLLINEARITY checks below,
# which do not depend on absolute accuracy.
REFERENCES = [
    ("london", 51.5074, -0.1278, 15, 55),
    ("delhi", 28.6139, 77.2090, 25, 80),
    ("beijing", 39.9042, 116.4074, 20, 70),
    ("los-angeles", 34.0522, -118.2437, 15, 55),
    ("reykjavik", 64.1466, -21.9426, 0, 15),
]


# --------------------------------------------------------------------------
# pure logic
# --------------------------------------------------------------------------
def is_missing(v):
    """Handles BOTH fill conventions. The PM2.5 raster uses -999 and no NaN;
    this one uses NaN and no -999. Assuming either alone ranks ocean cells."""
    if v is None:
        return True
    try:
        f = float(v)
    except (TypeError, ValueError):
        return True
    return f != f or f <= -900.0 or f < 0


def nearest_index(axis, value):
    """Nearest index in a SORTED-ASCENDING axis, by binary search.

    NOT arithmetic. This raster's latitude axis is IRREGULARLY SPACED: 1,394
    steps of 0.1 degree plus single jumps of 0.4, 0.6, 0.7 and 1.9 degrees
    where empty southern rows were dropped. The obvious
        idx = round((value - axis[0]) / (axis[1] - axis[0]))
    assumes uniformity and is catastrophically wrong here -- it mapped London
    to latitude -28.55 instead of 51.55, and the coverage floor caught it only
    because 3,333 metros then landed on ocean. Never assume a NetCDF axis is
    uniform; measure it or search it.
    """
    n = len(axis)
    if n < 1:
        raise ValueError("empty axis")
    i = bisect.bisect_left(axis, value)
    if i <= 0:
        return 0
    if i >= n:
        return n - 1
    return i - 1 if (value - axis[i - 1]) <= (axis[i] - value) else i


def within_tolerance(axis_value, value, tol=MAX_CELL_OFFSET_DEG):
    """Guard for irregular axes: a nearest cell that is far away is not a
    sample of this place. Without it, a metro sitting in one of the dropped
    row bands would silently inherit a value up to ~1 degree away."""
    return abs(axis_value - value) <= tol


def window_bounds(i, j, r, n_rows, n_cols):
    return (max(0, i - r), min(n_rows, i + r + 1),
            max(0, j - r), min(n_cols, j + r + 1))


def year_index(year, base=BASE_YEAR, n=19):
    """Index into the time axis. Raises rather than clamping: silently
    returning the wrong year is worse than failing."""
    idx = year - base
    if not (0 <= idx < n):
        raise ValueError(f"year {year} outside {base}..{base+n-1}")
    return idx


def coverage_ok(n_have, n_total, floor=COVERAGE_FLOOR):
    if n_total <= 0:
        return False
    return (n_have / n_total) >= floor


def payload_changed(old, new):
    if not isinstance(old, dict):
        return True
    return old.get("metros") != new.get("metros")


def spearman(a, b):
    """Rank correlation between two slug->value maps, on their shared keys.
    Used for the collinearity test."""
    shared = sorted(set(a) & set(b))
    if len(shared) < 3:
        return None

    def ranks(vals):
        order = sorted(range(len(vals)), key=lambda i: vals[i])
        out = [0.0] * len(vals)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + 1 + j + 1) / 2.0
            for k in range(i, j + 1):
                out[order[k]] = avg
            i = j + 1
        return out

    ra = ranks([a[s] for s in shared])
    rb = ranks([b[s] for s in shared])
    n = len(shared)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    da = sum((x - ma) ** 2 for x in ra) ** 0.5
    db = sum((y - mb) ** 2 for y in rb) ** 0.5
    if da == 0 or db == 0:
        return None
    return round(num / (da * db), 4)


# --------------------------------------------------------------------------
def ensure_raster():
    RASTER.parent.mkdir(parents=True, exist_ok=True)
    if RASTER.exists() and RASTER.stat().st_size > 50_000_000:
        return RASTER
    print(f"downloading ~100 MB from Zenodo ...")
    with urllib.request.urlopen(URL, timeout=900) as r, open(RASTER, "wb") as f:
        total = 0
        while True:
            c = r.read(1 << 20)
            if not c:
                break
            f.write(c)
            total += len(c)
    print(f"  {total/1024/1024:.1f} MB")
    return RASTER


class Sampler:
    def __init__(self, path, year=YEAR):
        import h5py
        import numpy as np
        self.np = np
        with h5py.File(path, "r") as f:
            n_time = f[VAR].shape[0]
            ti = year_index(year, n=n_time)
            self.grid = f[VAR][ti, :, :]
            lat = f["latitude"][:]
            lon = f["longitude"][:]
        self.year = year
        # keep the ACTUAL axis values; this one is not uniformly spaced
        self.lat = [float(x) for x in lat]
        self.lon = [float(x) for x in lon]
        self.lat_min, self.lat_max = self.lat[0], self.lat[-1]
        self.rows, self.cols = self.grid.shape
        gaps = [round(self.lat[k + 1] - self.lat[k], 4)
                for k in range(len(self.lat) - 1)]
        self.irregular = len(set(gaps)) > 1
        if self.irregular:
            print(f"  note: latitude axis is IRREGULAR "
                  f"(steps {min(gaps)}..{max(gaps)}); using binary search")

    def sample(self, la, lo):
        np = self.np
        if not (self.lat_min <= la <= self.lat_max):
            return None, -2
        i = nearest_index(self.lat, la)
        j = nearest_index(self.lon, lo)
        if not (within_tolerance(self.lat[i], la)
                and within_tolerance(self.lon[j], lo)):
            return None, -2
        v = float(self.grid[i, j])
        if not is_missing(v):
            return round(v, PRECISION), 0
        for r in range(1, MAX_WIDEN + 1):
            i0, i1, j0, j1 = window_bounds(i, j, r, self.rows, self.cols)
            w = self.grid[i0:i1, j0:j1]
            good = w[np.isfinite(w)]
            good = good[good >= 0]
            if good.size:
                return round(float(np.mean(good)), PRECISION), r
        return None, -1


# --------------------------------------------------------------------------
def self_test():
    fails, checks = [], 0

    def check(name, got, want):
        nonlocal checks
        checks += 1
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    # BOTH fill conventions
    check("missing nan", is_missing(float("nan")), True)
    check("missing -999", is_missing(-999.0), True)
    check("missing negative", is_missing(-0.5), True)
    check("missing none", is_missing(None), True)
    check("missing text", is_missing("x"), True)
    check("valid zero", is_missing(0.0), False)
    check("valid small", is_missing(0.019), False)
    check("valid high", is_missing(151.5), False)

    check("year idx base", year_index(2005), 0)
    check("year idx latest", year_index(2023), 18)
    check("year idx mid", year_index(2014), 9)
    for bad in (2004, 2024):
        checks += 1
        try:
            year_index(bad)
            fails.append(f"year_index({bad}) should raise")
        except ValueError:
            pass

    # THE IRREGULAR-AXIS BUG. This fixture mirrors the real latitude axis:
    # mostly 0.1 steps with dropped-row jumps at the southern end. Arithmetic
    # indexing sent London to latitude -28.55; binary search does not.
    irregular = [-59.45, -59.05, -58.45, -57.75, -55.85, -55.75, -55.65]
    check("irr first", nearest_index(irregular, -59.45), 0)
    check("irr last", nearest_index(irregular, -55.65), 6)
    check("irr exact mid", nearest_index(irregular, -57.75), 3)
    check("irr across a 1.9deg gap, nearer low",
          nearest_index(irregular, -57.70), 3)
    check("irr across a 1.9deg gap, nearer high",
          nearest_index(irregular, -55.90), 4)
    check("irr below range", nearest_index(irregular, -99.0), 0)
    check("irr above range", nearest_index(irregular, 99.0), 6)
    checks += 1
    try:
        nearest_index([], 1.0)
        fails.append("nearest_index: empty axis should raise")
    except ValueError:
        pass

    uniform = [round(-59.45 + 0.1 * k, 2) for k in range(200)]
    check("uni first", nearest_index(uniform, -59.45), 0)
    check("uni rounds down", nearest_index(uniform, -59.42), 0)
    check("uni rounds up", nearest_index(uniform, -59.36), 1)

    # the tolerance guard that stops a gap being sampled from far away
    check("tol exact", within_tolerance(51.55, 51.5074), True)
    check("tol just inside", within_tolerance(51.55, 51.41), True)
    check("tol outside", within_tolerance(-57.75, -56.80), False)
    check("window interior", window_bounds(5, 5, 1, 50, 50), (4, 7, 4, 7))
    check("window clamps", window_bounds(0, 0, 3, 50, 50), (0, 4, 0, 4))

    check("coverage ok", coverage_ok(100, 100), True)
    check("coverage low", coverage_ok(50, 100), False)
    check("changed", payload_changed(None, {"metros": {}}), True)
    check("unchanged", payload_changed({"metros": {"a": 1}}, {"metros": {"a": 1}}), False)

    check("spearman identical", spearman({"a": 1, "b": 2, "c": 3},
                                         {"a": 1, "b": 2, "c": 3}), 1.0)
    check("spearman inverse", spearman({"a": 1, "b": 2, "c": 3},
                                       {"a": 3, "b": 2, "c": 1}), -1.0)
    check("spearman monotone not linear",
          spearman({"a": 1, "b": 2, "c": 3}, {"a": 1, "b": 100, "c": 10000}), 1.0)
    check("spearman too few", spearman({"a": 1}, {"a": 1}), None)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"self-test OK ({checks} checks)")
    return 0


def validate(sampler):
    print("=== indicative bands (order-of-magnitude sanity only) ===")
    bad = 0
    for slug, la, lo, lo_b, hi_b in REFERENCES:
        v, r = sampler.sample(la, lo)
        if v is None:
            print(f"  {slug:14s} NO DATA")
            bad += 1
            continue
        ok = lo_b <= v <= hi_b
        bad += (not ok)
        print(f"  {slug:14s} {v:8.2f}  band {lo_b}-{hi_b}  "
              f"{'ok' if ok else 'OUT'}")
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

    sampler = Sampler(ensure_raster(), year=args.year)
    print(f"NO2 raster year {args.year}  grid {sampler.rows}x{sampler.cols}  "
          f"lat {sampler.lat_min:.2f}..{sampler.lat_max:.2f}")
    validate(sampler)

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    values, widened, out_of_band, failed = {}, {}, [], []
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
    print(f"  exact: {len(values)-len(widened)}  widened: {len(widened)}  "
          f"out of lat band: {len(out_of_band)}  unresolved: {len(failed)}")
    if failed:
        print(f"  unresolved (likely all-NaN neighbourhood): {failed[:12]}")
    vals = sorted(values.values())
    n = len(vals)
    print(f"  min {vals[0]}  p25 {vals[n//4]}  median {vals[n//2]}  "
          f"p75 {vals[3*n//4]}  max {vals[-1]}")
    print(f"  distinct: {len(set(vals))} ({100.0*len(set(vals))/n:.1f}%)")

    # THE COLLINEARITY TEST -- does this dimension add information?
    pm_path = GF / "air-quality.json"
    if pm_path.exists():
        pm = json.loads(pm_path.read_text(encoding="utf-8")).get("metros") or {}
        rho = spearman(values, pm)
        print(f"\n=== collinearity with PM2.5 ===")
        print(f"  Spearman rank correlation: {rho}")
        if rho is None:
            print("  could not compute")
        elif rho > 0.9:
            print("  >0.9: NO2 is nearly the same ranking as PM2.5. It would add "
                  "cost without information; reconsider including it.")
        elif rho > 0.6:
            print("  0.6-0.9: strongly related but distinct. Adds real signal.")
        else:
            print("  <0.6: substantially independent view. Adds a lot.")

    if not coverage_ok(len(values), len(metros)):
        print("\nCOVERAGE FLOOR NOT MET. Refusing to write.")
        return 2

    payload = {
        "_meta": {
            "metric": "annual mean ground-level NO2",
            "unit": "ug/m3",
            "year": args.year,
            "source": "GlobalNO2_AiT (0.1 deg global, satellite + AI)",
            "citation": CITATION,
            "licence": "CC BY 4.0",
            "why": ("NO2 is overwhelmingly combustion-derived, so unlike PM2.5 "
                    "it carries no natural dust or sea-salt component"),
            "sampling": ("nearest grid cell to metro centroid; NaN cells widen "
                         "to the nearest valid neighbourhood"),
            "limitation": "centroid sample, not area-weighted over the boundary",
            "precisionNote": (f"{PRECISION} dp preserves rank order; this is grid "
                              "precision, not measurement accuracy"),
            "omittedSlugs": sorted(out_of_band + failed),
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
        print(f"\nDRY RUN. Would write {OUT.relative_to(ROOT)} ({len(values)} metros).")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
