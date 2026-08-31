#!/usr/bin/env python3
"""
build-office-history.py -- dated-office history for the "A day in American
history" time machine (/us-political-leadership/time-machine).

Produces two files consumed by the time machine:
  public/data/us-cabinet-history.json   -- big-4 Cabinet, dated
  public/data/us-governor-history.json  -- state governors, dated, after-statehood

Presidents / Vice Presidents already come from us-executive-history.json
(validated against unitedstates/congress-legislators executive.yaml) and
senators from us-senate-history.json (built from congress-legislators, public
domain). This script fills the two offices with no clean public-domain flat
file: Cabinet and Governors. Source is Wikidata (P39 position-held with
P580/P582 date qualifiers), same engine style as scripts/states/build-state-facts.py.

WHY A SCRIPT YOU RUN: this environment (Ashwin's terminal) can reach
query.wikidata.org; the assistant's cloud sandbox cannot, so the SPARQL cannot
be tested from there. --enrich prints per-office and per-state ROW COUNTS. If any
line reads 0, the position Q-id / pattern for that office needs a one-line tweak
-- paste the counts back and it gets corrected. This makes the first run a cheap
diagnostic, never a silent empty file.

MODES
  --self-test   Offline. Asserts the parser + collapse + statehood filter on
                mock WDQS payloads. No network.
  --enrich      NETWORK. Queries Wikidata, writes both files, prints counts.
                ADD-ONLY nothing here -- always a full regen from Wikidata.

USAGE
  python scripts/us-politics/build-office-history.py --self-test
  python scripts/us-politics/build-office-history.py --enrich
"""
import argparse, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_CAB = os.path.join(ROOT, "public", "data", "us-cabinet-history.json")
OUT_GOV = os.path.join(ROOT, "public", "data", "us-governor-history.json")
# Curated current/acting cabinet holders that Wikidata lags on (e.g. an acting
# secretary appointed last week). This is the human-review surface for the noisy
# current-officeholder tail -- Wikidata owns the history, this owns the bleeding edge.
CAB_OVERRIDES = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "cabinet-current-overrides.json")

WDQS = "https://query.wikidata.org/sparql"
UA = "CitizenOfNowhere-office-history/1.0 (https://rankings.citizenofnowhere.org)"

# ---------------------------------------------------------------------------
# Big-4 Cabinet. Matched by the position item's EXACT English label (rdfs:label)
# rather than a Q-id -- Q-ids proved unreliable to recall and generic ones (e.g.
# plain "attorney general") over-match across countries/states. War (1789-1947)
# and Defense (1947-) merge into one office. If a count comes back 0, the label
# string below is the thing to fix (check the exact Wikidata label).
# ---------------------------------------------------------------------------
CABINET_OFFICES = [
    {"office": "Secretary of State",        "labels": ["United States Secretary of State"]},
    {"office": "Secretary of the Treasury", "labels": ["United States Secretary of the Treasury"]},
    {"office": "Secretary of War / Defense","labels": ["United States Secretary of War",
                                                        "United States Secretary of Defense"]},
    {"office": "Attorney General",          "labels": ["United States Attorney General"]},
]

