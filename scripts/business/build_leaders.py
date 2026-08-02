#!/usr/bin/env python3
"""build_leaders.py - business leaders for /business/leaders, with change tracking.

The corporate cousin of the civic leaders pipeline: resolves WHO currently runs
things from Wikidata (the same source the political layer trusts) and keeps a
change log the way /leaders does.

Three groups:
  - CEOs of the top public companies (top N from companies.json; P169)
  - The people running the big funds (curated list; P169 -> P488 -> P1037)
  - Central bank governors/chairs (curated list; P488 -> P169 -> P1037)

QID resolution happens by name ONCE via wbsearchentities and is cached in
scripts/business/data/leader-qids.json (committed): review the log line for
each first-time match and hand-correct that file if the search grabbed the
wrong entity ("entityQid" for the org, optional "personQid" to force a
holder). Uses the Wikidata REST API, not WDQS, so SPARQL outages don't bite.

Every run diffs current holders against public/data/business/leaders.json and
appends person-level changes to leaders-changes.json before overwriting - the
change log grows from our own tracked weeks. usage: build_leaders.py [--self-test]
"""
import json, os, sys, time, datetime
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "mktcap"))
import common  # noqa: E402

OUT_DIR = os.path.join(ROOT, "public", "data", "business")
ENTITIES = os.path.join(HERE, "data", "leader-entities.json")
QCACHE = os.path.join(HERE, "data", "leader-qids.json")
COMPANIES = os.path.join(OUT_DIR, "companies.json")

API = "https://www.wikidata.org/w/api.php"
ROLE_PROPS = {"company": ["P169", "P488", "P1037"], "bank": ["P488", "P169", "P1037"]}


UA = "CitizenOfNowhere-business/1.0 (https://rankings.citizenofnowhere.org; data pipeline)"

def api(params):
    """Wikidata REST call with polite UA and 429 backoff (their limiter is quick)."""
    url = API + "?" + "&".join(f"{k}={quote(str(v), safe='|')}" for k, v in params.items())
    for attempt in range(4):
        try:
            return json.loads(common.fetch_url(url, timeout=60, ua=UA).decode("utf-8"))
        except Exception as e:
            if "429" in str(e) and attempt < 3:
                common.log(f"wikidata 429, backing off {15 * (attempt + 1)}s")
                time.sleep(15 * (attempt + 1))
                continue
            raise


def clean_name(name):
    """Company display names like 'Alphabet (Google)' search badly - strip the gloss."""
    return name.split("(")[0].strip()


def resolve_qid(name, cache):
    if name in cache:
        return cache[name].get("entityQid")
    hits = api({"action": "wbsearchentities", "search": clean_name(name),
                "language": "en", "type": "item", "format": "json", "limit": 1}).get("search", [])
    qid = hits[0]["id"] if hits else None
    label = hits[0].get("label", "") if hits else ""
    cache[name] = {"entityQid": qid, "matchedLabel": label}
    common.log(f"resolve: {name} -> {qid or 'NO MATCH'} ({label})")
    time.sleep(1.0)
    return qid


def best_claim(claims, props):
    """First current (no end-date) claim across the property fallback chain."""
    for prop in props:
        ranked = sorted(claims.get(prop, []),
                        key=lambda c: 0 if c.get("rank") == "preferred" else 1)
        for c in ranked:
            quals = c.get("qualifiers", {})
            if "P582" in quals:  # ended
                continue
            snak = c.get("mainsnak", {}).get("datavalue", {})
            if snak.get("type") == "wikibase-entityid":
                since = ""
                if "P580" in quals:
                    t = quals["P580"][0].get("datavalue", {}).get("value", {}).get("time", "")
                    since = t[1:11].replace("-00", "-01") if t else ""
                return snak["value"]["id"], since, prop
    return None, "", ""


def fetch_entities(qids):
    out = {}
    qids = [q for q in qids if q]
    for i in range(0, len(qids), 50):
        batch = "|".join(qids[i:i + 50])
        res = api({"action": "wbgetentities", "ids": batch, "props": "claims|labels",
                   "languages": "en", "format": "json"})
        out.update(res.get("entities", {}))
        time.sleep(1.0)
    return out


def label_of(ent):
    return ent.get("labels", {}).get("en", {}).get("value", "")


def diff_and_log(old_rows, new_rows, group, changes):
    old = {r["entity"]: r for r in old_rows}
    for r in new_rows:
        prev = old.get(r["entity"])
        if prev and prev.get("person") and r.get("person") and prev["person"] != r["person"]:
            changes.append({"date": datetime.date.today().isoformat(), "group": group,
                            "entity": r["entity"], "from": prev["person"], "to": r["person"]})


