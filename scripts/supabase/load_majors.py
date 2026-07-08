#!/usr/bin/env python3
"""One-time load of golf & tennis majors into Supabase (source of record).

Reads the freshly built public/data/majors/{golf,tennis}.json plus the real
major dates from public/data/champions-history.json, and upserts into
public.golf_majors, tennis_majors, golf_ryder_cup, tennis_davis_cup.

Run natively (the Cowork sandbox has no Supabase egress). Uses the public anon
key together with a TEMPORARY anon-write RLS policy (added/removed via the
Supabase MCP around this run). Idempotent: safe to re-run.

    python scripts/supabase/load_majors.py [ANON_KEY]

The anon key is taken from argv[1], else SUPABASE_ANON_KEY /
NEXT_PUBLIC_SUPABASE_ANON_KEY, else parsed from .env.local / .env.
"""
import os, sys, json, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
MAJORS = os.path.join(ROOT, "public", "data", "majors")
HISTORY = os.path.join(ROOT, "public", "data", "champions-history.json")

def _key():
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return sys.argv[1].strip()
    for name in ("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"):
        v = os.environ.get(name)
        if v:
            return v.strip()
    for fn in (".env.local", ".env"):
        p = os.path.join(ROOT, fn)
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                line = line.strip()
                for name in ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"):
                    if line.startswith(name + "="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("No anon key found. Pass it as the first argument.")

def _headers(key):
    h = {"apikey": key, "Content-Type": "application/json",
         "Prefer": "resolution=merge-duplicates,return=minimal"}
    if not key.startswith("sb_"):  # JWT anon key wants Bearer; sb_ publishable keys do not
        h["Authorization"] = f"Bearer {key}"
    return h

def upsert(key, table, on_conflict, records, chunk=500):
    total = 0
    for i in range(0, len(records), chunk):
        part = records[i:i + chunk]
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{table}?on_conflict={on_conflict}",
            data=json.dumps(part).encode("utf-8"),
            headers=_headers(key), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120):
                total += len(part)
        except urllib.error.HTTPError as e:
            sys.exit(f"{table}: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:300]}")
    return total

def _golf_dates():
    """(year, golf tournament name) -> YYYY-MM-DD, from champions-history.json."""
    name = {"US Open Championship": "U.S. Open", "Masters Tournament": "Masters Tournament",
            "PGA Championship": "PGA Championship", "The Open Championship": "The Open Championship"}
    out = {}
    if os.path.exists(HISTORY):
        for r in json.load(open(HISTORY, encoding="utf-8")):
            g = name.get(r.get("competition"))
            if g and r.get("year") and r.get("date"):
                out[(r["year"], g)] = str(r["date"])[:10]
    return out

def main():
    key = _key()
    golf = json.load(open(os.path.join(MAJORS, "golf.json"), encoding="utf-8"))
    tennis = json.load(open(os.path.join(MAJORS, "tennis.json"), encoding="utf-8"))
    dates = _golf_dates()

    golf_rows = [{
        "year": c["year"], "tournament": c["tournament"], "champion": c["champion"],
        "nation": c.get("nation"), "career_no": c.get("careerNo"), "career_total": c.get("careerTotal"),
        "note": c.get("note") or "", "event_date": dates.get((c["year"], c["tournament"])),
        "venue": c.get("venue"), "metro_slug": c.get("metroSlug"), "metro_name": c.get("metroName"),
    } for c in golf["champions"]]

    tennis_rows = [{
        "year": c["year"], "tournament": c["tournament"], "gender": c.get("gender"),
        "champion": c["champion"], "nation": c.get("nation"), "career_no": c.get("careerNo"),
        "career_total": c.get("careerTotal"), "note": c.get("note") or "",
        "venue": c.get("venue"), "metro_slug": c.get("metroSlug"), "metro_name": c.get("metroName"),
    } for c in tennis["champions"] if c.get("gender") in ("M", "W")]

    ryder_rows = [{
        "edition": r["edition"], "year": r["year"], "winner": r.get("winner"), "score": r.get("score"),
        "host": r.get("host"), "venue": r.get("venue"), "us_captain": r.get("usCaptain"),
        "home_captain": r.get("homeCaptain"), "metro_slug": r.get("metroSlug"), "metro_name": r.get("metroName"),
    } for r in golf.get("ryder", [])]

    davis_rows = [{
        "country": d["country"], "titles": d.get("titles", 0), "title_years": d.get("titleYears"),
        "runner_up": d.get("runnerUp", 0), "runner_up_years": d.get("runnerUpYears"),
    } for d in tennis.get("davis", [])]

    print(f"golf_majors:     {upsert(key, 'golf_majors', 'year,tournament', golf_rows)} rows")
    print(f"tennis_majors:   {upsert(key, 'tennis_majors', 'year,tournament,gender,note', tennis_rows)} rows")
    print(f"golf_ryder_cup:  {upsert(key, 'golf_ryder_cup', 'edition', ryder_rows)} rows")
    print(f"tennis_davis_cup:{upsert(key, 'tennis_davis_cup', 'country', davis_rows)} rows")
    dated = sum(1 for r in golf_rows if r["event_date"])
    print(f"(golf dates attached: {dated}/{len(golf_rows)})")

if __name__ == "__main__":
    main()
