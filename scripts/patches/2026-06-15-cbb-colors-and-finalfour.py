import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rel = "scripts/build-cbb-data.py"
p = os.path.join(ROOT, rel)
c = io.open(p, "r", encoding="utf-8").read()

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:70]))
    c = c.replace(old, new)

# 1) Color loader inserted before main()
loader = (
    'def _load_team_colors():\n'
    '    """Real brand colors: cfb-colors.csv (shared FBS schools) then\n'
    '    cbb-colors.csv (basketball additions, takes precedence). Keyed by\n'
    '    norm_name. Falls back to pyhue() for any program in neither file."""\n'
    '    import csv as _csv\n'
    '    here = os.path.dirname(os.path.abspath(__file__))\n'
    '    out = {}\n'
    '    for fn in ("cfb-colors.csv", "cbb-colors.csv"):\n'
    '        fp = os.path.join(here, fn)\n'
    '        if not os.path.exists(fp):\n'
    '            continue\n'
    '        with open(fp, encoding="utf-8-sig", newline="") as f:\n'
    '            for row in _csv.DictReader(f):\n'
    '                key = norm_name(row.get("Cur. Name") or "")\n'
    '                prim = (row.get("Primary") or "").strip() or None\n'
    '                sec = (row.get("Secondary") or "").strip() or None\n'
    '                if key:\n'
    '                    out[key] = (prim, sec)\n'
    '    return out\n'
    '\n'
    '_TEAM_COLORS = None\n'
    'def team_color(name):\n'
    '    global _TEAM_COLORS\n'
    '    if _TEAM_COLORS is None:\n'
    '        _TEAM_COLORS = _load_team_colors()\n'
    '    prim, sec = _TEAM_COLORS.get(norm_name(name), (None, None))\n'
    '    return (prim or pyhue(name), sec or prim or pyhue(name))\n'
    '\n\n'
    'def main():'
)
sub('def main():', loader)

# 2) Use real colors on the team row
sub('"region":t(r,"Region"),"color":pyhue(cur),"color2":pyhue(cur),',
    '"region":t(r,"Region"),"color":team_color(cur)[0],"color2":team_color(cur)[1],')

# 3) declare runner-up / final-four collectors
sub('seasons=defaultdict(list); natchamp_rows=[]',
    'seasons=defaultdict(list); natchamp_rows=[]; ru_by_year=defaultdict(list); f4_by_year=defaultdict(list)')

# 4) collect runner-up (championship-game loser) + Final Four per year
sub('        champ=yn(c(r,"Chm.")); helms=yn(c(r,"Helms Chmp")); premo=yn(c(r,"Premo-Porretta Chmp"))',
    '        champ=yn(c(r,"Chm.")); helms=yn(c(r,"Helms Chmp")); premo=yn(c(r,"Premo-Porretta Chmp"))\n'
    '        _chapp=yn(c(r,"Ch. App")); _fin4=yn(c(r,"Fin. 4"))\n'
    '        if yr>0 and _fin4: f4_by_year[yr].append(cur)\n'
    '        if yr>0 and _chapp and not champ: ru_by_year[yr].append(cur)')

# 5) emit runner_up + final_four (semifinal losers) on each champion year
old_nc = (
    '    byyear=defaultdict(list)\n'
    '    for yr,cur,sel in natchamp_rows:\n'
    '        if yr<=0: continue\n'
    '        byyear[yr].append({"name":cur,"slug":name2slug.get(norm_name(cur)),"sel":("" if sel=="NCAA" else sel)})\n'
    '    national_champions=[{"year":y,"champs":byyear[y]} for y in sorted(byyear,reverse=True)]'
)
new_nc = (
    '    byyear=defaultdict(list)\n'
    '    for yr,cur,sel in natchamp_rows:\n'
    '        if yr<=0: continue\n'
    '        byyear[yr].append({"name":cur,"slug":name2slug.get(norm_name(cur)),"sel":("" if sel=="NCAA" else sel)})\n'
    '    def _mk(nm): return {"name":nm,"slug":name2slug.get(norm_name(nm))}\n'
    '    national_champions=[]\n'
    '    for y in sorted(byyear,reverse=True):\n'
    '        champs=byyear[y]\n'
    '        cset={x["name"] for x in champs}\n'
    '        runner_up=[_mk(n) for n in dict.fromkeys(ru_by_year.get(y,[])) if n not in cset]\n'
    '        ruset={x["name"] for x in runner_up}\n'
    '        final_four=[_mk(n) for n in dict.fromkeys(f4_by_year.get(y,[])) if n not in cset and n not in ruset]\n'
    '        national_champions.append({"year":y,"champs":champs,"runner_up":runner_up,"final_four":final_four})'
)
sub(old_nc, new_nc)

io.open(p, "w", encoding="utf-8").write(c)
print("OK build-cbb-data.py patched (colors + runner-up/final-four)")
