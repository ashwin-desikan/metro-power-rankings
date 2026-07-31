#!/usr/bin/env python3
"""build_de_cups.py — real DFB-Pokal per-match W/D/L for 1960-61..1991-92 (German cup, pre-1992-93).

Parses the user's dfbpokal6092.txt (human-readable results dump: "DFB-Pokal YYYY/YY" headers,
"Round: N" markers, "Home  -  Away  H:A [aet.|pen.|wo.]" match lines) into the SAME shape as
cupfix_2007_2023.json so gen_hub_early can feed real German cup results through its opponent-weighted
form engine and drop the imputed cup nudge for Germany pre-1992-93 (cupfix already covers 1992-93+).

Rules: each match -> two rows (home + away perspective). Equal-score lines are draws; a following
'pen.' line is the shootout of that draw and is skipped (the draw already counts, mirroring the
English replay handling). 'wo.' walkovers are administrative, not played, and are skipped.

Name resolution to canonical: umlaut fold (ue/oe/ae -> u/o/a) + eszett (ß->ss) then norm(), plus an
explicit alias map for structural mismatches (Bayern Muenchen->Bayern Munich, prefixes, numbers,
re-orderings). Unresolved names are emitted raw and float outside the top-flight universe (floored at
0.10 as opponents), exactly like cupfix.

Output: scripts/uefa/data/dfb_cups_pre93.json -> { "1990-91": [ {cur,opp,gf,ga,comp,wdl}, ... ], ... }
"""
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_hub_early as G

SRC = os.path.join(G.DATA, "dfbpokal6092.txt")
OUT = os.path.join(G.DATA, "dfb_cups_pre93.json")

# Structural aliases: DFB-file spelling -> canonical club (only ones the fold+eszett resolver misses).
ALIAS = {
    "Bayern Muenchen": "Bayern Munich",
    "1860 Muenchen": "TSV 1860 München", "TSV Muenchen 1860": "TSV 1860 München",
    "TSV 1860 Muenchen": "TSV 1860 München",
    "Alemannia Aachen": "TSV Alemannia Aachen",
    "Bayer Uerdingen": "KFC Uerdingen", "Bayer 05 Uerdingen": "KFC Uerdingen",
    "SV Darmstadt 98": "SV Darmstadt",
    "1. FC Saarbruecken": "FC Saarbrücken",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "Arminia Bielefeld": "DSC Arminia Bielefeld",
    "Preussen Muenster": "SC Preussen Munster", "SC Preussen Muenster": "SC Preussen Munster",
    "SG Wattenscheid 09": "SG Wattenscheid", "Wattenscheid 09": "SG Wattenscheid",
    "SpVgg Fuerth": "SpVgg Greuther Fürth",
    "FSV Mainz 05": "Mainz 05",
    "SSV Ulm 1846": "SSV Ulm",
    "SC Rot-Weiss Essen": "Rot-Weiß Essen",
}

def fold(s):
    for a, b in (("ue", "u"), ("oe", "o"), ("ae", "a"), ("Ue", "U"), ("Oe", "O"), ("Ae", "A")):
        s = s.replace(a, b)
    return s.replace("ß", "ss").replace("ẞ", "SS")

def main():
    core = G.load_core()
    canon = set()
    for r in core["cl"]:
        if r.get("cur_name"): canon.add(r["cur_name"])
    for r in core["ft"]:
        if r.get("canonical_name"): canon.add(r["canonical_name"])
    canon_g = {G.norm(fold(c)): c for c in canon}

    def resolve(nm):
        if nm in ALIAS: return ALIAS[nm]
        return canon_g.get(G.norm(fold(nm))) or nm   # raw -> floored downstream

    line_re = re.compile(r"^\s+(.+?)\s+-\s+(.+?)\s{2,}(\d+):(\d+)(.*)$")
    sea_re = re.compile(r"DFB-Pokal\s+(\d{4})/(\d{2})")
    out = {}
    season = None
    kept = matches = skipped_wo = skipped_pen = 0
    resolved_hits = 0
    with open(SRC, encoding="utf-8", errors="replace") as f:
        for ln in f:
            s = ln.strip()
            if not s: continue
            ms = sea_re.search(s)
            if ms:
                season = f"{ms.group(1)}-{ms.group(2)}"
                out.setdefault(season, [])
                continue
            if s.startswith("Round:") or season is None:
                continue
            m = line_re.match(ln.rstrip("\n"))
            if not m: continue
            suffix = (m.group(5) or "").lower()
            if "wo" in suffix: skipped_wo += 1; continue
            if "pen" in suffix: skipped_pen += 1; continue
            home, away = m.group(1).strip(), m.group(2).strip()
            gf, ga = int(m.group(3)), int(m.group(4))
            hc, ac = resolve(home), resolve(away)
            if hc in canon: resolved_hits += 1
            if ac in canon: resolved_hits += 1
            wdl_h = "W" if gf > ga else "L" if gf < ga else "D"
            wdl_a = "W" if ga > gf else "L" if ga < gf else "D"
            out[season].append({"cur": hc, "opp": ac, "gf": gf, "ga": ga, "comp": "DFB-Pokal", "wdl": wdl_h})
            out[season].append({"cur": ac, "opp": hc, "gf": ga, "ga": gf, "comp": "DFB-Pokal", "wdl": wdl_a})
            matches += 1; kept += 2
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    seasons = sorted(out)
    print(f"wrote {OUT}")
    print(f"  {matches} matches -> {kept} club-rows across {len(seasons)} seasons ({seasons[0]}..{seasons[-1]})")
    print(f"  skipped: walkovers {skipped_wo}, penalty-shootout lines {skipped_pen}")
    print(f"  canonical-resolved club endpoints: {resolved_hits} / {kept}")
    # sanity: Bayern & Köln cup runs in a couple of seasons
    for s in ("1970-71", "1985-86"):
        rows = out.get(s, [])
        for club in ("Bayern Munich", "1. FC Köln"):
            cm = [r for r in rows if r["cur"] == club]
            if cm:
                w = "".join(sorted(r["wdl"] for r in cm))
                print(f"  {s}: {club} {len(cm)} cup matches ({w})")

if __name__ == "__main__":
    main()
