#!/usr/bin/env python3
"""build-uk-offices.py -- dated holders of the UK offices the time machine needs
beyond PM/Sovereign (those come from the existing /leaders data). Produces
public/data/uk-offices-history.json for /uk-political-leadership + time machine.

Offices (matched by the Wikidata position item's EXACT English label -- Q-ids
proved unreliable in the US build):
  chancellor, foreignSecretary (3 successive official names), homeSecretary,
  deputyPrimeMinister, leaderOfOpposition,
  firstMinisterScotland / Wales / NorthernIreland.

Same engine as scripts/us-politics/build-office-history.py: POST-batched SPARQL
with retries, P31=Q5 (real humans only), P580/P582 date qualifiers, and
close_open_terms (only the latest term per office may be open; died/left terms
close to the successor's start). Wikidata is blocked from the assistant's
sandbox, so run this in your terminal.

MODES
  --self-test   Offline. Asserts parse + close_open_terms. No network.
  --enrich      NETWORK. Query Wikidata, write uk-offices-history.json, print
                per-office holder counts (a 0 => that office's label needs a fix).
"""
import argparse, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "data", "uk-offices-history.json")
WDQS = "https://query.wikidata.org/sparql"
UA = "CitizenOfNowhere-uk-offices/1.0 (https://rankings.citizenofnowhere.org)"

OFFICES = {
    "chancellor": ["Chancellor of the Exchequer"],
    "foreignSecretary": [
        "Secretary of State for Foreign, Commonwealth and Development Affairs",
        "Secretary of State for Foreign and Commonwealth Affairs",
        "Secretary of State for Foreign Affairs",
    ],
    "homeSecretary": ["Secretary of State for the Home Department", "Home Secretary"],
    "deputyPrimeMinister": ["Deputy Prime Minister of the United Kingdom"],
    "leaderOfOpposition": [
        "Leader of the Opposition",
        "Leader of His Majesty's Most Loyal Opposition",
        "Leader of Her Majesty's Most Loyal Opposition",
    ],
    "firstMinisterScotland": ["First Minister of Scotland"],
    "firstMinisterWales": ["First Minister of Wales", "First Secretary of Wales"],
    "firstMinisterNorthernIreland": ["First Minister of Northern Ireland"],
}

# Offices whose label is generic across countries (e.g. "Leader of the
# Opposition" exists for every Westminster parliament) -> constrain the position
# to the UK by country (P17) / applies-to-jurisdiction (P1001) = Q145.
# Hard query-level jurisdiction constraint (?pos wdt:P1001 wd:<Q>). Used only for
# Leader of the Opposition: its generic label matches every country's opposition
# leader, so the query must narrow to UK-jurisdiction first (then a party filter
# removes the one stray holder with an erroneous UK-jurisdiction tag).
COUNTRY_CONSTRAINT = {"leaderOfOpposition": "Q145"}

# Some offices share a generic label with other countries (e.g. "Secretary of
# State for Foreign Affairs" = Spain/Netherlands too; "Leader of the Opposition"
# = everywhere), so stray non-UK holders slip in even after the jurisdiction
# filter (Wikidata data noise). Keep only holders whose party is a recognised UK
# party. Foreign Secretary additionally allows "Unknown" party (early UK peers
# often have no P102), because its foreign contaminants all carry identifiable
# foreign parties -- so allowing Unknown keeps real UK holders without letting
# contaminants through.
UK_PARTIES = {
    "conservative", "conservative and unionist", "labour", "labour co-operative",
    "co-operative", "whig", "whigs", "liberal", "liberal democrat",
    "liberal democrats", "tory", "tories", "peelite", "national liberal",
    "liberal unionist", "unionist", "social democratic", "national",
}
def _mk_filter(allow_unknown):
    def f(p):
        n = (p or "").replace(" Party", "").strip().lower()
        if allow_unknown and n in ("unknown", ""):
            return True
        return n in UK_PARTIES
    return f
