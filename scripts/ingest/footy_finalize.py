#!/usr/bin/env python3
"""AFL + NRL season-end finalizer: the piece the ladder ingests always left
"for the season-end finalizer" (their own docstrings, 2026-08) but which never
existed. Three stages, each gated hard and idempotent, so the daily workflow
can run it blind and it only ever acts when the facts are in:

  1. SEASON END  -- the moment every club's `played` is equal AND ESPN has
     filed post-season fixtures (finals.json non-empty), stamp the season's
     outcome flags on public.afl_nrl_ladders: minor_prem on the ladder leader
     (McClelland Trophy / J.J. Giltinan Shield) and finals on the top 10/8.
  2. GRAND FINAL -- when finals.json carries a completed Grand Final, write
     the two-row result into public.afl_nrl_grand_finals (W + L, the shape
     the migrated history uses), and stamp grand_final_app + premiership on
     the ladder rows. build-afl-nrl-data.py then folds all of it into
     public/data/{afl,nrl}/data.json on its next run -- reigning premiers,
     GF roll, all-time counts -- with no human in the loop.
  3. CHAMPIONS   -- append the premier to public.champions with
     source='footy-finalizer'. sync_history.push() only deletes
     source='champions-history.json', so the row survives workbook re-pushes;
     build_champions.py includes the source in the base stream, so the premier
     reaches /sports/champions, the Time Machine and metro pages on the next
     emit. If the workbook later gains the same season row, the emit's
     dedupe keeps one. The previous year's is_current flips false here (a
     workbook re-push may restore it; the next daily run re-fixes -- the
     system converges).

House rules honoured: DRY-RUN BY DEFAULT (--write to apply), --self-test
covers the pure decision logic offline, and nothing is ever guessed -- an
unknown GF venue leaves metro/state null with a warning, a club missing from
data.json aborts the champions append rather than inventing a metro.

Usage:
    python scripts/ingest/footy_finalize.py --self-test
    python scripts/ingest/footy_finalize.py               # dry run, both leagues
    python scripts/ingest/footy_finalize.py --write

Env: SUPABASE_WRITE_KEY (sb_secret_...) required for --write; reads are anon.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30."
        "4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")
WRITE_KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()

SPORT = {"afl": "Aussie Rules", "nrl": "Rugby League"}
COMP = {"afl": "afl", "nrl": "nrl"}  # champions comp_slug
FINALS_SPOTS = {"afl": 10, "nrl": 8}

# Venue -> (metro_area, state) for the GF result rows, matching the migrated
# history ("Melbourne Cricket Ground" / Melbourne / Victoria). ESPN sometimes
# abbreviates, so both spellings are keyed. An UNKNOWN venue writes nulls and
# warns -- the row still lands; the metro is curation, never a guess.
VENUES = {
    "MCG": ("Melbourne Cricket Ground", "Melbourne", "Victoria"),
    "Melbourne Cricket Ground": ("Melbourne Cricket Ground", "Melbourne", "Victoria"),
    "Accor Stadium": ("Accor Stadium", "Sydney", "New South Wales"),
    "Stadium Australia": ("Accor Stadium", "Sydney", "New South Wales"),
    "ANZ Stadium": ("Accor Stadium", "Sydney", "New South Wales"),
}


def _headers(write=False):
    key = WRITE_KEY if write else ANON
    h = {"apikey": key, "Content-Type": "application/json"}
    if key.count(".") == 2 or not write:
        h["Authorization"] = "Bearer %s" % key
    return h


def _req(method, path, params=None, body=None, write=False, prefer=None):
    url = "%s/rest/v1/%s" % (SB_URL, path)
    if params:
        url += "?" + urllib.parse.urlencode(params)
    h = _headers(write)
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(url, method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def get_all(path, params):
    out, off = [], 0
    while True:
        page = _req("GET", path, {**params, "limit": 1000, "offset": off}) or []
        out += page
        if len(page) < 1000:
            return out
        off += 1000


# ---------------------------------------------------------- pure decisions --

def season_complete(ladder_rows, finals_bundle):
    """True only when every club has played the same number of games AND ESPN
    has filed post-season fixtures. Both legs matter: equal `played` alone
    also holds mid-bye-round in the NRL; finals fixtures alone appear while
    round 27 is still running."""
    if not ladder_rows or not finals_bundle or not finals_bundle.get("weeks"):
        return False
    played = {r.get("played") for r in ladder_rows}
    return len(played) == 1 and None not in played


def flag_updates(ladder_rows, spots, gf=None):
    """[(id, {col: bool})] -- the minimal PATCHes that make the season's flags
    exact. gf = (premier_team, runner_up_team) once the Grand Final is done."""
    out = []
    premier, runner = (gf or (None, None))
    for r in ladder_rows:
        want = {
            "minor_prem": r.get("rank") == 1,
            "finals": (r.get("rank") or 99) <= spots,
        }
        if premier is not None:
            want["grand_final_app"] = r.get("team") in (premier, runner)
            want["premiership"] = r.get("team") == premier
        patch = {k: v for k, v in want.items() if bool(r.get(k)) != v}
        if patch:
            out.append((r["id"], patch))
    return out


def gf_rows(league, season, gf_game):
    """The two afl_nrl_grand_finals rows (W then L) from a completed GF."""
    w_side = gf_game[gf_game["winner"]]
    l_side = gf_game["away" if gf_game["winner"] == "home" else "home"]
    date = (gf_game.get("date") or "")[:10].replace("-", "")
    stadium, metro, state = VENUES.get(gf_game.get("venue") or "", (gf_game.get("venue"), None, None))
    rows = []
    for side, opp, wl in ((w_side, l_side, "W"), (l_side, w_side, "L")):
        rows.append({
            "sport": SPORT[league], "name": side["name"], "team": side["name"],
            "year": season, "date": date, "wl": wl,
            "opp_team": opp["name"], "opponent": opp["name"],
            "pf": side["score"], "pa": opp["score"],
            "stadium": stadium, "metro_area": metro, "state": state,
            "premiership_won": wl == "W",
        })
    return rows


def _plus_one_year(iso):
    """'2026-09-26' -> '2027-09-26'. 29 Feb steps back to the 28th."""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(iso or "").strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if mo == 2 and d == 29:
        d = 28
    try:
        return dt.date(y + 1, mo, d).isoformat()
    except ValueError:
        return None


def champion_row(league, season, premier_name, gf_date_iso, template, metro_slug, metro_name):
    """The public.champions row for the new premier. Everything competition-
    shaped copies the previous champion row (template); everything club-shaped
    comes from the club itself. source marks the lineage as the finalizer's."""
    return {
        "sport": template["sport"], "competition": template["competition"],
        "comp_slug": template["comp_slug"], "era_name": template["era_name"],
        "country": template.get("country"), "scope": template.get("scope"),
        "scope_type": template.get("scope_type"), "tier": template.get("tier"),
        "tier_guide": template.get("tier_guide"), "is_club": True,
        "entity_type": "club", "season_basis": template.get("season_basis"),
        "stewardship": "auto", "season": str(season), "year": season,
        "season_numeric": False, "placement": "champion",
        "team_name": premier_name, "canonical_name": premier_name,
        "metro": metro_name, "metro_slug": metro_slug, "metro_status": "resolved",
        "match_date": gf_date_iso, "date_awarded": gf_date_iso,
        # Grand finals land within a few days of the same date every year, so a
        # year on is a good estimate and a blank cell is not. build_champions.py
        # would mint the same value at emit time and mark it estimated; writing
        # it here too means the LEDGER is right, not just the JSON.
        "next_awarded_date": _plus_one_year(gf_date_iso),
        "is_current": True, "source": "footy-finalizer",
        "source_ordinal": template.get("source_ordinal"),
    }