# 50 states -> (USPS code, statehood date). Governors are filtered to on/after
# statehood (territorial governors excluded), per scope. Dates are the federal
# admission dates (well established, low-risk constants).
STATEHOOD = {
    "Delaware": ("DE", "1787-12-07"), "Pennsylvania": ("PA", "1787-12-12"),
    "New Jersey": ("NJ", "1787-12-18"), "Georgia": ("GA", "1788-01-02"),
    "Connecticut": ("CT", "1788-01-09"), "Massachusetts": ("MA", "1788-02-06"),
    "Maryland": ("MD", "1788-04-28"), "South Carolina": ("SC", "1788-05-23"),
    "New Hampshire": ("NH", "1788-06-21"), "Virginia": ("VA", "1788-06-25"),
    "New York": ("NY", "1788-07-26"), "North Carolina": ("NC", "1789-11-21"),
    "Rhode Island": ("RI", "1790-05-29"), "Vermont": ("VT", "1791-03-04"),
    "Kentucky": ("KY", "1792-06-01"), "Tennessee": ("TN", "1796-06-01"),
    "Ohio": ("OH", "1803-03-01"), "Louisiana": ("LA", "1812-04-30"),
    "Indiana": ("IN", "1816-12-11"), "Mississippi": ("MS", "1817-12-10"),
    "Illinois": ("IL", "1818-12-03"), "Alabama": ("AL", "1819-12-14"),
    "Maine": ("ME", "1820-03-15"), "Missouri": ("MO", "1821-08-10"),
    "Arkansas": ("AR", "1836-06-15"), "Michigan": ("MI", "1837-01-26"),
    "Florida": ("FL", "1845-03-03"), "Texas": ("TX", "1845-12-29"),
    "Iowa": ("IA", "1846-12-28"), "Wisconsin": ("WI", "1848-05-29"),
    "California": ("CA", "1850-09-09"), "Minnesota": ("MN", "1858-05-11"),
    "Oregon": ("OR", "1859-02-14"), "Kansas": ("KS", "1861-01-29"),
    "West Virginia": ("WV", "1863-06-20"), "Nevada": ("NV", "1864-10-31"),
    "Nebraska": ("NE", "1867-03-01"), "Colorado": ("CO", "1876-08-01"),
    "North Dakota": ("ND", "1889-11-02"), "South Dakota": ("SD", "1889-11-02"),
    "Montana": ("MT", "1889-11-08"), "Washington": ("WA", "1889-11-11"),
    "Idaho": ("ID", "1890-07-03"), "Wyoming": ("WY", "1890-07-10"),
    "Utah": ("UT", "1896-01-04"), "Oklahoma": ("OK", "1907-11-16"),
    "New Mexico": ("NM", "1912-01-06"), "Arizona": ("AZ", "1912-02-14"),
    "Alaska": ("AK", "1959-01-03"), "Hawaii": ("HI", "1959-08-21"),
}
NAME_BY_CODE = {c: n for n, (c, _d) in STATEHOOD.items()}
STATEHOOD_BY_CODE = {c: d for _n, (c, d) in STATEHOOD.items()}

# States whose Wikidata governor terms are UNDATED -> owned by backfill-governors.py
# (Wikipedia lists). --enrich must NOT overwrite these with sparse Wikidata data.
BACKFILL_OWNED = {"NH", "NE", "GA", "TN", "UT", "MS", "MN"}


# ---------------------------------------------------------------------------
# SPARQL
# ---------------------------------------------------------------------------
def _label_values(labels):
    return " ".join('"%s"@en' % l for l in labels)


def cabinet_query(labels):
    # Match the position by exact English label, then the same proven
    # p:P39 / ps:P39 holder pattern. Party from the holder's P102.
    return """
SELECT ?person ?personLabel ?start ?end ?partyLabel WHERE {
  VALUES ?posLabel { %s }
  ?pos rdfs:label ?posLabel .
  ?person p:P39 ?st .
  ?st ps:P39 ?pos .
  ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?person wdt:P102 ?partyItem. }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,mul".
    ?person rdfs:label ?personLabel.
    ?partyItem rdfs:label ?partyLabel.
  }
}
""" % _label_values(labels)


def governor_labels():
    # Both capitalisations of "Governor of <State>" for all 50 states, so exact
    # rdfs:label matching is robust to Wikidata's capitalisation of the office.
    out = []
    for name in STATEHOOD:
        out.append("Governor of %s" % name)
        out.append("governor of %s" % name)
    return out


def governor_query():
    # No class/property Q-ids: match each state's governor position by its exact
    # English label, reuse the proven p:P39 holder pattern. ?posLabel comes back
    # so we can map the holder to a state.
    return """
SELECT ?person ?personLabel ?posLabel ?start ?end ?partyLabel WHERE {
  VALUES ?posLabel { %s }
  ?pos rdfs:label ?posLabel .
  ?person p:P39 ?st .
  ?st ps:P39 ?pos .
  ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?person wdt:P102 ?partyItem. }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,mul".
    ?person rdfs:label ?personLabel.
    ?partyItem rdfs:label ?partyLabel.
  }
}
""" % _label_values(governor_labels())


