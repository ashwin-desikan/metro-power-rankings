#!/usr/bin/env python3
"""
Builds public/data/sports/relocations-by-metro.json: per metro, the teams that USED to play
there and are gone now (relocated away or folded), with the city+team name used on ARRIVAL in
that metro, the actual per-stint years, a Relocated and/or Defunct tag, ordered by last year.

BIG-4 tiles are derived straight from each league's curated "Year by Year" sheet. The Metro Area,
City, Team and Year columns pin every franchise's stints, so metro placement, era name and years
all come from the workbook (no slash-string reconstruction). A franchise gets a tile on every
metro it played in except its current home (active franchises). WNBA / IPL come from their JSON.
Editable layer in scripts/relocations/: curated.csv, overrides.csv, exclude.csv, aliases.csv.
"""
import json, re, unicodedata, os, csv, sys
from collections import defaultdict, Counter
try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl required (pip install openpyxl)")

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.environ.get('RELOC_OUT', os.path.join(ROOT,'public/data/sports/relocations-by-metro.json'))
SKIPPED=os.environ.get('RELOC_SKIPPED', os.path.join(ROOT,'scripts','relocations','skipped.json'))
def load(p):
    raw=open(os.path.join(ROOT,p),'rb').read().replace(b'\x00',b'')
    return json.JSONDecoder().raw_decode(raw.decode('utf-8-sig','ignore').lstrip())[0]
def slugify(s):
    s=unicodedata.normalize('NFKD',str(s).lower()); s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'^-+|-+$','',re.sub(r'[^a-z0-9]+','-',s))
def read_csv(name):
    p=os.path.join(ROOT,'scripts','relocations',name)
    return list(csv.DictReader(open(p,encoding='utf-8-sig'))) if os.path.exists(p) else []

SPORT={'nfl':'American Football','nba':'Basketball','nhl':'Hockey','mlb':'Baseball','wnba':'W Basketball','ipl':'Cricket','football':'Football/Soccer','cfl':'Canadian Football','afl':'Aussie Rules','nrl':'Rugby League'}
BIG4=['nfl','nba','nhl','mlb']
EN='–'

def find_wb(*names):
    # Prefer the user's Excel Files master (same as the league builds); the project copy is only a fallback.
    bases=[os.environ.get('RELOC_XLSX_DIR'), os.path.expanduser('~/OneDrive/Excel Files'), ROOT]
    for n in names:
        for b in bases:
            if not b: continue
            q=os.path.join(b,n)
            if os.path.exists(q): return q
    return None
# league -> (workbook, year_col, city_col, team_col, name_col, metro_col)  Year by Year, 0-indexed
SRC={
 'nhl': (find_wb('NHL.xlsx'), 2,3,4,56,77),
 'nba': (find_wb('NBA.xlsx','NBA_backup.xlsx'), 2,3,4,34,90),
 'nfl': (find_wb('NFL_all.xlsx','NFL_all_backup.xlsx','NFL_all - Copy.xlsx'), 2,3,4,117,36),
 'mlb': (find_wb('MLB.xlsx','MLB - Copy.xlsx','MLB_backup.xlsx'), 3,4,5,86,125),
}
# Per-season stat columns in each league's Year by Year sheet (0-indexed), pulled from
# the league builders. champ/div/finals are Y/blank flags; pct='pts' => points% (NHL),
# pct='win' => (W + 0.5T)/(W+L+T). finals = WS appearances (MLB pennants); div = division titles.
# champ/div/finals are LISTS of Y/blank flag columns (summed). MLB carries the
# pre-1903 'other championship' cols so 19th-century clubs show their honors:
# col 30 = pre-1903 title (World's Series win), col 31 = pre-1903 pennant.
# Verified on the Providence Grays -> 1 title (1884) / 2 pennants (1879, 1884).
STAT={
 'nhl':{'w':5,'l':6,'t':7,'otl':8,'pts':9,'champ':[23],'div':[15],'finals':[22],'pct':'pts','other_oth':23},  # other_oth: col 23 == "OTH" -> non-SC title (Avco/pre-NHL)
 'nba':{'w':5,'l':6,'champ':[23],'div':[16],'finals':[22],'pct':'win'},
 'nfl':{'w':5,'l':6,'t':7,'champ':[19],'div':[12],'finals':[18],'pct':'win'},
 'mlb':{'w':6,'l':7,'champ':[17],'div':[12],'finals':[16,31],'pct':'win','other':[30]},  # champ=modern WS only; other=pre-1903 World's Series titles (col30)
}
def _yn(v):
    if v is None: return False
    s=str(v).strip().lower()
    if s in ('y','yes','true'): return True
    try: return float(s)>0
    except (TypeError,ValueError): return False
