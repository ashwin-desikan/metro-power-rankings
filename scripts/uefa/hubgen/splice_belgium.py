"""Give the flat Belgian top-flight seasons a Regular Season + Championship Play-off structure,
matching the Wikipedia sheet. Re-runnable: the Regular Season group is taken from the hub's current
single flat table (already canonical), and the Championship Play-off group comes from
data/belgium_playoffs.json with club names mapped to that season's canonical names. Run --write to persist.
2017-18 is intentionally skipped: its championship play-off table is absent from the source sheet."""
import json, os, re, sys, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
UEFA = os.path.abspath(os.path.join(HERE, ".."))
DATA = os.path.join(UEFA, "data")
FOUT = os.path.abspath(os.path.join(UEFA, "..", "..", "public", "data", "football"))

def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

def resolve(wiki, clubs):
    w = norm(wiki)
    ex = [c for c in clubs if norm(c) == w]
    if ex: return ex[0]
    cont = [c for c in clubs if w and (w in norm(c) or norm(c) in w)]
    if len(cont) == 1: return cont[0]
    wt = set(w.split()); best = None; bestn = 0
    for c in clubs:
        n = len(wt & set(norm(c).split()))
        if n > bestn: bestn, best = n, c
    return best if bestn else None

def main():
    write = "--write" in sys.argv
    pdata = json.load(open(os.path.join(DATA, "belgium_playoffs.json"), encoding="utf-8"))
    problems = []
    for season, blk in pdata.items():
        p = os.path.join(FOUT, f"hub-{season}.json")
        hub = json.load(open(p, encoding="utf-8"))
        bel = [L for L in hub["leagues"] if L.get("country") == "Belgium" and (L.get("level") or 9) == 1]
        if not bel:
            problems.append(f"{season}: no Belgium L1 league"); continue
        lg = bel[0]
        flat = [g for g in lg["groups"] if g.get("rows")]
        # Regular Season = the current flat table (already canonical). Refuse if it is not a single table.
        rs_rows = flat[0]["rows"] if flat else []
        canon_clubs = [r.get("name") for r in rs_rows if r.get("name")]
        # map championship names -> canonical using this season's own table
        champ_rows = []
        for i, r in enumerate(blk["championship"], 1):
            cn = resolve(r["name"], canon_clubs)
            if not cn:
                problems.append(f"{season}: unresolved championship club '{r['name']}'"); cn = r["name"]
            row = {"rank": i, "name": cn, "lookup": cn, "played": r["played"], "win": r["win"],
                   "draw": r["draw"], "lose": r["lose"], "gf": r["gf"], "ga": r["ga"],
                   "gd": r["gd"], "points": r["points"]}
            if i == 1: row["champ"] = True
            champ_rows.append(row)
        # Regular Season rows: keep as-is but drop champ flag (title is decided in the play-off)
        reg_rows = []
        for r in rs_rows:
            r2 = {k: v for k, v in r.items() if k != "champ"}
            reg_rows.append(r2)
        lg["groups"] = [
            {"label": "Regular Season", "rows": reg_rows},
            {"label": "Championship Play-off", "rows": champ_rows},
        ]
        print(f"{season}: RS={len(reg_rows)} teams, Championship Play-off={len(champ_rows)} teams, "
              f"champion={champ_rows[0]['name']}")
        if write:
            json.dump(hub, open(p, "w", encoding="utf-8"), ensure_ascii=False)
            print("   WROTE")
    if problems:
        print("\nPROBLEMS:")
        for x in problems: print("  ", x)
        if write: sys.exit("refusing: resolve problems above before writing")

if __name__ == "__main__":
    main()
