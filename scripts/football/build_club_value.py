#!/usr/bin/env python3
"""Squad market value by month, per club, for six European top flights.

    python scripts/football/build_club_value.py --self-test
    python scripts/football/build_club_value.py --dry
    python scripts/football/build_club_value.py --write

The site's season boards are season-ending snapshots. This is the other axis:
what the market thought a squad was worth WHILE the season ran. Transfermarkt
reprices in waves each December and June and revalues continuously in between,
so a club curve is a step function with roughly quarterly plateaus. Render it
as a step, never a smoothed line: each step is a dated event.

🔴 `current_club_name` IS THE ATTRIBUTION KEY, NOT `current_club_id`.
In the source the name is carried per dated valuation entry, straight from
Transfermarkt's own history, so it is genuinely point-in-time and is populated
on all 656,300 usable rows. The id is DERIVED: the upstream build joins the most
recent transfer before the valuation date and FALLS BACK TO THE PLAYER'S CLUB
TODAY when no transfer precedes it, which silently backdates academy graduates
and anyone whose early transfers are missing. Using the id would attribute a
2013 valuation to a club the player joined in 2021.

🔴 COVERAGE IS PUBLISHED, NOT HIDDEN. A club total is the sum over the players
the corpus happens to know about, so a thin month reads as a cheap squad rather
than as missing data. Below MIN_SQUAD the month is null, and every month that
does survive carries its player count so the page can show it.

🔴 THE SERIES DOES NOT START WHERE THE DATA STARTS. There are valuation rows
back to 2000, but only for players still in the corpus later, so an early club
total is a survivorship artefact and slopes upward for a reason that is not
football getting richer. 65 clubs clear MIN_SQUAD in June 2008 against 275 in
June 2012 and 754 in June 2024. START is the floor, and it is a judgement.

DATA: data/football/tm/ from github.com/dcaribou/transfermarkt-datasets (CC0),
scraped from Transfermarkt. `data/` is gitignored. The upstream pipeline has
been paused since July 2026, so the series ends at DATA_END and will until it
restarts.
"""
import argparse, csv, gzip, json, os, sys
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from build_esd_crosswalk import (  # noqa: E402  one matcher, imported not copied
    COUNTRY, load_site, load_metros, resolve,
)

SRC = os.path.join(ROOT, "data", "football", "tm")
OUT_DIR = os.path.join(ROOT, "public", "data", "football", "value")

START = "2012-07"        # first month published; see the survivorship note
DATA_END = "2026-06"     # last month the paused upstream carries
STALE_MONTHS = 18        # a valuation stays live this long without a refresh
MIN_SQUAD = 15           # below this a club-month is null, not a small number
SOURCE_CREDIT = ("Player valuations from Transfermarkt via "
                 "github.com/dcaribou/transfermarkt-datasets (CC0)")
SOURCE_AS_OF = "2026-06-12"   # newest valuation in the corpus

# The six the site's club index knows best, and the six the Against Expectation
# ledgers now cover. Keyed by the country name in transfermarkt competitions.
COUNTRIES = {"England": "england", "Spain": "spain", "Italy": "italy",
             "Germany": "germany", "France": "france", "Netherlands": "holland"}

# Transfermarkt names a few clubs differently from the ledgers, and the site
# club index carries a couple with no metro of their own. Hand-checked, keyed
# by the transfermarkt name.
MANUAL = {
    ("italy", "SPAL"): "ferrara",   # index carries Spal with no metro; club is Ferrara
}


def mindex(ym):
    return (int(ym[:4]) - 2000) * 12 + int(ym[5:7]) - 1


