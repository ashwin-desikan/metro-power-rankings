#!/usr/bin/env python3
"""refresh_congress.py — refresh the US Senate roster and BOTH chambers' party
splits in public/data/us-congress.json from Wikidata. Party splits are COUNTED
from the current-members query (so 218/212/1/4 recomputes itself), never hand-
typed. Executive/Cabinet and House leadership stay curated (rarely change) and
are preserved. Fail-soft per section: a section is left untouched if Wikidata
returns implausible counts. Run with --self-test for offline CI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sanity_ok, bare, load_json, write_json  # noqa

ROOT = Path(__file__).resolve().parents[2]
CONG = ROOT / "public" / "data" / "us-congress.json"
SENATOR_QID = "Q13217683"        # member of the United States Senate
REP_QID = "Q13218630"            # member of the United States House of Representatives
SPECIAL = {"Florida": "florida-united-states", "Maryland": "maryland-united-states",
           "Montana": "montana-united-states"}
def sslug(n): return SPECIAL.get((n or "").strip(), (n or "").strip().lower().replace(" ", "-"))

def _norm_party(p):
    p = (p or "").lower()
    if "republican" in p: return "Republican"
    if "democratic" in p: return "Democratic"
    if "independent" in p: return "Independent"
    return p.title() or "Independent"

def query_members(position_qid, want_state=False):
    import requests
    sel = "?personLabel ?partyLabel" + (" ?districtLabel" if want_state else "")
    q = f"""SELECT {sel} WHERE {{
      ?person p:P39 ?st . ?st ps:P39 wd:{position_qid} .
      FILTER NOT EXISTS {{ ?st pq:P582 ?end }}
      OPTIONAL {{ ?person wdt:P102 ?party }}
      {'OPTIONAL { ?st pq:P768 ?district }' if want_state else ''}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}"""
    r = requests.get("https://query.wikidata.org/sparql", params={"query": q, "format": "json"},
                     headers={"User-Agent": "metro-power-rankings civic-refresh/1.0"}, timeout=180)
    r.raise_for_status()
    rows = []
    for b in r.json()["results"]["bindings"]:
        nm = b.get("personLabel", {}).get("value", "")
        if not sanity_ok(nm):
            continue
        rows.append({"name": nm, "party": _norm_party(b.get("partyLabel", {}).get("value", "")),
                     "state": b.get("districtLabel", {}).get("value", "") if want_state else ""})
    return rows

def counts(rows):
    c = {"Republican": 0, "Democratic": 0, "Independent": 0}
    for r in rows:
        c[r["party"]] = c.get(r["party"], 0) + 1
    return c

def align_state_members(existing_two, incoming_two):
    """Keep class slots; update names/party. Match by name first, fill the rest."""
    out = [dict(m) for m in existing_two]
    used = set()
    for slot in out:
        for i, inc in enumerate(incoming_two):
            if i in used: continue
            if bare(inc["name"]) == bare(slot["name"]):
                slot["name"], slot["party"] = inc["name"], inc["party"]; used.add(i); break
    for slot in out:
        if slot["name"] and bare(slot["name"]) in {bare(i["name"]) for i in incoming_two}:
            continue
        for i, inc in enumerate(incoming_two):
            if i not in used:
                slot["name"], slot["party"] = inc["name"], inc["party"]; used.add(i); break
    return out

def build(existing, senators, sen_counts, rep_counts):
    d = dict(existing)
    # Senate split (counted)
    if 90 <= sum(sen_counts.values()) <= 100:
        d["senate"] = dict(d["senate"])
        d["senate"]["partySplit"] = {**sen_counts, "note": d["senate"]["partySplit"].get("note", "")}
        # roster: align per state, preserving class
        by_state = {}
        for s in senators:
            by_state.setdefault(sslug(s["state"]), []).append(s)
        members = [dict(m) for m in d["senate"]["members"]]
        from collections import defaultdict
        slots = defaultdict(list)
        for idx, m in enumerate(members):
            slots[m["stateSlug"]].append(idx)
        for slug, idxs in slots.items():
            inc = by_state.get(slug, [])
            if len(inc) == 2 and len(idxs) == 2:
                aligned = align_state_members([members[idxs[0]], members[idxs[1]]], inc)
                members[idxs[0]], members[idxs[1]] = aligned[0], aligned[1]
        d["senate"]["members"] = members
    # House split (counted); vacancies = 435 - filled
    filled = sum(rep_counts.values())
    if 400 <= filled <= 435:
        d["house"] = dict(d["house"])
        sp = {**rep_counts, "Vacant": 435 - filled}
        sp["note"] = d["house"]["partySplit"].get("note", "")
        d["house"]["partySplit"] = sp
    return d

def main():
    existing = load_json(CONG, None)
    if not existing:
        print("ABORT: us-congress.json missing"); return
    senators = query_members(SENATOR_QID, want_state=True)
    reps = query_members(REP_QID)
    out = build(existing, senators, counts(senators), counts(reps))
    write_json(CONG, out, sort_keys=False)
    print(f"us-congress.json: senate split {out['senate']['partySplit']}; house split {out['house']['partySplit']}")

def _self_test():
    existing = {"executive": {"president": {"name": "X"}},
                "senate": {"partySplit": {"Republican": 0, "Democratic": 0, "Independent": 0, "note": "keep"},
                           "members": [{"name": "Old A", "state": "Ohio", "stateSlug": "ohio", "party": "Republican", "class": 1},
                                       {"name": "Markwayne Mullin", "state": "Oklahoma", "stateSlug": "oklahoma", "party": "Republican", "class": 2},
                                       {"name": "James Lankford", "state": "Oklahoma", "stateSlug": "oklahoma", "party": "Republican", "class": 3}]},
                "house": {"partySplit": {"Republican": 0, "Democratic": 0, "Vacant": 0, "note": "h"}, "leadership": [{"office": "Speaker", "name": "Mike Johnson", "party": "Republican"}]}}
    senators = [{"name": "Alan Armstrong", "state": "Oklahoma", "party": "Republican"},
                {"name": "James Lankford", "state": "Oklahoma", "party": "Republican"}]
    sc = {"Republican": 53, "Democratic": 45, "Independent": 2}
    rc = {"Republican": 218, "Democratic": 212, "Independent": 1}
    out = build(existing, senators, sc, rc)
    assert out["senate"]["partySplit"]["Republican"] == 53
    ok = {bare(m["name"]) for m in out["senate"]["members"] if m["stateSlug"] == "oklahoma"}
    assert "Alan Armstrong" in ok and "James Lankford" in ok, ok      # Mullin -> Armstrong, class preserved
    assert out["house"]["partySplit"]["Vacant"] == 435 - 431 == 4
    assert out["executive"] == existing["executive"]                  # executive preserved
    assert out["house"]["leadership"] == existing["house"]["leadership"]
    print("refresh_congress self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
