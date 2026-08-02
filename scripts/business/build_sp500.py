#!/usr/bin/env python3
"""build_sp500.py - S&P 500 layer for /business.

Fetches the Wikipedia constituents + selected-changes tables (the same
maintained page the index-tracking world leans on), parses the wikitext,
joins each constituent to this site's company universe (mktcap_merged in
Supabase) for market cap + metro, and writes public/data/business/sp500.json.

Membership changes are rare (a handful per quarter), so weekly is plenty:
run alongside build_business_data.py in the Saturday mktcap flow. Offline
fixtures gate the parser: `build_sp500.py --self-test` must pass before a
run is trusted. usage: build_sp500.py [--self-test]
"""
import json, os, re, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "mktcap"))
import common  # noqa: E402

OUT = os.path.join(ROOT, "public", "data", "business", "sp500.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
API = ("https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies"
       "&prop=wikitext&format=json&formatversion=2")


# ---------------- wikitext helpers ----------------

def strip_markup(s):
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    # Exchange-symbol templates: {{NyseSymbol|MMM}}, {{NasdaqSymbol|ADBE}}, {{NYSE|X}}, ...
    s = re.sub(r"\{\{[A-Za-z ]*[Ss]ymbol\|([^}|]+)[^}]*\}\}", r"\1", s)
    s = re.sub(r"\{\{(?:NYSE|Nasdaq|NASDAQ|nyse|nasdaq)\|([^}|]+)[^}]*\}\}", r"\1", s)
    s = re.sub(r"\{\{[^}]*\}\}", "", s)  # any other template: drop
    s = re.sub(r"\[\[[^\]|]*\|([^\]]+)\]\]", r"\1", s)  # [[target|label]] -> label
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)  # [[target]] -> target
    s = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", s)  # [url label] -> label
    s = s.replace("'''", "").replace("''", "")
    return s.strip()


def split_cells(row_text):
    """Split a table-row body into cells on top-level pipes ('||' or newline-'|')."""
    text = re.sub(r"\n\|", "||", "\n" + row_text.strip())
    if text.startswith("||"):
        text = text[2:]
    cells, buf, depth, i = [], "", 0, 0
    while i < len(text):
        two = text[i:i + 2]
        if two in ("[[", "{{"):
            depth += 1; buf += two; i += 2; continue
        if two in ("]]", "}}"):
            depth = max(0, depth - 1); buf += two; i += 2; continue
        if two == "||" and depth == 0:
            cells.append(buf); buf = ""; i += 2; continue
        buf += text[i]; i += 1
    cells.append(buf)
    out = []
    for c in cells:
        c = c.strip()
        # attribute prefix (rowspan="2" | July 1, 2026) -> keep content side
        if "|" in c:
            pre, _, post = c.partition("|")
            if "=" in pre and "[[" not in pre and "{{" not in pre:
                c = post.strip()
        out.append(c)
    return out


def parse_table(wikitext, table_id):
    m = re.search(r'\{\|[^\n]*id="%s".*?\n\|\}' % re.escape(table_id), wikitext, flags=re.S)
    if not m:
        raise RuntimeError(f"table id={table_id} not found")
    body = m.group(0)
    rows = re.split(r"\n\|-[^\n]*", body)[1:]  # drop the {| opener
    parsed = []
    for r in rows:
        r = r.strip()
        if not r or r.startswith("!") or r == "|}":
            continue
        r = r.removesuffix("|}").strip()
        cells = [strip_markup(c) for c in split_cells(r)]
        if any(cells):
            parsed.append(cells)
    return parsed


def parse_constituents(wikitext):
    out = []
    for cells in parse_table(wikitext, "constituents"):
        if len(cells) < 6:
            continue
        sym, name, sector, sub, hq, added = cells[0], cells[1], cells[2], cells[3], cells[4], cells[5]
        founded = cells[7] if len(cells) > 7 else ""
        city, _, state = hq.rpartition(", ")
        out.append({"symbol": sym, "name": name, "sector": sector, "subIndustry": sub,
                    "hq": hq, "hqCity": city or hq, "hqState": state,
                    "dateAdded": added, "founded": founded})
    return out