def _gi(row,i):
    if i is None or i>=len(row) or row[i] in (None,''): return 0
    try: return int(float(row[i]))
    except (TypeError,ValueError): return 0
def _flags(row,cols):
    return sum(1 for c in cols if c<len(row) and _yn(row[c]))
def rowstats(lg,row):
    sc=STAT[lg]
    return {'w':_gi(row,sc.get('w')),'l':_gi(row,sc.get('l')),'t':_gi(row,sc.get('t')),
            'otl':_gi(row,sc.get('otl')),'pts':_gi(row,sc.get('pts')),
            'champ':_flags(row,sc['champ']),'div':_flags(row,sc['div']),'finals':_flags(row,sc['finals']),
            'other':_flags(row,sc.get('other',[]))+(1 if sc.get('other_oth') is not None and sc['other_oth']<len(row) and str(row[sc['other_oth']]).strip().upper()=='OTH' else 0)}
def finalize_stats(lg,a):
    gp=a['w']+a['l']+a['t']+a['otl']
    if STAT[lg]['pct']=='pts':
        pct=round(a['pts']/(2*gp),3) if gp>0 else 0.0
    else:
        den=a['w']+a['l']+a['t']
        pct=round((a['w']+0.5*a['t'])/den,3) if den>0 else 0.0
    res={'champ':a['champ'],'div':a['div'],'finals':a['finals'],'pct':pct}
    if a.get('other'): res['other']=a['other']
    return res

metros=load('public/data/metros.json')
EXACT={m['name'].strip().lower():m['slug'] for m in metros}
# workbook Metro Area values that are not an exact metros.json name (each vetted vs the canonical list)
METRO_ALIAS={'baltimore':'washington-baltimore','san francisco':'san-francisco-san-jose',
             'st.louis':'st-louis','st. louis':'st-louis','raleigh':'raleigh-durham',
             'greensboro':'greensboro-winston-salem'}
for _r in read_csv('aliases.csv'):            # editable workbook-metro-name -> metro_slug map
    if _r.get('city') and _r.get('metro_slug'): METRO_ALIAS[_r['city'].strip().lower()]=_r['metro_slug'].strip()
def m2slug(name):
    k=str(name).strip().lower()
    return EXACT.get(k) or METRO_ALIAS.get(k)
# WWII merger seasons: one team hosted in two cities the same year
COMBINED_METRO_EXPAND={'phila-pit':'Philadelphia/Pittsburgh'}
TEAM_NAME_OVERRIDE={'carpitts':'Card-Pitt','steagles':'Steagles'}

# token map + city seeds for the non-BIG4 (IPL) path
name2slug={}
for m in metros:
    name2slug.setdefault(m['name'].lower(), m['slug'])
    for part in re.split(r'[\/\-–]', m['name']): name2slug.setdefault(part.strip().lower(), m['slug'])
city2slug={}
for lg in BIG4:
    for f in load(f'public/data/{lg}/franchises.json'):
        if f.get('city') and f.get('metro_slug'): city2slug.setdefault(f['city'].lower(), f['metro_slug'])

EXCLUDE={r['city'].lower() for r in read_csv('exclude.csv')}
CURATED=read_csv('curated.csv')
# Honor data for non-BIG4 defunct tiles. WNBA from its franchise JSON; club football
# (incl. MLS) from football/index.json totals, looked up by the href slug.
try: _FBIDX=load('public/data/football/index.json'); FBYSLUG={c['slug']:c for c in _FBIDX.get('clubs',[]) if isinstance(c,dict) and c.get('slug')}
except Exception: FBYSLUG={}
def football_stats(slug):
    c=FBYSLUG.get(slug)
    if not c: return None
    t=c.get('totals') or {}
    return {'champ':0,'div':0,'finals':0,'pct':0.0,'is_mls':bool(c.get('is_mls')),
            'mls_cups':int(t.get('mls_cups') or 0),'supporters_shields':int(t.get('supporters_shields') or 0),
            'cont_trophies':int(t.get('cont_trophies') or 0),'titles':int(t.get('titles') or 0),
            'major_cups':int(t.get('major_cups') or 0),'top_flight_seasons':int(c.get('top_flight_seasons') or 0)}
