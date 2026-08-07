"""Ground Floor: POPULATION-WEIGHTED exposure, replacing the centroid sample.

Rewrites air-quality.json and no2.json in place. The engine
(build_ground_floor.py) and the frontend need no change: same filenames, same
{slug: float} shape, better numbers underneath.

WHY THIS EXISTS
---------------
build_air_quality.py and build_no2.py sample the raster at ONE POINT, the metro
centroid, and both files say so in their own _meta:

    "limitation": "centroid sample, not area- or population-weighted over the
                   metro boundary"

For a metro of a few hundred square kilometres that is harmless: the whole
place sits inside one or two 0.1 degree cells. For Delhi, Los Angeles, Jakarta
or Tokyo it is a real error, and it is worst exactly where the board is read.
A centroid lands wherever the polygon's arithmetic centre happens to fall,
which for a coastal or ring-shaped metro can be water, farmland, or the wrong
side of a pollution gradient. Widening to a neighbourhood mean (what the
existing scripts do on a -999 hit) fixes the missing-value case but not the
representativeness one.

The standard in the exposure literature is population weighting: the exposure
of a PLACE is the average exposure of its PEOPLE, so weight each grid cell by
how many people live in it.

    E = sum(pop_i * conc_i) / sum(pop_i)   over cells i inside the boundary

WHY NOT DO THIS ON HEXAGONS
---------------------------
Because it would be worse, and the reason matters. H3 is an excellent JOIN KEY
and an excellent PRESENTATION grid. It is not an analysis unit here: binning
1 km population and 0.1 degree concentration into hexagons before averaging
adds a resampling step, and every resampling step costs accuracy it cannot
give back. The honest pipeline reads both sources at native resolution and
weights once. Hexagons belong at the publishing end, not in the middle of an
integral.

INPUTS
    public/data/metro-boundaries/<slug>.geojson   (Overture-derived, per metro)
    _to_delete/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif   (~366 MB)
    _to_delete/V6GL03.CNNPM25.0p10.GL.202401-202412.nc
    _to_delete/GlobalNO2_AIT_Annually.nc

The population raster is 30 arcsec (~1 km at the equator), EPSG:4326, persons
per cell, no nodata (absence is 0). GHS-POP R2023A, JRC, CC BY 4.0.

FALLBACK CHAIN, recorded per metro so the reader can audit it
    1. popWeighted  -- cells inside the boundary carrying population
    2. areaMean     -- unweighted mean over cells inside the boundary
                       (boundary exists but GHS-POP finds nobody in it)
    3. centroid     -- the old behaviour (no usable boundary at all)

USAGE
    python scripts/groundfloor/build_exposure.py --self-test
    python scripts/groundfloor/build_exposure.py --dimension pm25 --limit 40
    python scripts/groundfloor/build_exposure.py --dimension both --compare
    python scripts/groundfloor/build_exposure.py --dimension both --compare --write
"""
from __future__ import annotations

import argparse
import bisect
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
GF = DATA / "ground-floor"
METROS = DATA / "metros.json"
BOUNDARIES = DATA / "metro-boundaries"
SCRATCH = ROOT / "_to_delete"

POP_TIF = SCRATCH / "GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif"
POP_EPOCH = "E2025"
POP_CITATION = ("GHS-POP R2023A, epoch 2025, 30 arcsec, Schiavina, Freire and "
                "MacManus, European Commission Joint Research Centre, "
                "doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE. CC BY 4.0.")

PRECISION = 4          # matches the existing builders; see their rationale
COVERAGE_FLOOR = 0.95
MAX_BBOX_DEG = 60.0    # a metro wider than this is a data error, not a metro
# Max distance from a point to the nearest axis value before we call it
# unsampled. Both rasters are nominally 0.1 degree, so 0.15 is 1.5 cells. The
# NO2 axis has dropped-row gaps up to 1.9 degrees and BOTH axis searches clamp,
# so without this a point in a gap inherits a distant value. Same constant and
# same reason as build_no2.py.
MAX_CELL_OFFSET_DEG = 0.15


