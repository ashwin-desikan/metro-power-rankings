#!/usr/bin/env python3
"""2026 FIBA Women's Basketball World Cup tracker (Germany, September 2026).

WHAT IT DOES. Fetches the Wikipedia article "2026 FIBA Women's Basketball
World Cup" through the MediaWiki API (action=parse&prop=wikitext), reads the
Final and the third-place game out of the wikitext, and when the final has a
score rewrites the 2026 block of scripts/basketball/wbasketball_worldcup.txt
from "Future event" into a real results row, then re-runs
build_intl_wbasketball.py so hub.json, nations.json and every nation-detail
file pick the edition up.

THREE OUTCOMES, AND THEY ARE DELIBERATELY DIFFERENT.
  exit 0, "not played yet"  - no Final section, or a Final section whose box
      carries no score. This is the normal state for most of September.
  exit 2, loud              - the Final section EXISTS but does not parse.
      That is the dangerous case: the article has been restructured and a
      quiet "no result" would look identical to "not played yet" for the rest
      of the tournament. It fails instead.
  exit 0, wrote/would write - a parsed final.

WHAT IS NOT PROVEN HERE. This container has no network (Wikipedia is 403
through the proxy), so the fetch path has never run against the live API. The
parser is written against a FIXTURE built from the 2022 article's structure
and is exercised by --self-test; the HTTP call itself is untested live.

--dry-run is the default. --write is the only way it touches a file.

Run: python3 scripts/basketball/track_wwc.py --self-test
     python3 scripts/basketball/track_wwc.py            # dry run
     python3 scripts/basketball/track_wwc.py --write
Stdlib only.
"""
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import build_intl_wbasketball as builder  # noqa: E402

YEAR = 2026
PAGE = "2026 FIBA Women's Basketball World Cup"
API = "https://en.wikipedia.org/w/api.php"
# Wikipedia's policy asks for a descriptive User-Agent with a contact.
UA = ("mpr-wwc-tracker/1.0 (rankings.citizenofnowhere.org; "
      "https://github.com/ashwin-desikan/metro-power-rankings)")
WC_TXT = builder.WC


class ParseError(Exception):
    """The section is there and we could not read it. Never swallowed."""


# --------------------------------------------------------------------------
# Wikitext
# --------------------------------------------------------------------------
_HEADING = re.compile(r"^={2,4}\s*(.+?)\s*={2,4}\s*$", re.M)
FINAL_HEADINGS = ("final",)
THIRD_HEADINGS = ("third place game", "third place playoff", "third-place game",
                  "bronze medal game", "3rd place game")


def sections(wikitext):
    """[(heading_lower, body)] for every == heading == in the article."""
    out, marks = [], list(_HEADING.finditer(wikitext))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(wikitext)
        out.append((m.group(1).strip().lower(), wikitext[m.end():end]))
    return out


def find_section(wikitext, names):
    for head, body in sections(wikitext):
        if head in names:
            return body
    return None


_WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
_TPL_ARG = re.compile(r"\{\{[^{}|]*\|([^{}|]+)\}\}")


def clean_team(raw):
    """A team cell down to a plain nation name.

    A cell is usually `{{bkb|USA}} [[United States women's national basketball
    team|United States]]`, so the WIKILINK LABEL is what we want, not the flag
    template's IOC code and not the link target. A bare IOC code is refused
    rather than credited: "CHN" would join to no nation and would do it
    silently.
    """
    s = raw.strip()
    m = _WIKILINK.search(s)
    if m:
        s = m.group(2) or m.group(1)
    else:
        plain = re.sub(r"\{\{[^{}]*\}\}", " ", s).strip()
        if plain:
            s = plain
        else:
            t = _TPL_ARG.search(s)
            if t:
                s = t.group(1)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s).strip(" |")
    s = re.sub(r"\s+women'?s national basketball team$", "", s, flags=re.I)
    if re.fullmatch(r"[A-Z]{3}", s):
        raise ParseError("team cell resolved to the bare IOC code %r; the "
                         "article no longer spells the nation out" % s)
    return s.strip()


