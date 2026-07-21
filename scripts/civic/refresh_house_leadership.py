#!/usr/bin/env python3
"""refresh_house_leadership.py — refresh House leadership (Speaker, Majority/
Minority Leader, Majority/Minority Whip, Republican Conference Chair,
Democratic Caucus Chair) in public/data/us-congress.json's `house.leadership`
block from Wikidata.

Never previously automated -- same passthrough gap as executive/Cabinet
(refresh_congress.py explicitly leaves `house.leadership` untouched, own
self-test asserts it). Uses the same shared discovery-cache + hot-path
machinery as refresh_cabinet.py (civic_common.discover_positions_by_sitelinks
/ resolve_current_holders / pick_holder) -- see civic_common.py's docstrings
for the full mechanism and the live-run failure modes it's hardened against.

Majority Leader/Whip and Minority Leader/Whip are ROLE labels, not
party-fixed: whichever party controls the House holds Majority Leader/Whip,
so `party` (unlike the Cabinet, which has none) is refreshed here too --
pick_holder()'s "latest start date wins" logic already resolves this
correctly regardless of which party currently holds the role.

DRY BY DEFAULT: prints what it would change but writes nothing unless --write
is passed. --self-test for offline CI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import (bare, load_json, write_json,  # noqa
                          discover_positions_by_sitelinks, resolve_current_holders)

ROOT = Path(__file__).resolve().parents[2]
CONG = ROOT / "public" / "data" / "us-congress.json"
POSITIONS = Path(__file__).with_name("house-leadership-positions.json")

HOUSE_LEADERSHIP_OFFICES = [
    {"key": "speaker", "office": "Speaker of the House",
     "keyword": "speaker of the united states house of representatives"},
    # exclude "senate": Senate has its own Majority/Minority Leader and Whip
    # positions, also US-jurisdiction, that would otherwise be false rivals
    # to the House ones under the same bare "majority leader" style keyword.
    {"key": "majority-leader", "office": "Majority Leader", "keyword": "majority leader", "exclude": "senate"},
    {"key": "majority-whip", "office": "Majority Whip", "keyword": "majority whip", "exclude": "senate"},
    {"key": "republican-conference-chair", "office": "Republican Conference Chair", "keyword": "republican conference"},
    {"key": "minority-leader", "office": "Minority Leader", "keyword": "minority leader", "exclude": "senate"},
    {"key": "minority-whip", "office": "Minority Whip", "keyword": "minority whip", "exclude": "senate"},
    {"key": "democratic-caucus-chair", "office": "Democratic Caucus Chair", "keyword": "democratic caucus"},
]
OFFICE_BY_KEY = {o["key"]: o["office"] for o in HOUSE_LEADERSHIP_OFFICES}
KEY_BY_OFFICE = {o["office"]: o["key"] for o in HOUSE_LEADERSHIP_OFFICES}

def build(existing, holders):
    out = dict(existing)
    house = dict(out.get("house", {}))
    leadership = [dict(l) for l in house.get("leadership", [])]
    changed = []
    for i, l in enumerate(leadership):
        role_key = KEY_BY_OFFICE.get(l.get("office"))
        if not role_key:
            continue  # curated office not (yet) in HOUSE_LEADERSHIP_OFFICES -- left as-is
        h = holders.get(role_key)
        if not h or bare(l.get("name", "")) == bare(h["name"]):
            continue
        changed.append(f"{l['office']}: {l.get('name')!r} ({l.get('party')}) -> {h['name']!r} ({h['party']})")
        leadership[i] = {"office": l["office"], "name": h["name"], "party": h["party"] or l.get("party", "")}
    house["leadership"] = leadership
    out["house"] = house
    return out, changed

def main():
    write = "--write" in sys.argv
    existing = load_json(CONG, None)
    if not existing:
        print("ABORT: us-congress.json missing"); return
    cache = load_json(POSITIONS, {})
    cache = discover_positions_by_sitelinks(HOUSE_LEADERSHIP_OFFICES, cache, POSITIONS)
    still_missing = [o["office"] for o in HOUSE_LEADERSHIP_OFFICES if o["key"] not in cache]
    if still_missing:
        print(f"  {len(still_missing)} position(s) still unresolved: {still_missing}")
    try:
        holders = resolve_current_holders(cache, OFFICE_BY_KEY)
    except Exception as e:
        print(f"house leadership refresh error ({e}); no changes."); return
    out, changed = build(existing, holders)
    if not changed:
        print("No House leadership changes detected."); return
    print(f"{len(changed)} change(s) detected:")
    for c in changed:
        print(f"  {c}")
    if write:
        write_json(CONG, out, sort_keys=False)
        print("Written.")
    else:
        print("DRY RUN (pass --write to apply once reviewed).")

def _self_test():
    existing = {
        "senate": {}, "executive": {},
        "house": {
            "partySplit": {"Republican": 220, "Democratic": 213, "Vacant": 2, "note": ""},
            "leadership": [
                {"office": "Speaker of the House", "name": "Mike Johnson", "party": "Republican"},
                {"office": "Majority Leader", "name": "Steve Scalise", "party": "Republican"},
                {"office": "Minority Leader", "name": "Hakeem Jeffries", "party": "Democratic"},
            ],
        },
    }
    # Same person confirmed -> no spurious change.
    holders = {"speaker": {"name": "Mike Johnson", "party": "Republican", "start": "2023-10-25"},
               "minority-leader": {"name": "Hakeem Jeffries", "party": "Democratic", "start": "2023-01-03"}}
    out, changed = build(existing, holders)
    assert changed == [], changed
    assert out["house"]["leadership"] == existing["house"]["leadership"]

    # A genuine leadership change -- e.g. the House flips control, so
    # Majority Leader flips from Republican to Democratic. Party must update
    # alongside name, unlike the Cabinet feed (which has no party field).
    holders2 = {"majority-leader": {"name": "New Majority Leader", "party": "Democratic", "start": "2027-01-03"}}
    out2, changed2 = build(existing, holders2)
    ml = next(l for l in out2["house"]["leadership"] if l["office"] == "Majority Leader")
    assert ml["name"] == "New Majority Leader" and ml["party"] == "Democratic", ml
    assert any("Majority Leader" in c for c in changed2)
    # Untouched rows stay byte-identical.
    assert next(l for l in out2["house"]["leadership"] if l["office"] == "Speaker of the House") \
        == existing["house"]["leadership"][0]

    # No holders at all -> no changes.
    out3, changed3 = build(existing, {})
    assert changed3 == []
    assert out3["house"]["leadership"] == existing["house"]["leadership"]

    print("refresh_house_leadership self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
