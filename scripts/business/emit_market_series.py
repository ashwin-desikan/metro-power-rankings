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

# Country name in market_series_meta -> World Bank ISO3, so the pages can offer
# a real-terms view. Commodities are quoted in US dollars, so a commodity
# deflates by the US CPI regardless of where it comes out of the ground. FX is
# a ratio between two currencies and has no single deflator (the real thing
# there is a real effective exchange rate, a different dataset), so currencies
# get no CPI block and the toggle hides itself for them.
CPI_ISO3 = {
    "United States": "USA", "United Kingdom": "GBR", "Germany": "DEU",
    "France": "FRA", "Japan": "JPN", "Hong Kong": "HKG", "India": "IND",
    "China": "CHN", "South Korea": "KOR", "Canada": "CAN", "Brazil": "BRA",
}


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


def cpi_iso3(m):
    """ISO3 whose CPI deflates this series, or None if the idea does not apply."""
    if m["kind"] == "fx":
        return None
    # Commodities and bitcoin are quoted in US dollars and have no country of
    # their own, so the US CPI is the right and only deflator for both.
    if m["kind"] in ("commodity", "crypto"):
        return "USA"
    iso = CPI_ISO3.get(m["country"] or "")
    if not iso:
        raise SystemExit(
            f"FATAL: no CPI country mapping for {m['slug']} (country={m['country']!r}). "
            "Add it to CPI_ISO3. Failing loudly here beats shipping a page whose "
            "real-terms toggle has silently disappeared.")
    return iso


def fetch_cpi(isos, key):
    """{iso3: [[year, cpi], ...]} for the countries the emitted series need.

    Years whose index rounds to zero are dropped, not kept as zeros. Four
    countries (AGO, BRA, COD, PER) have hyperinflationary decades that span
    more orders of magnitude than a rebased index can carry, so the World Bank
    reports them as 0.000000; Brazil is zero until 1988. A deflator divides by
    this number, so a zero is not a small value, it is a crash. Dropping them
    also gives the pages an honest earliest-real-year to clamp to."""
    out = {}
    for iso in sorted(isos):
        rows = rest("GET", f"/rest/v1/country_cpi?select=year,cpi&iso3=eq.{iso}"
                           f"&order=year.asc&limit={PAGE}", key=key)
        ser = [[int(r["year"]), round(float(r["cpi"]), 4)] for r in rows
               if float(r["cpi"]) > 0.01]
        if len(ser) < 10:
            raise SystemExit(f"FATAL: country_cpi has {len(ser)} usable years for {iso}; "
                             "load_cpi_series.py has not run or the table was truncated.")
        out[iso] = ser
    return out


def cpi_block(m, by_iso):
    iso = cpi_iso3(m)
    if not iso or iso not in by_iso:
        return None
    ser = by_iso[iso]
    usd = m["kind"] in ("commodity", "crypto")
    basis = ("US CPI, because this is priced in US dollars" if usd
             else f"{m['country']} CPI")
    return {"iso3": iso, "country": "United States" if usd else m["country"],
            "basis": basis, "first": ser[0][0], "base": ser[-1][0], "series": ser}


# Price slug -> the physical thing it is a contract on. WTI and Brent are two
# contracts on the same commodity and share one production history.
PRODUCTION_FOR = {
    "crude-oil-wti": "oil",
    "brent-crude": "oil",
    "natural-gas": "gas",
}
PROD_SOURCE = ("Our World in Data (CC BY 4.0), compiled from the Energy Institute "
               "Statistical Review of World Energy and the US Energy Information "
               "Administration")
LEADERS = 10   # rows in the table
TRACKED = 6    # lines on the share-over-time chart
WORLD = "WLD"


