#!/usr/bin/env python3
"""
check-leaders-sanity.py - pre-commit gate for public/data/leaders/_current.json.

Primary signature it catches: an incumbent's NAME changes while the office did
NOT turn over (same `since` date) - i.e. Wikipedia/Wikidata name vandalism
(correct date, poisoned name, as with India's head of state -> "Ganesh rajput"
on 2022-07-25). Also pins manually-corrected entries so a re-scrape can't
silently overwrite them.

Run before committing _current.json. Nonzero exit = HOLD for human review.
  python scripts/check-leaders-sanity.py

PINS REPAIR, they do not merely compare. Wikidata's label for a pinned leader
oscillates between long and short forms of the SAME person (Nigeria:
"Bola Ahmed Tinubu" <-> "Bola Tinubu", same office, same `since`, observed
2026-08-15, -17, -23, -30). A pure comparison turned every oscillation into a
HOLD, which red-lined the whole egress-refresh job and needed a hand fix each
time -- four-plus times, for a name that was never actually wrong. When the
scraped name is a strict long/short VARIANT of the pinned name (same first and
last word, shorter is an ordered subsequence of the longer) AND role, `since`
and `second` are all untouched, the pinned form is written back and the run
continues. Anything else -- a different person, or a variant arriving
alongside a role/date/second change -- still HOLDs, because that is the case a
pin is actually protecting against.

Two deviations from the originally-specified gate, both grounded in the data:
  * PINS compare the BARE name (warn/crown glyphs stripped). The source glyphs
    warn-listed leaders, so Saudi is committed as "⚠️ Mohammed bin Salman"; a raw
    string compare would hard-fail the pin forever.
  * The vandalism and lowercase checks also scan the ceremonial `second` name,
    because that is precisely where the India vandalism sat (a primary-only check
    would have missed "Ganesh rajput" once India leads with the PM).
"""
import json, os, re, subprocess, sys, unicodedata
from datetime import date

PATH = "public/data/leaders/_current.json"
LEADERS_DIR = "public/data/leaders"
CHANGES_PATH = "public/data/leaders/_changes.json"