def parse_changes(wikitext):
    out, cur_date = [], ""
    for cells in parse_table(wikitext, "changes"):
        # A full row is date + 5 cols; a rowspan continuation is 5 (or fewer) cols.
        if len(cells) >= 6 and re.search(r"\d{4}", cells[0] or ""):
            cur_date = cells[0]
            add_t, add_n, rem_t, rem_n = cells[1], cells[2], cells[3], cells[4]
            reason = cells[5] if len(cells) > 5 else ""
        elif len(cells) >= 4:
            add_t, add_n, rem_t, rem_n = cells[0], cells[1], cells[2], cells[3]
            reason = cells[4] if len(cells) > 4 else ""
        else:
            continue
        if not (add_t or rem_t):
            continue
        out.append({"date": cur_date, "addedTicker": add_t, "added": add_n,
                    "removedTicker": rem_t, "removed": rem_n, "reason": reason})
    return out


# ---------------- join + write ----------------

def norm_sym(s):
    return (s or "").replace(".", "-").upper().strip()


def main(argv):
    if "--self-test" in argv:
        return self_test()
    raw = json.loads(common.fetch_url(API).decode("utf-8"))
    wikitext = raw["parse"]["wikitext"]
    cons = parse_constituents(wikitext)
    changes = parse_changes(wikitext)
    if not (480 <= len(cons) <= 520):
        sys.exit(f"FATAL: parsed {len(cons)} constituents (expected ~503) - page layout changed?")
    common.log(f"constituents: {len(cons)}, changes rows: {len(changes)}")

    metro_info = {m["name"]: m for m in json.load(open(METROS, encoding="utf-8"))}
    rows = common.select_all(
        "/rest/v1/mktcap_merged?select=name,symbol,marketcap,metro,country",
        order="company_id")
    by_sym = {norm_sym(r["symbol"]): r for r in rows if r.get("symbol")}

    matched = 0
    for c in cons:
        r = by_sym.get(norm_sym(c["symbol"]))
        if r:
            matched += 1
            c["cap"] = r["marketcap"]
            c["metro"] = r.get("metro")
            c["metroSlug"] = metro_info.get(r.get("metro") or "", {}).get("slug", "")
        else:
            c["cap"] = None
            c["metro"] = None
            c["metroSlug"] = ""
    common.log(f"matched to site universe: {matched}/{len(cons)}")

    out = {
        "meta": {
            "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "Wikipedia: List of S&P 500 companies",
            "count": len(cons), "matched": matched,
        },
        "constituents": sorted(cons, key=lambda c: -(c["cap"] or 0)),
        "changes": changes[:60],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    common.log(f"wrote {OUT}")


# ---------------- offline fixtures ----------------

FIXTURE = '''
{| class="wikitable sortable" id="constituents"
|-
! Symbol !! Security !! GICS Sector !! GICS Sub-Industry !! Headquarters Location !! Date added !! CIK !! Founded
|-
| {{NYSE|MMM}} || [[3M]] || Industrials || Industrial Conglomerates || [[Saint Paul, Minnesota]] || 1957-03-04 || 0000066740 || 1902
|-
| AAPL<ref>x</ref> || [[Apple Inc.|Apple]] || Information Technology || Technology Hardware || [[Cupertino, California]] || 1982-11-30 || 0000320193 || 1976
|}
{| class="wikitable sortable" id="changes"
|-
! Date !! colspan="2" | Added !! colspan="2" | Removed !! Reason
|-
| rowspan="2" | July 1, 2026 || AAA || [[Alpha Corp]] || ZZZ || Zeta Inc || Market cap change.<ref>y</ref>
|-
| BBB || Beta Corp || YYY || Ypsilon || Acquisition.
|}
'''


def self_test():
    cons = parse_constituents(FIXTURE)
    assert len(cons) == 2, cons
    assert cons[0]["symbol"] == "MMM" and cons[0]["name"] == "3M", cons[0]
    assert cons[0]["hqCity"] == "Saint Paul" and cons[0]["hqState"] == "Minnesota", cons[0]
    assert cons[1]["symbol"] == "AAPL" and cons[1]["name"] == "Apple", cons[1]
    assert cons[1]["dateAdded"] == "1982-11-30" and cons[1]["founded"] == "1976", cons[1]
    ch = parse_changes(FIXTURE)
    assert len(ch) == 2, ch
    assert ch[0]["date"] == "July 1, 2026" and ch[0]["addedTicker"] == "AAA" and ch[0]["removed"] == "Zeta Inc", ch[0]
    assert ch[1]["date"] == "July 1, 2026" and ch[1]["addedTicker"] == "BBB" and ch[1]["reason"] == "Acquisition.", ch[1]
    assert norm_sym("BRK.B") == "BRK-B"
    print("self-test: 9/9 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