def template_fields(body):
    """{field: value} for the first {{basketballbox}} in `body`, else None."""
    m = re.search(r"\{\{\s*[Bb]asketball ?box", body)
    if not m:
        return None
    i, depth = m.start(), 0
    for j in range(m.start(), len(body)):
        if body.startswith("{{", j):
            depth += 1
        elif body.startswith("}}", j):
            depth -= 1
            if depth == 0:
                i = j
                break
    else:
        raise ParseError("unterminated {{basketballbox}}")
    inner = body[m.end():i]
    fields, depth, cur = {}, 0, ""
    parts = []
    for ch in inner:
        if ch == "{" or ch == "[":
            depth += 1
        elif ch == "}" or ch == "]":
            depth -= 1
        if ch == "|" and depth <= 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    for p in parts:
        if "=" in p:
            k, v = p.split("=", 1)
            fields[k.strip().lower()] = v.strip()
    return fields


_SCORE = re.compile(r"(\d{2,3})\s*[-–—]\s*(\d{2,3})")


def parse_game(body, what):
    """(winner, loser, 'W-L') from a game section body.

    Accepts the two shapes these articles actually use: a
    {{basketballbox}} with team1/score1/score2/team2 (or a combined
    `score=83-61`), and a plain "Final" wikitable row
    `| '''United States''' || 83-61 || China`.
    Returns None when the section exists but carries no score yet (a fixture
    with `score1=` empty, or a TBD row). Raises ParseError when the section
    exists, has content, and still does not yield a game.
    """
    f = template_fields(body)
    if f is not None:
        s1, s2 = f.get("score1", "").strip(), f.get("score2", "").strip()
        if not s1 and not s2:
            combined = _SCORE.search(f.get("score", ""))
            if combined:
                s1, s2 = combined.group(1), combined.group(2)
        s1 = re.sub(r"[^\d]", "", s1)
        s2 = re.sub(r"[^\d]", "", s2)
        if not s1 or not s2:
            return None                      # scheduled, not played
        # Teams are only read once there IS a score, so a TBD placeholder in a
        # not-yet-played box is not mistaken for an unreadable article.
        t1, t2 = clean_team(f.get("team1", "")), clean_team(f.get("team2", ""))
        if not t1 or not t2:
            raise ParseError("%s box has a score (%s-%s) but no teams" % (what, s1, s2))
        a, b = int(s1), int(s2)
        if a == b:
            raise ParseError("%s box scores are equal (%s-%s)" % (what, s1, s2))
        return (t1, t2, "%d-%d" % (a, b)) if a > b else (t2, t1, "%d-%d" % (b, a))

    # Wikitable / plain row fallback.
    for line in body.splitlines():
        if "TBD" in line.upper():
            continue
        m = _SCORE.search(line)
        if not m:
            continue
        left, right = line[:m.start()], line[m.end():]
        t1 = clean_team(left.split("||")[-1] if "||" in left else left)
        t2 = clean_team(right.split("||")[0] if "||" in right else right)
        if not t1 or not t2:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        if a == b:
            raise ParseError("%s row scores are equal" % what)
        return (t1, t2, "%d-%d" % (a, b)) if a > b else (t2, t1, "%d-%d" % (b, a))

    if body.strip():
        raise ParseError("%s section exists but no game could be read from it" % what)
    return None


def parse_edition(wikitext, host, teams):
    """The 2026 results row, or None when the final has not been played.

    Raises ParseError when a Final section exists and cannot be read: a
    restructured article must fail loudly, not read as "not played yet".
    """
    final_body = find_section(wikitext, FINAL_HEADINGS)
    if final_body is None:
        return None
    final = parse_game(final_body, "Final")
    if final is None:
        return None
    third_body = find_section(wikitext, THIRD_HEADINGS)
    if third_body is None:
        raise ParseError("Final parsed but there is no third-place section")
    third = parse_game(third_body, "Third place game")
    if third is None:
        raise ParseError("Final parsed but the third-place game has no score")
    return {"year": YEAR, "host": host,
            "champion": final[0], "score": final[2], "runner_up": final[1],
            "third": third[0], "third_score": third[2], "fourth": third[1],
            "teams": teams}


