#!/usr/bin/env python3
"""Pull SKYDB completed structures at 150 m+ architectural height into Supabase.

Scope: buildings (02.1), telecommunications towers (02.2.5.12) and observation
towers (02.2.5.10). That whitelist is deliberate - it keeps the CN Tower and
Tokyo Tower while dropping wired masts, chimneys and bridge pylons, which the
height-sorted list is otherwise full of.

Three things this guards against:

  1. THROTTLING THAT LOOKS LIKE SUCCESS. SKYDB returns HTTP 200 with a stub body
     carrying `ratelimit_class` when you are over quota. Checking the status code
     alone would read an empty result as real and quietly wipe the table.
  2. DOUBLE-WRAPPED RESPONSES. Some calls put items at data.items, others nest a
     second {ok,data,meta} envelope inside data. Unwrap defensively.
  3. A COLLAPSED FETCH OVERWRITING GOOD DATA. If a run returns far fewer rows
     than the table already holds, it aborts instead of upserting.

Usage:
  python fetch_structures.py --dry-run     count only, writes nothing
  python fetch_structures.py --write
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request, urllib.error, datetime
sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
API = "https://www.skydb.net/api/v1/structures"
UA = "CitizenOfNowhere-metro-data/1.0 (https://rankings.citizenofnowhere.org)"
SUPA = "https://nmprqkmymrdknffwnuur.supabase.co"
FORMS = [("02.1", "buildings"), ("02.2.5.12", "telecommunications towers"),
         ("02.2.5.10", "observation towers")]
HEIGHT_FROM = 150
PAGESIZE = 100
SLEEP = 2.0          # ~30 req/min against a 2,000/hr allowance
MIN_KEEP_RATIO = 0.8  # abort the write if a run returns <80% of what we hold
OFFSET_CAP = 10000   # Elasticsearch max_result_window; `from` above this returns nothing
BAND_SAFETY = 9000   # split a height band once it gets within reach of the cap
BAND_CEILING = 1200  # metres; nothing standing is taller, so this is a safe open top
BAND_MAX_DEPTH = 8

BASE = {"height_from": HEIGHT_FROM, "status": "status.4.1",
        "height_measure": "height_architectural", "sort": "height", "sortdirection": "desc"}


def read_key(path, label):
    if not os.path.exists(path):
        sys.exit(f"missing {label} at {path}")
    return open(path, encoding="utf-8").read().strip()


SKY_KEY = read_key(os.path.join(HERE, "skydb_key.txt"), "SKYDB token")
SUPA_KEY = read_key(os.path.join(ROOT, "scripts", "mktcap", "supabase_key.txt"), "Supabase key")


class Throttled(Exception):
    pass


def unwrap(body):
    """data.items on most calls, but a second {ok,data,meta} envelope on some."""
    d = body.get("data") or {}
    while isinstance(d, dict) and "items" not in d and isinstance(d.get("data"), dict):
        d = d["data"]
    return d


def api(params, tries=4):
    for attempt in range(tries):
        u = API + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json",
                                                 "Authorization": "Bearer " + SKY_KEY})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                wait = 30 * (attempt + 1)
                print(f"      HTTP {e.code}; sleeping {wait}s", flush=True)
                time.sleep(wait)
                continue
            raise
        # HTTP 200 but throttled: the trap their own docs warn about
        if "ratelimit_class" in json.dumps(body):
            if attempt < tries - 1:
                wait = 120 * (attempt + 1)
                print(f"      THROTTLED (200 + ratelimit_class); backing off {wait}s", flush=True)
                time.sleep(wait)
                continue
            raise Throttled("still throttled after retries")
        return body
    raise Throttled("exhausted retries")


def band_total(code, lo, hi):
    p = {**BASE, "structuralform": code, "height_from": lo, "pagesize": 1}
    if hi is not None:
        p["height_to"] = hi
    n = unwrap(api(p)).get("total") or 0
    time.sleep(SLEEP)
    return n


def bands(code, total):
    """Height bands whose individual counts each sit under the offset cap.

    SKYDB pages with `from`, and the search backend refuses any offset past
    10,000 - a form with 10,191 matches silently returns exactly 10,000 and the
    rest are unreachable. Splitting on height sidesteps that: each band is its
    own query with its own offset window. Bands share their boundary metre
    (band n ends where band n+1 begins) so nothing can fall between them
    whichever way the API rounds; the caller dedupes on id.
    """
    if total <= BAND_SAFETY:
        return [(HEIGHT_FROM, None)]
    out = []

    def split(lo, hi, n, depth):
        if n <= BAND_SAFETY or depth >= BAND_MAX_DEPTH:
            out.append((lo, hi))
            return
        top = hi if hi is not None else BAND_CEILING
        mid = (lo + top) // 2
        if mid <= lo or mid >= top:
            out.append((lo, hi))
            return
        lower = band_total(code, lo, mid)
        upper = n - lower  # boundary overlap makes this a slight under-count, which is safe
        split(lo, mid, lower, depth + 1)
        split(mid, hi, max(upper, 0), depth + 1)

    split(HEIGHT_FROM, None, total, 0)
    return out


def row_of(it, run_id):
    city = it.get("city") or {}
    country = it.get("country") or {}
    return {
        "skydb_id": it.get("id"),
        "name": it.get("name"),
        "height_m": it.get("height_m") if isinstance(it.get("height_m"), (int, float)) else None,
        "floors": it.get("floors") if isinstance(it.get("floors"), int) else None,
        "year": it.get("year") if isinstance(it.get("year"), int) else None,
        "status": it.get("status"),
        "status_group": it.get("status_group") if isinstance(it.get("status_group"), int) else None,
        "structural_kind": it.get("structural_kind"),
        "structural_form": it.get("structural_form"),
        "structural_form_id": it.get("structural_form_id"),
        "lat": it.get("lat"), "lon": it.get("lon"),
        "address": it.get("address"),
        "city_id": city.get("id"), "city_name": city.get("name"),
        "country_id": country.get("id"), "country_name": country.get("name"),
        "country_code": country.get("code") or country.get("iso") or country.get("key"),
        "slug": it.get("slug"), "url": it.get("url"),
        "run_id": run_id,
    }


def supa(method, path, body=None, params=""):
    import urllib.request as ur
    u = f"{SUPA}/rest/v1/{path}{params}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = {"apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY,
         "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}
    req = ur.Request(u, data=data, headers=h, method=method)
    with ur.urlopen(req, timeout=120) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def existing_count():
    import urllib.request as ur
    req = ur.Request(f"{SUPA}/rest/v1/skydb_structures?select=skydb_id&limit=1",
                     headers={"apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY,
                              "Prefer": "count=exact", "Range": "0-0"})
    with ur.urlopen(req, timeout=60) as r:
        cr = r.headers.get("Content-Range", "*/0")
    try:
        return int(cr.split("/")[-1])
    except Exception:
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    rows, seen = [], set()
    for code, form_label in FORMS:
        head = api({**BASE, "structuralform": code, "pagesize": 1})
        total = unwrap(head).get("total") or 0
        print(f"{form_label} ({code}): {total:,}")
        time.sleep(SLEEP)
        if args.dry_run:
            continue
        got = 0
        plan = bands(code, total)
        if len(plan) > 1:
            print(f"   {total:,} is over the {OFFSET_CAP:,} offset cap; "
                  f"splitting into {len(plan)} height bands", flush=True)
        for lo, hi in plan:
            span = {**BASE, "structuralform": code, "height_from": lo}
            if hi is not None:
                span["height_to"] = hi
            n = unwrap(api({**span, "pagesize": 1})).get("total") or 0
            time.sleep(SLEEP)
            if n > OFFSET_CAP:
                print(f"      !! band {lo}-{hi} holds {n:,}, above the {OFFSET_CAP:,} offset cap; "
                      "rows beyond it are unreachable and will be MISSING", flush=True)
            blabel = f"{lo}-{hi}" if hi is not None else f"{lo}+"
            for off in range(0, min(n, OFFSET_CAP), PAGESIZE):
                items = unwrap(api({**span, "pagesize": PAGESIZE, "from": off})).get("items") or []
                if not items:
                    break
                for it in items:
                    if it.get("id") in seen:
                        continue
                    seen.add(it.get("id"))
                    rows.append(row_of(it, run_id))
                got += len(items)
                time.sleep(SLEEP)
            print(f"      band {blabel:>10s}: {n:,}", flush=True)
        print(f"   collected {got:,} (distinct so far {len(seen):,})")

    if args.dry_run:
        print("\nDRY RUN - nothing fetched or written")
        return
    print(f"\ntotal distinct rows fetched: {len(rows):,}")

    have = existing_count()
    if have and len(rows) < have * MIN_KEEP_RATIO:
        sys.exit(f"REFUSING TO WRITE: fetched {len(rows):,} but the table already holds {have:,}. "
                 "A collapsed fetch must never overwrite good data - investigate before rerunning.")
    if not args.write:
        print("no --write flag; stopping before the upsert")
        return
    for i in range(0, len(rows), 500):
        supa("POST", "skydb_structures", rows[i:i + 500], "?on_conflict=skydb_id")
        print(f"   upserted {min(i+500, len(rows)):,}/{len(rows):,}", flush=True)
    print(f"done. table now holds {existing_count():,} rows")


if __name__ == "__main__":
    main()
