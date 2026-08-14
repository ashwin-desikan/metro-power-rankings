#!/usr/bin/env python3
"""report-time-machine-history.py - the review sheet for the /countries board.

WHY THIS IS GENERATED. The first version of this document was written by hand
and was materially out of date within a day, because every accuracy fix landed
in the Python and nobody re-typed the markdown. A review sheet that lags the
data it describes is worse than none: it invites sign-off on claims the site is
no longer making. So it is derived from the SAME two JSON files the board
renders from, and regenerating it is one command.

Read it as a list of assertions to argue with. Every line here is a judgment
about who held some ground in some year, and the place to disagree is the
curated table named beside it, not the rendering code.

usage:
  python scripts/report-time-machine-history.py --self-test
  python scripts/report-time-machine-history.py            # rewrite the sheet
  python scripts/report-time-machine-history.py --stdout
"""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(ROOT, "Time Machine - curated history for review.md")

BENCHMARKS = [1800, 1818, 1850, 1880, 1900, 1914, 1930, 1942, 1960, 1990, 2020]
KIND_MEANS = {
    "colony": "counts towards the holder's total",
    "occupied": "counts only when 'count occupied territory' is on",
    "annexed": "counts only when 'count occupied territory' is on",
    "client": "named, never summed - a client state is not a possession",
    "partial": "named, never summed - only part of the modern territory was held",
}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def span(a, b):
    return f"{a}" if a == b else f"{a}-{b}"


def polity_lines(pop):
    out = []
    for p in sorted(pop.get("polities") or [], key=lambda p: (p["from"], p["name"])):
        gaps = "".join(f"  (dissolved {a}-{b})" for a, b in (p.get("gaps") or []))
        out.append(f"### {p['name']}  ·  {span(p['from'], p['to'])}{gaps}")
        out.append("")
        out.append(f"Series is the **{p['basis']}** of its parts."
                   if p["basis"] == "sum" else
                   "Series comes from the source's own record for this polity.")
        out.append("")
        mw = p.get("memberWindows") or []
        if mw:
            out.append("| territory | inside it |")
            out.append("| --- | --- |")
            for slug, a, b in sorted(mw, key=lambda m: (m[1], m[0])):
                note = ""
                if a > p["from"]:
                    note = f" (joined {a})"
                if b < p["to"]:
                    note += f" (left {b + 1})"
                out.append(f"| {slug} | {span(a, b)}{note} |")
        elif p.get("partitionOf"):
            out.append(f"A slice of **{p['partitionOf']}**, not a parent of several "
                       "territories, so there is nothing to sum.")
        out.append("")
    return out


def holding_lines(col):
    curated = [h for h in col["extraHoldings"] if not h.get("derived")]
    derived = [h for h in col["extraHoldings"] if h.get("derived")]
    out = ["| territory | years | held by | kind | note |", "| --- | --- | --- | --- | --- |"]
    for h in sorted(curated, key=lambda h: (h["holder"] or "~", h["from"], h["slug"])):
        out.append(f"| {h['slug']} | {span(h['from'], h['to'])} | "
                   f"{h['holder'] or '_(divided, no single holder)_'} | {h['kind']} | "
                   f"{h.get('note', '')} |")
    out += ["", "### Derived, not curated: gaps between the source's own colonial runs", "",
            "COLDAT records discrete runs of colonial rule and does not bridge a handover, "
            "so each gap below rendered as an independent country until a rule closed it. "
            "Same power on both sides means it never left; different powers means the "
            "source does not say who held it, and guessing would be inventing history.",
            "", "| territory | years | held by | note |", "| --- | --- | --- | --- |"]
    for h in sorted(derived, key=lambda h: (h["slug"], h["from"])):
        out.append(f"| {h['slug']} | {span(h['from'], h['to'])} | "
                   f"{h['holder'] or '_contested_'} | {h.get('note', '')} |")
    return out


