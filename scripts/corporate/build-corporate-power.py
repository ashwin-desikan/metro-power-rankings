#!/usr/bin/env python3
"""build-corporate-power.py - Corporate/market power feed for the /power ranking.

Reuses the SAME weekly market-cap data that feeds the metro site: the MktCap_Data
sheet of MetroAreas.xlsx (populated weekly from the companiesmarketcap.com export).
Joins the top companies to a curated company -> CEO map and writes
public/data/corporate-power.json = [{name, company, role, valuationB, metro,
metroSlug, source}], sorted by valuation. build-power-ranking.py consumes this the
way it consumes billionaires.json. Founder-CEOs who are also billionaires dedupe
by name in the ranking builder (highest score wins), so no double counting.

Run whenever the weekly market-cap pull refreshes the workbook. CEO map is curated
(CEOs change rarely); update a line when a chief executive changes.
"""
import json, sys, os
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "MetroAreas.xlsx")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
OUT = os.path.join(ROOT, "public", "data", "corporate-power.json")

# Company name (exactly as in MktCap_Data) -> current chief executive.
# Curated: only companies whose CEO we can state with confidence. Founder-CEOs
# (Musk, Zuckerberg) are included so their company shows the right person, then
# dedupe against their billionaire entry in the ranking builder.
CEO_MAP = {
    "NVIDIA": "Jensen Huang",
    "Apple": "Tim Cook",
    "Alphabet (Google)": "Sundar Pichai",
    "Microsoft": "Satya Nadella",
    "Amazon": "Andy Jassy",
    "TSMC": "C.C. Wei",
    "SpaceX": "Elon Musk",
    "Broadcom": "Hock Tan",
    "Saudi Aramco": "Amin H. Nasser",
    "Samsung": "Lee Jae-yong",
    "Tesla": "Elon Musk",
    "Meta Platforms (Facebook)": "Mark Zuckerberg",
    "Micron Technology": "Sanjay Mehrotra",
    "SK Hynix": "Kwak Noh-jung",
    "Eli Lilly": "David Ricks",
    "Anthropic": "Dario Amodei",
    "AMD": "Lisa Su",
    "OpenAI": "Sam Altman",
    "ASML": "Christophe Fouquet",
    "Vitol": "Russell Hardy",
}

def main():
    metros = json.load(open(METROS, encoding="utf-8"))
    metros = metros if isinstance(metros, list) else metros.get("metros", metros)
    name2slug = {m.get("name"): m["slug"] for m in metros}

    wb = openpyxl.load_workbook(WB, read_only=True, data_only=True)
    ws = wb["MktCap_Data"]
    best = {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or len(row) < 3:
            continue
        metro, val, name = row[0], row[1], row[2]
        source = row[3] if len(row) > 3 else ""
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        if not name or not val:
            continue
        if name not in best or val > best[name][0]:
            best[name] = (val, metro, source)
    wb.close()

    out = []
    for company, ceo in CEO_MAP.items():
        if company not in best:
            continue
        val, metro, source = best[company]
        out.append({
            "name": ceo,
            "company": company,
            "role": f"CEO, {company}",
            "valuationB": round(val / 1e9, 1),
            "metro": metro,
            "metroSlug": name2slug.get(metro, ""),
            "source": source or "",
        })
    out.sort(key=lambda x: -x["valuationB"])
    json.dump(out, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"wrote {len(out)} companies -> {OUT}")
    for e in out:
        print(f"  {e['valuationB']:>8.1f}B  {e['metroSlug'] or '(no slug)':22} {e['name']} — {e['company']}")

if __name__ == "__main__":
    main()
