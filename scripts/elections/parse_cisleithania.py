# -*- coding: utf-8 -*-
"""The Cisleithanian Imperial Council elections, 1897-1911.

WHY THESE BELONG IN THE AUSTRIAN HUB
    The same reason the German hub opens with the Frankfurt Parliament of 1848
    and the North German Confederation Reichstags of 1867 and 1868: the atlas
    carries a country's predecessor legislatures. Cisleithania was the Austrian
    half of Austria-Hungary, and its House of Deputies is the direct ancestor of
    the Nationalrat.

WHICH TABLE
    Each article has two. A party table grouped by NATION -- "Croatian Nation",
    "Czech Nation" -- and a table of parliamentary CLUBS. The clubs are the right
    unit: the Reichsrat organised itself by club, not by party, the club totals
    reconcile to the full house (425, later 516), and the party table is ordered
    by nation rather than by size, which is how a first pass came out with the
    Croatian National Party as the largest group in the empire.
"""
import re
import sys
sys.path.insert(0, '/tmp/hubs')
from parse_dump import articles, clean, num, infobox

CLUB_HEAD = re.compile(r"^(Party|Grouping)\t(Seats)(\t\+/[–-])?\s*$")


def clubs(lines):
    """The club table: name, seats, and the change where the article gives one."""
    best = None
    for i, l in enumerate(lines):
        if not CLUB_HEAD.match(l):
            continue
        rows, total = [], None
        j = i + 1
        while j < len(lines):
            cells = [clean(c) for c in lines[j].split("\t")]
            name = cells[0]
            if not name or len(cells) < 2:
                break
            low = name.lower()
            if low == "total":
                total = num(cells[1])
                break
            if low.startswith(("source", "see also", "references")):
                break
            seats = num(cells[1])
            if seats is None:
                break
            rows.append({"name": name, "seats": int(seats),
                         "change": cells[2] if len(cells) > 2 else None})
            j += 1
        if rows and (best is None or len(rows) > len(best[0])):
            best = (rows, total)
    return best or (None, None)


def build(path):
    out = []
    for t, lines in articles(path):
        if "Cisleithanian" not in (t or "") and "Imperial Council" not in (t or ""):
            continue
        m = re.match(r"^(\d{4})", t)
        if not m:
            continue
        year = int(m.group(1))
        ib = infobox(lines)
        rows, total = clubs(lines)
        if not rows:
            continue
        total_seats = int(total) if total else ib["totalSeats"]
        rows.sort(key=lambda r: -r["seats"])
        out.append({
            "year": year,
            "id": "1900-01" if year == 1900 else str(year),
            "label": "1900–01" if year == 1900 else str(year),
            "date": ib["date"] or str(year),
            "totalSeats": total_seats,
            "majoritySeats": ib["majoritySeats"],
            "turnout": ib["turnout"],
            "clubs": rows,
        })
    out.sort(key=lambda e: e["year"])
    return out


if __name__ == "__main__":
    F = '/root/.claude/uploads/8cb8b4ec-8ac8-5953-bce8-129a2a7800db/2f2d3413-austriaelections.txt'
    for e in build(F):
        print("%-8s %-38s seats %-4s turnout %-6s clubs %2d | %s" % (
            e["id"], e["date"], e["totalSeats"], e["turnout"], len(e["clubs"]),
            ", ".join("%s %d" % (c["name"][:26], c["seats"]) for c in e["clubs"][:3])))
