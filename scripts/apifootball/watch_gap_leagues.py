#!/usr/bin/env python3
"""Gap-league watcher: detect when leagues Ashwin tracks become available on api-football.

Runs DAILY on the Mac mini at 05:00 UTC (mac-mini-jobs/jobs.toml, id "gap-league-watch" --
this docstring said "weekly" until 2026-08-14; it never was, jobs.toml has always been daily).
Reads leagues_pending.json (the leagues/levels not yet on api-football), polls /leagues for
each, and classifies coverage into:
  pending              -> league not found on api yet
  covered_no_standings -> league on api, but the target/current season has no standings coverage
  ready                -> league on api with standings coverage on (candidate for promotion)

State is persisted in Supabase (football_league_watch) so alerts fire only on a TRANSITION.
Promotion into leagues.json is deliberately MANUAL (human-gated): when a league flips to
'ready', --write also runs a dry-run resolver report (teams vs football_lookup, level-numbered
only) so the universal Lookup invariant is satisfied BEFORE the league is activated.

Modes:
  python watch_gap_leagues.py --self-test   offline classification tests, no network
  python watch_gap_leagues.py               DRY RUN: fetch + report, no writes
  python watch_gap_leagues.py --write       fetch + upsert state, ntfy on transitions,
                                             resolver report for any 'ready' league
"""
import os, sys, json, time, urllib.request, urllib.parse
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://v3.football.api-sports.io"
SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")

# Reuse the single-sourced normaliser + level-numbered resolver + standings parser.
from refresh import norm, build_resolver, parse_standings, api_get, supa_get, supa_upsert

def log(m): print("[gap-watch] " + m, flush=True)
NOW = datetime.now(timezone.utc).isoformat()

from refresh import api_key   # api key loader (fatal if missing); Supabase key is soft below.

def supa_key_soft():
    for env in ("SUPABASE_WRITE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_ANON_KEY"):
        if os.environ.get(env): return os.environ[env].strip()
    envf = os.path.abspath(os.path.join(HERE, "..", "..", ".env.local"))
    if os.path.exists(envf):
        for line in open(envf, encoding="utf-8"):
            if line.startswith("SUPABASE_SERVICE_KEY="): return line.split("=", 1)[1].strip()
    return None

def push(title, prio, tags, body):
    topic = os.environ.get("NTFY_TOPIC")
    if not topic: return
    try:
        req = urllib.request.Request("https://ntfy.sh/" + topic, data=body.encode(),
            headers={"Title": title, "Priority": prio, "Tags": tags}, method="POST")
        urllib.request.urlopen(req, timeout=15)
    except Exception:
        pass

def match_league(response, intended_name):
    """Pick the league entry whose name matches intended_name; exact first, then containment."""
    want = norm(intended_name)
    fallback = None
    for entry in (response or []):
        nm = norm(((entry.get("league") or {}).get("name")))
        if not nm: continue
        if nm == want: return entry
        if (want in nm or nm in want) and fallback is None: fallback = entry
    return fallback

def classify(response, intended_name, target_season):
    """Pure: is the TARGET season (2026-27 = 2026) available WITH standings? No current-season
    fallback -- we are waiting specifically for 2026-27, not reporting whatever season exists."""
    lg = match_league(response, intended_name)
    if not lg and len(response) == 1:
        lg = response[0]   # id-scoped query returns exactly one league
    if not lg:
        return {"state": "not_on_api", "covered": False, "standings_ready": False,
                "api_league_id": None, "season_used": None, "latest_season": None,
                "note": "league not found on api-football"}
    lid = ((lg.get("league") or {}).get("id"))
    seasons = lg.get("seasons") or []
    years = sorted(s.get("year") for s in seasons if s.get("year") is not None)
    latest = years[-1] if years else None
    tgt = next((s for s in seasons if s.get("year") == target_season), None)
    if not tgt:
        return {"state": "awaiting_target", "covered": True, "standings_ready": False,
                "api_league_id": lid, "season_used": None, "latest_season": latest,
                "note": "%s not published yet (latest season on api = %s)" % (target_season, latest)}
    if bool((tgt.get("coverage") or {}).get("standings")):
        return {"state": "ready", "covered": True, "standings_ready": True,
                "api_league_id": lid, "season_used": target_season, "latest_season": latest,
                "note": "%s standings coverage ON" % target_season}
    return {"state": "awaiting_standings", "covered": True, "standings_ready": False,
            "api_league_id": lid, "season_used": None, "latest_season": latest,
            "note": "%s season present, standings not yet on" % target_season}

