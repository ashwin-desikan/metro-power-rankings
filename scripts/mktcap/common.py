"""Shared plumbing for the mktcap pipeline (stdlib only).

Runs on the Mac mini (weekly) or any machine with network access.
Supabase access via PostgREST; key comes from env MKTCAP_SUPABASE_KEY
or a key file next to the repo (never committed).
"""
import csv, io, json, os, sys, time, urllib.request, urllib.error

SUPABASE_URL = os.environ.get("MKTCAP_SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")

def get_key():
    k = os.environ.get("MKTCAP_SUPABASE_KEY")
    if k: return k.strip()
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (os.path.join(here, "supabase_key.txt"),
                 os.path.join(here, "..", "..", ".mktcap_supabase_key")):
        if os.path.exists(cand):
            return open(cand).read().strip()
    sys.exit("FATAL: no Supabase key (set MKTCAP_SUPABASE_KEY or scripts/mktcap/supabase_key.txt)")

def rest(method, path, body=None, headers=None, key=None, timeout=90):
    key = key or get_key()
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "Prefer": "return=minimal"}
    if headers: h.update(headers)
    req = urllib.request.Request(f"{SUPABASE_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers=h, method=method)
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            if e.code >= 500 and attempt < 2:
                time.sleep(5 * (attempt + 1)); last = f"HTTP {e.code}: {detail}"; continue
            raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {detail}")
        except Exception as e:
            if attempt < 2:
                time.sleep(5 * (attempt + 1)); last = str(e); continue
            raise RuntimeError(f"{method} {path} -> {e} (after retries; last={last})")

def select(path, key=None):
    status, body = rest("GET", path, key=key, headers={"Prefer": ""})
    return json.loads(body)

def select_all(path, order, key=None, page=1000):
    """Paginate past PostgREST's max-rows cap. path must not already contain order/limit/offset."""
    sep = "&" if "?" in path else "?"
    rows, offset = [], 0
    while True:
        batch = select(f"{path}{sep}order={order}&limit={page}&offset={offset}", key=key)
        rows += batch
        if len(batch) < page: return rows
        offset += page

def in_list(ids):
    """PostgREST `in.(...)` value for a list of ids: each double-quoted, the whole
    thing URL-encoded. company_ids can contain spaces, '&' and '#' ("Koch
    Industries", "Ernst & Young", "Bolt(Uni)#2") — raw, they either split the
    query string or trip http.client's control-character check (bit us on the
    first real --write, 2026-08-02)."""
    from urllib.parse import quote
    return quote(",".join('"' + i.replace('"', '') + '"' for i in ids), safe='",().-_')

def fetch_url(url, timeout=120, ua="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CitizenOfNowhere-data/1.0"):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        enc = r.headers.get("Content-Encoding", "")
    if enc == "gzip" or raw[:2] == b"\x1f\x8b":
        import gzip; raw = gzip.decompress(raw)
    return raw

def log(msg):
    print(f"[mktcap] {msg}", flush=True)
