# -*- coding: utf-8 -*-
"""Assemble election-hub JSON from a Wikipedia dump."""
import sys, re, json
sys.path.insert(0, '/tmp/hubs')
from parse_dump import (articles, find_tables, find_tiered, infobox, title_bits, MONTHS,
                        clean, num, delta, parse_table, norm_head, lead_date,
                        plebiscite_table)

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
    # Iran's Majlis infoboxes name the alliance and not the party, because that
    # is the unit Iranian legislative elections are reported in. Used only when
    # no Party row exists in the same block.
    "alliance": "altname",
}


CAND_PARTY_HEAD = re.compile(r"^Party\tCandidate\t", re.I)


def candidate_party_table(lines):
    """A presidential table headed "Party | Candidate | Votes | %".

    Iran reports its presidential results party-first, and two of the articles
    widen it to "Party | Candidate | Nohlen et al | ISSDP" over "Votes | % |
    Votes | %" because two scholarly counts disagree in the fourth decimal.
    Read the candidate as the name and take the FIRST pair of figures. Without
    this the candidate column was read as the party and seven Iranian
    presidential elections came through with no result at all.
    """
    for i, l in enumerate(lines):
        if not CAND_PARTY_HEAD.match(l):
            continue
        head = [clean(c) for c in l.split("\t")]
        j = i + 1
        # An optional sub-header row of Votes/% pairs.
        while j < len(lines) and j < i + 3:
            cells = [clean(c) for c in lines[j].split("\t")]
            if all(norm_head(c) in ("votes", "share") for c in cells if c):
                head = head[:2] + cells
                j += 1
                continue
            break
        cols = {}
        for k, h in enumerate(head[2:], start=2):
            key = norm_head(h)
            if key in ("votes", "share") and key not in cols:
                cols[key] = k
        if "votes" not in cols or "share" not in cols:
            continue
        rows = []
        while j < len(lines):
            line = lines[j]
            if not line.strip() or "\t" not in line:
                break
            cells = line.split("\t")
            label = clean(cells[0])
            if not label or label.lower().startswith(("total", "blank", "invalid",
                                                      "registered", "source",
                                                      "valid", "turnout")):
                break
            if len(cells) > 3 and not clean(cells[1]):
                cells = [cells[0]] + cells[2:]      # rendered spacer column
            if max(cols.values()) >= len(cells) or len(cells) < 3:
                break
            rows.append({
                "name": clean(cells[1]),
                "party": label,
                "votes": cells[cols["votes"]],
                "share": cells[cols["share"]],
            })
            j += 1
        if len(rows) >= 2:
            return rows
    return None


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
        names = b.get("name") or b.get("altname") or []
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


# Which header a series wants. A general-election article carries BOTH tables:
# the DRC's 2023 page has "Candidate | Party | Votes | %" for the presidency and
# "Party or alliance | Votes | % | Seats | +/-" for the National Assembly, and
# without this the presidential series was filled with the assembly's seat
# counts. "first" also settles Colombia, whose congressional articles print the
# Senate table and then the Chamber one; the Senate comes first and stays first.
PRES_HEAD = ("candidate", "nominee")
LEG_HEAD = ("party", "party or alliance", "party and faction", "party or faction",
            "alliance", "coalition", "parties")


def _head_word(lines, i):
    return clean(lines[i].split("\t")[0]).lower()


