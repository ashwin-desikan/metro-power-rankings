# -*- coding: utf-8 -*-
"""Append the 2025 FIFA Club World Cup (summer, USA, 63 matches) to Ashwin's authoritative
cupresults93_23_primary.txt in the file's own 79-column format, one row per club-per-match
(both sides), Season 2024-25 / Seas 2025. Preview by default; pass --write to append.

The pipeline (extract_cup_fixtures.py -> cupfix -> regen_shipped_clubs.py) then folds these into
the 2024-25 hub's club form exactly like the historical CWC editions. Only the essential columns
(comp, Cup Games, names, goals, W/D/L, Seas) drive the fold; the rest mirror the file's existing
FIFA Club World Cup rows for fidelity. Draws use the file's 'T' convention. No penalty shootouts
occurred in the 2025 knockout bracket, so every W/D/L is goals-based."""
import json, os, csv, sys, shutil, datetime, unicodedata

def asciify(s):
    # extract_cup_fixtures reads the file utf-8/errors=replace, so accented names (Atletico) mangle
    # and fail the norm() fold-join. Write these rows ASCII-only so the round-trip is lossless and the
    # fold matches the hub universe exactly (api itself spells these clubs ASCII).
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()

SC   = r"C:\Users\ashwi\Desktop\Projects\Metro Area Project\scripts\apifootball\_scratch\cwc2025.json"
TEAMJSON = r"C:\Users\ashwi\Desktop\Projects\Metro Area Project\scripts\apifootball\_scratch\football_team.json"
SRC  = r"C:\Users\ashwi\Desktop\New folder (2)\cupresults93_23_primary.txt"
BYID = {}   # team_id -> football_team row (loaded in main); names use canonical_name so the fold's norm() join matches the hub universe

# club -> (Metro Area, Country, Continent). Country/Continent as used elsewhere in the file.
CLUB = {
 'Al Ahly':('Cairo','Egypt','Africa'), 'Inter Miami':('Miami','USA','North America'),
 'Bayern München':('Munich','Germany','Europe'), 'Auckland City':('Auckland','New Zealand','Oceania'),
 'Paris Saint Germain':('Paris','France','Europe'), 'Atletico Madrid':('Madrid','Spain','Europe'),
 'Palmeiras':('São Paulo','Brazil','South America'), 'FC Porto':('Porto','Portugal','Europe'),
 'Botafogo':('Rio de Janeiro','Brazil','South America'), 'Seattle Sounders':('Seattle','USA','North America'),
 'Chelsea':('London','England','Europe'), 'Los Angeles FC':('Los Angeles','USA','North America'),
 'Boca Juniors':('Buenos Aires','Argentina','South America'), 'Benfica':('Lisbon','Portugal','Europe'),
 'Flamengo':('Rio de Janeiro','Brazil','South America'), 'ES Tunis':('Tunis','Tunisia','Africa'),
 'Fluminense':('Rio de Janeiro','Brazil','South America'), 'Borussia Dortmund':('Dortmund','Germany','Europe'),
 'River Plate':('Buenos Aires','Argentina','South America'), 'Urawa':('Saitama','Japan','Asia'),
 'Ulsan Hyundai FC':('Ulsan','South Korea','Asia'), 'Mamelodi Sundowns':('Pretoria','South Africa','Africa'),
 'Monterrey':('Monterrey','Mexico','North America'), 'Inter':('Milan','Italy','Europe'),
 'Manchester City':('Manchester','England','Europe'), 'Wydad AC':('Casablanca','Morocco','Africa'),
 'Real Madrid':('Madrid','Spain','Europe'), 'Al-Hilal Saudi FC':('Riyadh','Saudi Arabia','Asia'),
 'CF Pachuca':('Pachuca','Mexico','North America'), 'Red Bull Salzburg':('Salzburg','Austria','Europe'),
 'Al Ain':('Al Ain','UAE','Asia'), 'Juventus':('Turin','Italy','Europe'),
}
RND = {'Group Stage - 1':'Group Stage','Group Stage - 2':'Group Stage','Group Stage - 3':'Group Stage',
       '8th Finals':'Round of 16','Quarter-finals':'Quarterfinals','Semi-finals':'Semifinals','Final':'Final'}
NCOL = 79

def blankrow():
    return [''] * NCOL

def canon(side_team):
    r = BYID.get(side_team['id'])
    return (r.get('canonical_name') or side_team['name']) if r else side_team['name']

