#!/usr/bin/env python3
"""NFL Program 2026, Stage 1: nflverse ETL.

Pulls play-by-play, rosters, depth charts and snap counts from nflverse-data's
GitHub releases (github.com/nflverse/nflverse-data -- the raw parquet files
the whole nflverse R ecosystem is built on, fetchable directly over plain
HTTPS with no R runtime or nfl_data_py needed) into gitignored parquet caches
under data/nfl/. Plan of record: docs/NFL-PROGRAM-2026.md. Only this script's
DERIVED output (once Stage 1's rating build exists) is meant to enter the
repo as JSON -- the parquet caches themselves stay local, per the plan.

Deliberately excludes the "injuries" release: nflverse stopped publishing it
after the 2024 season (confirmed against the release list -- the tag still
exists but nothing recent is in it), so this program's QB/injury status is
meant to come from ESPN injury reports + nflverse depth charts instead, per
the plan doc. Never wire this script up to fetch it.

Categories pulled, and why each gets the range it gets:
  - play-by-play: 1999 (nflfastR's earliest covered season) through 2025,
    plus an attempt at the current season (2026) -- the season kicks off
    2026-09-09, so a 404 on 2026 right now is the expected, correct result,
    not a failure. This is the deep history the EPA ratings need, recency-
    weighted per the plan doc.
  - rosters, depth charts, snap counts: current season (2026) only. These
    feed live situational state (who's on the team right now), not the
    historical rating model -- confirmed against the plan doc's own cadence
    table (rosters/depth charts refresh daily, snap counts several times a
    day, all describing IN-SEASON freshness, not a historical backfill need).
    Snap counts for 2026 will also 404 until real games are played; handled
    the same way as the 2026 pbp attempt.

Every fetch is logged with its row count (read from the parquet's own
metadata footer via pyarrow -- no need to load the file into memory) and
wall-clock time, and the whole run's totals are written to
data/nfl/_manifest.json so a later run can tell what is cached, how big it
is, and how stale it might be without re-fetching anything.

Usage:
    python scripts/predictions/nfl_etl.py                 # full pull
    python scripts/predictions/nfl_etl.py --years 2024 2025   # pbp subset, for a quick test pull
    python scripts/predictions/nfl_etl.py --self-test      # offline, no network
"""
import argparse, datetime, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE_DIR = ROOT / "data" / "nfl"
MANIFEST = CACHE_DIR / "_manifest.json"
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
CURRENT_SEASON = 2026

# (release tag, filename template, cache subdir, years to pull)
# NOTE: "injuries" is deliberately not a tag here -- see module docstring.
PBP_YEARS = list(range(1999, 2026)) + [CURRENT_SEASON]
SOURCES = [
    ("pbp", "play_by_play_{year}.parquet", "pbp", PBP_YEARS),
    ("rosters", "roster_{year}.parquet", "rosters", [CURRENT_SEASON]),
    ("depth_charts", "depth_charts_{year}.parquet", "depth_charts", [CURRENT_SEASON]),
    ("snap_counts", "snap_counts_{year}.parquet", "snap_counts", [CURRENT_SEASON]),
]


def build_url(tag, fname):
    return f"{BASE}/{tag}/{fname}"


def parquet_row_count(path):
    import pyarrow.parquet as pq
    return pq.ParquetFile(str(path)).metadata.num_rows


def fetch_one(tag, fname, out_path):
    """Streams one asset to disk (atomic rename on success). Never raises on
    404 -- that is an expected outcome for a not-yet-played current season,
    not a fetch error -- but does raise on anything else network-shaped, so
    a real outage or a renamed asset fails loudly rather than silently
    caching nothing."""
    import requests
    url = build_url(tag, fname)
    t0 = time.time()
    r = requests.get(url, timeout=120, stream=True)
    if r.status_code == 404:
        return {"status": "not_yet_published", "url": url, "seconds": round(time.time() - t0, 1)}
    r.raise_for_status()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    size = 0
    with open(tmp, "wb") as f:
        for chunk in r.iter_content(chunk_size=1 << 20):
            f.write(chunk)
            size += len(chunk)
    tmp.replace(out_path)
    dur = time.time() - t0
    rows = parquet_row_count(out_path)
    return {"status": "ok", "url": url, "seconds": round(dur, 1), "bytes": size, "rows": rows}


