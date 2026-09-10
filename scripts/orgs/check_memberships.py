"""
check_memberships.py: does public/data/country-orgs.json still match the world?

Monthly, from .github/workflows/orgs-monthly.yml. For every organisation with
a reviewed Wikidata item in scripts/data/org-qids.json, asks Wikidata for the
countries whose "member of" (P463) statement names it and carries no end
date, maps them to this site's country names, and diffs against our
Member+Suspended set. Prints a Markdown report; exits 1 when any organisation
differs, so the workflow can open the rolling issue. It NEVER edits the data:
a membership change is a judgement (suspended is not withdrawn, announced is
not effective), so a person applies it in scripts/data/subregional-orgs.json
(the 25 bodies, or the `overrides` block for the workbook's eighteen) and
reruns scripts/build-orgs-extra.py.

🔴 WIKIDATA IS A TRIPWIRE, NOT A SOURCE OF TRUTH. It lags (the UAE's OPEC
exit took weeks to land) and it over-includes (associate states filed as
members). A diff means "look", never "apply". The 2026-09-10 verification
that seeded this was three web-research passes against the organisations'
own sites; that is the standard for the fix, this is the standard for the
alarm.

  python scripts/orgs/check_memberships.py --self-test
  python scripts/orgs/check_memberships.py            # report, exit 1 on diffs
  python scripts/orgs/check_memberships.py --resolve  # look up missing QIDs by label (review by hand)
"""
import json, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ORGS = ROOT / "public" / "data" / "country-orgs.json"
QIDS = ROOT / "scripts" / "data" / "org-qids.json"
COUNTRIES = ROOT / "public" / "data" / "countries.json"
UA = "citizenofnowhere-orgs-check/1.0 (https://citizenofnowhere.com)"
SPARQL = "https://query.wikidata.org/sparql"

