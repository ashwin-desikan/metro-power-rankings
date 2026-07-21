#!/usr/bin/env python3
"""Auto-detect golf & tennis major champions from ESPN and STAGE them for review.

Phase 2 of the majors → Supabase migration (Ashwin chose auto-detect + confirm).
When a major shows final on ESPN, the winner is written to public.majors_pending
with status='pending' — NOT to the live golf_majors/tennis_majors tables. A human
promotes it with scripts/supabase/promote_pending.py after checking the nation and
host metro (the fields most likely to be wrong from an automated read).

Reads ESPN (public) + the live tables (anon read) and writes majors_pending with
SUPABASE_WRITE_KEY. Without that key it runs DRY (prints detections, writes nothing),
which is handy for testing the detection off-season.

    SUPABASE_WRITE_KEY=... python scripts/ingest/majors_ingest.py
    python scripts/ingest/majors_ingest.py          # dry run
"""
import os, sys, json, datetime, urllib.request, urllib.parse, urllib.error

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
SB_READ = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
           or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")
WRITE_KEY = (os.environ.get("SUPABASE_WRITE_KEY") or "").strip()
DEBUG = "--debug" in sys.argv

GOLF_URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard"
TENNIS_URL = {"atp": "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
              "wta": "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard"}
UA = {"User-Agent": "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0)", "Accept": "application/json"}

# LOOKBACK_DAYS: without an explicit `dates=` range, ESPN's site.api scoreboard
# endpoints default to a "current" window (effectively "today"/"this event").
# A major that just finished can scroll out of that window before the NEXT
# day's cron looks at it — e.g. the ATP tour moves on to its next event the
# Monday after Wimbledon, so a same-day-ish miss then compounds into a
# multi-day miss (observed: Wimbledon 2026 men's final went undetected for 3
# straight daily runs). Widening the query to a rolling lookback keeps a
# just-finished major visible to `detect_*()` for several days after it ends,
# so a transient miss self-heals on the next run instead of persisting.
LOOKBACK_DAYS = 14

def _windowed(url):
    end = datetime.date.today()
    start = end - datetime.timedelta(days=LOOKBACK_DAYS)
    return f"{url}?dates={start:%Y%m%d}-{end:%Y%m%d}"

def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def _hdr(key):
    h = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):
        h["Authorization"] = f"Bearer {key}"
    return h

