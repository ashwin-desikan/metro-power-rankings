# -*- coding: utf-8 -*-
"""Parse concatenated Wikipedia article dumps into election-hub JSON.

The dumps are rendered-page text, one article after another, each beginning
"WikipediaThe Free Encyclopedia". Tables survive as tab-delimited lines, which
is the whole reason this is a parser rather than a transcription job.
"""
import json, re, sys, unicodedata

SPLIT = "WikipediaThe Free Encyclopedia"
TITLE_RE = re.compile(
    r"^((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+)?"
    r"(1[6-9]\d{2}|20\d{2})(?:[–-]\d{2,4})?\s+"
    r"(.{0,60}?)\s+(election|elections)\b", re.I)

MONTHS = ("January February March April May June July August September October "
          "November December").split()
DATE_RE = re.compile(
    r"\b(\d{1,2})\s+(%s)\s+(1[6-9]\d{2}|20\d{2})\b" % "|".join(MONTHS))
DATE_RE_US = re.compile(
    r"\b(%s)\s+(\d{1,2}),\s+(1[6-9]\d{2}|20\d{2})\b" % "|".join(MONTHS))

ARROWS = ("Increase", "Decrease", "Steady", "Growth", "IncreaseIncrease")


def clean(s):
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"\[[a-z0-9]{1,3}\]", "", s)          # footnote markers
    s = re.sub(r"\[(?:link removed|note \d+)\]", "", s, flags=re.I)
    return s.strip()


def num(s):
    """A vote count or percentage, or None."""
    if s is None:
        return None
    t = clean(s)
    for a in ARROWS:
        t = t.replace(a, " ")
    t = t.replace("−", "-").replace("–", "-").replace("—", "-")
    t = t.replace(",", "").replace("%", "").replace("+", "").strip()
    if t in ("", "-", "N/A", "New", "—", "n/a", "N/a", "—N/a"):
        return None
    m = re.match(r"^-?\d+(?:\.\d+)?$", t)
    return float(m.group(0)) if m else None


def delta(s):
    """A +/- column: New and Steady both mean something, so keep them apart."""
    if s is None:
        return None
    t = clean(s)
    if not t or t.lower() in ("n/a", "new", "—", "-", "—n/a"):
        return None
    if "Steady" in t:
        return 0
    sign = -1 if ("Decrease" in t or t.lstrip().startswith(("-", "−", "–"))) else 1
    v = num(t)
    return None if v is None else int(round(sign * abs(v)))


