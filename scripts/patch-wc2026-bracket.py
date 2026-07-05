#!/usr/bin/env python3
"""
Patch wc2026.json knockout slots with real teams once group stage is complete,
and record actual scores for completed knockout matches.

Run after parse-espn-wc2026.py and build-wc2026-simulation.py in the daily Action.

What it does:
  1. Reads group results from wc2026-results.json and ranks each group to find
     the actual W/R/3rd-place finishers (using FIFA 2026 head-to-head tiebreak).
  2. Selects the best 8 third-placed teams via pts/GD/GF and slots them into the
     official bracket positions (THIRD_SLOTS bipartite matching).
  3. Writes team_slug / team_cur_name / opp_slug / opp_cur_name into each Round
     of 32 slot, then propagates winners through R16/QF/SF/Final.
  4. Records actual scores + played=True for completed knockout matches.
  5. Writes the patched wc2026.json in-place (idempotent - no spurious diffs).

Safe to run before group stage is complete - it just skips slot resolution if
fewer than 48 group matches are confirmed, and only patches slots where both
teams are known from completed matches.
"""

import json, os, unicodedata, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTL = os.path.join(ROOT, "public", "data", "international")
WC_JSON  = os.path.join(INTL, "wc2026.json")
RES_JSON = os.path.join(INTL, "wc2026-results.json")

GROUPS = list("ABCDEFGHIJKL")

# Official bracket: match_id -> (side_A_spec, side_B_spec)
# spec = ("W"/"R", group) for winner/runner-up, ("3", slot_id) for best-third
R32 = {
    73: (("R", "A"), ("R", "B")),
    74: (("W", "F"), ("R", "C")),
    75: (("W", "E"), ("3", 75)),
    76: (("W", "C"), ("R", "F")),
    77: (("R", "E"), ("R", "I")),
    78: (("W", "A"), ("3", 78)),
    79: (("W", "I"), ("3", 79)),
    80: (("W", "D"), ("3", 80)),
    81: (("W", "G"), ("3", 81)),
    82: (("W", "L"), ("3", 82)),
    83: (("W", "B"), ("3", 83)),
    84: (("R", "K"), ("R", "L")),
    85: (("W", "H"), ("R", "J")),
    86: (("W", "K"), ("3", 86)),
    87: (("R", "D"), ("R", "G")),
    88: (("W", "J"), ("R", "H")),
}
# Candidate groups for each third-place slot
THIRD_SLOTS = {
    75: set("ABCDF"), 78: set("CEFHI"), 79: set("CDFGH"), 80: set("BEFIJ"),
    81: set("AEHIJ"), 82: set("EHIJK"), 83: set("EFGIJ"), 86: set("DEIJL"),
}
# Official FIFA-confirmed Round of 32 fixtures, keyed by (date, host metro). Once
# the bracket is officially set, these pinned pairings are the source of truth
# and override the third-place slotting above (which can mis-assign teams).
R32_OFFICIAL = {
    ("2026-06-28", "Los Angeles"): ("Canada", "South Africa"),
    ("2026-06-29", "Monterrey"): ("Netherlands", "Morocco"),
    ("2026-06-29", "Boston"): ("Germany", "Paraguay"),
    ("2026-06-29", "Houston"): ("Brazil", "Japan"),
    ("2026-06-30", "Arlington"): ("Côte d'Ivoire", "Norway"),
    ("2026-06-30", "Mexico City"): ("Mexico", "Ecuador"),
    ("2026-06-30", "New York"): ("France", "Sweden"),
    ("2026-07-01", "San Francisco-San Jose"): ("United States", "Bosnia-Herzegovina"),
    ("2026-07-01", "Seattle"): ("Belgium", "Senegal"),
    ("2026-07-01", "Atlanta"): ("England", "Congo DR"),
    ("2026-07-02", "Vancouver"): ("Switzerland", "Algeria"),
    ("2026-07-02", "Toronto"): ("Portugal", "Croatia"),
    ("2026-07-02", "Los Angeles"): ("Spain", "Austria"),
    ("2026-07-03", "Kansas City"): ("Colombia", "Ghana"),
    ("2026-07-03", "Dallas"): ("Egypt", "Australia"),
    ("2026-07-03", "Miami"): ("Argentina", "Cape Verde"),
}
# Knockout progression: match_id -> (winner_of_match_A, winner_of_match_B)
WIN = {
    89: (74, 77), 90: (73, 75), 91: (79, 80), 92: (76, 78),
    93: (83, 84), 94: (81, 82), 95: (85, 87), 96: (86, 88),
    97: (89, 90), 98: (93, 94), 99: (95, 96), 100: (91, 92),
    101: (97, 98), 102: (99, 100), 104: (101, 102),
}
# Match number -> round name (for wc2026.json knockout keys)
def round_of(m):
    if 73 <= m <= 88: return "Round of 32"
    if 89 <= m <= 96: return "Round of 16"
    if 97 <= m <= 100: return "Quarterfinals"
    if m in (101, 102): return "Semifinals"
    if m == 103: return "Third Place Game"
    if m == 104: return "Final"
    return None


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def bipartite_match(slots, qualified_groups):
    match = {}
    def try_assign(slot, seen):
        for g in sorted(THIRD_SLOTS[slot]):
            if g in qualified_groups and g not in seen:
                seen.add(g)
                if g not in match or try_assign(match[g], seen):
                    match[g] = slot
                    return True
        return False
    for s in slots:
        try_assign(s, set())
    return {slot: g for g, slot in match.items()}


