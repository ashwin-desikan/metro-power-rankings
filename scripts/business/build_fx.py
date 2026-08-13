#!/usr/bin/env python3
"""build_fx.py - currency layer for /business/currencies.

Fetches USD-base rates from exchangerate-api.com (Ashwin's account; key in
scripts/business/exchangerate_key.txt or env EXCHANGERATE_API_KEY - the key
file is gitignored), joins each currency to the countries that use it (from
public/data/country-facts.json currencyIso + countries.json for names), and
writes public/data/business/fx.json plus an append-only fx-history.json so
week-over-week movement builds itself from our own snapshots.

Free plan: rates refresh daily, 1,500 requests/month - one call per run.
usage: build_fx.py [--self-test]
"""
import json, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "mktcap"))
import common  # noqa: E402

OUT_DIR = os.path.join(ROOT, "public", "data", "business")
FACTS = os.path.join(ROOT, "public", "data", "country-facts.json")
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")

MAJORS = ["EUR", "GBP", "JPY", "CNY", "INR", "CHF", "CAD", "AUD", "KRW", "BRL",
          "MXN", "SGD", "HKD", "SEK", "NOK", "ZAR", "TRY", "PLN", "AED", "SAR"]


def get_key():
    k = os.environ.get("EXCHANGERATE_API_KEY")
    if k:
        return k.strip()
    p = os.path.join(HERE, "exchangerate_key.txt")
    if os.path.exists(p):
        return open(p).read().strip()
    sys.exit("FATAL: no exchangerate-api key (env EXCHANGERATE_API_KEY or scripts/business/exchangerate_key.txt)")


def currency_countries():
    """currencyIso -> [{name, slug}] from country-facts + countries.json names."""
    facts = json.load(open(FACTS, encoding="utf-8"))["countries"]
    names = {c["slug"]: c["name"] for c in json.load(open(COUNTRIES, encoding="utf-8"))}
    by_code = {}
    for slug, f in facts.items():
        code = (f.get("currencyIso") or "").strip().upper()
        if not code:
            continue
        by_code.setdefault(code, []).append({"name": names.get(slug, slug), "slug": slug})
    for code in by_code:
        by_code[code].sort(key=lambda c: c["name"])
    return by_code


def currency_names():
    """currencyIso -> currencyName (first country that declares it)."""
    facts = json.load(open(FACTS, encoding="utf-8"))["countries"]
    out = {}
    for f in facts.values():
        code = (f.get("currencyIso") or "").strip().upper()
        name = (f.get("currencyName") or "").strip()
        if code and name and code not in out:
            out[code] = name
    return out


def build(rates, by_code, cname):
    currencies = []
    for code, rate in sorted(rates.items()):
        if code == "USD" or not isinstance(rate, (int, float)) or rate <= 0:
            continue
        countries = by_code.get(code, [])
        currencies.append({
            "code": code,
            "name": cname.get(code, code),
            "perUsd": rate,           # units of this currency per 1 USD
            "usdPer": 1.0 / rate,     # USD per 1 unit
            "countries": countries[:8],
            "countryCount": len(countries),
        })
    return currencies


def append_history(date, rates):
    path = os.path.join(OUT_DIR, "fx-history.json")
    try:
        hist = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        hist = {"meta": {"base": "USD", "source": "exchangerate-api.com"}, "snapshots": []}
    hist["snapshots"] = [s for s in hist["snapshots"] if s["date"] != date]
    hist["snapshots"].append({"date": date, "rates": rates})
    hist["snapshots"].sort(key=lambda s: s["date"])
    json.dump(hist, open(path, "w", encoding="utf-8"), indent=1)
    return len(hist["snapshots"])


def main(argv):
    if "--self-test" in argv:
        return self_test()
    key = get_key()
    raw = json.loads(common.fetch_url(
        f"https://v6.exchangerate-api.com/v6/{key}/latest/USD").decode("utf-8"))
    if raw.get("result") != "success":
        sys.exit(f"FATAL: API returned {raw.get('result')} ({raw.get('error-type')})")
    rates = raw["conversion_rates"]
    if rates.get("USD") != 1 or not (0.4 < rates.get("EUR", 0) < 2.5):
        sys.exit("FATAL: rates failed sanity (USD/EUR out of band) - refusing to write")

    by_code, cname = currency_countries(), currency_names()
    currencies = build(rates, by_code, cname)
    today = datetime.date.today().isoformat()
    out = {
        "meta": {
            "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "as_of": today,
            "base": "USD",
            "source": "exchangerate-api.com",
            "count": len(currencies),
            "api_update_utc": raw.get("time_last_update_utc", ""),
        },
        "majors": MAJORS,
        "currencies": currencies,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(out, open(os.path.join(OUT_DIR, "fx.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)
    n = append_history(today, rates)
    common.log(f"fx: {len(currencies)} currencies written; history now {n} snapshot(s)")
    update_series(today, rates)


def update_series(today, rates):
    """Extend the per-currency history files behind /business/currencies/[code].

    Seeded by build_fx_series.py from the long-run historical dataset; this
    keeps them current with one row per day. A missing file is skipped, not
    created - seeding (with era clamps and downsampling) is the seeder's job.
    Dedupe-by-date makes same-day reruns safe, mirroring append_history.
    """
    sdir = os.path.join(OUT_DIR, "fx-series")
    gen = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    n = 0
    for code in MAJORS:
        rate = rates.get(code)
        if not isinstance(rate, (int, float)) or rate <= 0:
            continue
        path = os.path.join(sdir, f"{code.lower()}.json")
        try:
            doc = json.load(open(path, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        series = [p for p in doc.get("series", []) if p[0] != today]
        series.append([today, round(float(f"{rate:.6g}"), 12)])
        series.sort()
        doc["series"] = series
        doc["meta"]["end"] = series[-1][0]
        doc["meta"]["points"] = len(series)
        doc["meta"]["generated_at"] = gen
        json.dump(doc, open(path, "w", encoding="utf-8"), separators=(",", ":"))
        n += 1
    common.log(f"fx-series: {n} series extended to {today}")

    # Supabase is the system of record for every daily series, FX included
    # (Ashwin's call 2026-08-13, so the hub does not carry two storage models
    # for the same shape of data). The JSON above stays the read model the
    # currency pages load. Fail-open without a key: see series_store.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import series_store
    series_store.push([
        {"slug": code.lower(), "date": today, "close": float(rates[code])}
        for code in MAJORS
        if isinstance(rates.get(code), (int, float)) and rates[code] > 0
    ])


def self_test():
    rates = {"USD": 1, "EUR": 0.91, "GBP": 0.78, "XXX": -1, "JPY": 155.2}
    by_code = {"EUR": [{"name": "France", "slug": "france"}, {"name": "Germany", "slug": "germany"}],
               "GBP": [{"name": "United Kingdom", "slug": "united-kingdom"}]}
    cname = {"EUR": "Euro", "GBP": "Pound sterling"}
    cur = build(rates, by_code, cname)
    codes = [c["code"] for c in cur]
    assert codes == ["EUR", "GBP", "JPY"], codes  # USD skipped, XXX invalid skipped
    eur = cur[0]
    assert eur["name"] == "Euro" and eur["countryCount"] == 2, eur
    assert abs(eur["usdPer"] - 1 / 0.91) < 1e-9, eur
    assert cur[2]["name"] == "JPY", cur[2]  # no name known -> code
    print("self-test: 4/4 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