def sb_get(table, query):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{table}?{query}", headers=_hdr(SB_READ))
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def sb_upsert(table, rows, on_conflict):
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{table}?on_conflict={on_conflict}",
        data=json.dumps(rows).encode("utf-8"), method="POST",
        headers={**_hdr(WRITE_KEY), "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=60):
        return len(rows)

# ESPN flag `alt` is a display label; normalize the ones that differ from the
# nation names used in the majors tables. Golf keeps home nations (England,
# Scotland, Wales, Northern Ireland) separate, so those pass through as-is.
NATION_FIX = {"USA": "United States", "U.S.A.": "United States", "US": "United States"}

def flag_nation(flag):
    alt = (flag or {}).get("alt")
    if not alt:
        return None
    return NATION_FIX.get(alt, alt)

def map_golf(name):
    n = (name or "").lower()
    # More specific patterns first, so "The Open Championship" can't shadow
    # "U.S. Open" (or vice versa) regardless of substring overlap.
    if "pga championship" in n: return "PGA Championship"
    if "masters" in n: return "Masters Tournament"
    if "u.s. open" in n or "us open" in n: return "U.S. Open"
    # ESPN's PGA scoreboard labels this event bare "The Open" (confirmed via a
    # --debug run 2026-07-21), not "The Open Championship" -- the old check
    # only matched the "open championship" substring, silently dropped this
    # event (major=(no)), and the 2026 champion went undetected all week.
    if "open championship" in n or n == "the open" or n.startswith("the open "):
        return "The Open Championship"
    return None

def map_tennis(name):
    n = (name or "").lower()
    if "australian" in n: return "Australian Open"
    if "roland" in n or "french" in n: return "French Open"
    if "wimbledon" in n: return "Wimbledon"
    if "us open" in n or "u.s. open" in n: return "US Open"
    return None

def detect_golf():
    out = []
    try:
        root = get_json(_windowed(GOLF_URL))
    except Exception as e:
        print(f"golf feed error: {e}", file=sys.stderr); return out
    for ev in root.get("events", []):
        canon = map_golf(ev.get("name"))
        comp = (ev.get("competitions") or [{}])[0]
        state = (((comp.get("status") or {}).get("type") or {}).get("state"))
        if DEBUG:
            print(f"  [golf] event={ev.get('name')!r} -> major={canon or '(no)'} state={state}")
        if not canon: continue
        if state != "post":
            continue  # only completed majors
        comps = sorted(comp.get("competitors", []), key=lambda c: c.get("order", 9999))
        if not comps: continue
        w = comps[0]
        ath = w.get("athlete") or {}
        champ = ath.get("displayName") or ath.get("fullName")
        if not champ: continue
        date = (ev.get("date") or "")[:10]
        out.append({"sport": "golf", "year": int(date[:4]) if date[:4].isdigit() else None,
                    "tournament": canon, "gender": None, "champion": champ,
                    "nation": flag_nation(ath.get("flag")), "venue": (comp.get("venue") or {}).get("fullName"),
                    "event_date": date or None,
                    "raw": {"event": ev.get("name"), "espn_id": ev.get("id"), "toPar": w.get("score")}})
    return out

def detect_tennis():
    out = []
    for tour, url in TENNIS_URL.items():
        gender = "M" if tour == "atp" else "W"
        try:
            root = get_json(_windowed(url))
        except Exception as e:
            print(f"tennis {tour} feed error: {e}", file=sys.stderr); continue
        for ev in root.get("events", []):
            if DEBUG and ev.get("major"):
                print(f"  [tennis {tour}] major event={ev.get('name')!r} -> {map_tennis(ev.get('name')) or '(no map)'}")
            if ev.get("major") is not True: continue
            canon = map_tennis(ev.get("name"))
            if not canon: continue
            date = (ev.get("date") or "")[:10]
            for g in ev.get("groupings", []):
                gdl = ((g.get("grouping") or {}).get("displayName") or "").lower()
                if "singles" not in gdl or "doubles" in gdl or "mixed" in gdl: continue
                ggender = "W" if ("women" in gdl or "ladies" in gdl) else ("M" if ("gentlemen" in gdl or "men" in gdl) else None)
                if ggender and ggender != gender: continue
                if DEBUG:
                    rounds = sorted({((c.get("round") or {}).get("displayName") or "?") for c in g.get("competitions", [])})
                    fin = [c for c in g.get("competitions", []) if ((c.get("round") or {}).get("displayName") or "").lower() == "final"]
                    fdone = any((((c.get("status") or {}).get("type") or {}).get("completed")) is True for c in fin)
                    print(f"  [tennis {tour}] {canon} singles rounds={rounds} final_present={bool(fin)} final_complete={fdone}")
                for c in g.get("competitions", []):
                    if ((c.get("round") or {}).get("displayName") or "").lower() != "final": continue
                    if (((c.get("status") or {}).get("type") or {}).get("completed")) is not True: continue
                    w = next((x for x in c.get("competitors", []) if x.get("winner") is True), None)
                    if not w: continue
                    ath = w.get("athlete") or {}
                    champ = ath.get("displayName") or ath.get("fullName")
                    if not champ: continue
                    out.append({"sport": "tennis", "year": int(date[:4]) if date[:4].isdigit() else None,
                                "tournament": canon, "gender": gender, "champion": champ,
                                "nation": flag_nation(ath.get("flag")), "venue": None, "event_date": date or None,
                                "raw": {"event": ev.get("name"), "espn_id": ev.get("id")}})
    return out

def already_live(d):
    if d["sport"] == "golf":
        q = f"select=year&year=eq.{d['year']}&tournament=eq.{urllib.parse.quote(d['tournament'])}&limit=1"
        return len(sb_get("golf_majors", q)) > 0
    q = (f"select=year&year=eq.{d['year']}&tournament=eq.{urllib.parse.quote(d['tournament'])}"
         f"&gender=eq.{d['gender']}&limit=1")
    return len(sb_get("tennis_majors", q)) > 0

def resolve_metro(d):
    # Host metro from a prior edition of the same venue (golf) or tournament (tennis).
    try:
        if d["sport"] == "golf" and d.get("venue"):
            m = sb_get("golf_majors", f"select=metro_slug,metro_name&venue=eq.{urllib.parse.quote(d['venue'])}&metro_slug=not.is.null&limit=1")
        else:
            m = sb_get("tennis_majors", f"select=metro_slug,metro_name&tournament=eq.{urllib.parse.quote(d['tournament'])}&metro_slug=not.is.null&limit=1")
        if m:
            return m[0]["metro_slug"], m[0].get("metro_name")
    except Exception:
        pass
    return None, None

def record_live(d):
    mslug, mname = resolve_metro(d)
    if d["sport"] == "golf":
        rec = {"year": d["year"], "tournament": d["tournament"], "champion": d["champion"],
               "nation": d.get("nation"), "note": "", "event_date": d.get("event_date"),
               "venue": d.get("venue"), "metro_slug": mslug, "metro_name": mname}
        sb_upsert("golf_majors", [rec], "year,tournament")
    else:
        rec = {"year": d["year"], "tournament": d["tournament"], "gender": d["gender"], "champion": d["champion"],
               "nation": d.get("nation"), "note": "", "venue": d.get("venue"), "metro_slug": mslug, "metro_name": mname}
        sb_upsert("tennis_majors", [rec], "year,tournament,gender,note")
    return mslug

def main():
    detected = detect_golf() + detect_tennis()
    fresh = []
    for d in detected:
        try:
            if already_live(d):
                print(f"already recorded, skipping: {d['year']} {d['tournament']} {d.get('gender') or ''} — {d['champion']}")
                continue
        except Exception as e:
            print(f"live-check error for {d['tournament']} {d['year']}: {e}", file=sys.stderr)
        fresh.append(d)

    for d in fresh:
        print(f"DETECTED: {d['year']} {d['tournament']} {d.get('gender') or ''} — {d['champion']} "
              f"({d.get('nation') or 'nation?'}) @ {d.get('venue') or 'venue?'}")

    if not fresh:
        print("no new champions to record."); return
    for d in fresh:
        print(f"NEW: {d['year']} {d['tournament']} {d.get('gender') or ''} — {d['champion']} "
              f"({d.get('nation') or 'nation?'}) @ {d.get('venue') or 'venue?'}")
    if not WRITE_KEY:
        print(f"\nDRY RUN ({len(fresh)} would be recorded) — set SUPABASE_WRITE_KEY to write to the live tables.")
        return
    wrote = 0
    for d in fresh:
        try:
            mslug = record_live(d)
            wrote += 1
            print(f"  recorded -> {d['tournament']} {d.get('gender') or ''} {d['champion']} (metro {mslug or '—'})")
        except Exception as e:
            print(f"  FAILED to record {d['tournament']} {d.get('gender') or ''} {d['champion']}: {e}", file=sys.stderr)
    print(f"\nrecorded {wrote} champion(s) into the live tables. Rebuild + commit will publish them.")

if __name__ == "__main__":
    main()
