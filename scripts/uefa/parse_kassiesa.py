#!/usr/bin/env python3
"""Parse the kassiesa European-match text dumps into eur_competition_matches rows.

Single source of truth for the whole archive (1955/56-2025/26). Two-legged ties are
condensed to one row (leg1 = first-named club at home; leg2 = the return, scores from the
first-named club's perspective; single-leg finals and Swiss League-Stage games have leg1 only).

Inputs (all on disk):
  data/uefacomp_1956_2013.txt   kassiesa dump, seasons 1955/56 - 2012/13
  data/uefacomp_2013_2026.txt   kassiesa dump, seasons 2012/13 - 2025/26 (we keep 2013/14+)
  ../apifootball/_scratch/football_lookup.json   canonical club identity (Lookup mirror)
  _eur_namecross.json           Team-name -> Cur. Name crosswalk (run dump_eursummary.py first)

Output:
  _kassiesa_all_rows.json.gz    load with:  python load_eur_matches.py _kassiesa_all_rows.json.gz --truncate-all

Club mapping is best-effort: Lookup (UEFA Name / Team / Lookup / Cur. Name, country-disambiguated)
first, then the Eur Summary crosswalk. Unmapped names keep raw name + country code so canon is
always re-derivable after the Lookup UEFA Names are curated. See HANDOFF.md 2026-07-28.
"""
import json, re, gzip, os, unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OLD = os.path.join(DATA, "uefacomp_1956_2013.txt")
NEW = os.path.join(DATA, "uefacomp_2013_2026.txt")
LOOKUP = os.path.join(HERE, "..", "apifootball", "_scratch", "football_lookup.json")
XW = os.path.join(HERE, "_eur_namecross.json")
OUT = os.path.join(HERE, "_kassiesa_all_rows.json.gz")

COMP_MAP = {'CHAMPIONS LEAGUE':'CL','CHAMPIONS CUP':'CL','EUROPA LEAGUE':'EL','UEFA CUP':'EL',
 'CONFERENCE LEAGUE':'ECL','CUP WINNERS CUP':'CWC','INTER-CITIES FAIRS CUP':'ICFC'}

def round_num(lbl):
    l = (lbl or '').lower()
    if l == 'final': return 1
    if 'semi' in l: return 2
    if 'quarter' in l: return 3
    if 'round of 16' in l: return 4
    if 'group stage' in l or 'league stage' in l or 'league phase' in l: return 5
    if 'knockout' in l: return None
    if 'qualif' in l or 'preliminary' in l or 'play-off' in l: return 6
    return None

CC2COUNTRY = {'Alb':'Albania','And':'Andorra','Arm':'Armenia','Aut':'Austria','Azb':'Azerbaijan','Bel':'Belgium',
 'Bls':'Belarus','Bos':'Bosnia and Herzegovina','Bul':'Bulgaria','Cro':'Croatia','Cyp':'Cyprus','Cze':'Czech Republic',
 'Den':'Denmark','Eng':'England','Esp':'Spain','Est':'Estonia','Far':'Faroe Islands','Fin':'Finland','Fra':'France',
 'GDR':'East Germany','Geo':'Georgia','Ger':'Germany','Gre':'Greece','Hun':'Hungary','Irl':'Republic of Ireland',
 'Isl':'Iceland','Isr':'Israel','Ita':'Italy','Kaz':'Kazakhstan','Kos':'Kosovo','Lat':'Latvia','Lie':'Liechtenstein',
 'Lit':'Lithuania','Lux':'Luxembourg','Mac':'North Macedonia','Mlt':'Malta','Mol':'Moldova','Mon':'Montenegro',
 'Ned':'Netherlands','Nir':'Northern Ireland','Nor':'Norway','Pol':'Poland','Por':'Portugal','Rom':'Romania',
 'Rus':'Russia','Saa':'Saarland','Sco':'Scotland','Slo':'Slovenia','Sma':'San Marino','Srb':'Serbia','Sui':'Switzerland',
 'Svk':'Slovakia','Swe':'Sweden','TCH':'Czechoslovakia','Tur':'Turkey','URS':'Soviet Union','Ukr':'Ukraine','Wal':'Wales','YUG':'Yugoslavia'}

def norm(s):
    if not s: return ''
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+',' ', s).strip()

lk = json.load(open(LOOKUP, encoding='utf-8'))
def canon(r): return r.get('cur_name') or r.get('team')
idx = {}
for r in lk:
    for f in ('uefa_name','uefa_name_2','team','lookup_name','cur_name'):
        if r.get(f): idx.setdefault(norm(r[f]), []).append(r)
