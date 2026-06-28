#!/usr/bin/env python3
"""Maps billionaires_raw.json onto canonical country slugs, computes age, and
writes public/data/billionaires.json. Run after fetch-billionaires.py."""
import json, sys, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/data/billionaires_raw.json"
OUT = ROOT / "public/data/billionaires.json"
COUNTRIES = ROOT / "public/data/countries.json"

def main():
    rows = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    rows = rows if isinstance(rows, list) else rows.get("countries", rows)
    name_of = {c["slug"]: c.get("name") for c in rows if c.get("slug")}
    # countries.json "isoCode" is actually the country NAME; use the real ISO2
    # codes from country-indicators.json (keyed by our slug).
    ci = json.loads((ROOT / "public/data/country-indicators.json").read_text(encoding="utf-8"))["countries"]
    iso2slug, iso2name = {}, {}
    for slug, v in ci.items():
        iso = str(v.get("iso2") or "").upper()
        if iso:
            iso2slug[iso] = slug
            iso2name[iso] = name_of.get(slug, slug)
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    today = datetime.date.today()
    out = []
    for b in raw:
        cc = (b.get("countryCode") or "").upper()
        age = None
        bd = b.get("birthDate")
        if bd and len(bd) >= 4 and bd[:4].isdigit():
            try:
                d = datetime.date.fromisoformat(bd)
                age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
            except Exception:
                age = today.year - int(bd[:4])
        out.append({
            "rank": b.get("rank"),
            "name": b.get("name"),
            "uri": b.get("uri"),
            "networth": b.get("networth"),
            "countryCode": cc or None,
            "countrySlug": iso2slug.get(cc),
            "countryName": iso2name.get(cc) or (cc or None),
            "industries": b.get("industries") or [],
            "selfMade": b.get("selfMade"),
            "age": age,
            "source": b.get("source") or [],
        })
    out.sort(key=lambda x: (x["rank"] if x["rank"] is not None else 1e9, -(x["networth"] or 0)))
    data = {
        "generated": today.isoformat(),
        "source": "Forbes real-time billionaires via komed3/rtb-api (MIT)",
        "count": len(out),
        "billionaires": out,
    }
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    linked = sum(1 for b in out if b["countrySlug"])
    print(f"wrote {len(out)} billionaires; {linked} linked to a country page")
    if len(out) < 1000:
        sys.exit(2)

if __name__ == "__main__":
    main()