def best_table(lines, prefer=None):
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

    # Prefer a table with seats AND votes, then the longest.
    def score(t):
        keys = t[3]
        return (("seats" in keys) + ("votes" in keys), len(t[1]))

    def usable(rows):
        return any(num(r.get(k)) is not None
                   for r in rows for k in ("seats", "votes", "share"))

    words = PRES_HEAD if prefer == "pres" else LEG_HEAD if prefer and prefer.startswith("leg") else None

    def head_ok_early(i):
        return words is None or _head_word(lines, i) in words

    if prefer == "leg-tiered":
        # Pakistan's modern tables are headed "Party | Votes | % | Seats" over
        # "General | Women | Minority | Total", so a flat reading takes the
        # general seats and drops the 70 reserved ones that are shared out in
        # proportion to them. PTI held 151 of 342 seats in 2018, not 118, and
        # with the reserved bench missing the proportionality index refused to
        # score any election after 2002.
        early = find_tiered(lines, head_ok_early)
        if early:
            return early, {}

    def head_ok(i):
        return words is None or _head_word(lines, i) in words

    def pick(tabs):
        tabs = [t for t in tabs if head_ok(t[0]) and usable(t[1])]
        if not tabs:
            return None
        # A series that asked for one of the two tables a general-election
        # article carries takes the FIRST qualifying one, not the longest: the
        # chamber an article leads with is the one it treats as the headline,
        # which is how Colombia's congressional pages stay on the Senate across
        # seventy years. Where no preference applies, the old rule stands.
        if words is not None:
            full = [t for t in tabs if {"votes", "seats"} <= t[3]]
            # "leg-small" picks the smaller chamber where an article prints
            # both. Colombia's congressional pages carry the Senate and the
            # Chamber of Representatives, usually in that order but not in 2006
            # or 2026, and the Senate is always the smaller house: 102 or 108
            # seats against 158 to 210. Taking the first table put one row of a
            # ninety-year Senate series on the wrong chamber.
            if prefer == "pres" and len(tabs) > 1:
                # A presidential article can carry party primaries in the same
                # shape as the result: Chile 1993 prints two of them before the
                # real six-candidate table. The election is the one with the
                # full field, so take the longest that reports both votes and
                # shares rather than the first that appears.
                rich = [t for t in tabs if {"votes", "share"} <= t[3]] or tabs
                return max(rich, key=lambda t: len(t[1]))
            if prefer == "leg-small" and len(full) > 1:
                def seat_sum(t):
                    return sum(num(r.get("seats")) or 0 for r in t[1])
                return min(full, key=seat_sum)
            if prefer == "leg-large" and len(full) > 1:
                # Peru's bicameral articles (1980, 1985, 1990, 2026) print the
                # Senate table before the Chamber of Deputies table. Taking the
                # first table put those four rows on the smaller upper house
                # while the unicameral years in between (1995-2021, all called
                # "Congress") report the larger body, so the series switched
                # chambers mid-stream. "leg-large" keeps every bicameral year
                # on the Chamber of Deputies, matching the unicameral rows on
                # either side of it.
                def seat_sum(t):
                    return sum(num(r.get("seats")) or 0 for r in t[1])
                return max(full, key=seat_sum)
            if prefer == "leg-large" and len(tabs) > 1:
                # 1962's Senate and Chamber of Deputies tables both give seats
                # only, no votes, so neither qualifies for "full" above; fall
                # back to the same largest-chamber choice over the seats-only
                # tables rather than defaulting to the first (the Senate).
                def seat_sum(t):
                    return sum(num(r.get("seats")) or 0 for r in t[1])
                seatful = [t for t in tabs if any(num(r.get("seats")) is not None for r in t[1])]
                if len(seatful) > 1:
                    return max(seatful, key=seat_sum)
            return (full or tabs)[0]
        return max(tabs, key=score)

    # A series with a stated preference reads the single-row tables too: Iran's
    # 1975 Majlis table has exactly one party in it (that was the point of the
    # Rastakhiz Party) and being skipped for having one row handed the hub the
    # Senate table printed underneath it.
    tabs = find_tables(lines, min_rows=1 if words is not None else 2)
    best = pick(tabs)
    # A plain single-tier table that names both votes and seats is the article's
    # own summary and always beats a stacked one, which reports a single tier.
    # Where it does not exist, a stacked header is read positionally: Hungary's
    # 2010 summary table headed "Party | Proportional | ... | Seats" otherwise
    # yields Fidesz on 2,732,965 seats, and 2026's list-quotient table yields
    # Tisza on 45 rather than 141.
    if best and {"votes", "seats"} <= best[3]:
        return best[1], best[2]
    tiered = find_tiered(lines, head_ok)
    # A stacked header usually beats a plain one that lacks votes and seats
    # together, but not when it reads worse: Kenya's 2022 National Assembly
    # article carries a clean "Party | Leader | Seats" table with 23 rows and,
    # further down, a coalition-grouped "Party or alliance | Seats" table whose
    # wrapped alliance header swallows the tier below it, so the stacked reader
    # returns one row (the alliance's own name mislabelled with its first
    # member's seat count). Preferring the stacked table unconditionally handed
    # the hub a single-party legislature. Only take it when it captured at
    # least as many rows as the plain table already in hand.
    if tiered and (not best or len(tiered) >= len(best[1])):
        return tiered, (best[2] if best else {})
    if best:
        return best[1], best[2]
    if prefer == "pres":
        # After the two-round reader, never before it: an article can also carry
        # a party primary in this exact shape, and Colombia's 2018 page does.
        cp = candidate_party_table(lines)
        if cp:
            return cp, {}
    one = pick(find_tables(lines, min_rows=1))
    if one:
        return one[1], one[2]
    if prefer != "leg":
        pleb = plebiscite_table(lines)
        if pleb:
            return pleb, {}
    if prefer == "pres":
        # Never fall back to the infobox for a presidential series: the box on a
        # general-election page describes the parties, not the candidates.
        return None, {}
    return infobox_parties(lines), {}


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


