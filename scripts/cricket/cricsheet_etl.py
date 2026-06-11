#!/usr/bin/env python3
"""Cricsheet match-level ETL: info-block only, never parses ball-by-ball."""
import json, os, sys, csv, collections

SRC = '/sessions/magical-tender-noether/mnt/all_male_json'
OUT = '/sessions/magical-tender-noether/mnt/outputs/cricket'
os.makedirs(OUT, exist_ok=True)

def read_info(path):
    """Read only up to the innings key; reconstruct valid JSON of meta+info."""
    size = os.path.getsize(path)
    chunk = 65536
    with open(path, encoding='utf-8') as f:
        text = f.read(min(chunk, size))
        while '"innings"' not in text and len(text) < size:
            text += f.read(chunk)
    idx = text.find('"innings"')
    if idx == -1:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    head = text[:idx].rstrip().rstrip(',') + '}'
    try:
        return json.loads(head)
    except json.JSONDecodeError:
        with open(path, encoding='utf-8') as f:
            return json.load(f)

rows, fails = [], []
files = sorted(fn for fn in os.listdir(SRC) if fn.endswith('.json'))
total = len(files)
for i, fn in enumerate(files, 1):
    try:
        j = read_info(os.path.join(SRC, fn))
        info = j['info']
        ev = info.get('event', {}) or {}
        oc = info.get('outcome', {}) or {}
        by = oc.get('by', {}) or {}
        rows.append({
            'id': fn[:-5],
            'date': (info.get('dates') or [None])[0],
            'n_days': len(info.get('dates') or []),
            'match_type': info.get('match_type'),
            'team_type': info.get('team_type'),
            'event': ev.get('name'),
            'event_match_no': ev.get('match_number'),
            'event_stage': ev.get('stage'),
            'season': str(info.get('season', '')),
            'city': info.get('city'),
            'venue': info.get('venue'),
            'teams': info.get('teams'),
            'toss_winner': (info.get('toss') or {}).get('winner'),
            'toss_decision': (info.get('toss') or {}).get('decision'),
            'winner': oc.get('winner'),
            'result': oc.get('result'),
            'method': oc.get('method'),
            'by_runs': by.get('runs'),
            'by_wickets': by.get('wickets'),
            'by_innings': by.get('innings'),
            'eliminator': oc.get('eliminator'),
            'potm': info.get('player_of_match'),
        })
    except Exception as e:
        fails.append((fn, repr(e)))
    if i % 1000 == 0 or i == total:
        with open(os.path.join(OUT, 'progress.txt'), 'w') as p:
            p.write(f'{i}/{total} parsed, {len(fails)} failed\n')

rows.sort(key=lambda r: (r['date'] or '', r['id']))
with open(os.path.join(OUT, 'matches.json'), 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))

venues = collections.Counter((r['venue'], r['city']) for r in rows)
with open(os.path.join(OUT, 'venues.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['venue', 'city', 'matches'])
    for (v, c), n in venues.most_common():
        w.writerow([v, c, n])

with open(os.path.join(OUT, 'fails.json'), 'w') as f:
    json.dump(fails, f, indent=1)
with open(os.path.join(OUT, 'progress.txt'), 'a') as p:
    p.write('DONE\n')
print(f'done: {len(rows)} rows, {len(fails)} fails')
