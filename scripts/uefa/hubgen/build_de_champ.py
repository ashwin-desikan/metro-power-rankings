#!/usr/bin/env python3
"""build_de_champ.py — pre-Bundesliga German Championship qualifiers 1959-60..1962-63.

Before the 1963-64 Bundesliga, West Germany had five regional Oberligen feeding a national
championship playoff. The pipeline has ZERO German clubs for these four seasons. Per the user's
spec we add ONLY the ~9 German Championship qualifiers per season (not all ~80 Oberliga clubs),
matched to canonical names, carrying their FULL regional Oberliga league record as domestic form
plus their championship-group record, so gen_hub_early can rank them alongside the rest of Europe
(European form + DFB-Pokal + pedigree flow automatically once they're in the universe).

Parses germanoberliga6063.txt (Wikipedia dump). Per season: the champion (infobox), the qualifiers
(regional standings rows whose Qualification column mentions "German championship", Pld ~ 27-34) with
their Oberliga W/D/L, and the championship-group standings (Pld = 6) for the group W/D/L. Same
umlaut+eszett+alias resolver as build_de_cups.py.

Output: scripts/uefa/data/de_champ_5963.json ->
  { "1962-63": {"champion": "<canonical>", "qualifiers": [{cur, ow, od, ol, cw, cd, cl}, ...]}, ... }
"""
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_hub_early as G
from build_de_cups import fold, ALIAS as CUP_ALIAS

SRC = os.path.join(G.DATA, "germanoberliga6063.txt")
OUT = os.path.join(G.DATA, "de_champ_5963.json")

# Extra aliases for pre-Bundesliga qualifiers not covered by the cup alias map. The Oberliga dump uses
# real umlauts (ü/ö), so the ß/fold resolver handles most; these are the structural mismatches.
ALIAS = dict(CUP_ALIAS)
ALIAS.update({
    "1. FC Saarbrücken": "FC Saarbrücken",
    "Meidericher SV": "MSV Duisburg",          # Meidericher SV renamed MSV Duisburg in 1967
    "FC Bayern Munich": "Bayern Munich", "FC Bayern München": "Bayern Munich",
})

PAREN = re.compile(r"\s*\([A-Z]{1,2}\)\s*$")   # strip (C)/(Q)/(R)/(N) standings markers
SEASON = re.compile(r"^(\d{4})[–-](\d{2})\s+Oberliga\s*$")
CHAMP = re.compile(r"^German champions\t(.+?)\s*$")

def main():
    core = G.load_core()
    canon = set()
    for r in core["cl"]:
        if r.get("cur_name"): canon.add(r["cur_name"])
    for r in core["ft"]:
        if r.get("canonical_name"): canon.add(r["canonical_name"])
    canon_g = {G.norm(fold(c)): c for c in canon}

    prefix_re = re.compile(r"^(SV|SC|FC|VfB|VfL|TSV|TSG|SpVgg|BSC|FSV|KFC|MSV|SSV|DSC)\s+", re.I)

    def resolve(nm):
        nm = PAREN.sub("", nm).strip()
        if nm in ALIAS: return ALIAS[nm]
        r = canon_g.get(G.norm(fold(nm)))
        if r: return r
        stripped = prefix_re.sub("", nm)                 # "SV Werder Bremen" -> "Werder Bremen"
        if stripped != nm:
            r = canon_g.get(G.norm(fold(stripped)))
            if r: return r
        return nm

    out = {}
    season = None
    regional = {}   # cur -> (w,d,l): ALL regional Oberliga rows this season
    marked = set()  # cur: regional rows whose Qualification column names the German championship
    champ = {}      # cur -> (w,d,l): championship-group record (Pld=6)
    champion = None
    unresolved = set()

    def flush():
        if season is None: return
        # True qualifier set = the championship-group participants UNION any regional row explicitly
        # marked for the championship (Wikipedia leaves some runner-up rows' Qual column blank, so
        # neither source alone is complete). Oberliga W/D/L looked up from the full regional tables.
        quals = []
        for cur in sorted(set(champ) | marked):
            ow, od, ol = regional.get(cur, (0, 0, 0))
            cw, cd, cl = champ.get(cur, (0, 0, 0))
            quals.append({"cur": cur, "ow": ow, "od": od, "ol": ol, "cw": cw, "cd": cd, "cl": cl})
        # Also carry every canonical German club's regional Oberliga record, so gen_hub_early can
        # surface the season's European entrant (the reigning champion, not always a current qualifier
        # e.g. Eintracht Frankfurt in 1959-60) with its real league record rather than European-only.
        reg = {cur: [w, d, l] for cur, (w, d, l) in regional.items() if cur in canon}
        out[season] = {"champion": champion, "qualifiers": quals, "regional": reg}

    lines = open(SRC, encoding="utf-8", errors="replace").read().split("\n")
    for ln in lines:
        ms = SEASON.match(ln)
        if ms:
            flush()
            season = f"{ms.group(1)}-{ms.group(2)}"
            regional, marked, champ, champion = {}, set(), {}, None
            continue
        if season is None:
            continue
        mc = CHAMP.match(ln)
        if mc:
            champion = resolve(mc.group(1))
            continue
        p = ln.split("\t")
        if len(p) >= 10 and p[0].strip().isdigit() and all(p[i].strip().isdigit() for i in (2, 3, 4, 5)):
            team = resolve(p[1].strip())
            pld, w, d, l = int(p[2]), int(p[3]), int(p[4]), int(p[5])
            qual = (p[10].strip().lower() if len(p) > 10 else "")   # qualification column is optional
            if team not in canon and PAREN.sub("", p[1].strip()).strip() not in ALIAS:
                unresolved.add(p[1].strip())
            if pld >= 20:                         # regional Oberliga table
                regional[team] = (w, d, l)
                if "german championship" in qual:
                    marked.add(team)
            elif pld <= 12:                        # championship group table
                champ[team] = (w, d, l)
            continue
        # Championship score line: "TeamA<TAB>H–A[ aet]<TAB>TeamB" (qualifying play-in + final). Both
        # sides are qualifiers; add them so the play-in loser (not in any group) is still captured.
        if len(p) == 3 and re.match(r"^\d+\s*[–-]\s*\d+(\s*aet)?\s*$", p[1].strip()):
            marked.add(resolve(p[0].strip())); marked.add(resolve(p[2].strip()))
    flush()

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"wrote {OUT}")
    for s in sorted(out):
        q = out[s]["qualifiers"]
        res = sum(1 for x in q if x["cur"] in canon)
        print(f"  {s}: champion={out[s]['champion']!r} | {len(q)} qualifiers ({res} canonical-matched)")
        for x in q:
            tag = "" if x["cur"] in canon else "  <UNMATCHED>"
            print(f"       {x['cur']:26} Oberliga {x['ow']}-{x['od']}-{x['ol']}  champ {x['cw']}-{x['cd']}-{x['cl']}{tag}")
    if unresolved:
        print("\n  unresolved standings names seen (any table):", sorted(unresolved)[:30])

if __name__ == "__main__":
    main()
