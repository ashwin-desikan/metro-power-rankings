#!/usr/bin/env python3
"""v2: cricsheet cities -> workbook metros; cricsheet venues -> Team List Test venues.
Auto-accepts only exact/curated/context-validated matches; suggestions go to review files."""
import json, re, unicodedata, collections, difflib

O = '/sessions/magical-tender-noether/mnt/outputs/cricket'
WX = json.load(open('/tmp/workbook_extract.json'))
rows = json.load(open(f'{O}/matches.json'))

def norm(s):
    if not s: return ''
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii','ignore').decode()
    s = s.lower().replace('&','and')
    s = re.sub(r'[^a-z0-9 ]',' ', s)
    return re.sub(r'\s+',' ', s).strip()

# cricket nation -> workbook country naming
NATION_TO_COUNTRY = {'England':'United Kingdom','Scotland':'United Kingdom','Wales':'United Kingdom',
                     'Ireland':'Ireland','United States of America':'United States','U.S.A.':'United States'}

metros = WX['metros']
metro_exact = {}
for m in metros:
    metro_exact.setdefault(norm(m['metro']), []).append(m)
base_groups = collections.defaultdict(list)
for m in metros:
    base_groups[norm(re.sub(r'\(.*?\)','', m['metro']))].append(m)
alias = {norm(c): v for c, v in WX['city_metro'].items()}
metro_country = {m['metro']: m['country'] for m in metros}

# per-city aggregates incl. international-team country evidence
city_stats = collections.defaultdict(lambda: {'n':0,'venues':collections.Counter(),'events':collections.Counter(),
                                              'teams':collections.Counter(),'nations':collections.Counter(),'first':None,'last':None})
for r in rows:
    c = (r['city'] or '').strip()
    if not c: continue
    s = city_stats[c]
    s['n'] += 1; s['venues'][r['venue']] += 1; s['events'][r['event'] or r['match_type']] += 1
    for t in (r['teams'] or []):
        s['teams'][t] += 1
        if r['team_type'] == 'international':
            s['nations'][NATION_TO_COUNTRY.get(t, t)] += 1

def country_evidence(s):
    """countries appearing in >=60% of this city's international matches' team slots"""
    if not s['nations']: return set()
    top = s['nations'].most_common(3)
    tot = sum(s['nations'].values())
    return {c for c,n in top if n/tot >= 0.3}

# User-approved 2026-06-10 (Ashwin): Sano->Tokyo; Scarborough->Scarborough (NEW metro, UK Yorkshire);
# Dharamsala/Dharmasala->Dharamshala (NEW metro, India). New metros pending rows in MetroAreas.xlsx master.
USER_APPROVED = {'Sano': 'Tokyo', 'Scarborough': 'Scarborough', 'Dharamsala': 'Dharamshala', 'Dharmasala': 'Dharamshala'}

def match_city(city, s):
    if city in USER_APPROVED:
        return USER_APPROVED[city], 'user-approved'
    n = norm(city)
    cands = metro_exact.get(n, [])
    variants = base_groups.get(n, [])
    if len(cands) == 1 and len(variants) == 1:
        return cands[0]['metro'], 'metro-name-exact'
    if variants:  # name collision (London vs London (ON)) -> need country context
        ev = country_evidence(s)
        fits = [m for m in variants if m['country'] in ev]
        if len(fits) == 1:
            return fits[0]['metro'], 'metro-name+country-context'
        return None, f"AMBIGUOUS: {[v['metro'] for v in variants]} — intl evidence {sorted(ev) or 'none'}"
    if city in WX['city_metro']: return WX['city_metro'][city], 'teamlist-city-alias'
    if n in alias: return alias[n], 'teamlist-city-alias-norm'
    return None, 'unmatched'

# ---------- venue matching ----------
tv = WX['venues']
tv_by_norm = {norm(v['venue']): v for v in tv}
KNOWN_ALIASES = {  # factual renames / sponsor names / formal names — flagged for review
    'brisbane cricket ground': 'The Gabba', 'national stadium': 'Pakistan National Stadium',
    'national stadium karachi': 'Pakistan National Stadium',
    'supersport park': 'Centurion Park', 'the wanderers stadium': 'New Wanderers Stadium',
    'wanderers stadium': 'New Wanderers Stadium',
    'feroz shah kotla': 'Arun Jaitley Stadium', 'punjab cricket association stadium': 'Inderjit Singh Bindra Stadium',
    'punjab cricket association is bindra stadium': 'Inderjit Singh Bindra Stadium',
    'zahur ahmed chowdhury stadium': 'Chattogram Cricket Stadium',
    'zohur ahmed chowdhury stadium': 'Chattogram Cricket Stadium',
    'shere bangla national stadium': 'Sher-e-Bangla National Cricket Stadium',
    'sinhalese sports club ground': 'Singhalese Sports Club Cricket Ground',
    'sinhalese sports club': 'Singhalese Sports Club Cricket Ground',
    'the rose bowl': 'Rose Bowl', 'ageas bowl': 'Rose Bowl', 'utilita bowl': 'Rose Bowl',
    'optus stadium': 'Perth Stadium', 'kennington oval': 'The Oval',
    'sardar patel stadium': 'Narendra Modi Stadium', 'motera': 'Narendra Modi Stadium',
    'ekana cricket stadium': 'Ekana Cricket Stadium',
    'county ground edgbaston': 'Edgbaston Cricket Ground',
    'gaddafi stadium lahore': 'Gaddafi Stadium',
    'ma chidambaram stadium': 'M. A. Chidambaram Stadium',
    'm chinnaswamy stadium': 'M. Chinnaswamy Stadium',
    'dr y s rajasekhara reddy aca vdca cricket stadium': 'ACA–VDCA Cricket Stadium',
    'andhra cricket association visakhapatnam district cricket association stadium': 'ACA–VDCA Cricket Stadium',
    'antigua recreation ground': 'Recreation Ground',
    'bharat ratna shri atal bihari vajpayee ekana cricket stadium': 'Ekana Cricket Stadium',
    'bharat ratna shri atal bihari vajpayee ekana cricket stadium b': 'Ekana Cricket Stadium',
    'zayed cricket stadium': 'Sheikh Zayed Cricket Stadium',
    'aca vdca cricket stadium': 'ACA–VDCA Cricket Stadium',
}
STOP = {'the','cricket','ground','stadium','international','park','oval','county','national','club','sports'}
def toks(n): return set(n.split())
def distinctive(n): return toks(n) - STOP