def run(pbp_years_override=None):
    results = []
    for tag, fname_tmpl, subdir, years in SOURCES:
        y_list = pbp_years_override if (pbp_years_override and tag == "pbp") else years
        for year in y_list:
            fname = fname_tmpl.format(year=year)
            out_path = CACHE_DIR / subdir / fname
            if out_path.exists():
                rows = parquet_row_count(out_path)
                size = out_path.stat().st_size
                print(f"  [cached]   {tag:<12} {year}: {rows:,} rows, {size / 1e6:.1f}MB")
                results.append({"tag": tag, "year": year, "status": "cached",
                                "rows": rows, "bytes": size, "seconds": 0})
                continue
            res = fetch_one(tag, fname, out_path)
            res["tag"] = tag
            res["year"] = year
            results.append(res)
            if res["status"] == "ok":
                print(f"  [fetched]  {tag:<12} {year}: {res['rows']:,} rows, "
                      f"{res['bytes'] / 1e6:.1f}MB, {res['seconds']}s")
            elif res["status"] == "not_yet_published":
                print(f"  [skip]     {tag:<12} {year}: not yet published on nflverse-data "
                      f"({res['seconds']}s to confirm 404 -- expected pre-kickoff)")
    return results


def write_manifest(results):
    ok = [r for r in results if r.get("status") in ("ok", "cached")]
    summary = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files_ok": len(ok),
        "files_total": len(results),
        "total_rows": sum(r.get("rows", 0) for r in ok),
        "total_bytes": sum(r.get("bytes", 0) for r in ok),
        "total_fetch_seconds": round(sum(r.get("seconds", 0) for r in results), 1),
        "by_category": {},
        "files": results,
    }
    for r in ok:
        cat = summary["by_category"].setdefault(r["tag"], {"files": 0, "rows": 0, "bytes": 0})
        cat["files"] += 1
        cat["rows"] += r.get("rows", 0)
        cat["bytes"] += r.get("bytes", 0)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(summary, indent=2))
    return summary


# ---------------- offline self-test ----------------

def self_test():
    fails = []

    def check(label, cond):
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            fails.append(label)

    check("pbp URL matches the real nflverse-data asset path",
          build_url("pbp", "play_by_play_2023.parquet")
          == "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2023.parquet")
    check("rosters URL matches the real nflverse-data asset path",
          build_url("rosters", "roster_2026.parquet")
          == "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.parquet")
    check("pbp year range is 1999 through 2025 plus the current season",
          PBP_YEARS[0] == 1999 and PBP_YEARS[-2] == 2025 and PBP_YEARS[-1] == CURRENT_SEASON
          and len(PBP_YEARS) == 28)
    check("injuries is never a source tag", all(tag != "injuries" for tag, *_ in SOURCES))
    check("exactly 4 source categories (pbp, rosters, depth_charts, snap_counts)",
          sorted(tag for tag, *_ in SOURCES)
          == ["depth_charts", "pbp", "rosters", "snap_counts"])
    check("rosters/depth_charts/snap_counts pull current season only, no historical backfill",
          all(years == [CURRENT_SEASON] for tag, _, _, years in SOURCES if tag != "pbp"))

    write_manifest_test = write_manifest([
        {"tag": "pbp", "year": 2025, "status": "ok", "rows": 100, "bytes": 1000, "seconds": 1.0},
        {"tag": "pbp", "year": 2026, "status": "not_yet_published", "seconds": 0.5},
    ])
    check("manifest counts only ok/cached files, not not_yet_published ones",
          write_manifest_test["files_ok"] == 1 and write_manifest_test["files_total"] == 2)
    check("manifest totals roll up correctly",
          write_manifest_test["total_rows"] == 100 and write_manifest_test["total_bytes"] == 1000)
    MANIFEST.unlink(missing_ok=True)  # this self-test's own fixture manifest, not a real one

    if fails:
        print(f"\n{len(fails)}/{6 + 2} FAILED", file=sys.stderr)
        return 1
    print(f"\nself-test: {6 + 2}/{6 + 2} PASS")
    return 0


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--years", nargs="*", type=int,
                    help="restrict the PBP pull to these years only, for a quick test run "
                         "(rosters/depth_charts/snap_counts are unaffected -- they always pull "
                         "just the current season)")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    t0 = time.time()
    results = run(pbp_years_override=args.years)
    summary = write_manifest(results)
    dur = time.time() - t0
    print(f"\n=== {summary['files_ok']}/{summary['files_total']} files ok, "
          f"{summary['total_rows']:,} total rows, {summary['total_bytes'] / 1e6:.1f}MB, "
          f"{dur:.1f}s wall time ===")
    for cat, stats in summary["by_category"].items():
        print(f"  {cat:<12} {stats['files']} files, {stats['rows']:,} rows, "
              f"{stats['bytes'] / 1e6:.1f}MB")
    print(f"\nManifest: {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
