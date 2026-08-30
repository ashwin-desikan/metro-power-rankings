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

def select_all(path, order, key=None, page=1000, allow_duplicate_rows=False):
    """Paginate past PostgREST's max-rows cap. path must not already contain order/limit/offset.

    🔴 THE ORDER MUST BE UNIQUE ACROSS ROWS.

    limit/offset pagination asks the server for "rows 1000-1999 of this
    ordering". If the ordering has ties, the database is free to break them
    differently on every request, so a tied row can appear on two pages and
    another can appear on none. Nothing errors. You get a dataset that is
    quietly wrong and that CHANGES BETWEEN RUNS.

    It bit F1 on 2026-08-18: `f1_results` was paginated on (season, round),
    which is one race and about twenty rows, so 27,389 results came back with
    duplicates and holes. McLaren read 148 points for 1991 against a real 139,
    Williams 178 for 1993 against 168. Nobody would have caught it without
    reconciling against the championship table.

    So this now checks. Every row is hashed on the columns actually selected,
    and a repeat across pages raises rather than returns. Pass
    allow_duplicate_rows=True only when identical projected rows are EXPECTED,
    which really means when you are building a set and do not care.
    """
    sep = "&" if "?" in path else "?"
    rows, offset, seen = [], 0, set()
    while True:
        batch = select(f"{path}{sep}order={order}&limit={page}&offset={offset}", key=key)
        if not allow_duplicate_rows:
            for r in batch:
                h = json.dumps(r, sort_keys=True, separators=(",", ":"), default=str)
                if h in seen:
                    raise SystemExit(
                        f"FATAL: paginating {path.split('?')[0]} on order={order!r} "
                        f"returned the same row twice, which means the order is not "
                        f"unique and the page boundaries are unstable. Rows are "
                        f"being dropped as well as repeated. Add a unique column to "
                        f"the order (usually 'id'). Duplicate: {h[:200]}")
                seen.add(h)
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

# Set True by selftest.py before it exercises code paths (like merge()'s
# recycled-ticker guard) that log() through their normal, non-test logic --
# found 2026-08-30 (daily-ops-sweep): the self-test's synthetic NVDA->MSTR
# fixture prints a real-looking "WARNING: rename ... SKIPPED" line with no
# marker, so it reads as a live production warning in the log.
SELFTEST = False

def log(msg):
    tag = "[mktcap:selftest]" if SELFTEST else "[mktcap]"
    print(f"{tag} {msg}", flush=True)
