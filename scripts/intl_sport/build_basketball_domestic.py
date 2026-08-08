#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build public/data/honours/basketball-domestic.json from the Wikipedia
champion-list scrapes in this directory.

Shape matches lib/honourRolls.ts:
    { labels: {key: label}, rolls: {key: [{season, winner, ru}]},
      most_titled: {key: [{winner, titles}]} }

House pattern for domestic honour rolls (see rugby-league.json,
cricket-county.json): winners only, no team pages, no metro spine.

Two rolls per country, decided with Ashwin 2026-08-08:
  * a MODERN roll covering the era where the source gives a runner-up
    (the playoff/finals era in most countries), and
  * a HISTORIC roll of champions only for the earlier era.

Club names are canonicalised against the EuroLeague hub's own club names in
public/data/basketball/euroleague.json, so a club is spelled the same way on
both pages and most_titled does not fragment across sponsor names (Italy in
particular lists champions as "Mobilgirgi Varese", "Simac Milano" and so on).
The alias table lives in aliases.py next to this file.

Run:  python build_basketball_domestic.py [--check]
      --check writes nothing and prints the report only.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

# The report prints club names in eight scripts. A Windows console defaults to
# cp1252 and would abort the run on the first "Altınordu" AFTER the data is
# built but BEFORE it is written, which looks like a silent no-op.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:  # pragma: no cover
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "public" / "data" / "honours" / "basketball-domestic.json"
EUROLEAGUE = ROOT / "public" / "data" / "basketball" / "euroleague.json"

sys.path.insert(0, str(HERE))
from aliases import ALIASES  # noqa: E402

# --------------------------------------------------------------- helpers ---

_CHARMAP = {"\u0131": "i", "\u0130": "i", "\u0111": "d", "\u0110": "d",
            "\u0142": "l", "\u0141": "l", "\u00f8": "o", "\u00d8": "o",
            "\u00df": "ss"}

# Footnote and honour markers Wikipedia leaves in the flattened text.
_MARKERS = re.compile(r"(\[[^\]]{1,12}\])|[†‡§*]|\(\d+\)|\s+\(revoked\)")
_TITLECOUNT = re.compile(r"\s*\(\d+\)\s*$")


def fold(s: str) -> str:
    """Lowercase, strip diacritics and punctuation for alias lookup."""
    s = "".join(_CHARMAP.get(c, c) for c in s)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"\s+", " ", s)
    return s


def clean(name: str) -> str:
    """Strip markers/counters from a raw club cell."""
    name = _MARKERS.sub("", name or "")
    name = _TITLECOUNT.sub("", name)
    name = name.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", name).strip(" \t·–-")


def canon(name: str):
    """Canonical club name, or None when the cell is not a club."""
    c = clean(name)
    if not c:
        return None
    if " & " in c:            # shared title, e.g. Turkey 1955
        parts = [canon(x) for x in c.split(" & ")]
        parts = [x for x in parts if x]
        return " & ".join(parts) if parts else None
    low = fold(c)
    if not low or low in _NOT_A_CLUB or _FORMAT_CELL.match(c):
        return None
    return ALIASES.get(low, c)


_NOT_A_CLUB = {
    "not held", "cancelled", "canceled", "details", "playoffs", "n/a",
    "score", "champion", "champions", "runner-up", "runners-up", "season",
    "r.r.", "", "bronze", "fourth place", "third",
}

# Competition-format and note cells that sit in the same columns as clubs.
_FORMAT_CELL = re.compile(
    r"^(best of|mini-league|regular season|single game|home and away|"
    r"final four|round robin)", re.I)

# Seasons the source marks as void: no champion was awarded.
_VOID = re.compile(
    r"not held|cancell?ed|not awarded|no champion|due to (world war|the covid|"
    r"covid|war|suez|twelve-day)", re.I)

SEASON = re.compile(r"^(1[89]\d\d|20\d\d)(?:[–-](\d{2,4}))?$")


