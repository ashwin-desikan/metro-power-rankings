#!/usr/bin/env python3
"""build_executive_history.py -- (re)build public/data/us-executive-history.json
(Presidents + Vice Presidents, dated) from unitedstates/congress-legislators
executive.yaml.

AUTO-committed half of the time-machine refresh: executive.yaml is authoritative
and rarely changes, so re-running it weekly keeps the President/VP timeline
correct with no review. Output feeds /us-political-leadership/time-machine
(getExecutiveHistory). The hand-built file this replaces was date-validated
against executive.yaml (0 diffs), so this reproduces it deterministically.

MODES
  --self-test   Offline. Asserts collapse + party mapping on mock terms.
  --build       NETWORK. Fetch executive.yaml, write us-executive-history.json.

DEPS: pyyaml.
"""
import argparse, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "data", "us-executive-history.json")
URL = ("https://raw.githubusercontent.com/unitedstates/congress-legislators/"
       "main/executive.yaml")

# executive.yaml party labels -> canonical labels used by the time machine.
PARTY_MAP = {"no party": "Unaffiliated", "Democrat": "Democratic"}


def full_name(n):
    parts = [n.get("first", "")]
    if n.get("middle"):
        parts.append(n["middle"])
    parts.append(n.get("last", ""))
    if n.get("suffix"):
        parts.append(n["suffix"])
    return " ".join(p for p in parts if p).strip()


def _collapse(rows):
    """Merge consecutive same-person terms whose end == next start (two elected
    terms -> one continuous span)."""
    rows = sorted(rows, key=lambda r: r["start"])
    out = []
    for r in rows:
        if out and out[-1]["name"] == r["name"] and out[-1]["end"] == r["start"]:
            out[-1]["end"] = r["end"]
        else:
            out.append(dict(r))
    return out


def build(execs):
    """executive.yaml list -> {presidents:[...], vicePresidents:[...]}. Pure."""
    prez, vp = [], []
    for person in execs:
        nm = full_name(person.get("name", {}))
        for t in person.get("terms", []):
            row = {"name": nm,
                   "party": PARTY_MAP.get(t.get("party"), t.get("party") or "Unaffiliated"),
                   "start": t.get("start"), "end": t.get("end")}
            if t.get("type") == "prez":
                prez.append(row)
            elif t.get("type") == "viceprez":
                vp.append(row)
    return {"presidents": _collapse(prez), "vicePresidents": _collapse(vp)}


def cmd_build():
    import urllib.request
    import yaml
    req = urllib.request.Request(URL, headers={"User-Agent":
        "CitizenOfNowhere-exec-history/1.0 (https://rankings.citizenofnowhere.org)"})
    with urllib.request.urlopen(req, timeout=90) as r:
        execs = yaml.safe_load(r.read().decode("utf-8"))
    out = build(execs)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    np, nv = len(out["presidents"]), len(out["vicePresidents"])
    print("wrote %s: %d presidents, %d vice presidents" % (
        os.path.relpath(OUT, ROOT), np, nv))
    if not (44 <= np <= 50):
        print("  WARNING: president count = %d (expected ~47)" % np)


def cmd_self_test():
    execs = [
        {"name": {"first": "George", "last": "Washington"}, "terms": [
            {"type": "prez", "party": "no party", "start": "1789-04-30", "end": "1793-03-04"},
            {"type": "prez", "party": "no party", "start": "1793-03-04", "end": "1797-03-04"}]},
        {"name": {"first": "John", "last": "Adams"}, "terms": [
            {"type": "viceprez", "party": "Federalist", "start": "1789-04-21", "end": "1797-03-04"}]},
        {"name": {"first": "Andrew", "last": "Jackson"}, "terms": [
            {"type": "prez", "party": "Democrat", "start": "1829-03-04", "end": "1833-03-04"}]},
    ]
    out = build(execs)
    # Washington's two terms collapse to one 1789-1797 span
    assert len(out["presidents"]) == 2, out["presidents"]
    w = out["presidents"][0]
    assert w["name"] == "George Washington" and w["start"] == "1789-04-30" and w["end"] == "1797-03-04"
    assert w["party"] == "Unaffiliated"                       # "no party" mapped
    assert out["presidents"][1]["party"] == "Democratic"      # "Democrat" mapped
    assert out["vicePresidents"][0]["name"] == "John Adams"
    print("self-test OK: build (collapse consecutive terms, party mapping, prez/vp split)")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--build", action="store_true")
    a = ap.parse_args()
    cmd_self_test() if a.self_test else cmd_build()


if __name__ == "__main__":
    main()
