#!/usr/bin/env python3
"""Fetch OWGR + Rolex Women's World Golf Rankings and fold to engine slugs.

Writes public/data/majors/golf-rankings.json:
    {generated_at, owgr: [{rank, player, ioc, nation}],
     rolex: [{rank, player, ioc, nation}],
     nations: {slug: {owgr_top3: [ranks], rolex_top3: [ranks]}}}

Feeds scripts/zzc_v1_multipillar.py's golf_ranking_contribs: for each nation,
the mean rank_strength of its best THREE ranked players on each list (depth,
not just a #1), summed across OWGR and Rolex, times RANK_SPORT_WEIGHT["Golf"].

OWGR: apiweb.owgr.com/api/owgr/rankings/getRankings?pageSize=300&pageNumber=1
(JSON, works with a plain requests.get + browser User-Agent).

Rolex: rolexrankings.com is Akamai bot-managed. Both the /rankings page and
its underlying /core/rankings/list JSON API return 403 to plain HTTP clients
(requests, curl.exe) from this box, even with a warmed-up session, a browser
User-Agent and a Referer header -- confirmed on 2026-09-11. Only a real
browser session (the page's JS sensor sets an Akamai cookie) gets 200. This
script tries the live fetch first (in case that ever changes) and falls back
to scripts/zzc/rolex-cache.json, a browser-fetched snapshot (top 100; ample
depth for a top-3-per-nation signal) captured the same day. Refresh that
cache file by hand via a browser session's
`fetch('/core/rankings/list?count=300',{credentials:'include'})` when it
goes stale.

    python scripts/zzc/golf_rankings.py --self-test
    python scripts/zzc/golf_rankings.py
"""
import json, os, re, sys, unicodedata, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "public", "data", "majors", "golf-rankings.json")
CACHE = os.path.join(HERE, "rolex-cache.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# IOC code -> engine slug. Home nations fold to Great Britain the same way
# the engine's FOLD dict does (scripts/zzc_v1_multipillar.py); Taiwan/Chinese
# Taipei folds the same way too. Everything else is the plain slugified
# country name, matching countries.json's convention.
HOME_NATIONS = {"ENG", "SCO", "WAL", "NIR"}
CODE_TO_SLUG = {
    "ARG": "argentina", "AUS": "australia", "AUT": "austria", "BEL": "belgium",
    "CAN": "canada", "CHI": "chile", "CHN": "china", "COL": "colombia",
    "DEN": "denmark", "ESP": "spain", "FIN": "finland", "FRA": "france",
    "GER": "germany", "HKG": "hong-kong", "IRL": "ireland", "ITA": "italy",
    "JPN": "japan", "KOR": "south-korea", "MEX": "mexico", "NED": "netherlands",
    "NOR": "norway", "NZL": "new-zealand", "PHI": "philippines", "POR": "portugal",
    "RSA": "south-africa", "SUI": "switzerland", "SWE": "sweden",
    "TPE": "taiwan", "UAE": "united-arab-emirates", "USA": "united-states",
    "VEN": "venezuela", "ZIM": "zimbabwe", "ZAF": "south-africa",
    "THA": "thailand", "SIN": "singapore", "CZE": "czech-republic",
    "SLO": "slovenia", "RUS": "russia", "IND": "india", "MAS": "malaysia",
    "ECU": "ecuador", "URU": "uruguay", "URY": "uruguay", "BRA": "brazil",
    "POL": "poland", "SWZ": "eswatini",
}


def slug_for(ioc):
    if ioc in HOME_NATIONS:
        return "great-britain"
    return CODE_TO_SLUG.get(ioc)


def fetch_owgr(page_size=300):
    q = urllib.parse.urlencode({"pageSize": page_size, "pageNumber": 1})
    req = urllib.request.Request(
        f"https://apiweb.owgr.com/api/owgr/rankings/getRankings?{q}",
        headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    out = []
    for x in d["rankingsList"]:
        c = x["player"]["country"]
        out.append({"rank": x["rank"], "player": x["player"]["fullName"], "ioc": c["iocCode"]})
    return out


def fetch_rolex_live(count=300):
    req = urllib.request.Request(
        f"https://www.rolexrankings.com/core/rankings/list?count={count}",
        headers={"User-Agent": UA, "Referer": "https://www.rolexrankings.com/rankings",
                 "X-Requested-With": "XMLHttpRequest"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    return [{"rank": x["rank"], "player": f"{x['name_first']} {x['name_last']}", "ioc": x["country_code"]}
            for x in d["list"]["items"]]


def fetch_rolex():
    try:
        return fetch_rolex_live(), "live"
    except Exception as e:
        print(f"  rolex: live fetch failed ({e}); falling back to cache")
        if not os.path.exists(CACHE):
            print("  rolex: no cache file either -- rolex list will be empty")
            return [], "unavailable"
        d = json.load(open(CACHE, encoding="utf-8"))
        print(f"  rolex: using cached snapshot from {d.get('fetched_at')} ({d.get('fetched_via')})")
        return d["items"], "cache"


def fold_list(items):
    out = []
    for it in items:
        slug = slug_for(it["ioc"])
        out.append({**it, "nation": slug})
    return out


def build_nations(owgr, rolex):
    nations = {}
    for key, items in (("owgr_top3", owgr), ("rolex_top3", rolex)):
        by_slug = {}
        for it in items:
            if not it["nation"]:
                continue
            by_slug.setdefault(it["nation"], []).append(it["rank"])
        for slug, ranks in by_slug.items():
            ranks.sort()
            nations.setdefault(slug, {"owgr_top3": [], "rolex_top3": []})[key] = ranks[:3]
    return nations


def self_test():
    ok = True
    if slug_for("ENG") != "great-britain" or slug_for("NIR") != "great-britain":
        print("SELF-TEST FAIL: home nations should fold to great-britain"); ok = False
    if slug_for("TPE") != "taiwan":
        print("SELF-TEST FAIL: TPE should fold to taiwan"); ok = False
    if slug_for("KOR") != "south-korea":
        print("SELF-TEST FAIL: KOR should be south-korea"); ok = False
    n = build_nations(
        fold_list([{"rank": 1, "player": "A", "ioc": "NZL"}, {"rank": 25, "player": "B", "ioc": "NZL"},
                   {"rank": 100, "player": "C", "ioc": "NZL"}, {"rank": 200, "player": "D", "ioc": "NZL"}]),
        fold_list([{"rank": 12, "player": "E", "ioc": "ENG"}, {"rank": 30, "player": "F", "ioc": "SCO"}]))
    if n.get("new-zealand", {}).get("owgr_top3") != [1, 25, 100]:
        print("SELF-TEST FAIL: new-zealand top3 wrong:", n.get("new-zealand")); ok = False
    if n.get("great-britain", {}).get("rolex_top3") != [12, 30]:
        print("SELF-TEST FAIL: great-britain fold wrong:", n.get("great-britain")); ok = False
    print("Self-test:", "PASS" if ok else "FAIL")
    return ok


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    owgr_raw = fetch_owgr(300)
    print(f"  owgr: {len(owgr_raw)} players")
    rolex_raw, rolex_src = fetch_rolex()
    print(f"  rolex: {len(rolex_raw)} players (source: {rolex_src})")
    owgr = fold_list(owgr_raw)
    rolex = fold_list(rolex_raw)
    unmapped = sorted({it["ioc"] for it in owgr + rolex if not it["nation"]})
    if unmapped:
        print("  UNMAPPED ioc codes (dropped from nation folding):", unmapped)
    nations = build_nations(owgr, rolex)
    doc = {"generated_at": __import__("datetime").date.today().isoformat(),
           "owgr": owgr, "rolex": rolex, "nations": nations}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUT} ({len(nations)} nations)")
    by_owgr = sorted(nations.items(), key=lambda kv: len(kv[1].get("owgr_top3", [])), reverse=True)
    top12 = [s for s, v in nations.items() if v.get("owgr_top3")]
    top12_ranked = sorted(nations.items(), key=lambda kv: min(kv[1].get("owgr_top3") or [9999]))[:12]
    print("Top 12 nations by best OWGR rank:", [(s, v["owgr_top3"]) for s, v in top12_ranked])
    print("New Zealand entry:", nations.get("new-zealand"))


if __name__ == "__main__":
    main()
