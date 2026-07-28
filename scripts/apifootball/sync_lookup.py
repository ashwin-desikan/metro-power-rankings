#!/usr/bin/env python3
"""Mirror the CL workbook `Lookup` sheet into Supabase public.football_lookup (ONE-WAY:
workbook -> Supabase). Run on the Windows host (where the OneDrive workbook lives) whenever
Lookup changes, or nightly before the standings refresh. This keeps the club-identity source
of truth in Supabase so refresh.py can resolve every api team against it.

Env: CL_WORKBOOK (path to the workbook; defaults to the OneDrive master), and a Supabase write
key (SUPABASE_WRITE_KEY / SUPABASE_SERVICE_KEY / repo .env.local).
"""
import openpyxl, os, sys, json, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")
WORKBOOK = os.environ.get("CL_WORKBOOK",
    r"C:\Users\ashwi\OneDrive\Excel Files\Champions League-201516.xlsx")

def supa_key():
    for env in ("SUPABASE_WRITE_KEY", "SUPABASE_SERVICE_KEY"):
        if os.environ.get(env): return os.environ[env].strip()
    envf = os.path.abspath(os.path.join(HERE, "..", "..", ".env.local"))
    if os.path.exists(envf):
        for line in open(envf, encoding="utf-8"):
            if line.startswith("SUPABASE_SERVICE_KEY="): return line.split("=", 1)[1].strip()
    sys.exit("No Supabase write key")

def clean(v):
    if v in (None, ""): return None
    s = str(v).strip()
    return None if s in ("#N/A", "0", "") else s

def extract(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Lookup"]; it = ws.iter_rows(values_only=True)
    hdr = [str(h).strip() if h is not None else "" for h in next(it)]
    cols = {"cur_name": "Cur. Name", "team": "Team", "lookup_name": "Lookup", "uefa_name": "UEFA Name", "uefa_name_2": "UEFA Name 2",
            "efs_name": "EFS Name", "api_name": "API Name", "api_name_2": "API Name 2", "country": "Country", "city": "City",
            "metro_area": "Metro Area", "county": "County", "continent": "Continent", "league": "League",
            "level": "Level", "lat": "Lat", "long": "Long"}
    idx = {k: (hdr.index(v) if v in hdr else None) for k, v in cols.items()}
    rows = []
    for r in it:
        def g(i): return r[i] if (i is not None and i < len(r)) else None
        rec = {}
        for k, i in idx.items():
            v = clean(g(i))
            if k == "level":
                try: v = int(float(v)) if v is not None else None
                except: v = None
            elif k in ("lat", "long"):
                try: v = float(v) if v is not None else None
                except: v = None
            rec[k] = v
        if not (rec.get("cur_name") or rec.get("team") or rec.get("lookup_name")): continue
        rows.append(rec)
    return rows

def req(method, path, key, body=None):
    r = urllib.request.Request(SUPA + path, data=(json.dumps(body).encode() if body is not None else None),
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Content-Type": "application/json", "Prefer": "return=minimal"}, method=method)
    with urllib.request.urlopen(r, timeout=90) as resp:
        return resp.status

def main():
    key = supa_key()
    rows = extract(WORKBOOK)
    print(f"[sync_lookup] extracted {len(rows)} Lookup rows from {os.path.basename(WORKBOOK)}")
    # full mirror: clear then insert
    req("DELETE", "/rest/v1/football_lookup?id=gt.0", key)
    n = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i+500]
        for attempt in range(3):
            try:
                req("POST", "/rest/v1/football_lookup", key, batch); n += len(batch); break
            except urllib.error.HTTPError as e:
                if attempt == 2: raise RuntimeError(f"insert failed: HTTP {e.code} {e.read().decode()[:300]}")
                time.sleep(3)
    print(f"[sync_lookup] football_lookup mirrored: {n} rows")

if __name__ == "__main__":
    main()
