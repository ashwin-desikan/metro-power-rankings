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

def gj(path):
    r = requests.get(BASE + path, headers=UA, timeout=120)
    r.raise_for_status()
    return r.json()

def first(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ""):
            return d[k]
    return default

def main():
    lst = gj("list/rtb/latest")
    rows = lst.get("list") if isinstance(lst, dict) else lst
    profiles = gj("profile/_index")
    if isinstance(profiles, list):
        profiles = {p.get("uri"): p for p in profiles if p.get("uri")}
    elif isinstance(profiles, dict) and "list" in profiles:
        profiles = {p.get("uri"): p for p in profiles["list"] if p.get("uri")}
    # industry key -> label
    try:
        idx = gj("stats/industry/_index")
        ind_labels = idx if isinstance(idx, dict) else {i.get("key"): i.get("name") for i in idx}
    except Exception:
        ind_labels = {}

    def label_industries(keys):
        out = []
        for k in keys or []:
            out.append(ind_labels.get(k) or k.replace("-", " ").title())
        return out

    out = []
    for r in rows:
        uri = first(r, "uri", "id")
        if not uri:
            continue
        p = profiles.get(uri, {}) if isinstance(profiles, dict) else {}
        res = p.get("residence") if isinstance(p.get("residence"), dict) else {}
        out.append({
            "uri": uri,
            "name": first(r, "name") or first(p, "name") or uri.replace("-", " ").title(),
            "networth": first(r, "networth", "net_worth", "worth"),   # millions USD
            "rank": first(r, "rank"),
            "countryCode": (first(p, "citizenship") or res.get("country") or "").lower() or None,
            "industries": label_industries(p.get("industry") or first(r, "industry") or []),
            "birthDate": first(p, "birthDate"),
            "selfMade": bool((p.get("selfMade") or {}).get("_is")) if isinstance(p.get("selfMade"), dict) else None,
            "gender": first(p, "gender"),
            "source": p.get("source") or [],
        })
    out = [b for b in out if b["networth"] is not None]
    if len(out) < 1000:
        sys.exit(f"only {len(out)} billionaires parsed — aborting (rtb-api schema may have changed)")
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"parsed {len(out)} billionaires -> {OUT.name}")

if __name__ == "__main__":
    main()