def build(pop, col, audit=None):
    L = ["# The /countries Time Machine: every curated claim, for review", ""]
    L += [f"_Generated {datetime.date.today().isoformat()} from "
          "`public/data/country-population.json` and `public/data/country-colonisers.json`. "
          "Regenerate with `python scripts/report-time-machine-history.py`._", ""]
    L += ["The board renders a territory with no rule attached as an ordinary sovereign "
          "row, ranked beside France. That makes the ABSENCE of a rule indistinguishable "
          "from a positive claim of independence, so everything below exists to stop the "
          "board asserting something nobody decided. Argue with the dates here; they are "
          "curation, not a dataset.", ""]

    L += ["## How many states the board shows, by year", "",
          "| year | sovereign rows |", "| --- | --- |"]
    sys.path.insert(0, HERE)
    from importlib import import_module
    aud = import_module("audit-sovereignty".replace("-", "_")) if False else None
    for y, n in (audit or []):
        L.append(f"| {y} | {n} |")
    L += ["", "## Empires and polities", ""]
    L += polity_lines(pop)

    L += ["## Territories split between powers", "",
          "Never summed into any empire, because no single state held them. "
          "A row with one holder does not belong here - that is not a partition, and "
          "the Ottoman Balkans were moved into the empire itself for exactly that reason.",
          "", "| territory | years | divided between |", "| --- | --- | --- |"]
    for d in sorted(pop.get("partitioned") or [], key=lambda d: (d["from"], d["slug"])):
        L.append(f"| {d['slug']} | {span(d['from'], d['to'])} | {', '.join(d['between'])} |")

    L += ["", "## Holdings the colonial dataset cannot know", "",
          "COLDAT codes eight European powers and nothing else, so the American "
          "Philippines, the whole Empire of Japan, every wartime occupation and every "
          "Ottoman and Qing possession are absent from it. `kind` decides aggregation:",
          ""]
    for k, v in KIND_MEANS.items():
        L.append(f"- **{k}** - {v}")
    L += [""]
    L += holding_lines(col)

    frag = col.get("fragmented") or []
    L += ["", "## Not yet one country", "",
          "A modern country's borders often describe a colony rather than a state that "
          "existed before it. Rendering these as ordinary rows says they were countries.",
          "", "| territory | years | what was there instead |", "| --- | --- | --- |"]
    for f in sorted(frag, key=lambda f: f["slug"]):
        L.append(f"| {f['slug']} | {span(f['from'], f['to'])} | {f['note']} |")

    L += ["", "## Dependencies, and when their current holder acquired them", "",
          "| territory | holder | since |", "| --- | --- | --- |"]
    since = col.get("dependencySince") or {}
    for slug, parent in sorted((col.get("dependencies") or {}).items()):
        if slug in since:
            L.append(f"| {slug} | {parent} | {since[slug]} |")
    L += ["", "| territory | earlier holder | years |", "| --- | --- | --- |"]
    for o in col.get("dependencyOverrides") or []:
        L.append(f"| {o['slug']} | {o['holder']} | {span(o['from'], o['to'])} |")
    L += [""]
    return "\n".join(L) + "\n"


def self_test():
    pop = {
        "polities": [{"code": "X", "name": "Ottoman Empire", "from": 1800, "to": 1922,
                      "basis": "sum", "replaces": ["turkey", "greece"],
                      "memberWindows": [["turkey", 1800, 1922], ["greece", 1800, 1829]]}],
        "partitioned": [{"slug": "poland", "from": 1800, "to": 1918, "between": ["a", "b"]}],
    }
    col = {"extraHoldings": [
        {"slug": "belgium", "from": 1815, "to": 1830, "holder": "netherlands",
         "kind": "annexed", "note": "the United Kingdom of the Netherlands"},
        {"slug": "ghana", "from": 1884, "to": 1916, "holder": "united-kingdom",
         "kind": "colony", "note": "two runs", "derived": True},
    ], "fragmented": [], "dependencies": {}, "dependencySince": {},
        "dependencyOverrides": []}
    doc = build(pop, col, audit=[(1800, 28)])

    assert "| greece | 1800-1829 (left 1830) |" in doc, (
        "a member that left before the empire ended must SAY SO, or the sheet "
        "reads as if Greece was Ottoman until 1922", doc)
    assert "| turkey | 1800-1922 |" in doc
    assert "the United Kingdom of the Netherlands" in doc
    assert doc.index("| belgium |") < doc.index("Derived, not curated"), (
        "curated entries come first; a derived guess must never be presented "
        "alongside a hand-checked date as if they carried the same weight")
    assert doc.index("Derived, not curated") < doc.index("| ghana |"), doc
    assert span(1941, 1941) == "1941" and span(1800, 1830) == "1800-1830"
    assert "| 1800 | 28 |" in doc
    assert "_(divided, no single holder)_" not in doc, (
        "no fixture holding is holderless, so the placeholder must not appear")
    print("self-test: 8/8 PASS")
    return 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    pop, col = load("country-population.json"), load("country-colonisers.json")
    sys.path.insert(0, HERE)
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "audit_sovereignty", os.path.join(HERE, "audit-sovereignty.py"))
    aud = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(aud)
    counts = [(y, len(aud.claimed_sovereign(y, pop, col))) for y in BENCHMARKS]
    bad = sum(len(aud.findings(y, pop, col)) for y in BENCHMARKS)
    doc = build(pop, col, audit=counts)
    doc += (f"\n---\n\n_Sovereignty audit at the benchmark years: {bad} finding(s). "
            "Run `python scripts/audit-sovereignty.py --sweep` for all 226 years._\n")
    if "--stdout" in argv:
        sys.stdout.write(doc)
        return 0
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"wrote {os.path.basename(OUT)}: {len(doc) / 1024:.0f} KB, "
          f"{doc.count(chr(10))} lines, audit findings: {bad}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
