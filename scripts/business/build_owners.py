#!/usr/bin/env python3
"""build_owners.py - institutional owners (SEC Form 13F) for /business/owners.

Reduces a quarterly SEC Form 13F structured data set (the ~400MB INFOTABLE
plus SUBMISSION/COVERPAGE TSVs from sec.gov "Form 13F data sets") down to the
small JSON the tab needs: the manager league table, asset-manager capitals by
metro, the most widely held issuers, and who owns the giants of the site's
company universe.

Design notes:
- Filings: 13F-HR and 13F-HR/A for the modal PERIODOFREPORT in the drop. Per
  CIK we use the latest RESTATEMENT if one exists, else the latest original
  plus any NEW HOLDINGS amendments; 13F-NT notices carry no holdings.
- VALUE is whole dollars (post-2023 EDGAR rule).
- Ownership boards (widely held, giants) exclude put/call rows; the manager
  league table keeps every reported row so totals match what managers filed.
- Giants are matched by normalized NAMEOFISSUER (suffix-token stripping plus
  a small alias map), not CUSIP: one issuer spans many CUSIPs (share classes)
  and name folding handles that well enough for a leaderboard. CUSIP-level
  mapping stays an open design question.
- Filer city -> metro is a curated committed table
  (scripts/business/data/filer-city-metros.json, keys "CITY|ST"). After a new
  quarterly drop run with --report-cities to print the biggest unmapped
  cities, extend the table, rerun. Unmapped filers still count in the league
  table; they just do not join a metro row.
- 13F caveats stated on the page, not fixed here: US-listed long positions
  only, consolidated filers (BlackRock files once from NYC), no shorts.

usage: build_owners.py [--src data/form13f-2026q1] [--report-cities] [--self-test]
"""
import argparse, collections, csv, datetime, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "mktcap"))
import common  # noqa: E402

OUT = os.path.join(ROOT, "public", "data", "business", "owners.json")
CITYMAP = os.path.join(HERE, "data", "filer-city-metros.json")
COMPANIES = os.path.join(ROOT, "public", "data", "business", "companies.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")

TOP_MANAGERS = 100
TOP_METROS = 50
TOP_WIDELY = 50
GIANTS = 30
HOLDERS_PER_GIANT = 10

# Tokens that never distinguish issuers ("GOLDMAN SACHS GROUP INC" == "Goldman Sachs").
DROP = {"INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "LTD",
        "LIMITED", "PLC", "HOLDING", "HOLDINGS", "GROUP", "THE", "OF", "DEL",
        "NEW", "AND", "NV", "SA", "SE", "AG", "ADR", "ADS", "GDR", "SPON",
        "UNSPON", "SPONSORED", "UNSPONSORED", "UNSPONS", "CL", "CLASS", "COM",
        "SHS"}

# Site display name -> SEC issuer style, where token-stripping alone won't meet.
GIANT_ALIASES = {"TSMC": "TAIWAN SEMICONDUCTOR MANUFACTURING",
                 "Eli Lilly": "LILLY ELI", "Coca-Cola": "COCA COLA",
                 "AMD": "ADVANCED MICRO DEVICES", "Cisco": "CISCO SYSTEMS",
                 "Samsung": "SAMSUNG ELECTRONICS"}

# Post-titlecase display fixups for filer names.
NAME_FIX = [(re.compile(p), r) for p, r in [
    (r"\bLlc\b", "LLC"), (r"\bLp\b", "LP"), (r"\bL\.p\.", "L.P."),
    (r"\bPlc\b", "PLC"), (r"\bN\.a\.", "N.A."), (r"\bSa\b", "SA"),
    (r"\bAg\b", "AG"), (r"\bUbs\b", "UBS"), (r"\bBny\b", "BNY"),
    (r"\bFmr\b", "FMR"), (r"\bJpmorgan\b", "JPMorgan"),
    (r"\bBlackrock\b", "BlackRock"), (r"\bDe\b$", "DE"), (r"\bUs\b", "US"),
    (r"\bIi\b", "II"), (r"\bIii\b", "III"), (r"\bIv\b$", "IV"),
    (r"\bAqr\b", "AQR"), (r"\bDws\b", "DWS"), (r"\bHsbc\b", "HSBC"),
    (r"\bD\. E\. Shaw\b", "D. E. Shaw"), (r"\bTci\b", "TCI"),
    (r"(?<=\w )Of(?= \w)", "of"), (r"(?<=\w )And(?= \w)", "and"),
]]


