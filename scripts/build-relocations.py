#!/usr/bin/env python3
"""
Builds public/data/sports/relocations-by-metro.json: per metro, the teams that USED to play
there and are gone now (relocated away or folded), with era name + years, a Relocated and/or
Defunct tag, ordered by the last year in that city (newest first), linking to the canonical or
defunct team page.

Resolver order for a former city: canonical city-to-metro.json (from the Municipality sheet,
emitted by scripts/build-city-to-metro.py) -> editable aliases.csv -> current-franchise seed ->
metro-name tokens. Defunct multi-metro splits resolve canonical-only (no team-specific aliases)
so a brand label like "California" can't drag a club onto the wrong metro; anything unresolved is
logged to scripts/relocations/skipped.json for you to place.

Editable tables in scripts/relocations/: aliases.csv, abbreviations.csv (KC, NO), curated.csv,
overrides.csv, exclude.csv.
"""
import json, re, unicodedata, os, csv
from collections import defaultdict, Counter

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(p):
    raw=open(os.path.join(ROOT,p),'rb').read().rstrip(b'\x00').rstrip()
    return json.JSONDecoder().raw_decode(raw.decode('utf-8-sig','ignore').lstrip())[0]
def slugify(s):
    s=unicodedata.normalize('NFKD',str(s).lower()); s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'^-+|-+$','',re.sub(r'[^a-z0-9]+','-',s))
def read_csv(name):
    p=os.path.join(ROOT,'scripts','relocations',name)
    return list(csv.DictReader(open(p,encoding='utf-8-sig'))) if os.path.exists(p) else []

SPORT={'nfl':'American Football','nba':'Basketball','nhl':'Hockey','mlb':'Baseball','wnba':'W Basketball','ipl':'Cricket','football':'Football/Soccer'}
BIG4=['nfl','nba','nhl','mlb']

metros=load('public/data/metros.json')
name2slug={}
for m in metros:
    name2slug.setdefault(m['name'].lower(), m['slug'])
    for part in re.split(r'[\/\-–]', m['name']): name2slug.setdefault(part.strip().lower(), m['slug'])

CANON={}  # Municipality-sheet map disabled; resolver uses the vetted aliases.csv

city2slug={}; fr_metro={}
for lg in BIG4:
    for f in load(f'public/data/{lg}/franchises.json'):
        if f.get('city') and f.get('metro_slug'): city2slug.setdefault(f['city'].lower(), f['metro_slug'])
        fr_metro[(lg,f.get('slug'))]=f.get('metro_slug')
    for h in load(f'public/data/{lg}/historical.json'):
        for ck in ('city','last_city','city_history'):
            if h.get(ck) and h.get('metro_slug'): city2slug.setdefault(str(h[ck]).split('/')[0].lower(), h['metro_slug'])

ALIASES={r['city'].lower():r['metro_slug'] for r in read_csv('aliases.csv') if r.get('metro_slug')}
EXCLUDE={r['city'].lower() for r in read_csv('exclude.csv')}
CURATED=read_csv('curated.csv')
OVERRIDES={(r['metro_slug'],r['href']):r for r in read_csv('overrides.csv')}
CITY_EXPAND={r['abbrev'].lower():r['full'] for r in read_csv('abbreviations.csv')}

skipped=[]
def norm(s): return ' '.join(str(s).replace('.', '. ').split()).strip().lower()  # 'St.Louis' -> 'st. louis'
def resolve(city, league, name, use_aliases=True):
    c2=city.lower().strip()
    if not c2 or c2=='the' or c2 in EXCLUDE: return None
    for c in (norm(city), c2):
        ms=CANON.get(c) or (ALIASES.get(c) if use_aliases else None) or city2slug.get(c) or name2slug.get(c)
        if ms: return ms
    skipped.append({'league':league,'name':name,'city':city,'reason':'no metro match'})
    return None

def defunct_name(h, ms):
    disp=h.get('display_name') or h.get('name') or ''
    cities=[c.strip() for c in re.split(r'/', (h.get('city') or h.get('city_history') or '')) if c.strip()]
    def mslug(c): return CANON.get(c.lower()) or city2slug.get(c.lower()) or name2slug.get(c.lower())
    if any(disp.lower().startswith(c.lower()) and mslug(c) and mslug(c)!=ms for c in cities):
        for c in cities:
            if mslug(c)==ms: return f"{c} {h.get('canonical') or h.get('name')}"
    return disp

cards={}  # (metro_slug, href) -> card; later writes overwrite (curated/override wins)
def add(ms, league, name, years, href, kind, sport=None):
    cards[(ms,href)]={'metro':ms,'league':league,'sport':sport or SPORT.get(league,''),'name':name,'years':years,'href':href,'kind':kind}