def season_ok(tok: str) -> bool:
    return bool(SEASON.match(_MARKERS.sub("", tok or "").strip()))


def norm_season(tok: str) -> str:
    """Normalise to the site's en-dash season form."""
    s = _MARKERS.sub("", tok or "").strip().replace("-", "\u2013")
    # 1999-2000 -> 1999-00, so every roll reads the same way.
    m = re.match(r"^(\d{4})\u2013(\d{4})$", s)
    if m and int(m.group(2)) - int(m.group(1)) == 1:
        s = f"{m.group(1)}\u2013{m.group(2)[2:]}"
    return s


def rows_to_titles(rows):
    """Title counts across the whole roll, both eras.

    A shared championship is displayed literally in its season row (Turkey
    1955, "Galatasaray & Modaspor") but credited to BOTH clubs here, which is
    what makes the totals agree with the sources' own all-time tables.
    """
    c = Counter()
    for r in rows:
        if not r["winner"]:
            continue
        for w in r["winner"].split(" & "):
            c[w.strip()] += 1
    return [{"winner": w, "titles": n} for w, n in
            sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))]


def section(body: str, heading: str, end: str = None) -> str:
    """Text under `heading`, choosing the occurrence that actually starts a
    data table. Wikipedia repeats every heading in the table of contents and
    again in the footer navbox, so a naive split() picks up an empty stub."""
    best = ""
    for m in re.finditer(re.escape(heading), body):
        chunk = body[m.end():]
        if end:
            k = chunk.find(end)
            if k != -1:
                chunk = chunk[:k]
        if len(chunk) > len(best) and re.search(r"(?m)^(1[89]\d\d|20\d\d)", chunk):
            best = chunk
    return best


def read(name: str) -> str:
    return (HERE / name).read_text(encoding="utf-8")


def lines(name: str):
    return [l.rstrip("\n") for l in read(name).split("\n")]


# ------------------------------------------------------- generic parsers ---

def parse_colon_list(raw_lines, sep=":"):
    """'1920–21: Stade Français' / '1946 Crvena zvezda' -> [(season, champ)]."""
    out = []
    for ln in raw_lines:
        ln = ln.strip()
        if not ln:
            continue
        if sep == ":":
            m = re.match(r"^((?:1[89]|20)\d\d(?:[–-]\d{2,4})?)\s*:\s*(.+)$", ln)
        else:
            m = re.match(r"^((?:1[89]|20)\d\d(?:[–-]\d{2,4})?)\s+(.+)$", ln)
        if not m:
            continue
        season, rest = norm_season(m.group(1)), m.group(2).strip()
        if _VOID.search(rest):
            continue
        out.append((season, rest))
    return out


def finals_by_homecourt(rows, champ_by_season):
    """Finals tables written as 'home | result | away'. The winner is not the
    home side by default, so the champions list decides which of the pair is
    the champion and the other becomes the runner-up."""
    out = []
    for season, a, b in rows:
        ca, cb = canon(a), canon(b)
        champ = champ_by_season.get(season)
        if not champ:
            continue
        if ca == champ:
            out.append({"season": season, "winner": champ, "ru": cb})
        elif cb == champ:
            out.append({"season": season, "winner": champ, "ru": ca})
        else:
            out.append({"season": season, "winner": champ, "ru": None})
    return out


# ------------------------------------------------------------- countries ---

def build_lithuania():
    modern, historic = [], []
    for ln in lines("basket_lith.txt"):
        p = [x.strip() for x in ln.split("\t")]
        if len(p) >= 3 and season_ok(p[0]):
            w, r = canon(p[1]), canon(p[2])
            if w:
                modern.append({"season": norm_season(p[0]), "winner": w, "ru": r})
    tail = read("basket_lith.txt").split("Lithuanian League champions")[-1]
    for season, champ in parse_colon_list(tail.split("\n"), sep=" "):
        historic.append({"season": season, "winner": canon(champ), "ru": None})
    return modern, historic