# ---------------------------------------------------------------------------
# Parsing (pure -- unit tested by --self-test)
# ---------------------------------------------------------------------------
import re
_DATE_RE = re.compile(r"^-?\d{4}-\d{2}-\d{2}$")


def _iso_date(v):
    """Wikidata dateTime '1861-03-05T00:00:00Z' -> '1861-03-05'. None-safe.
    Returns None for anything that is not a clean YYYY-MM-DD (guards against
    malformed qualifier values like stray URLs)."""
    if not v:
        return None
    d = v[:10]
    return d if _DATE_RE.match(d) else None


def parse_rows(payload, key_var=None):
    """WDQS bindings -> list of {name, party, start, end[, key]}. Deduped by
    (name, start, key). key_var e.g. 'iso' extracts a grouping key."""
    out = []
    seen = set()
    for b in payload.get("results", {}).get("bindings", []):
        name = b.get("personLabel", {}).get("value")
        if not name:
            continue
        start = _iso_date(b.get("start", {}).get("value"))
        end = _iso_date(b.get("end", {}).get("value"))
        party = b.get("partyLabel", {}).get("value")
        row = {"name": name, "party": party or "Unknown", "start": start, "end": end}
        keyval = None
        if key_var:
            keyval = b.get(key_var, {}).get("value")  # raw, e.g. "Governor of Ohio"
            row["key"] = keyval
        sig = (name, start, keyval)
        if sig in seen:
            continue
        seen.add(sig)
        out.append(row)
    return out


def collapse(rows):
    """Sort by start; merge consecutive same-person rows whose end==next start."""
    rows = [r for r in rows if r.get("start")]
    rows.sort(key=lambda r: (r["start"], r.get("end") or "9999"))
    out = []
    for r in rows:
        if out and out[-1]["name"] == r["name"] and out[-1].get("end") == r["start"]:
            out[-1]["end"] = r.get("end")
        else:
            out.append({k: v for k, v in r.items() if k != "key"} | (
                {} if "key" not in r else {"key": r["key"]}))
    return out


def close_open_terms(rows):
    """CRITICAL data-hygiene: a term is only 'current' (end=None) if no later
    term succeeds it. Wikidata frequently omits end dates for governors/
    secretaries who died or resigned, which would otherwise make them resolve as
    'current' forever. Sort by start; for every non-latest term whose end is
    missing OR overlaps the successor, set end = successor's start; then drop
    zero/negative-length rows. Only the single latest-starting term may stay
    open. Pure -- unit tested."""
    rows = [dict(r) for r in rows if r.get("start")]
    # At an equal start, UNDATED entries sort first so they collapse to
    # zero-length against the real dated entry (which survives), instead of the
    # dated one being closed away. Then by end ascending.
    rows.sort(key=lambda r: (r["start"], 0 if r.get("end") is None else 1, r.get("end") or ""))
    for i in range(len(rows) - 1):
        nxt = rows[i + 1]["start"]
        e = rows[i].get("end")
        if e is None or e > nxt:
            rows[i]["end"] = nxt
    return [r for r in rows if r.get("end") is None or r["end"] > r["start"]]