xn = {}
if os.path.exists(XW):
    cross = json.load(open(XW, encoding='utf-8'))
    for team, lst in cross.items():
        k = norm(team)
        if not k: continue
        tot = {}
        for e in lst: tot[e['cur']] = tot.get(e['cur'], 0) + e['n']
        xn.setdefault(k, sorted(tot.items(), key=lambda kv:-kv[1])[0][0])

def match_club(name, cc):
    cands = idx.get(norm(name))
    if cands:
        if len(cands) == 1: return canon(cands[0])
        country = CC2COUNTRY.get(cc)
        if country:
            m = [c for c in cands if c.get('country') == country]
            if m: return canon(m[0])
        return canon(cands[0])
    return xn.get(norm(name))

def split(sc):
    m = re.match(r'^(\d+)\s*-\s*(\d+)$', sc.strip()); return (int(m.group(1)), int(m.group(2))) if m else (None, None)

def parse(fn):
    lines = [l.rstrip('\r') for l in open(fn, encoding='utf-8').read().split('\n')]
    rows = []; season = season_end = comp = comp_raw = rnd = None
    noise = ('[ Main','This page list','Bert Kassies','bert@kassiesa.net')
    for l in lines:
        if not l.strip(): continue
        m = re.search(r'Matches (\d{4})/(\d{4})', l)
        if m:
            y0 = int(m.group(1)); season_end = int(m.group(2)); season = f"{y0}-{str(season_end)[2:]}"; comp = None; rnd = None; continue
        if '\t' in l:
            p = l.split('\t')
            if l.startswith('Penalty shootout'):
                head = p[0].replace('Penalty shootout:','').strip()
                mm = re.match(r'(.+?)\s+-\s+(.+)$', head); sc = p[1] if len(p) > 1 else ''
                ms = re.match(r'(\d+)\s*-\s*(\d+)', sc.strip())
                if rows and mm and ms:
                    a = mm.group(1).strip(); x, y = int(ms.group(1)), int(ms.group(2)); pr = rows[-1]
                    if norm(a) == norm(pr['home_raw']): pr['pens_home'], pr['pens_away'] = x, y
                    else: pr['pens_home'], pr['pens_away'] = y, x
                    pr['pens'] = f"{pr['pens_home']}-{pr['pens_away']}"
                continue
            if len(p) < 5: continue
            home, hcc, away, acc = p[0], p[1], p[2], p[3]
            leg1 = p[4].strip() if len(p) > 4 else ''; leg2 = p[5].strip() if len(p) > 5 else ''
            l1h, l1a = split(leg1); l2h, l2a = split(leg2)
            rows.append({'season':season,'season_end':season_end,'competition':comp,'competition_raw':comp_raw,
                'round':rnd,'round_num':round_num(rnd),'home_raw':home,'home_cc':hcc,'home_canon':match_club(home,hcc),
                'away_raw':away,'away_cc':acc,'away_canon':match_club(away,acc),'leg1':leg1 or None,'leg1_home':l1h,'leg1_away':l1a,
                'leg2':leg2 or None,'leg2_home':l2h,'leg2_away':l2a,'pens':None,'pens_home':None,'pens_away':None,
                'note':None,'source':'kassiesa','match_date':None,'home_id':None,'away_id':None})
            continue
        s = l.strip()
        if s.startswith(noise): continue
        if re.match(r'^\d{4} <$', s) or s.startswith('>'): continue
        if s.endswith('progressed on a coin toss'):
            if rows: rows[-1]['note'] = s
            continue
        if s.isupper() and len(s) > 3: comp = COMP_MAP.get(s); comp_raw = s; rnd = None; continue
        rnd = s
    return rows

old = [r for r in parse(OLD) if r['season_end'] <= 2013]
new = [r for r in parse(NEW) if r['season_end'] >= 2014]
allrows = old + new
slots = 2 * len(allrows); un = sum(1 for r in allrows for k in ('home_canon','away_canon') if r[k] is None)
print(f"old(<=2012/13)={len(old)} new(>=2013/14)={len(new)} total={len(allrows)} "
      f"matched={slots-un}/{slots} ({100*(slots-un)/slots:.2f}%)")
with gzip.open(OUT, 'wt', encoding='utf-8') as f:
    json.dump(allrows, f, ensure_ascii=False)
print("wrote", OUT)
