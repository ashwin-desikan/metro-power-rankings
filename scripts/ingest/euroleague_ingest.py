#!/usr/bin/env python3
"""Live-season ingest: pull the current EuroLeague regular-season table from
EuroLeague's own feed and upsert the in-progress season into
public.euroleague_seasons (Supabase = source of truth). Idempotent on
(season, competition, team).

SOURCE. api-live.euroleague.net/v1/standings, the same first-party feed the
site reads in lib/euroleagueStandings.ts. ESPN is NOT an option: its
basketball/euroleague standings path answers 200 with an empty shell (season
2035, no children, checked 2026-09-25). gameNumber=99 is deliberate: the
endpoint clamps a round past the end of the schedule to the current table (see
the note in lib/euroleagueStandings.ts; do not turn this into a discovery loop).

KEY. Clubs are keyed on EuroLeague's three-letter code, which survives sponsor
renames ("Panathinaikos AKTOR Athens" this season). CLUBS below was built on
2026-09-25 from the 2025-26 rows of euroleague_seasons (team + country) and
agrees 20/20 with CROSSWALK in lib/euroleagueStandings.ts. Keep the two in step.

FAILS LOUD on an unmapped code. The CFL ingest skips unknown teams; here a
club the map does not know exits 2 and writes nothing, because a skipped club
is a shorter published season that nobody would notice.

Columns written every run: season, competition, team, canonical_name, country,
w, l, win_pct. The outcome flags (playoffs, qf_app, final_four_app, final_app,
champion, qf_*/f4_*) are NOT in the payload, so merge-duplicates never touches
them; they are left for a season-end finalizer.

Dry run by default: prints the rows it would upsert. --write performs the
upsert and needs SUPABASE_WRITE_KEY (sb_secret_...: apikey header only, no
Bearer; a legacy JWT service key also gets the Bearer header).

Env: SUPABASE_URL (optional), SUPABASE_WRITE_KEY (for --write),
     EUROLEAGUE_SEASON_CODE (optional, e.g. E2026; defaults from the date).
Usage: euroleague_ingest.py [--self-test] [--write]
"""
import datetime, html, json, os, re, sys, urllib.error, urllib.request

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
TABLE = "euroleague_seasons"
COMPETITION = "EuroLeague"
API = "https://api-live.euroleague.net/v1/standings"
GAME_NUMBER = 99          # clamps to the current table; see the docstring

# EuroLeague code -> (canonical club name as stored in euroleague_seasons, country).
# BES is the one club with no 2025-26 row (new for 2026-27); its name follows the
# site's crosswalk, its country is Turkey.
CLUBS = {
    "ASV": ("ASVEL Basket", "France"),
    "IST": ("Anadolu Efes", "Turkey"),
    "ZAL": ("BC Žalgiris", "Lithuania"),
    "BES": ("Beşiktaş Basketbol", "Turkey"),
    "DUB": ("Dubai Basketball", "United Arab Emirates"),
    "BAR": ("FC Barcelona Basquet", "Spain"),
    "MUN": ("FC Bayern München Basketball", "Germany"),
    "ULK": ("Fenerbahçe Basketball", "Turkey"),
    "HTA": ("Hapoel Tel Aviv BC", "Israel"),
    "RED": ("KK Crvena zvezda", "Serbia"),
    "PAR": ("KK Partizan", "Serbia"),
    "TEL": ("Maccabi Tel Aviv BC", "Israel"),
    "MIL": ("Olimpia Milano", "Italy"),
    "OLY": ("Olympiacos BC", "Greece"),
    "PAN": ("Panathinaikos BC", "Greece"),
    "PRS": ("Paris Basketball", "France"),
    "MAD": ("Real Madrid Baloncesto", "Spain"),
    "BAS": ("Saski Baskonia", "Spain"),
    "PAM": ("Valencia Basket", "Spain"),
    "VIR": ("Virtus Bologna", "Italy"),
}


