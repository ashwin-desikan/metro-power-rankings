#!/usr/bin/env python3
"""Phase 1: national-teams cricket dataset from cricsheet match-level extract.
Formats: Test, ODI, T20 (T20I), IT20, ODM. Home/away via city->metro->country."""
import json, collections

O='/sessions/magical-tender-noether/mnt/outputs/cricket'
rows=json.load(open(f'{O}/matches.json'))
matched={m['city']: m['metro'] for m in json.load(open(f'{O}/city_metro_matched.json'))}
WX=json.load(open('/tmp/workbook_extract.json'))
metro_country={m['metro']: m['country'] for m in WX['metros']}
metro_country['Dharamshala']='India'  # user-approved new metro, row pending in master

CARIB={'Antigua & Barbuda','Barbados','Dominica','Grenada','Guyana','Jamaica','Saint Lucia',
       'St. Kitts & Nevis','St. Vincent & the Grenadines','Trinidad & Tobago'}
def home_countries(team):
    if team=='West Indies': return CARIB
    if team in ('England','Scotland','Wales'): return {'United Kingdom'}
    if team=='United States of America': return {'United States'}
    if team=='U.A.E.' or team=='United Arab Emirates': return {'United Arab Emirates'}
    return {team}

FORMATS=('Test','ODI','T20','IT20','ODM')
intl=[r for r in rows if r['team_type']=='international' and r['match_type'] in FORMATS]

def venue_country(r):
    metro = matched.get((r['city'] or '').strip())
    return metro_country.get(metro) if metro else None

teams=collections.defaultdict(lambda: {f: {'P':0,'W':0,'L':0,'D':0,'T':0,'NR':0,
        'home':[0,0],'away':[0,0],'neutral':[0,0],  # [W, P]
        'by_year':collections.defaultdict(lambda:[0,0]),
        'last10':[], 'biggest_runs':None,'biggest_wkts':None} for f in FORMATS})
h2h=collections.defaultdict(lambda: collections.defaultdict(lambda: {'P':0,'W':0,'L':0,'D':0,'T':0,'NR':0}))
venues=collections.defaultdict(lambda: collections.Counter())

for r in sorted(intl, key=lambda x: x['date'] or ''):
    f=r['match_type']; ts=r['teams'] or []
    if len(ts)!=2: continue
    vc=venue_country(r); yr=(r['date'] or '?')[:4]
    win=r['winner']; res=r['result']
    for t in ts:
        opp=ts[1] if t==ts[0] else ts[0]
        d=teams[t][f]; d['P']+=1
        d['by_year'][yr][1]+=1
        hc=home_countries(t)
        loc='neutral' if not vc else ('home' if vc in hc else ('away' if vc in home_countries(opp) else 'neutral'))
        d[loc][1]+=1
        k=h2h[t][opp] if f=='__' else h2h[f'{t}|{f}'][opp]; k['P']+=1
        if win==t:
            d['W']+=1; d['by_year'][yr][0]+=1; d[loc][0]+=1; d['last10'].append('W'); k['W']+=1
            if r['by_runs'] and (not d['biggest_runs'] or r['by_runs']>d['biggest_runs']['by']):
                d['biggest_runs']={'by':r['by_runs'],'opp':opp,'date':r['date'],'venue':r['venue'],'id':r['id']}
            if r['by_wickets'] and (not d['biggest_wkts'] or r['by_wickets']>d['biggest_wkts']['by']):
                d['biggest_wkts']={'by':r['by_wickets'],'opp':opp,'date':r['date'],'venue':r['venue'],'id':r['id']}
        elif win==opp: d['L']+=1; d['last10'].append('L'); k['L']+=1
        elif res=='draw': d['D']+=1; d['last10'].append('D'); k['D']+=1
        elif res=='tie' or r['eliminator']: d['T']+=1; d['last10'].append('T'); k['T']+=1
        else: d['NR']+=1; d['last10'].append('N'); k['NR']+=1
        d['last10']=d['last10'][-10:]
    venues[r['venue']][f]+=1

venue_meta={}
vm=json.load(open(f'{O}/venue_teamlist_map.json'))
tl_map={x['cricsheet_venue']: x for x in vm['matched']}
for v in venues:
    venue_meta[v]={'formats':dict(venues[v]),
                   'teamlist': tl_map[v]['teamlist_venue'] if v in tl_map else None,
                   'metro': tl_map[v]['metro'] if v in tl_map else None}

out={'generated':'2026-06-10','source':'cricsheet all_male_json (Afghanistan men + APL withheld upstream — all opponent records exclude those fixtures)',
     'teams':{}, 'h2h':{}, 'venues':venue_meta}
for t,fs in teams.items():
    out['teams'][t]={}
    for f,d in fs.items():
        if d['P']==0: continue
        out['teams'][t][f]={k:v for k,v in d.items() if k!='by_year'} | {'by_year':{y:c for y,c in sorted(d['by_year'].items())}}
for k,v in h2h.items():
    out['h2h'][k]=dict(v)
json.dump(out, open(f'{O}/national-cricket.json','w'), ensure_ascii=False, separators=(',',':'))

full=[t for t,fs in teams.items() if fs['Test']['P']>0]
print(f"teams: {len(teams)} total, {len(full)} Test nations | intl matches used: {len(intl)}")
for t in sorted(full, key=lambda t:-teams[t]['Test']['P']):
    d=teams[t]['Test']; o=teams[t]['ODI']; tw=teams[t]['T20']
    print(f"{t:<14} Test {d['W']}-{d['L']}-{d['D']}/{d['P']}  ODI {o['W']}-{o['L']}/{o['P']}  T20I {tw['W']}-{tw['L']}/{tw['P']}  form {''.join(teams[t]['Test']['last10'])}")
import os; print('size: %.1f KB' % (os.path.getsize(f'{O}/national-cricket.json')/1e3))