# Per-office KEEP rule applied AFTER the query (each row has party + jurUK).
#  - leaderOfOpposition: query is already UK-jurisdiction constrained; drop the
#    lone stray holder by requiring a UK party.
#  - foreignSecretary: the label "Secretary of State for Foreign Affairs" is
#    shared with Spain/Netherlands. Keep a holder if the office is UK-jurisdiction
#    OR the party is a UK party -- this keeps every real UK holder (incl. early
#    peers with no party, via jurisdiction) while dropping foreign ministers
#    (foreign jurisdiction AND foreign/no party), e.g. a party-less Spanish
#    diplomat. Neither signal alone suffices (jurisdiction is missing on some old
#    UK office items; party is missing on some real UK holders).
_uk_party = _mk_filter(False)
KEEP_RULE = {
    "leaderOfOpposition": lambda r: _uk_party(r.get("party")),
    "foreignSecretary": lambda r: r.get("jurUK") or _uk_party(r.get("party")),
}

_DATE_RE = re.compile(r"^-?\d{4}-\d{2}-\d{2}$")


def _iso(v):
    if not v:
        return None
    d = v[:10]
    return d if _DATE_RE.match(d) else None


def parse_rows(payload):
    by_sig, order = {}, []
    for b in payload.get("results", {}).get("bindings", []):
        name = b.get("personLabel", {}).get("value")
        if not name or re.fullmatch(r"Q\d+", name):
            continue
        start = _iso(b.get("start", {}).get("value"))
        end = _iso(b.get("end", {}).get("value"))
        party = b.get("partyLabel", {}).get("value") or "Unknown"
        jur = b.get("jur", {}).get("value", "")
        sig = (name, start)
        if sig not in by_sig:
            by_sig[sig] = {"name": name, "party": party, "start": start, "end": end, "jurUK": False}
            order.append(sig)
        # any binding pointing the position at the UK => UK-jurisdiction office
        if jur.rsplit("/", 1)[-1] == "Q145":
            by_sig[sig]["jurUK"] = True
        # prefer a real party over "Unknown" if a later binding has one
        if by_sig[sig]["party"] == "Unknown" and party != "Unknown":
            by_sig[sig]["party"] = party
    return [by_sig[s] for s in order]


def collapse(rows):
    rows = [r for r in rows if r.get("start")]
    rows.sort(key=lambda r: (r["start"], r.get("end") or "9999"))
    out = []
    for r in rows:
        if out and out[-1]["name"] == r["name"] and out[-1].get("end") == r["start"]:
            out[-1]["end"] = r.get("end")
        else:
            out.append(dict(r))
    return out


def close_open_terms(rows):
    rows = [dict(r) for r in rows if r.get("start")]
    rows.sort(key=lambda r: (r["start"], 0 if r.get("end") is None else 1, r.get("end") or ""))
    for i in range(len(rows) - 1):
        nxt = rows[i + 1]["start"]
        e = rows[i].get("end")
        if e is None or e > nxt:
            rows[i]["end"] = nxt
    return [r for r in rows if r.get("end") is None or r["end"] > r["start"]]


def office_query(labels, country=None):
    values = " ".join('"%s"@en' % l for l in labels)
    # Constrain by APPLIES-TO-JURISDICTION (P1001), not country (P17): the UK
    # national office applies-to-jurisdiction the United Kingdom, while devolved
    # opposition leaders (Scotland/Wales/NI) apply to their region even though
    # their country is still the UK -- P1001 excludes them, P17 would not.
    constraint = ("  ?pos wdt:P1001 wd:%s .\n" % country) if country else ""
    return """
SELECT ?person ?personLabel ?start ?end ?partyLabel ?jur WHERE {
  VALUES ?posLabel { %s }
  ?pos rdfs:label ?posLabel .
%s  ?person p:P39 ?st .
  ?st ps:P39 ?pos .
  ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?person wdt:P102 ?partyItem. }
  OPTIONAL { ?pos wdt:P1001 ?jur. }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,mul".
    ?person rdfs:label ?personLabel.
    ?partyItem rdfs:label ?partyLabel.
  }
}
""" % (values, constraint)


