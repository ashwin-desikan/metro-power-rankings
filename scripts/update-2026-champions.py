#!/usr/bin/env python3
"""Auto-record the remaining 2026 champions (LPL, The Hundred men, Currie Cup, CPL).

CI port of the four Cowork champion-trackers (HANDOFF 2026-08-01): each run
checks the Wikipedia season article's infobox and, ONLY when a champion is
named there, records it:
  - T20 leagues (lpl / hundred / cpl): appends a row to
    scripts/cricket/manual-t20-champions.tsv (roll BRAND names via the same
    ALIASES map build_t20_leagues.py uses) and rebuilds
    public/data/cricket/t20-leagues.json.
  - Currie Cup: appends the 2026 line to the Currie Cup section of
    scripts/rugby/domestic-winners.txt (score/venue left as placeholders --
    the build is winners-only; backfill by hand if wanted) and rebuilds
    public/data/rugby-union/{club-rolls,clubs}.json.

Idempotent: a season already recorded is skipped, so the workflow can fire on
every cron until all four are in, then no-ops. An empty/TBD champions field
means "not decided yet" -- the script reports it and writes nothing (never
guesses). Mirrors scripts/update-county-champion.py.

    python scripts/update-2026-champions.py                # apply
    python scripts/update-2026-champions.py --dry          # fetch + report only
    python scripts/update-2026-champions.py --self-test    # offline logic tests
    python scripts/update-2026-champions.py --probe "2025 Caribbean Premier League"

Wikipedia egress required for live runs (CI or a real machine; the Cowork cloud
sandbox is blocked). --self-test is offline and gates the workflow.
"""
import io
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T20_TSV = os.path.join(ROOT, "scripts", "cricket", "manual-t20-champions.tsv")
T20_JSON = os.path.join(ROOT, "public", "data", "cricket", "t20-leagues.json")
RUGBY_TXT = os.path.join(ROOT, "scripts", "rugby", "domestic-winners.txt")

sys.path.insert(0, os.path.join(ROOT, "scripts", "cricket"))
try:
    from build_t20_leagues import ALIASES as T20_ALIASES  # brand-name map
except Exception:  # pragma: no cover - self-test still works without it
    T20_ALIASES = {}

SEASON = "2026"

# (target id, kind, Wikipedia page title). Verified live 2026-08-02: these
# titles exist and their infoboxes carry champions/runner-up params
# ("runner up" on cricket tournament, "runnersup" on rugby union season).
TARGETS = [
    ("lpl", "t20", "2026 Lanka Premier League"),
    ("hundred", "t20", "2026 The Hundred season"),
    ("cpl", "t20", "2026 Caribbean Premier League"),
    ("currie", "rugby", "2026 Currie Cup Premier Division"),
]

NOT_DECIDED = {"", "tbd", "tba", "tbc", "vacant"}


def deww(s):
    """Wikitext value -> plain team name. Handles the shapes seen on the real
    2025/2026 pages: [[links]], {{Rut|X}}, {{nowrap|...}}, refs, bold, title
    counts like (3rd title) / (5)."""
    for _ in range(5):
        s = re.sub(r"\{\{(?:center|small|nowrap|nobr|nobold|resize)\|([^{}]*)\}\}", r"\1", s, flags=re.I)
        s = re.sub(r"\{\{[Rr]ut?\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", s)
        s = re.sub(r"\{\{[Ss]ort(?:name)?\|[^{}]*\|([^{}]*)\}\}", r"\1", s)
        s = re.sub(r"\{\{[a-z ]*icon\|[^{}]*\}\}", "", s, flags=re.I)
        s = re.sub(r"\[\[[^\[\]|]*\|([^\[\]]*)\]\]", r"\1", s)
        s = re.sub(r"\[\[([^\[\]]*)\]\]", r"\1", s)
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<ref[^>]*?(/>|>.*?</ref>)", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"\s*\((?:\d+(?:st|nd|rd|th)?[^)]*)\)", "", s)  # (3rd title), (5)
    s = re.sub(r"[\[\]{}]", "", s)
    return re.sub(r"\s+", " ", s).strip(" \t,;")