# Manually verified heads of government the scrape must NOT overwrite (Wikidata is
# vandalized, stale, or returns the wrong office for these). Compared on the BARE
# name, so a warn/crown glyph on the committed value is fine. Update deliberately,
# by hand, as part of a real leadership change -- a drift here HOLDs the commit.
# Manually verified heads of government the scrape must NOT overwrite (Wikidata is
# vandalized, stale, or returns the wrong office for these).
#
# A pin carries the WHOLE entry, not just the name, and the pinned entry WINS: any
# difference is restored and the run continues. Name-only pins could not express
# the failure they were guarding against -- Wikidata returns India's ceremonial
# President in place of the PM, rewriting name, role and `since` and dropping the
# ceremonial `second`, so restoring the name alone would have left Modi holding
# Murmu's office and start date. Comparing without repairing just red-lined the
# whole egress-refresh job instead (four-plus times through 2026-08).
#
# The trade this makes: a REAL leadership change in a pinned country is reverted
# too, until someone edits the pin. That is the documented process, and it is kept
# honest two ways -- every restore prints a REPAIR line naming what the scrape
# proposed, and a pin whose `pinned_on` date has gone stale raises a SOFT flag.
# `pinned_on` is the date the pin's value was last set or re-confirmed here
# (git: 9a26eec17, 436146fb0, 3143c5d09, 4b4f4ae22), not an external re-check.
#
# Names are stored BARE; the source's warn/crown glyph on the live value is
# carried over by the restore, so Saudi stays "\u26a0\ufe0f Mohammed bin Salman".
PINS = {
    # WD head-of-state label was vandalized ("Ganesh rajput"); WD also leads with
    # the ceremonial President, hence the full entry rather than a name.
    "india": {
        "pinned_on": "2026-07-26",
        "name": "Narendra Modi", "role": "PM", "since": "2014-05-26",
        "second": {"name": "Droupadi Murmu", "role": "Pres."},
    },
    # WD returns King Salman for both P35/P6
    "saudi-arabia": {
        "pinned_on": "2026-07-26",
        "name": "Mohammed bin Salman", "role": "PM", "since": "2022-09-27",
    },
    # PM_LED fix; WD would otherwise lead with the ceremonial President
    "israel": {
        "pinned_on": "2026-07-26",
        "name": "Benjamin Netanyahu", "role": "PM", "since": "2022-12-29",
        "second": {"name": "Isaac Herzog", "role": "Pres."},
    },
    # no more CURATED_OVERRIDES backstop (2026-08-07, WD resolved its own label +
    # start date) -- the pin is the regression guard now that WD is load-bearing
    "hungary": {
        "pinned_on": "2026-08-07",
        "name": "P\u00e9ter Magyar", "role": "PM", "since": "2026-05-09",
        "second": {"name": "\u00c1gnes Forsthoffer", "role": "Pres."},
    },
    # WD P6 stale (still Petkov, 2021)
    "bulgaria": {
        "pinned_on": "2026-07-26",
        "name": "Rumen Radev", "role": "PM", "since": "2026-05-08",
    },
    # WD label oscillates long/short form of the same person, confirmed same
    # `since` both directions (2026-08-15, -17, -23, -30)
    "nigeria": {
        "pinned_on": "2026-08-23",
        "name": "Bola Ahmed Tinubu", "role": "Pres.", "since": "2023-05-29",
    },
    # --- Wikidata stale, committed value verified correct (all four 2026-08-31)
    # These four regressed repeatedly to a PREDECESSOR (see
    # is_predecessor_restore) and had already been hand-corrected twice
    # (c43399283, 3976ba3c8). The predecessor check reverts them correctly, but
    # as an anomaly needing review every single run. They are not anomalies --
    # they are a known-stale source, which is what a pin is for. Each was
    # news-verified in office on 2026-08-31, and each agrees with its own
    # per-country timeline file.
    "estonia": {                                 # WD P6 stale: Kaja Kallas, who
        "pinned_on": "2026-08-31",               # left for the EU role in 2024
        "name": "Kristen Michal", "role": "PM", "since": "2024-07-23",
        "second": {"name": "Alar Karis", "role": "Pres."},
    },
    "madagascar": {                              # WD P35 stale: Andry Rajoelina,
        "pinned_on": "2026-08-31",               # ousted in the 2025 coup
        "name": "Michael Randrianirina", "role": "Pres.", "since": "2025-10-17",
    },
    "malawi": {                                  # WD P35 stale: Lazarus Chakwera,
        "pinned_on": "2026-08-31",               # lost the Sept 2025 election
        "name": "Peter Mutharika", "role": "Pres.", "since": "2025-10-04",
    },
    "mauritius": {                               # WD P6 stale: Pravind Jugnauth,
        "pinned_on": "2026-08-31",               # resigned after the 2024 landslide
        "name": "Navin Ramgoolam", "role": "PM", "since": "2024-11-12",
        "second": {"name": "Dharam Gokhool", "role": "Pres."},
    },
}
PIN_MAX_AGE_DAYS = 365  # past this, a pin raises a SOFT flag asking for a re-check
PARTICLES = {"bin","bint","ibn","al","van","von","de","da","del","dos","di","der",
             "ter","of","the","e","du","la","le","y","das"}
_GLYPHS = "⚠️\U0001f451"  # warn (⚠️) + crown (👑)

def bare(n):
    """Strip leading warn/crown glyphs and whitespace, matching the source's bare()."""
    return re.sub(r'^[⚠️\U0001f451\s]+', '', (n or "")).strip()

def git_show_raw(path, ref="HEAD"):
    """The committed copy of a file as TEXT, or None when git cannot supply it."""
    try:
        return subprocess.check_output(["git", "show", f"{ref}:{path}"],
                                       text=True, stderr=subprocess.DEVNULL)
    except Exception:
        return None


def git_show(path, ref="HEAD"):
    """The committed copy of a file, parsed, or None."""
    raw = git_show_raw(path, ref)
    try:
        return json.loads(raw) if raw is not None else None
    except Exception:
        return None


def json_indent(raw):
    """The indent width a JSON file is already stored with, so rewriting it does
    not reformat every line. The leaders timelines are stored at 1 space and
    _changes.json at 2; re-dumping at a fixed width would churn whole files."""
    for line in (raw or "").splitlines()[1:]:
        stripped = line.lstrip(" ")
        if stripped and stripped != line:
            return len(line) - len(stripped)
    return 2