def season_code(now=None):
    """E{startYear}; the new season is provisioned in August (mirrors the TS)."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return f"E{now.year if now.month >= 8 else now.year - 1}"


def season_label(code):
    y = int(re.sub(r"\D", "", code))
    return f"{y}-{(y + 1) % 100:02d}"


def _tag(xml, name):
    m = re.search(rf"<{name}>([\s\S]*?)</{name}>", xml)
    return html.unescape(m.group(1)).strip() if m else ""


def _num(xml, name):
    try:
        return int(_tag(xml, name))
    except ValueError:
        return 0


def parse(xml, code):
    """Rows for the first <group> (Regular Season). Returns (rows, unmapped)."""
    g = re.search(r"<group\b[^>]*>([\s\S]*?)</group>", xml)
    if not g:
        return [], []
    label = season_label(code)
    rows, unmapped = [], []
    for m in re.finditer(r"<team>([\s\S]*?)</team>", g.group(1)):
        t = m.group(1)
        c = _tag(t, "code")
        if c not in CLUBS:
            unmapped.append(f"{c or '?'} ({_tag(t, 'name')})")
            continue
        name, country = CLUBS[c]
        w, l = _num(t, "wins"), _num(t, "losses")
        rows.append({
            "season": label, "competition": COMPETITION,
            "team": name, "canonical_name": name, "country": country,
            "w": w, "l": l, "win_pct": (w / (w + l)) if (w + l) else None,
        })
    return rows, unmapped


def fetch(code):
    req = urllib.request.Request(
        f"{API}?seasonCode={code}&gameNumber={GAME_NUMBER}",
        headers={"Accept": "application/xml, text/xml",
                 "User-Agent": "MetroPowerRankings/1.0 (+https://rankings.citizenofnowhere.org)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def upsert(rows):
    if not KEY:
        sys.exit("SUPABASE_WRITE_KEY (or SUPABASE_SERVICE_KEY) not set; refusing to write.")
    headers = {"apikey": KEY, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    if KEY.count(".") == 2:            # legacy JWT only; sb_secret_ keys take apikey alone
        headers["Authorization"] = f"Bearer {KEY}"
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{TABLE}?on_conflict=season,competition,team",
        data=json.dumps(rows).encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as ex:
        sys.exit(f"HTTP {ex.code} upserting {TABLE}: {ex.read().decode(errors='replace')[:300]}")


def self_test():
    # Real shapes from the 2026-09-25 opening-round payload: sponsor names that
    # differ from the canonical club, an entity in a name, a 0-0 club, and a
    # code the map does not know.
    xml = ('<standings><group name="Regular Season" round="RS" gamenumber="99">'
           '<team><name>Panathinaikos AKTOR Athens</name><code>PAN</code><ranking>1</ranking>'
           '<totalgames>1</totalgames><wins>1</wins><losses>0</losses></team>'
           '<team><name>Olimpia Milano &amp; Co</name><code>MIL</code><ranking>8</ranking>'
           '<totalgames>0</totalgames><wins>0</wins><losses>0</losses></team>'
           '<team><name>Mystery BC</name><code>XYZ</code><wins>0</wins><losses>1</losses></team>'
           '</group><group name="Playoffs"><team><code>OLY</code><wins>3</wins></team></group>'
           '</standings>')
    rows, unmapped = parse(xml, "E2026")
    assert [r["team"] for r in rows] == ["Panathinaikos BC", "Olimpia Milano"], rows
    assert rows[0]["season"] == "2026-27" and rows[0]["win_pct"] == 1.0, rows[0]
    assert rows[1]["win_pct"] is None and rows[1]["country"] == "Italy", rows[1]
    assert unmapped == ["XYZ (Mystery BC)"], unmapped
    assert all("champion" not in r and "playoffs" not in r for r in rows), "outcome flags leaked"
    assert parse("<standings/>", "E2026") == ([], [])
    assert season_code(datetime.datetime(2026, 9, 25)) == "E2026"
    assert season_code(datetime.datetime(2027, 5, 20)) == "E2026"
    assert season_code(datetime.datetime(2027, 8, 1)) == "E2027"
    assert season_label("E2029") == "2029-30" and season_label("E2099") == "2099-00"
    assert len({v[0] for v in CLUBS.values()}) == len(CLUBS), "duplicate canonical name"
    print("euroleague_ingest self-test: OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test(); sys.exit(0)
    code = os.environ.get("EUROLEAGUE_SEASON_CODE") or season_code()
    rows, unmapped = parse(fetch(code), code)
    if unmapped:
        sys.exit(f"UNMAPPED EuroLeague club code(s) for {code}: {', '.join(unmapped)}. "
                 "Add them to CLUBS (and lib/euroleagueStandings.ts CROSSWALK); nothing written.")
    if not rows:
        print(f"No EuroLeague standings for {code} (offseason or feed changed); nothing to do.")
        sys.exit(0)
    if sum(r["w"] + r["l"] for r in rows) == 0:
        print(f"{code}: {len(rows)} clubs provisioned, no games played yet; nothing to do.")
        sys.exit(0)
    if "--write" not in sys.argv:
        for r in sorted(rows, key=lambda r: (-(r["win_pct"] or 0), r["team"])):
            print(f"  {r['team']:<30} {r['w']:>2}-{r['l']:<2} {r['country']}")
        print(f"DRY RUN: would upsert {len(rows)} rows for {rows[0]['season']}. Pass --write to apply.")
        sys.exit(0)
    upsert(rows)
    print(f"euroleague ingest: upserted {len(rows)} rows for season {rows[0]['season']}")
