# -*- coding: utf-8 -*-
"""German presidential elections: the Federal Convention, ballot by ballot.

Two tables per article, and both matter:

  A. the CONVENTION -- "Party | Bundestag members | State electors | Total
     electors | Percentage". This is exactly the input a 2027 model needs, and
     it is on file for every convention here.
  B. the BALLOTS -- "Candidate | Party | Supporting party | First round Votes %
     [| Second round ... | Third round ...]".

Having both for sixteen conventions turns the 2027 forecast from arithmetic into
something measurable: how much of a nominating bloc's paper majority actually
turns up in the ballot box. The Federal Convention is a secret ballot of 1,200-odd
people who meet once, and it has a long history of not doing as it is told.
"""
import re, sys
sys.path.insert(0, '/tmp/hubs')
from parse_dump import articles, clean, num

CONV_HEAD = re.compile(r"^Party\tBundestag members\tState electors\tTotal electors")
CONV_HEAD2 = re.compile(r"^Party\tMembers\s*$")
BALLOT_HEAD = re.compile(r"^Candidate\tPart(?:y|ies)\t(?:Supporting party\t)?First")


def convention(lines):
    """Party -> total electors, plus the Bundestag/Land split where given."""
    for i, l in enumerate(lines):
        detailed = bool(CONV_HEAD.match(l))
        if not detailed and not CONV_HEAD2.match(l):
            continue
        rows, total = {}, None
        j = i + 1
        while j < len(lines):
            cells = [clean(c) for c in lines[j].split("\t")]
            name = cells[0]
            if not name or len(cells) < 2:
                break
            if name.lower() in ("total", "by state", "state"):
                if name.lower() == "total":
                    total = num(cells[1])
                break
            if detailed and len(cells) >= 4:
                rows[name] = {"bundestag": num(cells[1]), "land": num(cells[2]),
                              "total": num(cells[3])}
            else:
                rows[name] = {"bundestag": None, "land": None, "total": num(cells[1])}
            j += 1
        if rows:
            summed = sum(v["total"] or 0 for v in rows.values())
            if summed:
                total = summed
            return rows, total
    return None, None


BALLOT_ANY = re.compile(r"^Candidate\t")
SKIP_ROWS = ("abstention", "abstentions", "invalid", "invalid votes", "not present",
             "total", "valid votes", "source", "references", "blank")


def _is_pct(cell):
    return "%" in cell


def ballots(lines):
    """Candidate rows with a vote count per round, across five table shapes.

    The sixteen articles render this five different ways: party before the
    rounds, party after them, "First round" vs "Round one" vs a bare
    "Votes | %", and one or three rounds. Rather than teach the parser five
    headers, walk the cells: a round is an integer vote count immediately
    followed by a percentage. The party is the first non-numeric cell that is
    not the candidate's name, wherever it sits.
    """
    for i, l in enumerate(lines):
        if not BALLOT_ANY.match(l):
            continue
        rows = []
        j = i + 1
        while j < len(lines) and re.match(r"^\s*(Votes|%|Percentage)\b", lines[j]):
            j += 1
        while j < len(lines):
            cells = [clean(c) for c in lines[j].split("\t")]
            name = cells[0]
            low = name.lower()
            if not name:
                break
            if low.startswith(SKIP_ROWS):
                j += 1
                if low.startswith(("source", "references")):
                    break
                continue
            if len(cells) < 3:
                break
            rounds, party = [], None
            k = 1
            while k < len(cells):
                v, nxt = num(cells[k]), cells[k + 1] if k + 1 < len(cells) else ""
                pv = num(nxt)
                if (v is not None and v >= 1 and float(v).is_integer()
                        and pv is not None and 0 <= pv <= 100 and (_is_pct(nxt) or "." in nxt)):
                    rounds.append({"votes": int(v), "share": pv})
                    k += 2
                    continue
                if party is None and v is None and cells[k]:
                    party = cells[k]
                k += 1
            if rounds:
                rows.append({"name": name, "party": party, "rounds": rounds})
            j += 1
        if rows:
            return rows
    return None
