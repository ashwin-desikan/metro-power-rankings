#!/usr/bin/env python3
"""migrate_fx_series.py - one-off: move fx-series/*.json into Supabase.

Ashwin's call on 2026-08-13 was that Supabase becomes the system of record for
every daily series, FX included, so the business hub does not end up with two
storage models for the same shape of data. This is the one-off migration; from
here build_fx.py upserts to the table and re-emits the JSON read model.

Reads the committed public/data/business/fx-series/*.json (which already carry
the long-run history, era-clamped at introductions and redenominations by
build_fx_series.py) and writes them into market_series_meta / market_series_daily
alongside the indices and commodities.

Note the FX series are NOT uniformly daily: monthly to 1970, near-daily after.
That is recorded in each row's source note rather than smoothed over.

usage:
  python scripts/business/migrate_fx_series.py --self-test
  python scripts/business/migrate_fx_series.py --dry
  python scripts/business/migrate_fx_series.py
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from load_market_series import service_key, rest, log, CHUNK  # noqa: E402

SERIES_DIR = os.path.join(ROOT, "public", "data", "business", "fx-series")
FX_JSON = os.path.join(ROOT, "public", "data", "business", "fx.json")
SOURCE = "Long-run historical dataset, extended daily by exchangerate-api snapshots"


def build_rows():
    """-> (meta_rows, daily_rows). Pure, so --self-test can exercise it."""
    fx = json.load(open(FX_JSON, encoding="utf-8"))
    names = {c["code"]: c.get("name") or c["code"] for c in fx.get("currencies", [])}
    order = {code: i for i, code in enumerate(fx.get("majors", []))}

    meta, daily = [], []
    for fn in sorted(os.listdir(SERIES_DIR)):
        if not fn.endswith(".json"):
            continue
        code = fn[:-5].upper()
        d = json.load(open(os.path.join(SERIES_DIR, fn), encoding="utf-8"))
        m, series = d.get("meta", {}), d.get("series", [])
        if not series:
            continue
        note = ("Units of this currency per US dollar. Monthly observations to 1970, "
                "near-daily after, plus the site's own daily snapshots. ")
        if m.get("era_start"):
            note += (f"Series starts at the currency's modern era ({m['era_start']}) rather than "
                     "splicing rebased legacy units onto today's scale.")
        else:
            note += "Series starts at the currency's modern era, not at rebased legacy units."
        meta.append({
            "slug": code.lower(), "kind": "fx", "symbol": code, "name": names.get(code, code),
            "unit": "per USD", "country": None, "metro_slug": None,
            "source": m.get("source") or SOURCE, "source_note": note,
            "sort_order": 300 + order.get(code, 99),
        })
        for date, rate in series:
            daily.append({"slug": code.lower(), "date": date, "close": round(float(rate), 6)})
    return meta, daily


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    meta, daily = build_rows()
    log(f"{len(meta)} currencies, {len(daily):,} observations{' (DRY RUN)' if dry else ''}")
    by = {}
    for r in daily:
        by.setdefault(r["slug"], []).append(r["date"])
    for m in meta:
        ds = sorted(by.get(m["slug"], []))
        log(f"  {m['slug']:5} {m['name'][:34]:34} {ds[0]} .. {ds[-1]}  {len(ds):,}")
    if dry:
        return 0

    key = service_key()
    rest("POST", "/rest/v1/market_series_meta", body=meta, key=key,
         prefer="resolution=merge-duplicates,return=minimal")
    log(f"\nupserted {len(meta)} meta rows")
    for i in range(0, len(daily), CHUNK):
        rest("POST", "/rest/v1/market_series_daily", body=daily[i:i + CHUNK], key=key,
             prefer="resolution=merge-duplicates,return=minimal")
    log(f"upserted {len(daily):,} observations")
    return 0


def self_test():
    meta, daily = build_rows()
    assert len(meta) == 20, f"expected 20 currencies, got {len(meta)}"
    assert all(m["kind"] == "fx" for m in meta)
    assert all(m["slug"] == m["symbol"].lower() for m in meta)
    assert all(m["unit"] == "per USD" for m in meta)
    assert len({m["slug"] for m in meta}) == 20, "duplicate slug"
    assert len(daily) > 60000, f"only {len(daily)} observations"
    assert len({(r["slug"], r["date"]) for r in daily}) == len(daily), "duplicate (slug, date)"
    gbp = [r for r in daily if r["slug"] == "gbp"]
    assert gbp[0]["date"] == "1957-01-31", gbp[0]
    assert 0.3 < gbp[0]["close"] < 0.4, gbp[0]  # sterling was ~$2.80, so ~0.357 per USD
    print(f"self-test: 8/8 PASS ({len(meta)} currencies, {len(daily):,} observations)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
