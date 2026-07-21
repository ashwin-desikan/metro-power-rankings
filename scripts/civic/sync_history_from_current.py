#!/usr/bin/env python3
"""sync_history_from_current.py -- propagate the CURRENT officeholder snapshot into
the dated time-machine history files, so one edit to the snapshot flows to both
/us-political-leadership (reads the snapshot) and .../time-machine (reads history).

Single-source model (auto-sync): the current snapshot is the edit point --
  public/data/us-congress.json   (executive.cabinet big-4; also pres/vp/president party)
  public/data/governors.json     (current governor per state)
-- and this step reconciles the CURRENT TAIL of the history files:
  public/data/us-cabinet-history.json
  public/data/us-governor-history.json
For each office/state: if the snapshot's current holder already matches the open
term, nothing changes (idempotent); otherwise the prior open term is closed at the
new holder's start date and the new holder is appended as the open (current) term.

Senate and President/VP history are NOT synced here -- they come from their own
authoritative builders (build_senate_history.py / build_executive_history.py off
congress-legislators), which are fresher than the snapshot for those offices.

MODES
  --self-test   Offline. Asserts reconcile_tail on mock data. No network.
  --sync        Read the four files, reconcile, write the two history files.
"""
import argparse, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, "public", "data")
CONG = os.path.join(D, "us-congress.json")
GOVS = os.path.join(D, "governors.json")
CAB_HIST = os.path.join(D, "us-cabinet-history.json")
GOV_HIST = os.path.join(D, "us-governor-history.json")
HOUSE_HIST = os.path.join(D, "us-house-history.json")

# snapshot cabinet office -> history office key (big-4 only)
CAB_OFFICE_MAP = {
    "Secretary of State": "Secretary of State",
    "Secretary of the Treasury": "Secretary of the Treasury",
    "Secretary of Defense": "Secretary of War / Defense",
    "Attorney General": "Attorney General",
}

# governors.json is keyed by state slug; history by USPS code.
SLUG_TO_CODE = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new-hampshire": "NH", "new-jersey": "NJ", "new-mexico": "NM", "new-york": "NY",
    "north-carolina": "NC", "north-dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode-island": "RI", "south-carolina": "SC",
    "south-dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west-virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}


