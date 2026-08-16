"""Offline tests for the rankings pipeline. No network, no Supabase.

  python selftest.py

The year-assertion test is the important one: it pins the behaviour that stops a
silently-redirected Fortune payload from ever reaching disk.
"""
import json, os, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import fetch_fortune as FF  # noqa: E402

PASS = FAIL = 0


def check(name, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1; print(f"  PASS  {name}")
    else:
        FAIL += 1; print(f"  FAIL  {name}\n        got  {got!r}\n        want {want!r}")


ITEMS = [
    {"rank": 1, "name": "Walmart", "data": {
        "Revenues ($M)": "$559,151", "Profits ($M)": "$13,510",
        "Market Value ($M)": "$382,642.8", "Employees": "2,300,000",
        "Sector": "Retailing", "Headquarters City": "Bentonville", "State": "Arkansas",
        "Some New Fortune Field": "ignore me"}},
    {"rank": 2, "name": "Amazon.com, Inc.", "data": {
        "Revenues ($M)": "$386,064", "Profits ($M)": "-$2,722",
        "Headquarters City": "Seattle"}},
    {"rank": None, "name": "Broken Row", "data": {}},
]


def main():
    print("-- company_key")
    check("legal forms stripped", C.company_key("Wal-Mart Stores, Inc."), "wal mart stores")
    check("ampersand expanded", C.company_key("Procter & Gamble"), "procter and gamble")
    check("LLC/LP stripped", C.company_key("Carlyle Group L.P."), "carlyle group")
    check("apostrophes dropped", C.company_key("Macy's"), "macys")
    check("distinct names stay distinct",
          C.company_key("Ford Motor") == C.company_key("Ford"), False)
    check("empty is empty", C.company_key(""), "")
    check("all-stopword name never keys empty", C.company_key("The Limited, Inc."), "the limited")
    check("bare legal form never keys empty", C.company_key("Co"), "co")
    check("LP variant collapses onto the plain name",
          C.company_key("Genesis Energy, L.P.") == C.company_key("Genesis Energy"), True)

    print("-- parse_money")
    check("plain", C.parse_money("$559,151"), 559151.0)
    check("decimal", C.parse_money("$382,642.8"), 382642.8)
    check("negative", C.parse_money("-$2,722"), -2722.0)
    check("parenthesised negative", C.parse_money("($2,722)"), -2722.0)
    check("dash is None", C.parse_money("-"), None)
    check("empty is None", C.parse_money(""), None)
    check("None is None", C.parse_money(None), None)
    check("zero survives", C.parse_money("$0"), 0.0)

    print("-- pick (key drift tolerance)")
    d = {"Revenue (in millions, USD)": "$1,000"}
    check("alt revenue key", C.pick(d, C.FIELD_PATTERNS["revenue_musd"]), "$1,000")
    check("absent key -> None", C.pick(d, C.FIELD_PATTERNS["hq_city"]), None)
    check("case insensitive", C.pick({"HEADQUARTERS CITY": "Omaha"},
                                     C.FIELD_PATTERNS["hq_city"]), "Omaha")

    print("-- to_rows")
    rows, census = FF.to_rows(2021, ITEMS)
    check("rankless row dropped", len(rows), 2)
    check("year stamped", rows[0]["year"], 2021)
    check("revenue parsed", rows[0]["revenue_musd"], 559151.0)
    check("market value parsed", rows[0]["market_value_musd"], 382642.8)
    check("employees int", rows[0]["employees"], 2300000)
    check("hq city", rows[0]["hq_city"], "Bentonville")
    check("hq state", rows[0]["hq_state"], "Arkansas")
    check("missing state -> None", rows[1]["hq_state"], None)
    check("negative profit", rows[1]["profit_musd"], -2722.0)
    check("key normalised", rows[1]["company_key"], "amazon com")
    check("unknown field censused", census.get("Some New Fortune Field"), 1)

    print("-- year assertion (the silent-redirect guard)")
    tmp = tempfile.mkdtemp()
    old_raw = FF.RAW
    try:
        FF.RAW = tmp
        wrong = {"pageProps": {"franchiseSearch": {"year": "2026", "items": ITEMS}}}
        open(os.path.join(tmp, "fortune-2021.json"), "w").write(json.dumps(wrong))
        try:
            FF.year_payload("bid", 2021)
            check("wrong year rejected", "returned", "SystemExit")
        except SystemExit as e:
            check("wrong year rejected", "asked Fortune for 2021" in str(e), True)

        right = {"pageProps": {"franchiseSearch": {"year": 2021, "items": ITEMS}}}
        open(os.path.join(tmp, "fortune-2021.json"), "w").write(json.dumps(right))
        check("right year accepted (int vs str)", len(FF.year_payload("bid", 2021)), 3)

        empty = {"pageProps": {"franchiseSearch": {"year": 2021, "items": []}}}
        open(os.path.join(tmp, "fortune-2021.json"), "w").write(json.dumps(empty))
        try:
            FF.year_payload("bid", 2021)
            check("empty year rejected", "returned", "SystemExit")
        except SystemExit as e:
            check("empty year rejected", "zero items" in str(e), True)
    finally:
        FF.RAW = old_raw

    print(f"\n{PASS} PASS, {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
