#!/usr/bin/env python3
"""Annual auto-update of the County Championship honour roll.

Reads the per-season results table on the Wikipedia list (each row: a `!` year
header cell, then a champion cell, then a runner-up cell), finds the newest
season, and appends that row to public/data/honours/cricket-county.json if it is
not already present, then recomputes most_titled. Append-only and idempotent, so
it never rewrites the historical rows. The titles-by-club summary table lower on
the page is ignored (its `!` header cells hold county names, not years).

    python scripts/update-county-champion.py            # apply
    python scripts/update-county-champion.py --dry      # show, write nothing

Run after the County Championship finishes (September). Wikipedia egress required
(your machine or CI; the Cowork sandbox is blocked).
"""
import os, re, sys, json, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "honours", "cricket-county.json")
URL = "https://en.wikipedia.org/wiki/List_of_official_County_Championship_winners?action=raw"
DRY = "--dry" in sys.argv

# Wikipedia label -> the canonical name already used in cricket-county.json.
# Extend only if a future champion's Wikipedia name differs from our roll's.
NAME_FIX = {}

def _cellval(c):
    # drop a leading MediaWiki cell attribute (`style=... | value` -> value),
    # but only when the left side is a real attribute (not a wikilink/template).
    if "|" in c:
        left, _, right = c.partition("|")
        if "=" in left and "[[" not in left and "{{" not in left:
            return right
    return c

def deww(s):
    for _ in range(5):
        s = re.sub(r"\{\{(?:center|small|nowrap|nobr|nobold|resize)\|([^{}]*)\}\}", r"\1", s, flags=re.I)
        s = re.sub(r"\{\{[Ss]ort(?:name)?\|[^{}]*\|([^{}]*)\}\}", r"\1", s)
        s = re.sub(r"\{\{[a-z ]*icon\|[^{}]*\}\}", "", s, flags=re.I)
        s = re.sub(r"\[\[[^\[\]|]*\|([^\[\]]*)\]\]", r"\1", s)
        s = re.sub(r"\[\[([^\[\]]*)\]\]", r"\1", s)
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<ref[^>]*?(/>|>.*?</ref>)", "", s, flags=re.S)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"[\[\]{}]", "", s)
    return s.strip()

def clean_team(s):
    s = deww(s)
    s = re.sub(r"\s*\(\d+\)", "", s)          # drop "(22)" title count
    s = re.sub(r"\s*\(\s*\)", "", s)          # drop empty "()"
    s = re.sub(r"[‡†§#*✝]", "", s).strip()     # drop markers
    return NAME_FIX.get(s, s)

def latest_champion(txt):
    best = None  # (year, winner, ru)
    for block in re.split(r"\n\|-", txt):
        lines = [l for l in block.splitlines() if l.strip()]
        if not lines:
            continue
        head = lines[0].strip()
        if not head.startswith("!"):
            continue
        ym = re.search(r"\b(?:18|19|20)\d\d\b", head)
        if not ym:                            # summary-table rows have county names, no year
            continue
        year = int(ym.group(0))
        cells = []
        for l in lines[1:]:
            st = l.strip()
            if st.startswith("|-") or st.startswith("|}"):
                break
            if st.startswith("|"):
                cells.append(_cellval(st[1:].split("||")[0]))
        if len(cells) < 2:
            continue
        winner, ru = clean_team(cells[0]), clean_team(cells[1])
        if not winner:
            continue
        if best is None or year > best[0]:
            best = (year, winner, ru)
    return best

def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "CitizenOfNowhere/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode("utf-8", "replace")
    best = latest_champion(txt)
    if not best or best[0] < 1990:
        sys.exit("could not identify the latest champion (page format may have changed).")
    year, winner, ru = best

    data = json.load(open(OUT, encoding="utf-8"))
    roll = data["rolls"]["county"]
    seasons = {str(r["season"]) for r in roll}
    if str(year) in seasons:
        print(f"up to date: {year} ({winner}, def. {ru or 'N/A'}) already in the roll.")
        return
    print(f"NEW champion: {year} {winner} (def. {ru or 'N/A'})")
    if DRY:
        print("dry run; nothing written.")
        return
    roll.append({"season": str(year), "winner": winner, "ru": ru or None})
    roll.sort(key=lambda r: int(re.match(r"(\d{4})", str(r["season"])).group(1)))
    from collections import Counter
    c = Counter(r["winner"] for r in roll)
    data["most_titled"]["county"] = [{"winner": t, "titles": n} for t, n in c.most_common()]
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"appended {year} {winner} and refreshed most_titled ({len(roll)} seasons).")

if __name__ == "__main__":
    main()
