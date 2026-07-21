#!/usr/bin/env python3
"""refresh_cabinet.py -- weekly detection for the US Cabinet (all cabinet-level
offices in public/data/us-congress.json), so a Secretary change stops sitting
stale. Two jobs in one pass, both driven off Wikidata:

  1. PROPOSE  -- for each office, find Wikidata's current holder (a P39 term with
     no end date). If it differs from the snapshot, propose the change. Because
     Wikidata is noisy/slow on current cabinet officials, changes are meant to go
     to the REVIEW PR the civic workflow already opens -- never auto-applied.
  2. MONITOR  -- flag any office whose snapshot holder now shows an END DATE on
     Wikidata (a strong 'they've left' signal), even when Wikidata hasn't yet
     recorded the successor. These are the entries a human should look at.

ACTING ROLES: Wikidata is slow/unreliable on acting officials, so an acting
appointee (e.g. an acting AG/DNI) may not appear here; the curated `acting` flag
in us-congress.json remains the source for those. This tool improves detection of
confirmed changes and surfaces stale entries; it does not replace curation.

Offices are matched by the position item's EXACT English label (Q-ids proved
unreliable). A 0-holder count for an office => its label needs a fix; the --check
report prints per-office counts so that surfaces immediately.

MODES
  --self-test   Offline. Asserts the pure diff/monitor logic on mock holders.
  --monitor     NETWORK. Report only (current holder + left-signals). No writes.
  --check       NETWORK. Report AND write proposed name/since changes into
                us-congress.json (for the review PR). Preserves other fields.
"""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sparql, sanity_ok, load_json, write_json  # noqa

ROOT = Path(__file__).resolve().parents[2]
CONG = ROOT / "public" / "data" / "us-congress.json"

# snapshot office -> Wikidata position English label(s) (War/Defense merged upstream).
OFFICES = {
    "Secretary of State": ["United States Secretary of State"],
    "Secretary of the Treasury": ["United States Secretary of the Treasury"],
    "Secretary of Defense": ["United States Secretary of Defense"],
    "Attorney General": ["United States Attorney General"],
    "Secretary of the Interior": ["United States Secretary of the Interior"],
    "Secretary of Agriculture": ["United States Secretary of Agriculture"],
    "Secretary of Commerce": ["United States Secretary of Commerce"],
    "Secretary of Labor": ["United States Secretary of Labor"],
    "Secretary of Health and Human Services": ["United States Secretary of Health and Human Services"],
    "Secretary of Housing and Urban Development": ["United States Secretary of Housing and Urban Development"],
    "Secretary of Transportation": ["United States Secretary of Transportation"],
    "Secretary of Energy": ["United States Secretary of Energy"],
    "Secretary of Education": ["United States Secretary of Education"],
    "Secretary of Veterans Affairs": ["United States Secretary of Veterans Affairs"],
    "Secretary of Homeland Security": ["United States Secretary of Homeland Security"],
    "White House Chief of Staff": ["White House Chief of Staff"],
    "Director of National Intelligence": ["Director of National Intelligence"],
    "Director of the Central Intelligence Agency": ["Director of the Central Intelligence Agency"],
    "United States Trade Representative": ["United States Trade Representative"],
    "Director of the Office of Management and Budget": ["Director of the Office of Management and Budget"],
    "Administrator of the Environmental Protection Agency": ["Administrator of the Environmental Protection Agency"],
    "Administrator of the Small Business Administration": ["Administrator of the Small Business Administration"],
}


def query_office(labels):
    values = " ".join('"%s"@en' % l for l in labels)
    q = """SELECT ?personLabel ?start ?end WHERE {
      VALUES ?posLabel { %s }
      ?pos rdfs:label ?posLabel .
      ?person p:P39 ?st . ?st ps:P39 ?pos .
      ?person wdt:P31 wd:Q5 .
      OPTIONAL { ?st pq:P580 ?start }
      OPTIONAL { ?st pq:P582 ?end }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }""" % values
    holders = []
    for b in sparql(q):
        nm = b.get("personLabel", {}).get("value", "")
        if not sanity_ok(nm):
            continue
        holders.append({
            "name": nm,
            "start": (b.get("start", {}).get("value", "") or "")[:10] or None,
            "end": (b.get("end", {}).get("value", "") or "")[:10] or None,
        })
    return holders