def build(path, want, kind_of, prefer=None):
    """want(title) -> True to include. kind_of(title) -> 'leg' | 'pres'.

    prefer picks between the two results tables a general-election article
    carries: "pres" takes the candidate-headed one, "leg" the party-headed one.
    prefer may also be a callable(title) -> preference string, for a series
    whose right preference changes partway through: Czechoslovakia's 1920-92
    bicameral articles need "leg-large" to keep the larger house regardless of
    which table an article prints first, but applying "leg-large" to the
    unicameral 1996- Czech Republic articles as well picked up an outgoing
    Chamber's pre-election-day composition table (also a full 200-seat table)
    over the actual results table on two elections, since both tie on seat
    sum and only the per-article default "first qualifying table" rule reads
    the newer article correctly.
    """
    out = []
    seen = set()
    seen_titles = set()
    for title, lines in articles(path):
        if not title or not want(title):
            continue
        # Colombia's dump carries two articles twice (the 1970 general election
        # and the 1974 presidential), which without this became 1970b and 1974b.
        year, month = title_bits(title)
        if year is None:
            continue
        ib = infobox(lines)
        date = ib["date"] or lead_date(lines) or ib["dateLoose"] or str(year)
        # Colombia's dump carries two articles twice (the 1970 general election
        # and the 1974 presidential). The date is part of the key because a
        # rebuilt title cannot tell Sweden's two 1887 elections apart, and they
        # are two different elections, not one article printed twice.
        if (title, date) in seen_titles:
            continue
        seen_titles.add((title, date))
        this_prefer = prefer(title) if callable(prefer) else prefer
        rows, totals = best_table(lines, this_prefer)
        parties = [to_party(r) for r in rows] if rows else []
        parties = [p for p in parties
                   if p["name"] and len(p["name"]) < 100
                   and (p["seats"] is not None or p["votes"] is not None or p["share"] is not None)]
        turnout = ib["turnout"] if ib["turnout"] is not None else turnout_from_totals(totals)
        # The table's own Total row. Colombia's infobox gives the size of the
        # Chamber while the table beneath it is the Senate, so a hub can ask for
        # the house the table actually describes.
        table_seats = None
        for cell in reversed(totals.get("total") or []):
            v = num(cell)
            if v is not None and 1 < v < 5000 and float(v).is_integer():
                table_seats = int(v)
                break
        total_seats = ib["totalSeats"]
        seat_total_source = "infobox" if total_seats is not None else None
        if total_seats is None and parties and all(p["seats"] is not None for p in parties):
            s = sum(p["seats"] for p in parties)
            total_seats = s if s > 1 else None
            seat_total_source = "sum" if total_seats is not None else None
        if month is None:
            m = re.search(r"\b(%s)\b" % "|".join(MONTHS), date)
            month = m.group(1) if m else None
        out.append({
            "id": None,
            "label": None,
            "_month": month,
            "year": year,
            "date": date,
            "kind": kind_of(title),
            "totalSeats": total_seats,
            "tableSeats": table_seats,
            "seatTotalSource": seat_total_source,
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
    # Ids are assigned in a second pass, because whether a year needs its month
    # is a fact about the whole series. Sweden went to the polls twice in 1887
    # and Greece twice in 2023; a year that happened once stays a bare year.
    counts = {}
    for e in out:
        counts[e["year"]] = counts.get(e["year"], 0) + 1
    seen = set()
    for e in out:
        month = e.pop("_month")
        if counts[e["year"]] > 1 and month:
            eid = "%s-%s" % (e["year"], month.lower())
            label = "%s %s" % (month, e["year"])
        else:
            eid, label = str(e["year"]), str(e["year"])
        while eid in seen:
            eid += "b"
        seen.add(eid)
        e["id"], e["label"] = eid, label
    out.sort(key=lambda e: (e["year"], e["id"]))
    return out
