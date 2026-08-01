import openpyxl, json
from collections import defaultdict, Counter
wb=openpyxl.load_workbook("/mnt/user-data/uploads/Excel Files/Champions League-201516.xlsx", read_only=True, data_only=True)
ws=wb["Eur RndbyRnd"]
it=ws.iter_rows(values_only=True)
hdr=[str(h).strip() if h is not None else "" for h in next(it)]
ix={h:i for i,h in enumerate(hdr)}
def g(r,c):
    i=ix.get(c); return r[i] if (i is not None and i<len(r)) else None
def truthy(v): return v not in (None,"",0,"0","N",False)
def I(v):
    try: return int(v)
    except: return None

CONF={'Europe':'UEFA','South America':'CONMEBOL','North America':'CONCACAF','Asia':'AFC','Africa':'CAF','Oceania':'OFC','World':'FIFA'}
SECTION_OF={'CL':'ucl','EL':'uel','EUCL':'uecl','CWC':'uecl','CLB':'conmebol','OTH':'conmebol'}
SHIFT={'CLB','OTH'}  # bucket by the edition that ENDED in the season's first year (Seas), like the 2026-27 hub
ORDER={('CL','Europe'):1,('EL','Europe'):2,('EUCL','Europe'):3,('USC','Europe'):4,
       ('CLB','South America'):5,('OTH','South America'):6,('RCSA','South America'):7,
       ('OTHC','North America'):8,('OTHC','Asia'):9,('OTHC','Africa'):10,('OTHC','Oceania'):11,
       ('IC','World'):12,('FCWC','World'):13}
SEASONS=[f"{y}-{str(y+1)[2:]}" for y in range(2013,2025)]+["2025-26"]
SEASET=set(SEASONS)

buckets=defaultdict(lambda: defaultdict(lambda: {'rnd':None,'trophy':False}))
names=defaultdict(Counter); seas=defaultdict(Counter)
for r in it:
    comp=g(r,'Comp'); cont=g(r,'Continent')
    if (comp,cont) not in ORDER: continue
    sv=I(g(r,'Seas'))
    if comp in SHIFT:
        if sv is None: continue
        s=f"{sv}-{str(sv+1)[2:]}"
    else:
        s=g(r,'Season')
    if s not in SEASET: continue
    team=g(r,'Cur. Name')
    if not team: continue
    key=(s,comp,cont)
    rnd=I(g(r,'Rnd#'))
    agg=buckets[key][team]
    if rnd is not None and (agg['rnd'] is None or rnd<agg['rnd']): agg['rnd']=rnd
    if truthy(g(r,'Trophy Won')): agg['trophy']=True
    lc=g(r,'Leag/Comp.')
    if lc: names[key][lc]+=1
    if sv is not None: seas[key][sv]+=1

out={}
for s in SEASONS:
    comps=[]
    for key in sorted([k for k in buckets if k[0]==s], key=lambda k:ORDER[(k[1],k[2])]):
        _,comp,cont=key
        entries=[{'name':t,'rnd':a['rnd'],**({'trophy':True} if a['trophy'] else {})} for t,a in buckets[key].items()]
        entries.sort(key=lambda e:(e['rnd'] if e['rnd'] is not None else 99, e['name']))
        dispname=names[key].most_common(1)[0][0] if names[key] else comp
        endyr=seas[key].most_common(1)[0][0] if seas[key] else None
        comps.append({'comp':dispname,'scope':CONF.get(cont,cont),'section':SECTION_OF.get(comp,'other'),
                      **({'end_year':endyr} if endyr else {}),'entries':entries})
    out[s]=comps
json.dump(out,open('/tmp/continental_rbr.json','w'),ensure_ascii=False)
# reinject 2023-24 + report
h=json.load(open('/tmp/hub-2023-24.json')); h['continental']=out['2023-24']
json.dump(h,open('/tmp/hub-2023-24.json','w'),ensure_ascii=False)
for c in out['2023-24']:
    champ=[e['name'] for e in c['entries'] if e.get('trophy')]
    print(f"  [{c['section']:8}] {c['comp']:26} {c['scope']:9} end={c.get('end_year')} champ={champ}")