def wnba_stats(f):
    return {'champ':int(f.get('titles') or 0),'div':int(f.get('division_titles') or 0),
            'finals':int(f.get('finals') or 0),'pct':round(float(f.get('win_pct') or 0),3)}
OVERRIDES={(r['metro_slug'],r['href']):r for r in read_csv('overrides.csv')}
# Editorial: a title won on the field then revoked by the league. Surfaced as a title
# but flagged 'stolen' so the card can label it. The 1925 Pottsville Maroons (canonical
# 'Bulldogs (Boston)') are the case. Keyed (metro_slug, href) -> count.
STOLEN_TITLES={('pottsville','/teams/nfl/bulldogs-boston'):1}

skipped=[]
cards={}
def add(ms, league, name, years, href, kind, sport=None, stats=None):
    if not ms: return
    e={'metro':ms,'league':league,'sport':sport or SPORT.get(league,''),'name':name,'years':years,'href':href,'kind':kind}
    if stats is not None: e['stats']=stats
    cards[(ms,href)]=e
def yspan(rows):
    # Era name uses the DEPARTURE identity (city+team of the final season in this
    # metro), e.g. Brooklyn Dodgers / New York Giants, not the archaic arrival name
    # (Atlantics / Gothams). Year span still covers first..last season.
    rows=sorted(rows); lo,hi=rows[0][0],rows[-1][0]
    return (f"{lo}" if lo==hi else f"{lo}{EN}{hi}"), rows[-1][1], rows[-1][2]

