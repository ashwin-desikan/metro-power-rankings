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
import json, re, subprocess, sys, unicodedata
from datetime import date

PATH = "public/data/leaders/_current.json"

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
}
PIN_MAX_AGE_DAYS = 365  # past this, a pin raises a SOFT flag asking for a re-check
PARTICLES = {"bin","bint","ibn","al","van","von","de","da","del","dos","di","der",
             "ter","of","the","e","du","la","le","y","das"}
_GLYPHS = "⚠️\U0001f451"  # warn (⚠️) + crown (👑)

def bare(n):
    """Strip leading warn/crown glyphs and whitespace, matching the source's bare()."""
    return re.sub(r'^[⚠️\U0001f451\s]+', '', (n or "")).strip()

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
        repairs.append(f'{slug}: {describe_pin_drift(e, PINS[slug])} '
                       f'- pinned entry restored')
        cur[slug] = want

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

    if repairs or reverted:
        with open(PATH, "w", encoding="utf-8") as f:
            f.write(json.dumps(cur, indent=2, ensure_ascii=False))

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