def build_israel():
    body = read("basket_israel.txt")
    holders = body.split("Title holders")[1].split("Finals")[0]
    champ_by_season = {}
    order = []
    for season, champ in parse_colon_list(holders.split("\n"), sep=" "):
        c = canon(champ)
        if c:
            champ_by_season[season] = c
            order.append(season)
    # Finals table: rowspan collapse makes blank cells ambiguous, so a
    # runner-up is only taken when the row names a club that is not the
    # champion. Never inferred.
    ru_by_season = {}
    for ln in body.split("Finals")[-1].split("\n"):
        p = [x.strip() for x in ln.split("\t")]
        if not p or not season_ok(p[0]):
            continue
        season = norm_season(p[0])
        champ = champ_by_season.get(season)
        for cell in p[1:]:
            c = canon(cell)
            if c and c != champ and not re.match(r"^[\d:\u2013\u2014–-]+$", clean(cell)):
                ru_by_season[season] = c
                break
    rows = [{"season": s, "winner": champ_by_season[s], "ru": ru_by_season.get(s)}
            for s in order]
    # Israel's championship is a single continuous competition; the split is
    # the point at which the finals table starts naming a losing finalist.
    cut = "1989\u201390"
    modern = [r for r in rows if r["season"] >= cut]
    historic = [r for r in rows if r["season"] < cut]
    return modern, historic


def build_france():
    body = read("basket_france.txt")
    holders = body.split("Title holders")[1].split("Performance by club")[0]
    champ_by_season = {}
    order = []
    for season, champ in parse_colon_list(holders.split("\n")):
        c = canon(champ)
        if c:
            champ_by_season[season] = c
            order.append(season)
    pairs = []
    for ln in body.split("Finals")[-1].split("\n"):
        p = [x.strip() for x in ln.split("\t")]
        if len(p) >= 4 and season_ok(p[0]):
            pairs.append((norm_season(p[0]), p[1], p[3]))
    modern = finals_by_homecourt(pairs, champ_by_season)
    covered = {r["season"] for r in modern}
    # Champions the finals table misses (e.g. the void 2019-20 row).
    for s in order:
        if s not in covered and s >= "1987\u201388":
            modern.append({"season": s, "winner": champ_by_season[s], "ru": None})
    modern.sort(key=lambda r: r["season"])
    historic = [{"season": s, "winner": champ_by_season[s], "ru": None}
                for s in order if s < "1987\u201388"]
    return modern, historic


def build_greece():
    body = read("basket_greece.txt")
    holders = body.split("Title holders")[1].split("Performance by club")[0]
    champ_by_season, order = {}, []
    for season, champ in parse_colon_list(holders.split("\n")):
        c = canon(champ)
        if c:
            champ_by_season[season] = c
            order.append(season)
    pairs = []
    for ln in body.split("A1 Finals")[-1].split("\n"):
        p = [x.strip() for x in ln.split("\t")]
        if len(p) >= 4 and season_ok(p[0]):
            pairs.append((norm_season(p[0]), p[1], p[3]))
    modern = finals_by_homecourt(pairs, champ_by_season)
    covered = {r["season"] for r in modern}
    for s in order:
        if s not in covered and s >= "1986\u201387":
            modern.append({"season": s, "winner": champ_by_season[s], "ru": None})
    modern.sort(key=lambda r: r["season"])
    historic = [{"season": s, "winner": champ_by_season[s], "ru": None}
                for s in order if s < "1986\u201387"]
    return modern, historic


def build_turkey():
    body = read("basket_turkey.txt")
    block = body.split("Title holders")[1].split("Performance by club")[0]
    modern, historic = [], []
    in_bsl = False
    for ln in block.split("\n"):
        if "Basketball Super League" in ln:
            in_bsl = True
            continue
        for season, champ in parse_colon_list([ln], sep=" "):
            c = canon(champ)
            if not c:
                continue
            row = {"season": season, "winner": c, "ru": None}
            (modern if in_bsl else historic).append(row)
    return modern, historic