# SEC filers abbreviate inconsistently; fold to one spelling before matching.
CANON = {"MFG": "MANUFACTURING", "SYS": "SYSTEMS", "AMER": "AMERICA",
         "HLDGS": "HOLDINGS", "HLDG": "HOLDING"}


def issuer_tokens(name):
    toks = [CANON.get(t, t) for t in re.sub(r"[^A-Z0-9 ]", " ", name.upper()).split()]
    return ([t for t in toks if t not in DROP and len(t) > 1] or toks)[:6]


def tok_eq(a, b):
    """Equal, or truncation: EDGAR issuer names cut off around 28 chars, so
    'MANUFAC' must meet 'MANUFACTURING'. Prefix only from 4 chars to keep
    'VISA' from meeting 'VISTA'."""
    return a == b or (len(a) >= 4 and len(b) >= 4 and (a.startswith(b) or b.startswith(a)))


def match_tokens(issuer, giant):
    """issuer row tokens vs giant tokens: exact set (word-order variants like
    LILLY ELI) or a positional prefix walk (truncations, missing tail tokens).
    Extra issuer tokens beyond the giant's reject - APPLE HOSPITALITY REIT is
    not Apple."""
    if sorted(issuer) == sorted(giant):
        return True
    if not issuer or len(issuer) > len(giant) or len(issuer) < min(2, len(giant)):
        return False
    return all(tok_eq(a, b) for a, b in zip(issuer, giant))


def display_name(raw):
    name = re.sub(r"\s*/[A-Za-z]{2,3}/?\s*$", "", raw.strip())  # "... Corp /DE/"
    if name.isupper() or name.islower():
        name = name.title()
    for pat, rep in NAME_FIX:
        name = pat.sub(rep, name)
    return name


def parse_date(d):  # "31-MAR-2026" -> datetime.date
    return datetime.datetime.strptime(d, "%d-%b-%Y").date()


def pick_accessions(subs, covers):
    """Per CIK choose which filings count: latest restatement wins outright,
    else latest original + NEW HOLDINGS amendments. Returns set of accessions."""
    by_cik = collections.defaultdict(list)
    for s in subs:
        c = covers.get(s["acc"])
        if not c:
            continue
        by_cik[s["cik"]].append({**s, **c})
    chosen = set()
    for rows in by_cik.values():
        rows.sort(key=lambda r: (r["date"], r["acc"]))
        restatements = [r for r in rows if r["amendtype"] == "RESTATEMENT"]
        originals = [r for r in rows if r["isamend"] != "Y"]
        newholdings = [r for r in rows if r["amendtype"] == "NEW HOLDINGS"]
        if restatements:
            chosen.add(restatements[-1]["acc"])
        elif originals:
            chosen.add(originals[-1]["acc"])
            chosen.update(r["acc"] for r in newholdings)
        elif rows:
            chosen.add(rows[-1]["acc"])
    return chosen


def read_tsv(path):
    with open(path, encoding="utf-8", errors="replace", newline="") as fh:
        yield from csv.DictReader(fh, delimiter="\t")