def assess(snapshot_name, holders):
    """Pure: given the snapshot's current name and Wikidata holders for an office,
    return (status, wd_current, wd_current_start).
      status in {OK, CHANGE, LEFT, UNKNOWN}
    OK      snapshot matches Wikidata's open (no-end) holder
    CHANGE  a single, different open holder on Wikidata -> propose it
    LEFT    snapshot person appears ONLY with an end date -> they've left; no clear
            successor yet -> flag for review, do not auto-change
    UNKNOWN no holders / ambiguous
    """
    if not holders:
        return "UNKNOWN", None, None
    open_holders = [h for h in holders if not h["end"]]
    snap_norm = (snapshot_name or "").strip().lower()
    open_names = {h["name"].strip().lower() for h in open_holders}
    if snap_norm in open_names:
        return "OK", snapshot_name, None
    # snapshot person present but only with an end date => they've left
    snap_ended = any(h["name"].strip().lower() == snap_norm and h["end"] for h in holders)
    if len(open_holders) == 1:
        h = open_holders[0]
        return "CHANGE", h["name"], h["start"]
    if snap_ended:
        return "LEFT", None, None
    return "UNKNOWN", None, None


def run(write):
    cong = load_json(CONG)
    cab = cong["executive"]["cabinet"]
    by_office = {c["office"]: c for c in cab}
    changes, flags = 0, 0
    print("%-46s %-22s %-22s %s" % ("OFFICE", "SNAPSHOT", "WIKIDATA-CURRENT", "STATUS"))
    for office, labels in OFFICES.items():
        c = by_office.get(office)
        if not c:
            continue
        holders = query_office(labels)
        # Respect curated acting entries: Wikidata is slow/wrong on acting roles,
        # so never propose reverting an `acting:true` snapshot entry. Report only.
        if c.get("acting"):
            wd_open = [h["name"] for h in holders if not h["end"]]
            print("%-46s %-22s %-22s %s" % (
                office[:46], (c.get("name", "") or "")[:22],
                (wd_open[0] if wd_open else "-")[:22], "ACTING-CURATED (skipped)"))
            continue
        status, wd_name, wd_start = assess(c.get("name", ""), holders)
        note = ""
        if status == "CHANGE":
            changes += 1
            note = "-> propose"
            if write:
                c["name"] = wd_name
                if wd_start:
                    c["since"] = wd_start
                c.pop("acting", None)   # a newly-detected confirmed holder is not acting
        elif status == "LEFT":
            flags += 1
            note = "!! snapshot holder shows an end date on Wikidata - review"
        elif status == "UNKNOWN" and not holders:
            note = "(0 holders - check the position label)"
        print("%-46s %-22s %-22s %s %s" % (
            office[:46], (c.get("name", "") or "")[:22], (wd_name or "-")[:22], status, note))
    if write and changes:
        write_json(CONG, cong, sort_keys=False)
    print("\n%d proposed change(s), %d left-signal flag(s)%s" % (
        changes, flags, " (written to us-congress.json for the review PR)" if write and changes else ""))


def cmd_self_test():
    # OK: snapshot is the open holder
    assert assess("Marco Rubio", [{"name": "Marco Rubio", "start": "2025-01-20", "end": None}])[0] == "OK"
    # CHANGE: a single different open holder
    s, n, st = assess("Old Sec", [{"name": "Old Sec", "start": "2021-01-20", "end": "2025-01-20"},
                                  {"name": "New Sec", "start": "2025-01-20", "end": None}])
    assert s == "CHANGE" and n == "New Sec" and st == "2025-01-20", (s, n, st)
    # LEFT: snapshot person only appears with an end date, no clear successor
    assert assess("Gone Sec", [{"name": "Gone Sec", "start": "2025-02-12", "end": "2026-06-02"}])[0] == "LEFT"
    # UNKNOWN: no data, or ambiguous multiple open holders
    assert assess("X", [])[0] == "UNKNOWN"
    assert assess("X", [{"name": "A", "start": "1", "end": None},
                        {"name": "B", "start": "2", "end": None}])[0] == "UNKNOWN"
    # 22 offices, unique
    assert len(OFFICES) == 22 and len(set(OFFICES)) == 22
    print("self-test OK: assess (OK/CHANGE/LEFT/UNKNOWN), 22 offices")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--monitor", action="store_true")
    g.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        cmd_self_test()
    else:
        run(write=a.check)


if __name__ == "__main__":
    main()