# --------------------------------------------------------------------------
# The committed dump
# --------------------------------------------------------------------------
def render_block(e):
    """The 2026 block in the dump's own tab-delimited shape."""
    return "\n".join([
        str(e["year"]),
        "Details\t %s\t" % e["host"],
        "%s\t%s\t" % (e["champion"], e["score"]),
        "%s\t" % e["runner_up"],
        "%s\t%s\t" % (e["third"], e["third_score"]),
        "%s\t%s" % (e["fourth"], e["teams"] if e["teams"] is not None else ""),
        "(squads)",
    ])


def replace_block(text, e):
    """Swap the `2026 ... ` block in the dump for a rendered results block."""
    lines = text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        if ln.strip() == str(e["year"]):
            start = i
            break
    if start is None:
        raise ParseError("no %d block in %s to replace" % (e["year"], WC_TXT))
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].strip() == "(squads)":
            end = j + 1
            break
        if re.fullmatch(r"(19|20)\d\d", lines[j].strip()):
            end = j
            break
    return "\n".join(lines[:start] + render_block(e).splitlines() + lines[end:]) + "\n"


def already_present(path=None):
    """True when the dump already holds a played 2026 edition."""
    played, _sched = builder.parse_wc(path or WC_TXT)
    return any(e["year"] == YEAR for e in played)


def scheduled_meta(path=None):
    """(host, teams) for 2026 as the committed dump has it."""
    _played, sched = builder.parse_wc(path or WC_TXT)
    for s in sched:
        if s["year"] == YEAR:
            return s["host"] or "Germany", 16
    return "Germany", 16


