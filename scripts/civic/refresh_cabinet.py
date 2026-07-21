#!/usr/bin/env python3
"""refresh_cabinet.py — refresh the President, Vice President, and Cabinet in
public/data/us-congress.json's `executive` block from Wikidata.

Never previously automated: refresh_congress.py explicitly passes `executive`
through untouched (its own self-test asserts this), so President/VP/Cabinet
only ever changed by hand. Same for the mayors/governors/congress feeds this
was extended to match.

Two-phase design (cabinet-positions.json caches phase 1's output), same
pattern as refresh_mayors.py's city-QID cache:
  1. Position discovery (cold-start / self-healing): ONE query for every
     Wikidata item with jurisdiction (P1001) = United States (Q30), matched
     in Python against the curated office list by a keyword substring on the
     label. Jurisdiction is what disambiguates a federal role from a
     state-level one sharing the same name (e.g. "Secretary of State" of
     Texas vs of the United States). 0 or 2+ candidates for an office is
     logged and left uncached rather than guessed.
  2. Holder lookup (hot weekly path): one VALUES query over the cached
     position QIDs for the CURRENT holder (P39, no end date). Requires
     exactly one match per position; 0 or 2+ is logged and left unresolved
     (a genuine vacancy, or a transition Wikidata hasn't settled).

DRY BY DEFAULT: prints what it would change but writes nothing unless --write
is passed. This pipeline has never run before, so the first pass against real
Wikidata data needs a human look before it touches the live site.
--self-test for offline CI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sanity_ok, bare, load_json, write_json, sparql, qid  # noqa

ROOT = Path(__file__).resolve().parents[2]
CONG = ROOT / "public" / "data" / "us-congress.json"
POSITIONS = Path(__file__).with_name("cabinet-positions.json")
US = "Q30"

CABINET_OFFICES = [
    {"key": "president", "office": "President of the United States", "keyword": "president of the united states"},
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

def discover_missing_positions(cache):
    missing = [o for o in CABINET_OFFICES if o["key"] not in cache]
    if not missing:
        return cache
    q = f"""SELECT ?position ?label WHERE {{
      ?position wdt:P1001 wd:{US} .
      ?position rdfs:label ?label . FILTER(LANG(?label) = "en")
    }}"""
    try:
        rows = sparql(q, timeout=90, retries=2)
    except Exception as e:
        print(f"  position discovery failed ({e}); will retry next run")
        return cache
    by_label = {}
    for b in rows:
        lbl = b.get("label", {}).get("value", "").strip().lower()
        pos_uri = b.get("position", {}).get("value", "")
        if lbl and pos_uri:
            by_label.setdefault(lbl, set()).add(qid(pos_uri))
    found_any = False
    for o in missing:
        kw = o["keyword"]
        candidates = set()
        for lbl, qids in by_label.items():
            if kw in lbl:
                candidates |= qids
        if len(candidates) == 1:
            cache[o["key"]] = next(iter(candidates))
            found_any = True
        elif len(candidates) == 0:
            print(f"  no US-jurisdiction position matched {o['office']!r} (keyword {kw!r}); will retry next run")
        else:
            print(f"  {len(candidates)} candidate positions matched {o['office']!r} "
                  f"(keyword {kw!r}): {sorted(candidates)} -- ambiguous, not caching, needs a manual look")
    if found_any:
        write_json(POSITIONS, cache, sort_keys=True)
    return cache

def resolve_holders(cache):
    """Returns {key: {name, party, start}} for positions with exactly one
    current (no end-date) holder. 0 or 2+ holders for a position is logged
    and omitted rather than guessed."""
    qid_to_key = {q: k for k, q in cache.items() if q}
    if not qid_to_key:
        return {}
    values = " ".join(f"wd:{q}" for q in qid_to_key)
    query = f"""SELECT ?position ?personLabel ?partyLabel ?start WHERE {{
      VALUES ?position {{ {values} }}
      ?person p:P39 ?st . ?st ps:P39 ?position .
      FILTER NOT EXISTS {{ ?st pq:P582 ?end }}
      OPTIONAL {{ ?person wdt:P102 ?party }}
      OPTIONAL {{ ?st pq:P580 ?start }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}"""
    rows = sparql(query, timeout=120)
    by_key = {}
    for b in rows:
        key = qid_to_key.get(qid(b.get("position", {}).get("value", "")))
        nm = b.get("personLabel", {}).get("value", "")
        if not key or not sanity_ok(nm):
            continue
        by_key.setdefault(key, []).append({
            "name": nm,
            "party": b.get("partyLabel", {}).get("value", ""),
            "start": (b.get("start", {}).get("value", "") or "")[:10],
        })
    out = {}
    for key, holders in by_key.items():
        if len(holders) == 1:
            out[key] = holders[0]
        else:
            names = [h["name"] for h in holders]
            print(f"  {OFFICE_BY_KEY.get(key, key)}: {len(holders)} current holders from Wikidata "
                  f"{names} -- ambiguous, left unchanged")
    return out

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
        cabinet[i] = {**c, "name": h["name"], "since": h["start"] or c.get("since", "")}
    exec_["cabinet"] = cabinet
    out["executive"] = exec_
    return out, changed

def main():
    write = "--write" in sys.argv
    existing = load_json(CONG, None)
    if not existing:
        print("ABORT: us-congress.json missing"); return
    cache = load_json(POSITIONS, {})
    cache = discover_missing_positions(cache)
    still_missing = [o["office"] for o in CABINET_OFFICES if o["key"] not in cache]
    if still_missing:
        print(f"  {len(still_missing)} position(s) still unresolved: {still_missing}")
    try:
        holders = resolve_holders(cache)
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

    print("refresh_cabinet self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
