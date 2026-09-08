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

# The older Wikipedia title form puts the year last ("Iranian legislative
# election, 1943-1944"). One article in the Iran dump renders with a redirect
# banner where its heading should be, and the banner was taken as the title.
TITLE_RE_YEARLAST = re.compile(
    r"^(.{0,60}?)\s+(election|elections),\s+(1[6-9]\d{2}|20\d{2})(?:[\u2013-]\d{2,4})?\s*$",
    re.I)

MONTHS = ("January February March April May June July August September October "
          "November December").split()
DATE_RE = re.compile(
    r"\b(\d{1,2})\s+(%s)\s+(1[6-9]\d{2}|20\d{2})\b" % "|".join(MONTHS))
DATE_RE_US = re.compile(
    r"\b(%s)\s+(\d{1,2}),\s+(1[6-9]\d{2}|20\d{2})\b" % "|".join(MONTHS))

ARROWS = ("Increase", "Decrease", "Steady", "Growth", "IncreaseIncrease")

# Wave 2 (hu/no/se/co/cd). A large minority of these articles render with a
# navigation sidebar where the heading should be: "Politics of Sweden", "This
# article is part of a series on the". The title line is simply not in the
# rendered text, so 16 of Sweden's 51 articles, 5 of the DRC's 14 and 48 of
# Colombia's 86 came through the splitter titled "Politics of Sweden". Every one
# of them still opens with the standard lead sentence and closes with a
# Categories line, and between them those carry the year, the month and what
# kind of election it was, which is all a title was ever used for here.
LEAD_RE = re.compile(
    r"^(?:Early|Snap|Indirect|Extraordinary|Special)?\s*"
    r"(General|Parliamentary|Presidential|Legislative|Congressional|Senate|"
    r"Constituent Assembly|Constitutional Assembly|Federal|Municipal|Local)\s+"
    r"elections?\s+(?:were|was)\s+held\s+in\s+.+?"
    r"\s+(?:on|in|from|between)\s+(.{3,60}?)[.,;]", re.I)
CAT_LINE_RE = re.compile(r"^Categories:\s*(.+)$")
CAT_KIND_RE = re.compile(
    r"(General|Parliamentary|Presidential|Legislative|Congressional)\s+elections\s+in\s",
    re.I)
YEAR_RE = re.compile(r"\b(1[6-9]\d{2}|20\d{2})\b")
# Category names arrive concatenated with no separator ("Parliamentary elections
# in Colombia2002 elections in South America"), so a \b-anchored year regex finds
# nothing at all. Anchor on the phrase that follows the year instead.
CAT_YEAR_RE = re.compile(r"(?<!\d)(1[6-9]\d{2}|20\d{2})(?!\d)\s+(?:elections?|in)\b")
# Rank the kinds so a Colombian article filed under both "Presidential elections
# in Colombia" and "Elections in Colombia" is read as presidential.
KIND_RANK = {"presidential": 0, "congressional": 1, "parliamentary": 1,
             "legislative": 1, "general": 2}


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


def lead_sentence(lines):
    """The article's opening sentence, which the sidebar pages still carry."""
    for l in lines[:200]:
        s = clean(l)
        if len(s) < 25 or "\t" in s:
            continue
        if LEAD_RE.match(s):
            return s
    return None


def lead_date(lines):
    """The date as the lead sentence gives it, verbatim.

    Two of Sweden's elections ran across a month boundary ("in August and
    September 1887") and requiring a parseable day-month-year would throw those
    away, exactly as it once threw away Austria's multi-stage Reichsrat votes.
    """
    s = lead_sentence(lines)
    if not s:
        return None
    m = LEAD_RE.match(s)
    d = clean(m.group(2)) if m else None
    if not d or not YEAR_RE.search(d):
        return None
    return re.sub(r"\s+", " ", d).strip(" ,;")