def rank_group(group_letter, teams, events):
    """
    Return [slug, ...] sorted 1st→4th using FIFA 2026 rules:
    pts → H2H pts → H2H GD → H2H GF → overall GD → overall GF → lot
    """
    pts = {t: 0 for t in teams}
    gd  = {t: 0 for t in teams}
    gf  = {t: 0 for t in teams}
    results = {}  # frozenset(a,b) -> (ga, gb)

    for e in events:
        a, b = e["a_slug"], e["b_slug"]
        if a not in pts or b not in pts:
            continue
        ga, gb = e["a_score"], e["b_score"]
        results[frozenset((a, b))] = {a: ga, b: gb}
        if ga > gb:   pts[a] += 3
        elif gb > ga: pts[b] += 3
        else:         pts[a] += 1; pts[b] += 1
        gd[a] += ga - gb; gd[b] += gb - ga
        gf[a] += ga;      gf[b] += gb

    def h2h_stats(subset):
        mp = {t: 0 for t in subset}
        mgd = {t: 0 for t in subset}
        mgf = {t: 0 for t in subset}
        for i, a in enumerate(subset):
            for b in subset[i+1:]:
                r = results.get(frozenset((a, b)))
                if not r: continue
                ga_, gb_ = r[a], r[b]
                if ga_ > gb_:   mp[a] += 3
                elif gb_ > ga_: mp[b] += 3
                else:           mp[a] += 1; mp[b] += 1
                mgd[a] += ga_ - gb_; mgd[b] += gb_ - ga_
                mgf[a] += ga_;       mgf[b] += gb_
        return mp, mgd, mgf

    def sort_key(t):
        return (-pts[t], -gd[t], -gf[t])

    ordered = sorted(teams, key=sort_key)
    # Break ties within same-points groups using H2H
    final = []
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and pts[ordered[j]] == pts[ordered[i]]:
            j += 1
        group = ordered[i:j]
        if len(group) > 1:
            mp, mgd, mgf = h2h_stats(group)
            group.sort(key=lambda t: (-mp[t], -mgd[t], -mgf[t], -gd[t], -gf[t]))
        final.extend(group)
        i = j
    return final, pts, gd, gf


