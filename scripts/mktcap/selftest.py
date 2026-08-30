"""Offline self-tests built from the Excel era's real pathologies. No network."""
import sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from fetch_source import parse_public, parse_unicorns_html, norm_num
from build_merged import merge
import common
common.SELFTEST = True  # tags log() output so a fixture-triggered warning
                         # (e.g. merge()'s recycled-ticker guard below) can't
                         # be mistaken for a real production alert

FAIL = []
def check(label, cond):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond: FAIL.append(label)

# 1. Public CSV parse: quoted commas, BOM, text marketcap, zero-mcap delistings
pub_csv = '﻿Rank,Name,Symbol,marketcap,price (USD),country\n' \
    '1,NVIDIA,NVDA,4912260841472,201.0,United States\n' \
    '2,"Alphabet (Google)",GOOG,4223554551808,349.0,United States\n' \
    '3,Strategy,MSTR,"59,670,000,000",171.02,United States\n' \
    '4,GigCapital9,GIXXU,0,10.0,United States\n' \
    '5,,ORPHAN,123,1.0,Nowhere\n'
rows = parse_public(pub_csv.encode("utf-8"))
check("public: BOM+quoted name survives", any(r[1] == "Alphabet (Google)" for r in rows))
check("public: text-with-commas marketcap converts (Strategy/MSTR class)",
      any(r[2] == "MSTR" and r[3] == 59670000000.0 for r in rows))
check("public: blank-name row skipped (split-row class cannot occur, malformed dropped)",
      not any(r[2] == "ORPHAN" for r in rows))
check("public: zero-mcap kept at parse (filtered at merge)", any(r[2] == "GIXXU" for r in rows))

# 2. Unicorn HTML parse
html = """<table><tr><th>Company</th><th>Valuation</th><th>Date</th></tr>
<tr><td>Anthropic</td><td>$965</td><td>2/3/2023</td><td>United States</td><td>San Francisco</td><td>Enterprise Tech</td><td>inv</td></tr>
<tr><td>ByteDance</td><td>$480</td><td>4/7/2017</td><td>China</td><td>Beijing</td><td>Media</td><td>inv</td></tr>
<tr><td>SpaceX</td><td>$400</td><td>1/1/2012</td><td>United States</td><td>Hawthorne</td><td>Industrials</td><td>inv</td></tr>
<tr><td>Bolt</td><td>$8.4</td><td>1/1/2018</td><td>Estonia</td><td>Tallinn</td><td>Mobility</td><td>inv</td></tr>
<tr><td>Bolt</td><td>$1.1</td><td>1/1/2019</td><td>United States</td><td>SF</td><td>Fintech</td><td>inv</td></tr></table>"""
uni = parse_unicorns_html(html.encode())
check("unicorns: header row skipped, 5 data rows parsed", len(uni) == 5)
check("unicorns: $965 -> 965.0 and ISO date", uni[0][1] == 965.0 and uni[0][2] == "2023-02-03")

# 3. Merge: IPO dedup, (Uni) suffix, private 3x, override, collision ids, rank order
pub_rows = [dict(zip(["Rank","Name","Symbol","marketcap","price","country"], r)) for r in rows]
uni_rows = [dict(zip(["Company","ValuationBn","DateJoined","Country","City","Industry","Investors"], u)) for u in uni]
pub_rows.append(dict(Rank="6", Name="SpaceX", Symbol="SPCX", marketcap=2.1e12, price=100.0, country="United States"))
priv = [dict(name="Vitol", revenue=4e11, country="Switzerland"), dict(name="NVIDIA", revenue=1e9, country="US"),
        dict(name="Bolt", revenue=5e9, country="Estonia")]
overrides = [dict(symbol="ByteDance(Uni)", field="marketcap", value="480000000000")]
changes = [dict(old_symbol="GOOG", new_symbol="GOOGL"),           # legit rename: GOOGL absent from feed
           dict(old_symbol="NVDA", new_symbol="MSTR"),            # recycled-ticker class: both live in feed (PHNX.L->PHX.AE, LIFE->ATYR)
           dict(old_symbol="GIXXU", new_symbol="NVDA")]           # old side is a zero-mcap delisting shell: not "live", rename passes through as a no-op
merged, ipo, skipped = merge(pub_rows, uni_rows, priv, changes, overrides)
syms = {m["symbol"]: m for m in merged}
check("merge: SpaceX unicorn suppressed (public SPCX wins)", "SpaceX(Uni)" not in syms and ipo == ["SpaceX"])
check("merge: unicorn suffix + valuation Bn->USD", syms["Anthropic(Uni)"]["marketcap"] == 965e9)
check("merge: ByteDance override applied", syms["ByteDance(Uni)"]["marketcap"] == 480e9)
check("merge: private = 3x revenue", syms["Vitol"]["marketcap"] == 1.2e12)
check("merge: private name-matching public suppressed", sum(1 for m in merged if m["name"]=="NVIDIA") == 1)
check("merge: private name-matching unicorn suppressed (OpenAI/ByteDance class)",
      not any(m["source"]=="Private" and m["name"]=="Bolt" for m in merged))
check("merge: symbol change applied (GOOG->GOOGL)", "GOOGL" in syms and "GOOG" not in syms)
check("merge: recycled-ticker rename SKIPPED (NVDA->MSTR, both live in feed)",
      skipped == [("NVDA", "MSTR")] and "NVDA" in syms and "MSTR" in syms)
check("merge: recycled guard keeps both companies distinct (no collision id minted)",
      not any(m["company_id"].startswith("MSTR#") for m in merged))
check("merge: zero-mcap old side does not trip the guard (GIXXU->NVDA not skipped)",
      ("GIXXU", "NVDA") not in skipped and sum(1 for m in merged if m["symbol"] == "NVDA") == 1)
check("merge: zero-mcap public filtered", "GIXXU" not in syms)
bolts = sorted(m["company_id"] for m in merged if m["symbol"] == "Bolt(Uni)")
check("merge: Bolt collision -> Bolt(Uni) + Bolt(Uni)#2", bolts == ["Bolt(Uni)", "Bolt(Uni)#2"])
ranks = [m["rank"] for m in merged]
vals = [m["marketcap"] for m in merged]
check("merge: rank contiguous + valuation descending",
      ranks == list(range(1, len(merged)+1)) and vals == sorted(vals, reverse=True))

print(f"\n{len(FAIL)} failures" if FAIL else "\nALL SELF-TESTS PASS")
sys.exit(1 if FAIL else 0)
