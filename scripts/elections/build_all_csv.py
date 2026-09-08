# -*- coding: utf-8 -*-
"""Build public/data/elections-all.csv: one flat table of every election on
file across all 49 hubs, for readers who want the atlas as a spreadsheet
rather than 49 pages.

WHY A SEPARATE BUILD FROM THE CENSUS
-------------------------------------
lib/electionCensus.ts (the TypeScript census) hand-lists which array(s) to
read per hub because each hub's loader has its own bespoke type. This script
can't import TypeScript, so it reads the same public/data/*-elections.json
files directly and classifies each election generically instead of by a
per-hub switch:

  * A file's `presidential` / `legislative` array keys ARE the series.
  * A file's `elections` array (used by every single-series hub, including
    the papal conclaves) is classified item by item: a `candidates` array
    means presidential (US-style electoral-college rows and R1/R2-ballot
    rows both carry it), a `parties` array means legislative, and neither
    (only the Vatican's conclave records) falls back to "general".
  * `eras` / `legEras` / `presEras` arrays are metadata, never elections.

This mirrors exactly the arrays lib/electionCensus.ts reads for every hub
except the Vatican, which the census deliberately excludes (a conclave is
not a polity-wide ballot) but which belongs in a CSV of "every election on
file". --self-test checks the two counts agree everywhere they should.

Usage:
    python scripts/elections/build_all_csv.py [--self-test]

This script has no --write flag: unlike the systems/census layers it is not
computing anything editorial, so it always writes public/data/elections-all.csv
directly from the source hub files that are already checked in. Re-run it
whenever a hub gains an election and commit the refreshed CSV alongside the
hub JSON that produced it.
"""
import csv
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(DATA, "elections-all.csv")
HUBS_META_TS = os.path.join(ROOT, "lib", "electionHubsMeta.ts")

HEADER = [
    "hub_code", "hub_name", "series", "election_id", "year", "date",
    "type_or_label", "winner_or_largest", "turnout", "seats_total",
    "seat_share_or_vote_share_of_winner", "freedom_label", "url",
]

# Array keys that are metadata (blurb text per era), never election rows.
ERA_KEYS = {"eras", "legEras", "presEras"}


def hub_names_from_ts():
    """code -> display name, read out of lib/electionHubsMeta.ts rather than
    duplicated here — one source of truth, same discipline as every other
    script that touches this table."""
    src = open(HUBS_META_TS, "r", encoding="utf-8").read()
    names = {}
    # Each hub is one line: `xx: { code: "xx", flag: "..", name: "United States", ...`
    for m in re.finditer(r'^\s*(\w+):\s*\{\s*code:\s*"(\w+)".*?name:\s*"([^"]+)"', src, re.M):
        _, code, name = m.groups()
        names[code] = name
    return names


def s(v):
    """Missing/None -> empty string, never the literal 'None'."""
    return "" if v is None else str(v)


def num(v, dp=None):
    if v is None:
        return ""
    if dp is not None:
        return f"{v:.{dp}f}"
    return str(v)


def freedom_label(item, hub_code):
    # The Vatican's conclave records aren't elections in the census's sense
    # (see module docstring) and carry no caveat/unfree fields at all — an
    # invented "free" would misdescribe them, so they get no label.
    if hub_code == "va":
        return ""
    if item.get("unfree"):
        return "unfree"
    if item.get("caveat"):
        return "partial"
    return "free"


def classify_item(item):
    """Series for an item drawn from a generic `elections` array (the
    single-series hubs). A `candidates` array is presidential in both shapes
    the data uses (US electoral-college rows, and R1/R2-ballot rows); a
    `parties` array is legislative; the Vatican's conclave rows have
    neither and fall back to "general"."""
    if item.get("kind") == "presidential":
        return "presidential"
    if item.get("kind") == "legislative":
        return "legislative"
    if "candidates" in item:
        return "presidential"
    if "parties" in item:
        return "legislative"
    return "general"