# ------------------------------------------------------------------- stages --

def run(league, write):
    finals_path = os.path.join(ROOT, "public", "data", league, "finals.json")
    if not os.path.exists(finals_path):
        print("[%s] no finals.json; run footy_finals.py first -- nothing to do" % league)
        return
    with open(finals_path, encoding="utf-8") as f:
        bundle = json.load(f)
    season = bundle["meta"]["season"]

    ladder = get_all("afl_nrl_ladders", {
        "select": "id,team,rank,played,minor_prem,finals,grand_final_app,premiership",
        "sport": "eq.%s" % SPORT[league], "season": "eq.%d" % season, "order": "rank"})
    if not season_complete(ladder, bundle):
        print("[%s] %d regular season not complete (or no finals fixtures); no flags yet" % (league, season))
        return

    premier = bundle.get("premier")
    gf_game = None
    for w in bundle.get("weeks", []):
        for g in w["games"]:
            if (g.get("code") or "").startswith("GF") or w.get("label") == "Grand Final":
                if g.get("completed") and g.get("winner"):
                    gf_game = g
    gf_pair = None
    if gf_game:
        gf_pair = (gf_game[gf_game["winner"]]["name"],
                   gf_game["away" if gf_game["winner"] == "home" else "home"]["name"])
        known = {r["team"] for r in ladder}
        if not set(gf_pair) <= known:
            raise SystemExit("[%s] GF clubs %r not on the %d ladder -- refusing to write"
                             % (league, gf_pair, season))

    # -- stage 1+2a: ladder flags ------------------------------------------
    updates = flag_updates(ladder, FINALS_SPOTS[league], gf_pair)
    for row_id, patch in updates:
        team = next(r["team"] for r in ladder if r["id"] == row_id)
        print("[%s] flags %s: %s" % (league, team, patch))
        if write:
            _req("PATCH", "afl_nrl_ladders", {"id": "eq.%d" % row_id}, patch,
                 write=True, prefer="return=minimal")
    if not updates:
        print("[%s] ladder flags already exact" % league)

    if not gf_game:
        print("[%s] Grand Final not decided yet; stopping after flags" % league)
        return

    # -- stage 2b: the Grand Final result rows ------------------------------
    existing = _req("GET", "afl_nrl_grand_finals", {
        "select": "team", "sport": "eq.%s" % SPORT[league], "year": "eq.%d" % season})
    if existing:
        print("[%s] %d Grand Final already recorded (%d rows)" % (league, season, len(existing)))
    else:
        rows = gf_rows(league, season, gf_game)
        if rows[0]["metro_area"] is None:
            print("[%s] WARNING: unknown GF venue %r -- metro/state left null for curation"
                  % (league, gf_game.get("venue")), file=sys.stderr)
        for r in rows:
            print("[%s] grand final row: %s %s %d-%d" % (league, r["wl"], r["team"], r["pf"], r["pa"]))
        if write:
            _req("POST", "afl_nrl_grand_finals", None, rows, write=True, prefer="return=minimal")

    # -- stage 3: champions ledger -----------------------------------------
    have = _req("GET", "champions", {
        "select": "id,source", "comp_slug": "eq.%s" % COMP[league],
        "season": "eq.%s" % season, "placement": "eq.champion"})
    if have:
        print("[%s] champions ledger already has %d %s (source=%s)"
              % (league, season, COMP[league], have[0].get("source")))
        return
    prev = _req("GET", "champions", {
        "select": "sport,competition,comp_slug,era_name,country,scope,scope_type,"
                  "tier,tier_guide,season_basis,source_ordinal,id,is_current,year",
        "comp_slug": "eq.%s" % COMP[league], "placement": "eq.champion",
        "order": "year.desc", "limit": 1})
    if not prev:
        raise SystemExit("[%s] no previous champions row to template from -- refusing to invent one" % league)
    template = prev[0]
    with open(os.path.join(ROOT, "public", "data", league, "data.json"), encoding="utf-8") as f:
        franchises = {fr["name"]: fr for fr in json.load(f)["franchises"]}
    club = franchises.get(premier["name"])
    if not club or not club.get("metro_slug"):
        raise SystemExit("[%s] premier %r missing from data.json franchises (or no metro) -- refusing to guess"
                         % (league, premier and premier["name"]))
    with open(os.path.join(ROOT, "public", "data", "metros.json"), encoding="utf-8") as f:
        metro_name = next((m["name"] for m in json.load(f) if m.get("slug") == club["metro_slug"]),
                          club["metro_slug"])
    row = champion_row(league, season, premier["name"], (gf_game.get("date") or "")[:10],
                       template, club["metro_slug"], metro_name)
    print("[%s] champions append: %s %s -> %s (%s), dated %s"
          % (league, template["competition"], season, row["team_name"], row["metro"], row["date_awarded"]))
    if write:
        _req("POST", "champions", None, [row], write=True, prefer="return=minimal")
        if template.get("is_current"):
            _req("PATCH", "champions", {"id": "eq.%d" % template["id"]},
                 {"is_current": False}, write=True, prefer="return=minimal")
        print("[%s] champions: %d premier written; previous is_current cleared" % (league, season))
    print("[%s] NOTE: run scripts/champions/build_champions.py to re-emit the JSON "
          "(the workflow does this on champion days)" % league)


