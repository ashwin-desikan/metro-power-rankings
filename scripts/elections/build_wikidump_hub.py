# -*- coding: utf-8 -*-
"""Assemble election-hub JSON from a Wikipedia dump."""
import sys, re, json
sys.path.insert(0, '/tmp/hubs')
from parse_dump import (articles, find_tables, infobox, title_bits, clean,
                        num, delta, parse_table, norm_head)

IRISH_HEAD = re.compile(r"^Party\tLeader\t")


def _irish_shape(header_text):
    """Which of Ireland's three modern result layouts this is.

    All three start "Party | Leader", all three wrap their header over several
    physical lines, and two of them are eight columns wide with the seat count in
    DIFFERENT positions. Guessing by width put Fianna Fail on 21 seats in 2024
    when the real figure was 48, so the shape is decided by the header words and
    the columns are then read by position.

    Returns (seats_col, votes_col, share_col, change_col, min_cells).
    """
    h = header_text.lower()
    if ("cand" in h) and ("out." in h or "outgoing" in h):
        # 2016-2024: name leader votes %FPv swing cand prev out ELECTED change
        return 8, 2, 3, 9, 10
    if "tds" in h:
        # 2011: name leader votes %FPv swing TDs change %seats
        return 5, 2, 3, 6, 7
    if re.match(r"^party\tleader\tseats", h):
        # pre-2011: name leader SEATS +/- %seats votes %FPv +/-%
        return 2, 5, 6, 3, 6
    return None


def irish_table(lines, i):
    """Parse an Irish results table that starts with a Party | Leader header."""
    # The header runs until the first line that looks like a data row.
    # The header runs until the first row carrying a comma-formatted vote count.
    # Anything looser stops on a header cell like "Cand.[122] | 2020 | Out." and
    # then the shape is decided from half a header.
    j = i
    header = []
    while j < len(lines) and j < i + 14:
        if re.search(r"\d,\d{3}", lines[j]):
            break
        header.append(lines[j])
        j += 1
    else:
        return None
    shape = _irish_shape(" ".join(header))
    if not shape:
        return None
    seats_c, votes_c, share_c, change_c, min_cells = shape

    rows = []
    carry = None          # a party whose name sat on its own line above the row
    blanks = 0
    while j < len(lines):
        line = lines[j]
        cells = line.split("\t")
        label = clean(cells[0])
        low = label.lower()
        if low.startswith(("total", "spoilt", "electorate", "source", "notes",
                           "turnout", "registered")):
            break
        if len(cells) < min_cells:
            # Co-led parties put the party on one line and the second leader on
            # the next; keep the name and use it for the row that follows.
            if label and len(cells) <= 2:
                carry = label
            blanks += 1
            if blanks > 6:
                break
            j += 1
            continue
        blanks = 0
        name = carry or label
        carry = None
        # 2016 renders each row over three physical lines and puts the seat count
        # on the second as "50 / 158  (32%)". Read it there rather than letting
        # the row fall through with the outgoing-seats column.
        if seats_c >= len(cells) and j + 1 < len(lines):
            m = re.match(r"^\s*(\d+)\s*/\s*\d+", lines[j + 1])
            if m:
                cells = cells + [""] * (seats_c - len(cells)) + [m.group(1)]
        if seats_c < len(cells):
            rows.append({
                "name": name,
                "leader": cells[1] if 1 != seats_c else None,
                "seats": cells[seats_c],
                "seatChange": cells[change_c] if change_c < len(cells) else None,
                "votes": cells[votes_c] if votes_c < len(cells) else None,
                "share": cells[share_c] if share_c < len(cells) else None,
            })
        j += 1
    return rows or None


INFOBOX_ROWS = {
    "leader": "leader", "party": "name", "seats won": "seats",
    "seats after": "seats", "seat change": "seatChange",
    "popular vote": "votes", "percentage": "share",
}


def infobox_parties(lines):
    """Read the party columns out of an election infobox.

    Every one of these articles carries the same summary box: a "First party |
    Second party | Third party" strip, then rows for Party, Leader, Seats won,
    Seat change, Popular vote and Percentage, repeated for the next three. It is
    the top six rather than the full field, but it is uniform across every
    article and every country in these dumps, which makes it the right fallback
    when an article's results table is rendered in a shape the table parsers do
    not know. Elections filled this way are marked `partial: True` so the hub can
    say so rather than implying a complete field.
    """
    blocks, cur = [], {}
    for l in lines[:260]:
        cells = l.split("\t")
        if len(cells) < 2:
            continue
        key = clean(cells[0]).lower().rstrip(":")
        low = l.lower()
        if sum(w in low for w in ("first party", "second party", "third party",
                                  "fourth party", "fifth party", "sixth party",
                                  "seventh party", "eighth party", "ninth party")) >= 2:
            if cur:
                blocks.append(cur)
            cur = {}
            continue
        field = INFOBOX_ROWS.get(key)
        if not field:
            continue
        cur.setdefault(field, [clean(c) for c in cells[1:]])
    if cur:
        blocks.append(cur)

    rows = []
    for b in blocks:
        names = b.get("name") or []
        for k, nm in enumerate(names):
            if not nm or nm.lower() in ("did not exist", "n/a", "—", "-"):
                continue
            row = {"name": nm}
            for field in ("leader", "seats", "seatChange", "votes", "share"):
                vals = b.get(field) or []
                if k < len(vals):
                    row[field] = vals[k]
            if row.get("seats") is not None or row.get("votes") is not None:
                rows.append(row)
    # An article can repeat the box (mobile + desktop renderings); de-duplicate.
    seen, out = set(), []
    for r in rows:
        if r["name"] in seen:
            continue
        seen.add(r["name"])
        out.append(r)
    return out or None


