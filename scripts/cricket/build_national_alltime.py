#!/usr/bin/env python3
"""All-time national team records from the merged spine."""
import json, collections, re
O='/sessions/magical-tender-noether/mnt/outputs/cricket'
spine=json.load(open(f'{O}/alltime-spine.json'))
matched={m['city']: m['metro'] for m in json.load(open(f'{O}/city_metro_matched.json'))}
WX=json.load(open('/tmp/workbook_extract.json'))
metro_country={m['metro']: m['country'] for m in WX['metros']}; metro_country['Dharamshala']='India'
CARIB={'Antigua & Barbuda','Barbados','Dominica','Grenada','Guyana','Jamaica','Saint Lucia','St. Kitts & Nevis','St. Vincent & the Grenadines','Trinidad & Tobago','Antigua','West Indies'}
def homes(team):
    if team=='West Indies': return CARIB
    if team in ('England','Scotland','Wales'): return {'United Kingdom','England','Scotland','Wales'}
    if team=='United States of America': return {'United States'}
    return {team}
def vcountry(s):
    if s['vcountry'] and isinstance(s['vcountry'],str): return s['vcountry']
    c=s['city'] if isinstance(s['city'],str) else ''
    m=matched.get(c.strip()); return metro_country.get(m) if m else None

FMT=('Test','ODI','T20I','IT20','ODM')
T=collections.defaultdict(lambda:{f:{'P':0,'W':0,'L':0,'D':0,'T':0,'NR':0,'home':[0,0],'away':[0,0],'neutral':[0,0],
   'by_year':collections.defaultdict(lambda:[0,0]),'last10':[],'first':None,'last':None} for f in FMT})
H=collections.defaultdict(lambda:collections.defaultdict(lambda:{'P':0,'W':0,'L':0,'D':0,'T':0,'NR':0}))
for s in sorted(spine,key=lambda x:x['date'] if isinstance(x['date'],str) else ''):
    f=s['fmt']; 
    if f not in FMT: continue
    vc=vcountry(s); yr=s['date'][:4] if isinstance(s['date'],str) and re.match(r'\d{4}',s['date']) else '?'
    for t,opp in ((s['t1'],s['t2']),(s['t2'],s['t1'])):
        d=T[t][f]; d['P']+=1; d['by_year'][yr][1]+=1
        d['first']=d['first'] or s['date']; d['last']=s['date']
        loc='neutral' if not vc else ('home' if vc in homes(t) else ('away' if vc in homes(opp) else 'neutral'))
        d[loc][1]+=1
        k=H[f'{t}|{f}'][opp]; k['P']+=1
        if s['winner']==t: d['W']+=1; d[loc][0]+=1; d['by_year'][yr][0]+=1; d['last10'].append('W'); k['W']+=1
        elif s['winner']==opp: d['L']+=1; d['last10'].append('L'); k['L']+=1
        elif s['result']=='draw': d['D']+=1; d['last10'].append('D'); k['D']+=1
        elif s['result']=='tie': d['T']+=1; d['last10'].append('T'); k['T']+=1
        else: d['NR']+=1; d['last10'].append('N'); k['NR']+=1
        d['last10']=d['last10'][-10:]
out={'generated':'2026-06-10','spine':'kaggle(1877/1971-2024.03)+cricsheet tail; T20I/IT20/ODM cricsheet',
     'caveats':['cricsheet tail may lack Afghanistan fixtures after Mar 2024','England/Scotland share UK home'],
     'teams':{t:{f:{k:(dict(sorted(v.items())) if k=='by_year' else v) for k,v in fs.items() if fs[f]['P']>0 or k}
                 for f,fs2 in [(f,fs[f]) for f in FMT if fs[f]['P']>0] for k,v in [(k,fs[f][k]) for k in fs[f]]}
             for t,fs in T.items()},
     'h2h':{k:dict(v) for k,v in H.items()}}
# simpler teams serialization
out['teams']={t:{f:{**{k:v for k,v in fs[f].items() if k!='by_year'},'by_year':dict(sorted(fs[f]['by_year'].items()))}
                 for f in FMT if fs[f]['P']>0} for t,fs in T.items()}
json.dump(out,open(f'{O}/national-cricket-alltime.json','w'),ensure_ascii=False,separators=(',',':'))
import os
print('teams:',len(out['teams']),'| size: %.1f KB'%(os.path.getsize(f'{O}/national-cricket-alltime.json')/1e3))
print('\n--- sanity: all-time ---')
a=out['h2h']['Australia|Test']['England']; print('Ashes all-time (Aus view):',a)
e=out['teams']['England']['Test']; print(f"England Tests: P{e['P']} W{e['W']} L{e['L']} D{e['D']} (1877-)")
i=out['teams']['India']['ODI']; print(f"India ODIs: P{i['P']} W{i['W']} L{i['L']} NR{i['NR']} T{i['T']}")
w=out['teams']['West Indies']['Test']; print(f"WI Tests: P{w['P']} W{w['W']} L{w['L']} D{w['D']} | home {w['home']} away {w['away']}")
z=out['h2h']['India|ODI']['Pakistan']; print('IND-PAK ODI all-time:',z)
