#!/usr/bin/env python3
"""Load (upsert) scripts/reep/dryrun-<date>/football_team_reep.json into public.football_team_reep.

Same credential convention as scripts/apifootball/sync_lookup.py: SUPABASE_WRITE_KEY / SUPABASE_SERVICE_KEY
in the environment, else SUPABASE_SERVICE_KEY= in the repo's .env.local. Upsert on sheet_row, 500 rows per
request, so a rerun after a new dry run replaces the keys and leaves nothing stale. Dry-run by default;
--write performs the upsert. After loading, run the SQL in references (or --link) to fill lookup_id and
refresh the football_team_alias table.
"""
import argparse, json, os, sys, urllib.request
from pathlib import Path

SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")
REPO = Path(__file__).resolve().parents[2]

def key():
    for env in ("SUPABASE_WRITE_KEY", "SUPABASE_SERVICE_KEY"):
        if os.environ.get(env): return os.environ[env].strip()
    envf = REPO / ".env.local"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8").splitlines():
            if line.startswith("SUPABASE_SERVICE_KEY="): return line.split("=", 1)[1].strip().strip('"')
    sys.exit("no Supabase write key (SUPABASE_WRITE_KEY / SUPABASE_SERVICE_KEY / .env.local)")

def post(path, body, k, prefer):
    req = urllib.request.Request(f"{SUPA}/rest/v1/{path}", data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"apikey": k, "Authorization": f"Bearer {k}", "Content-Type": "application/json", "Prefer": prefer})
    with urllib.request.urlopen(req, timeout=120) as r: return r.status, r.read().decode()[:300]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("json_path"); ap.add_argument("--write", action="store_true"); ap.add_argument("--batch", type=int, default=500)
    a = ap.parse_args()
    rows = json.load(open(a.json_path, encoding="utf-8"))
    matched = sum(1 for r in rows if r["reep_v1_id"])
    print(f"{len(rows)} rows, {matched} with a Reep v1 id, {sum(1 for r in rows if r['wikidata_qid'])} with a QID")
    if not a.write: print("dry run; add --write to upsert"); return
    k = key(); n = 0
    for i in range(0, len(rows), a.batch):
        chunk = rows[i:i + a.batch]
        st, txt = post("football_team_reep?on_conflict=sheet_row", chunk, k, "resolution=merge-duplicates,return=minimal")
        if st not in (200, 201, 204): sys.exit(f"batch {i}: HTTP {st} {txt}")
        n += len(chunk); print(f"  upserted {n}/{len(rows)}")
    print("done")

if __name__ == "__main__": main()
