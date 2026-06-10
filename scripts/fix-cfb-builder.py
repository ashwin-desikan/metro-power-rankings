#!/usr/bin/env python3
r"""
CFB builder patches (scripts/build-cfb-data.py):
  Fix #2  game dates built from the Month/Day/Year columns (the Excel "Date"
          column is blank for pre-1900 games), fixing missing Greatest-Games dates.
  Req #2  emit data.json["national_champions"] from scripts/cfb-national-champions.tsv
          (Year, National Champion(s) with selectors, Heisman), with each school
          resolved to its CFB slug for linking on the hub page.

Run from repo root:  python scripts/fix-cfb-builder.py
Then rebuild data:   python scripts/build-cfb-data.py CFB.xlsx public/data
Idempotent; anchor-asserted.
"""
import os, sys, shutil

TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("scripts", "build-cfb-data.py")

EDITS = [
    # --- Fix #2: ymd_date helper ---
    (
        'def datestr(x):\n'
        '    if isinstance(x,(datetime.datetime,datetime.date)): return x.strftime("%Y-%m-%d")\n'
        '    return str(x) if x not in (None,"") else None\n',
        'def datestr(x):\n'
        '    if isinstance(x,(datetime.datetime,datetime.date)): return x.strftime("%Y-%m-%d")\n'
        '    return str(x) if x not in (None,"") else None\n'
        'def ymd_date(y,mo,da,fallback=None):\n'
        '    # Build an ISO date from the Month/Day/Year columns. The Date column is\n'
        '    # Excel-limited and is blank for pre-1900 games, so prefer Y/M/D.\n'
        '    try:\n'
        '        yi=int(round(float(y))); mi=int(round(float(mo))); di=int(round(float(da)))\n'
        '        if yi>0 and 1<=mi<=12 and 1<=di<=31: return f"{yi:04d}-{mi:02d}-{di:02d}"\n'
        '    except Exception: pass\n'
        '    return fallback\n',
    ),
    # --- Fix #2: use it in the game record ---
    (
        '"season":inti(g(r,"Season")),"date":datestr(g(r,"Date")),',
        '"season":inti(g(r,"Season")),"date":ymd_date(g(r,"Year"),g(r,"Month"),g(r,"Day"),datestr(g(r,"Date"))),',
    ),
    # --- Req #2: build national-champions list after team_list, before dump ---
    (
        '    team_list=sorted(teams.values(),key=lambda d:(-len(d["nat_champ_years"]),-d["pct"],d["name"]))\n',
        '    team_list=sorted(teams.values(),key=lambda d:(-len(d["nat_champ_years"]),-d["pct"],d["name"]))\n'
        '    # National champions (curated TSV: Year, National Champion(s) w/ selectors, Heisman).\n'
        '    _ncslug={norm_name(d["name"]):d["slug"] for d in team_list}\n'
        '    _ncalias={"brigham young":"byu"}  # curated-name -> our Cur. Name (normalised)\n'
        '    natchamps=[]\n'
        '    _ncp=os.path.join(os.path.dirname(os.path.abspath(__file__)),"cfb-national-champions.tsv")\n'
        '    if os.path.exists(_ncp):\n'
        '        def _splittop(s):\n'
        '            out=[];depth=0;cur=""\n'
        '            for ch in s:\n'
        '                if ch=="(":depth+=1;cur+=ch\n'
        '                elif ch==")":depth-=1;cur+=ch\n'
        '                elif ch=="," and depth==0:out.append(cur.strip());cur=""\n'
        '                else:cur+=ch\n'
        '            if cur.strip():out.append(cur.strip())\n'
        '            return out\n'
        '        def _pc(tok):\n'
        '            m=list(re.finditer(r"\\(([^()]*)\\)\\s*$",tok))\n'
        '            if m:return tok[:m[-1].start()].strip(),m[-1].group(1).strip()\n'
        '            return tok.strip(),""\n'
        '        _nl=[l.rstrip("\\n") for l in open(_ncp,encoding="utf-8")]\n'
        '        for line in _nl[1:]:\n'
        '            if not line.strip():continue\n'
        '            p=line.split("\\t");yr=inti(p[0])\n'
        '            if yr<=0:continue\n'
        '            champs=[]\n'
        '            for c in _splittop(p[1] if len(p)>1 else ""):\n'
        '                nm,sel=_pc(c);key=norm_name(nm)\n'
        '                champs.append({"name":nm,"slug":_ncslug.get(_ncalias.get(key,key)),"sel":sel})\n'
        '            natchamps.append({"year":yr,"heisman":(p[2].strip() if len(p)>2 else ""),"champs":champs})\n'
        '        natchamps.sort(key=lambda x:-x["year"])\n'
        '    print(f"national_champions:{len(natchamps)} unmatched:{sorted({c[\'name\'] for nc in natchamps for c in nc[\'champs\'] if not c[\'slug\']})}")\n',
    ),
    # --- Req #2: include it in data.json ---
    (
        '               "awards_by_team":awards,"rivalries_by_team":rivalries},',
        '               "awards_by_team":awards,"rivalries_by_team":rivalries,"national_champions":natchamps},',
    ),
]

def main():
    if not os.path.isfile(TARGET):
        print("ABORTED: missing " + TARGET + " (run from repo root)."); raise SystemExit(1)
    s = open(TARGET, encoding="utf-8").read()
    if "def ymd_date(" in s and "national_champions" in s:
        print("Already patched; nothing to do."); return
    for i,(old, new) in enumerate(EDITS,1):
        n = s.count(old)
        if n != 1:
            print("ABORTED at edit %d: anchor matched %d times (expected 1):\n%s" % (i,n, old[:120])); raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(TARGET, TARGET + ".cfbfix.bak")
    open(TARGET, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + TARGET)

if __name__ == "__main__":
    main()