def synth_title(lines):
    """Rebuild a title for an article whose heading the render dropped.

    Returns a string shaped like a real one ("1908 general election") so that
    TITLE_RE and title_bits keep working unchanged. The country is deliberately
    absent: each dump holds one country, and the hub builder's own want()
    already knows which.
    """
    year, kind = None, None
    # The Categories line sits near the end, but a navbox can push it hundreds
    # of lines up, which is why this scans the whole article from the bottom.
    for l in reversed(lines):
        m = CAT_LINE_RE.match(clean(l))
        if not m:
            continue
        cats = m.group(1)
        y = CAT_YEAR_RE.search(cats)
        if y:
            year = y.group(1)
        for k in CAT_KIND_RE.findall(cats):
            k = k.lower()
            if kind is None or KIND_RANK.get(k, 9) < KIND_RANK.get(kind, 9):
                kind = k
        break
    s = lead_sentence(lines)
    if s:
        m = LEAD_RE.match(s)
        if kind is None:
            kind = m.group(1).lower()
        # The lead sentence dates the election directly, so it outranks the
        # categories, which also carry decade buckets like "2000s elections".
        y = YEAR_RE.search(m.group(2))
        if y:
            year = y.group(1)
    if not year or not kind:
        return None
    return "%s %s election" % (year, kind)


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
            for j in range(start + 1, min(start + 25, len(lines))):
                m = TITLE_RE_YEARLAST.match(clean(lines[j]))
                if m:
                    title = "%s %s %s" % (m.group(3), m.group(1), m.group(2))
                    break
        if title is None:
            title = synth_title(lines[start:])
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
    # Colombia's National Front tables group factions under a party heading.
    "party and faction": "name", "party or faction": "name",
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


