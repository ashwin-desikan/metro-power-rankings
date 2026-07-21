#!/usr/bin/env python3
"""
backfill-governors.py -- fill the 7 states whose Wikidata governor terms are
UNDATED (so build-office-history.py --enrich drops them): NH, NE, GA, TN, UT, MS, MN.

Root cause (confirmed via --diagnose): the governors exist on Wikidata under the
correct "Governor of X" position but their P39 statements have no P580/P582 date
qualifiers, so they cannot be placed on a timeline. Wikipedia's "List of
governors of X" tables ARE fully dated -- this script fetches those, parses the
governor rows, and MERGES the 7 states into public/data/us-governor-history.json
(replacing just those 7 states; the other 43 keep their complete Wikidata data).

Terms are clamped/filtered to on/after statehood (territorial governors excluded),
identical to the main pipeline.

MODES
  --self-test   Offline. Asserts the table-row parser + date parser + clamp on
                mock rows. No network.
  --backfill    NETWORK (Ashwin's terminal). Fetch + parse + merge + PRINT each
                state's full parsed list and a contiguity check for verification.

DEPS: pandas + lxml (for robust HTML table extraction). If missing:
  pip install pandas lxml
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_GOV = os.path.join(ROOT, "public", "data", "us-governor-history.json")

# state -> (Wikipedia page title, USPS code, statehood date)
BACKFILL = {
    "New Hampshire": ("List_of_governors_of_New_Hampshire", "NH", "1788-06-21"),
    "Nebraska":      ("List_of_governors_of_Nebraska",      "NE", "1867-03-01"),
    "Georgia":       ("List_of_governors_of_Georgia",       "GA", "1788-01-02"),
    "Tennessee":     ("List_of_governors_of_Tennessee",     "TN", "1796-06-01"),
    "Utah":          ("List_of_governors_of_Utah",          "UT", "1896-01-04"),
    "Mississippi":   ("List_of_governors_of_Mississippi",   "MS", "1817-12-10"),
    "Minnesota":     ("List_of_governors_of_Minnesota",     "MN", "1858-05-11"),
}

WIKI_API = "https://en.wikipedia.org/w/api.php"
UA = "CitizenOfNowhere-governor-backfill/1.0 (https://rankings.citizenofnowhere.org)"

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}
_FOOT = re.compile(r"\[[^\]]*\]")            # [a] [1] footnotes
_PAREN = re.compile(r"\([^)]*\)")            # (acting) etc.
_INCUMBENT = ("incumbent", "present", "current", "in office")


def clean(s):
    if s is None:
        return ""
    s = str(s)
    s = _FOOT.sub("", s)
    s = s.replace("\xa0", " ").replace("–", "-").replace("—", "-")
    return " ".join(s.split()).strip()


def parse_date(s):
    """'January 5, 1905' / '5 January 1905' / '1905' -> 'YYYY-MM-DD'.
    Incumbent/present -> None. Unparseable -> None."""
    s = clean(s)
    if not s:
        return None
    low = s.lower()
    if any(w in low for w in _INCUMBENT):
        return None
    # Month D, YYYY
    m = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", s)
    if m and m.group(1).lower() in _MONTHS:
        return "%04d-%02d-%02d" % (int(m.group(3)), _MONTHS[m.group(1).lower()], int(m.group(2)))
    # D Month YYYY
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", s)
    if m and m.group(2).lower() in _MONTHS:
        return "%04d-%02d-%02d" % (int(m.group(3)), _MONTHS[m.group(2).lower()], int(m.group(1)))
    # bare year
    m = re.search(r"\b(\d{4})\b", s)
    if m:
        return "%s-01-01" % m.group(1)
    return None


def _find_col(cols, *needles):
    for i, c in enumerate(cols):
        cl = c.lower()
        if any(n in cl for n in needles):
            return i
    return None


_DATE_ANY = re.compile(
    r"([A-Za-z]+\s+\d{1,2},?\s+\d{4})|(\d{1,2}\s+[A-Za-z]+\s+\d{4})|(\d{4})")


def extract_dates(term):
    """All plausible dates in a 'Term in office' cell, left-to-right, as ISO
    strings. Non-overlapping so 'March 27, 1867' consumes its year before the
    bare-year branch can re-match it. Years are bounded to [1700, 2100] so a
    days-in-office count for the incumbent (e.g. '2757 days') is NOT read as a
    year."""
    out = []
    for m in _DATE_ANY.finditer(term):
        d = parse_date(m.group(0))
        if d:
            y = int(d[:4])
            if 1700 <= y <= 2100:
                out.append(d)
    return out


def parse_table(headers, rows):
    """Flattened headers + row cell-lists -> [{name,party,start,end}]. Pure.
    Handles Wikipedia governor tables: spanned 'Governor/Governor.1/Governor.2'
    columns (name in the content-richest one, with a '(birth-death)' suffix),
    a single 'Term in office' date-range column, and navbox tables (no term
    column -> skipped)."""
    cols = [clean(h).lower() for h in headers]
    # Territorial-governor tables carry an "Appointed by / Appointing President"
    # column. Those governors are pre-statehood (out of scope) and their rows
    # sometimes mis-parse into a spurious entry clamped at the statehood date
    # (e.g. a territorial governor showing up on statehood day). Skip them wholesale.
    if any("appointed by" in c or "appointing" in c for c in cols):
        return []
    # must be an actual term table, not a navbox/infobox
    ci_took = _find_col(cols, "took office", "assumed office", "began")
    ci_left = _find_col(cols, "left office")
    ci_term = _find_col(cols, "term in office", "term")
    if ci_took is None and ci_term is None:
        return []
    ci_party = _find_col(cols, "party")
    # candidate name columns: header mentions governor/name, excluding Lt. Gov
    name_cands = [i for i, c in enumerate(cols)
                  if ("governor" in c or c == "name" or "name" in c)
                  and "lt" not in c and "lieutenant" not in c and "vte" not in c]

    def nonempty(ci):
        n = 0
        for r in rows:
            if ci < len(r):
                v = clean(r[ci])
                if v and v.lower() not in ("governor", "name"):
                    n += 1
        return n

    if not name_cands:
        return []
    ci_name = max(name_cands, key=nonempty)
    if nonempty(ci_name) == 0:
        return []

    out = []
    for r in rows:
        if ci_name >= len(r):
            continue
        name = _FOOT.sub("", clean(r[ci_name]))
        name = _PAREN.sub("", name).strip()          # drop "(1829-1891)" lifespan
        low = name.lower()
        if not name or low in ("governor", "name", "vacant", "office did not exist"):
            continue
        party = clean(r[ci_party]) if (ci_party is not None and ci_party < len(r)) else ""
        party = re.sub(r"\s*-\s*", "-", party)       # "Democratic- Republican" -> "-"
        start = end = None
        if ci_took is not None and ci_took < len(r):
            start = parse_date(r[ci_took])
            if ci_left is not None and ci_left < len(r):
                end = parse_date(r[ci_left])
        if start is None and ci_term is not None and ci_term < len(r):
            term_txt = clean(r[ci_term])
            ds = extract_dates(term_txt)
            if ds:
                start = ds[0]
                end = ds[1] if len(ds) > 1 else None
                if any(w in term_txt.lower() for w in _INCUMBENT):
                    end = None  # sitting governor -> current
        if start is None:
            continue
        out.append({"name": name, "party": party or "Unknown", "start": start, "end": end})
    return out


def clamp_statehood(rows, sd):
    kept = []
    for r in rows:
        end = r.get("end")
        if end and end < sd:
            continue
        start = r["start"]
        if start < sd:
            start = sd
        if end is not None and end <= start:
            continue  # zero/negative-length artifact (e.g. territorial gov clamped to statehood)
        kept.append({"name": r["name"], "party": r["party"], "start": start, "end": end})
    # sort + dedupe by (name,start)
    kept.sort(key=lambda r: r["start"])
    seen = set(); dd = []
    for r in kept:
        k = (r["name"], r["start"])
        if k in seen:
            continue
        seen.add(k); dd.append(r)
    return close_open_terms(dd)


def close_open_terms(rows):
    """Only the latest term may stay open (end=None). Any non-latest term whose
    end is missing or overlaps its successor is closed to the successor's start;
    zero-length rows dropped. Guards against a died-in-office governor with a
    missing end resolving as 'current' forever. Undated-at-equal-start sort first
    so the real dated term survives. Pure -- unit tested."""
    rows = [dict(r) for r in rows if r.get("start")]
    rows.sort(key=lambda r: (r["start"], 0 if r.get("end") is None else 1, r.get("end") or ""))
    for i in range(len(rows) - 1):
        nxt = rows[i + 1]["start"]
        e = rows[i].get("end")
        if e is None or e > nxt:
            rows[i]["end"] = nxt
    return [r for r in rows if r.get("end") is None or r["end"] > r["start"]]


# ---------------------------------------------------------------------------
def _fetch_html(title):
    import urllib.parse, urllib.request
    q = urllib.parse.urlencode({
        "action": "parse", "page": title, "prop": "text",
        "format": "json", "formatversion": "2", "redirects": "1"})
    req = urllib.request.Request(WIKI_API + "?" + q, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["parse"]["text"]


def _tables_from_html(html):
    import pandas as pd
    from io import StringIO
    dfs = pd.read_html(StringIO(html))
    out = []
    for df in dfs:
        df = df.fillna("")
        if isinstance(df.columns, pd.MultiIndex):
            headers = [" ".join(str(x) for x in tup) for tup in df.columns]
        else:
            headers = [str(c) for c in df.columns]
        rows = df.astype(str).values.tolist()
        out.append((headers, rows))
    return out


def cmd_backfill():
    doc = json.load(open(OUT_GOV, encoding="utf-8"))
    gov = doc["governors"]
    for name, (title, code, sd) in BACKFILL.items():
        html = _fetch_html(title)
        allrows = []
        for headers, rows in _tables_from_html(html):
            if _find_col([h.lower() for h in headers], "governor", "name") is None:
                continue
            allrows.extend(parse_table(headers, rows))
        merged = clamp_statehood(allrows, sd)
        # contiguity check
        gaps = []
        for i in range(len(merged) - 1):
            e = merged[i]["end"] or merged[i + 1]["start"]
            if int(merged[i + 1]["start"][:4]) - int(e[:4]) >= 4:
                gaps.append("%s->%s" % (e, merged[i + 1]["start"]))
        print("\n=== %s (%s): %d governors, span %s..%s ===" % (
            name, code, len(merged),
            merged[0]["start"] if merged else "-",
            merged[-1]["start"] if merged else "-"))
        if gaps:
            print("  REMAINING GAPS(>=4y): %s" % ", ".join(gaps))
        for r in merged:
            print("   %s  %-28s %s" % (r["start"], r["name"], r["end"] or "(current)"))
        # GUARD: never overwrite an existing state with an empty parse
        if merged:
            gov[code] = merged
        else:
            print("  !! parse empty -> KEEPING existing %d terms for %s (not overwritten)" %
                  (len(gov.get(code, [])), code))
    with open(OUT_GOV, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(len(v) for v in gov.values())
    print("\nmerged 7 states into %s (%d governor terms across %d states)" % (
        os.path.relpath(OUT_GOV, ROOT), total, len(gov)))


def cmd_inspect():
    """Dump each Wikipedia page's tables (headers, shape, sample rows) so the
    parser can be fixed against the REAL structure. NH only by default is enough,
    but we do all 7 in case formats differ."""
    for name, (title, code, sd) in BACKFILL.items():
        html = _fetch_html(title)
        tables = _tables_from_html(html)
        print("\n########## %s (%s): %d tables ##########" % (name, code, len(tables)))
        for ti, (headers, rows) in enumerate(tables):
            if len(rows) < 3:
                continue
            print(" --- table[%d] shape=%dx%d" % (ti, len(rows), len(headers)))
            print("     headers: %s" % [clean(h)[:24] for h in headers])
            for r in rows[:2]:
                print("     row: %s" % [clean(c)[:22] for c in r])


def cmd_self_test():
    assert parse_date("January 5, 1905") == "1905-01-05"
    assert parse_date("5 January 1905") == "1905-01-05"
    assert parse_date("1911") == "1911-01-01"
    assert parse_date("Incumbent") is None
    assert parse_date("[a] March 4, 1829 ") == "1829-03-04"

    assert extract_dates("March 27, 1867 - June 8, 1871") == ["1867-03-27", "1871-06-08"]
    assert extract_dates("January 2, 2023 - present") == ["2023-01-02"]
    assert extract_dates("1899 - 1903") == ["1899-01-01", "1903-01-01"]
    # days-in-office count must NOT be read as a year
    assert extract_dates("January 7, 2019 2757 days") == ["2019-01-07"]

    # incumbent term -> end None
    inc = parse_table(["No.", "Governor", "Governor.1", "Term in office", "Party"],
                      [["1", "", "Tim Walz (1964-)", "January 7, 2019 - present 2757 days", "DFL"]])
    assert inc[0]["end"] is None, inc

    # zero-length clamp artifact dropped
    z = clamp_statehood([{"name": "TerrGov", "party": "P",
                          "start": "1895-01-01", "end": "1896-01-04"}], "1896-01-04")
    assert z == [], z

    # close_open_terms: undated died-in-office closed to successor; only latest open
    co = close_open_terms([
        {"name": "Real", "party": "P", "start": "1788-01-02", "end": "1788-01-26"},
        {"name": "SpuriousUndated", "party": "P", "start": "1788-01-02", "end": None},
        {"name": "Died", "party": "P", "start": "1905-01-04", "end": None},
        {"name": "Next", "party": "P", "start": "1909-09-21", "end": None},
    ])
    nm = [r["name"] for r in co]
    assert "SpuriousUndated" not in nm and "Real" in nm, co
    assert [r for r in co if r["name"] == "Died"][0]["end"] == "1909-09-21", co
    assert co[-1]["name"] == "Next" and co[-1]["end"] is None, co

    # real 9-col structure: spanned Governor cols (name in the content-rich one,
    # with lifespan), single 'Term in office' date-range, Lt. Gov excluded.
    headers = ["No.", "Governor", "Governor.1", "Governor.2", "Term in office",
               "Party", "Election", "Lt. Governor", "Lt. Governor.1"]
    rows = [
        ["1", "", "", "Meshech Weare (1713-1786)", "June 15, 1784 - June 8, 1785",
         "No parties", "1784", "Office did not exist", "Office did not exist"],
        ["2", "", "", "John Langdon (1741-1819) [a]", "June 8, 1785 - June 9, 1786",
         "Democratic- Republican", "1785", "", ""],
    ]
    got = parse_table(headers, rows)
    assert len(got) == 2, got
    assert got[0] == {"name": "Meshech Weare", "party": "No parties",
                      "start": "1784-06-15", "end": "1785-06-08"}, got[0]
    assert got[1]["name"] == "John Langdon", got[1]
    assert got[1]["party"] == "Democratic-Republican", got[1]  # spacing normalized

    # 5-col table WITHOUT a territorial "Appointed by" column: name in the
    # content-rich Governor column, single date-range term.
    h5 = ["No.", "Governor", "Governor.1", "Term in office", "Election"]
    r5 = [["1", "", "Peter Burnett (1807-1895)", "December 20, 1849 - January 9, 1851", "1849"]]
    g5 = parse_table(h5, r5)
    assert g5 and g5[0]["name"] == "Peter Burnett", g5
    assert g5[0]["start"] == "1849-12-20" and g5[0]["end"] == "1851-01-09", g5

    # navbox (governor in header but NO term column) -> skipped
    assert parse_table(["vteGovernors of X", "vteGovernors of X.1"],
                       [["a", "b"], ["c", "d"]]) == []

    # territorial table ("Appointed by" / "Appointing President") -> skipped wholesale
    assert parse_table(["No.", "Governor", "Governor.1", "Term in office", "Appointed by"],
                       [["1", "", "John Shaffer (1827-1870)", "March 23, 1870 - October 31, 1870",
                         "Ulysses S. Grant"]]) == []
    assert parse_table(["No.", "Governor", "Term in office", "Appointing President"],
                       [["1", "Brigham Young", "1850 - 1858", "Millard Fillmore"]]) == []

    # clamp: drop pre-statehood, clamp straddler
    cl = clamp_statehood([
        {"name": "Terr", "party": "P", "start": "1860-01-01", "end": "1865-01-01"},
        {"name": "Strad", "party": "P", "start": "1866-01-01", "end": "1869-01-01"},
    ], "1867-03-01")
    assert all(r["name"] != "Terr" for r in cl), cl
    assert [r for r in cl if r["name"] == "Strad"][0]["start"] == "1867-03-01"
    print("self-test OK: parse_date, parse_table, term-fallback, statehood clamp")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--backfill", action="store_true")
    g.add_argument("--inspect", action="store_true",
                   help="NETWORK: dump the Wikipedia tables' headers/shape/sample rows")
    a = ap.parse_args()
    if a.self_test:
        cmd_self_test()
    elif a.backfill:
        cmd_backfill()
    elif a.inspect:
        cmd_inspect()


if __name__ == "__main__":
    main()
