"""
build-leaders-data.py
Reads world_leaders_single_table.xlsx and emits one JSON file per country slug
into data/leaders/. Russia, Soviet Union, and Russian Empire are merged under
the "russia" slug with era labels. China ROC/PRC eras are labelled in-place.
Germany gets era labels by role group.
"""

import json, os, sys, argparse
from pathlib import Path
from collections import defaultdict

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl not found — run: pip install openpyxl --break-system-packages")

ROOT = Path(__file__).parent.parent  # scripts/ -> project root
OUT_DIR = ROOT / "public" / "data" / "leaders"

SLUG_MAP = {
    "Australia":       "australia",
    "Canada":          "canada",
    "China":           "china",
    "France":          "france",
    "Germany":         "germany",
    "India":           "india",
    "Italy":           "italy",
    "Japan":           "japan",
    "Mexico":          "mexico",
    "New Zealand":     "new-zealand",
    "Russia":          "russia",
    "Russian Empire":  "russia",
    "Soviet Union":    "russia",
    "United Kingdom":  "united-kingdom",
    "United States":   "united-states",
    # G20 batch 2
    "Brazil":          "brazil",
    "South Korea":     "south-korea",
    "Saudi Arabia":    "saudi-arabia",
    "Argentina":       "argentina",
    "Indonesia":       "indonesia",
    "South Africa":    "south-africa",
    "Turkey":          "turkey",
    # Batch 3
    "Spain":           "spain",
    "Netherlands":     "netherlands",
    "Poland":          "poland",
    "Ukraine":         "ukraine",
    "Israel":          "israel",
    "Iran":            "iran",
    "North Korea":     "north-korea",
    "Pakistan":        "pakistan",
    "Bangladesh":      "bangladesh",
    "Ireland":         "ireland",
    "Singapore":       "singapore",
    "Nigeria":         "nigeria",
    # Nations (sub-UK)
    "England":         "england",
    "Scotland":        "scotland",
}

ERA_MAP = {
    "Russian Empire": "Imperial Era",
    "Soviet Union":   "Soviet Era",
    "Russia":         "Modern Russia",
}

def china_era(role):
    r = role.lower()
    return "Republic of China (ROC)" if ("roc" in r or "taiwan" in r) else "People's Republic of China (PRC)"

GERMANY_ERA_MAP = {
    "Imperial Chancellor":  "German Empire",
    "Weimar Chancellor":    "Weimar Republic",
    "Chancellor (1 day)":   "Weimar Republic",
    "Chancellor (brief)":   "Weimar Republic",
    "Chancellor/Fuhrer":    "Nazi Germany",
    "Federal Chancellor":   "Federal Republic",
}
def germany_era(role):
    return GERMANY_ERA_MAP.get(role, "Federal Republic")

def parse_date(val):
    if not val: return None
    s = str(val).strip()
    if s.lower() in ("", "incumbent"): return None
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return s

ERA_ORDER = {"Imperial Era": 0, "Soviet Era": 1, "Modern Russia": 2}


def build(xlsx: Path) -> None:
    print(f"Reading {xlsx}")
    wb = openpyxl.load_workbook(xlsx)
    ws = wb.active

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    buckets: dict[str, list] = defaultdict(list)

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        source, role, name, start_raw, end_raw, tenure, party = row
        slug = SLUG_MAP.get(str(source).strip())
        if not slug:
            print(f"  SKIP: {source}")
            continue

        start_str = parse_date(str(start_raw).strip() if start_raw else None)
        end_raw_str = str(end_raw).strip() if end_raw else None
        is_current = bool(end_raw_str and end_raw_str.lower() == "incumbent")
        end_str = None if is_current else parse_date(end_raw_str)

        era = None
        if slug == "russia":
            era = ERA_MAP.get(str(source).strip())
        elif slug == "china":
            era = china_era(str(role).strip())
        elif slug == "germany":
            era = germany_era(str(role).strip())

        party_clean = str(party).strip() if party else None
        if party_clean and party_clean.lower().endswith("; incumbent"):
            party_clean = party_clean[: -len("; incumbent")].rstrip(";").strip()

        buckets[slug].append({
            "name": str(name).strip(),
            "role": str(role).strip(),
            "start": start_str,
            "end": end_str,
            "current": is_current,
            "tenure": str(tenure).strip() if tenure else None,
            "party": party_clean or None,
            "era": era,
            "_sort": start_str or "0000-00-00",
        })

    for slug, records in buckets.items():
        if slug == "russia":
            records.sort(key=lambda r: (ERA_ORDER.get(r["era"] or "", 9), r["_sort"]))
        else:
            records.sort(key=lambda r: r["_sort"])
        for r in records:
            del r["_sort"]

        out = OUT_DIR / f"{slug}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        print(f"  {slug}: {len(records)} leaders → data/leaders/{slug}.json")

    print(f"\nDone. {len(buckets)} files.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build world leaders JSON data.")
    parser.add_argument("--xlsx", required=True, help="Path to world_leaders_single_table.xlsx")
    args = parser.parse_args()

    xlsx_path = Path(args.xlsx)
    if not xlsx_path.exists():
        sys.exit(f"File not found: {xlsx_path}")
    build(xlsx_path)