# Rows that end or interrupt a results table rather than belonging to it.
SKIP_ROWS = ("total", "valid votes", "invalid", "blank", "spoilt",
             "registered voters", "electorate", "source", "turnout",
             "abstention", "rejected", "against", "vacant")


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
        if len(cells) < 2:
            # A single cell on its own line is a wrapped ROW label, not a
            # wrapped header cell: gluing "Hungarian" / "Independence" /
            # "People's" onto the header cost Hungary 1949 its Seats column.
            break
        # A one-line result ("Independents | | 99") is a data row, not a wrapped
        # header. The comma-number test above misses it whenever the number is
        # under three digits, which is why Norway's 1838 Storting parsed and its
        # 1841 did not: 100 seats matched, 99 seats did not.
        if any(num(c) is not None for c in cells[1:]):
            break
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

    width = max(len(head), max(cols.values()) + 1)
    rows, totals = [], {}
    carry = []
    while j < len(lines):
        line = lines[j]
        if not line.strip():
            break
        if "\t" not in line:
            # A long bloc name wraps onto its own lines before the row it
            # heads: Colombia's 1968 Senate table renders "Colombian" /
            # "Liberal" / "Party | | Oficialistas | 988,540 | ...", and
            # stopping here threw the whole table away. Carry the fragments
            # onto the next row's first cell.
            frag = clean(line)
            if frag.lower().startswith(SKIP_ROWS):
                # The table's own terminator can arrive without a tab
                # ("Source: valgresultat.no"). Swallowing it ran Norway's 2025
                # result straight on into the voter-demographics table.
                break
            if frag and len(frag) < 40:
                # Only a fragment that reads as part of a proper name is carried.
                # A sub-heading inside the table ("By party", above Sweden's
                # 2022 results) is skipped instead, or the Social Democrats end
                # up called "By party Social Democrats".
                if all(w[:1].isupper() for w in frag.split() if w):
                    if len(carry) < 3:
                        carry.append(frag)
                        j += 1
                        continue
                elif len(frag.split()) <= 3:
                    j += 1
                    continue
            break
        cells = line.split("\t")
        # A second chamber's own header row repeats "Party | Votes | % |
        # Seats" right after the first chamber's Total/turnout rows with no
        # blank line between them: Czechoslovakia's bicameral articles print
        # Chamber of Deputies results directly followed by "Senate" and a
        # second identical header. Reading that header as a data row (with
        # any carried caption glued on) ran the Senate's rows straight onto
        # the Chamber's table, doubling every party in the 1920 result. A
        # repeated header always ends the table here; find_tables picks up
        # the next chamber's table on its own from this same header line.
        if norm_head(cells[0]) == "name" and {norm_head(c) for c in cells[1:]} & {"votes", "seats", "share"}:
            break
        if carry:
            cells = [" ".join(carry + [cells[0]])] + cells[1:]
            carry = []
        # A sub-row filed under a bloc heading arrives two cells wide with an
        # empty spacer: "Patriotic People's Front | | Hungarian Socialist
        # Workers' Party | 7,462,593 | ...", and Colombia's National Front
        # tables list every faction that way. Read the sub-party's own row.
        if len(cells) == width + 2 and not cells[1].strip() and clean(cells[2]):
            cells = cells[2:]
        # A row shorter than its header has lost LEADING columns, not trailing
        # ones: Norway's early Stortings print "Independents | | 85" under a
        # Party/Votes/%/Seats header, and Hungary 1980 prints "Independents |
        # 100 | -37" under a five-column one. Reading left to right put 85 in
        # the percentage column and 100 in the votes column. Only rows whose
        # last cell is a plain small integer are realigned, so a truncated row
        # ending in a vote count keeps the old reading.
        if 1 < len(cells) < width and cols.get("seats") is not None:
            tail = clean(cells[-1]).replace("−", "-").replace("–", "-")
            # A trailing "New" is as much a seat-change value as a number:
            # Vietnam's 2007 table prints "Independents | | 1 | New" for a
            # party with no prior seats, two blank cells collapsed into one,
            # and without this the seat count itself fell into the % column.
            if re.match(r"^[+-]?\d{1,4}$", tail) or tail.lower() in ("new", "steady"):
                cells = [cells[0]] + [""] * (width - len(cells)) + cells[1:]
        label = clean(cells[0])
        low = label.lower()
        if low.startswith(SKIP_ROWS):
            if low.startswith("total") or low.startswith("registered") or low.startswith("electorate"):
                # First wins: a table that runs on into a sub-block (Colombia's
                # two indigenous Senate seats) has a second Total row, and the
                # house size belongs to the first.
                totals.setdefault(low.split("/")[0].strip(),
                                  [clean(c) for c in cells[1:]])
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


def find_tables(lines, min_rows=2):
    """Every plausible results table. min_rows=1 finds the single-party ones.

    Norway's first two dozen Stortings and Zaire's one-party assemblies each
    have exactly one line of results ("Independents 111", "Popular Movement of
    the Revolution 210"), which is the real result and not a parse failure, so
    the caller drops to min_rows=1 rather than treating them as tableless.
    """
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
        if rows and len(rows) >= min_rows:
            out.append((i, rows, totals, {k for k in keys if k}))
    return out


# ------------------------------------------------------------ tiered tables --

def _is_data_row(cells):
    """Two or more numbers after the first cell means results, not a header."""
    return sum(num(c) is not None for c in cells[1:]) >= 2


