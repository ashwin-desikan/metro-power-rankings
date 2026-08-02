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
import json, os, sys, time, datetime
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "mktcap"))
import common  # noqa: E402

OUT_DIR = os.path.join(ROOT, "public", "data", "business")
METROS = os.path.join(ROOT, "public", "data", "metros.json")

INDICES = [
    ("^GSPC", "S&P 500", "United States", "New York"),
    ("^DJI", "Dow Jones Industrial", "United States", "New York"),
    ("^IXIC", "Nasdaq Composite", "United States", "New York"),
    ("^FTSE", "FTSE 100", "United Kingdom", "London"),
    ("^GDAXI", "DAX", "Germany", "Frankfurt"),
    ("^FCHI", "CAC 40", "France", "Paris"),
    ("^N225", "Nikkei 225", "Japan", "Tokyo"),
    ("^HSI", "Hang Seng", "Hong Kong", "Hong Kong"),
    ("^BSESN", "Sensex", "India", "Mumbai"),
    ("000001.SS", "Shanghai Composite", "China", "Shanghai"),
    ("^KS11", "KOSPI", "South Korea", "Seoul"),
    ("^GSPTSE", "S&P/TSX Composite", "Canada", "Toronto"),
    ("^BVSP", "Bovespa", "Brazil", "São Paulo"),
]
COMMODITIES = [
    ("GC=F", "Gold", "USD/oz"),
    ("SI=F", "Silver", "USD/oz"),
    ("CL=F", "Crude Oil (WTI)", "USD/bbl"),
    ("BZ=F", "Brent Crude", "USD/bbl"),
    ("HG=F", "Copper", "USD/lb"),
    ("NG=F", "Natural Gas", "USD/MMBtu"),
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

    indices, commodities, missing = [], [], []
    for sym, name, country, metro in INDICES:
        try:
            q = fetch_quote(sym)
        except Exception as e:
            common.log(f"{sym}: {str(e)[:80]}")
            q = None
        if not q:
            missing.append(sym)
            continue
        indices.append({"symbol": sym, "name": name, "country": country,
                        "metro": metro, "metroSlug": metro_slug.get(metro, ""),
                        "value": q[0], "date": q[1]})
        time.sleep(0.4)
    for sym, name, unit in COMMODITIES:
        try:
            q = fetch_quote(sym)
        except Exception as e:
            common.log(f"{sym}: {str(e)[:80]}")
            q = None
        if not q:
            missing.append(sym)
            continue
        commodities.append({"symbol": sym, "name": name, "unit": unit,
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
            "missing": missing,
        },
        "indices": indices,
        "commodities": commodities,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(out, open(os.path.join(OUT_DIR, "markets.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)
    values = {e["symbol"]: e["value"] for e in indices + commodities}
    n = append_history(today, values)
    common.log(f"markets: {len(indices)} indices + {len(commodities)} commodities; history {n} snapshot(s)")


FIXTURE_OK = {"chart": {"result": [{"meta": {"regularMarketPrice": 7489.72,
                                             "regularMarketTime": 1785532932}}]}}
FIXTURE_BAD = {"chart": {"result": [{"meta": {"regularMarketPrice": None}}]}}


def self_test():
    q = extract(FIXTURE_OK)
    assert q and q[0] == 7489.72 and q[1] == "2026-07-31", q
    assert extract(FIXTURE_BAD) is None
    assert extract({"chart": {"result": []}}) is None
    print("self-test: 3/3 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
