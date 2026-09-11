#!/usr/bin/env python3
"""Load women's major golf championship results into Supabase golf_majors.

Sources: Wikipedia (action=parse, prop=wikitext) for the five current women's
majors plus three defunct/historic ones, matching the convention the men's
golf_majors table already uses (men's data starts in 1860 and includes
historic defunct majors, so the women's side does too):

    Chevron Championship          (1983-, as Nabisco/Dinah Shore/ANA before)
    Women's PGA Championship      (1955-, as LPGA Championship before 2015)
    U.S. Women's Open             (1946-)
    The Evian Championship        (major status 2013-)
    Women's British Open          (major status 2001-, as AIG Women's Open since 2019)
    du Maurier Classic            (major 1979-2000, defunct; folded into
                                   Canadian Women's Open, which is not itself
                                   a major)
    Titleholders Championship     (major 1937-1966, 1972; defunct)
    Women's Western Open          (major 1930-1967; defunct; ALL winners were
                                   American per the page's own "Winners by
                                   nationality" table, so no per-row country
                                   markup exists and United States is used
                                   for every row)

Nation strings are mapped to match the existing men's golf_majors convention
(full country names: "United States", "South Korea", "England", ...), read
from `select distinct nation from golf_majors` on 2026-09-11: Argentina,
Australia, Canada, England, Fiji, France, Germany, Italy, Japan, Jersey, New
Zealand, Northern Ireland, Republic of Ireland, Scotland, South Africa, South
Korea, Spain, Sweden, United States, Wales, West Germany, Zimbabwe.

    python scripts/majors/load_womens_golf_majors.py --self-test   offline parser tests
    python scripts/majors/load_womens_golf_majors.py               dry run: fetch + report, no writes
    python scripts/majors/load_womens_golf_majors.py --write        fetch + upsert to Supabase

Env (optional): SUPABASE_SERVICE_KEY (else read from .env.local).
"""
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SB_URL = "https://nmprqkmymrdknffwnuur.supabase.co"

UA = "Mozilla/5.0 (compatible; ZoneZeroCupResearchBot/1.0; contact metroareaproject)"


# ---------------------------------------------------------------- IOC/code -> golf_majors nation string
NATION = {
    "USA": "United States", "ENG": "England", "SCO": "Scotland", "WAL": "Wales",
    "NIR": "Northern Ireland", "IRL": "Republic of Ireland", "AUS": "Australia",
    "NZL": "New Zealand", "CAN": "Canada", "RSA": "South Africa", "ZAF": "South Africa",
    "KOR": "South Korea", "JPN": "Japan", "CHN": "China", "TWN": "Taiwan",
    "THA": "Thailand", "SWE": "Sweden", "NOR": "Norway", "DEN": "Denmark",
    "DNK": "Denmark", "FRA": "France", "GER": "Germany", "DEU": "Germany",
    "FRG": "West Germany", "ESP": "Spain", "ITA": "Italy", "MEX": "Mexico",
    "COL": "Colombia", "ARG": "Argentina", "PHI": "Philippines", "PHL": "Philippines",
    "IND": "India", "BEL": "Belgium", "AUT": "Austria", "SUI": "Switzerland",
    "CHE": "Switzerland", "NED": "Netherlands", "NLD": "Netherlands",
    "FIN": "Finland", "URY": "Uruguay", "URU": "Uruguay", "PER": "Peru", "BRA": "Brazil",
    "CHI": "Chile", "CHL": "Chile", "PRI": "Puerto Rico", "SGP": "Singapore",
    "MAS": "Malaysia", "MYS": "Malaysia", "VEN": "Venezuela", "ZWE": "Zimbabwe",
    "COD": "Congo DR", "PAR": "Paraguay", "CRI": "Costa Rica", "ISR": "Israel",
}


def fetch_wikitext(page):
    q = urllib.parse.urlencode({"action": "parse", "page": page, "format": "json", "prop": "wikitext"})
    req = urllib.request.Request(f"https://en.wikipedia.org/w/api.php?{q}", headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.load(r)
            if "error" in j:
                raise RuntimeError(j["error"])
            return j["parse"]["wikitext"]["*"]
        except Exception:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))


CODE_RE = r"(?:\{\{(?:flagicon|flagcountry|flag)\|([A-Za-z]{2,3})(?:\|[^}]*)?\}\}|\{\{([A-Z]{3})\}\})"


def _clean_name(s):
    s = re.sub(r"\(a\)", "", s)
    s = re.sub(r"<small>.*?</small>", "", s)
    s = re.sub(r"\{\{small\|[^}]*\}\}", "", s)
    return s.strip()


def _row_year(row):
    m = re.search(r"\[\[(\d{4})[^\]|]*(?:\|(\d{4}))?\]\]", row) or re.match(r"\s*(\d{4})\b", row)
    if not m:
        return None
    g = [x for x in m.groups() if x]
    return int(g[0]) if g else None