def _league(lg):
    wbpath,yc,cc,tc,ncol,mcol=SRC[lg]
    if not wbpath:
        print(f"WARN: {lg} workbook not found; skipping {lg}", file=sys.stderr); return
    stints=defaultdict(lambda: defaultdict(list))   # canon -> metro_name -> [(year,city,team)]
    statacc=defaultdict(lambda: defaultdict(Counter))   # canon -> metro_name -> Counter of per-stint stat sums
    fyr={}; fmetro={}                               # canon -> latest year, and its last in-season metro (true final home)
    ws=openpyxl.load_workbook(wbpath, read_only=True, data_only=True)["Year by Year"]
    for i,row in enumerate(ws.iter_rows(values_only=True)):
        if i==0 or not row or len(row)<=max(ncol,mcol,tc): continue
        canon=str(row[ncol]).strip() if row[ncol] else ""
        try: yr=int(row[yc])
        except (TypeError,ValueError): yr=None
        if not canon or not yr: continue
        cities=str(row[cc]).split('/'); teams=str(row[tc]).split('/')
        metro_str=str(row[mcol] or ''); metro_str=COMBINED_METRO_EXPAND.get(metro_str.strip().lower(), metro_str)
        ms_list=metro_str.split('/')
        st=rowstats(lg,row); attributed=False
        for k in range(max(len(cities),len(teams),len(ms_list))):
            mt=(ms_list[k] if k<len(ms_list) else ms_list[-1]).strip()
            ct=(cities[k] if k<len(cities) else cities[-1]).strip()
            tm=(teams[k] if k<len(teams) else teams[-1]).strip()
            if not mt or mt.lower()=='none': continue
            stints[canon][mt].append((yr,ct,tm))
            if not attributed:   # season-level flags accrue once, to the first city played that year
                acc=statacc[canon][mt]
                for _k in ('w','l','t','otl','pts','champ','div','finals','other'): acc[_k]+=st[_k]
                attributed=True
        raw_ms=[x.strip() for x in ms_list if x.strip() and x.strip().lower()!='none']
        if raw_ms and yr>fyr.get(canon,-1): fyr[canon]=yr; fmetro[canon]=raw_ms[-1]
    active={}; defunct={}; bylast={}; founded_by={}
    def _last(th):
        toks=[t.strip() for t in re.split(r'/', re.sub(r'\s*\([^)]*\)','', th or '')) if t.strip()]
        return toks[-1].lower() if toks else None
    for f in load(f'public/data/{lg}/franchises.json'):
        active[str(f.get('canonical') or f.get('name')).strip()]=(f.get('slug'), f.get('metro_slug'))
        founded_by[f.get('slug')]=f.get('founded') or f.get('first_year')
        lt=_last(f.get('team_history'))
        if lt: bylast.setdefault(lt,(f.get('slug'), f.get('metro_slug'), False))
    for h in load(f'public/data/{lg}/historical.json'):
        hslug=h.get('slug') or slugify(h.get('canonical'))
        defunct[str(h.get('canonical') or h.get('name')).strip()]=(hslug, h.get('metro_slug'))
        founded_by[hslug]=h.get('founded') or h.get('first_year')
        lt=_last(h.get('team_history') or h.get('team_historical'))
        if lt: bylast.setdefault(lt,(hslug, h.get('metro_slug'), True))
    nojoin=[]; secjoin=[]
    for canon,played in stints.items():
        if canon in defunct: slug=defunct[canon][0]; is_def=True
        elif canon in active: slug=active[canon][0]; is_def=False
        else:
            sec=bylast.get(canon.lower())
            if not sec: nojoin.append(canon); continue
            slug,_,is_def=sec; secjoin.append(canon)
        home_ms=m2slug(fmetro.get(canon,'') or '')   # final stint = last in-season metro of the latest year
        href=f"/teams/{lg}/{slug}"
        founded=founded_by.get(slug)
        try: founded=int(founded)
        except (TypeError,ValueError): founded=None
        metro_min={mt:min(x[0] for x in rr) for mt,rr in played.items()}
        first_metro=min(metro_min, key=metro_min.get) if metro_min else None
        for mt,rws in played.items():
            ms=m2slug(mt)
            if not ms:
                skipped.append({'league':lg,'canonical':canon,'metro_name':mt,'reason':'metro not in canonical list'}); continue
            is_home=(ms==home_ms)
            if (not is_def) and is_home: continue       # active franchise's current home -> no tile
            years,city0,team0=yspan(rws)
            if mt==first_metro and founded and founded<metro_min[mt]:   # sheet omits pre-major-league seasons -> start at founding
                hi=max(x[0] for x in rws)
                years=f"{founded}" if founded==hi else f"{founded}{EN}{hi}"
            stv=finalize_stats(lg,statacc[canon][mt]) if statacc[canon].get(mt) else None
            ovn=TEAM_NAME_OVERRIDE.get(team0.lower())
            if ovn:
                add(ms,lg,ovn,years,href,"defunct",stats=stv)
            else:
                add(ms,lg,f"{city0} {team0}",years,href,"defunct" if (is_def and is_home) else "relocated",stats=stv)
    if secjoin: print(f"  {lg}: joined by final-name fallback -> {secjoin[:12]}", file=sys.stderr)
    if nojoin: print(f"  {lg}: {len(nojoin)} canon(s) still unjoined -> {nojoin[:12]}", file=sys.stderr)

for _lg in BIG4:
    try: _league(_lg)
    except Exception as _e: print(f"WARN: {_lg} skipped this run: {_e}", file=sys.stderr)

for f in load('public/data/wnba/data.json')['franchises']:
    if f.get('defunct') and f.get('metro_slug'):
        add(f['metro_slug'],'wnba',f['name'],f"{f.get('first_season') or ''}{EN}{f.get('last_season') or ''}".strip(EN),f"/teams/wnba/{f['slug']}","defunct",stats=wnba_stats(f))
for f in load('public/data/ipl/data.json')['franchises']:
    if not f.get('active'):
        ms=f.get('metro') and (city2slug.get(f['metro'].lower()) or name2slug.get(f['metro'].lower()))
        if not ms: skipped.append({'league':'ipl','name':f['name'],'city':f.get('metro'),'reason':'no metro match'}); continue
        add(ms,'ipl',f['name'],'',f"/teams/ipl/{f['slug']}","defunct")
