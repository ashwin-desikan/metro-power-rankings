#!/usr/bin/env python3
"""
build-country-indicators.py  (v2)

Pulls a compact spine of country-level development indicators and emits a
namespaced, additive JSON keyed by the site's country slug.

Sources (all CC BY): World Bank Open Data API, and Our World in Data grapher
CSVs (which re-publish UNDP HDI, UN World Population Prospects median age, and
V-Dem rule of law). Every series joins on ISO3.

ADDITIVE ONLY. Never touches countries.json. Workbook stays ground truth for
population, area, coordinates, continent.

USAGE:
    python3 build-country-indicators.py
    python3 build-country-indicators.py --dry-run
    python3 build-country-indicators.py --out path.json
"""
import json, sys, time, argparse, urllib.request, urllib.error, unicodedata, os, csv, io

WB_API = "https://api.worldbank.org/v2"
OWID = "https://ourworldindata.org/grapher"

# World Bank indicators (one API call each; mrnev=1 => latest non-empty value).
WB_INDICATORS = {
    "gdpUsd":            ("NY.GDP.MKTP.CD",      "GDP (current US$)"),
    "gdpPerCapitaUsd":   ("NY.GDP.PCAP.CD",      "GDP per capita (current US$)"),
    "gdpPerCapitaPpp":   ("NY.GDP.PCAP.PP.CD",   "GDP per capita, PPP (current intl $)"),
    "gniPerCapitaAtlas": ("NY.GNP.PCAP.CD",      "GNI per capita, Atlas method (current US$)"),
    "urbanPopPct":       ("SP.URB.TOTL.IN.ZS",   "Urban population (% of total)"),
    "popDensity":        ("EN.POP.DNST",         "Population density (per sq km)"),
    "lifeExpectancy":    ("SP.DYN.LE00.IN",      "Life expectancy at birth (years)"),
    "giniIndex":         ("SI.POV.GINI",         "Gini index"),
    "internetPct":       ("IT.NET.USER.ZS",      "Individuals using the internet (% of pop)"),
    "inflationPct":      ("FP.CPI.TOTL.ZG",      "Inflation, consumer prices (annual %)"),
    "popGrowthPct":      ("SP.POP.GROW",         "Population growth (annual %)"),
    "migrantStockPct":   ("SM.POP.TOTL.ZS",      "International migrant stock (% of pop)"),
}

# Our World in Data grapher series: (slug, short-name value column, label).
# Latest non-empty year per ISO3. For median age the medium-variant projection
# column is ignored; the estimates column is blank for future years anyway.
OWID_SERIES = {
    "hdi":       ("human-development-index", "hdi__sex_total", "Human Development Index (UNDP)"),
    "medianAge": ("median-age", "median_age__sex_all__age_all__variant_estimates", "Median age (UN WPP)"),
    "ruleOfLaw": ("rule-of-law-index", "rule_of_law_vdem__estimate_best", "Rule of Law index 0-1 (V-Dem)"),
}

