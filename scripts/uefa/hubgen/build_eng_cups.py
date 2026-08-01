#!/usr/bin/env python3
"""build_eng_cups.py — real English FA Cup / League Cup per-match W/D/L for the pre-1992-93 seasons.

gen_hub_early imputes a light notional cup-form nudge for the top-8 leagues before 1992-93 (there is
no per-match cupfix that far back). This parses the user's fa_league_cups.txt (every FA Cup and
League Cup match 1871-2023, one row per team) into the SAME shape as cupfix_2007_2023.json so the
early generator can feed REAL English cup results through its opponent-weighted form engine and drop
the imputation for England. Scope: seasons 1959-60 .. 1991-92 only (1992-93+ already has real cupfix,
so extending further would double-count). FA/League Cup only; the Charity/Community Shield is a super
cup handled elsewhere. Ties are recorded as 'T' in the source and mapped to 'D'.

Output: scripts/uefa/data/eng_cups_pre93.json  ->  { "1989-90": [ {cur,opp,gf,ga,comp,wdl}, ... ], ... }
"""
import os, json
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
SRC = os.path.join(DATA, "fa_league_cups.txt")
OUT = os.path.join(DATA, "eng_cups_pre93.json")

KEEP_COMPS = {"FA Cup", "League Cup"}          # exclude FA Charity/Community Shield (super cup)
WDL_MAP = {"W": "W", "L": "L", "T": "D", "D": "D"}
START_MIN, START_MAX = 1959, 1991               # season start-years 1959-60 .. 1991-92

def _int(v):
    v = (v or "").strip()
    try: return int(v)
    except: return None

def main():
    with open(SRC, encoding="utf-8", errors="replace") as f:
        hdr = f.readline().rstrip("\n").split("\t")
        ix = {h.strip(): i for i, h in enumerate(hdr)}
        need = ["Season", "Leag/Comp.", "W/D/L", "For", "Ag", "Cur. Name", "Opp. Name", "Cur. Country"]
        for c in need:
            if c not in ix: raise SystemExit(f"missing column: {c!r}")
        mx = max(ix[c] for c in need)
        out = {}
        kept = skipped_season = skipped_comp = skipped_ctry = 0
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) <= mx: continue
            season = p[ix["Season"]].strip()
            if len(season) < 7 or not season[:4].isdigit():
                continue
            start = int(season[:4])
            if not (START_MIN <= start <= START_MAX):
                skipped_season += 1; continue
            comp = p[ix["Leag/Comp."]].strip()
            if comp not in KEEP_COMPS:
                skipped_comp += 1; continue
            if p[ix["Cur. Country"]].strip() != "England":
                skipped_ctry += 1; continue
            cur = p[ix["Cur. Name"]].strip()
            opp = p[ix["Opp. Name"]].strip()
            if not cur: continue
            wdl = WDL_MAP.get(p[ix["W/D/L"]].strip())
            out.setdefault(season, []).append({
                "cur": cur, "opp": opp, "gf": _int(p[ix["For"]]), "ga": _int(p[ix["Ag"]]),
                "comp": comp, "wdl": wdl})
            kept += 1
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    seasons = sorted(out)
    print(f"wrote {OUT}")
    print(f"  kept {kept} club-match rows across {len(seasons)} seasons "
          f"({seasons[0]}..{seasons[-1]})")
    print(f"  skipped: out-of-range-season {skipped_season}, non-FA/League-cup {skipped_comp}, non-England {skipped_ctry}")
    # sanity: a couple of well-known runs
    for s in ("1987-88", "1989-90"):
        rows = out.get(s, [])
        libs = [r for r in rows if r["cur"] == "Liverpool"]
        wdl = "".join(sorted(r["wdl"] or "?" for r in libs))
        print(f"  {s}: {len(rows)} Eng rows | Liverpool {len(libs)} cup matches ({wdl})")

if __name__ == "__main__":
    main()