def build_spain():
    body = read("basket_spain.txt")
    old = section(body, "Liga Espa\u00f1ola de Baloncesto (1957\u20131983)",
                  "Liga ACB (1983\u2013present)")
    acb = section(body, "Liga ACB (1983\u2013present)", "Total titles won")

    def table(chunk):
        out = []
        for ln in chunk.split("\n"):
            p = [x.strip() for x in ln.split("\t")]
            if len(p) >= 2 and season_ok(p[0]):
                w, r = canon(p[1]), canon(p[2]) if len(p) > 2 else None
                if w:
                    out.append({"season": norm_season(p[0]), "winner": w, "ru": r})
        return out

    return table(acb), table(old)


def build_italy():
    body = read("basket_italy.txt")
    finals = body.split("Finals (1976\u2013present)")[1] \
                 .split("Finals performances by clubs")[0]
    # Season on its own line, then champion, score, runner-up across the
    # following lines. Collapse each season block and read it positionally.
    blocks, cur = [], None
    for ln in finals.split("\n"):
        t = ln.strip()
        if season_ok(t):
            if cur:
                blocks.append(cur)
            cur = [t]
        elif cur is not None and t:
            cur.append(t)
    if cur:
        blocks.append(cur)

    modern = []
    for b in blocks:
        season = norm_season(b[0])
        rest = "\t".join(b[1:])
        if _VOID.search(rest):
            continue
        cells = [c for c in re.split(r"\t", rest) if c.strip()]
        # cells: champion, score, runner-up, coach, mvp
        names = []
        for c in cells:
            if re.match(r"^[\d\u2013\u2014:–\-\s()OT]+$", clean(c)):
                continue
            names.append(c)
            if len(names) == 2:
                break
        if not names:
            continue
        w = canon(names[0])
        r = canon(names[1]) if len(names) > 1 else None
        if w:
            modern.append({"season": season, "winner": w, "ru": r})

    champs = body.split("List of champions")[-1].split("Performance by club")[0]
    hist_all = parse_colon_list(champs.split("\n"))
    covered = {r["season"] for r in modern}
    historic = []
    for season, champ in hist_all:
        c = canon(champ)
        if not c:
            continue
        if season in covered:
            continue
        if season >= "1976\u201377":
            modern.append({"season": season, "winner": c, "ru": None})
        else:
            historic.append({"season": season, "winner": c, "ru": None})
    modern.sort(key=lambda r: r["season"])
    return modern, historic


_ABA_COUNTRIES = {
    "slovenia", "croatia", "serbia", "serbia and montenegro", "israel",
    "montenegro", "bosnia and herzegovina", "united arab emirates",
}