# --------------------------------------------------------------------------
# Fetch
# --------------------------------------------------------------------------
def fetch_wikitext(page=PAGE):
    q = urllib.parse.urlencode({"action": "parse", "page": page,
                                "prop": "wikitext", "format": "json",
                                "formatversion": "2"})
    req = urllib.request.Request(API + "?" + q, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        doc = json.load(r)
    if "error" in doc:
        raise SystemExit("MediaWiki error: %s" % doc["error"].get("info"))
    parse = doc.get("parse") or {}
    wt = parse.get("wikitext")
    if isinstance(wt, dict):
        wt = wt.get("*")
    if not wt:
        raise SystemExit("no wikitext in the API response for %r" % page)
    return wt


# --------------------------------------------------------------------------
# Fixtures (the 2022 article's structure, with 2026 teams)
# --------------------------------------------------------------------------
FIXTURE_NOT_PLAYED = """
==Knockout stage==
===Semi-finals===
{{Basketballbox
|date=25 September 2026
|team1={{bkb|GER}} Germany
|score1=
|score2=
|team2={{bkb|AUS}} Australia
}}
===Third place game===
{{Basketballbox
|date=27 September 2026
|team1=TBD
|score1=
|score2=
|team2=TBD
}}
===Final===
{{Basketballbox
|date=27 September 2026
|team1=TBD
|score1=
|score2=
|team2=TBD
}}
"""

FIXTURE_PLAYED = """
==Knockout stage==
===Third place game===
{{Basketballbox
|date=27 September 2026
|team1=[[Australia women's national basketball team|Australia]]
|score1=95
|score2=65
|team2={{bkb|CAN}} [[Canada women's national basketball team|Canada]]
}}
===Final===
{{Basketballbox
|date=27 September 2026
|team1={{bkb|USA}} [[United States women's national basketball team|United States]]
|score1=83
|score2=61
|team2={{bkb|CHN}} [[China women's national basketball team|China]]
|report=[https://example.invalid Report]
}}
==Statistics==
"""

# The dangerous shape: the Final section is there, has content, and the box
# has been replaced by prose. Must exit 2, never read as "not played yet".
FIXTURE_MALFORMED = """
==Knockout stage==
===Third place game===
{{Basketballbox
|team1=Australia
|score1=95
|score2=65
|team2=Canada
}}
===Final===
The final was contested in Berlin. See the match report for details.
"""


# --------------------------------------------------------------------------
# Self-test
# --------------------------------------------------------------------------
def self_test():
    import shutil
    import tempfile
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append("%s: got %r, want %r" % (label, got, want))

    host, teams = scheduled_meta()
    check("scheduled host", host, "Germany")

    # 1. Fixture with no result.
    check("not played", parse_edition(FIXTURE_NOT_PLAYED, host, teams), None)

    # 2. Fixture with a result.
    e = parse_edition(FIXTURE_PLAYED, host, teams)
    check("parsed edition", e, {
        "year": 2026, "host": "Germany", "champion": "United States",
        "score": "83-61", "runner_up": "China", "third": "Australia",
        "third_score": "95-65", "fourth": "Canada", "teams": 16})

    # 3. Fixture with a malformed final: loud, not silent.
    try:
        parse_edition(FIXTURE_MALFORMED, host, teams)
        fails.append("malformed final did not raise ParseError")
    except ParseError:
        pass

    # 4. Round trip through the dump, then idempotence.
    tmp = tempfile.mkdtemp()
    try:
        path = os.path.join(tmp, "wc.txt")
        shutil.copyfile(WC_TXT, path)
        check("2026 absent before", already_present(path), False)
        text = io.open(path, encoding="utf-8").read()
        io.open(path, "w", encoding="utf-8", newline="\n").write(replace_block(text, e))
        check("2026 present after", already_present(path), True)
        played, _ = builder.parse_wc(path)
        row = next(r for r in played if r["year"] == 2026)
        check("written row", {k: row[k] for k in
                              ("host", "champion", "score", "runner_up",
                               "third", "fourth", "teams")},
              {"host": "Germany", "champion": "United States", "score": "83-61",
               "runner_up": "China", "third": "Australia", "fourth": "Canada",
               "teams": 16})
        check("editions after append", len(played), 20)
        # Idempotence: a second application changes nothing.
        before = io.open(path, encoding="utf-8").read()
        io.open(path, "w", encoding="utf-8", newline="\n").write(replace_block(before, e))
        check("idempotent", io.open(path, encoding="utf-8").read(), before)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("self-test OK: not-played, played, malformed (loud) and idempotence")
    return 0


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    argv = sys.argv[1:]
    if "--self-test" in argv:
        raise SystemExit(self_test())
    write = "--write" in argv

    if already_present():
        print("%d already in %s; nothing to do." % (YEAR, os.path.basename(WC_TXT)))
        return

    host, teams = scheduled_meta()
    try:
        wikitext = fetch_wikitext()
    except Exception as err:                 # network/API, not a parse problem
        # Exit 1, distinct from the exit 2 a restructured article gets, so the
        # workflow log says which of the two actually happened.
        raise SystemExit("FETCH FAILED (%s): %s" % (type(err).__name__, err))
    try:
        e = parse_edition(wikitext, host, teams)
    except ParseError as err:
        print("PARSE FAILURE: %s" % err)
        print("The article has a Final section this parser cannot read. Fix the "
              "parser against the current wikitext; do NOT let this read as "
              "'not played yet'.")
        raise SystemExit(2)

    if e is None:
        print("not played yet: the %d final has no score." % YEAR)
        return

    print("%d: %s %s %s (3rd %s %s %s), host %s, %s teams"
          % (e["year"], e["champion"], e["score"], e["runner_up"],
             e["third"], e["third_score"], e["fourth"], e["host"], e["teams"]))
    if not write:
        print("dry run: pass --write to update %s and rebuild." % os.path.basename(WC_TXT))
        return

    text = io.open(WC_TXT, encoding="utf-8").read()
    io.open(WC_TXT, "w", encoding="utf-8", newline="\n").write(replace_block(text, e))
    print("wrote %s" % WC_TXT)
    hub, rows, fiba_hub, details = builder.build()
    builder.write(hub, rows, fiba_hub, details)
    print("rebuilt public/data/wbasketball: %d nations, %d World Cup editions"
          % (len(rows), len(hub["wc_finals"])))


if __name__ == "__main__":
    main()
