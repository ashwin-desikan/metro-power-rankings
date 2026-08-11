#!/usr/bin/env python3
"""Build cross-sport team ownership data from the curated seed.

Unlike valuations (which come from Supabase because the workbook carries
1998-2025 history), ownership is 187 rows of curated prose with a per-row
source. It lives in scripts/data/team-owners-seed.json so every edit is
diffable and reviewable in git -- the same pattern as
scripts/business/data/culture-owners.json.

The seed is validated against public/data/valuations/valuations.json: every
owner row must join to a team on the valuations board, and every team on the
board must have an owner row. A mismatch is a hard failure, because a silently
missing row would show as a blank Owner cell rather than an error.

Portfolio rollups are NOT computed here. They are derived in lib/teamOwners.ts
by joining to lib/valuations.ts, so franchise values have exactly one source of
truth and cannot drift between the two files.

Emits public/data/owners/team-owners.json:
  { "generated": "<iso>", "rows": [ {team, league, ownerDisplay, ...}, ... ] }

Usage:
  python scripts/build-team-owners-data.py            # build
  python scripts/build-team-owners-data.py --self-test  # offline checks only
  python scripts/build-team-owners-data.py --dry       # validate, do not write
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "scripts", "data", "team-owners-seed.json")
VALS = os.path.join(ROOT, "public", "data", "valuations", "valuations.json")
OUT = os.path.join(ROOT, "public", "data", "owners", "team-owners.json")

REQUIRED = ("team", "league", "owner_display", "owner_key", "owner_type", "confidence")
CONFIDENCE = {"sourced", "cross-checked", "contested"}

# One consistent axis: what KIND of entity holds control. Kept as a closed set
# so a typo in the seed fails the build instead of creating a phantom category.
# UEFA's domestic/foreign-private split (European Club Finance and Investment
# Landscape 2025, p.67) is a second, orthogonal axis and is deliberately NOT
# folded in here -- half-applying it was the exact bug this set caught.
OWNER_TYPES = {
    "individual", "family", "consortium", "corporate", "fund", "state",
    "members' association", "listed company", "trust",
}


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def validate(rows, board_keys):
    """Pure validation. Returns a list of human-readable problems."""
    problems, seen = [], set()
    for i, r in enumerate(rows):
        where = f"row {i} ({r.get('team', '?')} / {r.get('league', '?')})"
        for f in REQUIRED:
            if not r.get(f):
                problems.append(f"{where}: missing required field '{f}'")
        if r.get("confidence") not in CONFIDENCE:
            problems.append(f"{where}: confidence '{r.get('confidence')}' not in {sorted(CONFIDENCE)}")
        if r.get("owner_type") not in OWNER_TYPES:
            problems.append(f"{where}: owner_type '{r.get('owner_type')}' not in the closed set")
        pct = r.get("stake_pct")
        if pct is not None and not (0 < float(pct) <= 100):
            problems.append(f"{where}: stake_pct {pct} outside (0, 100]")
        # A sourced row must actually carry a source; a cross-checked row may
        # point at the aggregator. A contested row must explain itself.
        if r.get("confidence") == "sourced" and not r.get("source_url"):
            problems.append(f"{where}: confidence 'sourced' but no source_url")
        if r.get("confidence") == "contested":
            if not r.get("note"):
                problems.append(f"{where}: confidence 'contested' but no note explaining what is unresolved")
            # The watchlist block on /sports/owners renders these directly, so a
            # contested row without them would show as a blank card.
            for f in ("pending_summary", "pending_when", "pending_kind"):
                if not r.get(f):
                    problems.append(f"{where}: confidence 'contested' but no '{f}' for the watchlist")
        key = (r.get("team"), r.get("league"))
        if key in seen:
            problems.append(f"{where}: duplicate (team, league)")
        seen.add(key)

    if board_keys is not None:
        for k in sorted(board_keys - seen):
            problems.append(f"on the valuations board but has no owner row: {k[0]} ({k[1]})")
        for k in sorted(seen - board_keys):
            problems.append(f"owner row does not join to the valuations board: {k[0]} ({k[1]})")
    return problems


def self_test():
    """Offline checks on the pure decision logic, with real messy cases."""
    ok = True

    def check(label, got, want):
        nonlocal ok
        if got != want:
            ok = False
            print(f"  FAIL {label}: got {got!r}, want {want!r}")
        else:
            print(f"  ok   {label}")

    base = dict(team="X", league="NFL", owner_display="Y", owner_key="y",
                owner_type="family", confidence="cross-checked")

    check("clean row passes", validate([base], None), [])

    # Dortmund: the e.V. holds only 5.45% of shares but controls the general
    # partner. A stake_pct well under 50 must NOT be treated as invalid.
    bvb = dict(base, team="Borussia Dortmund", league="Germany",
               owner_type="listed company", stake_pct=5.45)
    check("low stake_pct is legal (Dortmund 50+1)", validate([bvb], None), [])

    check("stake_pct 0 rejected", len(validate([dict(base, stake_pct=0)], None)), 1)
    check("stake_pct 101 rejected", len(validate([dict(base, stake_pct=101)], None)), 1)

    # Real Madrid: member-owned, no percentage at all. Must be legal.
    rm = dict(base, team="Real Madrid", league="Spain",
              owner_type="members' association", stake_pct=None)
    check("null stake_pct is legal (socios)", validate([rm], None), [])

    check("bad confidence rejected",
          len(validate([dict(base, confidence="probably")], None)), 1)
    check("bad owner_type rejected",
          len(validate([dict(base, owner_type="oligarch")], None)), 1)
    check("sourced without source_url rejected",
          len(validate([dict(base, confidence="sourced")], None)), 1)
    check("contested without note rejected",
          len(validate([dict(base, confidence="contested")], None)), 4)
    check("contested with a note but no watchlist fields rejected",
          len(validate([dict(base, confidence="contested", note="Sale pending.")], None)), 3)
    contested_ok = dict(base, confidence="contested", note="Sale pending.",
                        pending_summary="Buyer named", pending_when="Vote Aug 2026",
                        pending_kind="control sale")
    check("contested with note and watchlist fields passes",
          validate([contested_ok], None), [])
    check("duplicate (team, league) rejected",
          len(validate([base, base], None)), 1)

    # Same team name in two different leagues is legal, not a duplicate.
    check("same team name, different league is legal",
          validate([base, dict(base, league="NBA")], None), [])

    # Board reconciliation both ways.
    check("missing owner row reported",
          len(validate([base], {("X", "NFL"), ("Z", "NBA")})), 1)
    check("orphan owner row reported",
          len(validate([base], set())), 1)

    print("SELF-TEST:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def main():
    if "--self-test" in sys.argv:
        return self_test()

    seed = load(SEED)
    rows = seed["rows"]
    board = load(VALS)["rows"]
    board_keys = {(r["team"], r["league"]) for r in board}

    problems = validate(rows, board_keys)
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        return 1

    out = [{
        "team": r["team"],
        "league": r["league"],
        "ownerDisplay": r["owner_display"],
        "ownerKey": r["owner_key"],
        "ownerType": r["owner_type"],
        "stakeLabel": r.get("stake_label") or None,
        "stakePct": r.get("stake_pct"),
        "confidence": r["confidence"],
        "coControllers": r.get("co_controllers") or None,
        "minority": r.get("minority") or None,
        "note": r.get("note") or None,
        "pendingSummary": r.get("pending_summary") or None,
        "pendingWhen": r.get("pending_when") or None,
        "pendingKind": r.get("pending_kind") or None,
        "sourceUrl": r.get("source_url") or None,
        "sourceDate": r.get("source_date") or None,
    } for r in sorted(rows, key=lambda r: (r["league"], r["team"]))]

    keys = {}
    for r in out:
        keys.setdefault(r["ownerKey"], []).append(r["team"])
    multi = {k: v for k, v in keys.items() if len(v) > 1}
    by_conf = {}
    for r in out:
        by_conf[r["confidence"]] = by_conf.get(r["confidence"], 0) + 1

    print(f"{len(out)} franchises, {len(keys)} owner entities, {len(multi)} holding more than one")
    print("confidence:", ", ".join(f"{k} {v}" for k, v in sorted(by_conf.items())))

    if "--dry" in sys.argv:
        print("dry run, nothing written")
        return 0

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"generated": datetime.datetime.utcnow().isoformat(timespec="seconds"),
                   "rows": out}, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("wrote", os.path.relpath(OUT, ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
