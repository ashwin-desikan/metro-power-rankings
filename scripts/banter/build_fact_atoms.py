#!/usr/bin/env python3
"""
build_fact_atoms.py — turn the site's dated datasets into retrieval-ready
fact atoms for the Banter Engine.

An atom is one line of JSONL: {"text", "date", "tags", "src"}. The date is the
day the fact BECAME TRUE, which is what makes deterministic time-locking
possible: the retrieval layer serves only atoms with date <= scenario_date.
When a source gives only a year or a fuzzy range, the atom is dated
CONSERVATIVELY LATE (e.g. 31 December of that year), so a mid-year scenario
can never be told about something that had not happened yet. Better to be
ignorant than anachronistic.

Sources (all under public/data/**, all already dated):
  champions-history.json        6,600+ champions across 19 sports, 1860-now
  leaders/<country>.json        heads of government/state with term dates
  olympics/editions-index.json  every Games with host city and size
  us-elections.json             presidential results, candidates, EV
  uk-elections.json             general elections, parties, PMs

Deliberately excluded: conflicts.json (not banter material), any dataset
without dates. Leaders files for defunct empires are included (tagged
"ancient") — they power deep-history scenarios.

Output: _to_delete/banter/facts.jsonl (derived artifact, gitignored home).
With --site, ALSO writes lib/banter/facts.json — the compact JSON array the
/api/banter beta gateway bundles (committed like other derived site data).
Run with --self-test to verify invariants and write nothing.
Deterministic: no RNG at all.
"""
import glob, json, os, re, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("-") \
    else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(ROOT, "_to_delete", "banter", "facts.jsonl")

ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
atoms = []

def add(text, date, tags, src):
    if not ISO.match(date or ""):
        return False
    atoms.append({"text": text.strip(), "date": date, "tags": sorted(set(t.lower() for t in tags)), "src": src})
    return True

# ---------------------------------------------------------------- champions
def do_champions():
    path = os.path.join(DATA, "champions-history.json")
    rows = json.load(open(path, encoding="utf-8"))
    n = 0
    for r in rows:
        date = r.get("dateAwarded") or r.get("date")
        if not date or not ISO.match(date):
            # year-only rows: date conservatively to New Year's Eve
            y = r.get("year")
            if not y: continue
            date = "%04d-12-31" % y
        season = r.get("season") or str(r.get("year"))
        # eraName is the PERIOD-CORRECT name ("VFL Premiership" in 1983, "European Cup",
        # "First Division") — exactly what a time-locked engine must speak
        comp = r.get("eraName") or r.get("competition")
        text = "%s won the %s %s (%s)." % (r.get("champion"), season, comp, r.get("sport"))
        n += add(text, date, [r.get("sport", ""), r.get("competition", ""), comp, r.get("scope", ""), "sport"],
                 "champions-history")
    print("champions: %d atoms" % n)