def build_aba():
    body = read("basket_aba.txt")
    finals = body.split("ABA LEague Finals")[1].split("Records and statistics")[0]
    blocks, cur = [], None
    for ln in finals.split("\n"):
        for tok in ln.split("\t"):
            t = tok.strip()
            if not t:
                continue
            if season_ok(t):
                if cur:
                    blocks.append(cur)
                cur = [t]
            elif cur is not None:
                cur.append(t)
    if cur:
        blocks.append(cur)

    modern = []
    for b in blocks:
        season = norm_season(b[0])
        rest = " ".join(b[1:])
        if _VOID.search(rest):
            continue
        names = []
        for tok in b[1:]:
            t = clean(tok)
            low = fold(t)
            if not t or low in _ABA_COUNTRIES or low in _NOT_A_CLUB:
                continue
            if re.match(r"^[\d\u2013\u2014:–\-\s()OT]+$", t):
                continue
            names.append(t)
            if len(names) == 2:
                break
        if len(names) >= 1:
            modern.append({"season": season, "winner": canon(names[0]),
                           "ru": canon(names[1]) if len(names) > 1 else None})

    # Yugoslav First League: champions list to 1980-81, then playoff finals.
    holders = body.split("Title holders")[-1]
    historic = []
    for season, champ in parse_colon_list(holders.split("\n")):
        c = canon(champ)
        if c:
            historic.append({"season": season, "winner": c, "ru": None})
    po = body.split("Playoff finals")[1].split("Title holders")[0]
    blocks, cur = [], None
    for ln in po.split("\n"):
        t = ln.strip()
        if season_ok(t):
            if cur:
                blocks.append(cur)
            cur = [t]
        elif cur is not None and t:
            cur.append(t)
    if cur:
        blocks.append(cur)
    for b in blocks:
        season = norm_season(b[0])
        cells = [c.strip() for c in "\t".join(b[1:]).split("\t") if c.strip()]
        # home, coach, result, away, coach, 1st of regular season, record
        if len(cells) < 4:
            continue
        home, result, away = cells[0], cells[2], cells[3]
        m = re.match(r"^(\d+)[\u2013\u2014-](\d+)$", clean(result))
        if not m:
            continue
        hw, aw = int(m.group(1)), int(m.group(2))
        w, r = (home, away) if hw > aw else (away, home)
        historic.append({"season": season, "winner": canon(w), "ru": canon(r)})
    historic.sort(key=lambda r: r["season"])
    return modern, historic


def build_russia():
    body = read("basket_russia.txt")
    top = body.split("Soviet Union League medalists")[0]
    # Rows where the league was renamed put the league name on the season line
    # and wrap "(national)"/"(international)" onto the next line, which would
    # otherwise orphan that season's champion.
    top = re.sub(r"\t[^\t\n]*\n\((?:national|international)\)\t", "\t", top)
    modern = []
    for ln in top.split("\n"):
        p = [x.strip() for x in ln.split("\t")]
        if not p or not season_ok(p[0]):
            continue
        season = norm_season(p[0])
        rest = "\t".join(p[1:])
        if _VOID.search(rest):
            continue
        # The league column only appears on the rows where the league changed.
        cells = [c for c in p[1:] if c.strip()]
        if cells and ("League" in cells[0] or "(national)" in cells[0]
                      or "(international)" in cells[0]):
            cells = cells[1:]
        cells = [c for c in cells if not re.match(r"^\(?(national|international)\)?$", c.strip(), re.I)]
        names = []
        for c in cells:
            if re.match(r"^[\d\u2013\u2014:–\-\s()OTNa/—.]+$", clean(c)):
                continue
            names.append(c)
            if len(names) == 2:
                break
        if not names:
            continue
        modern.append({"season": season, "winner": canon(names[0]),
                       "ru": canon(names[1]) if len(names) > 1 else None})

    historic = []
    for ln in body.split("Soviet Union League medalists")[1].split("\n"):
        p = [x.strip() for x in ln.split("\t")]
        if len(p) >= 2 and season_ok(p[0]):
            w, r = canon(p[1]), canon(p[2]) if len(p) > 2 else None
            if w:
                historic.append({"season": norm_season(p[0]), "winner": w, "ru": r})
    return modern, historic


# ------------------------------------------------------------------ main ---