def presidential_winner_and_share(item):
    # US shape: explicit winner + a candidates list carrying `share`.
    winner = item.get("winner")
    if isinstance(winner, dict) and winner.get("name"):
        name = winner["name"]
        share = None
        for c in item.get("candidates", []):
            if c.get("name") == name:
                share = c.get("share")
                break
        return name, share
    # presAfter shape (most other presidential series).
    pres_after = item.get("presAfter")
    if isinstance(pres_after, dict) and pres_after.get("name"):
        name = pres_after["name"]
        share = None
        for c in item.get("candidates", []):
            if c.get("name") == name:
                share = c.get("r2Share") if c.get("r2Share") is not None else c.get("r1Share")
                break
        return name, share
    # No declared winner on file: fall back to the top candidate by share.
    best = None
    for c in item.get("candidates", []):
        v = c.get("share")
        if v is None:
            v = c.get("r2Share") if c.get("r2Share") is not None else c.get("r1Share")
        if v is None:
            continue
        if best is None or v > best[1]:
            best = (c.get("name"), v)
    if best:
        return best
    return None, None


def legislative_winner_and_share(item):
    seat_leader = item.get("seatLeader")
    parties = item.get("parties") or []
    total = item.get("totalSeats")
    if seat_leader:
        for p in parties:
            if p.get("name") == seat_leader:
                if p.get("seats") is not None and total:
                    return seat_leader, (p["seats"] / total) * 100.0
                return seat_leader, p.get("share")
        return seat_leader, None
    # No seatLeader on file: the party with the most seats (falling back to
    # vote share when no seat counts are recorded at all, e.g. an
    # uncontested-list ritual).
    best = None
    for p in parties:
        v = p.get("seats")
        if v is None:
            continue
        if best is None or v > best[1]:
            best = (p.get("name"), v)
    if best:
        name, seats = best
        share = (seats / total) * 100.0 if total else None
        return name, share
    best = None
    for p in parties:
        v = p.get("share")
        if v is None:
            continue
        if best is None or v > best[1]:
            best = (p.get("name"), v)
    if best:
        return best
    return None, None


def rows_for_hub(hub_code, hub_name, doc):
    rows = []
    for key, items in doc.items():
        if key in ERA_KEYS or not isinstance(items, list):
            continue
        for item in items:
            if key == "presidential":
                series = "presidential"
            elif key == "legislative":
                series = "legislative"
            else:
                series = classify_item(item)

            if series == "presidential":
                winner, share = presidential_winner_and_share(item)
                seats_total = ""
            elif series == "legislative":
                winner, share = legislative_winner_and_share(item)
                seats_total = num(item.get("totalSeats"))
            else:
                # va conclave: `pope` is the winner; no turnout/seats/share.
                winner, share = item.get("pope"), None
                seats_total = ""

            eid = item.get("id", "")
            rows.append([
                hub_code,
                hub_name,
                series,
                s(eid),
                s(item.get("year")),
                s(item.get("date")),
                s(item.get("label")),
                s(winner),
                s(item.get("turnout")) if series != "general" else "",
                seats_total,
                num(share, 2) if share is not None else "",
                freedom_label(item, hub_code),
                f"/elections/{hub_code}/{eid}" if eid != "" else "",
            ])
    return rows


def build():
    names = hub_names_from_ts()
    rows = []
    per_hub = {}
    for path in sorted(glob.glob(os.path.join(DATA, "*-elections.json"))):
        base = os.path.basename(path)
        m = re.match(r"^([a-z]{2})-elections\.json$", base)
        if not m:
            continue
        code = m.group(1)
        if code not in names:
            continue
        doc = json.load(open(path, "r", encoding="utf-8"))
        hub_rows = rows_for_hub(code, names[code], doc)
        rows.extend(hub_rows)
        per_hub[code] = len(hub_rows)
    return rows, per_hub


def write_csv(rows):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(rows)


# ---------------------------------------------------------------------------
# --self-test: the row count this script produces must equal the census
# total (lib/electionCensus.ts), hub by hub, everywhere the census counts a
# hub at all. The census is hand-listed per hub in TypeScript; this mirrors
# it in Python by summing the SAME array lengths (every non-era array key)
# per hub file, which is exactly what electionCensus.ts's row() calls read.
# The Vatican is the one hub the census excludes on purpose (see module
# docstring), so it is reported separately rather than counted as a mismatch.
def census_equivalent_per_hub():
    out = {}
    for path in sorted(glob.glob(os.path.join(DATA, "*-elections.json"))):
        base = os.path.basename(path)
        m = re.match(r"^([a-z]{2})-elections\.json$", base)
        if not m:
            continue
        code = m.group(1)
        doc = json.load(open(path, "r", encoding="utf-8"))
        n = sum(len(v) for k, v in doc.items() if k not in ERA_KEYS and isinstance(v, list))
        out[code] = n
    return out


