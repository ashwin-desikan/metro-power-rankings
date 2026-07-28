#!/usr/bin/env python3
"""Daily api-football -> Supabase refresh for football_standings + football_fixtures.

Runs on the Mac mini (needs network). Reads APISPORTS_KEY and a Supabase write key
(SUPABASE_WRITE_KEY, else SUPABASE_SERVICE_KEY, else repo .env.local) from the env.

Modes:
  python refresh.py --self-test   offline parser tests, no network
  python refresh.py               DRY RUN: fetch + report, NO writes
  python refresh.py --write       fetch + upsert standings/fixtures, resolve new teams

INVARIANT (hard rule): EVERY team in EVERY league/competition must map to a Lookup club.
On --write, any api team not already in football_team is resolved against football_lookup
(the mirror of the workbook Lookup sheet) by exact API-Name, else unambiguous name match.
Resolved teams are inserted into football_team automatically. Anything that cannot be
resolved is NEVER stubbed: the run writes what it can, then EXITS 3 with an UNMATCHED alert
listing the teams, so they get added to Lookup (and picked up next sync). Keep Lookup current
with scripts/apifootball/sync_lookup.py (workbook -> football_lookup).

Notes: leagues.json is id-corrected (Faroe 367, Iceland 164, Switzerland 208, Ukraine 334).
Standings for every league; fixtures for the 5 continental comps. Brazil Serie D (76)
standings skipped (api roster unreliable). Idempotent upserts.
"""
import os, sys, json, time, re, unicodedata, urllib.request, urllib.parse, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://v3.football.api-sports.io"
SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")
CONTINENTAL = {2, 3, 848, 13, 531}
SKIP_STANDINGS = {76}
# Known upstream api-football ghosts: a spurious team_id that duplicates a real club already in
# the table (same slot/points, different id). Dropped from resolution -> not UNMATCHED, not written
# to the crosswalk (so the standings join filters its row off the site). Remove an id here once
# api-football cleans up. 22722 'Chapecoense B' = a 2nd copy of Chapecoense (132) at Serie A rank 20.
SKIP_TEAMS = {22722}
TRANS = str.maketrans({"ø":"o","Ø":"o","ł":"l","Ł":"l","æ":"ae","Æ":"ae","œ":"oe","ð":"d","þ":"th",
                       "ß":"ss","đ":"d","ı":"i","İ":"i","'":" ","’":" "})

def log(m): print("[football] " + m, flush=True)

def norm(s):
    s = str(s or "").translate(TRANS)
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()

def api_key():
    k = os.environ.get("APISPORTS_KEY")
    if not k:
        p = os.path.join(HERE, "_scratch", "apikey.txt")
        if os.path.exists(p): k = open(p).read().strip()
    if not k: sys.exit("APISPORTS_KEY not set")
    return k.strip()

def supa_key():
    for env in ("SUPABASE_WRITE_KEY", "SUPABASE_SERVICE_KEY"):
        if os.environ.get(env): return os.environ[env].strip()
    envf = os.path.abspath(os.path.join(HERE, "..", "..", ".env.local"))
    if os.path.exists(envf):
        for line in open(envf, encoding="utf-8"):
            if line.startswith("SUPABASE_SERVICE_KEY="): return line.split("=", 1)[1].strip()
    sys.exit("No Supabase write key (set SUPABASE_WRITE_KEY or SUPABASE_SERVICE_KEY)")

def api_get(path, key, **params):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{API}{path}?{q}", headers={"x-apisports-key": key})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as r: return json.load(r)
        except Exception as e:
            if attempt < 2: time.sleep(3 * (attempt + 1)); continue
            return {"_error": str(e)}

def supa_get(path, key, page=1000):
    rows, offset = [], 0
    sep = "&" if "?" in path else "?"
    while True:
        req = urllib.request.Request(f"{SUPA}{path}{sep}limit={page}&offset={offset}",
            headers={"apikey": key, "Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=60) as r:
            batch = json.load(r)
        rows += batch
        if len(batch) < page: return rows
        offset += page

def supa_upsert(table, rows, on_conflict, key, resolution="merge-duplicates", chunk=500):
    if not rows: return 0
    path = f"/rest/v1/{table}?on_conflict={urllib.parse.quote(on_conflict)}"
    n = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i+chunk]
        req = urllib.request.Request(SUPA + path, data=json.dumps(batch).encode(),
            headers={"apikey": key, "Authorization": "Bearer " + key,
                     "Content-Type": "application/json",
                     "Prefer": f"resolution={resolution},return=minimal"}, method="POST")
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=90) as r: n += len(batch); break
            except urllib.error.HTTPError as e:
                if attempt == 2: raise RuntimeError(f"{table}: HTTP {e.code} {e.read().decode()[:300]}")
                time.sleep(3)
    return n