def _section_body(wikitext, header_marker):
    """Everything from header_marker up to (not including) the next level-2
    '==Heading==' (level-3+ '===Sub===' headings, e.g. Western Open's
    stroke-play/match-play split, stay IN the body so multiple wikitables
    under one section are all scanned)."""
    i = wikitext.find(header_marker)
    if i < 0:
        raise ValueError(f"marker not found: {header_marker!r}")
    m = re.search(r"\n==[^=]", wikitext[i + len(header_marker):])
    end = i + len(header_marker) + m.start() if m else len(wikitext)
    return wikitext[i:end]


def parse_flag_before(wikitext, header_marker):
    """Champion column is `{{flagicon|CODE}} [[Player]]` — used by the Chevron,
    Women's PGA, U.S. Women's Open and Women's British Open pages."""
    body = _section_body(wikitext, header_marker)
    out = []
    for row in body.split("|-"):
        yr = _row_year(row)
        if not yr:
            continue
        # Repeat champions in these tables are sometimes plain text (no
        # wikilink) after their first appearance, so this does not require
        # `[[...]]` — it takes the champion cell verbatim up to the next `||`.
        fm = re.search(r"\{\{flagicon\|([A-Za-z]{2,3})[^}]*\}\}", row)
        if not fm:
            continue
        code = fm.group(1).upper()
        cell = row[fm.end():]
        cell = cell[:cell.find("||")] if "||" in cell else cell
        lm = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cell)
        name = _clean_name(lm.group(2) or lm.group(1)) if lm else _clean_name(cell)
        if not name or len(name) > 60:
            continue
        out.append((yr, name, code))
    return out


