#!/usr/bin/env python3
"""refresh_congress.py — refresh the US Senate roster and BOTH chambers' party
splits in public/data/us-congress.json from Wikidata. Splits are COUNTED from
the current-members query. Executive/Cabinet + House leadership preserved.
Light queries (party by QID, no label service for the 435-rep count) via
civic_common.sparql (POST + retries) because the public endpoint 504s on heavy
label-joined queries. --self-test for offline CI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sanity_ok, bare, load_json, write_json, sparql, qid  # noqa

ROOT = Path(__file__).resolve().parents[2]
CONG = ROOT / "public" / "data" / "us-congress.json"
SENATOR_QID = "Q13217683"
REP_QID = "Q13218630"
PARTY = {"Q29468": "Republican", "Q29552": "Democratic"}
SPECIAL = {"Florida": "florida-united-states", "Maryland": "maryland-united-states",
           "Montana": "montana-united-states"}
def sslug(n): return SPECIAL.get((n or "").strip(), (n or "").strip().lower().replace(" ", "-"))
def party_name(quri): return PARTY.get(qid(quri), "Independent")

def query_senators():
    q = f"""SELECT ?personLabel ?party ?districtLabel WHERE {{
      ?person p:P39 ?st . ?st ps:P39 wd:{SENATOR_QID} .
      FILTER NOT EXISTS {{ ?st pq:P582 ?end }}
      OPTIONAL {{ ?person wdt:P102 ?party }}
      OPTIONAL {{ ?st pq:P768 ?district }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}"""
    seen = {}
    for b in sparql(q):
        nm = b.get("personLabel", {}).get("value", "")
        if not sanity_ok(nm):
            continue
        seen[nm] = {"name": nm, "party": party_name(b.get("party", {}).get("value", "")),
                    "state": b.get("districtLabel", {}).get("value", "")}
    return list(seen.values())

def query_rep_counts():
    q = f"""SELECT ?person ?party WHERE {{
      ?person p:P39 ?st . ?st ps:P39 wd:{REP_QID} .
      FILTER NOT EXISTS {{ ?st pq:P582 ?end }}
      OPTIONAL {{ ?person wdt:P102 ?party }}
    }}"""
    by_person = {}
    for b in sparql(q):
        per = b.get("person", {}).get("value", "")
        pq = b.get("party", {}).get("value", "")
        if per and (per not in by_person or pq):
            by_person[per] = party_name(pq)
    c = {"Republican": 0, "Democratic": 0, "Independent": 0}
    for pn in by_person.values():
        c[pn] = c.get(pn, 0) + 1
    return c

def counts(rows):
    c = {"Republican": 0, "Democratic": 0, "Independent": 0}
    for r in rows:
        c[r["party"]] = c.get(r["party"], 0) + 1
    return c

def align_state_members(existing_two, incoming_two):
    out = [dict(m) for m in existing_two]; used = set()
    for slot in out:
        for i, inc in enumerate(incoming_two):
            if i in used: continue
            if bare(inc["name"]) == bare(slot["name"]):
                slot["name"], slot["party"] = inc["name"], inc["party"]; used.add(i); break
    inc_names = {bare(i["name"]) for i in incoming_two}
    for slot in out:
        if slot["name"] and bare(slot["name"]) in inc_names: continue
        for i, inc in enumerate(incoming_two):
            if i not in used:
                slot["name"], slot["party"] = inc["name"], inc["party"]; used.add(i); break
    return out

def build(existing, senators, sen_counts, rep_counts):
    from collections import defaultdict
    d = dict(existing)
    if 90 <= sum(sen_counts.values()) <= 100:
        d["senate"] = dict(d["senate"])
        d["senate"]["partySplit"] = {**sen_counts, "note": d["senate"]["partySplit"].get("note", "")}
        by_state = defaultdict(list)
        for s in senators:
            by_state[sslug(s["state"])].append(s)
        members = [dict(m) for m in d["senate"]["members"]]
        slots = defaultdict(list)
        for idx, m in enumerate(members):
            slots[m["stateSlug"]].append(idx)
        for slug, idxs in slots.items():
            inc = by_state.get(slug, [])
            if len(inc) == 2 and len(idxs) == 2:
                a = align_state_members([members[idxs[0]], members[idxs[1]]], inc)
                members[idxs[0]], members[idxs[1]] = a[0], a[1]
        d["senate"]["members"] = members
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
    senators = query_senators()
    sen_counts = counts(senators)
    rep_counts = query_rep_counts()
    if sum(sen_counts.values()) < 90 and sum(rep_counts.values()) < 400:
        print("ABORT: both chambers implausible; writing nothing."); return
    out = build(existing, senators, sen_counts, rep_counts)
    write_json(CONG, out, sort_keys=False)
    print(f"us-congress.json: senate {out['senate']['partySplit']}; house {out['house']['partySplit']}")

def _self_test():
    existing = {"executive": {"president": {"name": "X"}},
                "senate": {"partySplit": {"Republican": 0, "Democratic": 0, "Independent": 0, "note": "keep"},
                           "members": [{"name": "Markwayne Mullin", "state": "Oklahoma", "stateSlug": "oklahoma", "party": "Republican", "class": 2},
                                       {"name": "James Lankford", "state": "Oklahoma", "stateSlug": "oklahoma", "party": "Republican", "class": 3}]},
                "house": {"partySplit": {"Republican": 0, "Democratic": 0, "Vacant": 0, "note": "h"}, "leadership": [{"office": "Speaker", "name": "Mike Johnson", "party": "Republican"}]}}
    senators = [{"name": "Alan Armstrong", "state": "Oklahoma", "party": "Republican"},
                {"name": "James Lankford", "state": "Oklahoma", "party": "Republican"}]
    out = build(existing, senators, {"Republican": 53, "Democratic": 45, "Independent": 2},
                {"Republican": 218, "Democratic": 212, "Independent": 1})
    assert out["senate"]["partySplit"]["Republican"] == 53
    ok = {bare(m["name"]) for m in out["senate"]["members"] if m["stateSlug"] == "oklahoma"}
    assert "Alan Armstrong" in ok and "James Lankford" in ok, ok
    assert out["house"]["partySplit"]["Vacant"] == 4
    assert out["executive"] == existing["executive"]
    assert out["house"]["leadership"] == existing["house"]["leadership"]
    assert party_name("http://www.wikidata.org/entity/Q29468") == "Republican"
    assert party_name("http://www.wikidata.org/entity/Q999") == "Independent"
    print("refresh_congress self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
