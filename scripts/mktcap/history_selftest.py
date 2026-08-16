"""Offline parser tests for the mktcap history scrapers. No network, no Supabase.

  python history_selftest.py

Pinned against real CMC markup captured 2026-08-16. If CMC changes layout these
fail loudly, which is the point: a silently-empty scrape reads as "this company
has no history" rather than "the parser broke".
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import history_fetch as HF  # noqa: E402
import history_slugs as HS  # noqa: E402

PASS = FAIL = 0


def check(name, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1; print(f"  PASS  {name}")
    else:
        FAIL += 1; print(f"  FAIL  {name}\n        got  {got!r}\n        want {want!r}")


ROW_HTML = (
    '<tr><td class="fav"><img src="/img/fav.svg?v2" data-id="5707"></td>'
    '<td class="rank-td td-right" data-sort="101" moves="-3">101</td>'
    '<td class="name-td"><div class="logo-container"><img class="company-logo"'
    ' alt="Commonwealth Bank logo" src="/img/company-logos/64/CBA.AX.png"></div>'
    '<div class="name-div"><a href="/commonwealth-bank/marketcap/">'
    '<div class="company-name">Commonwealth Bank</div>'
    '<div class="company-code"><span class="rank d-none"></span>CBA.AX</div></a></div></td>'
    '<td class="td-right" data-sort="197994706051">'
    '<span class="currency-symbol-left">$</span>197.99 B</td>'
    '<td><img class="flag" src="/img/flags/au.png">'
    ' <span class="responsive-hidden">Australia</span></td></tr>'
)

HIST_HTML = (
    '<h2 class="big">Market cap history of Apple from 1996 to 2026</h2>'
    '<h3>End of year Market Cap</h3><table class="table"><thead><tr><th>Year</th>'
    '<th>Marketcap</th><th>Change</th></tr></thead><tbody>'
    '<tr><td>2026</td><td>$4.464 T</td><td class="percentage-green">11.7%</td></tr>'
    '<tr><td>2022</td><td>$2.066 T</td><td class="percentage-red">-28.77%</td></tr>'
    '<tr><td>2018</td><td>$746.07 B</td><td class="percentage-red">-13.34%</td></tr>'
    '<tr><td>1996</td><td>$2.60 B</td><td></td></tr>'
    '</tbody></table>'
    '<h3>Some other table</h3><table><tbody>'
    '<tr><td>1900</td><td>$9.99 T</td><td>0%</td></tr></tbody></table>'
)


def main():
    print("-- history_slugs.parse_page")
    rows, dropped = HS.parse_page(ROW_HTML.encode())
    check("one row parsed", len(rows), 1)
    r = rows[0]
    check("slug", r["slug"], "commonwealth-bank")
    check("symbol", r["symbol"], "CBA.AX")
    check("name", r["name"], "Commonwealth Bank")
    check("country", r["country"], "Australia")
    check("rank", r["rank"], 101)
    check("nothing dropped", dropped, 0)

    print("-- history_fetch.parse_money")
    check("trillions", HF.parse_money("$4.464 T"), 4.464e12)
    check("billions", HF.parse_money("$746.07 B"), 746.07e9)
    check("millions", HF.parse_money("$12.5 M"), 12.5e6)
    check("bare number", HF.parse_money("$1,234"), 1234.0)
    check("dash is None", HF.parse_money("-"), None)
    check("empty is None", HF.parse_money(""), None)
    check("garbage is None", HF.parse_money("n/a soon"), None)

    print("-- history_fetch.parse_pct")
    check("positive", HF.parse_pct("11.7%"), 11.7)
    check("negative", HF.parse_pct("-28.77%"), -28.77)
    check("empty", HF.parse_pct(""), None)

    print("-- history_fetch.parse_history")
    hist = HF.parse_history(HIST_HTML.encode())
    check("four rows", len(hist), 4)
    check("first row", hist[0], (2026, 4.464e12, 11.7))
    check("last row (no change cell)", hist[3], (1996, 2.60e9, None))
    check("second table excluded", [y for y, _, _ in hist].count(1900), 0)
    check("no history section -> empty", HF.parse_history(b"<html>nope</html>"), [])

    print(f"\n{PASS} PASS, {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
