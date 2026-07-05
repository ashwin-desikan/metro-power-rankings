#!/usr/bin/env python3
"""Merge Jolpica-F1 API JSON into the canonical CSVs in ./data.
Drop one or more Jolpica responses into ./data/_incoming/ (any of:
  results, sprint, qualifying, driverStandings, constructorStandings)
then run:  python3 f1_update.py
Idempotent: re-running with the same files is a no-op. After it runs, call f1_build.py."""
import pandas as pd, json, os, glob
from f1_source import read_df, write_df

BASE=os.path.dirname(os.path.abspath(__file__)); D=os.path.join(BASE,'data'); INC=os.path.join(D,'_incoming')
def P(f): return os.path.join(D,f)
def load(f): return read_df(f, csv_dir=D)
def races_of(j): return j.get('MRData',{}).get('RaceTable',{}).get('Races',[])
def standings_of(j): return j.get('MRData',{}).get('StandingsTable',{}).get('StandingsLists',[])

res_rows=[]; spr_rows=[]; pole_rows=[]; dstand=[]; cstand=[]; spine_facts={}
ref_drivers={}; ref_constructors={}
def fullname(dr): return (dr.get('givenName','')+' '+dr.get('familyName','')).strip()

def reg_driver(dr):
    if dr and dr.get('driverId'):
        ref_drivers[dr['driverId']]={'driver_id':dr['driverId'],'driver':fullname(dr),'code':dr.get('code'),
            'permanent_number':dr.get('permanentNumber'),'dob':dr.get('dateOfBirth'),
            'nationality':dr.get('nationality'),'wikipedia':dr.get('url')}
def reg_constructor(co):
    if co and co.get('constructorId'):
        ref_constructors[co['constructorId']]={'constructor_id':co['constructorId'],'constructor':co.get('name'),
            'nationality':co.get('nationality'),'wikipedia':co.get('url')}


for path in sorted(glob.glob(os.path.join(INC,'*.json'))):
    j=json.load(open(path,encoding='utf-8'))
    for R in races_of(j):
        season=int(R['season']); rnd=int(R['round']); rname=R['raceName']
        loc=R.get('Circuit',{}).get('Location',{}); circ=R.get('Circuit',{})
        sf=spine_facts.setdefault((season,rnd),{'Grand Prix':rname,'Date':R.get('date'),
            'Circuit':circ.get('circuitName'),'circuit_id':circ.get('circuitId'),
            'City':loc.get('locality'),'Country':loc.get('country')})
        if 'Results' in R:
            for i,r in enumerate(R['Results']):
                reg_driver(r['Driver']); reg_constructor(r['Constructor'])
                res_rows.append({'season':season,'round':rnd,'race_name':rname,
                    'driver_id':r['Driver']['driverId'],'driver':fullname(r['Driver']),
                    'constructor_id':r['Constructor']['constructorId'],'constructor':r['Constructor']['name'],
                    'grid':r.get('grid'),'position':r.get('positionText'),'finish_order':i+1,
                    'points':r.get('points'),'laps':r.get('laps'),'time_gap':r.get('Time',{}).get('time'),
                    'status':r.get('status'),'fastest_lap_time':r.get('FastestLap',{}).get('Time',{}).get('time'),
                    'fastest_lap_speed':r.get('FastestLap',{}).get('AverageSpeed',{}).get('speed')})
                if r.get('positionText')=='1': sf['Winner']=fullname(r['Driver']); sf['Laps']=r.get('laps')
                if str(r.get('FastestLap',{}).get('rank'))=='1': sf['Fastest Lap']=fullname(r['Driver'])
            sf['Starters']=len(R['Results'])
        if 'SprintResults' in R:
            for i,r in enumerate(R['SprintResults']):
                reg_driver(r['Driver']); reg_constructor(r['Constructor'])
                spr_rows.append({'season':season,'round':rnd,'race_name':rname,
                    'driver_id':r['Driver']['driverId'],'driver':fullname(r['Driver']),
                    'constructor_id':r['Constructor']['constructorId'],'constructor':r['Constructor']['name'],
                    'grid':r.get('grid'),'position':r.get('positionText'),'finish_order':i+1,
                    'points':r.get('points'),'laps':r.get('laps'),'time_gap':r.get('Time',{}).get('time'),
                    'status':r.get('status'),'fastest_lap_time':r.get('FastestLap',{}).get('Time',{}).get('time')})
        if 'QualifyingResults' in R:
            for r in R['QualifyingResults']:
                reg_driver(r['Driver']); reg_constructor(r['Constructor'])
                if r.get('position')=='1':
                    pole_rows.append({'season':season,'round':rnd,'race_name':rname,'pole_driver':fullname(r['Driver'])})
                    sf['Pole']=fullname(r['Driver'])
    for S in standings_of(j):
        season=int(S['season']); rnd=int(S['round'])
        for r in S.get('DriverStandings',[]):
            reg_driver(r['Driver'])
            [reg_constructor(c) for c in r.get('Constructors',[])]
            dstand.append({'season':season,'round':rnd,'driver_id':r['Driver']['driverId'],
                'position':r.get('position'),'points':r.get('points'),'wins':r.get('wins')})
        for r in S.get('ConstructorStandings',[]):
            cstand.append({'season':season,'round':rnd,'constructor_id':r['Constructor']['constructorId'],
                'position':r.get('position'),'points':r.get('points'),'wins':r.get('wins')})

