import json, unicodedata, re
from collections import defaultdict
def norm(s):
    if not s: return ""
    return re.sub(r'[^a-z0-9]','',unicodedata.normalize("NFKD",str(s)).encode("ascii","ignore").decode().lower())
def cnorm(c):
    m={"USA":"United States","Turkey":"Türkiye","Czech Republic":"Czechia","North Macedonia":"Macedonia"}
    return m.get((c or '').strip(),(c or '').strip())
def token(s):
    s=(s or "").lower()
    return "apertura" if "apertura" in s else ("clausura" if "clausura" in s else None)
ft=json.load(open('/tmp/football_team.json')); fl=json.load(open('/tmp/football_lookup.json'))
alias={}
def addal(name,canon):
    n=norm(name)
    if n and canon and n not in alias: alias[n]=canon
for r in ft:
    for k in ('canonical_name','lookup_name','uefa_name'): addal(r.get(k),r.get('canonical_name'))
for r in fl:
    for k in ('cur_name','team','lookup_name','uefa_name','uefa_name_2','efs_name','api_name','api_name_2'): addal(r.get(k),r.get('cur_name'))
for _a,_b in [('Nacional','Club Nacional'),('Shanghai SIPG','Shanghai Port'),('FC Urartu','Banants Yerevan'),
              ('Al Ahli Club Dubai','Shabab Al Ahli Dubai'),('Sabah FK','Sabah FA'),('Atlético Kolkata','ATK')]:
    _c=alias.get(norm(_b)) or alias.get(norm(_a)) or _b
    alias[norm(_a)]=_c; alias[norm(_b)]=_c
def sameclub(a,b):
    if norm(a)==norm(b): return True
    ca,cb=alias.get(norm(a)),alias.get(norm(b))
    return ca is not None and ca==cb
SEASONS=[f"{y}-{str(y+1)[2:]}" for y in range(2013,2025)]+["2025-26"]
wb=json.load(open('/tmp/cl_rows.json'))
wb_by_season=defaultdict(list)
for r in wb:
    if r.get('season'): wb_by_season[r['season']].append(r)
champ_idx=defaultdict(list)
for r in wb:
    if r.get('champions')=='Y' and r.get('first_division')=='Y' and r.get('season'):
        champ_idx[(r['season'],cnorm(r.get('country')))].append(
            {'cur':r.get('cur_name'),'team':r.get('team'),'tok':token(r.get('league')),'league':r.get('league')})
for kk in list(champ_idx):  # dedup by (club, tournament)
    seen=set(); ded=[]
    for c in champ_idx[kk]:
        sig=(norm(c['cur']),c['tok'])
        if sig in seen: continue
        seen.add(sig); ded.append(c)
    champ_idx[kk]=ded

unplaced=[]; star_counts={}
for season in SEASONS:
    hub=json.load(open(f'/tmp/hub-{season}.json'))
    for lg in hub['leagues']:
        for g in lg['groups']:
            for row in g['rows']: row.pop('champ',None)
    stars=0
    for lg in hub['leagues']:
        if lg.get('level')!=1: continue
        cc=cnorm(lg.get('country')); cand=champ_idx.get((season,cc),[])
        if not cand: continue
        placed=set()
        group_tokens={token(g.get('label')) for g in lg['groups']}
        for c in cand:
            sig=(norm(c['cur']),c['tok'])
            matches=[]  # (group_token, row)
            for g in lg['groups']:
                gtok=token(g.get('label'))
                if gtok and c['tok'] and gtok!=c['tok']: continue
                for row in g['rows']:
                    if sameclub(c['cur'],row['name']) or sameclub(c['team'],row['name']):
                        matches.append((gtok,row)); break
            if not matches: continue
            # if a tokenless champion matched across >1 distinct tournament, star only best rank
            distinct_toks={m[0] for m in matches}
            if c['tok'] is None and len([t for t in distinct_toks if t])>1:
                best=min(matches,key=lambda m:(m[1].get('rank') or 999))
                matches=[best]
            for gtok,row in matches:
                if not row.get('champ'): row['champ']=True; stars+=1
            placed.add(sig)
        for c in cand:
            sig=(norm(c['cur']),c['tok'])
            if sig in placed: continue
            # only report if the champion's tournament has a table here (else it's a tournament-with-no-table edge)
            if c['tok'] and c['tok'] not in group_tokens and None not in group_tokens: continue
            unplaced.append((season,lg.get('country'),lg.get('name'),c['cur'],c['tok']))
    star_counts[season]=stars
    json.dump(hub,open(f'/tmp/hub-{season}.json','w'),ensure_ascii=False)
# dedup unplaced
seen=set(); U=[]
for x in unplaced:
    k=(x[0],x[1],x[3],x[4])
    if k in seen: continue
    seen.add(k); U.append(x)
print("stars/season:",{s:star_counts[s] for s in SEASONS},"TOTAL",sum(star_counts.values()))
print(f"\n=== genuinely unplaced champions: {len(U)} ===")
for x in U: print(f"  {x[0]} {x[1]:22} {x[3]!r} tok={x[4]}")
json.dump(U,open('/tmp/unplaced_champs.json','w'))