for f in load('public/data/cfl/data.json')['franchises']:
    if (not f.get('active')) and f.get('metro_slug'):
        _cst={'champ':f.get('grey_cups',0),'div':0,'finals':f.get('gc_finals',0),'pct':f.get('win_pct',0.0)}
        add(f['metro_slug'],'cfl',f['name'],f"{f.get('first_year','')}{EN}{f.get('last_year','')}",f"/teams/cfl/{f['slug']}","defunct",stats=_cst)
for _lg in ('afl','nrl'):
    for f in load(f'public/data/{_lg}/data.json')['franchises']:
        if (not f.get('active')) and f.get('metro_slug'):
            _fst={'prem':f.get('premierships',0),'minor':f.get('minor_premierships',0),'seasons':f.get('seasons',0),'gf':f.get('gf_apps',0),'pct':f.get('win_pct',0.0)}
            add(f['metro_slug'],_lg,f['name'],f"{f.get('first_year','')}{EN}{f.get('last_year','')}",f"/teams/{_lg}/{f['slug']}","defunct",stats=_fst)

for r in CURATED:
    if r.get('metro_slug') and r.get('href'):
        _lg=r.get('league','football'); _fst=football_stats(r['href'].rsplit('/',1)[-1]) if _lg=='football' else None
        add(r['metro_slug'],_lg,r['name'],r.get('years',''),r['href'],r.get('kind','relocated'),r.get('sport'),stats=_fst)

defunct_hrefs=set()
for lg in BIG4:
    try: _hs=load(f'public/data/{lg}/historical.json')
    except Exception as _e: print(f"WARN: {lg} historical unreadable this run: {_e}", file=sys.stderr); _hs=[]
    for h in _hs:
        defunct_hrefs.add(f"/teams/{lg}/{h.get('slug') or slugify(h.get('canonical'))}")
for f in load('public/data/wnba/data.json')['franchises']:
    if f.get('defunct'): defunct_hrefs.add(f"/teams/wnba/{f['slug']}")
for f in load('public/data/ipl/data.json')['franchises']:
    if not f.get('active'): defunct_hrefs.add(f"/teams/ipl/{f['slug']}")
for f in load('public/data/cfl/data.json')['franchises']:
    if not f.get('active'): defunct_hrefs.add(f"/teams/cfl/{f['slug']}")
for _lg in ('afl','nrl'):
    for f in load(f'public/data/{_lg}/data.json')['franchises']:
        if not f.get('active'): defunct_hrefs.add(f"/teams/{_lg}/{f['slug']}")
for (ms,href),c in cards.items():
    ov=OVERRIDES.get((ms,href))
    if ov:
        if ov.get('name'): c['name']=ov['name']
        if ov.get('years'): c['years']=ov['years']
    c['relocated']=(c['kind']=='relocated'); c['defunct']=(href in defunct_hrefs) or (c['kind']=='defunct')
    sct=STOLEN_TITLES.get((ms,href))
    if sct and isinstance(c.get('stats'),dict):
        c['stats']['champ']=c['stats'].get('champ',0)+sct
        c['stats']['stolen']=c['stats'].get('stolen',0)+sct

def _ly(c):
    ys=re.findall(r'\d{4}', c.get('years','') or ''); return int(ys[-1]) if ys else 0
out=defaultdict(list)
for c in cards.values():
    d={k:c[k] for k in ('league','sport','name','years','href','kind','relocated','defunct')}
    if 'stats' in c: d['stats']=c['stats']
    out[c['metro']].append(d)
for ms in out: out[ms].sort(key=lambda c:(-_ly(c), c['name']))
out={k:out[k] for k in sorted(out)}
open(OUT,'w',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=0))
open(SKIPPED,'w',encoding='utf-8').write(json.dumps(skipped,ensure_ascii=False,indent=2))
tot=sum(len(v) for v in out.values())
print(f"relocations-by-metro.json: {tot} tiles / {len(out)} metros | {dict(Counter(c['league'] for v in out.values() for c in v))}")
print(f"skipped (bring to user): {len(skipped)} -> {sorted({s.get('metro_name') or s.get('city') for s in skipped})[:40]}")