def selftest():
    r = classify([], "Serie C", 2026)
    assert r["state"] == "not_on_api", r
    r = classify([{"league": {"id": 138, "name": "Serie C"},
                   "seasons": [{"year": 2025}, {"year": 2026, "coverage": {"standings": True}}]}], "Serie C", 2026)
    assert r["state"] == "ready" and r["api_league_id"] == 138 and r["season_used"] == 2026, r
    r = classify([{"league": {"id": 138, "name": "Serie C"},
                   "seasons": [{"year": 2026, "coverage": {"standings": False}}]}], "Serie C", 2026)
    assert r["state"] == "awaiting_standings", r
    r = classify([{"league": {"id": 664, "name": "Superliga"},
                   "seasons": [{"year": 2024}, {"year": 2025, "coverage": {"standings": True}}]}], "Superliga", 2026)
    assert r["state"] == "awaiting_target" and r["latest_season"] == 2025, r
    r = classify([{"league": {"id": 312, "name": "1a Divisio"},
                   "seasons": [{"year": 2025, "coverage": {"standings": True}}]}], "Primera", 2026)
    assert r["state"] == "awaiting_target" and r["api_league_id"] == 312, r
    r = classify([{"league": {"id": 323, "name": "Super League"},
                   "seasons": [{"year": 2026, "coverage": {"standings": True}}]},
                  {"league": {"id": 462, "name": "I-League"},
                   "seasons": [{"year": 2026, "coverage": {"standings": False}}]}],
                 "Indian Super League", 2026)
    assert r["state"] == "ready" and r["api_league_id"] == 323, r
    print("self-test OK")

def resolver_report(lg, c, akey, skey):
    if not c.get("api_league_id") or not c.get("season_used"): return
    log("--- resolver dry-run: %s (api %s) ---" % (lg["intended_name"], c["api_league_id"]))
    if not skey:
        log("  (no Supabase key; skipping team-vs-Lookup check)"); return
    doc = api_get("/standings", akey, league=c["api_league_id"], season=c["season_used"])
    _, teams = parse_standings(doc, c["api_league_id"], c["season_used"])
    if not teams:
        log("  no standings rows yet (season may not have started)"); return
    resolve = build_resolver(supa_get("/rest/v1/football_lookup?select=cur_name,team,lookup_name,uefa_name,efs_name,api_name,country,level", skey))
    unmatched = [(tid, nm) for tid, nm in teams.items() if not resolve(nm)]
    log("  teams=%d matched=%d unmatched=%d" % (len(teams), len(teams) - len(unmatched), len(unmatched)))
    for tid, nm in unmatched:
        log("    UNMATCHED team_id %s '%s' -- add to Lookup (level %s, %s) before promoting" % (tid, nm, lg["level"], lg["country"]))
    return unmatched  # [] = clean (caller may auto-promote); non-empty = needs Lookup; None (early returns) = can't check yet


def _write_pending(path, rows):
    """Rewrite leagues_pending.json in its on-disk style: array-indented, one compact object per line."""
    body = ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in rows)
    open(path, "w", encoding="utf-8").write(("[\n" + body + "\n]\n") if rows else "[]\n")


def auto_promote(lg, c, skey):
    """A ready league whose teams ALL resolve to the Lookup needs no human curation, so activate
    it automatically: append to leagues.json (the daily refresh then pulls it) and drop it from
    leagues_pending.json. The wrapper commits both files. Returns True if it changed files."""
    lid = c.get("api_league_id")
    if not lid:
        return False
    ljson = os.path.join(HERE, "leagues.json")
    leagues = json.load(open(ljson, encoding="utf-8"))
    if any(l.get("league_id") == lid for l in leagues):
        log("  %s already in leagues.json -- not re-adding" % lg["intended_name"]); return False
    leagues.append({"league_id": lid, "country": lg["country"], "name": lg["intended_name"],
                    "season": c["season_used"], "level": lg["level"],
                    "comp_type": "domestic", "has_standings": True})
    json.dump(leagues, open(ljson, "w", encoding="utf-8"), ensure_ascii=False)  # one-line/compact, matches file
    pjson = os.path.join(HERE, "leagues_pending.json")
    _write_pending(pjson, [p for p in json.load(open(pjson, encoding="utf-8")) if p.get("api_league_id") != lid])
    if skey:
        try:
            supa_upsert("football_league_watch", [{"country": lg["country"], "level": lg["level"],
                "intended_name": lg["intended_name"], "api_league_id": lid, "target_season": lg.get("target_season"),
                "covered": True, "standings_ready": True, "state": "promoted",
                "notes": "auto-promoted: all teams mapped", "last_checked": NOW, "updated_at": NOW}],
                "country,level", skey)
        except Exception as e:
            log("  (promote: watch-state update failed: %s)" % str(e)[:80])
    push("[gap-watch] auto-promoted %s" % lg["intended_name"], "default", "soccer,white_check_mark",
         "%s (%s) went ready with all teams already in the Lookup -- added to leagues.json; the daily standings job now tracks it. No action needed." % (lg["intended_name"], lg["country"]))
    log("  AUTO-PROMOTED %s (api %s) -> leagues.json; removed from pending" % (lg["intended_name"], lid))
    return True