def load_giants():
    comp = json.load(open(COMPANIES, encoding="utf-8"))["companies"]
    top = [c for c in comp if c["source"] == "Public"][:GIANTS]
    giants = []
    for c in top:
        base = GIANT_ALIASES.get(c["name"]) or c["name"].split("(")[0].strip()
        giants.append({"tokens": issuer_tokens(base), "name": c["name"],
                       "symbol": c["symbol"], "cap": c["cap"],
                       "metro": c["metro"], "metroSlug": c["metroSlug"]})
    return giants


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(ROOT, "data", "form13f-2026q1"))
    ap.add_argument("--report-cities", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()

    src = args.src
    subs = []
    for r in read_tsv(os.path.join(src, "SUBMISSION.tsv")):
        if r["SUBMISSIONTYPE"] in ("13F-HR", "13F-HR/A"):
            subs.append({"acc": r["ACCESSION_NUMBER"], "cik": r["CIK"],
                         "type": r["SUBMISSIONTYPE"], "period": r["PERIODOFREPORT"],
                         "date": parse_date(r["FILING_DATE"])})
    period = collections.Counter(s["period"] for s in subs).most_common(1)[0][0]
    subs = [s for s in subs if s["period"] == period]
    accs = {s["acc"] for s in subs}

    covers = {}
    for r in read_tsv(os.path.join(src, "COVERPAGE.tsv")):
        if r["ACCESSION_NUMBER"] in accs:
            covers[r["ACCESSION_NUMBER"]] = {
                "name": r["FILINGMANAGER_NAME"], "city": r["FILINGMANAGER_CITY"],
                "state": r["FILINGMANAGER_STATEORCOUNTRY"],
                "isamend": r["ISAMENDMENT"], "amendtype": r["AMENDMENTTYPE"]}
    chosen = pick_accessions(subs, covers)
    acc_cik = {s["acc"]: s["cik"] for s in subs}
    common.log(f"period {period}: {len(chosen)} filings from "
               f"{len({acc_cik[a] for a in chosen})} managers selected")

    giants = load_giants()
    filer_val = collections.Counter()      # cik -> $
    filer_pos = collections.Counter()      # cik -> rows
    cusip_val = collections.Counter()      # cusip -> $ (no puts/calls)
    cusip_holders = collections.defaultdict(set)   # cusip -> ciks
    cusip_name = {}
    giant_hold = collections.defaultdict(collections.Counter)  # giant idx -> cik -> $
    memo = {}

    def giant_of(name):
        if name not in memo:
            toks = issuer_tokens(name)
            memo[name] = next((i for i, g in enumerate(giants)
                               if match_tokens(toks, g["tokens"])), None)
        return memo[name]

    n = 0
    for r in read_tsv(os.path.join(src, "INFOTABLE.tsv")):
        acc = r["ACCESSION_NUMBER"]
        if acc not in chosen:
            continue
        n += 1
        cik = acc_cik[acc]
        try:
            v = int(float(r["VALUE"] or 0))
        except ValueError:
            continue
        filer_val[cik] += v
        filer_pos[cik] += 1
        if r["PUTCALL"]:
            continue
        cusip = r["CUSIP"]
        cusip_val[cusip] += v
        cusip_holders[cusip].add(cik)
        if cusip not in cusip_name and r["NAMEOFISSUER"]:
            cusip_name[cusip] = r["NAMEOFISSUER"]
        gi = giant_of(r["NAMEOFISSUER"])
        if gi is not None:
            giant_hold[gi][cik] += v
    common.log(f"reduced {n} holdings rows")

    # Latest cover per CIK for names/cities
    cik_cover = {}
    for s in sorted(subs, key=lambda x: (x["date"], x["acc"])):
        if s["acc"] in chosen:
            cik_cover[s["cik"]] = covers[s["acc"]]

    try:
        citymap = json.load(open(CITYMAP, encoding="utf-8"))
    except (OSError, ValueError):
        citymap = {}
    metros = {m["slug"] for m in json.load(open(METROS, encoding="utf-8"))}
    bad = [k for k, v in citymap.items() if v["metroSlug"] not in metros]
    if bad:
        common.log(f"WARNING: {len(bad)} citymap entries with unknown metroSlug: {bad[:8]}")

    def metro_of(cover):
        key = f"{cover['city'].strip().upper()}|{cover['state'].strip().upper()}"
        return citymap.get(key)

    if args.report_cities:
        city_val = collections.Counter()
        city_n = collections.Counter()
        for cik, v in filer_val.items():
            c = cik_cover[cik]
            key = f"{c['city'].strip().upper()}|{c['state'].strip().upper()}"
            city_val[key] += v
            city_n[key] += 1
        print("value_$B\tfilers\tmapped\tcity")
        for key, v in city_val.most_common(150):
            print(f"{v/1e9:10.1f}\t{city_n[key]:5d}\t"
                  f"{'->' + citymap[key]['metroSlug'] if key in citymap else 'UNMAPPED'}\t{key}")
        return 0

    managers = []
    for cik, v in filer_val.most_common(TOP_MANAGERS):
        c = cik_cover[cik]
        m = metro_of(c)
        managers.append({
            "name": display_name(c["name"]), "cik": cik, "value": v,
            "positions": filer_pos[cik],
            "city": display_name(c["city"]) if c["city"] else "",
            "state": c["state"],
            "metro": m["metro"] if m else None, "metroSlug": m["metroSlug"] if m else ""})

    metro_rows = {}
    unmapped_val = unmapped_n = 0
    for cik, v in filer_val.items():
        m = metro_of(cik_cover[cik])
        if not m:
            unmapped_val += v
            unmapped_n += 1
            continue
        row = metro_rows.setdefault(m["metroSlug"], {
            "metro": m["metro"], "metroSlug": m["metroSlug"],
            "country": m.get("country", ""), "value": 0, "filers": 0})
        row["value"] += v
        row["filers"] += 1
    capitals = sorted(metro_rows.values(), key=lambda r: -r["value"])[:TOP_METROS]

    widely = []
    for cusip, holders in sorted(cusip_holders.items(), key=lambda kv: -len(kv[1]))[:TOP_WIDELY]:
        widely.append({"issuer": display_name(cusip_name.get(cusip, cusip)),
                       "cusip": cusip, "holders": len(holders),
                       "value": cusip_val[cusip]})

    giant_rows = []
    for gi, holds in giant_hold.items():
        g = {k: v for k, v in giants[gi].items() if k != "tokens"}
        total = sum(holds.values())
        top = [{"name": display_name(cik_cover[c]["name"]), "cik": c, "value": v}
               for c, v in holds.most_common(HOLDERS_PER_GIANT)]
        giant_rows.append({**g, "reported": total,
                           "pctOfCap": round(100 * total / g["cap"], 1) if g["cap"] else None,
                           "holders": len(holds), "top": top})
    giant_rows.sort(key=lambda r: -(r["cap"] or 0))

    out = {
        "meta": {
            "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "as_of": parse_date(period).isoformat(), "period": period,
            "source": "SEC Form 13F structured data set",
            "filings": len(chosen), "managers": len(filer_val),
            "totalValue": sum(filer_val.values()),
            "mappedValue": sum(r["value"] for r in metro_rows.values()),
            "unmappedManagers": unmapped_n,
            "topManagers": TOP_MANAGERS,
        },
        "managers": managers, "capitals": capitals,
        "widelyHeld": widely, "giants": giant_rows,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    common.log(f"owners: {len(managers)} managers, {len(capitals)} metro capitals, "
               f"{len(widely)} widely held, {len(giant_rows)}/{len(giants)} giants matched; "
               f"total ${sum(filer_val.values())/1e12:.2f}T -> {os.path.relpath(OUT, ROOT)}")


def self_test():
    def m(issuer, giant):
        return match_tokens(issuer_tokens(issuer), issuer_tokens(giant))
    assert m("NVIDIA CORPORATION", "NVIDIA")
    assert m("GOLDMAN SACHS GROUP INC", "Goldman Sachs")
    assert m("BERKSHIRE HATHAWAY INC DEL", "Berkshire Hathaway")
    assert m("ELI LILLY & CO", "LILLY ELI") and m("LILLY ELI & CO", "LILLY ELI")
    assert m("CISCO SYS INC", "CISCO SYSTEMS")
    assert m("BANK AMER CORP", "Bank of America")
    assert m("TAIWAN SEMICONDUCTOR MANUFAC", "TAIWAN SEMICONDUCTOR MANUFACTURING")
    assert not m("APPLE HOSPITALITY REIT INC", "Apple")
    assert not m("TENCENT MUSIC ENTMT GROUP", "Tencent")
    assert not m("TAIWAN FD INC", "TAIWAN SEMICONDUCTOR MANUFACTURING")
    assert display_name("GEODE CAPITAL MANAGEMENT, LLC") == "Geode Capital Management, LLC"
    assert display_name("JPMORGAN CHASE & CO") == "JPMorgan Chase & Co"
    subs = [{"acc": "A1", "cik": "1", "date": datetime.date(2026, 4, 1)},
            {"acc": "A2", "cik": "1", "date": datetime.date(2026, 5, 1)},
            {"acc": "A3", "cik": "2", "date": datetime.date(2026, 4, 2)}]
    covers = {"A1": {"isamend": "", "amendtype": ""},
              "A2": {"isamend": "Y", "amendtype": "RESTATEMENT"},
              "A3": {"isamend": "", "amendtype": ""}}
    assert pick_accessions(subs, covers) == {"A2", "A3"}
    covers["A2"]["amendtype"] = "NEW HOLDINGS"
    assert pick_accessions(subs, covers) == {"A1", "A2", "A3"}
    assert parse_date("31-MAR-2026") == datetime.date(2026, 3, 31)
    print("self-test: 15/15 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