OVERRIDES = {
    "United States": "USA", "South Korea": "KOR", "North Korea": "PRK", "Russia": "RUS",
    "Iran": "IRN", "Syria": "SYR", "Vietnam": "VNM", "Laos": "LAO", "Bolivia": "BOL",
    "Venezuela": "VEN", "Tanzania": "TZA", "Moldova": "MDA", "Brunei": "BRN", "Czechia": "CZE",
    "Czech Republic": "CZE", "Turkey": "TUR", "Cape Verde": "CPV", "Ivory Coast": "CIV",
    "DR Congo": "COD", "Congo DR": "COD", "Republic of the Congo": "COG", "Swaziland": "SWZ",
    "Macedonia": "MKD", "Burma": "MMR", "East Timor": "TLS", "Palestine": "PSE", "Hong Kong": "HKG",
    "Macau": "MAC", "Taiwan": "TWN", "Kosovo": "XKX", "Vatican City": "VAT", "The Gambia": "GMB",
    "Bosnia-Herzegovina": "BIH", "St. Kitts & Nevis": "KNA", "Trinidad & Tobago": "TTO",
    "Antigua & Barbuda": "ATG", "St. Vincent & the Grenadines": "VCT", "São Tomé and Príncipe": "STP",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    for ch in ".,&'-":
        s = s.replace(ch, " ")
    return " ".join(s.split())


def fetch_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "metro-rankings-etl/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, json.JSONDecodeError):
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def fetch_text(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "metro-rankings-etl/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8")
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def fetch_country_universe():
    """World Bank country endpoint: ISO3 set + income classification + capital city."""
    out = {}
    data = fetch_json(f"{WB_API}/country?format=json&per_page=400")
    for c in data[1]:
        if c.get("region", {}).get("id") == "NA":  # NA region == aggregate, skip
            continue
        out[c["id"]] = {
            "name": c["name"], "iso2": c["iso2Code"],
            "incomeLevel": c["incomeLevel"]["value"], "incomeLevelId": c["incomeLevel"]["id"],
            "region": c["region"]["value"], "capitalCity": c["capitalCity"] or None,
        }
    return out


def fetch_indicator(code):
    """World Bank: most-recent-non-empty value per country. {iso3: (value, year)}."""
    out = {}
    page = 1
    while True:
        url = f"{WB_API}/country/all/indicator/{code}?format=json&mrnev=1&per_page=300&page={page}"
        data = fetch_json(url)
        meta, rows = data[0], (data[1] or [])
        for row in rows:
            iso3 = row.get("countryiso3code")
            if iso3 and row.get("value") is not None:
                out[iso3] = (row["value"], row["date"])
        if page >= meta["pages"]:
            break
        page += 1
    return out


def fetch_owid(slug, value_col):
    """Our World in Data grapher CSV: latest non-empty year per ISO3. {iso3: (value, year)}."""
    text = fetch_text(f"{OWID}/{slug}.csv?csvType=full&useColumnShortNames=true")
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        code = (row.get("code") or "").strip()
        if len(code) != 3 or not code.isalpha():
            continue
        val = (row.get(value_col) or "").strip()
        if val == "":
            continue
        try:
            year = int(float(row.get("year")))
            fval = float(val)
        except (TypeError, ValueError):
            continue
        if code not in out or year > out[code][1]:
            out[code] = (fval, year)
    return {k: (v[0], str(v[1])) for k, v in out.items()}


def build_name_to_iso3(universe):
    try:
        import pycountry
    except ImportError:
        pycountry = None
    wb_by_norm = {norm(v["name"]): iso for iso, v in universe.items()}

    def resolve(name):
        if name in OVERRIDES:
            return OVERRIDES[name]
        if norm(name) in wb_by_norm:
            return wb_by_norm[norm(name)]
        if pycountry:
            try:
                return pycountry.countries.lookup(name).alpha_3
            except LookupError:
                pass
        return None

    return resolve


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries", default="public/data/countries.json")
    ap.add_argument("--out", default="public/data/country-indicators.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    countries = json.load(open(args.countries, encoding="utf-8"))
    print(f"[1/4] loaded {len(countries)} country records")

    universe = fetch_country_universe()
    print(f"[2/4] World Bank universe: {len(universe)} territories (+income +capital)")

    series, labels = {}, {}
    for key, (code, label) in WB_INDICATORS.items():
        series[key] = fetch_indicator(code)
        labels[key] = ("World Bank", code, label)
        print(f"       WB   {code:<20} {len(series[key])} obs")
    for key, (slug, col, label) in OWID_SERIES.items():
        series[key] = fetch_owid(slug, col)
        labels[key] = ("Our World in Data", slug, label)
        print(f"       OWID {slug:<26} {len(series[key])} obs")

    resolve = build_name_to_iso3(universe)
    out, matched, unmatched = {}, 0, 0
    for c in countries:
        iso3 = resolve(c["name"])
        if not iso3 or iso3 not in universe:
            unmatched += 1
            continue
        u = universe[iso3]
        block = {
            "iso3": iso3, "iso2": u["iso2"], "incomeLevel": u["incomeLevel"],
            "incomeLevelId": u["incomeLevelId"], "wbCapital": u["capitalCity"], "indicators": {},
        }
        for key in series:
            if iso3 in series[key]:
                val, yr = series[key][iso3]
                block["indicators"][key] = {"value": round(val, 4), "year": yr}
        out[c["slug"]] = block
        matched += 1
    print(f"[3/4] matched {matched}/{len(countries)} records ({unmatched} unmatched)")

    payload = {
        "_meta": {
            "sources": [
                "World Bank Open Data (api.worldbank.org)",
                "Our World in Data grapher (UNDP HDI, UN WPP median age, V-Dem rule of law)",
            ],
            "license": "CC BY 4.0",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "method": "World Bank mrnev=1; OWID latest non-empty year per country",
            "indicators": {
                k: {"source": labels[k][0], "ref": labels[k][1], "label": labels[k][2]}
                for k in labels
            },
        },
        "countries": out,
    }

    if args.dry_run:
        s = next(iter(out), None)
        print("\n--- dry run, sample record ---")
        print(json.dumps({s: out[s]} if s else {}, indent=2)[:1500])
        return
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[4/4] wrote {args.out}")


if __name__ == "__main__":
    main()