def filter_after_statehood(rows_by_code):
    """Drop governor terms that ended before statehood; clamp starts before
    statehood up to the statehood date (territorial governors excluded)."""
    out = {}
    for code, rows in rows_by_code.items():
        sd = STATEHOOD_BY_CODE.get(code)
        if not sd:
            continue
        kept = []
        for r in rows:
            end = r.get("end")
            if end and end < sd:
                continue  # entirely territorial
            start = r["start"]
            if start < sd:
                if end is None:
                    continue  # undated pre-statehood term -> spurious, drop (never clamp forward)
                start = sd  # clamp: only show the post-statehood portion
            kept.append({"name": r["name"], "party": r["party"], "start": start, "end": end})
        kept.sort(key=lambda r: r["start"])
        if kept:
            out[code] = kept
    return out


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------
def _run(query, tries=4):
    import urllib.parse, urllib.request, urllib.error, time
    data = urllib.parse.urlencode({"query": query, "format": "json"}).encode("utf-8")
    for attempt in range(tries):
        req = urllib.request.Request(
            WDQS, data=data,
            headers={
                "User-Agent": UA,
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
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


def apply_cabinet_overrides(cabinet):
    """Append curated current/acting holders (cabinet-current-overrides.json) that
    Wikidata hasn't caught up on. close_open_terms (called after) closes the prior
    open term to each override's start, so the override becomes the current holder."""
    ov = load_json(CAB_OVERRIDES, {}) or {}
    for off, entries in ov.items():
        if off.startswith("_") or not isinstance(entries, list):
            continue
        rows = cabinet.get(off)
        if rows is None:
            continue
        for e in entries:
            start = e.get("start")
            if not start or any(r["name"] == e["name"] and r["start"] == start for r in rows):
                continue
            rows.append({"name": e["name"], "party": e.get("party", "Unknown"),
                         "start": start, "end": e.get("end")})


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
def cmd_enrich():
    # --- Cabinet ---
    cabinet = {}
    print("Cabinet (big-4):")
    for off in CABINET_OFFICES:
        payload = _run(cabinet_query(off["labels"]))
        cabinet[off["office"]] = collapse(parse_rows(payload))
    apply_cabinet_overrides(cabinet)  # curated current/acting holders Wikidata lags
    for off in CABINET_OFFICES:
        cabinet[off["office"]] = close_open_terms(cabinet[off["office"]])
        print("  %-28s %4d holders" % (off["office"], len(cabinet[off["office"]])))
    write_json(OUT_CAB, {
        "source": "Wikidata P39 (position held, matched by office label) + P580/P582 qualifiers",
        "offices": [o["office"] for o in CABINET_OFFICES],
        "cabinet": cabinet,
    })
    print("wrote %s" % os.path.relpath(OUT_CAB, ROOT))

    # --- Governors ---
    print("\nGovernors (grouping by state, after statehood):")
    payload = _run(governor_query())
    rows = parse_rows(payload, key_var="posLabel")
    # map "Governor of Ohio" / "governor of Ohio" -> USPS code
    label_to_code = {}
    for name, (code, _d) in STATEHOOD.items():
        label_to_code["Governor of %s" % name] = code
        label_to_code["governor of %s" % name] = code
    by_code = {}
    for r in rows:
        code = label_to_code.get(r.get("key"))
        if not code:
            continue
        by_code.setdefault(code, []).append(r)
    # collapse per state, statehood filter, then close stale open terms
    collapsed = {c: collapse(rs) for c, rs in by_code.items()}
    filtered = {c: close_open_terms(rs) for c, rs in filter_after_statehood(collapsed).items()}

    # PRESERVE the Wikipedia-backfilled states (NH/NE/GA/TN/UT/MS/MN): their
    # Wikidata governor terms are UNDATED, so a fresh --enrich would revert them
    # to sparse data. backfill-governors.py owns them -- keep whatever is already
    # on disk for those codes instead of overwriting.
    existing = load_json(OUT_GOV, {}) or {}
    prev_gov = existing.get("governors", {}) if isinstance(existing, dict) else {}
    preserved = []
    for code in BACKFILL_OWNED:
        if prev_gov.get(code):
            filtered[code] = prev_gov[code]
            preserved.append(code)
    if preserved:
        print("  preserved backfill-owned states (not overwritten): %s" %
              ", ".join(sorted(preserved)))

    total = 0
    for code in sorted(filtered, key=lambda c: NAME_BY_CODE.get(c, c)):
        n = len(filtered[code])
        total += n
        print("  %-16s %3d governors" % (NAME_BY_CODE.get(code, code), n))
    missing = [NAME_BY_CODE[c] for c in STATEHOOD_BY_CODE if c not in filtered]
    if missing:
        print("  !! NO DATA for: %s" % ", ".join(sorted(missing)))
    write_json(OUT_GOV, {
        "source": "Wikidata P39 governor positions matched by 'Governor of <State>' label",
        "note": "Keyed by USPS code. Terms clamped/filtered to on/after statehood; "
                "non-latest open terms closed to the successor's start. 7 states "
                "(NH/NE/GA/TN/UT/MS/MN) are Wikipedia-backfilled and preserved here.",
        "governors": filtered,
    })
    print("wrote %s  (%d governor terms across %d states)" % (
        os.path.relpath(OUT_GOV, ROOT), total, len(filtered)))


# ---------------------------------------------------------------------------
# Diagnostic: for the 7 gap states, dump EVERY "Governor of X" holder including
# undated ones, and separately count holders reached via the state-jurisdiction
# path, so we can tell "present-but-undated" from "absent / different item".
DIAGNOSE_STATES = ["New Hampshire", "Nebraska", "Georgia", "Tennessee",
                   "Utah", "Mississippi", "Minnesota"]


def diagnose_label_query(name):
    return """
SELECT ?person ?personLabel ?start ?end WHERE {
  VALUES ?posLabel { "Governor of %s"@en "governor of %s"@en }
  ?pos rdfs:label ?posLabel .
  ?person p:P39 ?st .
  ?st ps:P39 ?pos .
  ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?st pq:P582 ?end. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul".
    ?person rdfs:label ?personLabel. }
}""" % (name, name)


def diagnose_jurisdiction_query(name):
    # Any position whose applies-to-jurisdiction is this state AND label contains
    # "governor" (not lieutenant) -- catches governors under other position items.
    return """
SELECT DISTINCT ?person ?personLabel ?posLabel ?start ?end WHERE {
  ?state rdfs:label "%s"@en . ?state wdt:P31 wd:Q35657 .
  ?pos wdt:P1001 ?state .
  ?pos rdfs:label ?posLabel . FILTER(lang(?posLabel)="en")
  FILTER(CONTAINS(LCASE(?posLabel), "governor"))
  FILTER(!CONTAINS(LCASE(?posLabel), "lieutenant"))
  ?person wdt:P31 wd:Q5 . ?person p:P39 ?st . ?st ps:P39 ?pos .
  OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?st pq:P582 ?end. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul".
    ?person rdfs:label ?personLabel. }
}""" % name


def cmd_diagnose():
    for name in DIAGNOSE_STATES:
        rows = parse_rows(_run(diagnose_label_query(name)))
        dated = [r for r in rows if r["start"]]
        undated = [r for r in rows if not r["start"]]
        jrows = parse_rows(_run(diagnose_jurisdiction_query(name)), key_var="posLabel")
        jlabels = {}
        for r in jrows:
            jlabels[r.get("key")] = jlabels.get(r.get("key"), 0) + 1
        print("\n=== %s ===" % name)
        print("  label-match: %d holders (%d dated, %d UNDATED)" %
              (len(rows), len(dated), len(undated)))
        if undated:
            print("  undated names: %s" %
                  ", ".join(sorted(r["name"] for r in undated))[:400])
        print("  jurisdiction-match: %d holders across positions: %s" %
              (len(jrows), dict(sorted(jlabels.items(), key=lambda x: -x[1]))))


# ---------------------------------------------------------------------------
def cmd_self_test():
    # parse_rows: dedupe + date trim + party fallback
    mock = {"results": {"bindings": [
        {"personLabel": {"value": "Thomas Jefferson"},
         "start": {"value": "1790-03-22T00:00:00Z"},
         "end": {"value": "1793-12-31T00:00:00Z"},
         "partyLabel": {"value": "Democratic-Republican"}},
        {"personLabel": {"value": "Thomas Jefferson"},  # dup
         "start": {"value": "1790-03-22T00:00:00Z"},
         "end": {"value": "1793-12-31T00:00:00Z"}},
        {"personLabel": {"value": "Edmund Randolph"},
         "start": {"value": "1794-01-02T00:00:00Z"}},
    ]}}
    rows = parse_rows(mock)
    assert len(rows) == 2, rows
    assert rows[0]["start"] == "1790-03-22" and rows[0]["end"] == "1793-12-31"
    assert rows[1]["party"] == "Unknown"

    # malformed date value (stray URL) -> None, not "http://www"
    assert _iso_date("http://www.example.org") is None
    assert _iso_date("1861-03-05T00:00:00Z") == "1861-03-05"
    assert _iso_date(None) is None

    # collapse: merge contiguous same-person terms
    cr = collapse([
        {"name": "A", "party": "X", "start": "1801-03-04", "end": "1805-03-04"},
        {"name": "A", "party": "X", "start": "1805-03-04", "end": "1809-03-04"},
        {"name": "B", "party": "Y", "start": "1809-03-04", "end": None},
    ])
    assert len(cr) == 2, cr
    assert cr[0]["start"] == "1801-03-04" and cr[0]["end"] == "1809-03-04"
    assert cr[1]["end"] is None

    # key stored raw (position label); mapping to code happens in cmd_enrich
    krows = parse_rows({"results": {"bindings": [
        {"personLabel": {"value": "Peter Burnett"}, "posLabel": {"value": "Governor of California"},
         "start": {"value": "1849-12-20T00:00:00Z"},
         "end": {"value": "1851-01-09T00:00:00Z"}},
    ]}}, key_var="posLabel")
    assert krows[0]["key"] == "Governor of California", krows
    _l2c = {}
    for _n, (_c, _dd) in STATEHOOD.items():
        _l2c["Governor of %s" % _n] = _c
        _l2c["governor of %s" % _n] = _c
    assert _l2c["Governor of California"] == "CA"
    assert _l2c["governor of New York"] == "NY"

    # statehood filter: territorial term dropped, straddling term clamped
    filt = filter_after_statehood({"CA": [
        {"name": "TerrGov", "party": "P", "start": "1848-01-01", "end": "1849-01-01"},
        {"name": "Straddle", "party": "P", "start": "1850-01-01", "end": "1852-01-01"},
        {"name": "PostGov", "party": "P", "start": "1855-01-01", "end": None},
    ]})
    ca = filt["CA"]
    assert all(r["name"] != "TerrGov" for r in ca), ca
    straddle = [r for r in ca if r["name"] == "Straddle"][0]
    assert straddle["start"] == "1850-09-09", straddle  # clamped to statehood

    # close_open_terms: only the latest term may stay open; died-in-office
    # (undated end) closed to successor start; pre-statehood zero-length dropped
    co = close_open_terms([
        {"name": "Bulloch", "party": "P", "start": "1788-01-02", "end": None},
        {"name": "Mathews", "party": "P", "start": "1788-01-02", "end": "1788-01-26"},
        {"name": "DiedInOffice", "party": "P", "start": "1905-01-04", "end": None},
        {"name": "Successor", "party": "P", "start": "1909-09-21", "end": None},
    ])
    names = [r["name"] for r in co]
    assert "Bulloch" not in names, co               # zero-length after close -> dropped
    di = [r for r in co if r["name"] == "DiedInOffice"][0]
    assert di["end"] == "1909-09-21", di            # closed to successor
    assert co[-1]["name"] == "Successor" and co[-1]["end"] is None, co  # latest stays open

    # cabinet override effect: appended acting holder becomes current, prior closed
    cab = {"Attorney General": [
        {"name": "Pam Bondi", "party": "Republican", "start": "2025-02-05", "end": None}]}
    cab["Attorney General"].append(
        {"name": "Todd Blanche (acting)", "party": "Republican", "start": "2026-04-02", "end": None})
    cab["Attorney General"] = close_open_terms(cab["Attorney General"])
    ag = cab["Attorney General"]
    assert ag[-1]["name"].startswith("Todd Blanche") and ag[-1]["end"] is None, ag
    assert [r for r in ag if r["name"] == "Pam Bondi"][0]["end"] == "2026-04-02", ag

    # statehood constants sanity
    assert len(STATEHOOD) == 50
    assert STATEHOOD["California"][1] == "1850-09-09"
    assert len({c for c, _ in STATEHOOD.values()}) == 50  # unique codes

    print("self-test OK: parse_rows, collapse, key-extract, statehood filter, 50 states")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--enrich", action="store_true")
    g.add_argument("--diagnose", action="store_true",
                   help="NETWORK: dump gap-state governor holders (dated/undated) to find the cause")
    a = ap.parse_args()
    if a.self_test:
        cmd_self_test()
    elif a.enrich:
        cmd_enrich()
    elif a.diagnose:
        cmd_diagnose()


if __name__ == "__main__":
    main()
