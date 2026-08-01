import json,re
from collections import defaultdict
d=json.load(open('/tmp/cl_rows.json'))
SEASONS=[f"{y}-{str(y+1)[2:]}" for y in range(2013,2025)]+["2025-26"]
def I(v):
    try: return int(v)
    except: return None
wb_idx=defaultdict(list)
for r in d:
    if r.get('season'): wb_idx[(r['season'],r.get('country'),r.get('level'))].append(r)

def common_prefix(names):
    if len(names)<2: return ""
    s1,s2=min(names),max(names)
    i=0
    while i<len(s1) and s1[i]==s2[i]: i+=1
    return s1[:i]

def pretty_label(raw):
    raw=(raw or "").strip()
    raw=raw.replace("Apertuera","Apertura")
    if raw in ("Eastern","Western"): return raw+" Conference"
    if re.fullmatch(r'\d+',raw): return "Group "+raw
    if re.fullmatch(r'[A-H]',raw): return "Zone "+raw
    return raw

def order_key(label):
    if not label: return (0,0,"")
    l=label.lower()
    for i,t in enumerate(['clausura','apertura']):
        if t in l: return (1,i,"")
    for i,t in enumerate(['eastern','western']):
        if t in l: return (2,i,"")
    m=re.search(r'(\d+)',label)
    if m: return (3,int(m.group(1)),"")
    return (4,0,label)

def build_groups(season,country,level):
    rows=[r for r in wb_idx.get((season,country,level),[])]
    if level==1: rows=[r for r in rows if r.get('first_division')=='Y'] or rows
    if not rows: return None
    # redundant aggregate + sub-zones: prefer the aggregate (grp=None) table
    ng=[r for r in rows if not r.get('grp')]; sg=[r for r in rows if r.get('grp')]
    if ng and sg: rows=ng
    names=sorted(set(r.get('league') for r in rows))
    grps=sorted(set(r.get('grp') for r in rows if r.get('grp')))
    divs=sorted(set(str(r.get('division')) for r in rows if r.get('division') not in (None,'')))
    if len(names)>1:
        pref=common_prefix(names)
        def _nl(nm):
            suf=(nm[len(pref):] if nm.startswith(pref) else nm).strip()
            if re.fullmatch(r'[A-Z0-9]',suf):
                lw=pref.strip().split()[-1] if pref.strip() else ''
                return (lw+' '+suf).strip()
            return suf.replace('Apertuera','Apertura')
        part=lambda r: r.get('league')
        lab=_nl
    elif len(grps)>1:
        part=lambda r: r.get('grp'); lab=pretty_label
    elif len(divs)>1:
        part=lambda r: str(r.get('division')); lab=pretty_label
    else:
        part=lambda r: None; lab=lambda k: None
    buckets=defaultdict(list)
    for r in rows: buckets[part(r)].append(r)
    groups=[]
    for key,rr in buckets.items():
        rr=sorted(rr,key=lambda x:(I(x.get('place')) if I(x.get('place')) is not None else 99))
        out=[]
        for r in rr:
            out.append({"rank":I(r.get('place')),"name":r.get('cur_name'),"lookup":r.get('cur_name'),
                "played":I(r.get('matches')),"win":I(r.get('w')),"draw":I(r.get('d')),"lose":I(r.get('l')),
                "gf":I(r.get('gs')),"ga":I(r.get('ga')),"gd":I(r.get('g_diff')),"points":I(r.get('points')),
                **({"champ":True} if r.get('champions')=='Y' else {})})
        groups.append({"label":lab(key) if len(buckets)>1 else None,"rows":out})
    groups.sort(key=lambda g:order_key(g['label']))
    return groups

def replace_cl(hub,country,level,groups):
    idxs=[i for i,lg in enumerate(hub['leagues']) if lg.get('country')==country and lg.get('level')==level]
    if not idxs: return None
    lg=hub['leagues'][idxs[0]]
    lg['groups']=groups
    lg['name']=re.sub(r'\s*[-–]\s*(Group|Serie|Zone|Apertura|Clausura|North|South|Promotion|Relegation).*$','',lg['name']).strip()
    rm=set(idxs[1:])
    hub['leagues']=[l for i,l in enumerate(hub['leagues']) if i not in rm]
    return len(groups)

TASKB=['Mexico','United States','Brazil','Argentina','Uruguay']
log=defaultdict(list)
for season in SEASONS:
    hub=json.load(open(f'/tmp/hub-{season}.json'))
    # Task C: remove England L6/L7
    before=len(hub['leagues'])
    hub['leagues']=[lg for lg in hub['leagues'] if not (lg.get('country')=='England' and lg.get('level') in (6,7))]
    removed=before-len(hub['leagues'])
    if removed: log[season].append(f"removed {removed} England L6/L7")
    # Task B: level 1 for 5 countries
    for country in TASKB:
        g=build_groups(season,country,1)
        if g:
            n=replace_cl(hub,country,1,g)
            if n: log[season].append(f"L1 {country}:{n}g")
    # Task A: level>=2 all countries, ALL seasons
    cls=sorted(set((r.get('country'),r.get('level')) for r in d if r.get('season')==season and (r.get('level') or 0)>=2),key=lambda x:(x[0] or '',x[1]))
    a_count=0
    for country,level in cls:
        g=build_groups(season,country,level)
        if g:
            n=replace_cl(hub,country,level,g)
            if n: a_count+=1
    if a_count: log[season].append(f"L2+ replaced:{a_count}")
    json.dump(hub,open(f'/tmp/hub-{season}.json','w'),ensure_ascii=False)
for s in SEASONS:
    print(f"{s}: "+" | ".join(log[s]))
