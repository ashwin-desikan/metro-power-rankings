#!/usr/bin/env python3
"""
fetch-billionaires.py — runs in the GitHub Action.
Pulls Forbes real-time billionaires from the free rtb-api (komed3/rtb-api,
MIT licensed) and writes public/data/billionaires_raw.json — the structured
input for build-billionaires.py. Uses 2-3 large JSON files (the ranked list +
the profile index + the industry labels), not per-person requests.
"""
import json, sys
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/data/billionaires_raw.json"
BASE = "https://cdn.statically.io/gh/komed3/rtb-api/main/api/"
UA = {"User-Agent": "metro-power-rankings billionaires-refresh/1.0 (github actions)"}

def gj(path, max_seconds=150, attempts=3):
    # Hard total-time cap per fetch: stream the body and abort if it runs long,
    # so a huge/slow CDN file can never hang the job. The CDN (statically.io)
    # intermittently stalls mid-stream, so retry a few times with backoff before
    # giving up. Connect 15s, read-inactivity 60s, total <= max_seconds.
    import time, json as _json
    last = None
    for attempt in range(attempts):
        start = time.time()
        try:
            r = requests.get(BASE + path, headers=UA, timeout=(15, 60), stream=True)
            r.raise_for_status()
            buf = []
            for chunk in r.iter_content(chunk_size=1 << 16):
                if chunk:
                    buf.append(chunk)
                if time.time() - start > max_seconds:
                    raise TimeoutError(f"{path}: exceeded {max_seconds}s ({sum(len(b) for b in buf)} bytes) — endpoint too large/slow")
            return _json.loads(b"".join(buf).decode("utf-8", "replace"))
        except (requests.exceptions.RequestException, TimeoutError) as ex:
            last = ex
            if attempt < attempts - 1:
                time.sleep(3 * (attempt + 1))
    raise last

def first(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ""):
            return d[k]
    return default

def main():
    lst = gj("list/rtb/latest")
    rows = lst.get("list") if isinstance(lst, dict) else lst

    # Country per billionaire via the lightweight per-country filter lists.
    # (The bulk profile index is hundreds of MB / many minutes — avoid it.)
    uri_country = {}
    try:
        cidx = gj("filter/country/_index")
        keys = list(cidx.keys()) if isinstance(cidx, dict) else [first(c, "key", "code", "iso") for c in cidx]
    except Exception as e:
        keys = []; print("WARN country index:", e)
    for key in keys:
        if not key:
            continue
        try:
            cl = gj(f"filter/country/{key}")
            items = cl.get("list") if isinstance(cl, dict) else cl
            for it in items or []:
                u = it if isinstance(it, str) else first(it, "uri", "id")
                if u:
                    uri_country[u] = str(key).lower()
        except Exception:
            continue

    # Self-made set
    selfmade = set()
    try:
        sm = gj("filter/selfMade")
        items = sm.get("list") if isinstance(sm, dict) else sm
        for it in items or []:
            u = it if isinstance(it, str) else first(it, "uri", "id")
            if u:
                selfmade.add(u)
    except Exception:
        pass

    # Industry key -> label
    try:
        idx = gj("stats/industry/_index")
        ind_labels = idx if isinstance(idx, dict) else {i.get("key"): i.get("name") for i in idx}
    except Exception:
        ind_labels = {}

    def label_industries(val):
        if isinstance(val, str):
            val = [val]
        return [ind_labels.get(k) or str(k).replace("-", " ").title() for k in (val or [])]

    out = []
    for r in rows:
        uri = first(r, "uri", "id")
        if not uri:
            continue
        out.append({
            "uri": uri,
            "name": first(r, "name") or uri.replace("-", " ").title(),
            "networth": first(r, "networth", "net_worth", "worth"),   # millions USD
            "rank": first(r, "rank"),
            "countryCode": uri_country.get(uri),
            "industries": label_industries(first(r, "industry", "industries") or []),
            "birthDate": None,
            "selfMade": (uri in selfmade) if selfmade else None,
            "gender": None,
            "source": first(r, "source", "companies") or [],
        })
    out = [b for b in out if b["networth"] is not None]
    if len(out) < 1000:
        sys.exit(f"only {len(out)} billionaires parsed — aborting (rtb-api schema may have changed)")
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    linked = sum(1 for b in out if b["countryCode"])
    print(f"parsed {len(out)} billionaires ({linked} with a country) -> {OUT.name}")

if __name__ == "__main__":
    main()