def build_side(f, me_home):
    t = f['teams']; g = f['goals']
    home_api, away_api = t['home']['name'], t['away']['name']
    home, away = canon(t['home']), canon(t['away'])   # canonical names for the fold join
    gh, ga = g['home'], g['away']
    if me_home: me, opp, gf, gag, me_api, opp_api = home, away, gh, ga, home_api, away_api
    else:       me, opp, gf, gag, me_api, opp_api = away, home, ga, gh, away_api, home_api
    d = f['fixture']['date'][:10]
    Y, M, D = int(d[:4]), int(d[5:7]), int(d[8:10])
    rnd = RND[f['league']['round']]
    res = 'W' if gf > gag else ('L' if gf < gag else 'T')   # file convention: T for draw
    W, Dr, L = (1,0,0) if res=='W' else ((0,1,0) if res=='T' else (0,0,1))
    pts = 3 if res=='W' else (1 if res=='T' else 0)
    mmetro, mctry, mcont = CLUB.get(me_api, ('', '', ''))
    ometro, octry, ocont = CLUB.get(opp_api, ('', '', ''))
    ven = f['fixture']['venue']; stad = ven.get('name') or ''
    city = (ven.get('city') or '')
    stad_metro = city.split(',')[0].strip()
    is_final = (rnd == 'Final')
    r = blankrow()
    r[0]=str(M); r[1]=str(D); r[2]=str(Y); r[3]='World'; r[4]='2024-25'
    r[5]='FIFA Club World Cup'; r[7]=rnd; r[9]=f"{M}/{D}/{Y}"
    r[10]=me; r[11]=res; r[12]=opp; r[13]=str(gf); r[14]=str(gag)
    r[15]=stad; r[16]=stad_metro; r[17]='USA'
    r[22]=str(W); r[23]=str(Dr); r[24]=str(L); r[25]=str(pts); r[26]=str(gf); r[27]=str(gag); r[28]=str(gf-gag)
    r[30]=str(W); r[31]=str(Dr); r[32]=str(L)
    r[33]=mmetro; r[35]=mctry; r[36]=mcont
    r[37]=ometro; r[39]=octry; r[40]=ocont
    r[42]='1' if rnd!='Group Stage' else '2'
    r[46]=mctry
    r[48]='Y'; r[49]='Y'; r[52]='Y'
    if is_final:
        r[54]='Y'
        if res=='W': r[53]='Y'   # Trophy Won (Chelsea)
    r[57]='1'
    r[60]=me; r[61]=opp; r[62]='2025'; r[63]=f"2025{me}"; r[64]=stad_metro
    r[73]=mctry; r[74]=octry; r[75]='n'; r[77]=me; r[78]=opp
    return r, res, mcont

def main():
    write = '--write' in sys.argv
    global BYID
    BYID = {r['team_id']: r for r in json.load(open(TEAMJSON, encoding='utf-8'))}
    data = json.load(open(SC, encoding='utf-8'))
    data.sort(key=lambda f: f['fixture']['date'])
    rows=[]; per=Counter=__import__('collections').Counter(); reseu=__import__('collections').Counter()
    eu_wdl=__import__('collections').defaultdict(lambda:[0,0,0])
    for f in data:
        for me_home in (True, False):
            r, res, cont = build_side(f, me_home)
            rows.append(r)
            me=r[10]
            if cont=='Europe':
                per[me]+=1
                i={'W':0,'T':1,'L':2}[res]; eu_wdl[me][i]+=1
    rows = [[asciify(c) for c in r] for r in rows]   # ASCII-safe for the utf-8/replace fold round-trip
    assert all(len(r)==NCOL for r in rows)
    print(f"built {len(rows)} club-match rows ({len(data)} matches x2)")
    print("\nEuropean clubs (these fold into the 2024-25 hub) — MP W-D-L:")
    for c in sorted(eu_wdl, key=lambda x:-sum(eu_wdl[x])):
        w,d,l=eu_wdl[c]; print(f"  {c:22} {w+d+l:2}  {w}-{d}-{l}")
    # show 4 sample rows tab-joined (final + one group)
    print("\nSample rows (tab-joined):")
    finals=[r for r in rows if r[7]=='Final']
    for r in finals + rows[:2]:
        print("  " + "\t".join(r))
    if not write:
        print("\n[PREVIEW only] re-run with --write to append to cupresults93_23_primary.txt")
        return
    # backup then append, matching file newline + cp1252 encoding
    ts=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    bak=SRC+f".bak-{ts}"; shutil.copy2(SRC, bak); print("backup ->", bak)
    with open(SRC,'rb') as fb: raw=fb.read()
    nl=b"\r\n" if b"\r\n" in raw[-4000:] else b"\n"
    lead = b"" if raw.endswith(b"\n") or raw.endswith(b"\r\n") else nl
    payload = lead + nl.join(("\t".join(r)).encode('cp1252','replace') for r in rows) + nl
    with open(SRC,'ab') as fb: fb.write(payload)
    print(f"appended {len(rows)} rows to {SRC}")

if __name__=='__main__':
    main()