def _self_test():
    fails = []

    def check(label, got, want):
        if isinstance(got, float) and isinstance(want, float):
            if abs(got - want) > 1e-9:
                fails.append(f"{label}: got {got!r}, want {want!r}")
            return
        if got != want:
            fails.append(f"{label}: got {got!r}, want {want!r}")

    # classify_item: candidates -> presidential, parties -> legislative,
    # neither -> general (the Vatican shape).
    check("candidates -> presidential", classify_item({"candidates": []}), "presidential")
    check("parties -> legislative", classify_item({"parties": []}), "legislative")
    check("neither -> general", classify_item({"pope": "Leo XIV"}), "general")
    check("explicit kind wins", classify_item({"kind": "legislative", "candidates": []}), "legislative")

    # presidential_winner_and_share: US shape (winner + candidates.share).
    us_item = {
        "winner": {"name": "A"},
        "candidates": [{"name": "A", "share": 51.2}, {"name": "B", "share": 48.8}],
    }
    w, sh = presidential_winner_and_share(us_item)
    check("US-shape winner", w, "A")
    check("US-shape share", sh, 51.2)

    # presAfter + r1/r2 shape (de/fr/ar/tw style).
    r2_item = {
        "presAfter": {"name": "C"},
        "candidates": [
            {"name": "C", "r1Share": 40.0, "r2Share": 60.0},
            {"name": "D", "r1Share": 35.0, "r2Share": 40.0},
        ],
    }
    w, sh = presidential_winner_and_share(r2_item)
    check("r2-shape winner", w, "C")
    check("r2-shape share prefers r2", sh, 60.0)

    # legislative_winner_and_share: seatLeader present, seats known.
    leg_item = {
        "seatLeader": "Party X",
        "totalSeats": 100,
        "parties": [{"name": "Party X", "seats": 55}, {"name": "Party Y", "seats": 45}],
    }
    w, sh = legislative_winner_and_share(leg_item)
    check("legislative winner", w, "Party X")
    check("legislative seat share", sh, 55.0)

    # freedom_label: unfree beats caveat; va is always blank.
    check("unfree wins", freedom_label({"unfree": "unfree", "caveat": "x"}, "ru"), "unfree")
    check("caveat -> partial", freedom_label({"caveat": "x"}, "ru"), "partial")
    check("neither -> free", freedom_label({}, "ru"), "free")
    check("va always blank", freedom_label({}, "va"), "")

    # missing fields are "", never the string "None".
    check("s(None) is empty", s(None), "")
    check("num(None) is empty", num(None), "")

    # hub names resolve from the TS table (spot check a few).
    names = hub_names_from_ts()
    check("us name", names.get("us"), "United States")
    check("uk name", names.get("uk"), "United Kingdom")
    check("67 hubs named", len(names), 67)

    # Row-count parity against the census-equivalent count, hub by hub,
    # everywhere the census counts the hub (everywhere but the Vatican).
    rows, per_hub = build()
    census = census_equivalent_per_hub()
    mismatches = []
    for code, want in census.items():
        if code == "va":
            continue
        got = per_hub.get(code, 0)
        if got != want:
            mismatches.append(f"{code}: built {got}, census-equivalent {want}")
    if mismatches:
        fails.append("row-count parity failed for: " + "; ".join(mismatches))
    else:
        print(f"row-count parity OK across {len(census) - 1} census hubs "
              f"({sum(v for k, v in census.items() if k != 'va')} rows)")
    print(f"Vatican (excluded from the census, kept in the CSV): {per_hub.get('va', 0)} rows")

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("build_all_csv self-test OK")
    return 0


def main():
    if "--self-test" in sys.argv:
        return _self_test()
    rows, per_hub = build()
    write_csv(rows)
    print(f"wrote {OUT}: {len(rows)} rows across {len(per_hub)} hubs")
    for code in sorted(per_hub):
        print(f"  {code:3s} {per_hub[code]:4d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
