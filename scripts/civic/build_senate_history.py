#!/usr/bin/env python3
"""build_senate_history.py -- (re)build public/data/us-senate-history.json from the
authoritative, continuously-maintained unitedstates/congress-legislators project.

This is the AUTO-committed half of the time-machine refresh: congress-legislators
is human-curated and high-quality (unlike Wikidata's noisy current-officeholder
data), so re-running it weekly keeps every Senate term -- including the current
tail -- correct with no review needed. Output feeds
/us-political-leadership/time-machine (getSenateHistory).

Source files (raw GitHub, public domain):
  legislators-current.yaml, legislators-historical.yaml

MODES
  --self-test   Offline. Asserts build_terms() over mock people. No network.
  --build       NETWORK. Fetch both YAMLs, write us-senate-history.json.

DEPS: pyyaml.  (CI: pip install pyyaml)
"""
import argparse, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "data", "us-senate-history.json")
BASE = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/"
FILES = ["legislators-current.yaml", "legislators-historical.yaml"]


def full_name(n):
    if n.get("official_full"):
        return n["official_full"]
    parts = [n.get("first", "")]
    if n.get("middle"):
        parts.append(n["middle"])
    parts.append(n.get("last", ""))
    if n.get("suffix"):
        parts.append(n["suffix"])
    return " ".join(p for p in parts if p).strip()


def build_terms(people):
    """[person dicts] -> deduped, sorted list of Senate term rows. Pure."""
    rows = []
    for person in people:
        nm = full_name(person.get("name", {}))
        if not nm:
            continue
        for t in person.get("terms", []):
            if t.get("type") != "sen":
                continue
            p = t.get("party")
            rows.append({
                "name": nm,
                "state": t.get("state"),
                "class": t.get("class"),
                "party": p if p not in (None, "None", "Unknown") else "Unknown",
                "start": t.get("start"),
                "end": t.get("end"),  # None = current
            })
    rows.sort(key=lambda r: (r["start"] or "", r["state"] or "", r["class"] or 0))
    return rows


def _fetch_yaml(fname):
    import urllib.request
    import yaml
    req = urllib.request.Request(BASE + fname, headers={"User-Agent":
        "CitizenOfNowhere-senate-history/1.0 (https://rankings.citizenofnowhere.org)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return yaml.safe_load(r.read().decode("utf-8"))


def cmd_build():
    people = []
    for f in FILES:
        data = _fetch_yaml(f)
        people.extend(data)
        print("  %-32s %5d people" % (f, len(data)))
    rows = build_terms(people)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "source": "unitedstates/congress-legislators (public domain)",
            "note": "Every U.S. Senate term with start/end. A sitting senator's "
                    "current term carries its scheduled end date (not null); "
                    "filter start<=date<end for a given day.",
            "terms": rows,
        }, fh, ensure_ascii=False, separators=(",", ":"))
    # sanity: how many seats are active TODAY (term start<=today<end)
    import datetime
    today = datetime.date.today().isoformat()
    active = [r for r in rows if r["start"] and r["start"] <= today
              and (r["end"] is None or today < r["end"])]
    print("wrote %s: %d terms, %d seats active today (%s)" % (
        os.path.relpath(OUT, ROOT), len(rows), len(active), today))
    if not (90 <= len(active) <= 100):
        print("  WARNING: active senators today = %d (expected ~96-100)" % len(active))


def cmd_self_test():
    people = [
        {"name": {"official_full": "Jane Doe"}, "terms": [
            {"type": "sen", "state": "WA", "class": 1, "party": "Democrat",
             "start": "2019-01-03", "end": "2025-01-03"},
            {"type": "sen", "state": "WA", "class": 1, "party": "Democrat",
             "start": "2025-01-03", "end": None}]},
        {"name": {"first": "John", "last": "Roe"}, "terms": [
            {"type": "rep", "state": "OH", "start": "2001-01-03", "end": "2003-01-03"},
            {"type": "sen", "state": "OH", "class": 3, "party": None,
             "start": "1789-03-04", "end": "1791-03-03"}]},
    ]
    rows = build_terms(people)
    assert len(rows) == 3, rows                    # 2 sen for Doe + 1 sen for Roe; rep skipped
    assert rows[0]["name"] == "John Roe" and rows[0]["party"] == "Unknown"  # earliest, null->Unknown
    assert rows[0]["start"] == "1789-03-04"
    doe = [r for r in rows if r["name"] == "Jane Doe"]
    assert len(doe) == 2 and any(r["end"] is None for r in doe)
    assert full_name({"first": "A", "middle": "B", "last": "C", "suffix": "Jr."}) == "A B C Jr."
    print("self-test OK: build_terms (sen-only, dedupe, null-party, ordering)")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--build", action="store_true")
    a = ap.parse_args()
    cmd_self_test() if a.self_test else cmd_build()


if __name__ == "__main__":
    main()