# Wikidata English labels that differ from countries.json names.
ALIASES = {
    "People's Republic of China": "China", "Republic of Ireland": "Ireland", "Czechia": "Czech Republic",
    "Democratic Republic of the Congo": "Congo DR", "Republic of the Congo": "Congo", "Ivory Coast": "Côte d'Ivoire",
    "Cabo Verde": "Cape Verde", "Timor-Leste": "East Timor", "Micronesia": "Federated States of Micronesia",
    "Saint Kitts and Nevis": "St. Kitts & Nevis", "Saint Vincent and the Grenadines": "St. Vincent & the Grenadines",
    "Antigua and Barbuda": "Antigua & Barbuda", "Trinidad and Tobago": "Trinidad & Tobago",
    "Bosnia and Herzegovina": "Bosnia-Herzegovina", "Türkiye": "Turkey", "The Gambia": "Gambia",
    "The Bahamas": "Bahamas", "Republic of Korea": "South Korea", "Democratic People's Republic of Korea": "North Korea",
    "State of Palestine": "Palestine", "Republic of China": "Taiwan", "United States of America": "United States",
    "Kingdom of Denmark": "Denmark", "Kingdom of the Netherlands": "Netherlands", "realm of the United Kingdom": "United Kingdom",
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json, application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def members_of(qid):
    """Countries (Wikidata labels) with a current P463 statement naming `qid`."""
    q = f"""
    SELECT DISTINCT ?cLabel WHERE {{
      ?c p:P463 ?st . ?st ps:P463 wd:{qid} .
      FILTER NOT EXISTS {{ ?st pq:P582 ?end }}
      ?c wdt:P31/wdt:P279* wd:Q6256 .
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}"""
    res = fetch(SPARQL + "?" + urllib.parse.urlencode({"query": q, "format": "json"}))
    return sorted({b["cLabel"]["value"] for b in res["results"]["bindings"]})


def our_members(data, key):
    return {slug for slug, m in data.items() if not slug.startswith("_") and m.get(key) in ("Member", "Suspended")}


def diff(theirs_names, ours_slugs, name_to_slug):
    theirs, unknown = set(), []
    for n in theirs_names:
        slug = name_to_slug.get(ALIASES.get(n, n))
        (theirs.add(slug) if slug else unknown.append(n))
    return sorted(theirs - ours_slugs), sorted(ours_slugs - theirs), unknown


def resolve_missing(qids, keys):
    api = "https://www.wikidata.org/w/api.php?"
    for key, label in keys:
        if key in qids:
            continue
        res = fetch(api + urllib.parse.urlencode({"action": "wbsearchentities", "search": label, "language": "en", "format": "json", "limit": 5}))
        hits = res.get("search", [])
        print("%-14s %-60s -> %s" % (key, label[:60], "; ".join("%s %s (%s)" % (h["id"], h.get("label"), (h.get("description") or "")[:40]) for h in hits[:3])))
        if hits:
            qids[key] = {"qid": hits[0]["id"], "label": hits[0].get("label"), "auto": True}
        time.sleep(0.5)
    return qids


def self_test():
    n2s = {"Brazil": "brazil", "Bolivia": "bolivia", "Chile": "chile", "Côte d'Ivoire": "cote-divoire"}
    data = {"brazil": {"Mercosur": "Member"}, "bolivia": {"Mercosur": "Member"}, "chile": {"Mercosur": "Partner"}, "venezuela": {"Mercosur": "Suspended"}, "_meta": {"asOf": "x"}}
    ours = our_members(data, "Mercosur")
    assert ours == {"brazil", "bolivia", "venezuela"}, ours          # Partner is not a member; Suspended is; _meta ignored
    add, drop, unk = diff(["Brazil", "Chile", "Ivory Coast", "Atlantis"], ours, n2s)
    assert add == ["chile", "cote-divoire"] and drop == ["bolivia", "venezuela"] and unk == ["Atlantis"], (add, drop, unk)
    print("check_memberships self-test: OK")


def main():
    if "--self-test" in sys.argv:
        self_test(); return 0
    countries = json.load(open(COUNTRIES, encoding="utf-8"))
    name_to_slug = {c["name"]: c["slug"] for c in countries}
    data = json.load(open(ORGS, encoding="utf-8"))
    qids = json.load(open(QIDS, encoding="utf-8")) if QIDS.exists() else {}
    keys = sorted({k for slug, m in data.items() if not slug.startswith("_") for k in m})
    if "--resolve" in sys.argv:
        labels = {k: k for k in keys}
        try:
            spec = json.load(open(ROOT / "scripts" / "data" / "subregional-orgs.json", encoding="utf-8"))
            for o in spec["orgs"]:
                labels[o["key"]] = o["label"]
        except Exception:  # noqa: BLE001
            pass
        qids = resolve_missing(qids, [(k, labels[k]) for k in keys])
        json.dump(qids, open(QIDS, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print("wrote", QIDS, "- REVIEW every 'auto' entry by hand, then delete its 'auto' flag")
        return 0
    bad = 0
    print("# Organisation memberships against Wikidata\n")
    for k in keys:
        q = qids.get(k)
        if not q or q.get("auto"):
            print(f"- {k}: no reviewed Wikidata item, skipped"); continue
        try:
            theirs = members_of(q["qid"])
        except Exception as e:  # noqa: BLE001
            print(f"- {k}: Wikidata query failed ({e})"); continue
        ours = our_members(data, k)
        add, drop, unk = diff(theirs, ours, name_to_slug)
        # 🔴 THE SIGNAL IS WHAT WIKIDATA HAS THAT WE LACK. Its "member of"
        # coverage is thin for many bodies (the first run, 2026-09-10, found
        # PIF, RCEP, OPEC+, IGAD, SAARC and SICA with most members missing on
        # Wikidata), so "we have X that Wikidata lacks" is noted, never
        # alarmed on; and when Wikidata knows fewer than half our members the
        # organisation is reported as thin and skipped. It also lags: it still
        # listed the UAE in OPEC four months after the exit. A tripwire for
        # additions, nothing more.
        thin = len(theirs) < max(2, len(ours) // 2)
        if thin:
            print(f"- {k}: Wikidata coverage too thin to compare ({len(theirs)} of our {len(ours)})")
        elif add:
            bad += 1
            print(f"- **{k}** ({q['qid']}) DIFFERS: Wikidata has {', '.join(add)} that we lack" + (f" (we have {', '.join(drop)} that Wikidata lacks)" if drop else "") + (f"; unmapped labels: {', '.join(unk)}" if unk else ""))
        else:
            print(f"- {k}: no additions ({len(theirs)} on Wikidata)" + (f"; we have {', '.join(drop)} that Wikidata lacks" if drop else "") + (f"; unmapped labels: {', '.join(unk)}" if unk else ""))
        time.sleep(1.0)
    print(f"\n{bad} organisation(s) show members on Wikidata that this site lacks. A diff is a prompt to check the organisation's own site, not an instruction to apply.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