def repair_country_timeline(slug, pinned):
    """Restore public/data/leaders/<slug>.json when the scrape drops a pinned
    leader out of the sitting rows.

    PINS used to guard _current.json alone, and that was not enough. The
    per-country timelines are written by refresh-current-leaders.py's
    _update_history() -- a different file, written BEFORE this gate ever runs.
    On 2026-08-31 a forced egress-refresh passed this gate with five clean pin
    repairs and still published Kaja Kallas, Andry Rajoelina, Lazarus Chakwera
    and Pravind Jugnauth as sitting leaders on their country pages, plus three
    Tinubu rows for Nigeria, two of them zero-length (start == end) from the
    long/short label oscillation being read as a handover.

    Detects a REGRESSION against the committed file rather than asserting the
    pinned name must always be sitting. A timeline legitimately need not carry
    the pinned person at all: saudi-arabia.json tracks monarchs, so King Salman
    is its sitting row while the pin names Mohammed bin Salman, the head of
    government. Only "was sitting in the committed file, is not sitting now"
    counts.

    Restores the committed file wholesale rather than unpicking the inserted
    row: the committed copy is the human-verified state, and a pin already
    means the scrape is not trusted for this country."""
    path = f"{LEADERS_DIR}/{slug}.json"
    if not os.path.exists(path):
        return None
    try:
        rows = json.loads(open(path, encoding="utf-8").read())
    except Exception:
        return None
    raw_committed = git_show_raw(path)
    committed = git_show(path)
    if not isinstance(rows, list) or not isinstance(committed, list):
        return None  # no baseline to compare against; _current.json still guarded

    def sitting(rs):
        return {bare(r.get("name") or "") for r in rs
                if isinstance(r, dict) and r.get("current")}

    was, now = sitting(committed), sitting(rows)
    if pinned["name"] not in was or pinned["name"] in now:
        return None
    with open(path, "w", encoding="utf-8") as f:
        f.write(raw_committed)          # byte-exact; never reformat the file
    got = sorted(now - was) or ["nobody"]
    return (f'{slug}.json: timeline dropped "{pinned["name"]}" from the sitting '
            f'rows in favour of {got} - committed timeline restored')


def repair_changes_log(pinned_slugs):
    """Drop entries this run added to _changes.json that record a handover TO
    somebody a pin rejects. Those are fabrications -- the 2026-08-31 run logged
    four, all of them running BACKWARDS in time (Mutharika -> Chakwera dated
    2020-06-28), which /leaders/changes would have rendered as real events.
    Only entries absent from the committed file are considered, so genuine
    history is never rewritten."""
    try:
        raw = open(CHANGES_PATH, encoding="utf-8").read()
        doc = json.loads(raw)
    except Exception:
        return []
    rows = doc.get("changes") if isinstance(doc, dict) else doc
    if not isinstance(rows, list):
        return []
    committed = git_show(CHANGES_PATH)
    if committed is None:
        return []
    old_rows = committed.get("changes") if isinstance(committed, dict) else committed
    seen = {json.dumps(r, sort_keys=True) for r in (old_rows or [])}
    kept, dropped = [], []
    for r in rows:
        fresh = json.dumps(r, sort_keys=True) not in seen
        slug = r.get("slug")
        if fresh and slug in pinned_slugs and bare(r.get("to") or "") != PINS[slug]["name"]:
            dropped.append(r)
        else:
            kept.append(r)
    if not dropped:
        return []
    if isinstance(doc, dict):
        doc["changes"] = kept
    else:
        doc = kept
    with open(CHANGES_PATH, "w", encoding="utf-8") as f:
        f.write(json.dumps(doc, indent=json_indent(raw), ensure_ascii=False)
                + ("\n" if raw.endswith("\n") else ""))
    return [f'_changes.json: dropped fabricated "{r.get("from")} -> {r.get("to")}" '
            f'({r.get("slug")}, dated {r.get("date")})' for r in dropped]


def load_working():
    with open(PATH, encoding="utf-8") as f:
        return json.load(f)

def load_prev(ref="HEAD"):
    try:
        raw = subprocess.check_output(["git","show",f"{ref}:{PATH}"],
                                      text=True, stderr=subprocess.DEVNULL)
        return json.loads(raw)
    except Exception:
        return None  # no baseline (first commit): skip diff checks