def infobox_param(txt, names):
    """First matching '| name = value' line's raw value (params are one-line on
    these infoboxes). names: iterable of param regexes without anchors."""
    for name in names:
        m = re.search(r"^\s*\|\s*%s\s*=[ \t]*(.*)$" % name, txt, re.M | re.I)
        if m:
            return m.group(1).strip()
    return None


def mens_part(raw):
    """The Hundred lists both winners in one field:
    '''W''': [[X]] ... <br />'''M''': [[Y]] ...  -> the M side (or None if the
    field has a W part but no M part yet)."""
    if re.search(r"'''?\s*[WM]\s*'''?\s*:", raw or ""):
        m = re.search(r"'''?\s*M\s*'''?\s*:\s*([^<]*)", raw)
        return m.group(1).strip() if m else None
    return raw


def parse_champion(txt, target_id):
    """(winner, ru) plain names, or (None, reason) if not decided/parseable."""
    raw = infobox_param(txt, [r"champions?", r"winners?"])
    if raw is None:
        return None, "no champions param found (page format changed?)"
    if target_id == "hundred":
        raw = mens_part(raw)
        if raw is None:
            return None, "women's champion listed but no men's yet"
    winner = deww(raw)
    if winner.lower() in NOT_DECIDED:
        return None, "not decided yet"
    if re.search(r"\b(?:19|20)\d\d\b|season", winner, re.I):
        return None, "champions value looks wrong: %r" % winner
    ru_raw = infobox_param(txt, [r"runner[ _]?up", r"runners[ _]?up"])
    if ru_raw is not None and target_id == "hundred":
        ru_raw = mens_part(ru_raw)
    ru = deww(ru_raw) if ru_raw else ""
    if ru.lower() in NOT_DECIDED:
        ru = ""
    return winner, ru


def fetch(title):
    url = ("https://en.wikipedia.org/w/index.php?title=%s&action=raw"
           % urllib.parse.quote(title))
    req = urllib.request.Request(url, headers={"User-Agent": "CitizenOfNowhere/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


# ---------------------------------------------------------------- done-checks

def t20_done(key):
    if os.path.exists(T20_TSV):
        for line in io.open(T20_TSV, encoding="utf-8"):
            parts = [p.strip() for p in line.split("\t")]
            if len(parts) >= 2 and parts[0] == key and parts[1] == SEASON:
                return True
    if os.path.exists(T20_JSON):
        import json
        rolls = json.load(io.open(T20_JSON, encoding="utf-8")).get("rolls", {})
        if any(str(r.get("season")) == SEASON for r in rolls.get(key, [])):
            return True
    return False


def currie_done(txt_path=None):
    path = txt_path or RUGBY_TXT
    in_currie = False
    for line in io.open(path, encoding="utf-8"):
        if line.startswith("Currie Cup Champions"):
            in_currie = True
        elif in_currie and line.startswith(SEASON + "\t"):
            return True
    return False


# --------------------------------------------------------------------- writes

def record_t20(key, winner, ru):
    winner = T20_ALIASES.get(winner, winner)
    ru = T20_ALIASES.get(ru, ru)
    with io.open(T20_TSV, "a", encoding="utf-8", newline="") as f:
        f.write("%s\t%s\t%s\t%s\n" % (key, SEASON, winner, ru))
    print("t20 supplement: %s %s -> %s (def. %s)" % (key, SEASON, winner, ru or "N/A"))
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "cricket",
                    "build_t20_leagues.py")], check=True, cwd=ROOT)


def record_currie(winner, ru):
    # domestic-winners.txt ends with the Currie Cup section, so append at EOF.
    # Score/venue placeholders match the file's early-years convention; the
    # honours build is winners-only, so they are cosmetic.
    with io.open(RUGBY_TXT, "a", encoding="utf-8", newline="") as f:
        f.write("%s\t%s\t%s\t—N/a\t—N/a\n" % (SEASON, winner, ru or "—N/a"))
    print("currie: %s -> %s (def. %s)" % (SEASON, winner, ru or "N/A"))
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "rugby",
                    "build_club_honours.py")], check=True, cwd=ROOT)


# ------------------------------------------------------------------ self-test

