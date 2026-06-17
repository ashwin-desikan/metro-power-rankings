#!/usr/bin/env python3
"""
Build public/data/college-hockey/{data.json,skipped.json} for men's NCAA
Division I ice hockey (the Frozen Four), used for metro cards only (no hub).

Sources:
  Frozenfour.txt  -> per-program summary (Frozen Four appearances, W/L, titles)
                     and the year-by-year championship game results.
  NCAA Tournament.xlsx (men's Totals + Sheet2) -> metro join by campus.

Per the project rule we never guess city->metro: programs whose campus has no
matching metro are written to skipped.json for manual review, not hand-mapped.

Slug = slugify(School) + "-ncaah". Cards display titles (gold) and Frozen Fours.

Usage: python build-college-hockey-data.py Frozenfour.txt "NCAA Tournament.xlsx" public/data
"""
import sys, os, json, re, unicodedata

def slugify(s):
    s=unicodedata.normalize("NFKD",str(s or "")).encode("ascii","ignore").decode()
    return re.sub(r"-+","-",re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-"))
def norm_name(s):
    s=unicodedata.normalize("NFKD",str(s or "")).encode("ascii","ignore").decode()
    return re.sub(r"[^a-z0-9]+"," ",s.lower()).strip()
def inti(x):
    try: return int(round(float(x)))
    except: return 0
def pyhue(name):
    h=0
    for ch in str(name): h=(h*31+ord(ch))&0xFFFFFFFF
    return f"hsl({h%360},58%,52%)"
def read_sheet(path,name):
    import openpyxl
    ws=openpyxl.load_workbook(path,read_only=True,data_only=True)[name]
    rows=[list(r) for r in ws.iter_rows(values_only=True)]
    return {str(c).strip():i for i,c in enumerate(rows[0]) if c is not None}, rows[1:]
def _colors():
    import csv as _csv
    here=os.path.dirname(os.path.abspath(__file__)); out={}
    for fn in ("cfb-colors.csv","cbb-colors.csv"):
        fp=os.path.join(here,fn)
        if not os.path.exists(fp): continue
        with open(fp,encoding="utf-8-sig",newline="") as f:
            for row in _csv.DictReader(f):
                k=norm_name(row.get("Cur. Name") or "")
                if k: out[k]=((row.get("Primary") or "").strip() or None,(row.get("Secondary") or "").strip() or None)
    return out

def main():
    txt,metro_xlsx,out=sys.argv[1],sys.argv[2],sys.argv[3]
    COL=_colors()
    def color(n):
        p,s=COL.get(norm_name(n),(None,None)); return (p or pyhue(n), s or p or pyhue(n))

    # Canonical metros from MetroAreas.xlsx "Team List" (College Hockey rows).
    TL,tlrows=read_sheet(metro_xlsx,"Team List")
    def tl(r,k): i=TL.get(k); return r[i] if i is not None and i<len(r) else None
    tl_map={}
    for r in tlrows:
        if not re.search(r"ncaa|college",str(tl(r,"League") or ""),re.I): continue
        tm=tl(r,"Team")
        if tm: tl_map.setdefault(norm_name(tm),(tl(r,"Metro Area"),tl(r,"State")))
    def metro(name):
        v=tl_map.get(norm_name(name))
        return v if v else (None,None)

    lines=open(txt,encoding="utf-8",errors="replace").read().split("\n")
    teams=[]; champions=[]
    for ln in lines:
        f=ln.split("\t")
        # summary rows: School, FF apps, FF years, W, L, Champ App, Titles
        if len(f)>=7 and f[0].strip() and f[1].strip().isdigit() and not f[0].strip().isdigit():
            name=f[0].strip(); m,st=metro(name)
            teams.append({"name":name,"slug":slugify(name)+"-ncaah",
                "frozen_fours":inti(f[1]),"ff_years":[int(y) for y in re.findall(r"\d{4}",f[2])],
                "w":inti(f[3]),"l":inti(f[4]),"champ_app":inti(f[5]),"titles":inti(f[6]),
                "metro":m,"metro_slug":slugify(m) or None,"state":st,
                "color":color(name)[0],"color2":color(name)[1]})
        # year-by-year: Year, Champion, score, score, Runner-up, Site
        elif len(f)>=5 and f[0].strip().isdigit() and len(f[0].strip())==4:
            champions.append({"year":int(f[0].strip()),"champion":f[1].strip(),"runner_up":f[4].strip() if len(f)>4 else None})

    # dedupe summary by slug (source has a duplicate "RIT" row); flag duplicates
    seen={}; dups=[]
    uniq=[]
    for d in teams:
        if d["slug"] in seen:
            dups.append(d["name"]); continue
        seen[d["slug"]]=d; uniq.append(d)
    teams=sorted(uniq,key=lambda d:(-d["titles"],-d["frozen_fours"],d["name"]))
    matched=[d for d in teams if d["metro_slug"]]
    skipped=[{"name":d["name"],"titles":d["titles"],"frozen_fours":d["frozen_fours"]} for d in teams if not d["metro_slug"]]

    od=os.path.join(out,"college-hockey"); os.makedirs(od,exist_ok=True)
    json.dump({"teams":teams,"champions":sorted(champions,key=lambda x:-x["year"])},
              open(os.path.join(od,"data.json"),"w",encoding="utf-8"),ensure_ascii=False)
    json.dump({"skipped":skipped,"duplicate_rows":dups},
              open(os.path.join(od,"skipped.json"),"w",encoding="utf-8"),ensure_ascii=False)
    print(f"programs:{len(teams)} with_metro:{len(matched)} skipped:{len(skipped)} dups:{dups} champ_games:{len(champions)}")
    print("titles>=5 (metro cards):",[(d["name"],d["titles"],d["metro"]) for d in teams if d["titles"]>=5])

if __name__=="__main__": main()