def tiered_table(lines, i):
    """A results table whose header is stacked over two or three lines.

    Hungary's modern tables are all of this shape and no two are alike:
    "Party | Party-list | Constituency | Total" over "seats | +/-" over
    "Votes | % | Seats | Votes | % | Seats", or "Party | Proportional | SMCs
    (first round) | SMCs (second round) | Seats" over twelve sub-columns. What
    they share is the only thing worth reading positionally: the run of columns
    ENDS with the total seat count and, usually, the change on it. Guessing by
    the H1 cells instead put Fidesz on 2.7 million seats in 2010.

    Returns rows, or None when the header at line i is not stacked.
    """
    head = lines[i].split("\t")
    if norm_head(head[0]) != "name":
        return None
    cont, j = [], i + 1
    while j < len(lines) and j < i + 5:
        cells = lines[j].split("\t")
        if not lines[j].strip() or "\t" not in lines[j]:
            return None
        if _is_data_row(cells):
            break
        cont.append(cells)
        j += 1
    else:
        return None
    if not cont:
        return None

    flat = [clean(c) for c in head] + [clean(c) for row in cont for c in row]
    joined = " | ".join(flat).lower()
    has_change = any(k in joined for k in ("+/-", "+/–", "±"))
    has_votes = any(norm_head(c) == "votes" for c in flat)
    # An infobox reads like a stacked header ("Alliance | Fidesz-KDNP | EM" over
    # "Leader since ..." over "Seats won | 135 | 57 | 6") and is not one. A real
    # results header names its votes or seats column somewhere.
    if not has_votes and not any(norm_head(c) == "seats" for c in flat):
        return None

    width = len(lines[j].split("\t"))
    if width <= len(head):
        return None

    # A two-round presidential table stacks "First round | Second round" over
    # "Votes | % | Votes | %". Colombia has used one since 1994 and the DRC in
    # 2006, and read as a seat table it made Petro's 50.42% a seat count.
    # Only a candidate-headed table: Hungary's 1990 seat table is headed
    # "Party | Proportional | SMCs (first round) | SMCs (second round) | Seats"
    # and is not a two-round ballot at all.
    # Two groups of Votes/% under a candidate header: a runoff in Colombia and
    # the DRC, and in Chile before 1989 the congressional vote that chose
    # between the top two when nobody had a majority. Either way the second
    # pair is the round that decided it.
    two_group = (len(cont) == 1 and len(cont[0]) == 4
                 and [norm_head(clean(c)) for c in cont[0]]
                 == ["votes", "share", "votes", "share"])
    if (clean(head[0]).lower() in ("candidate", "nominee")
            and (two_group or ("first round" in joined and "second round" in joined))
            and width >= 5):
        leaf = width - 4
        party_c = None
        for k in range(1, min(leaf, len(head))):
            if norm_head(head[k]) == "name":
                party_c = k
        rows = []
        while j < len(lines):
            cells = lines[j].split("\t")
            label = clean(cells[0])
            if not lines[j].strip() or "\t" not in lines[j] or not label:
                break
            if label.lower().startswith(("total", "valid votes", "invalid",
                                         "blank", "registered voters",
                                         "electorate", "source", "turnout")):
                break
            if len(cells) < leaf + 2:
                j += 1
                continue
            rows.append({
                "name": label,
                "party": cells[party_c] if party_c is not None else None,
                "votes": cells[leaf], "share": cells[leaf + 1],
                "votes2": cells[leaf + 2] if len(cells) > leaf + 2 else None,
                "share2": cells[leaf + 3] if len(cells) > leaf + 3 else None,
            })
            j += 1
        return rows or None

    seats_c = width - 2 if has_change else width - 1
    change_c = width - 1 if has_change else None
    if seats_c < 1:
        return None

    rows = []
    while j < len(lines):
        line = lines[j]
        if not line.strip() or "\t" not in line:
            break
        cells = line.split("\t")
        label = clean(cells[0])
        low = label.lower()
        if low.startswith(("total", "valid votes", "invalid", "blank", "spoilt",
                           "registered voters", "electorate", "source", "turnout",
                           "abstention", "rejected", "against", "vacant")):
            break
        if not label or len(cells) != width:
            j += 1
            continue
        rows.append({
            "name": label,
            "seats": cells[seats_c],
            "seatChange": cells[change_c] if change_c is not None else None,
            "votes": cells[1] if has_votes else None,
            "share": cells[2] if has_votes else None,
        })
        j += 1
    return rows or None