# ---------------------------------------------------------------- self-test --

def self_test():
    n = [0]

    def check(name, cond):
        n[0] += 1
        if not cond:
            raise SystemExit("self-test FAILED: %s" % name)

    L = [{"id": i + 1, "team": t, "rank": i + 1, "played": 23,
          "minor_prem": False, "finals": False, "grand_final_app": False, "premiership": False}
         for i, t in enumerate(["Sydney Swans", "Fremantle", "Brisbane Lions", "Hawthorn",
                                "Geelong", "Adelaide", "Melbourne", "Carlton", "Collingwood",
                                "Western Bulldogs", "St Kilda", "Essendon"])]
    fin = {"weeks": [{"week": 1, "label": "Wildcard Round", "games": []}]}
    check("season complete", season_complete(L, fin))
    check("unequal played -> incomplete", not season_complete(
        [dict(L[0]), {**L[1], "played": 22}], fin))
    check("no finals fixtures -> incomplete", not season_complete(L, {"weeks": []}))

    ups = dict(flag_updates(L, 10))
    check("leader gets minor_prem", ups[1] == {"minor_prem": True, "finals": True})
    check("10th gets finals only", ups[10] == {"finals": True})
    check("11th untouched", 11 not in ups)
    # Idempotent: apply, re-run, nothing left.
    for rid, patch in ups.items():
        next(r for r in L if r["id"] == rid).update(patch)
    check("second pass is a no-op", flag_updates(L, 10) == [])
    # A wrong pre-existing flag is repaired, not accumulated.
    L[4]["minor_prem"] = True
    check("stray flag repaired", dict(flag_updates(L, 10))[5] == {"minor_prem": False})
    L[4]["minor_prem"] = False

    gf = {"code": "GF", "date": "2026-09-26T04:30Z", "venue": "MCG", "completed": True,
          "winner": "home",
          "home": {"name": "Sydney Swans", "slug": "sydney-swans", "score": 95, "winner": True},
          "away": {"name": "Melbourne", "slug": "melbourne", "score": 62, "winner": False}}
    rows = gf_rows("afl", 2026, gf)
    check("gf two rows W/L", [r["wl"] for r in rows] == ["W", "L"])
    check("gf shape", rows[0] == {
        "sport": "Aussie Rules", "name": "Sydney Swans", "team": "Sydney Swans",
        "year": 2026, "date": "20260926", "wl": "W", "opp_team": "Melbourne",
        "opponent": "Melbourne", "pf": 95, "pa": 62,
        "stadium": "Melbourne Cricket Ground", "metro_area": "Melbourne",
        "state": "Victoria", "premiership_won": True})
    check("unknown venue -> nulls, never a guess",
          gf_rows("afl", 2026, {**gf, "venue": "Somewhere Oval"})[0]["metro_area"] is None)
    # GF flags ride the same updater.
    ups = dict(flag_updates(L, 10, ("Sydney Swans", "Melbourne")))
    check("premiership flag", ups[1] == {"grand_final_app": True, "premiership": True})
    check("runner-up flag", ups[7] == {"grand_final_app": True})

    tpl = {"sport": "Aussie Rules", "competition": "AFL", "comp_slug": "afl",
           "era_name": "AFL Premiership", "country": None, "scope": "Australia",
           "scope_type": "Domestic", "tier": 2, "tier_guide": 4.0,
           "season_basis": "calendar", "source_ordinal": 2810, "id": 99, "is_current": True}
    row = champion_row("afl", 2026, "Sydney Swans", "2026-09-26", tpl, "sydney", "Sydney")
    check("champion row lineage", row["source"] == "footy-finalizer" and row["stewardship"] == "auto")
    check("champion row identity", row["team_name"] == "Sydney Swans" and row["metro_slug"] == "sydney"
          and row["season"] == "2026" and row["year"] == 2026 and row["is_current"] is True)
    check("competition fields copied", row["era_name"] == "AFL Premiership" and row["tier"] == 2)
    print("footy_finalize self-test OK -- %d checks" % n[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="afl,nrl")
    ap.add_argument("--write", action="store_true", help="apply (default: dry run)")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    if args.write and not WRITE_KEY:
        sys.exit("SUPABASE_WRITE_KEY not set; refusing --write.")
    print("footy_finalize -- %s -- %s" % (dt.date.today().isoformat(),
                                          "WRITE" if args.write else "DRY RUN"))
    for league in [x.strip() for x in args.league.split(",") if x.strip()]:
        run(league, args.write)


if __name__ == "__main__":
    main()