def main():
    if "--self-test" in sys.argv: return selftest()
    write = "--write" in sys.argv
    pending = json.load(open(os.path.join(HERE, "leagues_pending.json"), encoding="utf-8"))
    akey = api_key()
    skey = supa_key_soft()
    if write and not skey: sys.exit("No Supabase write key for --write (set SUPABASE_WRITE_KEY)")
    prev = {}
    if skey:
        try:
            for r in supa_get("/rest/v1/football_league_watch?select=country,level,state,api_league_id", skey):
                prev[(r["country"], r["level"])] = r
        except Exception as e:
            log("warn: could not read prior watch state: %s" % str(e)[:120])
    rows_out, transitions, ready = [], [], []
    log("checking %d pending leagues (write=%s)" % (len(pending), write))
    for lg in pending:
        country, level = lg["country"], lg["level"]
        if lg.get("api_league_id"):
            resp = api_get("/leagues", akey, id=lg["api_league_id"])
        else:
            resp = api_get("/leagues", akey, country=lg.get("api_country") or country)
        response = resp.get("response") or []
        if not response and lg.get("intended_name"):
            resp = api_get("/leagues", akey, search=lg["intended_name"]); response = resp.get("response") or []
        time.sleep(0.2)
        c = classify(response, lg["intended_name"], lg.get("target_season"))
        prev_state = (prev.get((country, level)) or {}).get("state")
        detail = "%s L%s %s -> %s" % (country, level, lg["intended_name"], c["state"])
        if c["api_league_id"]: detail += " [api %s season %s]" % (c["api_league_id"], c["season_used"])
        log(detail + " -- " + c["note"])
        if prev_state and prev_state != c["state"]:
            transitions.append((country, level, lg["intended_name"], prev_state, c["state"]))
        if c["state"] == "ready": ready.append((lg, c))
        rows_out.append({"country": country, "level": level, "intended_name": lg["intended_name"],
            "target_season": lg.get("target_season"), "api_league_id": c["api_league_id"],
            "latest_available_season": c.get("latest_season"),
            "covered": c["covered"], "standings_ready": c["standings_ready"],
            "state": c["state"], "notes": c["note"], "last_checked": NOW, "updated_at": NOW})

    if not write:
        log("DRY RUN -- no writes. %d transition(s) vs stored state, %d ready." % (len(transitions), len(ready)))
        for lg, c in ready:
            u = resolver_report(lg, c, akey, skey)
            if u is not None:
                log("  would %s" % ("AUTO-PROMOTE (0 unmatched)" if len(u) == 0 else "flag %d unmapped team(s)" % len(u)))
        return

    n = supa_upsert("football_league_watch", rows_out, "country,level", skey)
    log("wrote watch state for %d leagues" % n)
    promoted = []
    for lg, c in ready:
        unmatched = resolver_report(lg, c, akey, skey)
        if unmatched is None:
            continue  # can't check yet (no standings rows / no Supabase key)
        if len(unmatched) == 0:
            if auto_promote(lg, c, skey): promoted.append(lg["intended_name"])
        else:
            push("[gap-watch] %s ready -- %d team(s) need a Lookup entry" % (lg["intended_name"], len(unmatched)),
                 "high", "warning",
                 "Add these to the Lookup workbook + run sync_lookup.py, then it auto-promotes:\n"
                 + "\n".join("%s  (level %s, %s)" % (nm, lg["level"], lg["country"]) for _, nm in unmatched))
    if promoted:
        log("=== AUTO-PROMOTED: %s ===" % ", ".join(promoted))
    if transitions:
        body = "\n".join("%s L%s %s: %s -> %s" % t for t in transitions)
        push("[gap-watch] %d league transition(s)" % len(transitions), "high", "soccer,bell", body)
        log("=== TRANSITIONS ===\n" + body)
    else:
        log("no state transitions this run")

if __name__ == "__main__":
    main()