# One roll per country. Each is a sequence of era blocks stored OLDEST BLOCK
# FIRST, so the renderer's reverse() puts the current competition at the top and
# drops a labelled rule at each boundary. Blocks are deliberately NOT merge-
# sorted by season: the Soviet league ran to 1992 while the Russian league
# started in 1991-92, and a global sort would interleave them into nonsense.
#
# Order below is display order, after China: Spain and Italy as Ashwin asked,
# then by weight in European club basketball.
#   key, section label, current-era label, historic-era label, builder
BUILDERS = [
    ("acb", "Spain \u2014 Liga ACB",
     "Liga ACB",
     "Liga Espa\u00f1ola de Baloncesto \u00b7 1957\u20131983", build_spain),
    ("lba", "Italy \u2014 Lega Basket Serie A",
     "Serie A, playoff era",
     "Italian Championship \u00b7 1920\u20131976", build_italy),
    ("greek", "Greece \u2014 Basket League",
     "Basket League, playoff era",
     "Panhellenic Championship \u00b7 1927\u20131986", build_greece),
    ("bsl", "Turkey \u2014 Basketbol S\u00fcper Ligi",
     "Basketbol S\u00fcper Ligi",
     "Turkish Basketball Championship \u00b7 1943\u20131967", build_turkey),
    ("aba", "Adriatic \u2014 ABA League",
     "ABA League",
     "Yugoslav First League \u00b7 1945\u20131992", build_aba),
    ("vtb", "Russia \u2014 VTB United League",
     "Russian Championship / VTB United League",
     "Soviet Union Championship \u00b7 1924\u20131992", build_russia),
    ("israel", "Israel \u2014 Basketball Premier League",
     "Premier League, playoff era",
     "Israeli Championship \u00b7 1954\u20131989", build_israel),
    ("lnb", "France \u2014 LNB \u00c9lite",
     "LNB \u00c9lite, playoff era",
     "French Championship \u00b7 1920\u20131987", build_france),
    ("lkl", "Lithuania \u2014 LKL",
     "Lietuvos krep\u0161inio lyga",
     "Lithuanian League \u00b7 1990\u20131993", build_lithuania),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="print the report, write nothing")
    args = ap.parse_args()

    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else \
        {"labels": {}, "rolls": {}, "most_titled": {}}

    labels, rolls = {}, {}
    # The CBA roll predates this script and has no other builder; carry it
    # through untouched rather than dropping it.
    if "cba" in existing.get("rolls", {}):
        labels["cba"] = "China \u2014 Chinese Basketball Association"
        rolls["cba"] = [{**r, "era": None} for r in existing["rolls"]["cba"]]

    for key, label, era_now, era_past, fn in BUILDERS:
        modern, historic = fn()
        modern = [r for r in modern if r["winner"]]
        historic = [r for r in historic if r["winner"]]
        if historic:
            for r in historic:
                r["era"] = era_past
            for r in modern:
                r["era"] = era_now
            rows = historic + modern          # oldest block first
        else:
            for r in modern:
                r["era"] = None
            rows = modern
        labels[key], rolls[key] = label, rows

    portal = {
        "labels": labels,
        "rolls": rolls,
        "most_titled": {k: rows_to_titles(v) for k, v in rolls.items()},
    }

    # Write before reporting: the report is decoration, and a console encoding
    # error must never be able to lose a good build.
    if not args.check:
        OUT.write_text(json.dumps(portal, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        print(f"wrote {OUT}\n")

    # ---- report -----------------------------------------------------------
    el = json.loads(EUROLEAGUE.read_text(encoding="utf-8"))
    el_names = {c["name"] for c in el["clubs"]}
    seen = set()
    for rws in rolls.values():
        for r in rws:
            seen.add(r["winner"])
            if r["ru"]:
                seen.add(r["ru"])
    matched = sorted(n for n in seen if n in el_names)
    unmatched = sorted(n for n in seen if n not in el_names)

    total = sum(len(v) for v in rolls.values())
    print(f"rolls: {len(rolls)}   seasons: {total}")
    for k in rolls:
        rws = rolls[k]
        ru = sum(1 for r in rws if r["ru"])
        span = f"{rws[0]['season']}..{rws[-1]['season']}" if rws else "EMPTY"
        print(f"  {k:16s} {len(rws):4d} seasons  {ru:4d} with runner-up  {span}")
    print(f"\nclubs: {len(seen)}  EuroLeague-canonical: {len(matched)}  "
          f"other: {len(unmatched)}")
    print("\nnot in euroleague.json (expected for clubs that never played it):")
    for n in unmatched:
        print("   ", n)

    if args.check:
        print("\n--check: nothing written")


if __name__ == "__main__":
    main()
