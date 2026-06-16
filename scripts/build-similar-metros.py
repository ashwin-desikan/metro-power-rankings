"""Build public/data/similar-metros.json.

For every metro, emit:
  - neighbors: the most similar metros by profile across the 16 dimensions
  - signature: the dimensions where the metro most stands out in absolute terms

Model (see docs/prototypes/metro_similarity.py for the exploration). Built on the
raw dimension VALUES in details/*.json -> metro.dims (not ranks), so magnitude of
a lead actually counts. Two transforms for two different questions:

  NEIGHBORS  -> z-score of log1p(value). Log keeps heavy-tailed money dimensions
                (market cap, companies) from hijacking the distance, so similarity
                reflects overall profile shape. Equal-weighted Euclidean.
  SIGNATURE  -> z-score of the raw value. Magnitude-aware, so a metro that leads
                the field by a wide absolute margin (e.g. SF on market cap) surfaces
                that dimension. Only dimensions clearly above the field (z >= 1.0)
                qualify, so undistinguished metros get no signature rather than a
                manufactured one.

Reads already-built public/data/details/*.json + metros.json, so it runs AFTER the
main ETL. Run from repo root: python scripts/build-similar-metros.py
"""
import json
import glob
import os
import numpy as np

DIMS = [
    'majorLeagueTeams', 'totalTeams', 'majorSportingEvents', 'companies',
    'marketCap', 'culturalEvents', 'universities', 'topUniHospResearch',
    'museumsLandmarks', 'portsExchangesInfra', 'airportScore', 'luxuryStars',
    'metroStations', 'suburbStations', 'trainHubs', 'skyscrapers',
]
N_NEIGHBORS = 6
SIG_MAX = 3
SIG_MIN_Z = 1.0  # only call a dimension a "signature" if clearly above the field

DATA = os.path.join('public', 'data')


def zscore(M):
    mu = M.mean(axis=0)
    sd = M.std(axis=0)
    sd[sd == 0] = 1
    return (M - mu) / sd


def main():
    meta = {}
    for m in json.load(open(os.path.join(DATA, 'metros.json'), encoding='utf-8')):
        meta[m['slug']] = {
            'slug': m['slug'], 'name': m['name'], 'country': m['country'],
            'region': m.get('region', ''), 'rank': m.get('rank'),
        }

    slugs, rows = [], []
    for p in glob.glob(os.path.join(DATA, 'details', '*.json')):
        slug = os.path.splitext(os.path.basename(p))[0]
        if slug not in meta:
            continue
        try:
            dd = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        dims = dd.get('metro', {}).get('dims')
        if not dims:
            continue
        slugs.append(slug)
        rows.append([float(dims.get(k, 0) or 0) for k in DIMS])

    V = np.array(rows, dtype=float)
    Z_neighbors = zscore(np.log1p(V))   # balanced profile shape
    Z_signature = zscore(V)             # magnitude-aware

    out = {}
    for i, slug in enumerate(slugs):
        d = np.linalg.norm(Z_neighbors - Z_neighbors[i], axis=1)
        neighbors = []
        for j in np.argsort(d):
            if j == i:
                continue
            neighbors.append(meta[slugs[j]])
            if len(neighbors) >= N_NEIGHBORS:
                break
        zr = Z_signature[i]
        sig = [DIMS[di] for di in np.argsort(-zr)[:SIG_MAX] if zr[di] >= SIG_MIN_Z]
        out[slug] = {'neighbors': neighbors, 'signature': sig}

    path = os.path.join(DATA, 'similar-metros.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    n_sig = sum(1 for v in out.values() if v['signature'])
    print('Wrote %s for %d metros (%d KB); %d have a signature' % (
        path, len(out), os.path.getsize(path) // 1024, n_sig))


if __name__ == '__main__':
    main()
