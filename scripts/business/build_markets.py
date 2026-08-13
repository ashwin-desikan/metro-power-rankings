#!/usr/bin/env python3
"""build_markets.py - stock indices + commodities for /business/markets.

Pulls latest levels from Yahoo Finance's public chart API (no key; Stooq's CSV
endpoint died behind an anti-bot wall, probed 2026-08-02), ties each index to
its home market's country and metro, and writes
public/data/business/markets.json + append-only markets-history.json (weekly
change is computed on the page from our own history once two snapshots exist).

Any symbol that errors is dropped with a log line and the page degrades
gracefully; the run aborts only if fewer than six indices resolve.
usage: build_markets.py [--self-test]
"""
import json, os, re, sys, time, datetime
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "mktcap"))
import common  # noqa: E402

OUT_DIR = os.path.join(ROOT, "public", "data", "business")
METROS = os.path.join(ROOT, "public", "data", "metros.json")

# The slug is the URL segment for /business/markets/[symbol] AND the primary
# key in Supabase's market_series_meta. Keep the two in step: a slug added here
# without a matching meta row writes nothing, and a meta row without an entry
# here never gets a daily point.
INDICES = [
    ("sp-500", "^GSPC", "S&P 500", "United States", "New York"),
    ("dow-jones", "^DJI", "Dow Jones Industrial", "United States", "New York"),
    ("nasdaq-composite", "^IXIC", "Nasdaq Composite", "United States", "New York"),
    ("ftse-100", "^FTSE", "FTSE 100", "United Kingdom", "London"),
    ("dax", "^GDAXI", "DAX", "Germany", "Frankfurt"),
    ("cac-40", "^FCHI", "CAC 40", "France", "Paris"),
    ("nikkei-225", "^N225", "Nikkei 225", "Japan", "Tokyo"),
    ("hang-seng", "^HSI", "Hang Seng", "Hong Kong", "Hong Kong"),
    ("sensex", "^BSESN", "Sensex", "India", "Mumbai"),
    ("shanghai-composite", "000001.SS", "Shanghai Composite", "China", "Shanghai"),
    ("kospi", "^KS11", "KOSPI", "South Korea", "Seoul"),
    ("sp-tsx-composite", "^GSPTSE", "S&P/TSX Composite", "Canada", "Toronto"),
    ("bovespa", "^BVSP", "Bovespa", "Brazil", "São Paulo"),
]
COMMODITIES = [
    ("gold", "GC=F", "Gold", "USD/oz"),
    ("silver", "SI=F", "Silver", "USD/oz"),
    ("crude-oil-wti", "CL=F", "Crude Oil (WTI)", "USD/bbl"),
    ("brent-crude", "BZ=F", "Brent Crude", "USD/bbl"),
    ("copper", "HG=F", "Copper", "USD/lb"),
    ("natural-gas", "NG=F", "Natural Gas", "USD/MMBtu"),
]
# Kept apart from COMMODITIES rather than folded into it. Bitcoin is the first
# series on this site with no country, no exchange and no metro, which is the
# whole reason it gets its own heading instead of being filed under raw
# materials: the site's organising claim is that markets are places, and this
# one is the exception that has to be labelled as one. It also trades every day
# of the year, so it is the only series here without weekend gaps.
CRYPTO = [
    ("bitcoin", "BTC-USD", "Bitcoin", "USD/BTC"),
]


def extract(raw):
    """Yahoo chart JSON -> (price, iso_date) or None."""
    try:
        meta = raw["chart"]["result"][0]["meta"]
        price = meta["regularMarketPrice"]
        ts = meta.get("regularMarketTime")
        date = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).date().isoformat() if ts else ""
        return (float(price), date) if isinstance(price, (int, float)) else None
    except (KeyError, IndexError, TypeError):
        return None


def fetch_quote(symbol):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{quote(symbol, safe='')}?interval=1d&range=1d")
    return extract(json.loads(common.fetch_url(url, timeout=30).decode("utf-8")))