def build_resolver(lookup_rows):
    # Match against the FULL mirrored Lookup, exactly as it is in the sheet (NO level filter).
    # api_name is the precise key. If the same api_name (or name alias) maps to two DIFFERENT
    # clubs, it is marked AMBIG and left unresolved (surfaced as an UNMATCHED alert) rather than
    # silently mis-matched. The collision guard in main() is the second line of defence.
    by_api, by_name = {}, {}
    def ident(r): return (r.get("team"), r.get("country"))
    for rec in lookup_rows:
        an = rec.get("api_name")
        if an:
            k = norm(an)
            if k:
                if k not in by_api: by_api[k] = rec
                elif by_api[k] != "AMBIG" and ident(by_api[k]) != ident(rec): by_api[k] = "AMBIG"
        for col in ("cur_name", "team", "lookup_name", "uefa_name", "uefa_name_2", "efs_name"):
            v = rec.get(col)
            if not v: continue
            k = norm(v)
            if not k: continue
            if k not in by_name: by_name[k] = rec
            elif by_name[k] != "AMBIG" and ident(by_name[k]) != ident(rec): by_name[k] = "AMBIG"
    def resolve(name):
        q = norm(name)
        r = by_api.get(q)
        if r == "AMBIG": return None
        if r: return r
        r = by_name.get(q)
        return r if (r and r != "AMBIG") else None
    return resolve


def check_collision(canon, country, tid, claim):
    """Return the team_id already owning (canon, country) if it differs from tid, else None.
    Guards the invariant that one canonical Lookup club maps to exactly one api team_id."""
    owner = claim.get((canon, country))
    return owner if (owner is not None and owner != tid) else None

def parse_standings(doc, league_id, season):
    rows, teams = [], {}
    for resp in (doc.get("response") or []):
        for grp in ((resp.get("league") or {}).get("standings") or []):
            glabel = (grp[0].get("group") if grp else "") or ""
            for row in grp:
                t = row.get("team") or {}; allm = row.get("all") or {}; g = allm.get("goals") or {}
                tid = t.get("id")
                if tid is None: continue
                teams[tid] = t.get("name")
                rows.append({"league_id": league_id, "season": season, "group_label": glabel,
                    "team_id": tid, "rank": row.get("rank"), "played": allm.get("played"),
                    "win": allm.get("win"), "draw": allm.get("draw"), "lose": allm.get("lose"),
                    "goals_for": g.get("for"), "goals_against": g.get("against"),
                    "goal_diff": row.get("goalsDiff"), "points": row.get("points"),
                    "form": row.get("form")})
    return rows, teams

def parse_fixtures(doc, league_id, season):
    rows, teams = [], {}
    for fx in (doc.get("response") or []):
        fixture = fx.get("fixture") or {}; league = fx.get("league") or {}
        tt = fx.get("teams") or {}; goals = fx.get("goals") or {}
        h = tt.get("home") or {}; a = tt.get("away") or {}
        if h.get("id"): teams[h["id"]] = h.get("name")
        if a.get("id"): teams[a["id"]] = a.get("name")
        if fixture.get("id") is None: continue
        rows.append({"fixture_id": fixture.get("id"), "league_id": league_id, "season": season,
            "round": league.get("round"), "kickoff": fixture.get("date"),
            "home_team_id": h.get("id"), "away_team_id": a.get("id"),
            "home_goals": goals.get("home"), "away_goals": goals.get("away"),
            "status": ((fixture.get("status") or {}).get("short"))})
    return rows, teams

def selftest():
    sdoc = {"response": [{"league": {"standings": [[
        {"rank": 1, "team": {"id": 33, "name": "Manchester United"}, "points": 9, "goalsDiff": 5,
         "form": "WWW", "all": {"played": 3, "win": 3, "draw": 0, "lose": 0, "goals": {"for": 7, "against": 2}}}]]}}]}
    s, t = parse_standings(sdoc, 39, 2026)
    assert len(s) == 1 and s[0]["team_id"] == 33 and s[0]["points"] == 9 and s[0]["goal_diff"] == 5, s
    fdoc = {"response": [{"fixture": {"id": 111, "date": "x", "status": {"short": "NS"}},
        "league": {"round": "R1"}, "teams": {"home": {"id": 33, "name": "A"}, "away": {"id": 40, "name": "B"}},
        "goals": {"home": None, "away": None}}]}
    f, t2 = parse_fixtures(fdoc, 2, 2026)
    assert len(f) == 1 and set(t2) == {33, 40}, f
    res = build_resolver([
        {"level": 1, "api_name": None, "country": "San Marino",
         "team": "SS Virtus", "lookup_name": "SS Virtus", "uefa_name": "AC Virtus"},
        {"level": 1, "team": "Nacional", "country": "Uruguay"},
        {"level": 1, "team": "Nacional", "country": "Paraguay"},
        {"level": None, "team": "Pharco FC", "api_name": "Pharco", "country": "Egypt"}])
    assert res("AC Virtus")["team"] == "SS Virtus"          # matches via uefa_name alias
    assert res("Nacional") is None                          # same name, two clubs -> ambiguous
    assert res("Pharco")["team"] == "Pharco FC"             # level-null row DOES resolve by api_name (full-sheet mirror)
    amb = build_resolver([{"team": "Watford", "api_name": "Watford", "country": "England", "level": 2},
                          {"team": "Watford Rovers", "api_name": "Watford", "country": "England", "level": None}])
    assert amb("Watford") is None                           # duplicate api_name across two clubs -> ambiguous, not mis-matched
    claim = {("Watford", "England"): 38}
    assert check_collision("Watford", "England", 8690, claim) == 38   # different id -> collision
    assert check_collision("Watford", "England", 38, claim) is None   # same id -> fine
    assert check_collision("Avro", "England", 8690, claim) is None    # unclaimed -> fine
    print("self-test OK")