def load(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def close_open_terms(rows):
    """Only the latest-start term may stay open; close any non-latest open/overlap
    to its successor's start; drop zero-length. (Same rule as the builders.)"""
    rows = [dict(r) for r in rows if r.get("start")]
    rows.sort(key=lambda r: (r["start"], 0 if r.get("end") is None else 1, r.get("end") or ""))
    for i in range(len(rows) - 1):
        nxt = rows[i + 1]["start"]
        e = rows[i].get("end")
        if e is None or e > nxt:
            rows[i]["end"] = nxt
    return [r for r in rows if r.get("end") is None or r["end"] > r["start"]]


def house_split_to_parties(split):
    """us-congress.json house.partySplit {Party: seats, note?: str} ->
    ([{party, seats}], total). Preserves order; drops 'note'/non-numeric. Pure."""
    parties = [{"party": k, "seats": v} for k, v in split.items()
               if k != "note" and isinstance(v, (int, float))]
    return parties, sum(p["seats"] for p in parties)


def pick_current_congress(rows, today):
    """Index of the Congress covering `today` (start<=today<end); else the last
    row. Pure -- only the CURRENT Congress is ever rewritten (past ones are fact)."""
    if not rows:
        return -1
    for i, r in enumerate(rows):
        if r.get("start", "") <= today and today < r.get("end", "9999"):
            return i
    return len(rows) - 1


def reconcile_tail(rows, name, party, since):
    """Ensure `name` (starting `since`) is the current open term. Idempotent.
    Returns (new_rows, changed:bool). Pure -- unit tested."""
    rows = [dict(r) for r in rows]
    rows.sort(key=lambda r: r["start"])
    if not name or not since:
        return rows, False
    latest = rows[-1] if rows else None
    if latest and latest["name"] == name:
        did = False
        if latest.get("end") is not None:
            latest["end"] = None                      # reopen (successor reverted)
            did = True
        # `since` is authoritative for when the current holder took office. If the
        # history start is wrong (e.g. a later date that leaves a gap -- the DoD->
        # "Department of War" rename gave Hegseth a Sep-2025 start), correct it.
        if latest.get("start") != since:
            latest["start"] = since
            did = True
        return (close_open_terms(rows), True) if did else (rows, False)
    # new holder: append; close_open_terms will close the prior open term to `since`
    rows.append({"name": name, "party": party or "Unknown", "start": since, "end": None})
    return close_open_terms(rows), True


def cmd_sync():
    changed = 0
    # --- Cabinet (big-4) from us-congress.json ---
    cong = load(CONG, {}) or {}
    execb = cong.get("executive", {})
    pres_party = (execb.get("president", {}) or {}).get("party", "Unknown")
    feed_cab = {c.get("office"): c for c in execb.get("cabinet", [])}
    cabdoc = load(CAB_HIST, {}) or {}
    cab = cabdoc.get("cabinet", {})
    for snap_office, hist_office in CAB_OFFICE_MAP.items():
        c = feed_cab.get(snap_office)
        if not c or hist_office not in cab:
            continue
        name = c.get("name", "")
        if c.get("acting") and "(acting)" not in name.lower():
            name = "%s (acting)" % name
        new, did = reconcile_tail(cab[hist_office], name, pres_party, (c.get("since") or "")[:10])
        if did:
            cab[hist_office] = new
            changed += 1
            print("  cabinet: %-26s -> %s (since %s)" % (hist_office, name, c.get("since")))
    if cabdoc:
        cabdoc["cabinet"] = cab
        with open(CAB_HIST, "w", encoding="utf-8") as f:
            json.dump(cabdoc, f, ensure_ascii=False, separators=(",", ":"))

    # --- Governors from governors.json (nested under "states") ---
    govs = (load(GOVS, {}) or {}).get("states", {})
    govdoc = load(GOV_HIST, {}) or {}
    gov = govdoc.get("governors", {})
    for slug, g in govs.items():
        code = SLUG_TO_CODE.get(slug)
        if not code or code not in gov:
            continue
        new, did = reconcile_tail(gov[code], g.get("name", ""), g.get("party", "Unknown"),
                                  (g.get("since") or "")[:10])
        if did:
            gov[code] = new
            changed += 1
            print("  governor: %-16s -> %s (since %s)" % (code, g.get("name"), g.get("since")))
    if govdoc:
        govdoc["governors"] = gov
        with open(GOV_HIST, "w", encoding="utf-8") as f:
            json.dump(govdoc, f, ensure_ascii=False, separators=(",", ":"))

    # --- House: current Congress party split from us-congress.json ---
    split = (cong.get("house", {}) or {}).get("partySplit", {})
    house = load(HOUSE_HIST, []) or []
    if split and isinstance(house, list) and house:
        import datetime
        today = datetime.date.today().isoformat()
        i = pick_current_congress(house, today)
        parties, total = house_split_to_parties(split)
        if parties and (house[i].get("parties") != parties or house[i].get("total") != total):
            house[i]["parties"] = parties
            house[i]["total"] = total
            changed += 1
            print("  house: %s Congress -> %s (total %d)" % (
                house[i].get("congress"),
                ", ".join("%s %d" % (p["party"], p["seats"]) for p in parties), total))
            with open(HOUSE_HIST, "w", encoding="utf-8") as f:
                json.dump(house, f, ensure_ascii=False, separators=(",", ":"))

    print("sync complete: %d office/chamber tail(s) updated" % changed)


def cmd_self_test():
    # already current -> no change (idempotent)
    rows = [{"name": "Old", "party": "R", "start": "2017-01-20", "end": "2025-01-20"},
            {"name": "Cur", "party": "R", "start": "2025-01-20", "end": None}]
    out, did = reconcile_tail(rows, "Cur", "R", "2025-01-20")
    assert did is False and out[-1]["name"] == "Cur" and out[-1]["end"] is None

    # new holder -> prior closed at `since`, new appended open
    out, did = reconcile_tail(rows, "New (acting)", "R", "2026-04-02")
    assert did is True, out
    assert out[-1]["name"] == "New (acting)" and out[-1]["end"] is None
    prev = [r for r in out if r["name"] == "Cur"][0]
    assert prev["end"] == "2026-04-02", out          # closed at new start

    # current holder with a WRONG (too-late) start -> corrected to `since`, gap closed
    gap = [{"name": "Acting", "party": "R", "start": "2025-01-20", "end": "2025-01-25"},
           {"name": "Sec", "party": "R", "start": "2025-09-05", "end": None}]
    out, did = reconcile_tail(gap, "Sec", "R", "2025-01-25")
    assert did is True, out
    sec = [r for r in out if r["name"] == "Sec"][0]
    assert sec["start"] == "2025-01-25" and sec["end"] is None, out   # start fixed, no gap

    # empty snapshot -> no-op
    assert reconcile_tail(rows, "", "R", "")[1] is False

    # slug map covers 50 states, unique codes
    assert len(SLUG_TO_CODE) == 50 and len(set(SLUG_TO_CODE.values())) == 50

    # house: split -> parties+total (drops note/non-numeric, preserves order)
    parties, total = house_split_to_parties(
        {"Republican": 218, "Democratic": 212, "Independent": 1, "Vacant": 4, "note": "x"})
    assert total == 435 and parties[0] == {"party": "Republican", "seats": 218}
    assert all(p["party"] != "note" for p in parties) and len(parties) == 4
    # pick current Congress by date; fallback to last
    rows = [{"congress": 118, "start": "2023-01-03", "end": "2025-01-03"},
            {"congress": 119, "start": "2025-01-03", "end": "2027-01-03"}]
    assert pick_current_congress(rows, "2026-07-21") == 1
    assert pick_current_congress(rows, "2099-01-01") == 1   # future -> last
    assert pick_current_congress([], "2026-01-01") == -1
    print("self-test OK: reconcile_tail, slug map, house split+current-Congress pick")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--sync", action="store_true")
    a = ap.parse_args()
    cmd_self_test() if a.self_test else cmd_sync()


if __name__ == "__main__":
    main()