# ---------------------------------------------------------------- leaders
def do_leaders():
    n = 0
    for path in sorted(glob.glob(os.path.join(DATA, "leaders", "*.json"))):
        base = os.path.basename(path)
        if base.startswith("_"): continue
        slug = base[:-5]
        country = slug.replace("-", " ").title()
        try:
            rows = json.load(open(path, encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rows, list): continue
        ancient = not any((l.get("start") or "").startswith(("19", "20")) for l in rows if isinstance(l, dict))
        for l in rows:
            if not isinstance(l, dict): continue
            name, role = l.get("name"), l.get("role") or "leader"
            start, end = l.get("start"), l.get("end")
            if not name: continue
            tags = ["politics", "leaders", slug] + (["ancient"] if ancient else [])
            if start and ISO.match(start):
                n += add("%s became %s of %s on %s%s." % (
                    name, role, country, start, (" (%s)" % l["party"]) if l.get("party") else ""),
                    start, tags, "leaders/" + slug)
            if end and ISO.match(end) and not l.get("current"):
                n += add("%s's time as %s of %s ended on %s." % (name, role, country, end),
                    end, tags, "leaders/" + slug)
    print("leaders: %d atoms" % n)

# ---------------------------------------------------------------- olympics
def do_olympics():
    path = os.path.join(DATA, "olympics", "editions-index.json")
    rows = json.load(open(path, encoding="utf-8"))
    n = 0
    for r in rows:
        y, season = r.get("year"), r.get("season") or ""
        if not y: continue
        # conservative late-dating: Summer Games have ended by 30 Sep, Winter by 31 Mar
        date = "%04d-09-30" % y if season == "Summer" else "%04d-03-31" % y
        text = "The %s were held in %s (%s nations, %s events)." % (
            r.get("name"), r.get("hostCity"), r.get("nations"), r.get("events"))
        n += add(text, date, ["sport", "olympics", season], "olympics")
    print("olympics: %d atoms" % n)

# ---------------------------------------------------------------- elections
MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"])}

def us_date(s, year):
    m = re.match(r"^(\w+) (\d{1,2}), (\d{4})$", s or "")
    if m and m.group(1) in MONTHS:
        return "%04d-%02d-%02d" % (int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
    return "%04d-12-31" % year  # conservative

def do_us_elections():
    d = json.load(open(os.path.join(DATA, "us-elections.json"), encoding="utf-8"))
    n = 0
    for e in d.get("elections", []):
        cands = e.get("candidates") or []
        if not cands: continue
        w = max(cands, key=lambda c: (c.get("ev") or 0))
        date = us_date(e.get("date"), e.get("year"))
        others = ", ".join("%s (%s) %s EV" % (c.get("name"), c.get("party"), c.get("ev") or 0)
                           for c in cands[:3] if c is not w)
        text = "%s (%s) won the %s US presidential election with %s electoral votes%s." % (
            w.get("name"), w.get("party"), e.get("year"), w.get("ev"),
            ("; also ran: " + others) if others else "")
        n += add(text, date, ["politics", "elections", "united-states"], "us-elections")
    print("us-elections: %d atoms" % n)

def do_uk_elections():
    d = json.load(open(os.path.join(DATA, "uk-elections.json"), encoding="utf-8"))
    n = 0
    for e in d.get("elections", []):
        year = e.get("year")
        if not year: continue
        pm = (e.get("pmAfter") or {}).get("name")
        parties = e.get("parties") or []
        top = max(parties, key=lambda p: (p.get("seats") or 0)) if parties else None
        bits = []
        if top: bits.append("%s won the most seats (%s)" % (top.get("name"), top.get("seats")))
        if pm: bits.append("%s emerged as Prime Minister" % pm)
        if not bits: continue
        # UK polling dates are ranges in early records: date conservatively to year end
        date = "%04d-12-31" % year
        n += add("In the %s United Kingdom general election, %s." % (year, "; ".join(bits)),
                 date, ["politics", "elections", "united-kingdom"], "uk-elections")
    print("uk-elections: %d atoms" % n)

# ---------------------------------------------------------------- run
def self_test():
    bad = [a for a in atoms if not ISO.match(a["date"]) or not a["text"] or not a["tags"]]
    dupes = len(atoms) - len({(a["text"], a["date"]) for a in atoms})
    # the invariant that makes the whole engine honest:
    future_leak_probe = [a for a in atoms if a["date"] > "2027-12-31"]
    ok = not bad and not future_leak_probe
    print("self-test: %s (%d atoms, %d malformed, %d dupes, %d absurd-future)"
          % ("PASS" if ok else "FAIL", len(atoms), len(bad), dupes, len(future_leak_probe)))
    return ok

def main():
    do_champions(); do_leaders(); do_olympics(); do_us_elections(); do_uk_elections()
    if not self_test():
        sys.exit(1)
    if "--self-test" in sys.argv:
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    ordered = sorted(atoms, key=lambda x: x["date"])
    with open(OUT, "w", encoding="utf-8") as f:
        for a in ordered:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")
    print("wrote %s (%d atoms)" % (OUT, len(atoms)))
    if "--site" in sys.argv:
        site = os.path.join(ROOT, "lib", "banter", "facts.json")
        os.makedirs(os.path.dirname(site), exist_ok=True)
        slim = [{"text": a["text"], "date": a["date"], "tags": a["tags"]} for a in ordered]
        with open(site, "w", encoding="utf-8") as f:
            json.dump(slim, f, ensure_ascii=False)
        print("wrote %s (%.1f KB)" % (site, os.path.getsize(site) / 1024))

if __name__ == "__main__":
    main()
