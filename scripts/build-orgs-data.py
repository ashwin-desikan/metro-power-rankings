"""
build-orgs-data.py
Reads international_orgs.csv from OneDrive Excel Files and emits
data/country-orgs.json keyed by country slug.

Usage:
  python3 scripts/build-orgs-data.py --csv "C:/Users/ashwi/OneDrive/Excel Files/international_orgs.csv"
"""
import json, csv, sys, argparse
from pathlib import Path

ROOT = Path(__file__).parent.parent

def build(csv_path: Path) -> None:
    countries = json.load(open(ROOT / "public" / "data" / "countries.json"))
    # Normalize both sides: replace curly apostrophes with straight ones
    def normalize(s: str) -> str:
        return s.replace("’", "'").replace("‘", "'")
    name_to_slug = {normalize(c["name"]): c["slug"] for c in countries}

    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))

    # Explicit overrides for names that differ between CSV and countries.json
    OVERRIDES: dict[str, str] = {
        "Côte d’Ivoire": "cote-divoire",  # right single quotation mark variant
        "Côte d'Ivoire":      "cote-divoire",  # straight apostrophe fallback
    }
    orgs_data = {}
    unmapped = set()

    for row in rows:
        raw = row["Country"]
        name = normalize(raw)
        slug = name_to_slug.get(name) or OVERRIDES.get(raw) or OVERRIDES.get(name)
        if not slug:
            unmapped.add(name)
            continue
        memberships = {org: status for org, status in row.items()
                       if org != "Country" and status}
        if memberships:
            orgs_data[slug] = memberships

    out = ROOT / "public" / "data" / "country-orgs.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(orgs_data, f, ensure_ascii=False, sort_keys=True)

    print(f"Written {len(orgs_data)} countries → data/country-orgs.json")
    if unmapped:
        print(f"Unmapped: {sorted(unmapped)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to international_orgs.csv")
    args = parser.parse_args()
    csv_path = Path(args.csv)
    if not csv_path.exists():
        sys.exit(f"File not found: {csv_path}")
    build(csv_path)