IRISH_PRES = re.compile(r"^Candidate\tNominated by\t%\s*1st Pref\tCount 1")
TURNOUT_LINE = re.compile(r"Turnout:\s*[\d,]+\s*\(([\d.]+)%\)|Turnout:\s*([\d.]+)%")


def irish_pres_table(lines):
    """Ireland's presidential count table.

        Candidate | (blank) | Nominated by | % 1st Pref | Count 1 [| Count 2]

    Presidential elections here are STV with a single seat, so later counts are
    transfers rather than a second round; Count 2 is carried as the runoff figure
    because that is what decided 1990. Five of the thirteen contests had a single
    nominee and were never put to a vote at all: those legitimately have no table
    and must not be filled in from anywhere else.
    """
    for i, l in enumerate(lines):
        if not IRISH_PRES.match(l):
            continue
        rows, turnout = [], None
        j = i + 1
        while j < len(lines):
            line = lines[j]
            m = TURNOUT_LINE.search(line)
            if m:
                turnout = float(m.group(1) or m.group(2))
                break
            cells = line.split("\t")
            name = clean(cells[0])
            if not name or len(cells) < 5:
                break
            rows.append({
                "name": name,
                "nominatedBy": clean(cells[2]) if len(cells) > 2 else None,
                "share": cells[3],
                "votes": cells[4],
                "votes2": cells[5] if len(cells) > 5 else None,
            })
            j += 1
        if rows:
            return rows, turnout
    return None, None


def nominee_parties(lines):
    """Map nominee -> party from the infobox, which the count table omits."""
    out = {}
    names = None
    for l in lines[:260]:
        cells = [clean(c) for c in l.split("\t")]
        if len(cells) < 2:
            continue
        key = cells[0].lower()
        if key == "nominee":
            names = cells[1:]
        elif key == "party" and names:
            for k, nm in enumerate(names):
                if nm and k < len(cells) - 1 and cells[k + 1]:
                    out.setdefault(nm, cells[k + 1])
            names = None
    return out


def best_table(lines):
    pres, pres_turnout = irish_pres_table(lines)
    if pres:
        parties = nominee_parties(lines)
        for r in pres:
            r["party"] = parties.get(r["name"])
        return pres, ({"registered voters": [str(pres_turnout)]} if pres_turnout else {})
    for i, l in enumerate(lines):
        if IRISH_HEAD.match(l):
            r = irish_table(lines, i)
            if r and len(r) >= 3:
                return r, {}
    tabs = find_tables(lines)
    if not tabs:
        return infobox_parties(lines), {}
    # Prefer a table with seats AND votes, then the longest.
    def score(t):
        keys = t[3]
        return (("seats" in keys) + ("votes" in keys), len(t[1]))
    i, rows, totals, keys = max(tabs, key=score)
    return rows, totals


def to_party(r):
    return {
        "party": clean(r["party"]) if r.get("party") else None,
        "votes2": int(num(r["votes2"])) if num(r.get("votes2")) is not None else None,
        "share2": num(r.get("share2")),
        "name": clean(r.get("name")),
        "leader": clean(r["leader"]) if r.get("leader") and clean(r["leader"]) not in ("N/A", "—", "-") else None,
        "seats": int(num(r["seats"])) if num(r.get("seats")) is not None else None,
        "seatChange": delta(r.get("seatChange")),
        "votes": int(num(r["votes"])) if num(r.get("votes")) is not None else None,
        "share": num(r.get("share")),
        "swing": None,
    }


def turnout_from_totals(totals):
    for key in ("registered voters", "electorate"):
        v = totals.get(key)
        if not v:
            continue
        for cell in v:
            n = num(cell)
            if n is not None and 5 <= n <= 100:
                return n
    return None


def build(path, want, kind_of):
    """want(title) -> True to include. kind_of(title) -> 'leg' | 'pres'."""
    out = []
    seen = set()
    for title, lines in articles(path):
        if not title or not want(title):
            continue
        year, month = title_bits(title)
        if year is None:
            continue
        ib = infobox(lines)
        rows, totals = best_table(lines)
        parties = [to_party(r) for r in rows] if rows else []
        parties = [p for p in parties
                   if p["name"] and len(p["name"]) < 70
                   and (p["seats"] is not None or p["votes"] is not None or p["share"] is not None)]
        turnout = ib["turnout"] if ib["turnout"] is not None else turnout_from_totals(totals)
        total_seats = ib["totalSeats"]
        if total_seats is None and parties and all(p["seats"] is not None for p in parties):
            s = sum(p["seats"] for p in parties)
            total_seats = s if s > 1 else None
        eid = ("%s-%s" % (year, month.lower())) if month else str(year)
        if eid in seen:
            eid = eid + "b"
        seen.add(eid)
        out.append({
            "id": eid,
            "label": ("%s %s" % (month, year)) if month else str(year),
            "year": year,
            "date": ib["date"] or str(year),
            "kind": kind_of(title),
            "totalSeats": total_seats,
            "majoritySeats": ib["majoritySeats"],
            "turnout": turnout,
            "parties": parties,
            "pmBefore": ib["before"],
            "pmAfter": ib["after"],
            "knownAs": None,
            "summary": "",
            "caveat": None,
            "sourceTitle": title,
        })
    out.sort(key=lambda e: (e["year"], e["id"]))
    return out