def main():
    wc  = json.load(open(WC_JSON))
    res = json.load(open(RES_JSON)) if os.path.exists(RES_JSON) else {"events": {}}
    events = list(res.get("events", {}).values())

    group_events = [e for e in events if e.get("round") == "Group" and e.get("completed")]
    ko_events    = [e for e in events if e.get("round") != "Group" and e.get("completed")]

    gs = wc["group_stage"]
    name_of = {t["slug"]: t["cur_name"] for g in GROUPS for t in gs[g]}

    # --- Recompute group standings from actual match results ---------------
    # The workbook's W/D/L columns proved unreliable (cumulative values that
    # double-count), so the displayed Group Stage tables are derived here from
    # wc2026-results.json -- the same authoritative feed used for the bracket --
    # and the rows are reordered by the FIFA 2026 ranking.
    for g in GROUPS:
        slugs = [t["slug"] for t in gs[g]]
        st = {s: {"w": 0, "d": 0, "l": 0, "gs": 0, "ga": 0, "pts": 0, "matches": 0} for s in slugs}
        for e in group_events:
            a, b = e["a_slug"], e["b_slug"]
            if a not in st or b not in st:
                continue
            sa, sb = e["a_score"], e["b_score"]
            if sa is None or sb is None:
                continue
            st[a]["gs"] += sa; st[a]["ga"] += sb; st[a]["matches"] += 1
            st[b]["gs"] += sb; st[b]["ga"] += sa; st[b]["matches"] += 1
            if sa > sb:
                st[a]["w"] += 1; st[a]["pts"] += 3; st[b]["l"] += 1
            elif sb > sa:
                st[b]["w"] += 1; st[b]["pts"] += 3; st[a]["l"] += 1
            else:
                st[a]["d"] += 1; st[b]["d"] += 1
                st[a]["pts"] += 1; st[b]["pts"] += 1
        if any(v["matches"] for v in st.values()):
            ranked, _p, _g, _f = rank_group(g, slugs, group_events)
            by_slug = {t["slug"]: t for t in gs[g]}
            new_rows = []
            for sl in ranked:
                row = by_slug[sl]
                row["w"] = st[sl]["w"]; row["d"] = st[sl]["d"]; row["l"] = st[sl]["l"]
                row["gs"] = st[sl]["gs"]; row["ga"] = st[sl]["ga"]
                row["gd"] = st[sl]["gs"] - st[sl]["ga"]
                row["pts"] = st[sl]["pts"]; row["matches"] = st[sl]["matches"]
                new_rows.append(row)
            gs[g] = new_rows

    # --- Step 1: resolve group standings if all 48 group matches are in ---
    groups_complete = len(group_events) >= 48
    winner = {}; runner = {}; thirds = []  # (pts, gd, gf, slug, group)

    if groups_complete:
        for g in GROUPS:
            slugs = [t["slug"] for t in gs[g]]
            ranked, pts, gd, gf = rank_group(g, slugs, group_events)
            winner[g] = ranked[0]
            runner[g] = ranked[1]
            thirds.append((pts[ranked[2]], gd[ranked[2]], gf[ranked[2]], ranked[2], g))

        # Best 8 thirds by pts → GD → GF
        thirds.sort(key=lambda x: (-x[0], -x[1], -x[2]))
        top8_thirds = thirds[:8]
        qualified_groups = {x[4] for x in top8_thirds}
        third_of = {x[4]: x[3] for x in thirds}  # group -> slug
        slot_order = [75, 78, 79, 80, 81, 82, 83, 86]
        slotmap = bipartite_match(slot_order, qualified_groups)  # slot_id -> group

        def side_slug(spec):
            kind, ref = spec
            if kind == "W": return winner.get(ref)
            if kind == "R": return runner.get(ref)
            return third_of.get(slotmap.get(ref))

        # Resolve R32 team assignments
        r32_teams = {}  # match_id -> (team_slug, opp_slug)
        for mid, (sa, sb) in R32.items():
            a = side_slug(sa); b = side_slug(sb)
            if a and b:
                r32_teams[mid] = (a, b)

    # --- Step 2: build a map of confirmed knockout winners from results ---
    ko_winner = {}  # frozenset(slug_a, slug_b) -> winner_slug
    ko_scores = {}  # frozenset(slug_a, slug_b) -> {slug: score}
    for e in ko_events:
        key = frozenset((e["a_slug"], e["b_slug"]))
        ko_winner[key] = e.get("winner_slug")
        ko_scores[key] = {e["a_slug"]: e["a_score"], e["b_slug"]: e["b_score"]}

    # Curated shootout-winner corrections: a drawn knockout the feed left with no
    # published winner flag (so winner_slug came through null). Keyed by the
    # unordered slug pair. Egypt beat Australia on penalties, R32, 2026-07-03 Dallas.
    for _pair, _w in {frozenset(("egypt", "australia")): "egypt"}.items():
        ko_winner[_pair] = _w

    # Propagate: what slug came out of each match slot
    resolved = {}  # match_id -> winning_slug
    if groups_complete:
        for mid, (a_slug, b_slug) in r32_teams.items():
            key = frozenset((a_slug, b_slug))
            if key in ko_winner:
                resolved[mid] = ko_winner[key]
        for mid, (src_a, src_b) in WIN.items():
            a_slug = resolved.get(src_a)
            b_slug = resolved.get(src_b)
            if a_slug and b_slug:
                key = frozenset((a_slug, b_slug))
                if key in ko_winner:
                    resolved[mid] = ko_winner[key]

    # --- Step 3: patch wc2026.json knockout entries ---
    ko = wc["knockout"]

    # Build a lookup: (date, stadium) -> match_id for R32
    # We'll match by iterating the knockout schedule order against our mid list
    # The wc2026.json Round of 32 entries are in date order matching FIFA match 73-88
    r32_mids = sorted(R32.keys())  # 73..88

    for rnd_name in ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Third Place Game", "Final"]:
        slots = ko.get(rnd_name, [])
        if rnd_name == "Round of 32" and groups_complete:
            slug_of = {t["cur_name"]: t["slug"] for g in GROUPS for t in gs[g]}
            nslug = {norm(t["cur_name"]): t["slug"] for g in GROUPS for t in gs[g]}
            def _resolve(nm):
                return slug_of.get(nm) or nslug.get(norm(nm))
            for i, slot in enumerate(slots):
                official = R32_OFFICIAL.get((slot.get("date"), slot.get("stad_metro")))
                if official:
                    a_slug, b_slug = _resolve(official[0]), _resolve(official[1])
                else:
                    mid = r32_mids[i] if i < len(r32_mids) else None
                    if not (mid and mid in r32_teams):
                        continue
                    a_slug, b_slug = r32_teams[mid]
                if not (a_slug and b_slug):
                    continue
                slot["team_slug"] = a_slug
                slot["team_cur_name"] = name_of.get(a_slug, a_slug)
                slot["opp_slug"] = b_slug
                slot["opp_cur_name"] = name_of.get(b_slug, b_slug)
                key = frozenset((a_slug, b_slug))
                if key in ko_scores:
                    scores = ko_scores[key]
                    slot["team_score"] = scores.get(a_slug)
                    slot["opp_score"]  = scores.get(b_slug)
                    slot["played"] = True
                    slot["result"] = "W" if scores.get(a_slug, 0) > scores.get(b_slug, 0) else "L"
        elif rnd_name in ("Round of 16", "Quarterfinals", "Semifinals", "Final"):
            # Match by finding pairs of resolved match winners
            rnd_mids = {mid for mid, _ in WIN.items() if round_of(mid) == rnd_name}
            for slot in slots:
                # Try to find a completed match from ko_events whose teams match this slot
                t = slot.get("team_slug"); o = slot.get("opp_slug")
                if not t or not o:
                    continue
                key = frozenset((t, o))
                if key in ko_scores:
                    scores = ko_scores[key]
                    slot["team_score"] = scores.get(t)
                    slot["opp_score"]  = scores.get(o)
                    slot["played"] = True
                    slot["result"] = "W" if scores.get(t, 0) > scores.get(o, 0) else "L"

    # Write back
    import tempfile
    tmp = WC_JSON + ".tmp"
    with open(tmp, "w") as f:
        json.dump(wc, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, WC_JSON)

    played_ko = len(ko_events)
    print(f"patch-wc2026-bracket: group_matches={len(group_events)}/48 "
          f"groups_complete={groups_complete} ko_played={played_ko}")
    if groups_complete:
        print(f"  R32 slots resolved: {len(r32_teams)}/16")
        for g in GROUPS:
            print(f"  Group {g}: 1st={winner.get(g)} 2nd={runner.get(g)}")


if __name__ == "__main__":
    main()