def upsert(fn,new_rows,keys):
    if not new_rows: return 0
    cur=load(fn); new=pd.DataFrame(new_rows)
    for c in cur.columns:
        if c not in new.columns: new[c]=pd.NA
    new=new[cur.columns]
    merged=pd.concat([cur,new],ignore_index=True).drop_duplicates(subset=keys,keep='last')
    merged=merged.sort_values([k for k in ['season','round','finish_order','position'] if k in merged.columns])
    write_df(fn, merged, csv_dir=D); return len(new)

n_res=upsert('results.csv',res_rows,['season','round','driver_id'])
n_spr=upsert('sprint_results.csv',spr_rows,['season','round','driver_id'])
n_pol=upsert('poles.csv',pole_rows,['season','round'])

# standings: replace the affected (season) rows with the latest snapshot, keep schema season,round,<id>,position,points,wins
def upsert_standings(fn,rows,idc):
    if not rows: return 0
    cur=load(fn); new=pd.DataFrame(rows)[['season','round',idc,'position','points','wins']]
    cur.columns=[c.strip() for c in cur.columns]
    # drop existing rows for the seasons present in new, then append
    seas=set(new['season']); cur=cur[~cur['season'].astype(int).isin(seas)]
    out=pd.concat([cur,new],ignore_index=True).sort_values(['season','position'])
    write_df(fn, out, csv_dir=D); return len(new)
n_ds=upsert_standings('driver_standings.csv',dstand,'driver_id')
n_cs=upsert_standings('constructor_standings.csv',cstand,'constructor_id')

# race_meta: add any new (season,round)
meta=load('race_meta.csv'); have=set(zip(meta['season'].astype(int),meta['round'].astype(int))); add=[]
for (s,r),sf in spine_facts.items():
    if (s,r) not in have:
        add.append({'season':s,'round':r,'race_name':sf['Grand Prix'],'circuit_id':sf.get('circuit_id'),
                    'country':sf.get('Country'),'locality':sf.get('City'),'date':sf.get('Date')})
if add:
    meta=pd.concat([meta,pd.DataFrame(add)],ignore_index=True).drop_duplicates(['season','round'],keep='last').sort_values(['season','round'])
    write_df('race_meta.csv', meta, csv_dir=D)

# race_tracks spine: fill existing rows + append new races (carry Metro Area by circuit_id)
rt=load('race_tracks.csv'); rt['Season']=rt['Season'].astype(int); rt['Race']=rt['Race'].astype(int)
metro_by_circuit={}
m2=load('race_meta.csv')
key2cid={(int(a),int(b)):c for a,b,c in zip(m2['season'],m2['round'],m2['circuit_id'])}
for _,row in rt.iterrows():
    cid=key2cid.get((int(row['Season']),int(row['Race'])))
    if cid and pd.notna(row.get('Metro Area')): metro_by_circuit.setdefault(cid,row.get('Metro Area'))
filled=appended=0
idx={(int(s),int(r)):i for i,(s,r) in enumerate(zip(rt['Season'],rt['Race']))}
new_spine=[]
for (s,r),sf in sorted(spine_facts.items()):
    if (s,r) in idx:
        i=idx[(s,r)]
        for col in ['Winner','Pole','Fastest Lap','Laps','Starters']:
            v=sf.get(col)
            if v is not None and (pd.isna(rt.at[i,col]) if col in rt.columns else True):
                if col in rt.columns and (pd.isna(rt.at[i,col]) or str(rt.at[i,col]).strip()==''):
                    rt.at[i,col]=v; filled+=1
    else:
        cid=sf.get('circuit_id')
        row={c:pd.NA for c in rt.columns}
        row.update({'Season':s,'Race':r,'Grand Prix':sf.get('Grand Prix'),'Date':sf.get('Date'),
            'Circuit':sf.get('Circuit'),'City':sf.get('City'),'Country':sf.get('Country'),
            'Winner':sf.get('Winner'),'Pole':sf.get('Pole'),'Fastest Lap':sf.get('Fastest Lap'),
            'Laps':sf.get('Laps'),'Starters':sf.get('Starters'),
            'Metro Area':metro_by_circuit.get(cid,pd.NA)})
        new_spine.append(row); appended+=1
if new_spine: rt=pd.concat([rt,pd.DataFrame(new_spine)],ignore_index=True)
write_df('race_tracks.csv', rt.sort_values(['Season','Race']), csv_dir=D)


def upsert_ref(fn,rows_map,key):
    if not rows_map: return 0
    cur=load(fn); new=pd.DataFrame(list(rows_map.values()))
    for c in cur.columns:
        if c not in new.columns: new[c]=pd.NA
    new=new[cur.columns]
    merged=pd.concat([cur,new],ignore_index=True).drop_duplicates(subset=[key],keep='last').sort_values(key)
    write_df(fn, merged, csv_dir=D); return len(rows_map)
n_dref=upsert_ref('drivers.csv',ref_drivers,'driver_id')
n_cref=upsert_ref('constructors.csv',ref_constructors,'constructor_id')

print(f'Merged: results +{n_res}, sprint +{n_spr}, poles +{n_pol}, driverStand {n_ds}, constructorStand {n_cs}')
print(f'Spine: filled {filled} cells, appended {appended} new race rows')
print(f'Reference upserts seen: drivers {n_dref}, constructors {n_cref}')
print('Now run: python3 f1_build.py')