def _fold(w):
    """Casefold + strip diacritics, so "Péter" and "Peter" compare equal."""
    d = unicodedata.normalize("NFD", w)
    return "".join(c for c in d if not unicodedata.combining(c)).casefold()


def is_name_variant(a, b):
    """True when a and b are long/short forms of the SAME name.

    Deliberately narrow. Requires the first and last words to match and the
    shorter name to be an ordered subsequence of the longer -- i.e. words were
    dropped from the middle, the only shape Wikidata's label oscillation has
    ever taken here. "Bola Tinubu" vs "Bola Ahmed Tinubu" passes; "Bola Tinubu"
    vs "Peter Obi" does not, and neither does a reordering or a substitution."""
    x, y = [_fold(w) for w in (a or "").split()], [_fold(w) for w in (b or "").split()]
    if not x or not y or len(x) == len(y):
        return False
    short, long_ = (x, y) if len(x) < len(y) else (y, x)
    if len(short) < 2 or short[0] != long_[0] or short[-1] != long_[-1]:
        return False
    it = iter(long_)
    return all(w in it for w in short)


def glyph_prefix(n):
    """The leading warn/crown glyphs of a committed name, so a repair keeps
    the source's own annotation instead of silently stripping it."""
    m = re.match(r'^[⚠️\U0001f451\s]+', n or "")
    return m.group(0) if m else ""


def entry_shape(e):
    """Everything about an entry EXCEPT the primary name. A pin repair is only
    safe while this is untouched: a variant name arriving together with a new
    role, date or ceremonial second is a real change, not a label wobble."""
    if not isinstance(e, dict):
        return None
    sec = e.get("second") or {}
    return (e.get("role"), e.get("since"),
            (sec.get("name"), sec.get("role")) if isinstance(sec, dict) else None)


def pin_entry(slug, live_name="", prev_name=""):
    """The pinned entry as it should appear in the file: metadata stripped, keys
    sorted the way the data files store them, and the warn/crown glyph carried
    over so a restore keeps the source's own annotation.

    The glyph follows the pinned PERSON, not whatever the scrape proposed. It is
    taken from the live value only when the live value is still that person (an
    exact or long/short match) -- so the source dropping a warn on the pinned
    leader is honoured, while a scrape that swaps in someone else entirely
    (Saudi -> "King Salman") cannot strip the committed entry's glyph as a side
    effect. Falls back to the committed name, then to no glyph."""
    e = {k: v for k, v in PINS[slug].items() if k != "pinned_on"}
    live = bare(live_name)
    same_person = live == e["name"] or is_name_variant(live, e["name"])
    e["name"] = glyph_prefix(live_name if same_person else prev_name) + e["name"]
    return {k: e[k] for k in sorted(e)}


def describe_pin_drift(proposed, pinned):
    """Short human reason a pinned entry is being restored, for the log line."""
    pn, cn = bare((proposed.get("name") or "").strip()), bare(pinned["name"])
    if pn != cn and is_name_variant(pn, cn):
        return f'long/short label form ("{pn}")'
    bits = []
    if pn != cn:
        bits.append(f'name "{pn}"')
    for k in ("role", "since"):
        if proposed.get(k) != pinned.get(k):
            bits.append(f'{k} {proposed.get(k)!r}')
    if (proposed.get("second") or None) != (pinned.get("second") or None):
        sec = (proposed.get("second") or {}).get("name")
        bits.append("second dropped" if not sec else f'second "{sec}"')
    return "scrape proposed " + ", ".join(bits) if bits else "differs"


def as_date(s):
    """ISO `since` as a date, or None when absent/malformed. Several committed
    entries legitimately carry no date at all (Gulf monarchies, the Swiss
    Federal Council), so every caller must treat None as 'cannot compare'."""
    try:
        return date.fromisoformat(s)
    except (TypeError, ValueError):
        return None