def _run(query, tries=4):
    import urllib.parse, urllib.request, urllib.error, time
    data = urllib.parse.urlencode({"query": query, "format": "json"}).encode("utf-8")
    for attempt in range(tries):
        req = urllib.request.Request(WDQS, data=data, headers={
            "User-Agent": UA, "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (408, 429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(3 * (attempt + 1)); continue
            raise
        except urllib.error.URLError:
            if attempt < tries - 1:
                time.sleep(3 * (attempt + 1)); continue
            raise


def cmd_enrich():
    out = {"source": "Wikidata P39 (position held, matched by office label) + P580/P582",
           "note": "UK offices beyond PM/Sovereign (those come from /leaders). end=null=current."}
    print("UK offices:")
    for key, labels in OFFICES.items():
        q = office_query(labels, COUNTRY_CONSTRAINT.get(key))
        rows = collapse(parse_rows(_run(q)))
        keep = KEEP_RULE.get(key)
        if keep:
            rows = [r for r in rows if keep(r)]
        # strip the internal jurUK flag before writing
        rows = [{k2: v for k2, v in r.items() if k2 != "jurUK"} for r in close_open_terms(rows)]
        out[key] = rows
        flag = "  <-- 0 holders: check label(s)" if not rows else ""
        print("  %-28s %4d holders%s" % (key, len(rows), flag))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote %s" % os.path.relpath(OUT, ROOT))


def cmd_self_test():
    Q145 = "http://www.wikidata.org/entity/Q145"
    mock = {"results": {"bindings": [
        {"personLabel": {"value": "Rishi Sunak"}, "start": {"value": "2020-02-13T00:00:00Z"},
         "end": {"value": "2022-07-05T00:00:00Z"}, "jur": {"value": Q145}},        # no party this binding
        {"personLabel": {"value": "Rishi Sunak"}, "start": {"value": "2020-02-13T00:00:00Z"},
         "partyLabel": {"value": "Conservative Party"}},                            # party fills in
        {"personLabel": {"value": "Q123"}, "start": {"value": "1900-01-01T00:00:00Z"}},  # unresolved -> skip
    ]}}
    rows = parse_rows(mock)
    assert len(rows) == 1, rows
    assert rows[0]["party"] == "Conservative Party" and rows[0]["jurUK"] is True, rows

    co = close_open_terms([
        {"name": "A", "party": "Whig", "start": "1830-11-22", "end": None},
        {"name": "B", "party": "Tory", "start": "1834-07-16", "end": None},
    ])
    assert co[0]["end"] == "1834-07-16" and co[1]["end"] is None, co   # non-latest closed
    assert len(OFFICES) == 8

    # KEEP rules
    opp = KEEP_RULE["leaderOfOpposition"]; fs = KEEP_RULE["foreignSecretary"]
    assert opp({"party": "Conservative Party"}) and not opp({"party": "New Democratic Party"})
    assert not opp({"party": "Unknown"})                                   # opposition needs a UK party
    assert fs({"party": "Labour Party", "jurUK": False})                    # UK party kept
    assert fs({"party": "Unknown", "jurUK": True})                          # UK-jurisdiction peer kept
    assert not fs({"party": "Unknown", "jurUK": False})                     # party-less foreign diplomat dropped
    assert not fs({"party": "Christian Democratic Appeal", "jurUK": False})  # foreign minister dropped
    print("self-test OK: parse_rows (jurUK+party-fill), close_open_terms, KEEP rules")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--enrich", action="store_true")
    a = ap.parse_args()
    cmd_self_test() if a.self_test else cmd_enrich()


if __name__ == "__main__":
    main()