for lg in BIG4:
    for slug, seasons in load(f'public/data/{lg}/seasons-by-team.json').items():
        bycity=defaultdict(lambda:{'years':[],'team':None})
        for se in seasons:
            c=se.get('city')
            if not c: continue
            for _p in c.split('/'):                          # split-home cities (KC/Omaha) -> a tile per metro
                part=CITY_EXPAND.get(_p.strip().lower(), _p.strip())
                if part: bycity[part]['years'].append(se['year']); bycity[part]['team']=se.get('team')
        for city,info in bycity.items():
            ms=resolve(city,lg,f"{city} {info['team']}")
            if not ms or ms==fr_metro.get((lg,slug)): continue
            add(ms,lg,f"{city} {info['team']}",f"{min(info['years'])}–{max(info['years'])}",f"/teams/{lg}/{slug}","relocated")
    for h in load(f'public/data/{lg}/historical.json'):       # defunct: a tile per metro, named for that city's era
        hslug=h.get('slug') or slugify(h.get('canonical')); href=f"/teams/{lg}/{hslug}"
        yrs=f"{h.get('first_year') or h.get('founded') or ''}–{h.get('last_year') or h.get('ended') or h.get('last_season') or ''}".strip('–')
        final_ms=h.get('metro_slug')
        cities=[c.strip() for c in re.split(r'/', h.get('city_history') or h.get('city') or '') if c.strip()]
        names=[n.strip() for n in re.split(r'/', re.sub(r'\s*\([^)]*\)','', h.get('team_history') or h.get('team_historical') or '')) if n.strip()]
        paired = len(cities)==len(names) and bool(cities)        # city_history pairs 1:1 with team_history
        placed=set()
        for i,city in enumerate(cities):
            mm=resolve(city,lg,h.get('display_name') or h.get('name'))
            if not mm or mm in placed: continue
            placed.add(mm)
            ename=f"{city} {names[i]}" if paired else defunct_name(h,mm)
            add(mm,lg,ename,yrs,href,"defunct" if mm==final_ms else "relocated")
        if final_ms and final_ms not in placed:
            add(final_ms,lg,defunct_name(h,final_ms),yrs,href,"defunct")

for f in load('public/data/wnba/data.json')['franchises']:
    if f.get('defunct') and f.get('metro_slug'):
        add(f['metro_slug'],'wnba',f['name'],f"{f.get('first_season') or ''}–{f.get('last_season') or ''}".strip('–'),f"/teams/wnba/{f['slug']}","defunct")
for f in load('public/data/ipl/data.json')['franchises']:
    if not f.get('active'):
        ms=f.get('metro') and (CANON.get(f['metro'].lower()) or city2slug.get(f['metro'].lower()) or name2slug.get(f['metro'].lower()))
        if not ms: skipped.append({'league':'ipl','name':f['name'],'city':f.get('metro'),'reason':'no metro match'}); continue
        add(ms,'ipl',f['name'],'',f"/teams/ipl/{f['slug']}","defunct")

for r in CURATED:                                            # manual adds overwrite the auto tile for same metro+href
    if r.get('metro_slug') and r.get('href'):
        add(r['metro_slug'],r.get('league','football'),r['name'],r.get('years',''),r['href'],r.get('kind','relocated'),r.get('sport'))

defunct_hrefs=set()
for lg in BIG4:
    for h in load(f'public/data/{lg}/historical.json'):
        defunct_hrefs.add(f"/teams/{lg}/{h.get('slug') or slugify(h.get('canonical'))}")
for f in load('public/data/wnba/data.json')['franchises']:
    if f.get('defunct'): defunct_hrefs.add(f"/teams/wnba/{f['slug']}")
for f in load('public/data/ipl/data.json')['franchises']:
    if not f.get('active'): defunct_hrefs.add(f"/teams/ipl/{f['slug']}")
for (ms,href),c in cards.items():
    ov=OVERRIDES.get((ms,href))
    if ov:
        if ov.get('name'): c['name']=ov['name']
        if ov.get('years'): c['years']=ov['years']
    c['relocated']=(c['kind']=='relocated'); c['defunct']=(href in defunct_hrefs)

def _ly(c):
    ys=re.findall(r'\d{4}', c.get('years','') or ''); return int(ys[-1]) if ys else 0
out=defaultdict(list)
for c in cards.values():
    out[c['metro']].append({k:c[k] for k in ('league','sport','name','years','href','kind','relocated','defunct')})
for ms in out: out[ms].sort(key=lambda c:(-_ly(c), c['name']))
out={k:out[k] for k in sorted(out)}
open(os.path.join(ROOT,'public/data/sports/relocations-by-metro.json'),'w',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=0))
open(os.path.join(ROOT,'scripts','relocations','skipped.json'),'w',encoding='utf-8').write(json.dumps(skipped,ensure_ascii=False,indent=2))
tot=sum(len(v) for v in out.values())
print(f"relocations-by-metro.json: {tot} tiles / {len(out)} metros | {dict(Counter(c['league'] for v in out.values() for c in v))}")
print(f"canonical city-to-metro: {len(CANON)} | manual: aliases={len(ALIASES)} abbrev={len(CITY_EXPAND)} curated={len(CURATED)} overrides={len(OVERRIDES)} exclude={len(EXCLUDE)}")
print(f"skipped (bring to user): {len(skipped)} -> {sorted({s['city'] for s in skipped})[:40]}")
