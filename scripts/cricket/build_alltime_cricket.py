#!/usr/bin/env python3
"""All-time international cricket spine: Kaggle (Tests 1877+, ODIs 1971+) + cricsheet
(post-Kaggle tail + all T20I/IT20/ODM + depth flag). Join on ESPN match id."""
import pandas as pd, json, collections, re

O='/sessions/magical-tender-noether/mnt/outputs/cricket'
cs=json.load(open(f'{O}/matches.json'))
cs_by_id={r['id']: r for r in cs}

def norm_team(x): return {'U.S.A.':'United States of America','U.A.E.':'United Arab Emirates'}.get(x,x)

spine=[]
# --- Kaggle Tests ---
t=pd.read_csv('/sessions/magical-tender-noether/mnt/archive (2)/test_Matches_Data.csv', low_memory=False)
for _,r in t.iterrows():
    mid=str(r['Match ID'])
    res=str(r['Match Result Text'] or '')
    spine.append({'id':mid,'fmt':'Test','no':int(r['TEST Match No']),'date':str(r['Match Start Date']),
        't1':norm_team(r['Team1 Name']),'t2':norm_team(r['Team2 Name']),
        'winner':norm_team(r['Match Winner']) if pd.notna(r['Match Winner']) else None,
        'result':('tie' if 'tied' in res.lower() else 'draw' if 'drawn' in res.lower() else None) if pd.isna(r['Match Winner']) else None,
        'result_text':res,'venue':r['Match Venue (Stadium)'],'city':r['Match Venue (City)'],
        'vcountry':r['Match Venue (Country)'],'src':'kaggle','depth':mid in cs_by_id})
# --- Kaggle ODIs ---
o=pd.read_csv('/sessions/magical-tender-noether/mnt/archive (3)/odi_Matches_Data.csv', low_memory=False)
for _,r in o.iterrows():
    mid=str(r['Match ID'])
    res=str(r['Match Result Text'] or '')
    rl=res.lower()
    spine.append({'id':mid,'fmt':'ODI','no':int(r['ODI Match No']),'date':str(r['Match Date']),
        't1':norm_team(r['Team1 Name']),'t2':norm_team(r['Team2 Name']),
        'winner':norm_team(r['Match Winner']) if pd.notna(r['Match Winner']) else None,
        'result':('tie' if 'tied' in rl else 'no result' if ('no result' in rl or 'abandon' in rl) else None) if pd.isna(r['Match Winner']) else None,
        'result_text':res,'venue':r['Match Venue (Stadium)'],'city':r['Match Venue (City)'],
        'vcountry':r['Match Venue (Country)'],'src':'kaggle','depth':mid in cs_by_id})

kg_ids={s['id'] for s in spine}
kg_max={'Test':max(s['date'] for s in spine if s['fmt']=='Test'),
        'ODI':max(s['date'] for s in spine if s['fmt']=='ODI' and re.match(r'\d{4}',s['date']))}

# --- cricsheet: T20I/IT20/ODM all; Test/ODI only if not in kaggle (the tail) ---
added=collections.Counter(); overlap_missed=collections.Counter()
for r in cs:
    if r['team_type']!='international': continue
    f=r['match_type']
    if f in ('T20','IT20','ODM'):
        fmt={'T20':'T20I'}.get(f,f)
        spine.append({'id':r['id'],'fmt':fmt,'no':None,'date':r['date'],'t1':r['teams'][0],'t2':r['teams'][1],
            'winner':r['winner'],'result':r['result'],'result_text':None,'venue':r['venue'],'city':r['city'],
            'vcountry':None,'src':'cricsheet','depth':True})
        added[fmt]+=1
    elif f in ('Test','ODI') and r['id'] not in kg_ids:
        if r['date'] > kg_max[f]:
            spine.append({'id':r['id'],'fmt':f,'no':None,'date':r['date'],'t1':r['teams'][0],'t2':r['teams'][1],
                'winner':r['winner'],'result':r['result'],'result_text':None,'venue':r['venue'],'city':r['city'],
                'vcountry':None,'src':'cricsheet-tail','depth':True})
            added[f+'-tail']+=1
        else:
            overlap_missed[f]+=1  # cricsheet has it, kaggle doesn't, within kaggle window — investigate

json.dump(spine, open(f'{O}/alltime-spine.json','w'), ensure_ascii=False, separators=(',',':'))
print('spine total:', len(spine))
print('by fmt:', dict(collections.Counter(s['fmt'] for s in spine)))
print('added from cricsheet:', dict(added))
print('cricsheet-only within kaggle window (anomalies):', dict(overlap_missed))
depth=collections.Counter((s['fmt'], s['depth']) for s in spine)
for f in ('Test','ODI','T20I'):
    tot=depth[(f,True)]+depth[(f,False)]
    print(f'{f}: {tot} matches, ball-by-ball depth for {depth[(f,True)]} ({depth[(f,True)]/tot:.0%})')
