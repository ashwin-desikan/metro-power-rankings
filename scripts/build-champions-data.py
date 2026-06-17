#!/usr/bin/env python3
"""
Build public/data/champions.json from ZoneZero_Champions.xlsx (project root).

This sheet is the SOURCE OF TRUTH for "current champions" badges across the
site: every Gold Standard plus selected competitions, one row per reigning
champion. Columns: Sport, Competiton[sic], Team, Year, International,
Continental, Domestic (exactly one of the last three holds the scope label).

Run after editing the sheet:  python scripts/build-champions-data.py
"""
import os, json, openpyxl

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(ROOT,"ZoneZero_Champions.xlsx")
OUT=os.path.join(ROOT,"public","data","champions.json")

def main():
    wb=openpyxl.load_workbook(SRC,read_only=True,data_only=True)
    ws=wb["Sheet1"]
    rows=list(ws.iter_rows(values_only=True))
    hdr=[str(c).strip() if c is not None else "" for c in rows[0]]
    idx={h.lower():i for i,h in enumerate(hdr)}
    def col(*names):
        for n in names:
            if n in idx: return idx[n]
        return None
    iSport=col("sport"); iComp=col("competiton","competition"); iTeam=col("team")
    iYear=col("year"); iIntl=col("international"); iCont=col("continental"); iDom=col("domestic")
    out=[]
    for r in rows[1:]:
        def g(i): return r[i] if i is not None and i<len(r) else None
        team=g(iTeam); comp=g(iComp)
        if not team or not comp: continue
        intl,cont,dom=g(iIntl),g(iCont),g(iDom)
        scope_type="International" if intl else "Continental" if cont else "Domestic" if dom else None
        out.append({
            "sport":str(g(iSport) or "").strip(),
            "competition":str(comp).strip(),
            "team":str(team).strip(),
            "year":int(g(iYear)) if g(iYear) is not None else None,
            "scope":str(intl or cont or dom or "").strip(),
            "scopeType":scope_type,
        })
    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    json.dump(out,open(OUT,"w",encoding="utf-8"),ensure_ascii=False,indent=0)
    import collections
    bysport=collections.Counter(x["sport"] for x in out)
    print(f"champions:{len(out)} sports:{dict(bysport)}")

if __name__=="__main__": main()