def is_predecessor_restore(e, old_e):
    """True when a scrape swaps in a DIFFERENT name and winds `since` BACKWARDS
    -- i.e. it reinstates the predecessor of the committed incumbent.

    This is the silent half of the vandalism signature. Check #2 catches a new
    name on an unchanged date; this catches a new name on an EARLIER date, the
    shape that quietly regressed estonia (2024-07-23 -> 2021-01-26, restoring a
    PM who left in 2024), madagascar, malawi and mauritius, and that had already
    been hand-corrected twice (c43399283, 3976ba3c8) without the gate noticing.

    Both halves of the condition are load-bearing. A real handover always moves
    the date FORWARD -- including a former leader returning to office, who gets
    a new term's date, not their old one. And the name must actually change:
    the one legitimate backwards move in this repo's history is gambia
    2017-01-21 -> 2017-01-19 (6d954fc67), the same Adama Barrow with his
    inauguration date corrected by two days. Requiring a name change excludes
    that whole class of same-incumbent date fixes."""
    if not isinstance(old_e, dict) or not isinstance(e, dict):
        return False
    if bare((e.get("name") or "").strip()) == bare((old_e.get("name") or "").strip()):
        return False
    new_d, old_d = as_date(e.get("since")), as_date(old_e.get("since"))
    if new_d is None or old_d is None:
        return False  # no date on either side -> nothing to compare
    return new_d < old_d


def _lowercased_word(name):
    """Return the first all-lowercase non-particle word after the first (the
    'Ganesh rajput' vandalism signature), or None."""
    for w in bare(name).split()[1:]:
        if w.isascii() and w.isalpha() and w.islower() and w.lower() not in PARTICLES:
            return w
    return None

