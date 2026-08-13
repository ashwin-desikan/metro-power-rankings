#!/usr/bin/env python3
"""series_store.py - shared write path for daily series.

Supabase (market_series_daily) is the system of record; the JSON under
public/data/business/ is the read model the pages load. build_markets.py and
build_fx.py both call push() with today's closes and extend() to keep their
read-model files current.

FAIL-OPEN BY DESIGN. Without a service key push() logs loudly and returns 0
rather than aborting the run. The daily job's visible output is markets.json
and fx.json, which readers see with an "as of" date on them; losing a day of
database rows is recoverable by re-running load_market_series.py, whereas
failing the whole job would leave the page stale. Same argument as
REVALIDATE_SECRET being fail-open in the mini runners.

On the mini the key comes from SUPABASE_SERVICE_KEY in mac-mini-jobs/config.env,
which runners/_common.sh exports with `set -a`.
"""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT_DIR = os.path.join(ROOT, "public", "data", "business")
CHUNK = 5000


def _log(m):
    print(m, flush=True)


def _key():
    k = (os.environ.get("SUPABASE_SERVICE_KEY")
         or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if k:
        return k
    for fn in (".env.local", ".env"):
        p = os.path.join(ROOT, fn)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            for name in ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
                if line.strip().startswith(name + "="):
                    return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def push(points):
    """points: [{"slug":..., "date":"YYYY-MM-DD", "close": float}] -> rows written."""
    points = [p for p in points if p.get("slug") and p.get("date")
              and isinstance(p.get("close"), (int, float))]
    if not points:
        return 0
    key = _key()
    if not key:
        _log(f"series_store: NO SUPABASE KEY, skipped {len(points)} rows "
             f"(set SUPABASE_SERVICE_KEY in mac-mini-jobs/config.env). "
             f"Recover with: python scripts/business/load_market_series.py")
        return 0
    sys.path.insert(0, HERE)
    from load_market_series import rest
    n = 0
    for i in range(0, len(points), CHUNK):
        batch = [{"slug": p["slug"], "date": p["date"], "close": round(float(p["close"]), 6)}
                 for p in points[i:i + CHUNK]]
        try:
            rest("POST", "/rest/v1/market_series_daily", body=batch, key=key,
                 prefer="resolution=merge-duplicates,return=minimal")
            n += len(batch)
        except Exception as e:
            _log(f"series_store: upsert failed ({str(e)[:100]}); {len(batch)} rows not written")
    _log(f"series_store: upserted {n} row(s) to market_series_daily")
    return n


def extend(slug, date, value, subdir="markets-series"):
    """Keep one read-model file current. Dedupes by date so a same-day rerun is
    safe. A missing file is skipped rather than created: seeding a full series
    is emit_market_series.py's job, not the daily builder's."""
    path = os.path.join(OUT_DIR, subdir, f"{slug}.json")
    try:
        doc = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return False
    series = [p for p in doc.get("series", []) if p[0] != date]
    series.append([date, round(float(value), 6)])
    series.sort()
    doc["series"] = series
    doc.setdefault("meta", {})
    doc["meta"]["end"] = series[-1][0]
    doc["meta"]["points"] = len(series)
    doc["meta"]["generated_at"] = datetime.datetime.now(
        datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return True


def self_test():
    import tempfile
    assert push([]) == 0
    assert push([{"slug": "x", "date": None, "close": 1}]) == 0
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, "sub"), exist_ok=True)
    p = os.path.join(d, "sub", "t.json")
    # The cpi block powers the Real toggle and is written only by
    # emit_market_series.py. extend() runs every morning, so if it ever stopped
    # round-tripping unknown top-level keys the toggle would quietly vanish from
    # every page the next day. Pin it.
    json.dump({"meta": {}, "series": [["2020-01-01", 1.0]],
               "cpi": {"iso3": "USA", "series": [[2020, 100.0]]},
               "production": {"commodity": "oil", "leaders": []}}, open(p, "w"))
    global OUT_DIR
    keep, OUT_DIR = OUT_DIR, d
    try:
        assert extend("t", "2020-01-02", 2.0, "sub") is True
        doc = json.load(open(p))
        assert doc["series"] == [["2020-01-01", 1.0], ["2020-01-02", 2.0]], doc["series"]
        assert doc["meta"]["points"] == 2 and doc["meta"]["end"] == "2020-01-02"
        extend("t", "2020-01-02", 9.0, "sub")           # same-day rerun
        doc = json.load(open(p))
        assert doc["series"][-1] == ["2020-01-02", 9.0], doc["series"]
        assert len(doc["series"]) == 2, "same-day rerun must not duplicate"
        assert doc.get("cpi", {}).get("iso3") == "USA", (
            "extend() dropped the cpi block; the daily job would silently remove "
            "the Real toggle from every markets page")
        assert doc.get("production", {}).get("commodity") == "oil", (
            "extend() dropped the production block; the daily job would silently "
            "remove the where-it-comes-from section")
        assert extend("missing", "2020-01-02", 1.0, "sub") is False
    finally:
        OUT_DIR = keep
    print("series_store self-test: 8/8 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(self_test())
