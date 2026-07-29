"""Backfill/rebuild the top-8 domestic cups (major + league + super) for the shipped hubs from the
'Cup History' workbook, so every hub carries the full set with canonical winner names ('Cur. Name').
Non-top-8 cups already present (api extras) are preserved. Run with --write to persist.
Genuinely cancelled competitions simply have no workbook winner and are omitted (e.g. 2019-20 KNVB Beker)."""
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_hub_early as g
FOUT = g.OUTDIR

def load_all_cup_rows():
    import openpyxl
    wb = openpyxl.load_workbook(g.CUP_WB, read_only=True, data_only=True)
    ws = wb["Cup History"]; it = ws.iter_rows(values_only=True)
    hdr = [str(h).strip() if h is not None else "" for h in next(it)]
    ix = {h: i for i, h in enumerate(hdr)}
    out = []
    for r in it:
        s = r[ix["Season"]] if ix.get("Season") is not None else None
        if not s: continue
        out.append({"season": str(s).strip(), "league": r[ix["League"]], "club": r[ix["Cur. Name"]],
            "maj": r[ix["Cup (Major Domestic)"]], "majf": r[ix["Cup Final (Major Domestic)"]],
            "min": r[ix["Cup (Minor Domestic)"]], "minf": r[ix["Cup Final (Minor Domestic)"]],
            "sup": r[ix["Super Cup"]], "supf": r[ix["Super Cup Final"]]})
    wb.close(); return out

def main():
    write = "--write" in sys.argv
    cup_rows = load_all_cup_rows()
    TOP8 = set(g.CUP_NAMES.keys())
    seasons = [f"{y}-{str(y+1)[2:]}" for y in range(2013, 2026)]  # 2013-14 .. 2025-26 (shipped era)
    for key in seasons:
        p = os.path.join(FOUT, f"hub-{key}.json")
        if not os.path.exists(p): continue
        hub = json.load(open(p, encoding="utf-8"))
        wb_cups = g.build_cups(key, cup_rows)          # canonical top-8 major/league/super
        keep = [c for c in hub.get("cups", []) if c.get("country") not in TOP8]
        merged = wb_cups + keep
        merged.sort(key=lambda c: ({"Domestic cup": 0, "Super cup": 1}.get(c.get("type"), 2), c.get("country") or ""))
        maj = sum(1 for c in wb_cups if c["type"] == "Domestic cup")
        sup = sum(1 for c in wb_cups if c["type"] == "Super cup")
        comps = [f"{c['country']}:{c['comp']}={c['winner']}" for c in wb_cups]
        print(f"{key}: workbook top8 domestic={maj} super={sup} | kept non-top8={len(keep)} | total={len(merged)}")
        if key in ("2013-14", "2020-21"):
            print("   ", "; ".join(comps))
        if write:
            hub["cups"] = merged
            json.dump(hub, open(p, "w", encoding="utf-8"), ensure_ascii=False)
            print("   WROTE")

if __name__ == "__main__":
    main()
