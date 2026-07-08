#!/usr/bin/env python3
"""Review and promote auto-detected major champions (the "confirm" half of Phase 2).

    python scripts/supabase/promote_pending.py                 # list pending
    SUPABASE_WRITE_KEY=... python .../promote_pending.py promote <id>
    SUPABASE_WRITE_KEY=... python .../promote_pending.py reject <id>

Promote upserts the pending row into the live golf_majors / tennis_majors table
and marks it promoted. Host metro is auto-resolved from a prior edition of the
same venue (golf) or tournament (tennis) when the staged row lacks one. If the
nation or metro looks wrong, fix the row in Supabase Studio before promoting.
After a promote, re-run build-majors-data.py and commit the regenerated JSON.
"""
import os, sys, json, urllib.request, urllib.parse

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
SB_READ = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
           or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")
WRITE_KEY = (os.environ.get("SUPABASE_WRITE_KEY") or "").strip()

def _hdr(key, extra=None):
    h = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):
        h["Authorization"] = f"Bearer {key}"
    if extra: h.update(extra)
    return h

def sb_get(table, query):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{table}?{query}", headers=_hdr(SB_READ))
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def sb_write(method, table, query, body):
    if not WRITE_KEY:
        sys.exit("SUPABASE_WRITE_KEY not set — needed to promote/reject.")
    url = f"{SB_URL}/rest/v1/{table}" + (f"?{query}" if query else "")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    hdr = _hdr(WRITE_KEY, {"Prefer": "resolution=merge-duplicates,return=minimal"})
    req = urllib.request.Request(url, data=data, method=method, headers=hdr)
    with urllib.request.urlopen(req, timeout=60):
        return True

def list_pending():
    rows = sb_get("majors_pending", "select=*&status=eq.pending&order=year.desc,sport")
    if not rows:
        print("no pending champions."); return
    print(f"{len(rows)} pending:")
    for r in rows:
        print(f"  [{r['id']}] {r['sport']:6} {r['year']} {r['tournament']} {r.get('gender') or ''} — "
              f"{r['champion']} ({r.get('nation') or 'nation?'}) @ {r.get('venue') or 'venue?'} "
              f"metro={r.get('metro_slug') or '—'}")
    print("\npromote:  python scripts/supabase/promote_pending.py promote <id>")

def resolve_metro(row):
    if row.get("metro_slug"):
        return row["metro_slug"], row.get("metro_name")
    try:
        if row["sport"] == "golf" and row.get("venue"):
            m = sb_get("golf_majors", f"select=metro_slug,metro_name&venue=eq.{urllib.parse.quote(row['venue'])}&metro_slug=not.is.null&limit=1")
        else:
            m = sb_get("tennis_majors", f"select=metro_slug,metro_name&tournament=eq.{urllib.parse.quote(row['tournament'])}&metro_slug=not.is.null&limit=1")
        if m:
            return m[0]["metro_slug"], m[0].get("metro_name")
    except Exception:
        pass
    return None, None

def promote(pid):
    rows = sb_get("majors_pending", f"select=*&id=eq.{pid}&status=eq.pending")
    if not rows:
        sys.exit(f"no pending row id={pid}")
    r = rows[0]
    mslug, mname = resolve_metro(r)
    if r["sport"] == "golf":
        rec = {"year": r["year"], "tournament": r["tournament"], "champion": r["champion"],
               "nation": r.get("nation"), "note": "", "event_date": r.get("event_date"),
               "venue": r.get("venue"), "metro_slug": mslug, "metro_name": mname}
        sb_write("POST", "golf_majors", "on_conflict=year,tournament", [rec])
    else:
        rec = {"year": r["year"], "tournament": r["tournament"], "gender": r["gender"], "champion": r["champion"],
               "nation": r.get("nation"), "note": "", "venue": r.get("venue"), "metro_slug": mslug, "metro_name": mname}
        sb_write("POST", "tennis_majors", "on_conflict=year,tournament,gender,note", [rec])
    sb_write("PATCH", "majors_pending", f"id=eq.{pid}", {"status": "promoted"})
    print(f"promoted [{pid}] {r['year']} {r['tournament']} {r.get('gender') or ''} — {r['champion']} "
          f"(nation {r.get('nation') or '—'}, metro {mslug or '—'})")
    print("Next: python scripts/build-majors-data.py  then commit the regenerated JSON.")

def reject(pid):
    sb_write("PATCH", "majors_pending", f"id=eq.{pid}", {"status": "rejected"})
    print(f"rejected [{pid}]")

def main():
    a = sys.argv[1:]
    if not a or a[0] == "list":
        list_pending()
    elif a[0] == "promote" and len(a) == 2:
        promote(a[1])
    elif a[0] == "reject" and len(a) == 2:
        reject(a[1])
    else:
        sys.exit("usage: promote_pending.py [list | promote <id> | reject <id>]")

if __name__ == "__main__":
    main()