def append_history(date, values):
    path = os.path.join(OUT_DIR, "markets-history.json")
    try:
        hist = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        hist = {"meta": {"source": "Yahoo Finance chart API"}, "snapshots": []}
    hist["snapshots"] = [s for s in hist["snapshots"] if s["date"] != date]
    hist["snapshots"].append({"date": date, "values": values})
    hist["snapshots"].sort(key=lambda s: s["date"])
    json.dump(hist, open(path, "w", encoding="utf-8"), indent=1)
    return len(hist["snapshots"])


def main(argv):
    if "--self-test" in argv:
        return self_test()
    metro_slug = {m["name"]: m["slug"] for m in json.load(open(METROS, encoding="utf-8"))}

    indices, commodities, crypto, missing = [], [], [], []
    for slug, sym, name, country, metro in INDICES:
        try:
            q = fetch_quote(sym)
        except Exception as e:
            common.log(f"{sym}: {str(e)[:80]}")
            q = None
        if not q:
            missing.append(sym)
            continue
        indices.append({"slug": slug, "symbol": sym, "name": name, "country": country,
                        "metro": metro, "metroSlug": metro_slug.get(metro, ""),
                        "value": q[0], "date": q[1]})
        time.sleep(0.4)
    for bucket, rows in ((commodities, COMMODITIES), (crypto, CRYPTO)):
        for slug, sym, name, unit in rows:
            try:
                q = fetch_quote(sym)
            except Exception as e:
                common.log(f"{sym}: {str(e)[:80]}")
                q = None
            if not q:
                missing.append(sym)
                continue
            bucket.append({"slug": slug, "symbol": sym, "name": name, "unit": unit,
                           "value": q[0], "date": q[1]})
            time.sleep(0.4)

    if len(indices) < 6:
        sys.exit(f"FATAL: only {len(indices)} indices resolved (missing {missing}) - refusing to write")
    if missing:
        common.log(f"symbols dropped: {missing}")

    today = datetime.date.today().isoformat()
    out = {
        "meta": {
            "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "as_of": today, "source": "Yahoo Finance chart API",
            "indices": len(indices), "commodities": len(commodities),
            "crypto": len(crypto),
            "missing": missing,
        },
        "indices": indices,
        "commodities": commodities,
        "crypto": crypto,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(out, open(os.path.join(OUT_DIR, "markets.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)
    values = {e["symbol"]: e["value"] for e in indices + commodities + crypto}
    n = append_history(today, values)
    common.log(f"markets: {len(indices)} indices + {len(commodities)} commodities "
               f"+ {len(crypto)} crypto; history {n} snapshot(s)")

    # Supabase is the system of record for the long history behind
    # /business/markets/[symbol]; the per-slug JSON is the read model the page
    # loads. Each entry's own quote date is used rather than `today`, because a
    # market that has not opened yet still reports yesterday's close and we do
    # not want that filed under the wrong day. Fail-open: see series_store.
    sys.path.insert(0, HERE)
    import series_store
    points = [{"slug": e["slug"], "date": e["date"] or today, "close": e["value"]}
              for e in indices + commodities + crypto]
    series_store.push(points)
    extended = sum(1 for p in points if series_store.extend(p["slug"], p["date"], p["close"]))
    common.log(f"markets-series: {extended} read-model file(s) extended")


FIXTURE_OK = {"chart": {"result": [{"meta": {"regularMarketPrice": 7489.72,
                                             "regularMarketTime": 1785532932}}]}}
FIXTURE_BAD = {"chart": {"result": [{"meta": {"regularMarketPrice": None}}]}}


def self_test():
    q = extract(FIXTURE_OK)
    assert q and q[0] == 7489.72 and q[1] == "2026-07-31", q
    assert extract(FIXTURE_BAD) is None
    assert extract({"chart": {"result": []}}) is None
    # Slugs are URL segments and Supabase primary keys, so they have to be
    # unique, non-empty and URL-safe. A duplicate here would silently overwrite
    # one series with another's closes.
    slugs = [r[0] for r in INDICES] + [r[0] for r in COMMODITIES] + [r[0] for r in CRYPTO]
    assert len(slugs) == len(set(slugs)), "duplicate slug"
    assert all(re.fullmatch(r"[a-z0-9-]+", s) for s in slugs), "slug not URL-safe"
    assert len(slugs) == 20, f"expected 20 series, got {len(slugs)}"
    assert "compare" not in slugs, "`compare` is the overlay route, not a series"
    print("self-test: 7/7 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
