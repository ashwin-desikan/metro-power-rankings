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

Two deviations from the originally-specified gate, both grounded in the data:
  * PINS compare the BARE name (warn/crown glyphs stripped). The source glyphs
    warn-listed leaders, so Saudi is committed as "⚠️ Mohammed bin Salman"; a raw
    string compare would hard-fail the pin forever.
  * The vandalism and lowercase checks also scan the ceremonial `second` name,
    because that is precisely where the India vandalism sat (a primary-only check
    would have missed "Ganesh rajput" once India leads with the PM).
"""
import json, re, subprocess, sys

PATH = "public/data/leaders/_current.json"

# Manually verified heads of government the scrape must NOT overwrite (Wikidata is
# vandalized, stale, or returns the wrong office for these). Compared on the BARE
# name, so a warn/crown glyph on the committed value is fine. Update deliberately,
# by hand, as part of a real leadership change -- a drift here HOLDs the commit.
PINS = {
    "india":        "Narendra Modi",         # WD head-of-state label was vandalized ("Ganesh rajput")
    "saudi-arabia": "Mohammed bin Salman",   # WD returns King Salman for both P35/P6
    "israel":       "Benjamin Netanyahu",    # PM_LED fix; WD would otherwise lead with ceremonial Pres.
    "hungary":      "Péter Magyar",          # no more CURATED_OVERRIDES backstop (2026-08-07, WD
                                              # resolved its own label + start date) -- pin stays as
                                              # the regression guard now that WD is load-bearing here
    "bulgaria":     "Rumen Radev",           # WD P6 stale (still Petkov, 2021)
}
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

def _lowercased_word(name):
    """Return the first all-lowercase non-particle word after the first (the
    'Ganesh rajput' vandalism signature), or None."""
    for w in bare(name).split()[1:]:
        if w.isascii() and w.isalpha() and w.islower() and w.lower() not in PARTICLES:
            return w
    return None

def main():
    cur, prev = load_working(), load_prev()
    hard, soft = [], []

    for slug, e in cur.items():
        if not isinstance(e, dict):
            continue
        name  = (e.get("name") or "").strip()
        since = e.get("since")
        sec   = e.get("second") or {}
        sname = (sec.get("name") or "").strip() if isinstance(sec, dict) else ""

        # 1) pinned entries must match exactly (on the bare name)
        if slug in PINS and bare(name) != PINS[slug]:
            hard.append(f'{slug}: expected pinned name "{PINS[slug]}", got "{bare(name)}"')

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

    for m in hard: print("HARD  " + m, file=sys.stderr)
    for m in soft: print("SOFT  " + m, file=sys.stderr)
    if hard:
        print(f"\nHOLD: {len(hard)} hard flag(s) - do not auto-commit _current.json; "
              f"review the above.", file=sys.stderr)
        sys.exit(1)
    print(f"check-leaders-sanity: OK" + (f" ({len(soft)} soft flag(s))" if soft else ""))

if __name__ == "__main__":
    main()