def main():
    cur, prev = load_working(), load_prev()
    hard, soft, repairs, reverted = [], [], [], []
    mutated = False   # any write-back to `cur`, whatever list it was logged under

    # Pass 0a: restore pinned entries WHOLE, before any check sees them. The
    # pinned value wins outright -- see the PINS comment for why comparing
    # without repairing was the wrong trade. The restored value is what the
    # downstream checks then validate, so a restore cannot mask a second
    # problem hiding in the same entry.
    for slug in PINS:
        e = cur.get(slug)
        if not isinstance(e, dict):
            continue
        prev_e = prev.get(slug) if isinstance(prev, dict) else None
        want = pin_entry(slug, (e.get("name") or "").strip(),
                         (prev_e or {}).get("name") or "")
        if e == want:
            continue
        # A pin exists to hold the PRIMARY office against a bad scrape. When the
        # only thing that moved is the ceremonial `second`, that is not the
        # failure the pin guards -- it is usually a real succession, and
        # restoring it silently would bury exactly the event worth knowing
        # about. Live case: Hungary's Tamas Sulyok had his term ended early in
        # July 2026 and Agnes Forsthoffer, the Speaker, is ACTING head of state
        # until parliament elects a successor. When it does, the scrape will
        # propose the new president here. Still restore, so the data only ever
        # changes deliberately, but say so loudly enough to act on.
        only_second = all(e.get(k) == want.get(k) for k in ("name", "role", "since")) \
            and (e.get("second") or None) != (want.get("second") or None)
        if only_second:
            was = (want.get("second") or {}).get("name") or "none"
            now = (e.get("second") or {}).get("name") or "none"
            soft.append(f'{slug}: ceremonial second "{was}" -> "{now}" proposed by '
                        f'the scrape; the pin held the committed value. If this is '
                        f'a real succession, update the pin in PINS.')
        else:
            repairs.append(f'{slug}: {describe_pin_drift(e, PINS[slug])} '
                           f'- pinned entry restored')
        cur[slug] = want
        mutated = True

    # Pin staleness: a pin that wins outright must not be able to rot unnoticed.
    today = date.today()
    for slug, pinned in PINS.items():
        on = as_date(pinned.get("pinned_on"))
        if on and (today - on).days > PIN_MAX_AGE_DAYS:
            soft.append(f'{slug}: pin last set {pinned["pinned_on"]} '
                        f'({(today - on).days}d ago) - re-confirm "{pinned["name"]}" '
                        f'still holds office, or update the pin')

    # Pass 0b: revert a scrape that reinstates the committed incumbent's
    # PREDECESSOR (new name + earlier `since`). Reverting rather than HOLDing is
    # deliberate. SOFT alone would let the stale value ship, which is exactly
    # what happened four times; HARD would red-line the whole egress-refresh job
    # -- billionaires, civic data and the citypopulation watcher included -- for
    # a country whose correct value is already sitting in the file. The
    # committed entry carries the later date and is the human-verified one, so
    # keeping it is both the safe and the correct outcome. It is reported every
    # run so a genuine correction that happens to move backwards cannot hide:
    # if one ever appears, update the entry by hand, as with a pin.
    for slug, e in cur.items():
        old_e = prev.get(slug) if isinstance(prev, dict) else None
        if not is_predecessor_restore(e, old_e):
            continue
        soft.append(f'{slug}: scrape wound "{bare((old_e.get("name") or "").strip())}" '
                    f'({old_e.get("since")}) back to '
                    f'"{bare((e.get("name") or "").strip())}" ({e.get("since")}) '
                    f'- a predecessor, not a handover; committed entry kept')
        cur[slug] = old_e
        reverted.append(slug)
        mutated = True

    if mutated:
        with open(PATH, "w", encoding="utf-8") as f:
            f.write(json.dumps(cur, indent=2, ensure_ascii=False))

    # Pass 0c: the same pins, applied to the files _current.json does NOT cover.
    # refresh-current-leaders.py writes the per-country timeline and the changes
    # log in the same pass it writes _current.json, so a pinned country can be
    # correct in _current.json and wrong on its own page. See
    # repair_country_timeline for the run that proved it.
    for slug in PINS:
        msg = repair_country_timeline(slug, PINS[slug])
        if msg:
            repairs.append(msg)
    repairs.extend(repair_changes_log(set(PINS)))

    for slug, e in cur.items():
        if not isinstance(e, dict):
            continue
        name  = (e.get("name") or "").strip()
        since = e.get("since")
        sec   = e.get("second") or {}
        sname = (sec.get("name") or "").strip() if isinstance(sec, dict) else ""

        # 1) pinned entries must match exactly (on the bare name)
        # Backstop only: pass 0a has already restored every pinned entry, so this
        # can fire only if that pass itself regressed. Kept deliberately cheap.
        if slug in PINS and bare(name) != PINS[slug]["name"]:
            hard.append(f'{slug}: pin restore FAILED - expected '
                        f'"{PINS[slug]["name"]}", got "{bare(name)}"')

        old = prev.get(slug) if isinstance(prev, dict) else None
        if isinstance(old, dict):
            oname  = (old.get("name") or "").strip()
            osince = old.get("since")
            orole  = old.get("role")
            role   = e.get("role")
            # 2) name changed but the office did not turn over -> vandalism signature
            if name and oname and bare(name) != bare(oname) and since == osince:
                hard.append(f'{slug}: name "{oname}" -> "{name}" with unchanged since '
                            f'({since}); a real handover needs a new date')
            # 3) office flipped (PM <-> President etc.) for the same country
            if role and orole and role != orole:
                soft.append(f'{slug}: role {orole!r} -> {role!r} - confirm real change, '
                            f'not a re-selected office')

        # 4) named incumbent with no date. SOFT, not hard: several legitimate
        #    committed entries carry no `since` (Gulf monarchies, the Swiss Federal
        #    Council), so hard-failing here would HOLD every run permanently. The
        #    date-carrying vandalism we actually saw is caught by the pin and the
        #    name-change-same-since checks, not by this one.
        if name and not since:
            soft.append(f'{slug}: "{name}" has no `since` date')

        # 5) oddly lowercased word in a proper name (e.g. "Ganesh rajput"),
        #    checked on BOTH the primary and the ceremonial second.
        for label, nm in (("name", name), ("second", sname)):
            if nm:
                w = _lowercased_word(nm)
                if w:
                    soft.append(f'{slug}: {label} "{nm}" has a lowercased word "{w}"')

    for m in repairs: print("REPAIR " + m, file=sys.stderr)
    for m in hard: print("HARD  " + m, file=sys.stderr)
    for m in soft: print("SOFT  " + m, file=sys.stderr)
    if hard:
        print(f"\nHOLD: {len(hard)} hard flag(s) - do not auto-commit _current.json; "
              f"review the above.", file=sys.stderr)
        sys.exit(1)
    bits = []
    if repairs:  bits.append(f"{len(repairs)} pin repair(s)")
    if reverted: bits.append(f"{len(reverted)} predecessor revert(s)")
    if soft:    bits.append(f"{len(soft)} soft flag(s)")
    print("check-leaders-sanity: OK" + (f" ({', '.join(bits)})" if bits else ""))

if __name__ == "__main__":
    main()