def build_rows(targets, kind, cache, extra_fields):
    """targets: [{name, ...}] -> rows with person/since resolved."""
    for t in targets:
        t["_qid"] = resolve_qid(t["name"], cache)
    ents = fetch_entities([t["_qid"] for t in targets])
    person_qids = {}
    for t in targets:
        ent = ents.get(t["_qid"] or "")
        if not ent:
            t["_p"] = (None, "", "")
            continue
        override = cache.get(t["name"], {}).get("personQid")
        if override:
            t["_p"] = (override, "", "manual")
        else:
            t["_p"] = best_claim(ent.get("claims", {}), ROLE_PROPS[kind])
        if t["_p"][0]:
            person_qids[t["_p"][0]] = True
    people = fetch_entities(list(person_qids))
    rows = []
    for t in targets:
        pq, since, prop = t["_p"]
        person = label_of(people.get(pq, {})) if pq else ""
        row = {"entity": t["name"], "person": person, "personQid": pq or "",
               "since": since, "via": prop}
        for f in extra_fields:
            row[f] = t.get(f, "")
        rows.append(row)
    return rows


def main(argv):
    if "--self-test" in argv:
        return self_test()
    cfg = json.load(open(ENTITIES, encoding="utf-8"))
    try:
        cache = json.load(open(QCACHE, encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}

    comp = json.load(open(COMPANIES, encoding="utf-8"))["companies"]
    top = [c for c in comp if c["source"] == "Public"][: cfg.get("topCompanies", 50)]
    ceo_targets = [{"name": c["name"], "symbol": c["symbol"], "cap": c["cap"],
                    "metro": c["metro"], "metroSlug": c["metroSlug"]} for c in top]

    common.log("resolving CEOs...")
    ceos = build_rows(ceo_targets, "company", cache, ["symbol", "cap", "metro", "metroSlug"])
    common.log("resolving funds...")
    funds = build_rows([dict(f) for f in cfg["funds"]], "company", cache, ["kind"])
    common.log("resolving central banks...")
    banks = build_rows([dict(b) for b in cfg["centralBanks"]], "bank", cache, ["country", "countrySlug"])

    os.makedirs(os.path.dirname(QCACHE), exist_ok=True)
    json.dump(cache, open(QCACHE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    # Change log: person-level diffs vs the previous committed state
    dest = os.path.join(OUT_DIR, "leaders.json")
    changes_path = os.path.join(OUT_DIR, "leaders-changes.json")
    try:
        prev = json.load(open(dest, encoding="utf-8"))
    except (OSError, ValueError):
        prev = {}
    try:
        changes = json.load(open(changes_path, encoding="utf-8"))["changes"]
    except (OSError, ValueError):
        changes = []
    diff_and_log(prev.get("ceos", []), ceos, "CEO", changes)
    diff_and_log(prev.get("funds", []), funds, "Fund", changes)
    diff_and_log(prev.get("centralBanks", []), banks, "Central bank", changes)

    resolved = sum(1 for r in ceos + funds + banks if r["person"])
    out = {
        "meta": {
            "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "as_of": datetime.date.today().isoformat(),
            "source": "Wikidata (P169/P488 current-officeholder claims)",
            "total": len(ceos) + len(funds) + len(banks), "resolved": resolved,
        },
        "ceos": ceos, "funds": funds, "centralBanks": banks,
    }
    json.dump(out, open(dest, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    json.dump({"meta": {"note": "person-level changes detected by build_leaders.py runs"},
               "changes": changes[-200:]},
              open(changes_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    unresolved = [r["entity"] for r in ceos + funds + banks if not r["person"]]
    common.log(f"leaders: {resolved}/{out['meta']['total']} resolved; "
               f"{len(changes)} change(s) on log; unresolved: {unresolved[:12]}")


def self_test():
    claims = {"P169": [
        {"rank": "normal", "qualifiers": {"P582": [{}]},
         "mainsnak": {"datavalue": {"type": "wikibase-entityid", "value": {"id": "Q_OLD"}}}},
        {"rank": "normal",
         "qualifiers": {"P580": [{"datavalue": {"value": {"time": "+2023-02-03T00:00:00Z"}}}]},
         "mainsnak": {"datavalue": {"type": "wikibase-entityid", "value": {"id": "Q_NEW"}}}},
    ]}
    pq, since, prop = best_claim(claims, ["P169", "P488"])
    assert pq == "Q_NEW" and since == "2023-02-03" and prop == "P169", (pq, since, prop)
    assert best_claim({}, ["P169"]) == (None, "", "")
    assert clean_name("Alphabet (Google)") == "Alphabet"
    ch = []
    diff_and_log([{"entity": "X", "person": "Alice"}], [{"entity": "X", "person": "Bob"}], "CEO", ch)
    diff_and_log([{"entity": "Y", "person": ""}], [{"entity": "Y", "person": "Carol"}], "CEO", ch)
    assert len(ch) == 1 and ch[0]["from"] == "Alice" and ch[0]["to"] == "Bob", ch
    print("self-test: 5/5 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