PLEBISCITE_HEAD = re.compile(r"^(?:Choice|Option|Vote)\t", re.I)


def plebiscite_table(lines):
    """A yes/no ballot rendered as "Choice | Votes | %".

    Chile's 1988 plebiscite is filed by the source under presidential elections
    and decided who held the presidency, so it belongs in the hub; its ballot
    offered two options rather than two candidates. Deliberately NOT a header
    alias: a referendum table sitting beside a real results table in some other
    article must never outrank it, so this is only ever a last resort.
    """
    for i, l in enumerate(lines):
        if not PLEBISCITE_HEAD.match(l):
            continue
        head = [clean(c).lower() for c in l.split("\t")]
        try:
            vc, sc = head.index("votes"), head.index("%")
        except ValueError:
            continue
        rows = []
        for line in lines[i + 1:i + 8]:
            if "\t" not in line:
                break
            cells = line.split("\t")
            label = clean(cells[0])
            if not label or label.lower().startswith(SKIP_ROWS):
                break
            if max(vc, sc) >= len(cells):
                break
            rows.append({"name": label, "votes": cells[vc], "share": cells[sc]})
        if len(rows) >= 2:
            return rows
    return None


def find_tiered(lines, head_ok=None):
    """The first stacked-header table, optionally restricted by header word."""
    for i in range(len(lines)):
        if "\t" not in lines[i]:
            continue
        if head_ok is not None and not head_ok(i):
            continue
        rows = tiered_table(lines, i)
        if rows:
            return rows
    return None


# ------------------------------------------------------------- infobox -------

SEATS_RE = re.compile(r"All\s+([\d,]+)\s+seats?\s+in\s+(.+?)(?:\s*\[|$)", re.I)
# "166 of the 174 seats" and "434 out of 500 seats" are the same fact in two
# phrasings a partly-elected house uses (East Germany's Volkskammer prints
# the latter for every election that co-opted some seats rather than
# electing all of them); without "out of" the total silently fell back to
# summing the parties on the page, which is wrong whenever, as in 1967 and
# 1971, only one summary row made it into the table.
# "166 of the 174 seats" and "434 out of 500 seats" are the same fact in two
# phrasings a partly-elected house uses (East Germany's Volkskammer prints
# the latter for every election that co-opted some seats rather than
# electing all of them); without "out of" the total silently fell back to
# summing the parties on the page, which is wrong whenever, as in 1967 and
# 1971, only one summary row made it into the table.
SEATS_RE2 = re.compile(r"([\d,]+)\s+(?:of the|out of)\s+([\d,]+)\s+seats?\s+in\s+(.+?)(?:\s*\[|$)", re.I)
# "166 seats in Dail Eireann" - no "All", which is how four Irish elections came
# out with a seat total summed from the listed parties instead of the real house.
SEATS_RE3 = re.compile(r"^([\d,]{2,4})\s+seats?\s+in\s+(.+?)(?:\s*\[|$)", re.I)
MAJ_RE = re.compile(r"([\d,]+)\s+seats?\s+needed\s+for\s+a\s+majority", re.I)
TURNOUT_RE = re.compile(r"^Turnout\t([\d.]+)\s*%", re.M)
NAV_RE = re.compile(r"^←\s*[^\t]*\t([^\t]+)\t.*→\s*$")

LEADER_BEFORE = re.compile(
    r"^(Chancellor|Taoiseach|Prime Minister|President|Premier|Head of Government"
    r"|Chairman of the Council of Ministers)"
    r"\s+before\s+(?:the\s+)?election", re.I)
