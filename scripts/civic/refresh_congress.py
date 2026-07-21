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
            elif len(inc) == 1 and len(idxs) == 2:
                # One senator confirmed current; the other dropped out of
                # Wikidata's current-holders query (death, resignation,
                # expulsion...) with no successor recorded there yet.
                # Previously this whole state was silently skipped until
                # Wikidata cleanly showed 2 again -- a departed senator's name
                # could sit on the live site indefinitely with no signal
                # anything was stale. Now: keep whichever slot matches the
                # confirmed senator (or fill an already-Vacant slot, once a
                # successor lands), mark the other Vacant, and log it either
                # way so it's visible instead of invisible.
                a, b = members[idxs[0]], members[idxs[1]]
                inc_name, inc_party = inc[0]["name"], inc[0]["party"]
                if bare(a["name"]) == bare(inc_name):
                    kept_idx, other_idx = idxs[0], idxs[1]
                elif bare(b["name"]) == bare(inc_name):
                    kept_idx, other_idx = idxs[1], idxs[0]
                elif a["name"] == "Vacant":
                    kept_idx, other_idx = idxs[0], idxs[1]
                elif b["name"] == "Vacant":
                    kept_idx, other_idx = idxs[1], idxs[0]
                else:
                    kept_idx = other_idx = None
                if kept_idx is not None:
                    was_vacant = members[other_idx]["name"] == "Vacant"
                    members[kept_idx] = {**members[kept_idx], "name": inc_name, "party": inc_party}
                    members[other_idx] = {**members[other_idx], "name": "Vacant", "party": ""}
                    if not was_vacant:
                        print(f"  {slug}: one senator confirmed ({inc_name}); marking the other seat Vacant")
                else:
                    print(f"  {slug}: 1 incoming senator ({inc_name!r}) matches neither existing slot "
                          f"({a['name']!r}, {b['name']!r}) -- needs manual review, left unchanged")
            elif len(inc) != 2:
                print(f"  {slug}: {len(inc)} current senator(s) from Wikidata (expected 2); left unchanged")
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

    # Vacancy: a senator dies/resigns and Wikidata's current-holders query
    # drops to 1 for that state, no successor recorded there yet -- the other
    # slot must flip to Vacant instead of the whole state being left untouched.
    existing_sc = {"senate": {"partySplit": {"Republican": 0, "Democratic": 0, "Independent": 0, "note": ""},
                              "members": [{"name": "Lindsey Graham", "state": "South Carolina", "stateSlug": "south-carolina", "party": "Republican", "class": 2},
                                          {"name": "Tim Scott", "state": "South Carolina", "stateSlug": "south-carolina", "party": "Republican", "class": 3}]},
                   "house": {"partySplit": {"Republican": 0, "Democratic": 0, "Vacant": 0, "note": ""}, "leadership": []},
                   "executive": {}}
    out2 = build(existing_sc, [{"name": "Tim Scott", "state": "South Carolina", "party": "Republican"}],
                 {"Republican": 52, "Democratic": 45, "Independent": 2}, {"Republican": 218, "Democratic": 212, "Independent": 1})
    sc = {m["name"]: m for m in out2["senate"]["members"] if m["stateSlug"] == "south-carolina"}
    assert sc["Tim Scott"]["party"] == "Republican", sc
    assert "Vacant" in sc and sc["Vacant"]["party"] == "", sc
    assert "Lindsey Graham" not in sc, sc

    # A successor later gets recorded in Wikidata: the Vacant slot fills in,
    # the still-serving senator is untouched.
    out3 = build(out2, [{"name": "Tim Scott", "state": "South Carolina", "party": "Republican"},
                        {"name": "Someone New", "state": "South Carolina", "party": "Republican"}],
                 {"Republican": 53, "Democratic": 45, "Independent": 2}, {"Republican": 218, "Democratic": 212, "Independent": 1})
    sc3 = {m["name"]: m for m in out3["senate"]["members"] if m["stateSlug"] == "south-carolina"}
    assert "Someone New" in sc3 and "Vacant" not in sc3, sc3
    assert "Tim Scott" in sc3, sc3
    print("refresh_congress self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