def main():
    if "--self-test" in sys.argv: return selftest()
    write = "--write" in sys.argv
    leagues = json.load(open(os.path.join(HERE, "leagues.json"), encoding="utf-8"))
    akey = api_key()
    standings, fixtures, teams_seen = [], [], {}
    empty, errors = [], []
    log(f"refresh start ({len(leagues)} leagues, write={write})")
    for lg in leagues:
        lid, season = lg["league_id"], lg["season"]
        if lid not in SKIP_STANDINGS:
            doc = api_get("/standings", akey, league=lid, season=season)
            if doc.get("_error") or doc.get("errors"):
                errors.append((lid, doc.get("_error") or doc.get("errors")))
            else:
                s, tm = parse_standings(doc, lid, season)
                if s: standings += s; teams_seen.update(tm)
                else: empty.append(lid)
            time.sleep(0.2)
        if lid in CONTINENTAL:
            doc = api_get("/fixtures", akey, league=lid, season=season)
            if not (doc.get("_error") or doc.get("errors")):
                f, tm = parse_fixtures(doc, lid, season)
                if f: fixtures += f; teams_seen.update(tm)
            time.sleep(0.2)
    log(f"fetched: standings={len(standings)} fixtures={len(fixtures)} teams_seen={len(teams_seen)} "
        f"empty={len(empty)} errors={len(errors)}")
    for lid, e in errors: log(f"  ERROR league {lid}: {str(e)[:100]}")
    if not write:
        log("DRY RUN — no writes. Pass --write to upsert.")
        return

    skey = supa_key()
    existing_rows = supa_get("/rest/v1/football_team?select=team_id,canonical_name,country&order=team_id", skey)
    existing = {row["team_id"] for row in existing_rows}
    claim = {(r.get("canonical_name"), r.get("country")): r["team_id"] for r in existing_rows}
    new_ids = [tid for tid in teams_seen if tid not in existing]
    resolved_rows, unmatched, collisions = [], [], []
    if new_ids:
        resolve = build_resolver(supa_get("/rest/v1/football_lookup?select=cur_name,team,lookup_name,uefa_name,uefa_name_2,efs_name,api_name,country,level", skey))
        for tid in new_ids:
            if tid in SKIP_TEAMS:
                continue   # known upstream ghost/duplicate: skip silently (see SKIP_TEAMS)
            rec = resolve(teams_seen[tid])
            if not rec:
                unmatched.append(tid); continue
            canon, country = rec.get("team"), rec.get("country")   # Team is the canonical column
            owner = check_collision(canon, country, tid, claim)
            if owner is not None:
                collisions.append((tid, teams_seen[tid], canon, country, owner)); continue
            claim[(canon, country)] = tid
            resolved_rows.append({"team_id": tid, "canonical_name": canon,
                "country": country, "lookup_name": rec.get("lookup_name"),
                "uefa_name": rec.get("uefa_name"), "efs_name": rec.get("efs_name")})
    supa_upsert("football_team", resolved_rows, "team_id", skey)
    ns = supa_upsert("football_standings", standings, "league_id,season,group_label,team_id", skey)
    nf = supa_upsert("football_fixtures", fixtures, "fixture_id", skey)
    log(f"WROTE: standings={ns} fixtures={nf} | new teams resolved to Lookup={len(resolved_rows)} "
        f"unmatched={len(unmatched)} collisions={len(collisions)}")

    if collisions:
        log("=" * 64)
        log(f"COLLISION ALERT: {len(collisions)} api team(s) resolved to a Lookup club already")
        log("owned by a different team_id (NOT written). Fix the api_name/level in Lookup:")
        for tid, apiname, canon, country, owner in collisions:
            log(f"  team_id {tid} '{apiname}' -> {canon} ({country}) already held by team_id {owner}")
        log("=" * 64)

    if unmatched:
        log("=" * 64)
        log(f"UNMATCHED ALERT: {len(unmatched)} team(s) do NOT map to your Lookup. Add them to")
        log("Lookup, run sync_lookup.py, and they resolve next run:")
        for tid in unmatched:
            log(f"  team_id {tid}  api-name '{teams_seen[tid]}'")
        log("=" * 64)

    if unmatched or collisions:
        sys.exit(3)   # invariant/integrity violated -> mini job raises an alert

if __name__ == "__main__":
    main()