DIMENSIONS = {
    "pm25": {
        "out": "air-quality.json",
        "raster": SCRATCH / "V6GL03.CNNPM25.0p10.GL.202401-202412.nc",
        "var": "PM25",
        "lat_key": "lat",
        "lon_key": "lon",
        "regular": True,
        "metric": "annual mean PM2.5",
        "unit": "ug/m3",
        "year": 2024,
    },
    "no2": {
        "out": "no2.json",
        "raster": SCRATCH / "GlobalNO2_AIT_Annually.nc",
        "var": "NO2_AiT",
        "lat_key": "latitude",
        "lon_key": "longitude",
        "regular": False,       # THE IRREGULAR AXIS -- see build_no2.py
        "time_index": 18,       # 2023, base year 2005
        "metric": "annual mean NO2",
        "unit": "ug/m3",
        "year": 2023,
    },
}


# --------------------------------------------------------------------------
# pure logic (covered by --self-test; no raster, no network, no filesystem)
# --------------------------------------------------------------------------
def is_missing(v):
    """Both fill conventions at once. PM2.5 uses -999 and never NaN; NO2 uses
    NaN and never -999. A sampler that assumes either alone ranks ocean."""
    if v is None:
        return True
    try:
        f = float(v)
    except (TypeError, ValueError):
        return True
    return f != f or f <= -900.0 or f < 0.0


def weighted_mean(values, weights):
    """Sum(w*v)/Sum(w) over pairs where BOTH are usable and w > 0.

    Returns (mean, weight_used, n_cells) or (None, 0.0, 0). Dropping a cell
    whose concentration is missing is correct: it removes the cell from both
    numerator and denominator rather than scoring it as zero exposure.
    """
    num = 0.0
    den = 0.0
    n = 0
    for v, w in zip(values, weights):
        if w is None or is_missing(v):
            continue
        try:
            fw = float(w)
        except (TypeError, ValueError):
            continue
        if fw != fw or fw <= 0.0:
            continue
        num += fw * float(v)
        den += fw
        n += 1
    if den <= 0.0 or n == 0:
        return None, 0.0, 0
    return num / den, den, n


def plain_mean(values):
    """Unweighted mean over usable values. The areaMean fallback."""
    good = [float(v) for v in values if not is_missing(v)]
    if not good:
        return None, 0
    return sum(good) / len(good), len(good)


def bbox_of(geom):
    """(minx, miny, maxx, maxy) from a GeoJSON Polygon or MultiPolygon."""
    t = geom.get("type")
    if t == "Polygon":
        rings = geom["coordinates"]
    elif t == "MultiPolygon":
        rings = [r for poly in geom["coordinates"] for r in poly]
    else:
        raise ValueError(f"unsupported geometry type {t!r}")
    xs = [c[0] for r in rings for c in r]
    ys = [c[1] for r in rings for c in r]
    if not xs or not ys:
        raise ValueError("empty geometry")
    return min(xs), min(ys), max(xs), max(ys)


def bbox_sane(bbox, limit=MAX_BBOX_DEG):
    """Reject an antimeridian-wrapped or corrupt bbox instead of computing a
    confident number over half the planet. Guards the Fiji/Kiribati case."""
    minx, miny, maxx, maxy = bbox
    if not all(v == v for v in bbox):
        return False
    if maxx <= minx or maxy <= miny:
        return False
    return (maxx - minx) <= limit and (maxy - miny) <= limit


