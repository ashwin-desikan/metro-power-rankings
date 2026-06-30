#!/usr/bin/env python3
"""refresh_governors.py — update the governor NAME/party/start for each US state
in public/data/governors.json from Wikidata (head of government, P6). The metro
scores (state-metro-scores.json) are static and untouched; territories are
preserved as curated. Fail-soft: writes nothing if Wikidata returns implausibly
few states. Run with --self-test for offline CI."""
import sys, re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sanity_ok, merge_overrides, load_json, write_json, bare, sparql  # noqa

ROOT = Path(__file__).resolve().parents[2]
GOV = ROOT / "public" / "data" / "governors.json"
OVR = Path(__file__).with_name("governors-overrides.json")

SPECIAL = {"Florida": "florida-united-states", "Maryland": "maryland-united-states",
           "Montana": "montana-united-states"}
def sslug(name):
    name = (name or "").strip()
    return SPECIAL.get(name, name.lower().replace(" ", "-"))

SPARQL = """
SELECT ?stateLabel ?govLabel ?partyLabel ?start WHERE {
  ?state wdt:P31 wd:Q35657 .                 # instance of: U.S. state
  ?state p:P6 ?st . ?st ps:P6 ?gov .          # head of government (governor)
  FILTER NOT EXISTS { ?st pq:P582 ?end }      # current (no end date)
  OPTIONAL { ?st pq:P580 ?start }
  OPTIONAL { ?gov wdt:P102 ?party }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

def query():
    out = {}
    for b in sparql(SPARQL):
        st = b.get("stateLabel", {}).get("value")
        gov = b.get("govLabel", {}).get("value")
        if not st or not gov:
            continue
        out[sslug(st)] = {"name": gov,
                          "party": b.get("partyLabel", {}).get("value", ""),
                          "since": (b.get("start", {}).get("value", "") or "")[:10]}
    return out

def build(existing, wd, overrides, add_only=False):
    states = dict(existing.get("states", {}))
    changed = 0
    for slug, info in wd.items():
        if slug not in states:        # only states we already track (50)
            continue
        if add_only:                   # never overwrite verified curation
            continue
        if not sanity_ok(info["name"]):
            continue
        prev = states[slug]
        if bare(prev.get("name", "")) == bare(info["name"]):
            continue                  # same person; keep curated row
        states[slug] = {"name": info["name"],
                        "party": info["party"] or prev.get("party", ""),
                        "since": info["since"] or prev.get("since", "")}
        changed += 1
    states = merge_overrides(states, overrides)   # curated wins
    out = dict(existing); out["states"] = states
    return out, changed

def main():
    existing = load_json(GOV, {"states": {}, "territories": {}})
    wd = query()
    if len(wd) < 45:
        print(f"ABORT: only {len(wd)} states from Wikidata (<45); writing nothing.")
        return
    overrides = load_json(OVR, {})
    out, changed = build(existing, wd, overrides, add_only=("--add-only" in sys.argv))
    write_json(GOV, out, sort_keys=False)
    print(f"governors.json updated: {changed} governor(s) changed of {len(out['states'])}")

def _self_test():
    existing = {"states": {"california": {"name": "Old Gov", "party": "X", "since": "2000-01-01"},
                           "florida-united-states": {"name": "Ron DeSantis", "party": "Republican", "since": "2019-01-08"}},
                "territories": {"guam": {"name": "Lou Leon Guerrero"}}}
    wd = {"california": {"name": "Gavin Newsom", "party": "Democratic", "since": "2019-01-07"},
          "florida-united-states": {"name": "Ron DeSantis", "party": "Republican", "since": "2019-01-08"},
          "nevada": {"name": "sapo cara picha", "party": "", "since": ""}}  # vandalism -> rejected; nv untracked anyway
    out, changed = build(existing, wd, {})
    assert out["states"]["california"]["name"] == "Gavin Newsom", out["states"]["california"]
    assert changed == 1, changed                        # FL same person kept, CA changed
    assert out["territories"] == existing["territories"]  # territories preserved
    # override wins
    out2, _ = build(existing, wd, {"california": {"name": "Curated Name", "party": "I", "since": "2024-01-01"}})
    assert out2["states"]["california"]["name"] == "Curated Name"
    print("refresh_governors self-test OK")

if __name__ == "__main__":
    _self_test() if "--self-test" in sys.argv else main()
