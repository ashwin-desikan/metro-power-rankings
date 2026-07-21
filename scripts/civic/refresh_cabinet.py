#!/usr/bin/env python3
"""refresh_cabinet.py — refresh the President, Vice President, and Cabinet in
public/data/us-congress.json's `executive` block from Wikidata.

Never previously automated: refresh_congress.py explicitly passes `executive`
through untouched (its own self-test asserts this), so President/VP/Cabinet
only ever changed by hand. Same for House leadership (refresh_house_leadership.py).

Uses civic_common's shared discover_positions_by_sitelinks() /
resolve_current_holders() / pick_holder() -- the two-phase discovery-cache +
hot-path pattern refresh_mayors.py proved for city QIDs, applied to Wikidata
POSITION items, hardened against two live runs against real Wikidata data
(2026-07-21): naive matching pulled in duplicate legacy position items,
decades-old historical secretaries, AND fictional TV characters (Josh Lyman,
Doug Stamper, Jack Ryan) tagged with the real position and never dated. See
civic_common.py's docstrings for the full mechanism.

DRY BY DEFAULT: prints what it would change but writes nothing unless --write
is passed. This pipeline has never run against live Wikidata for long, so
every resolved change still needs a human look before --write, same as any
first run of a new feed. --self-test for offline CI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import (bare, load_json, write_json,  # noqa
                          discover_positions_by_sitelinks, resolve_current_holders)

ROOT = Path(__file__).resolve().parents[2]
CONG = ROOT / "public" / "data" / "us-congress.json"
POSITIONS = Path(__file__).with_name("cabinet-positions.json")

CABINET_OFFICES = [
    # exclude: "vice president of the united states" contains "president of
    # the united states" as a literal substring, so a plain keyword match
    # pulls the VP position in as a false rival candidate (confirmed live:
    # 2026-07-21, Q11699 at 86 sitelinks blocked a clean winner). Filter it
    # back out explicitly rather than loosen the sitelinks-margin safety net.
    {"key": "president", "office": "President of the United States", "keyword": "president of the united states", "exclude": "vice"},
    {"key": "vice-president", "office": "Vice President of the United States", "keyword": "vice president of the united states"},
    {"key": "secretary-of-state", "office": "Secretary of State", "keyword": "secretary of state"},
    {"key": "secretary-of-the-treasury", "office": "Secretary of the Treasury", "keyword": "secretary of the treasury"},
    {"key": "secretary-of-defense", "office": "Secretary of Defense", "keyword": "secretary of defense"},
    {"key": "attorney-general", "office": "Attorney General", "keyword": "attorney general of the united states"},
    {"key": "secretary-of-the-interior", "office": "Secretary of the Interior", "keyword": "secretary of the interior"},
    {"key": "secretary-of-agriculture", "office": "Secretary of Agriculture", "keyword": "secretary of agriculture"},
    {"key": "secretary-of-commerce", "office": "Secretary of Commerce", "keyword": "secretary of commerce"},
    {"key": "secretary-of-labor", "office": "Secretary of Labor", "keyword": "secretary of labor"},
    {"key": "secretary-of-hhs", "office": "Secretary of Health and Human Services", "keyword": "secretary of health and human services"},
    {"key": "secretary-of-hud", "office": "Secretary of Housing and Urban Development", "keyword": "secretary of housing and urban development"},
    {"key": "secretary-of-transportation", "office": "Secretary of Transportation", "keyword": "secretary of transportation"},
    {"key": "secretary-of-energy", "office": "Secretary of Energy", "keyword": "secretary of energy"},
    {"key": "secretary-of-education", "office": "Secretary of Education", "keyword": "secretary of education"},
    {"key": "secretary-of-va", "office": "Secretary of Veterans Affairs", "keyword": "secretary of veterans affairs"},
    {"key": "secretary-of-dhs", "office": "Secretary of Homeland Security", "keyword": "secretary of homeland security"},
    {"key": "chief-of-staff", "office": "White House Chief of Staff", "keyword": "white house chief of staff"},
    {"key": "dni", "office": "Director of National Intelligence", "keyword": "director of national intelligence"},
    {"key": "cia-director", "office": "Director of the Central Intelligence Agency", "keyword": "director of the central intelligence agency"},
    {"key": "ustr", "office": "United States Trade Representative", "keyword": "united states trade representative"},
    {"key": "omb-director", "office": "Director of the Office of Management and Budget", "keyword": "office of management and budget"},
    {"key": "epa-administrator", "office": "Administrator of the Environmental Protection Agency", "keyword": "environmental protection agency"},
    {"key": "sba-administrator", "office": "Administrator of the Small Business Administration", "keyword": "small business administration"},
]
OFFICE_BY_KEY = {o["key"]: o["office"] for o in CABINET_OFFICES}
KEY_BY_OFFICE = {o["office"]: o["key"] for o in CABINET_OFFICES}

def build(existing, holders):
    out = dict(existing)
    exec_ = dict(out.get("executive", {}))
    changed = []

    def apply_single(role_key, role):
        h = holders.get(role_key)
        if not h:
            return role
        prev = role or {}
        if bare(prev.get("name", "")) == bare(h["name"]):
            return role
        changed.append(f"{OFFICE_BY_KEY[role_key]}: {prev.get('name')!r} -> {h['name']!r}")
        return {"name": h["name"], "party": h["party"] or prev.get("party", ""),
                "since": h["start"] or prev.get("since", "")}

    exec_["president"] = apply_single("president", exec_.get("president"))
    exec_["vicePresident"] = apply_single("vice-president", exec_.get("vicePresident"))

    cabinet = [dict(c) for c in exec_.get("cabinet", [])]
    for i, c in enumerate(cabinet):
        role_key = KEY_BY_OFFICE.get(c.get("office"))
        if not role_key:
            continue  # curated office not (yet) in CABINET_OFFICES -- left as-is
        h = holders.get(role_key)
        if not h or bare(c.get("name", "")) == bare(h["name"]):
            continue
        changed.append(f"{c['office']}: {c.get('name')!r} -> {h['name']!r}")
        # Fresh entry, not a spread of `c`: Wikidata gives us no signal for
        # acting-vs-confirmed (the exact gap that produced the Sonderling/
        # Chavez-DeRemer case), so any prior curated "acting" flag must NOT
        # carry forward onto a newly-detected name -- that needs a human to
        # set again deliberately, same as the name/date themselves did here.
        cabinet[i] = {"office": c["office"], "name": h["name"], "since": h["start"] or c.get("since", "")}
    exec_["cabinet"] = cabinet
    out["executive"] = exec_
    return out, changed

def main():
    write = "--write" in sys.argv
    existing = load_json(CONG, None)
    if not existing:
        print("ABORT: us-congress.json missing"); return
    cache = load_json(POSITIONS, {})
    cache = discover_positions_by_sitelinks(CABINET_OFFICES, cache, POSITIONS)
    still_missing = [o["office"] for o in CABINET_OFFICES if o["key"] not in cache]
    if still_missing:
        print(f"  {len(still_missing)} position(s) still unresolved: {still_missing}")
    try:
        holders = resolve_current_holders(cache, OFFICE_BY_KEY)
    except Exception as e:
        print(f"cabinet refresh error ({e}); no changes."); return
    out, changed = build(existing, holders)
    if not changed:
        print("No executive/cabinet changes detected."); return
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
        "senate": {}, "house": {},
        "executive": {
            "president": {"name": "Donald Trump", "party": "Republican", "since": "2025-01-20"},
            "vicePresident": {"name": "JD Vance", "party": "Republican", "since": "2025-01-20"},
            "cabinet": [
                {"office": "Secretary of State", "name": "Marco Rubio", "since": "2025-01-21"},
                {"office": "Director of National Intelligence", "name": "Tulsi Gabbard", "since": "2025-02-12"},
            ],
        },
    }
    # Same person confirmed for president/Secretary of State -> no spurious
    # change; a genuinely new DNI -> update applied and logged.
    holders = {
        "president": {"name": "Donald Trump", "party": "Republican", "start": "2025-01-20"},
        "secretary-of-state": {"name": "Marco Rubio", "party": "Republican", "start": "2025-01-21"},
        "dni": {"name": "Someone New", "party": "Republican", "start": "2026-08-01"},
    }
    out, changed = build(existing, holders)
    assert out["executive"]["president"]["name"] == "Donald Trump"
    assert out["executive"]["vicePresident"]["name"] == "JD Vance"  # untouched, not in holders
    cab = {c["office"]: c for c in out["executive"]["cabinet"]}
    assert cab["Director of National Intelligence"]["name"] == "Someone New"
    assert cab["Director of National Intelligence"]["since"] == "2026-08-01"
    assert cab["Secretary of State"]["name"] == "Marco Rubio"
    assert any("Director of National Intelligence" in c for c in changed)
    assert not any(c.startswith("Secretary of State") for c in changed)
    assert not any("President of the United States" in c for c in changed)

    # No holders at all -> no changes, nothing touched.
    out2, changed2 = build(existing, {})
    assert changed2 == []
    assert out2["executive"] == existing["executive"]

    # A curated "acting" flag must NOT survive a name change onto the new
    # holder (Wikidata gives no acting-vs-confirmed signal) -- confirmed live
    # case: Sonderling took over Labor as Acting Secretary 2026-04-20.
    existing_acting = {
        "senate": {}, "house": {},
        "executive": {
            "president": {"name": "X"}, "vicePresident": {"name": "Y"},
            "cabinet": [{"office": "Secretary of Labor", "name": "Keith Sonderling",
                        "since": "2026-04-20", "acting": True}],
        },
    }
    out3, changed3 = build(existing_acting, {"secretary-of-labor": {"name": "Keith Sonderling", "party": "Republican", "start": "2027-01-05"}})
    assert changed3 == [], changed3  # same person confirmed permanently -> no name change, "acting" flag untouched either way
    assert out3["executive"]["cabinet"][0]["acting"] is True

    out4, changed4 = build(existing_acting, {"secretary-of-labor": {"name": "Someone Else", "party": "Republican", "start": "2027-06-01"}})
    assert any("Secretary of Labor" in c for c in changed4)
    assert "acting" not in out4["executive"]["cabinet"][0], out4["executive"]["cabinet"][0]

    print("refresh_cabinet self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
