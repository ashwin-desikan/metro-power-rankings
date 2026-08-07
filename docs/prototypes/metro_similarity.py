"""Metro similarity + distinctive-signature prototype.

Borrows two ideas from everynoise.com:
  1. "Every Place at Once": click a place, re-rank all places by similarity to it.
  2. "Genres by Country": surface what each place over-indexes on, not just its biggest dimensions.

Runs against the live workbook-derived data (public/data/details/*.json -> dimRanks).
Run from repo root:  python docs/prototypes/metro_similarity.py
"""
import json, glob, os
import numpy as np

DIMS = [
    'majorLeagueTeams', 'totalTeams', 'majorSportingEvents', 'companies',
    'marketCap', 'culturalEvents', 'universities', 'topUniHospResearch',
    'museumsLandmarks', 'portsExchangesInfra', 'airportScore', 'luxuryStars',
    'metroStations', 'suburbStations', 'trainHubs', 'skyscrapers',
]

def parse_rank(v):
    if v is None:
        return None
    s = str(v).replace('T-', '').strip()
    try:
        return int(s)
    except ValueError:
        return None

# ---- load metadata (slug -> name/country/overall rank) ----
meta = {}
for m in json.load(open('public/data/metros.json', encoding='utf-8')):
    meta[m['slug']] = {'name': m['name'], 'country': m['country'],
                       'rank': m.get('rank'), 'score': m.get('score')}

# ---- load per-metro dimension ranks ----
slugs, rows = [], []
for p in glob.glob('public/data/details/*.json'):
    slug = os.path.splitext(os.path.basename(p))[0]
    if slug not in meta:
        continue
    try:
        dd = json.load(open(p, encoding='utf-8'))
    except Exception:
        continue
    dr = dd.get('dimRanks')
    if not dr:
        continue
    slugs.append(slug)
    rows.append([parse_rank(dr.get(k)) for k in DIMS])

N = len(slugs)
R = np.array([[np.nan if x is None else x for x in r] for r in rows], dtype=float)

# normalized dimension score: best rank -> 1.0, worst -> 0.0; missing -> worst
maxr = np.nanmax(R, axis=0)
denom = np.where(maxr > 1, maxr - 1, 1)
S = 1 - (R - 1) / denom
S = np.where(np.isnan(S), 0.0, S)

# z-score each dimension so all 16 count equally in the distance
mu, sd = S.mean(axis=0), S.std(axis=0)
sd[sd == 0] = 1
Z = (S - mu) / sd

idx = {s: i for i, s in enumerate(slugs)}
name2slug = {meta[s]['name'].lower(): s for s in slugs}


def resolve(q):
    ql = q.lower()
    if ql in idx:
        return ql
    if ql in name2slug:
        return name2slug[ql]
    for s in slugs:
        if ql == meta[s]['name'].lower().split(',')[0]:
            return s
    for s in slugs:
        if ql in meta[s]['name'].lower():
            return s
    return None

def nn(slug, k=8, metric='euclid'):
    i = idx[slug]; v = Z[i]
    if metric == 'cosine':
        num = Z @ v
        den = np.linalg.norm(Z, axis=1) * np.linalg.norm(v) + 1e-9
        d = -num / den
    else:
        d = np.linalg.norm(Z - v, axis=1)
    out = []
    for j in np.argsort(d):
        if j == i:
            continue
        out.append((meta[slugs[j]]['name'], meta[slugs[j]]['country'], meta[slugs[j]]['rank'], d[j]))
        if len(out) >= k:
            break
    return out

def signature(slug, k=4):
    # Over-indexing = how far above the field this metro sits on each dimension,
    # measured in standard deviations (z). Comparable across dimensions that rank
    # very different numbers of metros.
    i = idx[slug]
    zrow = Z[i]
    order = np.argsort(-zrow)
    return [(DIMS[di], float(zrow[di]), float(S[i, di])) for di in order[:k]]


if __name__ == '__main__':
    print('Loaded %d metros, %d dimensions.\n' % (N, len(DIMS)))
    samples = ['Austin', 'Nashville', 'London', 'Dubai', 'Singapore',
               'Detroit', 'Zurich', 'Boston', 'Las Vegas', 'Oxford']
    for q in samples:
        s = resolve(q)
        if not s:
            print('NOT FOUND:', q); continue
        m = meta[s]
        print('=' * 64)
        print('%s (%s)  -  overall #%s' % (m['name'], m['country'], m['rank']))
        print('  Nearest metros (equal-weighted, z-scored Euclidean):')
        for nm, co, rk, dist in nn(s, 8):
            print('    %-30s %-16s #%-5s  d=%.2f' % (nm[:30], co[:16], rk, dist))
        sig = signature(s, 4)
        print('  Distinctive signature (most over-indexed dimensions, z vs the field):')
        for dim, z, sc in sig:
            print('    %-22s  z=%+.2f  dim-score=%.2f' % (dim, z, sc))
        print()