def parse_country_after(wikitext, header_marker):
    """Champion is the first wikilink after the year; country is the first
    {{flagicon|CODE}}/{{flagcountry|CODE|...}}/{{CODE}} template in the row —
    used by Titleholders and the du Maurier (Canadian Women's Open) table."""
    body = _section_body(wikitext, header_marker)
    out = []
    for row in body.split("|-"):
        yr = _row_year(row)
        if not yr:
            continue
        links = re.findall(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", row)
        name_links = [l for l in links if not re.match(r"^\d{4}", l[0])]
        if not name_links:
            continue
        target, disp = name_links[0]
        name = _clean_name(disp or target)
        m = re.search(CODE_RE, row)
        if not m:
            continue
        code = (m.group(1) or m.group(2)).upper()
        out.append((yr, name, code))
    return out


def parse_western_open(wikitext):
    """Women's Western Open: no per-row country markup; the page's own
    'Winners by nationality' section states every champion is American."""
    out = []
    for marker in ("===Stroke play era===", "===Match play era==="):
        i = wikitext.find(marker)
        if i < 0:
            continue
        end = wikitext.find("\n\n==", i)
        body = wikitext[i:end] if end > 0 else wikitext[i:]
        for row in body.split("|-"):
            yr = _row_year(row)
            if not yr:
                continue
            links = re.findall(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", row)
            name_links = [l for l in links if not re.match(r"^\d{4}", l[0])]
            if not name_links:
                continue
            target, disp = name_links[0]
            out.append((yr, _clean_name(disp or target), "USA"))
    return out


TOURNAMENTS = [
    # (canonical name, wikipedia page, parser kind, header marker, fixed code, note)
    ("Chevron Championship", "Chevron Championship", "country_after", "==Winners==", None, ""),
    ("Women's PGA Championship", "Women's PGA Championship", "flag_before", "==Winners==", None, ""),
    ("U.S. Women's Open", "U.S. Women's Open", "flag_before", "==Winners==", None, ""),
    ("The Evian Championship", "The Evian Championship", "flag_before", "==Winners==", None, ""),
    ("Women's British Open", "Women's British Open", "flag_before", "==Winners==", None, ""),
    ("du Maurier Classic", "Canadian Women's Open", "country_after",
     "Winners when the event was a", None, ""),
    ("Titleholders Championship", "Titleholders Championship", "country_after", "==Winners==", None, ""),
    ("Women's Western Open", "Women's Western Open", "western", None, None, ""),
]

# Major status start years (rows before these are non-major and excluded):
# Evian 2013 (LET/LPGA co-sanctioned major); Chevron/Dinah Shore 1983 (the
# 1972-1982 editions predate major status, per the page's own "Winners as a
# non-major" table); Women's British Open 2001 (major status began that year;
# the Weetabix-era winners before it were not a major).
MAJOR_FROM = {"The Evian Championship": 2013, "Chevron Championship": 1983,
              "Women's British Open": 2001}
# du Maurier Classic was a major 1979-2000 only; the same page's next table
# ("Winners before the event became a major in 1979", 1973-1978) sits right
# after it with no heading in between, so the year-range scan picks it up too.
MAJOR_RANGE = {"du Maurier Classic": (1979, 2000)}


def load_all():
    rows = []
    unmapped = set()
    for canon, page, kind, marker, fixed_code, note in TOURNAMENTS:
        time.sleep(1.5)
        wt = fetch_wikitext(page)
        if kind == "flag_before":
            parsed = parse_flag_before(wt, marker)
        elif kind == "country_after":
            parsed = parse_country_after(wt, marker)
        else:
            parsed = parse_western_open(wt)
        if canon in MAJOR_FROM:
            parsed = [p for p in parsed if p[0] >= MAJOR_FROM[canon]]
        if canon in MAJOR_RANGE:
            lo, hi = MAJOR_RANGE[canon]
            parsed = [p for p in parsed if lo <= p[0] <= hi]
        parsed = sorted(set(parsed), key=lambda p: -p[0])  # dedupe rows a heading-boundary scan could double count
        n = 0
        for yr, name, code in parsed:
            nation = NATION.get(code)
            if not nation:
                unmapped.add(code)
                continue
            rows.append({"year": yr, "tournament": canon, "champion": name,
                        "nation": nation, "gender": "W", "note": note})
            n += 1
        print(f"  {canon}: {n} rows parsed from {page!r}")
    return rows, unmapped


def self_test():
    ok = True
    sample_fb2 = """
==Winners==
{| class="wikitable"
|-
|[[2026 Women's PGA Championship|2026]] || Jun 25 || {{flagicon|KOR}} [[Ryu Hae-ran]] || align=center|275
|-
|[[2020 Women's PGA Championship|2020]]|| Oct 8 || {{flagicon|KOR}} [[Kim Sei-young]] || x
|}
"""
    got = parse_flag_before(sample_fb2, "==Winners==")
    exp = [(2026, "Ryu Hae-ran", "KOR"), (2020, "Kim Sei-young", "KOR")]
    if got != exp:
        print("SELF-TEST FAIL flag_before:", got, "!=", exp); ok = False

    sample_ca = """
==Winners==
{| class="wikitable"
!Year!!Winner!!Country!!Score
|-
|[[1972 Titleholders Championship|1972]] || [[Sandra Palmer (golfer)|Sandra Palmer]] || {{USA}} || 283
|-
|[[1960 Titleholders Championship|1960]] || [[Fay Crocker]] || {{URY}} || 303
|}
"""
    got2 = parse_country_after(sample_ca, "==Winners==")
    exp2 = [(1972, "Sandra Palmer", "USA"), (1960, "Fay Crocker", "URY")]
    if got2 != exp2:
        print("SELF-TEST FAIL country_after:", got2, "!=", exp2); ok = False

    sample_w = """
===Stroke play era===
{|class=wikitable
!Year!!Winner
|-
|[[1967 Women's Western Open|1967]] || [[Kathy Whitworth]] || align=center|289
|}

===Match play era===
{|class=wikitable
|-
|[[1954 Women's Western Open|1954]] || [[Betty Jameson]] <small>(2)</small> || align=center|6 & 5
|}
"""
    got3 = parse_western_open(sample_w)
    exp3 = [(1967, "Kathy Whitworth", "USA"), (1954, "Betty Jameson", "USA")]
    if got3 != exp3:
        print("SELF-TEST FAIL western:", got3, "!=", exp3); ok = False

    for code, exp_nation in [("KOR", "South Korea"), ("ENG", "England"),
                              ("URY", "Uruguay"), ("TWN", "Taiwan"), ("ZAF", "South Africa")]:
        if NATION.get(code) != exp_nation:
            print("SELF-TEST FAIL fold:", code, NATION.get(code), "!=", exp_nation); ok = False

    print("Self-test:", "PASS" if ok else "FAIL")
    return ok


def supa_key():
    if os.environ.get("SUPABASE_SERVICE_KEY"):
        return os.environ["SUPABASE_SERVICE_KEY"].strip()
    envf = os.path.join(ROOT, ".env.local")
    if os.path.exists(envf):
        for line in open(envf, encoding="utf-8"):
            if line.startswith("SUPABASE_SERVICE_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("No SUPABASE_SERVICE_KEY (env or .env.local)")


def upsert(rows):
    key = supa_key()
    step = 200
    for off in range(0, len(rows), step):
        batch = rows[off:off + step]
        body = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/golf_majors", data=body, method="POST",
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
        print(f"  upserted {off + len(batch)}/{len(rows)}")


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    write = "--write" in sys.argv
    rows, unmapped = load_all()
    if unmapped:
        print("UNMAPPED codes (rows dropped):", sorted(unmapped))
    by_t = {}
    for r in rows:
        by_t.setdefault(r["tournament"], 0)
        by_t[r["tournament"]] += 1
    print(f"\nTotal rows: {len(rows)}")
    for t, n in by_t.items():
        print(f"  {t}: {n}")
    from collections import Counter
    nat_counts = Counter(r["nation"] for r in rows)
    print("\nTop nations by title count:")
    for nat, n in nat_counts.most_common(12):
        print(f"  {nat}: {n}")
    if write:
        print("\nWriting to Supabase (merge-duplicates on year,tournament)...")
        upsert(rows)
        print("Done.")
    else:
        print("\nDRY RUN — no writes. Pass --write to upsert.")


if __name__ == "__main__":
    main()