def fetch_production(commodities, key):
    """{commodity: {iso3: {year: value}}} plus the unit, paged past the 1000 cap."""
    out, units = {}, {}
    for c in sorted(commodities):
        rows, off = [], 0
        while True:
            page = rest("GET", f"/rest/v1/commodity_production?select=iso3,year,value,unit"
                               f"&commodity=eq.{c}&order=year.asc&limit={PAGE}&offset={off}", key=key)
            rows += page
            if len(page) < PAGE:
                break
            off += PAGE
        by = {}
        for r in rows:
            by.setdefault(r["iso3"], {})[int(r["year"])] = float(r["value"])
            units[c] = r["unit"]
        out[c] = by
    return out, units


def entity_names(key):
    rows = rest("GET", "/rest/v1/wb_entity?select=iso3,name", key=key)
    return {r["iso3"]: r["name"] for r in rows}


def production_block(slug, prod, units, names):
    """Where this commodity comes out of the ground, ready for the page.

    Shares are computed against the WORLD row rather than against the sum of
    the countries present, because OWID reports some output only inside
    regional aggregates. Summing the named countries instead would inflate
    every share by a couple of points and quietly assert the list is complete.
    """
    commodity = PRODUCTION_FOR.get(slug)
    if not commodity or commodity not in prod:
        return None
    by = prod[commodity]
    world = by.get(WORLD) or {}
    if not world:
        return None
    latest = max(world)
    countries = {i: s for i, s in by.items() if i != WORLD}
    ranked = sorted(((i, s.get(latest, 0.0)) for i, s in countries.items()),
                    key=lambda t: -t[1])
    top = [i for i, v in ranked if v > 0][:LEADERS]

    def name(i):
        return names.get(i, i)

    def share(i, y):
        w = world.get(y)
        v = countries.get(i, {}).get(y)
        return round(v / w * 100, 2) if (w and v) else None

    leaders = []
    for i in top:
        s = countries[i]
        # Peak SHARE, not peak output. Absolute production rises with world
        # demand, so almost every current leader's output peaks in the most
        # recent year and a peak-output column would print "2025" down the page
        # and say nothing. American oil output is at a record right now, while
        # the American share of world oil peaked in the 1920s at about two
        # thirds; the second fact is the one worth a column.
        havingshare = [y for y in s if share(i, y) is not None]
        peak = max(havingshare, key=lambda y: share(i, y)) if havingshare else latest
        leaders.append({
            "iso3": i, "name": name(i),
            "value": round(s[latest], 1), "share": share(i, latest),
            # 1980 is the useful mid-point for both fuels: after the 1970s
            # shocks, before the Soviet collapse and long before US shale.
            # Null for post-Soviet states, which did not report separately then.
            "share1980": share(i, 1980),
            "peakYear": peak, "peakShare": share(i, peak),
        })
    years = sorted(y for y in world if world[y] > 0)
    shares = [{"iso3": i, "name": name(i),
               "series": [[y, share(i, y)] for y in years if share(i, y) is not None]}
              for i in top[:TRACKED]]
    named = sum(countries.get(i, {}).get(latest, 0.0) for i in countries)
    unknown = [i for i in top if i not in names]
    if unknown:
        log(f"    NOTE {commodity}: no wb_entity name for {unknown}; showing the code")
    return {
        "commodity": commodity, "unit": units.get(commodity, ""),
        "source": PROD_SOURCE, "first": years[0], "latest": latest,
        "countries": len(countries),
        # What share of the world total the named countries actually add up to.
        # Stated so the page can admit the remainder rather than imply zero.
        "coverage": round(named / world[latest] * 100, 1),
        "world": [[y, round(world[y], 1)] for y in years],
        "leaders": leaders, "shares": shares,
    }


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
                # carried through from the read-model file rather than refetched,
                # so the overlay's real view can never disagree with the single
                # series pages it links to
                "cpi": doc.get("cpi"),
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

    by_iso = fetch_cpi({i for i in (cpi_iso3(m) for m in meta) if i}, key)
    log(f"CPI: {len(by_iso)} countries · "
        + ", ".join(f"{k} {v[0][0]}-{v[-1][0]}" for k, v in sorted(by_iso.items())))

    wanted = {PRODUCTION_FOR[m["slug"]] for m in meta if m["slug"] in PRODUCTION_FOR}
    prod, punits = fetch_production(wanted, key) if wanted else ({}, {})
    names = entity_names(key) if wanted else {}
    if prod:
        log("production: " + ", ".join(f"{c} {len(v) - 1} countries" for c, v in sorted(prod.items())))

    overlay, written = [], 0
    for m in meta:
        ser = fetch_series(m["slug"], key)
        if not ser:
            log(f"  {m['slug']:20} EMPTY, skipped")
            continue
        cpi = cpi_block(m, by_iso)
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
            "cpi": cpi,
            "production": production_block(m["slug"], prod, punits, names),
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
                        "unit": m["unit"], "start": me[0][0], "series": me,
                        "cpi": cpi})
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

    by_iso = {"USA": [[1913, 9.9], [2026, 331.2]], "JPN": [[1960, 15.0], [2025, 118.0]]}
    idx = {"slug": "nikkei-225", "kind": "index", "country": "Japan"}
    cm = {"slug": "gold", "kind": "commodity", "country": None}
    fx = {"slug": "jpy", "kind": "fx", "country": None}
    btc = {"slug": "bitcoin", "kind": "crypto", "country": None}
    assert cpi_iso3(idx) == "JPN" and cpi_iso3(cm) == "USA" and cpi_iso3(fx) is None
    assert cpi_iso3(btc) == "USA", "bitcoin is USD-quoted and countryless; US CPI or nothing"
    assert cpi_block(fx, by_iso) is None
    assert cpi_block(cm, by_iso)["iso3"] == "USA", "a USD contract deflates by US CPI"
    assert cpi_block(btc, by_iso)["country"] == "United States", cpi_block(btc, by_iso)
    b = cpi_block(idx, by_iso)
    assert (b["first"], b["base"]) == (1960, 2025), b
    try:
        cpi_iso3({"slug": "x", "kind": "index", "country": "Ruritania"})
        raise AssertionError("an unmapped country must stop the emit, not ship a page "
                             "with a silently missing toggle")
    except SystemExit:
        pass

    # Production. The world total is 100 but the two named countries only add to
    # 80, exactly the situation OWID's regional aggregates create, so `coverage`
    # must report 80 rather than the page implying the list is exhaustive.
    # USA output RISES to its maximum in 2025 while its SHARE peaks in 1980,
    # which is the American oil story in miniature and the case a peak-output
    # column would get wrong.
    prod = {"oil": {"WLD": {1980: 40.0, 2025: 100.0},
                    "USA": {1980: 24.0, 2025: 50.0},
                    "SAU": {1980: 8.0, 2025: 30.0}}}
    nm = {"USA": "United States", "SAU": "Saudi Arabia"}
    assert production_block("gold", prod, {"oil": "TWh"}, nm) is None, "gold has no production data"
    for s in ("crude-oil-wti", "brent-crude"):
        b = production_block(s, prod, {"oil": "TWh"}, nm)
        assert b["commodity"] == "oil", "WTI and Brent share one production history"
    assert b["coverage"] == 80.0, b["coverage"]
    lead = b["leaders"][0]
    assert lead["iso3"] == "USA" and lead["share"] == 50.0 and lead["share1980"] == 60.0, lead
    assert lead["peakYear"] == 1980 and lead["peakShare"] == 60.0, (
        "peak must be the peak SHARE year, not the peak OUTPUT year: USA output "
        "is highest in 2025 but its share is highest in 1980")
    assert b["leaders"][1]["iso3"] == "SAU" and b["leaders"][1]["peakYear"] == 2025
    assert [p[0] for p in b["shares"][0]["series"]] == [1980, 2025], b["shares"][0]
    print("self-test: 19/19 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
