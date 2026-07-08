#!/usr/bin/env python3
"""Live rugby results ingest: pull completed men's internationals from the World
Rugby Pulselive API and upsert them into public.rugby_results (Supabase source of
truth). Idempotent on (date, team, opp), so a staged fixture row gets its scores
filled in once the match is played.

Pulselive sport=mru also returns club rugby, so we keep only matches where BOTH
teams are tracked test nations. Competition flags (Six Nations / Rugby
Championship / Nations Championship / World Cup) are derived from the competition
label, matching the workbook convention (mirrors scripts/rugby/fetch_results_staging.py).

Env: SUPABASE_URL, SUPABASE_WRITE_KEY (sb_secret_...), RUGBY_SINCE (YYYY-MM-DD; default 45 days ago).
"""
import json, os, sys, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone, timedelta

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
API = "https://api.wr-rims-prod.pulselive.com/rugby/v3/match"
UA = "MetroPowerRankingsBot/1.0 (+https://github.com/ashwin-desikan)"
TABLE = "rugby_results"

TRACKED = {"Argentina","Australia","Canada","Chile","England","Fiji","France","Georgia",
           "Ireland","Italy","Ivory Coast","Japan","Namibia","New Zealand","Portugal",
           "Romania","Russia","Samoa","Scotland","South Africa","Spain","Tonga",
           "United States","Uruguay","Wales","Western Samoa","Zimbabwe"}
ALIASES = {"USA": "United States", "United States of America": "United States",
           "Cote d'Ivoire": "Ivory Coast"}
# competition needle -> flag (HN=Home/Five/Six Nations, TRC=Tri/Rugby Champ, NC, RWC)
COMP_RULES = [("six nations", "HN"), ("five nations", "HN"), ("home nations", "HN"),
              ("rugby championship", "TRC"), ("tri nations", "TRC"),
              ("rugby world cup", "RWC"), ("nations championship", "NC")]

IN_SCOPE = ["six nations", "five nations", "home nations", "rugby championship",
            "tri nations", "rugby world cup", "nations championship", "men's internationals",
            "autumn", "summer", "end-of-year", "tour of", "greatest rivalry"]

def comp_in_scope(label):
    low = (label or "").lower()
    return any(p in low for p in IN_SCOPE)

def canon(n):
    n = (n or "").strip()
    return ALIASES.get(n, n)

def comp_fields(label):
    low = (label or "").lower()
    year = ""
    for tok in (label or "").split():
        if tok[:4].isdigit() and len(tok) >= 4:
            year = tok[:4]
    templates = {"HN": "{y} Six Nations Championship", "TRC": "{y} Rugby Championship",
                 "RWC": "{y} Rugby World Cup", "NC": "{y} Nations Championship"}
    for needle, flag in COMP_RULES:
        if needle in low:
            # keep tri-nations label distinct if present
            if needle == "tri nations":
                return (f"{year} Tri Nations Series".strip(), "TRC")
            return (templates[flag].format(y=year).strip(), flag)
    base = " ".join(t for t in (label or "").split() if t[:4] != year)
    return ((f"{year} {base}".strip() if year else (label or "")), "TEST")

def _get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def fetch_completed(start, end):
    out, page = [], 0
    while True:
        j = _get({"states": "C", "sport": "mru", "startDate": start, "endDate": end,
                  "page": page, "pageSize": 100, "sort": "asc"})
        out.extend(j.get("content", []))
        page += 1
        if page >= int((j.get("pageInfo") or {}).get("numPages", 1)):
            return out

def to_date(m):
    ms = (m.get("time") or {}).get("millis")
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y%m%d") if ms else None

def rows_for(m):
    teams = [canon(t.get("name")) for t in (m.get("teams") or [])]
    if len(teams) != 2 or not all(teams):
        return []
    if not all(t in TRACKED for t in teams):
        return []                      # keep internationals only (both tracked nations)
    scores = m.get("scores") or []
    if len(scores) != 2 or scores[0] is None or scores[1] is None:
        return []                      # completed only (both scores present)
    d = to_date(m)
    if not d:
        return []
    label = m.get("competition") or ";".join(e.get("label", "") for e in (m.get("events") or []))
    if not comp_in_scope(label):
        return []                      # match the workbook's tracked-competition curation
    comp, flag = comp_fields(label)
    stage = (m.get("eventPhase") or "").strip()
    v = m.get("venue") or {}
    sa, sb = int(scores[0]), int(scores[1])
    def one(i):
        pf, pa = (sa, sb) if i == 0 else (sb, sa)
        return {
            "date": d, "team": teams[i], "wld": "W" if pf > pa else ("L" if pf < pa else "D"),
            "opp": teams[1 - i], "pf": pf, "pa": pa, "comp": comp, "stage": stage,
            "stadium": v.get("name") or None, "city": v.get("city") or None,
            "country": v.get("country") or None, "home_away": "Home" if i == 0 else "Away",
            "home_five_six_nations": flag == "HN", "tri_nations_rugby_champ": flag == "TRC",
            "nations_championship": flag == "NC", "rugby_world_cup": flag == "RWC",
        }
    return [one(0), one(1)]

def upsert(rows):
    if not KEY:
        sys.exit("SUPABASE_WRITE_KEY not set; refusing to write.")
    headers = {"apikey": KEY, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    if KEY.count(".") == 2:
        headers["Authorization"] = f"Bearer {KEY}"
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{TABLE}?on_conflict=date,team,opp",
                                 data=json.dumps(rows).encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as ex:
        sys.exit(f"HTTP {ex.code} upserting {TABLE}: {ex.read().decode(errors='replace')[:300]}")

if __name__ == "__main__":
    since = os.environ.get("RUGBY_SINCE") or (datetime.now(timezone.utc) - timedelta(days=45)).strftime("%Y-%m-%d")
    end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    matches = fetch_completed(since, end)
    rows = [r for m in matches for r in rows_for(m)]
    if not rows:
        print(f"No completed internationals {since}..{end}; nothing to do.")
        sys.exit(0)
    upsert(rows)
    print(f"rugby results ingest: upserted {len(rows)} perspective rows "
          f"({len(rows)//2} internationals) {since}..{end}")
