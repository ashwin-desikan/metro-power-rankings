#!/usr/bin/env python3
"""Annual auto-update of the British rugby league champions honour roll.

Reads the Wikipedia list, finds the newest season's champion, and appends that
single row to public/data/honours/rugby-league.json if it is not already there,
then recomputes most_titled. Append-only by design: it never rewrites the
historical rows, so it can't disturb the existing club names. Idempotent.

    python scripts/update-british-rl-champion.py            # apply
    python scripts/update-british-rl-champion.py --dry      # show, write nothing

Run after the Super League Grand Final (October). Wikipedia egress required
(your machine or CI; the Cowork sandbox is blocked).
"""
import os, re, sys, json, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "honours", "rugby-league.json")
URL = "https://en.wikipedia.org/wiki/List_of_British_rugby_league_champions?action=raw"
DRY = "--dry" in sys.argv

# Wikipedia club label -> the canonical name already used in rugby-league.json.
# Extend if a new champion's Wikipedia name differs from our roll's spelling.
NAME_FIX = {"St Helens": "St. Helens", "Hull": "Hull F.C."}

def _cellval(c):
    # drop a leading MediaWiki cell attribute: `style=... | value` -> value.
    # only when the left side is an attribute (has `=`, not a wikilink/template).
    if "|" in c:
        left, _, right = c.partition("|")
        if "=" in left and "[[" not in left and "{{" not in left:
            return right
    return c

def deww(s):
    for _ in range(5):
        # unwrap text-wrapping templates, keeping the inner content
        s = re.sub(r"\{\{(?:center|small|nowrap|nobr|nobold|resize)\|([^{}]*)\}\}", r"\1", s, flags=re.I)
        s = re.sub(r"\{\{[Ss]ort\|[^|{}]*\|([^{}]*)\}\}", r"\1", s)
        # drop icon templates (no text we want)
        s = re.sub(r"\{\{[a-z ]*icon\|[^{}]*\}\}", "", s, flags=re.I)
        # resolve wikilinks
        s = re.sub(r"\[\[[^\[\]|]*\|([^\[\]]*)\]\]", r"\1", s)
        s = re.sub(r"\[\[([^\[\]]*)\]\]", r"\1", s)
        # any remaining simple template -> drop
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<ref[^>]*?(/>|>.*?</ref>)", "", s, flags=re.S)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"[\[\]{}]", "", s)
    return s.strip()

def clean_team(s):
    s = deww(s)
    s = re.sub(r"\s*\(\d+\)", "", s)          # drop "(24)" title count
    s = re.sub(r"[‡†§#*✝]", "", s).strip()     # drop double/treble markers
    return NAME_FIX.get(s, s)

def parse_champions(txt):
    rows = []
    for block in re.split(r"\n\|-", txt):              # every table row on the page
        cells = []
        for line in block.splitlines():
            st = line.lstrip()
            if not st.startswith("|") or st.startswith(("|-", "|+", "|}")):
                continue
            for c in st[1:].split("||"):               # one-cell-per-line and inline || both work
                cells.append(_cellval(c))
        if len(cells) < 5:
            continue
        season = deww(cells[1])
        if not re.match(r"^\d{4}", season):            # champion rows have a year in the season cell
            continue
        w, ru = clean_team(cells[2]), clean_team(cells[4])
        if w and ru:
            rows.append({"season": season, "winner": w, "ru": ru})
    return rows

def season_key(s):
    return int(re.match(r"(\d{4})", s).group(1))

def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "CitizenOfNowhere/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode("utf-8", "replace")
    rows = parse_champions(txt)
    if not rows:
        sys.exit("could not parse any champion rows from Wikipedia (page format may have changed).")
    latest = max(rows, key=lambda x: season_key(x["season"]))

    data = json.load(open(OUT, encoding="utf-8"))
    roll = data["rolls"]["superleague"]
    seasons = {r["season"] for r in roll}
    if latest["season"] in seasons:
        print(f"up to date: {latest['season']} ({latest['winner']}) already in the roll.")
        return
    print(f"NEW champion: {latest['season']} {latest['winner']} (def. {latest['ru']})")
    if DRY:
        print("dry run; nothing written.")
        return
    roll.append(latest)
    roll.sort(key=lambda r: season_key(r["season"]))
    from collections import Counter
    c = Counter(r["winner"] for r in roll)
    data["most_titled"]["superleague"] = [{"winner": t, "titles": n} for t, n in c.most_common()]
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"appended {latest['season']} and refreshed most_titled ({len(roll)} seasons).")

if __name__ == "__main__":
    main()