LEADER_AFTER = re.compile(
    # Two mutually exclusive infobox shapes, not one with an optional part:
    # most prefix the role ("Elected Chancellor", "Subsequent Taoiseach", no
    # "after election" anywhere on the line) while a few, Bangladesh's and
    # East Germany's included, repeat the bare role name with an "after
    # election" suffix instead ("Prime Minister after election", "Chairman
    # of the Council of Ministers after election"). A version that made the
    # prefix optional but the suffix mandatory (or the reverse) matches only
    # one shape and silently drops the other: Bangladesh's 1979 "Subsequent
    # Prime Minister" (no suffix) and 2026's "Prime Minister after election"
    # (no prefix) cannot both be matched by a single mandatory part, so the
    # two shapes are kept as a true alternation instead.
    r"^(?:Elected|Subsequent|New|Incoming)\s+"
    r"(?:Chancellor|Taoiseach|Prime Minister|President|Premier|Head of Government"
    r"|Chairman of the Council of Ministers)"
    r"|^(?:Chancellor|Taoiseach|Prime Minister|President|Premier|Head of Government"
    r"|Chairman of the Council of Ministers)"
    r"\s+after\s+(?:the\s+)?election"
    # A third shape, Thailand's: a bare "Prime Minister-designate" label line
    # on its own (no "before"/"after election" wording at all), used because
    # Thai PMs are elected by parliament some weeks after polling day, so the
    # infobox names a designate rather than a sitting successor. Anchored to
    # line-start-to-end so it cannot match Romania's unrelated tab-joined
    # "Prime Minister before\tPrime Minister-designate" header pair, which
    # begins with "before" and is not this label alone.
    r"|^(?:Chancellor|Taoiseach|Prime Minister|President|Premier|Head of Government"
    r"|Chairman of the Council of Ministers)-designate$", re.I)


def infobox(lines):
    out = {"date": None, "dateLoose": None, "totalSeats": None,
           "majoritySeats": None, "turnout": None, "before": None,
           "after": None, "chamber": None}
    text = "\n".join(lines[:220])

    m = TURNOUT_RE.search(text)
    if m:
        out["turnout"] = float(m.group(1))

    for idx, l in enumerate(lines[:220]):
        s = clean(l)
        m = NAV_RE.match(s)
        if not m and s.startswith("←") and "→" not in s and idx + 1 < len(lines):
            # The "← prev | date | next →" infobox line sometimes wraps in the
            # rendered dump, splitting the trailing "(note) →" onto its own
            # line (e.g. "← 1986\t18 March 1990\t1990" then "(reunification)
            # →"). Unjoined, the FIRST infobox's date silently fails to match
            # and the scan falls through to a second infobox later in the
            # same article (East Germany's 1990 co-optation-into-Bundestag
            # box), reporting that box's date instead. Rejoin the wrapped
            # line before matching, only when the plain line didn't already
            # match and looks like it was cut off mid-arrow.
            m = NAV_RE.match(s + " " + clean(lines[idx + 1]))
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

    # A loose scan for any date on the page is a last resort, not a first one:
    # on the articles that render without an infobox it finds Wikipedia's own
    # "last edited" stamp and dates the 1866 Swedish election to 2024. The
    # caller tries the lead sentence before falling back to this.
    for l in lines[:220]:
        s = clean(l)
        low = s.lower()
        if any(w in low for w in ("last edited", "retrieved", "archived",
                                  "accessed")):
            continue
        d = DATE_RE.search(s) or DATE_RE_US.search(s)
        if d and len(s) < 90 and "\t" not in s:
            out["dateLoose"] = d.group(0)
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
        window = []
        for x in lines[i + 1:i + 8]:
            cs = clean(x)
            # Stop at the next before/after label rather than reading past it:
            # when an article states no party for this leader, the very next
            # non-blank line is the OTHER leader's name (Vietnam's 2011, 2016
            # and 2021 infoboxes omit "Communist Party" under one of the two
            # names), and without this boundary that name was read as this
            # leader's party.
            if LEADER_BEFORE.match(cs) or LEADER_AFTER.match(cs):
                break
            if cs:
                window.append(cs)
        vals = [v for v in window if not v.startswith(("Incumbent", "Elected", "Subsequent"))]
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