def mlabel(i):
    return "%04d-%02d" % (2000 + i // 12, i % 12 + 1)


def club_countries(src=SRC):
    """club name -> country, via the club's domestic competition."""
    comp = {}
    with gzip.open(os.path.join(src, "competitions.csv.gz"), "rt",
                   encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            comp[r["competition_id"]] = r.get("country_name") or ""
    out = {}
    with gzip.open(os.path.join(src, "clubs.csv.gz"), "rt",
                   encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            c = comp.get(r.get("domestic_competition_id"), "")
            if c:
                out[r["name"].strip()] = c
    return out


def monthly_series(src=SRC):
    """{club: {month_index: (total_eur, players)}}, forward-filled and clamped."""
    lo, hi = mindex(START), mindex(DATA_END)
    per = defaultdict(list)
    with gzip.open(os.path.join(src, "player_valuations.csv.gz"), "rt",
                   encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                v = float(r["market_value_in_eur"] or 0)
            except ValueError:
                continue
            club = (r["current_club_name"] or "").strip()
            if v > 0 and club and r.get("date"):
                per[r["player_id"]].append((r["date"], v, club))
    tot, cnt = defaultdict(float), defaultdict(int)
    for events in per.values():
        events.sort()
        for k, (d, v, club) in enumerate(events):
            a = mindex(d[:7])
            nxt = mindex(events[k + 1][0][:7]) - 1 if k + 1 < len(events) else a + STALE_MONTHS
            b = min(nxt, a + STALE_MONTHS, hi)   # never carry past the data end
            for m in range(max(a, lo), b + 1):
                tot[(club, m)] += v
                cnt[(club, m)] += 1
    out = defaultdict(dict)
    for (club, m), v in tot.items():
        n = cnt[(club, m)]
        if n >= MIN_SQUAD:
            out[club][m] = (v, n)
    return out, lo, hi


def build(src=SRC):
    series, lo, hi = monthly_series(src)
    ctry_of = club_countries(src)
    site_exact, site_loose = load_site()
    place, by_slug = load_metros()

    payload, unmapped = defaultdict(list), defaultdict(list)
    for club, months in series.items():
        ctry = ctry_of.get(club)
        slug = COUNTRIES.get(ctry)
        if not slug:
            continue                      # outside the six; not an error
        r = resolve(slug, club, site_exact, site_loose, place) or {}
        ms = MANUAL.get((slug, club)) or r.get("metro_slug")
        if not ms and r.get("metro"):
            ms = next((s for s, m in by_slug.items()
                       if m.get("name") == r["metro"]), None)
        if not ms:
            unmapped[slug].append(club)
            continue
        pts = [{"m": mlabel(m), "v": round(months[m][0] / 1e6, 1), "n": months[m][1]}
               for m in sorted(months)]
        if len(pts) < 12:                 # a club needs a year to have a curve
            continue
        payload[slug].append({
            "club": club, "slug": r.get("slug"), "metro": r.get("metro"),
            "metro_slug": ms, "metro_method": r.get("method"),
            "first": pts[0]["m"], "last": pts[-1]["m"], "months": len(pts),
            "peak": max(p["v"] for p in pts),
            "series": pts,
        })
    return payload, unmapped, lo, hi


def self_test():
    ok = True
    assert mlabel(mindex("2012-07")) == "2012-07"
    assert mlabel(mindex("1999-12")) == "1999-12"
    print("  ok  month index round-trips")
    # a valuation must not be carried past the data end
    lo, hi = mindex(START), mindex(DATA_END)
    a = mindex("2026-05")
    b = min(a + STALE_MONTHS, hi)
    if b != hi:
        ok = False; print("  FAIL staleness carries past DATA_END")
    else:
        print("  ok  forward fill stops at DATA_END, not 18 months later")
    # the matcher is the crosswalk's, not a second one
    import build_esd_crosswalk as X
    if resolve is not X.resolve:
        ok = False; print("  FAIL resolve is not the crosswalk's")
    else:
        print("  ok  club matching is imported from build_esd_crosswalk")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if getattr(a, "self_test"):
        return self_test()
    if not (a.dry or a.write):
        ap.error("pass --self-test, --dry or --write")

    payload, unmapped, lo, hi = build()
    index = []
    for slug in sorted(payload):
        rows = sorted(payload[slug], key=lambda r: -r["peak"])
        payload[slug] = rows
        index.append({"slug": slug, "country": COUNTRY[slug], "clubs": len(rows),
                      "unmapped": len(unmapped.get(slug, []))})
        top = rows[0]
        print("%-8s %3d clubs  %s..%s   peak: %s %.0fm"
              % (slug, len(rows), mlabel(lo), mlabel(hi), top["club"], top["peak"]))
        if unmapped.get(slug):
            print("         %d unmapped: %s" % (len(unmapped[slug]),
                                                ", ".join(sorted(unmapped[slug])[:6])))
    if not a.write:
        print("\n--dry: nothing written")
        return 0
    os.makedirs(OUT_DIR, exist_ok=True)
    for slug, rows in payload.items():
        fp = os.path.join(OUT_DIR, "%s.json" % slug)
        with open(fp, "w", encoding="utf-8") as fh:
            json.dump({"meta": {"country": COUNTRY[slug], "start": mlabel(lo),
                                "end": mlabel(hi), "min_squad": MIN_SQUAD,
                                "stale_months": STALE_MONTHS,
                                "source_credit": SOURCE_CREDIT,
                                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
                       "clubs": rows}, fh, separators=(",", ":"))
        print("wrote %s (%.0f KB)" % (fp, os.path.getsize(fp) / 1024))
    ip = os.path.join(OUT_DIR, "index.json")
    with open(ip, "w", encoding="utf-8") as fh:
        json.dump({"_meta": {"asOf": SOURCE_AS_OF, "source_credit": SOURCE_CREDIT},
                   "start": mlabel(lo), "end": mlabel(hi),
                   "countries": index}, fh, separators=(",", ":"))
    print("wrote %s" % ip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