def nearest_index_irregular(axis, value):
    """Nearest index in a sorted-ascending axis, by binary search.

    NOT arithmetic. GlobalNO2_AiT's latitude axis has dropped rows and steps up
    to 1.9 degrees; arithmetic indexing once put London at latitude -28.55.
    See build_no2.py for the full account of that failure.
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


def nearest_index_vec(np, axis, values):
    """Vectorised twin of nearest_index_irregular. --self-test pins them together.

    This function is the one that actually runs, tens of millions of times, so it
    is also the one that can quietly reintroduce the London-at-latitude-minus-28
    bug in a form the existing point-sampler tests would never see. It exists
    separately from ConcGrid so that it can be tested without a raster.
    """
    n = len(axis)
    if n < 1:
        raise ValueError("empty axis")
    if n == 1:
        return np.zeros(len(values), dtype="int64")
    i = np.searchsorted(axis, values)
    i = np.clip(i, 1, n - 1)
    left = values - axis[i - 1]
    right = axis[i] - values
    return np.where(left <= right, i - 1, i).astype("int64")


def pct_change(new, old):
    if old in (None, 0) or new is None:
        return None
    return round(100.0 * (new - old) / old, 2)


# --------------------------------------------------------------------------
# vectorised concentration lookup
# --------------------------------------------------------------------------
class ConcGrid:
    """Nearest-cell lookup over a lat/lon grid, for whole arrays at a time.

    The existing builders sample one point per metro, so a Python-loop sampler
    was fine. Here we sample every populated square kilometre inside every
    metro boundary, which is tens of millions of lookups, so the index
    arithmetic has to be vectorised.
    """

    def __init__(self, cfg):
        import h5py
        import numpy as np
        self.np = np
        self.regular = cfg["regular"]
        with h5py.File(cfg["raster"], "r") as f:
            ds = f[cfg["var"]]
            if "time_index" in cfg:
                self.grid = np.asarray(ds[cfg["time_index"], :, :], dtype="float32")
            else:
                self.grid = np.asarray(ds[:], dtype="float32")
            self.lat = np.asarray(f[cfg["lat_key"]][:], dtype="float64")
            self.lon = np.asarray(f[cfg["lon_key"]][:], dtype="float64")
        self.rows, self.cols = self.grid.shape
        self.lat_min = float(self.lat.min())
        self.lat_max = float(self.lat.max())
        if self.regular:
            self.lat0 = float(self.lat[0])
            self.lon0 = float(self.lon[0])
            self.dlat = float(self.lat[1] - self.lat[0])
            self.dlon = float(self.lon[1] - self.lon[0])
        else:
            steps = np.diff(self.lat)
            self.irregular_span = (float(steps.min()), float(steps.max()))
        # normalise both fill conventions to NaN ONCE, here, so no downstream
        # caller has to remember which raster uses which. See is_missing().
        bad = ~np.isfinite(self.grid) | (self.grid <= -900.0) | (self.grid < 0.0)
        self.grid = self.grid.astype("float32")
        self.grid[bad] = np.nan
        self.valid_fraction = float(np.isfinite(self.grid).mean())

    def _axis_index(self, axis, first, delta, n, values):
        np = self.np
        idx = np.rint((values - first) / delta).astype("int64")
        return np.clip(idx, 0, n - 1)

    def lookup(self, lats, lons):
        """Array of concentrations, NaN where the grid has no value there."""
        np = self.np
        lats = np.asarray(lats, dtype="float64")
        lons = np.asarray(lons, dtype="float64")
        if self.regular:
            i = self._axis_index(self.lat, self.lat0, self.dlat, self.rows, lats)
            j = self._axis_index(self.lon, self.lon0, self.dlon, self.cols, lons)
        else:
            i = nearest_index_vec(np, self.lat, lats)
            j = nearest_index_vec(np, self.lon, lons)
        out = self.grid[i, j].copy()
        # points outside the raster's latitude band are omitted, never clamped
        outside = (lats < self.lat_min) | (lats > self.lat_max)
        # THE DROPPED-ROW GUARD, carried over from build_no2.py. Both axis
        # searches CLAMP, so a point sitting in one of the NO2 raster's dropped
        # row bands (gaps up to 1.9 degrees) would otherwise silently inherit a
        # value measured up to ~0.95 degrees away. Measured on 4,100 random
        # global points: 69 land beyond tolerance. A far cell is not a sample of
        # this place.
        far = ((np.abs(self.lat[i] - lats) > MAX_CELL_OFFSET_DEG)
               | (np.abs(self.lon[j] - lons) > MAX_CELL_OFFSET_DEG))
        drop = outside | far
        if drop.any():
            out[drop] = np.nan
        return out


# --------------------------------------------------------------------------
# geometry + population
# --------------------------------------------------------------------------
def load_geometry(slug):
    """Union-free read of a metro boundary file. Returns a GeoJSON geometry
    dict (Polygon or MultiPolygon) or None. Boundary files are FeatureCollections
    with one feature; multi-feature files are merged into a MultiPolygon."""
    p = BOUNDARIES / f"{slug}.geojson"
    if not p.exists():
        return None
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    geoms = []
    if d.get("type") == "FeatureCollection":
        for f in d.get("features") or []:
            g = f.get("geometry")
            if g:
                geoms.append(g)
    elif d.get("type") == "Feature":
        if d.get("geometry"):
            geoms.append(d["geometry"])
    elif d.get("type") in ("Polygon", "MultiPolygon"):
        geoms.append(d)
    if not geoms:
        return None
    if len(geoms) == 1:
        return geoms[0]
    parts = []
    for g in geoms:
        if g["type"] == "Polygon":
            parts.append(g["coordinates"])
        elif g["type"] == "MultiPolygon":
            parts.extend(g["coordinates"])
    return {"type": "MultiPolygon", "coordinates": parts}


class PopSurface:
    """Windowed reader over the GHS-POP GeoTIFF. Never loads the whole raster:
    at 30 arcsec global that is ~366 MB on disk and 3.7 GB as float64."""

    def __init__(self, path):
        import numpy as np
        import rasterio
        from rasterio import features, windows, transform
        self.np = np
        self.features = features
        self.windows = windows
        self.transform_mod = transform
        self.src = rasterio.open(path)
        self.total = None

    def close(self):
        self.src.close()

    def cells_in(self, geom, bbox):
        """(lats, lons, pops) for every cell whose centre-based mask says it is
        inside `geom` AND that carries population.

        all_touched=True matters: without it a metro smaller than one 1 km cell
        masks to nothing at all, and the site has many of those. With it, such a
        metro gets the single cell it sits in, which is the right answer.
        """
        np = self.np
        minx, miny, maxx, maxy = bbox
        win = self.windows.from_bounds(minx, miny, maxx, maxy,
                                       self.src.transform)
        win = win.round_offsets(op="floor").round_lengths(op="ceil")
        if win.width < 1 or win.height < 1:
            win = self.windows.Window(win.col_off, win.row_off,
                                      max(1, win.width), max(1, win.height))
        pop = self.src.read(1, window=win, boundless=True, fill_value=0.0)
        wt = self.src.window_transform(win)
        mask = self.features.geometry_mask(
            [geom], out_shape=pop.shape, transform=wt,
            invert=True, all_touched=True)
        sel = mask & np.isfinite(pop) & (pop > 0.0)
        if not sel.any():
            # boundary exists but GHS-POP finds nobody: hand back the masked
            # cells with zero weight so the caller can fall back to areaMean
            sel_area = mask
            if not sel_area.any():
                return None
            r, c = np.nonzero(sel_area)
            xs, ys = self.transform_mod.xy(wt, r, c)
            return (np.asarray(ys), np.asarray(xs),
                    np.zeros(len(r), dtype="float64"))
        r, c = np.nonzero(sel)
        xs, ys = self.transform_mod.xy(wt, r, c)
        return np.asarray(ys), np.asarray(xs), pop[sel].astype("float64")


def weighted_mean_np(np, conc, w):
    """Vectorised twin of weighted_mean(). --self-test asserts they agree.

    A pure-Python loop is the readable contract but this runs over tens of
    millions of cells, so the real path has to be numpy. Two implementations
    of one formula is a cost worth paying only because the test pins them
    together; if you change one, change both.
    """
    # the (conc >= 0) term is not redundant. ConcGrid already NaNs out both fill
    # conventions, but the pure twin rejects negatives via is_missing() and these
    # two must agree for any input, not just for input that came from ConcGrid.
    ok = np.isfinite(conc) & (conc >= 0.0) & np.isfinite(w) & (w > 0.0)
    if not ok.any():
        return None, 0.0, 0
    ww = w[ok]
    den = float(ww.sum())
    if den <= 0.0:
        return None, 0.0, 0
    return float((ww * conc[ok]).sum() / den), den, int(ok.sum())


def centroid_value(grid, la, lo, max_widen=8, step=0.1):
    """The old behaviour, kept as the last fallback.

    Widening uses the rasters' nominal 0.1 degree step rather than reaching into
    grid indices, which keeps this correct for the irregular NO2 axis too. It is
    a fallback for a handful of metros, not a hot path.
    """
    np = grid.np
    v = float(grid.lookup([la], [lo])[0])
    if v == v:
        return v, 0
    for r in range(1, max_widen + 1):
        offs = np.arange(-r, r + 1) * step
        las = np.repeat(la + offs, len(offs))
        los = np.tile(lo + offs, len(offs))
        vals = grid.lookup(las, los)
        good = vals[np.isfinite(vals)]
        if good.size:
            return float(good.mean()), r
    return None, -1


def exposure_for_metro(np, grid, pop, slug, la, lo):
    """Returns (value, method, cells, population). Method is one of
    popWeighted / areaMean / centroid / unresolved."""
    geom = load_geometry(slug)
    if geom is not None:
        try:
            bbox = bbox_of(geom)
        except Exception:
            bbox = None
        if bbox is not None and bbox_sane(bbox):
            cells = pop.cells_in(geom, bbox)
            if cells is not None:
                lats, lons, w = cells
                conc = grid.lookup(lats, lons)
                if float(np.nansum(w)) > 0.0:
                    v, den, n = weighted_mean_np(np, conc, w)
                    if v is not None:
                        return round(v, PRECISION), "popWeighted", n, den
                good = conc[np.isfinite(conc)]
                if good.size:
                    return (round(float(good.mean()), PRECISION),
                            "areaMean", int(good.size), 0.0)
    if la is None or lo is None:
        return None, "unresolved", 0, 0.0
    v, r = centroid_value(grid, la, lo)
    if v is None:
        return None, "unresolved", 0, 0.0
    return round(v, PRECISION), "centroid", 1, 0.0


# --------------------------------------------------------------------------
# self-test
# --------------------------------------------------------------------------
def self_test():
    import numpy as np
    fails, checks = [], 0

    def check(name, got, want):
        nonlocal checks
        checks += 1
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    def close(name, got, want, tol=1e-9):
        nonlocal checks
        checks += 1
        if got is None or abs(got - want) > tol:
            fails.append(f"{name}: got {got!r} want ~{want!r}")

    # BOTH fill conventions, the trap both source rasters set differently
    check("missing -999", is_missing(-999.0), True)
    check("missing nan", is_missing(float("nan")), True)
    check("missing negative", is_missing(-0.5), True)
    check("missing none", is_missing(None), True)
    check("missing text", is_missing("x"), True)
    check("valid zero", is_missing(0.0), False)
    check("valid typical", is_missing(9.57), False)

    # weighting: the whole point of this script
    m, d, n = weighted_mean([10.0, 20.0], [1.0, 3.0])
    close("weighted basic", m, 17.5)
    check("weighted den", d, 4.0)
    check("weighted n", n, 2)
    # a populated dirty cell must dominate an empty clean one
    m, _, _ = weighted_mean([100.0, 1.0], [1_000_000.0, 1.0])
    close("weighted dominates", m, (100 * 1_000_000 + 1) / 1_000_001, 1e-6)
    # unweighted mean of the same pair is the WRONG answer, and far off
    a, _ = plain_mean([100.0, 1.0])
    close("plain mean differs", a, 50.5)
    # a missing concentration leaves the denominator too, never scores as zero
    m, d, n = weighted_mean([10.0, float("nan")], [1.0, 99.0])
    close("weighted drops nan cell", m, 10.0)
    check("weighted drops nan den", d, 1.0)
    check("weighted drops nan n", n, 1)
    check("weighted all missing", weighted_mean([float("nan")], [5.0]),
          (None, 0.0, 0))
    check("weighted zero weight", weighted_mean([10.0], [0.0]), (None, 0.0, 0))
    check("weighted empty", weighted_mean([], []), (None, 0.0, 0))
    check("plain all missing", plain_mean([float("nan"), -999.0]), (None, 0))

    # the two implementations of one formula must agree
    rng = np.random.default_rng(11)
    for trial in range(40):
        c = rng.normal(30, 12, 50)
        w = rng.integers(0, 5000, 50).astype("float64")
        c[rng.integers(0, 50, 6)] = np.nan
        pv, pd, pn = weighted_mean(list(c), list(w))
        nv, nd, nn = weighted_mean_np(np, c, w)
        checks += 1
        if pn != nn or (pv is None) != (nv is None) or \
           (pv is not None and abs(pv - nv) > 1e-9):
            fails.append(f"np/pure disagree on trial {trial}: {pv} vs {nv}")
            break

    # bbox
    poly = {"type": "Polygon",
            "coordinates": [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]]}
    check("bbox polygon", bbox_of(poly), (0, 0, 2, 1))
    multi = {"type": "MultiPolygon",
             "coordinates": [[[[0, 0], [1, 0], [1, 1], [0, 0]]],
                             [[[5, 5], [6, 5], [6, 6], [5, 5]]]]}
    check("bbox multipolygon", bbox_of(multi), (0, 0, 6, 6))
    checks += 1
    try:
        bbox_of({"type": "Point", "coordinates": [0, 0]})
        fails.append("bbox: Point should raise")
    except ValueError:
        pass

    # the antimeridian guard
    check("bbox sane normal", bbox_sane((0, 0, 1, 1)), True)
    check("bbox sane wrapped", bbox_sane((-179.9, -18, 179.9, -17)), False)
    check("bbox sane degenerate", bbox_sane((1, 1, 1, 2)), False)
    check("bbox sane nan", bbox_sane((float("nan"), 0, 1, 1)), False)
    check("bbox sane at limit", bbox_sane((0, 0, 60, 1), 60.0), True)
    check("bbox sane over limit", bbox_sane((0, 0, 60.1, 1), 60.0), False)

    # THE IRREGULAR AXIS. These are the cases that put London at -28.55.
    axis = [-59.95, -59.85, -58.0, -57.9, 51.55, 51.65]
    check("irregular exact", nearest_index_irregular(axis, 51.55), 4)
    check("irregular nearer left", nearest_index_irregular(axis, 51.57), 4)
    check("irregular nearer right", nearest_index_irregular(axis, 51.64), 5)
    check("irregular below", nearest_index_irregular(axis, -90.0), 0)
    check("irregular above", nearest_index_irregular(axis, 90.0), 5)
    check("irregular in a gap", nearest_index_irregular(axis, -59.0), 1)
    checks += 1
    try:
        nearest_index_irregular([], 1.0)
        fails.append("irregular: empty axis should raise")
    except ValueError:
        pass

    # THE VECTORISED TWIN OF THE IRREGULAR SEARCH. This is the function that
    # actually runs; the pure one above is only the contract. Testing the pure
    # one alone is how the London-at-minus-28 class of bug gets back in.
    for name, ax in (("dropped rows", axis),
                     ("uniform", [round(-59.95 + 0.1 * k, 4) for k in range(600)]),
                     ("two", [0.0, 5.0]),
                     ("single", [3.0])):
        axn = np.asarray(ax, dtype="float64")
        probe = np.concatenate([
            np.asarray(ax, dtype="float64"),                       # exact hits
            np.asarray(ax, dtype="float64") + 0.049,               # just right
            np.asarray(ax, dtype="float64") - 0.049,               # just left
            rng.uniform(min(ax) - 3, max(ax) + 3, 300),            # anywhere
        ])
        got = nearest_index_vec(np, axn, probe)
        want = np.asarray([nearest_index_irregular(list(ax), float(v))
                           for v in probe])
        checks += 1
        if not (got == want).all():
            k = int(np.argmax(got != want))
            fails.append(f"nearest_index_vec {name}: at {probe[k]} "
                         f"vec {got[k]} pure {want[k]}")
    checks += 1
    try:
        nearest_index_vec(np, np.asarray([]), np.asarray([1.0]))
        fails.append("nearest_index_vec: empty axis should raise")
    except ValueError:
        pass

    check("pct change up", pct_change(11.0, 10.0), 10.0)
    check("pct change down", pct_change(9.0, 10.0), -10.0)
    check("pct change zero base", pct_change(1.0, 0), None)
    check("pct change none", pct_change(None, 10.0), None)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"self-test OK ({checks} checks)")
    return 0


# --------------------------------------------------------------------------
def build_one(key, metros, pop, limit=None, quiet=False):
    import numpy as np
    cfg = DIMENSIONS[key]
    if not cfg["raster"].exists():
        print(f"  MISSING raster {cfg['raster'].name}; run the existing "
              f"build_{'air_quality' if key=='pm25' else 'no2'}.py once to fetch it")
        return None
    grid = ConcGrid(cfg)
    note = ""
    if not cfg["regular"]:
        note = f"  irregular latitude steps {grid.irregular_span}"
    print(f"  {key}: grid {grid.rows}x{grid.cols}, "
          f"{grid.valid_fraction*100:.1f}% valid cells{note}")

    values, methods, cells, pops = {}, {}, {}, {}
    rows = metros[:limit] if limit else metros
    for n, m in enumerate(rows, 1):
        slug = m["slug"]
        v, method, ncell, w = exposure_for_metro(
            np, grid, pop, slug, m.get("lat"), m.get("lon"))
        methods[slug] = method
        if v is not None:
            values[slug] = v
            cells[slug] = ncell
            pops[slug] = round(w, 1)
        if not quiet and n % 500 == 0:
            print(f"    {n}/{len(rows)}")
    tally = {}
    for method in methods.values():
        tally[method] = tally.get(method, 0) + 1
    print(f"  resolved {len(values)}/{len(rows)}   {tally}")
    return {"cfg": cfg, "values": values, "methods": methods,
            "cells": cells, "pops": pops, "tally": tally, "n_input": len(rows)}


def compare(key, res, metros_by_slug, top_n=14):
    """What population weighting actually changes. This is the audit, and it is
    also the only honest basis for saying the rebuild was worth doing."""
    old_path = GF / DIMENSIONS[key]["out"]
    if not old_path.exists():
        print(f"  no existing {old_path.name} to compare against")
        return None
    old = (json.loads(old_path.read_text(encoding="utf-8")).get("metros") or {})
    new = res["values"]
    shared = [s for s in new if s in old and old[s]]
    if not shared:
        return None
    deltas = {s: (new[s] - old[s]) for s in shared}
    absd = sorted(shared, key=lambda s: -abs(deltas[s]))
    moved5 = sum(1 for s in shared if abs(pct_change(new[s], old[s]) or 0) >= 5)
    moved20 = sum(1 for s in shared if abs(pct_change(new[s], old[s]) or 0) >= 20)
    print(f"\n  === {key}: centroid vs population-weighted ({len(shared)} shared) ===")
    print(f"  mean absolute change {sum(abs(deltas[s]) for s in shared)/len(shared):.3f} "
          f"{DIMENSIONS[key]['unit']}   "
          f"moved >=5%: {moved5} ({100*moved5/len(shared):.1f}%)   "
          f">=20%: {moved20} ({100*moved20/len(shared):.1f}%)")
    print(f"  {'metro':26s} {'acc':>5s} {'centroid':>9s} {'popWtd':>9s} "
          f"{'delta':>8s} {'%':>7s} {'method':>12s}")
    # the movers that matter editorially are the ones the board is read for
    ranked = [s for s in absd if (metros_by_slug.get(s, {}).get("rank") or 99999) <= 150]
    for s in (ranked[:top_n] or absd[:top_n]):
        m = metros_by_slug.get(s, {})
        print(f"  {(m.get('name') or s)[:26]:26s} {str(m.get('rank') or '-'):>5s} "
              f"{old[s]:9.2f} {new[s]:9.2f} {deltas[s]:+8.2f} "
              f"{(pct_change(new[s], old[s]) or 0):+6.1f}% "
              f"{res['methods'].get(s,''):>12s}")
    return {"shared": len(shared), "moved5": moved5, "moved20": moved20,
            "meanAbsChange": round(sum(abs(deltas[s]) for s in shared)/len(shared), 4)}


def write_payload(key, res, stats):
    cfg = res["cfg"]
    out = GF / cfg["out"]
    values = res["values"]
    tally = res["tally"]
    payload = {
        "_meta": {
            "metric": cfg["metric"],
            "unit": cfg["unit"],
            "year": cfg["year"],
            "source": ("SatPM2.5 V6GL03 (0.1 deg global, CNN-derived)"
                       if key == "pm25" else
                       "GlobalNO2_AiT (0.1 deg global annual)"),
            "weighting": (
                "POPULATION-WEIGHTED over the metro boundary: sum(pop*conc)/"
                "sum(pop) across every 30 arcsec GHS-POP cell inside the "
                "Overture-derived boundary, concentration read at the native "
                "0.1 degree grid. Replaces the previous single centroid sample."),
            "populationSource": POP_CITATION,
            "populationEpoch": POP_EPOCH,
            "fallbacks": (
                "areaMean = boundary exists but GHS-POP finds no population in "
                "it, so cells are averaged unweighted. centroid = no usable "
                "boundary, previous behaviour. Counts in methodCounts."),
            "methodCounts": tally,
            "limitation": (
                "the concentration grid is 0.1 degree (~11 km), so weighting "
                "redistributes within that grid rather than resolving below it. "
                "PM2.5 is TOTAL mass and includes mineral dust, which penalises "
                "arid metros for geology; see GROUND-FLOOR-SPEC.md."),
            "precisionNote": (
                f"stored to {PRECISION} dp to preserve rank order, which 2 dp "
                "destroys by manufacturing ties. Round to 1 dp for display."),
            "metrosCovered": len(values),
            "comparisonWithCentroid": stats,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "metros": {k: values[k] for k in sorted(values)},
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    print(f"  wrote {out.relative_to(ROOT)} "
          f"({out.stat().st_size/1024:.0f} KB, {len(values)} metros)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dimension", choices=["pm25", "no2", "both"], default="both")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--compare", action="store_true")
    ap.add_argument("--limit", type=int, default=0,
                    help="first N metros only, for a quick shape check")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    if not POP_TIF.exists():
        print(f"MISSING population raster: {POP_TIF}")
        print("fetch with: python _to_delete/fetch_ghspop.py")
        return 2

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    by_slug = {m["slug"]: m for m in metros}
    print(f"metros: {len(metros)}   boundaries on disk: "
          f"{sum(1 for m in metros if (BOUNDARIES / (m['slug']+'.geojson')).exists())}")

    pop = PopSurface(POP_TIF)
    keys = ["pm25", "no2"] if args.dimension == "both" else [args.dimension]
    results, all_stats = {}, {}
    try:
        for key in keys:
            res = build_one(key, metros, pop, limit=args.limit or None)
            if res is None:
                continue
            results[key] = res
            if args.compare or not args.write:
                all_stats[key] = compare(key, res, by_slug)
    finally:
        pop.close()

    if not results:
        return 1

    if args.limit:
        print("\n--limit was set; refusing to write a partial dimension file.")
        return 0

    for key, res in results.items():
        n_in, n_out = res["n_input"], len(res["values"])
        if n_out < COVERAGE_FLOOR * n_in:
            print(f"\n{key}: COVERAGE FLOOR NOT MET ({n_out}/{n_in}). "
                  f"Refusing to write.")
            return 2

    if not args.write:
        print("\nDRY RUN. Pass --write to replace the dimension files.")
        return 0

    for key, res in results.items():
        write_payload(key, res, all_stats.get(key))
    print("\nnow re-run the engine:  "
          "python scripts/groundfloor/build_ground_floor.py --write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
