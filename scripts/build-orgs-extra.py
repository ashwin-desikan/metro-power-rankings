"""
build-orgs-extra.py
Merges scripts/data/subregional-orgs.json into public/data/country-orgs.json.

The eighteen original organisations come from Ashwin's international_orgs.csv
workbook through scripts/build-orgs-data.py; that stays the source for them.
The subregional and trade bodies added on 2026-09-10 (Mercosur, ECOWAS, SADC,
CARICOM, RCEP ...) live in the JSON here, keyed by country NAME as
countries.json spells it, and this script resolves names to slugs and writes
the memberships beside the workbook's.

🔴 IDEMPOTENT AND OWNED: every org key this file defines is removed from every
country first, then re-added, so a member dropped from the JSON is dropped
from the site. The workbook's keys are never touched.

🔴 A NAME THAT DOES NOT RESOLVE FAILS THE BUILD. A silent skip would publish
Mercosur without Brazil.

  python scripts/build-orgs-extra.py            # write
  python scripts/build-orgs-extra.py --check    # resolve only, write nothing
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "scripts" / "data" / "subregional-orgs.json"
OUT = ROOT / "public" / "data" / "country-orgs.json"


def normalize(s: str) -> str:
    return s.replace("’", "'").replace("‘", "'")


def main(check_only: bool) -> int:
    countries = json.load(open(ROOT / "public" / "data" / "countries.json", encoding="utf-8"))
    name_to_slug = {normalize(c["name"]): c["slug"] for c in countries}
    spec = json.load(open(SRC, encoding="utf-8"))
    orgs = spec["orgs"]
    data = json.load(open(OUT, encoding="utf-8"))
    mine = {o["key"] for o in orgs}
    for slug, m in data.items():
        for k in list(m):
            if k in mine:
                del m[k]
    bad = []
    counts = {}
    for o in orgs:
        for status, names in o["members"].items():
            for name in names:
                slug = name_to_slug.get(normalize(name))
                if not slug:
                    bad.append((o["key"], name)); continue
                data.setdefault(slug, {})[o["key"]] = status
                counts[o["key"]] = counts.get(o["key"], 0) + (1 if status == "Member" else 0)
    if bad:
        for k, n in bad:
            print("UNRESOLVED %s: %r" % (k, n))
        return 1
    # Overrides for the workbook's organisations: a status sets, null removes.
    for org, fixes in spec.get("overrides", {}).items():
        if org.startswith("_"):
            continue
        for name, status in fixes.items():
            slug = name_to_slug.get(normalize(name))
            if not slug:
                bad.append((org, name)); continue
            if status is None:
                data.get(slug, {}).pop(org, None)
            else:
                data.setdefault(slug, {})[org] = status
    if bad:
        for k, n in bad:
            print("UNRESOLVED %s: %r" % (k, n))
        return 1
    for o in orgs:
        print("%-14s %2d members" % (o["key"], counts.get(o["key"], 0)))
    data = {k: v for k, v in data.items() if v and not k.startswith("_")}
    # _meta rides in the file: the verification date on /orgs, and the
    # data-currency gate's asOf. lib/orgs.ts skips the key when it iterates.
    meta = spec.get("_meta", {})
    verified = (meta.get("verified") or "")[:10] or meta.get("asOf")
    data["_meta"] = {"asOf": verified, "verified": verified,
                     "how": "Every organisation checked against its own site or current membership page on the date given; scripts/orgs/check_memberships.py compares against Wikidata monthly and opens an issue on any addition."}
    if check_only:
        print("--check: nothing written"); return 0
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, sort_keys=True)
    print("Written %d countries -> %s (%d orgs from %s)" % (len(data), OUT.relative_to(ROOT), len(orgs), SRC.name))
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
