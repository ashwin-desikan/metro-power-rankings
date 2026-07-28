#!/usr/bin/env python3
"""Load parsed European match rows into Supabase public.eur_competition_matches.
Reads a gzipped JSON array (list of row dicts) and batch-POSTs via REST.
Env: SUPABASE_SERVICE_KEY (or repo .env.local). Usage: load_eur_matches.py <rows.json.gz> [--truncate-source SRC]
"""
import os, sys, json, gzip, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")
TABLE = "eur_competition_matches"

def supa_key():
    for env in ("SUPABASE_WRITE_KEY", "SUPABASE_SERVICE_KEY"):
        if os.environ.get(env): return os.environ[env].strip()
    envf = os.path.abspath(os.path.join(HERE, "..", "..", ".env.local"))
    if os.path.exists(envf):
        for line in open(envf, encoding="utf-8"):
            if line.startswith("SUPABASE_SERVICE_KEY="): return line.split("=", 1)[1].strip()
    sys.exit("No Supabase write key")

def req(method, path, key, body=None):
    r = urllib.request.Request(SUPA + path,
        data=(json.dumps(body).encode() if body is not None else None),
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Content-Type": "application/json", "Prefer": "return=minimal"}, method=method)
    with urllib.request.urlopen(r, timeout=120) as resp:
        return resp.status

def main():
    path = sys.argv[1]
    trunc = None
    if "--truncate-source" in sys.argv:
        trunc = sys.argv[sys.argv.index("--truncate-source") + 1]
    key = supa_key()
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        rows = json.load(f)
    print(f"[load] {len(rows)} rows from {os.path.basename(path)}")
    if "--truncate-all" in sys.argv:
        req("DELETE", f"/rest/v1/{TABLE}?id=gt.0", key)
        print("[load] cleared ALL existing rows")
    if trunc:
        req("DELETE", f"/rest/v1/{TABLE}?source=eq.{trunc}", key)
        print(f"[load] cleared existing source={trunc}")
    n = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i+500]
        for attempt in range(3):
            try:
                req("POST", f"/rest/v1/{TABLE}", key, batch); n += len(batch); break
            except urllib.error.HTTPError as e:
                if attempt == 2:
                    raise RuntimeError(f"insert failed HTTP {e.code}: {e.read().decode()[:400]}")
                time.sleep(3)
        if (i // 500) % 4 == 0:
            print(f"[load] {n}/{len(rows)}")
    print(f"[load] DONE inserted {n} rows into {TABLE}")

if __name__ == "__main__":
    main()