def articles(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    for chunk in raw.split(SPLIT)[1:]:
        lines = [l.rstrip() for l in chunk.split("\n")]
        title = None
        start = 0
        for i, l in enumerate(lines):
            if l.strip() == "From Wikipedia, the free encyclopedia":
                start = i
                break
        # The line after the banner is usually the title, but redirect and
        # hatnote pages put boilerplate there. Scan a short way for a line that
        # actually looks like an election title.
        for j in range(start + 1, min(start + 25, len(lines))):
            cand = clean(lines[j])
            if cand and TITLE_RE.match(cand):
                title = cand
                break
        if title is None:
            for j in range(start + 1, min(start + 6, len(lines))):
                if clean(lines[j]):
                    title = clean(lines[j])
                    break
        yield title, lines[start:]


# --------------------------------------------------------------- tables ------

HEADER_ALIASES = {
    "party": "name", "party or alliance": "name", "alliance": "name",
    "coalition": "name", "parties": "name", "candidate": "name",
    "votes": "votes", "popular vote": "votes", "first pref. votes": "votes",
    "first pref.votes": "votes", "valid votes": "votes",
    "%": "share", "% fpv": "share", "share": "share", "percentage": "share",
    "seats": "seats", "total seats": "seats", "seats won": "seats",
    "+/-": "seatChange", "±": "seatChange", "+/–": "seatChange", "change": "seatChange",
    "leader": "leader",
}


def norm_head(h):
    h = clean(h).lower().replace("–", "-").replace("−", "-")
    h = re.sub(r"\s+", " ", h).strip()
    return HEADER_ALIASES.get(h)


def parse_table(lines, i):
    """Read a tab-delimited table whose header starts at line i.

    Returns (rows, totals, i_end) where rows are dicts keyed by the mapped
    column names. Header cells that wrap onto following lines are glued back on
    (Ireland's '% of\\nseats\\tFirst pref.\\nvotes' is the reason this exists).
    """
    head = lines[i].split("\t")
    j = i + 1
    # Glue continuation lines: a wrapped header line has fewer tabs and no digits
    while j < len(lines) and j < i + 4:
        nxt = lines[j]
        if not nxt.strip():
            break
        if re.search(r"\d[\d,]{2,}", nxt):
            break
        cells = nxt.split("\t")
        if len(cells) >= len(head):
            break
        # merge onto the tail of head
        for k, c in enumerate(cells):
            idx = len(head) - len(cells) + k
            if 0 <= idx < len(head):
                head[idx] = head[idx] + " " + c
        j += 1

    cols = {}
    for k, h in enumerate(head):
        key = norm_head(h)
        if not key:
            continue
        if key == "name" and "name" in cols:
            # "Candidate | Party | Votes | %": the second name-ish column is the
            # candidate's party, not another name.
            cols.setdefault("party", k)
            continue
        if key not in cols:
            cols[key] = k
    if "name" not in cols:
        return None, None, i + 1
    # Two-round presidential tables repeat Votes/% under First round and Second
    # round headings; take the later pair as round two.
    joined = " | ".join(h.lower() for h in head)
    if "first round" in joined and "second round" in joined:
        vs = [k for k, h in enumerate(head) if norm_head(h) == "votes"]
        ps = [k for k, h in enumerate(head) if norm_head(h) == "share"]
        if len(vs) >= 2:
            cols["votes"], cols["votes2"] = vs[0], vs[1]
        if len(ps) >= 2:
            cols["share"], cols["share2"] = ps[0], ps[1]

    rows, totals = [], {}
    while j < len(lines):
        line = lines[j]
        if not line.strip() or "\t" not in line:
            break
        cells = line.split("\t")
        label = clean(cells[0])
        low = label.lower()
        if low.startswith(("total", "valid votes", "invalid", "blank", "spoilt",
                           "registered voters", "electorate", "source", "turnout",
                           "abstention", "rejected")):
            if low.startswith("total") or low.startswith("registered") or low.startswith("electorate"):
                totals[low.split("/")[0].strip()] = [clean(c) for c in cells[1:]]
            j += 1
            if low.startswith("source"):
                break
            continue
        if not label or label.lower() in ("notes", "results"):
            break
        row = {"name": label}
        for key, k in cols.items():
            if key == "name" or k >= len(cells):
                continue
            row[key] = cells[k]
        rows.append(row)
        j += 1
    return rows, totals, j


def find_tables(lines):
    out = []
    for i, l in enumerate(lines):
        if "\t" not in l:
            continue
        first = norm_head(l.split("\t")[0])
        if first != "name":
            continue
        keys = {norm_head(h) for h in l.split("\t")}
        if not ({"votes", "seats"} & keys):
            continue
        rows, totals, _ = parse_table(lines, i)
        if rows and len(rows) >= 2:
            out.append((i, rows, totals, {k for k in keys if k}))
    return out


# ------------------------------------------------------------- infobox -------

SEATS_RE = re.compile(r"All\s+([\d,]+)\s+seats?\s+in\s+(.+?)(?:\s*\[|$)", re.I)
SEATS_RE2 = re.compile(r"([\d,]+)\s+of\s+the\s+([\d,]+)\s+seats?\s+in\s+(.+?)(?:\s*\[|$)", re.I)
# "166 seats in Dail Eireann" - no "All", which is how four Irish elections came
# out with a seat total summed from the listed parties instead of the real house.
SEATS_RE3 = re.compile(r"^([\d,]{2,4})\s+seats?\s+in\s+(.+?)(?:\s*\[|$)", re.I)
MAJ_RE = re.compile(r"([\d,]+)\s+seats?\s+needed\s+for\s+a\s+majority", re.I)
TURNOUT_RE = re.compile(r"^Turnout\t([\d.]+)\s*%", re.M)
NAV_RE = re.compile(r"^←\s*[^\t]*\t([^\t]+)\t.*→\s*$")

LEADER_BEFORE = re.compile(
    r"^(Chancellor|Taoiseach|Prime Minister|President|Premier|Head of Government)"
    r"\s+before\s+(?:the\s+)?election", re.I)
LEADER_AFTER = re.compile(
    r"^(?:Elected|Subsequent|New|Incoming)\s+"
    r"(Chancellor|Taoiseach|Prime Minister|President|Premier|Head of Government)", re.I)


def infobox(lines):
    out = {"date": None, "totalSeats": None, "majoritySeats": None,
           "turnout": None, "before": None, "after": None, "chamber": None}
    text = "\n".join(lines[:220])

    m = TURNOUT_RE.search(text)
    if m:
        out["turnout"] = float(m.group(1))

    for l in lines[:220]:
        s = clean(l)
        m = NAV_RE.match(s)
        if m and out["date"] is None:
            d = DATE_RE.search(m.group(1)) or DATE_RE_US.search(m.group(1))
            if d:
                out["date"] = m.group(1).strip()
        m = SEATS_RE.match(s)
        if m and out["totalSeats"] is None:
            out["totalSeats"] = int(m.group(1).replace(",", ""))
            out["chamber"] = m.group(2).strip()
        m2 = SEATS_RE2.match(s)
        if m2 and out["totalSeats"] is None:
            out["totalSeats"] = int(m2.group(2).replace(",", ""))
            out["chamber"] = m2.group(3).strip()
        m3 = SEATS_RE3.match(s)
        if m3 and out["totalSeats"] is None:
            out["totalSeats"] = int(m3.group(1).replace(",", ""))
            out["chamber"] = m3.group(2).strip()
        m = MAJ_RE.match(s)
        if m and out["majoritySeats"] is None:
            out["majoritySeats"] = int(m.group(1).replace(",", ""))

    if out["date"] is None:
        for l in lines[:220]:
            s = clean(l)
            d = DATE_RE.search(s) or DATE_RE_US.search(s)
            if d and len(s) < 90 and "\t" not in s:
                out["date"] = d.group(0)
                break

    # Leader before / after: the label line, then a name, then a party.
    for i, l in enumerate(lines[:400]):
        s = clean(l)
        who = None
        if LEADER_BEFORE.match(s):
            who = "before"
        elif LEADER_AFTER.match(s):
            who = "after"
        if not who or out[who]:
            continue
        vals = [clean(x) for x in lines[i + 1:i + 5] if clean(x)]
        vals = [v for v in vals if not v.startswith(("Incumbent", "Elected", "Subsequent"))]
        if vals:
            name = vals[0]
            party = vals[1] if len(vals) > 1 and len(vals[1]) < 60 else None
            if party and (party.startswith("Politics of") or DATE_RE.search(party)):
                party = None
            out[who] = {"name": name, "party": party}
    return out


def title_bits(title):
    m = TITLE_RE.match(title or "")
    if not m:
        return None, None
    month, year, _ = m.group(1), m.group(2), m.group(3)
    return int(year), (month or "").strip() or None
