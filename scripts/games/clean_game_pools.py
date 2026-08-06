#!/usr/bin/env python3
"""
clean_game_pools.py — Keep the kids games to TEAMS ONLY.

Root cause of pollution: the metro Team List includes non-team rows —
annual events (col O flag -> `annual:true`: F1 Grands Prix, NASCAR/IndyCar
races, Grand Slams, Diamond League meets, PGA/ATP events, etc.) and venues
(league category in {Notable/Historic/Major Venues}). The game pools were
authored from metro rows without excluding those, so races/tournaments/venues
leaked in as "teams".

This filter reads the SOURCE OF TRUTH (public/data/details/*.json), derives
the set of names that are exclusively events/venues (never a real team
anywhere), and removes any game item that references one — whether as the
subject (`place`), an answer option (`opts[].t`), or inside the question text.
Idempotent: safe to re-run after any pool edit or regeneration.
"""
import json, glob, os, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DETAILS = os.path.join(ROOT, "public/data/details")
POOLS = os.path.join(ROOT, "public/play/games/pools")
VENUE = {"Notable Venues", "Historic Venues", "Major Venues"}
# league-tables is NFL-only (clean by construction); mini rules-lab games have no teams;
# higher-or-lower is a ROUNDS-based binary-search game (window.HLGAME, no team names)
SKIP = {"league-tables.js", "ball-or-strike.js", "catch-or-no-catch.js",
        "hows-that.js", "offside-or-onside.js", "higher-or-lower.js",
        "champions-duel-data.js"}  # finals data (window.DUEL), not an MCQ pool

def non_team_names():
    non, team = set(), set()
    for p in glob.glob(os.path.join(DETAILS, "*.json")):
        try: d = json.load(open(p, encoding="utf-8"))
        except Exception: continue
        for t in (d.get("teams") or []):
            nm = (t.get("team") or "").strip()
            if not nm: continue
            if t.get("annual") or str(t.get("league") or "") in VENUE:
                non.add(nm)
            else:
                team.add(nm)
    # only names that are NEVER a real team -> safe to drop
    return set(n for n in non if n not in team)

def slice_pool(s):
    # Two authored formats: `const POOL=[...]` (older hand-built pools) and
    # `window.GAME={..., "POOL": [...]}` (JSON pools from scripts/games builders).
    i = s.find("const POOL=")
    if i < 0:
        i = s.find('"POOL":')
    if i < 0:
        i = s.find("POOL:")
    if i < 0:
        raise RuntimeError("no POOL array")
    j = s.find("[", i); d = 0
    for k in range(j, len(s)):
        if s[k] == "[": d += 1
        elif s[k] == "]":
            d -= 1
            if d == 0: return j, k
    raise RuntimeError("no POOL array")

def is_polluted(item, pure):
    if item.get("place") in pure: return True
    for o in item.get("opts", []):
        if o.get("t") in pure: return True
    q = item.get("q", "")
    for n in pure:
        if len(n) > 6 and n in q: return True
    return False

def main():
    pure = non_team_names()
    print(f"event/venue names (drop set): {len(pure)}")
    total = 0
    for f in sorted(glob.glob(os.path.join(POOLS, "*.js"))):
        b = os.path.basename(f)
        if b in SKIP: continue
        s = open(f, encoding="utf-8").read()
        a, e = slice_pool(s)
        pool = json.loads(s[a:e+1])
        kept = [x for x in pool if not is_polluted(x, pure)]
        dropped = len(pool) - len(kept)
        total += dropped
        if dropped:
            new = s[:a] + json.dumps(kept, ensure_ascii=False) + s[e+1:]
            out = os.path.join("/tmp/gclean", b)
            open(out, "w", encoding="utf-8").write(new)
        print(f"  {b:26s} {len(pool):4d} -> {len(kept):4d}  (dropped {dropped})")
    print(f"total dropped: {total}")

if __name__ == "__main__":
    main()
