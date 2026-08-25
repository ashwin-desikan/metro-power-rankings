#!/usr/bin/env python3
"""AFL + NRL finals feed: ESPN scoreboard -> public/data/{afl,nrl}/finals.json.

The regular-season machinery deliberately ignores finals: build_season_sims'
parse_footy_scoreboard() keeps only events whose season.slug contains "reg",
and the ladder ingests (afl_ingest.py / nrl_ingest.py) only ever write
standings columns. This script is the finals half: it collects every
post-season event (season.slug containing "post", measured live 2026-08-25:
AFL finals events carry slug "post-season"), classifies each tie, and emits a
small bracket JSON the hubs read via GitHub raw (ISR, no build per update).

Tie classification, in order of trust:
  1. The ESPN notes headline, when it leads with a tie code ("WC2 - Bulldogs
     vs Magpies", "QF1 - ...", "EF2 - Crows vs TBC" -- AFL format measured
     2026-08-25). Codes: WC wildcard, QF qualifying, EF elimination, SF semi,
     PF preliminary, GF grand final.
  2. week.number, mapped per league (AFL 2026 runs five finals weeks under the
     top-10 wildcard format; the NRL's final-eight runs four). Used for the
     column label whenever no code is present -- the NRL's headline format is
     unknown until its finals draw appears, so labels degrade gracefully.

A side ESPN has not filled in yet (empty displayName) renders as TBC. A
non-empty name missing from the club map is passed through UNLINKED (name
kept, slug null) with a warning -- a rebrand must not kill the feed mid-
finals, and the self-test pins the maps against all current clubs anyway.

Usage:
    python scripts/ingest/footy_finals.py --self-test
    python scripts/ingest/footy_finals.py             # writes both finals.json
    FOOTY_FINALS_FIXTURES=/tmp/fx python ... --league afl   # offline dev

No Supabase, no secrets: this is a read-only public feed -> committed JSON.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from afl_ingest import CLUBS as AFL_CLUBS  # noqa: E402
from nrl_ingest import CLUBS as NRL_CLUBS  # noqa: E402

ESPN = "https://site.api.espn.com/apis"
FRAG = {"afl": "australian-football/afl", "nrl": "rugby-league/3"}
# State of Origin rides the NRL scoreboard under a regular-season slug; keep
# the same guard here in case ESPN ever files rep games under post-season.
EXCLUDE = {"afl": frozenset(), "nrl": frozenset({"New South Wales", "Queensland"})}

CODE_RE = re.compile(r"^([A-Z]{2})(\d)?\s*-\s*")
ROUND_NAME = {"WC": "Wildcard", "QF": "Qualifying Final", "EF": "Elimination Final",
              "SF": "Semi Final", "PF": "Preliminary Final", "GF": "Grand Final"}
# Fallback week labels when no tie codes are present (per-league, 1-based).
WEEK_LABELS = {
    "afl": {1: "Wildcard Round", 2: "Qualifying & Elimination Finals",
            3: "Semi Finals", 4: "Preliminary Finals", 5: "Grand Final"},
    "nrl": {1: "Qualifying & Elimination Finals", 2: "Semi Finals",
            3: "Preliminary Finals", 4: "Grand Final"},
}


def slugify(s):
    s = unicodedata.normalize("NFKD", str(s).lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))


def fetch_json(url):
    req = urllib.request.Request(url)  # urllib's own UA -- ESPN accepts it
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _side(comp, home_away, name_map, warn):
    """One competitor -> {name, slug, score, winner} or None (TBC)."""
    for c in comp.get("competitors", []) or []:
        if c.get("homeAway") != home_away:
            continue
        nm = ((c.get("team") or {}).get("displayName") or "").strip()
        if not nm:
            return None  # TBC slot -- ESPN lists the fixture before the draw
        mapped = name_map.get(nm)
        if mapped:
            canon = mapped[0]
            slug = slugify(canon)
        else:
            canon, slug = nm, None
            warn.append(nm)
        raw = c.get("score")
        try:
            score = int(float(raw)) if raw not in (None, "") else None
        except (TypeError, ValueError):
            score = None
        return {"name": canon, "slug": slug, "score": score,
                "winner": bool(c.get("winner"))}
    return None


def parse_finals(data, league, name_map):
    """ESPN scoreboard payload -> (games, warnings). Post-season events only."""
    games, warn = [], []
    for ev in data.get("events", []) or []:
        if "post" not in ((ev.get("season") or {}).get("slug") or ""):
            continue
        comp = (ev.get("competitions") or [{}])[0]
        names = [((c.get("team") or {}).get("displayName") or "").strip()
                 for c in comp.get("competitors", []) or []]
        if any(n in EXCLUDE[league] for n in names):
            continue
        note = ""
        for n in comp.get("notes", []) or []:
            if n.get("headline"):
                note = n["headline"].strip()
                break
        m = CODE_RE.match(note)
        code = (m.group(1) + (m.group(2) or "")) if m and m.group(1) in ROUND_NAME else None
        stype = ((comp.get("status") or {}).get("type") or {})
        state = stype.get("state") or ("post" if stype.get("completed") else "pre")
        home = _side(comp, "home", name_map, warn)
        away = _side(comp, "away", name_map, warn)
        winner = None
        if stype.get("completed") and home and away:
            if home.get("winner"):
                winner = "home"
            elif away.get("winner"):
                winner = "away"
            elif home["score"] is not None and away["score"] is not None and home["score"] != away["score"]:
                winner = "home" if home["score"] > away["score"] else "away"
        games.append({
            "week": int((ev.get("week") or {}).get("number") or 0) or None,
            "code": code,
            "round": ROUND_NAME[code[:2]] if code else None,
            "date": ev.get("date"),
            "venue": ((comp.get("venue") or {}).get("fullName")) or None,
            "home": home, "away": away,
            "state": state, "completed": bool(stype.get("completed")),
            "winner": winner,
        })
    games.sort(key=lambda g: (g["week"] or 99, g["date"] or ""))
    return games, sorted(set(warn))


def to_bundle(league, season, games):
    """Grouped weeks + grand-final meta. Pure; the self-test leans on it."""
    weeks = {}
    for g in games:
        wk = g["week"] or 0
        weeks.setdefault(wk, []).append(g)
    week_list = []
    for wk in sorted(weeks):
        codes = {g["code"][:2] for g in weeks[wk] if g["code"]}
        if codes == {"GF"}:
            label = "Grand Final"
        elif codes:
            label = " & ".join(ROUND_NAME[c] + "s" if ROUND_NAME[c][-1] != "s" else ROUND_NAME[c]
                               for c in sorted(codes, key=lambda c: "WCQFEFSFPFGF".index(c)))
            label = label.replace("Wildcards", "Wildcard Round")
        else:
            label = WEEK_LABELS[league].get(wk, "Finals Week %d" % wk)
        week_list.append({"week": wk, "label": label, "games": weeks[wk]})
    gf = next((g for g in games if (g["code"] or "").startswith("GF")), None)
    if gf is None and week_list:
        last = week_list[-1]
        if len(last["games"]) == 1 and last["label"] == "Grand Final":
            gf = last["games"][0]
    premier = None
    if gf and gf["completed"] and gf["winner"]:
        premier = gf[gf["winner"]]
    return {
        "meta": {
            "league": league.upper(), "season": season,
            "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "complete": premier is not None,
        },
        "weeks": week_list,
        "premier": ({"name": premier["name"], "slug": premier["slug"]} if premier else None),
    }


def build(league, season):
    fx = os.environ.get("FOOTY_FINALS_FIXTURES")
    if fx:
        with open(os.path.join(fx, "espn_%s_score.json" % league), encoding="utf-8") as f:
            data = json.load(f)
    else:
        url = "%s/site/v2/sports/%s/scoreboard?dates=%d0801-%d1101&limit=1000" % (
            ESPN, FRAG[league], season, season)
        data = fetch_json(url)
    name_map = AFL_CLUBS if league == "afl" else NRL_CLUBS
    games, warn = parse_finals(data, league, name_map)
    for w in warn:
        print("[%s] WARNING unmapped club (rendered unlinked): %r" % (league, w), file=sys.stderr)
    return to_bundle(league, season, games)


# ------------------------------------------------------------- self-test ----

def _ev(slug, week, note, home, away, hs=None, as_=None, done=False, venue="MCG",
        date="2026-08-28T09:40Z", winner=None):
    comps = []
    for ha, nm, sc in (("home", home, hs), ("away", away, as_)):
        c = {"homeAway": ha, "team": {"displayName": nm}, "score": sc}
        if done and winner == ha:
            c["winner"] = True
        comps.append(c)
    return {"season": {"slug": slug}, "week": {"number": week}, "date": date,
            "competitions": [{"notes": [{"headline": note}], "venue": {"fullName": venue},
                              "status": {"type": {"completed": done, "state": "post" if done else "pre"}},
                              "competitors": comps}]}


def self_test():
    ok = [0]

    def check(name, cond):
        ok[0] += 1
        if not cond:
            raise SystemExit("self-test FAILED: %s" % name)

    payload = {"events": [
        _ev("regular-season", 24, "Swans vs Kangaroos", "Sydney Swans", "North Melbourne", 90, 60, done=True, winner="home"),
        _ev("post-season", 1, "WC2 - Bulldogs vs Magpies", "Western Bulldogs", "Collingwood"),
        _ev("post-season", 1, "WC1 - Demons vs Blues", "Melbourne", "Carlton", 88, 71, done=True, winner="home"),
        _ev("post-season", 2, "EF2 - Crows vs TBC", "Adelaide Crows", ""),
        _ev("post-season", 5, "GF - TBC vs TBC", "", ""),
    ]}
    games, warn = parse_finals(payload, "afl", AFL_CLUBS)
    check("regular-season events excluded", len(games) == 4)
    check("no unmapped warnings", warn == [])
    b = to_bundle("afl", 2026, games)
    check("three weeks grouped", [w["week"] for w in b["weeks"]] == [1, 2, 5])
    check("wildcard label", b["weeks"][0]["label"] == "Wildcard Round")
    wc1 = next(g for g in b["weeks"][0]["games"] if g["code"] == "WC1")
    check("winner resolved from winner flag", wc1["winner"] == "home")
    check("completed carries scores", wc1["home"]["score"] == 88 and wc1["away"]["score"] == 71)
    check("TBC side is null", any(g["away"] is None for g in b["weeks"][1]["games"]))
    check("GF week labeled", b["weeks"][-1]["label"] == "Grand Final")
    check("no premier before the GF", b["premier"] is None and b["meta"]["complete"] is False)

    # Grand final completed -> premier + complete.
    payload["events"][-1] = _ev("post-season", 5, "GF - Swans vs Demons",
                                "Sydney Swans", "Melbourne", 95, 62, done=True, winner="home",
                                date="2026-09-26T04:30Z")
    games, _ = parse_finals(payload, "afl", AFL_CLUBS)
    b = to_bundle("afl", 2026, games)
    check("premier detected", b["premier"] == {"name": "Sydney Swans", "slug": "sydney-swans"})
    check("complete flag", b["meta"]["complete"] is True)

    # Winner falls back to score comparison when ESPN omits the winner flag.
    e = _ev("post-season", 2, "QF1 - Dockers vs Hawks", "Fremantle", "Hawthorn", 60, 70, done=True)
    games, _ = parse_finals({"events": [e]}, "afl", AFL_CLUBS)
    check("winner from scores", games[0]["winner"] == "away")

    # NRL: Origin excluded even under a post slug; unknown label -> week map.
    payload = {"events": [
        _ev("2026-post-nrl", 1, "Panthers v Storm", "Panthers", "Storm"),
        _ev("2026-post-nrl", 1, "Origin", "New South Wales", "Queensland"),
    ]}
    games, warn = parse_finals(payload, "nrl", NRL_CLUBS)
    check("origin excluded", len(games) == 1 and warn == [])
    b = to_bundle("nrl", 2026, games)
    check("nrl week-1 fallback label", b["weeks"][0]["label"] == "Qualifying & Elimination Finals")

    # Unmapped club: kept unlinked + warned, never dropped.
    games, warn = parse_finals({"events": [_ev("post-season", 3, "SF1 - X vs Swans",
                                               "Tasmania Devils", "Sydney Swans")]}, "afl", AFL_CLUBS)
    check("unmapped kept unlinked", games[0]["home"]["slug"] is None and warn == ["Tasmania Devils"])

    # Club maps cover every current club (slug parity with the ladder ingests).
    check("afl map size", len(AFL_CLUBS) >= 18)
    check("nrl map size", len(NRL_CLUBS) >= 17)
    print("footy_finals self-test OK -- %d checks" % ok[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="afl,nrl")
    ap.add_argument("--season", type=int, default=dt.date.today().year)
    ap.add_argument("--out", default=os.path.join(ROOT, "public", "data"))
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    for league in [x.strip() for x in args.league.split(",") if x.strip()]:
        bundle = build(league, args.season)
        path = os.path.join(args.out, league, "finals.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
        n = sum(len(w["games"]) for w in bundle["weeks"])
        print("[%s] finals.json: %d games across %d weeks%s" % (
            league, n, len(bundle["weeks"]),
            "; PREMIER: %s" % bundle["premier"]["name"] if bundle["premier"] else ""))


if __name__ == "__main__":
    main()