cric_venues = collections.Counter(); venue_city = {}
for r in rows:
    cric_venues[r['venue']] += 1
    if r['city']: venue_city.setdefault(r['venue'], (r['city'] or '').strip())

def city_consistent(v, t):
    """reject cross-city matches when both sides have city info"""
    c = norm(venue_city.get(v, ''))
    if not c: return True
    tc, tm = norm(t['city'] or ''), norm(re.sub(r'\(.*?\)','', t['metro'] or ''))
    return c in (tc, tm) or (tc and tc in norm(v)) or (tm and tm in norm(v))

vmatched, vcandidates = [], []
for v, nm in cric_venues.most_common():
    short = norm(v.split(',')[0])
    if short.startswith('dr ys'): pass
    full = norm(v)
    hit, how = None, None
    for key, lab in ((full,'exact-norm'),(short,'exact-norm-nocity')):
        if key in tv_by_norm: hit, how = tv_by_norm[key], lab; break
    if not hit:
        for key in (full, short):
            if key in KNOWN_ALIASES:
                t = next(x for x in tv if x['venue']==KNOWN_ALIASES[key])
                hit, how = t, 'known-alias'
                break
    if not hit:  # token-subset: distinctive tokens of one side contained in the other
        for t in tv:
            tn = norm(t['venue'])
            ds, dt = distinctive(short), distinctive(tn)
            inter = ds & dt
            if ds and dt and (ds <= toks(tn) or dt <= toks(short)) and (len(inter) >= 2 or ds == dt) and city_consistent(v, t):
                hit, how = t, 'token-subset'; break
    if hit:
        vmatched.append({'cricsheet_venue': v, 'matches': nm, 'teamlist_venue': hit['venue'],
                         'metro': hit['metro'], 'tier': hit['league'], 'method': how})
        continue
    best, score = None, 0
    for t in tv:
        sc = difflib.SequenceMatcher(None, short, norm(t['venue'])).ratio()
        if sc > score: best, score = t, sc
    if score >= 0.85 and city_consistent(v, best):
        vcandidates.append({'cricsheet_venue': v, 'matches': nm, 'city': venue_city.get(v),
                            'suggested': best['venue'], 'suggested_metro': best['metro'], 'similarity': round(score,3)})

venue_to_metro = {m['cricsheet_venue']: m['metro'] for m in vmatched}
used_tv = {m['teamlist_venue'] for m in vmatched}

# ---------- assemble city results, with venue-derived fallback ----------
matched, unmatched = [], []
for city, s in sorted(city_stats.items(), key=lambda kv: -kv[1]['n']):
    metro, method = match_city(city, s)
    if not metro:  # venue-derived: all of this city's matched venues agree on one metro
        vm = {venue_to_metro[v] for v in s['venues'] if v in venue_to_metro}
        if len(vm) == 1 and sum(s['venues'][v] for v in s['venues'] if v in venue_to_metro)/s['n'] >= 0.5:
            metro, method = vm.pop(), 'venue-derived'
    if metro:
        matched.append({'city': city, 'metro': metro, 'method': method, 'matches': s['n']})
    else:
        ev = country_evidence(s)
        cmetros = [m['metro'] for m in metros if m['country'] in ev]
        unmatched.append({'city': city, 'matches': s['n'], 'reason': method,
                          'inferred_country': sorted(ev),
                          'workbook_metros_in_country': len(cmetros),
                          'sample_country_metros': cmetros[:6],
                          'first': s['first'], 'last': s['last'],
                          'top_venues': [v for v,_ in s['venues'].most_common(3)],
                          'top_events': [f'{e} ({x})' for e,x in s['events'].most_common(3)],
                          'intl_team_evidence': [f'{t} ({x})' for t,x in s['nations'].most_common(4)],
                          'top_teams': [t for t,_ in s['teams'].most_common(4)]})

json.dump(matched, open(f'{O}/city_metro_matched.json','w'), indent=1, ensure_ascii=False)
json.dump(unmatched, open(f'{O}/city_metro_skipped.json','w'), indent=1, ensure_ascii=False)
json.dump({'matched': vmatched, 'fuzzy_candidates': vcandidates,
           'teamlist_venues_unhit': [t['venue'] for t in tv if t['venue'] not in used_tv]},
          open(f'{O}/venue_teamlist_map.json','w'), indent=1, ensure_ascii=False)

cov = sum(m['matches'] for m in matched); tot = sum(s['n'] for s in city_stats.values())
print(f"cities matched {len(matched)}/{len(city_stats)} | match coverage {cov}/{tot} = {cov/tot:.1%}")
print('methods:', dict(collections.Counter(m['method'] for m in matched)))
vm_n = sum(m['matches'] for m in vmatched)
print(f"venue strings matched: {len(vmatched)} ({vm_n} matches) | candidates {len(vcandidates)} | tl targets hit {len(used_tv)}/62")