def self_test():
    """Pure decision logic against REAL shapes captured from the live pages
    (2026-08-02): the four 2026 infoboxes (undecided) and the 2025 deciders."""
    fails = []

    def check(name, got, want):
        if got != want:
            fails.append("%s: got %r want %r" % (name, got, want))

    # 2026 pages as fetched live: empty champions -> not decided.
    check("empty-2026", parse_champion("{{Infobox cricket tournament\n| champions = \n| count = \n| runner up = \n}}", "lpl"),
          (None, "not decided yet"))
    # 2025 CPL, verbatim shape.
    check("cpl-2025", parse_champion("{{Infobox cricket tournament\n| champions = [[Trinbago Knight Riders]]\n| count =  5\n| runner up = [[Guyana Amazon Warriors]]\n}}", "cpl"),
          ("Trinbago Knight Riders", "Guyana Amazon Warriors"))
    # 2025 Hundred, verbatim: combined W/M field, men's side wanted.
    check("hundred-2025", parse_champion("{{Infobox cricket tournament\n| champions           = '''W''': [[Northern Superchargers]] (1st title)<br />'''M''': [[Oval Invincibles]] (3rd title)\n| count               =\n}}", "hundred"),
          ("Oval Invincibles", ""))
    # Hundred with only the women's side decided -> wait.
    check("hundred-w-only", parse_champion("{{Infobox cricket tournament\n| champions = '''W''': [[Northern Superchargers]]\n}}", "hundred"),
          (None, "women's champion listed but no men's yet"))
    # 2025 Currie Cup, verbatim: {{Rut|...}} wrappers, runnersup param.
    check("currie-2025", parse_champion("{{Infobox rugby union season\n| countries        = [[South Africa]]\n| champions        = {{Rut|Griquas}}\n| count            = 4\n| runnersup        = {{Rut|Golden Lions}}\n}}", "currie"),
          ("Griquas", "Golden Lions"))
    # Defensive cases.
    check("tbd", parse_champion("{{Infobox cricket tournament\n| champions = TBD\n}}", "lpl"),
          (None, "not decided yet"))
    check("piped-link-ref", parse_champion("{{Infobox cricket tournament\n| champions = [[Jaffna Kings|Jaffna]]<ref>x</ref> (2nd title)\n| runner up = {{nowrap|[[Galle Marvels]]}}\n}}", "lpl"),
          ("Jaffna", "Galle Marvels"))
    check("no-param", parse_champion("{{Infobox cricket tournament\n| fromdate = 1 May\n}}", "lpl"),
          (None, "no champions param found (page format changed?)"))
    # Alias map must carry the lineage/rebrand names the rolls use.
    for src, want in [("Jaffna Kings", "Jaffna"), ("Oval Invincibles", "MI London"),
                      ("Northern Superchargers", "Sunrisers Leeds"),
                      ("St Lucia Kings", "Saint Lucia Kings")]:
        check("alias-" + src, T20_ALIASES.get(src, src), want)

    if fails:
        print("SELF-TEST FAIL:")
        for f in fails:
            print("  " + f)
        sys.exit(1)
    print("self-test OK (%d cases)" % 13)


# ----------------------------------------------------------------------- main

def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    if "--probe" in sys.argv:
        title = sys.argv[sys.argv.index("--probe") + 1]
        tid = "hundred" if "Hundred" in title else "probe"
        winner, ru = parse_champion(fetch(title), tid)
        print("%s -> %r (def. %r)" % (title, winner, ru))
        return
    dry = "--dry" in sys.argv
    wrote = 0
    for tid, kind, title in TARGETS:
        done = currie_done() if kind == "rugby" else t20_done(tid)
        if done:
            print("%s: %s already recorded." % (tid, SEASON))
            continue
        try:
            txt = fetch(title)
        except Exception as e:
            print("%s: fetch failed (%s) -- will retry next run." % (tid, e))
            continue
        winner, ru = parse_champion(txt, tid)
        if winner is None:
            print("%s: %s (%s)" % (tid, ru, title))
            continue
        print("%s: DECIDED -- %s (def. %s)" % (tid, winner, ru or "N/A"))
        if dry:
            print("   dry run; nothing written.")
            continue
        if kind == "rugby":
            record_currie(winner, ru)
        else:
            record_t20(tid, winner, ru)
        wrote += 1
    print("done: %d target(s) written." % wrote)


if __name__ == "__main__":
    main()
