#!/usr/bin/env python3
"""emit_market_series.py - build the JSON read model from Supabase.

Supabase is the system of record for daily series; the JSON under
public/data/business/ is the read model the pages actually load. That split is
the house pattern (60+ builders do it) and it keeps page rendering keyless,
fast and free of a runtime database dependency.

Emits:
  markets-series/{slug}.json   one per index and commodity, full daily history,
                               same shape as fx-series so one chart component
                               serves both
  markets-overlay.json         every series at MONTH-END resolution for the
                               rebased comparison view. A 141-year daily chart
                               cannot render 38,000 points meaningfully and the
                               overlay only needs shape, so month-end keeps the
                               file small enough to load on one page.

FX keeps writing fx-series/{code}.json from build_fx.py, so this does not
rewrite those; it only includes FX in the overlay.

usage:
  python scripts/business/emit_market_series.py --self-test
  python scripts/business/emit_market_series.py
  python scripts/business/emit_market_series.py --only sp-500
"""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from load_market_series import service_key, rest, log  # noqa: E402

OUT_DIR = os.path.join(ROOT, "public", "data", "business")
SERIES_DIR = os.path.join(OUT_DIR, "markets-series")
PAGE = 1000


def fetch_series(slug, key):
    """All daily rows for one slug. PostgREST caps a response at 1000 rows, so
    this pages until short."""
    out, off = [], 0
    while True:
        rows = rest("GET", f"/rest/v1/market_series_daily?select=date,close&slug=eq.{slug}"
                            f"&order=date.asc&limit={PAGE}&offset={off}", key=key)
        out += [(r["date"], float(r["close"])) for r in rows]
        if len(rows) < PAGE:
            return out
        off += PAGE


def _now():
    """lib/business.ts `load()` picks the GH-raw copy over the build-time one by
    comparing meta.generated_at, so every emitted file has to carry it or the
    daily append never surfaces without a build."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def month_end(series):
    """Last observation in each calendar month, plus the very last point so the
    overlay always ends on today rather than last month."""
    by = {}
    for d, v in series:
        by[d[:7]] = (d, v)
    out = [by[k] for k in sorted(by)]
    if series and out and out[-1][0] != series[-1][0]:
        out.append(series[-1])
    return out


def overlay_from_files():
    """Rebuild ONLY markets-overlay.json, from the local read-model JSON rather
    than from Supabase. The daily job needs the overlay's trailing point to move
    every day, and re-reading 277k rows through PostgREST's 1000-row pages would
    be ~280 requests for a file that changes by one point. The read models are
    already current by the time this runs, so this is a second's work."""
    out = []
    for sub, is_fx in (("markets-series", False), ("fx-series", True)):
        d = os.path.join(OUT_DIR, sub)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".json"):
                continue
            doc = json.load(open(os.path.join(d, fn), encoding="utf-8"))
            ser = [(p[0], float(p[1])) for p in doc.get("series", [])]
            if not ser:
                continue
            m = doc.get("meta", {})
            me = month_end(ser)
            out.append({
                "slug": m.get("slug") or fn[:-5],
                "kind": "fx" if is_fx else m.get("kind", "index"),
                "name": m.get("name") or m.get("code") or fn[:-5].upper(),
                "unit": m.get("unit") or ("per USD" if is_fx else None),
                "start": me[0][0], "series": me,
            })
    out.sort(key=lambda s: (s["kind"], s["slug"]))
    path = os.path.join(OUT_DIR, "markets-overlay.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"meta": {"generated_at": _now(), "series": len(out),
                            "note": "Month-end observations. Rebase client-side."},
                   "series": out}, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    pts = sum(len(s["series"]) for s in out)
    log(f"markets-overlay.json: {len(out)} series, {pts:,} month-end points, "
        f"{os.path.getsize(path)/1024:.0f} KB (rebuilt from read-model files)")
    return 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    if "--overlay-only" in argv:
        return overlay_from_files()
    only = argv[argv.index("--only") + 1] if "--only" in argv else None

    key = service_key()
    meta = rest("GET", "/rest/v1/market_series_meta?select=*&order=sort_order", key=key)
    if only:
        meta = [m for m in meta if m["slug"] == only]
    os.makedirs(SERIES_DIR, exist_ok=True)

    overlay, written = [], 0
    for m in meta:
        ser = fetch_series(m["slug"], key)
        if not ser:
            log(f"  {m['slug']:20} EMPTY, skipped")
            continue
        payload = {
            "meta": {
                "generated_at": _now(),
                "slug": m["slug"], "kind": m["kind"], "symbol": m["symbol"],
                "name": m["name"], "unit": m["unit"], "country": m["country"],
                "metroSlug": m["metro_slug"], "source": m["source"],
                "sourceNote": m["source_note"],
                "start": ser[0][0], "end": ser[-1][0], "points": len(ser),
            },
            "series": [[d, v] for d, v in ser],
        }
        # FX read models are owned by build_fx.py; do not rewrite them here.
        if m["kind"] != "fx":
            path = os.path.join(SERIES_DIR, f"{m['slug']}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
                f.write("\n")
            written += 1
        me = month_end(ser)
        overlay.append({"slug": m["slug"], "kind": m["kind"], "name": m["name"],
                        "unit": m["unit"], "start": me[0][0], "series": me})
        log(f"  {m['slug']:20} {ser[0][0]} .. {ser[-1][0]}  {len(ser):,} daily -> {len(me):,} month-end")

    with open(os.path.join(OUT_DIR, "markets-overlay.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {"generated_at": _now(), "series": len(overlay),
                            "note": "Month-end observations. Rebase client-side."},
                   "series": overlay}, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    pts = sum(len(s["series"]) for s in overlay)
    log(f"\nwrote {written} markets-series files")
    log(f"wrote markets-overlay.json: {len(overlay)} series, {pts:,} month-end points, "
        f"{os.path.getsize(os.path.join(OUT_DIR, 'markets-overlay.json'))/1024:.0f} KB")
    return 0


def self_test():
    s = [("2020-01-02", 1.0), ("2020-01-31", 2.0), ("2020-02-03", 3.0), ("2020-02-28", 4.0)]
    assert month_end(s) == [("2020-01-31", 2.0), ("2020-02-28", 4.0)], month_end(s)
    # the trailing partial month must survive as its own point
    s2 = s + [("2020-03-05", 5.0)]
    assert month_end(s2)[-1] == ("2020-03-05", 5.0), month_end(s2)
    assert month_end([]) == []
    one = [("2021-06-15", 7.0)]
    assert month_end(one) == [("2021-06-15", 7.0)], month_end(one)
    print("self-test: 4/4 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
