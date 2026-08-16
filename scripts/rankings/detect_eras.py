"""Find rows whose recorded name is anachronistic, and emit an era-name worklist.

THE RULING THIS ENCODES (Ashwin, 2026-08-16: "whatever tells the correct story")
  - A RENAME is the same company. Standard Oil of New Jersey -> Exxon (1972) is one
    continuous entity wearing two names.
  - A MERGER that produces a new name is a NEW company. Exxon and Mobil both end in
    1999; ExxonMobil begins. Collapsing them would erase Mobil, which was separately
    one of the largest companies in the world for forty years.
  - An ACQUISITION where the acquirer's name survives ends the target and continues
    the acquirer.
  So the alias file may merge across a rename and must NEVER merge across a merger.

WHY A DETECTOR AND NOT A HAND LIST
Fortune's own 1996+ feed already tells the correct story: Exxon Corporation runs to
1999, Mobil Corporation runs to 1999, ExxonMobil Holdings starts in 2000. The
1955-1995 mirror does not: it stamps ONE modern name across all 41 years, so
Standard Oil of New Jersey is recorded as "Exxon Mobil" from 1955, Philip Morris as
"Altria Group", and Standard Oil of California as "ChevronTexaco". That is not just
a bad label, it attaches four decades of history to an entity that did not exist.

A name is flagged when the legacy mirror uses it before the year the modern feed
first shows it. That is computable, it ranks itself by how big the company was, and
it turns "author 2,000 era names" into a worklist of the ones that are actually wrong.

  python detect_eras.py                 # -> out/era_worklist.csv
"""
import csv, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

SRC = os.path.join(OUT, "company_rankings.csv")
DEST = os.path.join(OUT, "era_worklist.csv")
LEGACY = "fortune500-archive"
MODERN = "fortune1000"
MODERN_START = 1996      # first year the period-correct feed covers
LATE = 2                 # years after MODERN_START before "new name" is conclusive
FIELDS = ["company_key", "recorded_name", "legacy_from", "legacy_to", "modern_from",
          "modern_to", "peak_rank", "years", "verdict", "era_name", "era_to", "note"]


def main():
    if not os.path.exists(SRC):
        sys.exit(f"FATAL: {SRC} missing. Run build_rankings.py first.")
    with open(SRC, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    span = defaultdict(lambda: {"legacy": [], "modern": [], "name": "", "best": 10**6})
    for r in rows:
        s = span[r["company_key"]]
        y = int(r["year"])
        s["legacy" if r["source"] == LEGACY else "modern"].append(y)
        s["best"] = min(s["best"], int(r["rank"]))
        if not s["name"]:
            s["name"] = r["company"]

    # SECOND RULE: merger names stamped on a predecessor.
    # "exxon mobil" has no modern row under that key at all, so the date test above
    # can never see it, and the board happily printed "Exxon Mobil" for 1955. But the
    # key decomposes into two OTHER keys that each have their own listings — `exxon`
    # and `mobil` were separately ranked companies. A name that is the concatenation
    # of two of its own contemporaries is a merger name, and a merger name on a
    # pre-merger year is always wrong. Requiring both halves to be real listed
    # companies is what keeps this from firing on ordinary compound names.
    allkeys = {k for k in span if len(k) >= 3}
    def merger_of(key):
        flat = key.replace(" ", "")
        for a in allkeys:
            fa = a.replace(" ", "")
            if len(fa) < 4 or not flat.startswith(fa) or fa == flat:
                continue
            rest = flat[len(fa):]
            for b in allkeys:
                if b != a and rest == b.replace(" ", "") and len(rest) >= 4:
                    return a, b
        return None

    flagged, clean, orphan = [], 0, 0
    for key, s in span.items():
        lo, mo = sorted(s["legacy"]), sorted(s["modern"])
        if not lo:
            clean += 1
            continue
        merged = merger_of(key) if lo else None
        if merged:
            verdict = "anachronistic"
            note = (f"merger name: decomposes into {merged[0]!r} + {merged[1]!r}, both "
                    f"separately listed, so it cannot be right for {lo[0]}")
        elif not mo:
            # Legacy-only. The name may still be anachronistic but nothing in the
            # data proves it, so it is a lower-priority manual read, not a finding.
            orphan += 1
            verdict, note = "legacy-only", "no modern row to date the name against"
        elif mo[0] >= MODERN_START + LATE:
            # The discriminator. "Legacy year < modern year" is useless: the modern
            # feed starts in 1996, so EVERY company alive in 1995 trips it and
            # General Motors gets flagged for being called General Motors. What
            # actually proves a name is anachronistic is that the name is ABSENT
            # from the feed's own early years and only appears later — ChevronTexaco
            # first appears in 2002, ConocoPhillips in 2003. A name that did not
            # exist in 1996 certainly did not exist in 1955.
            verdict = "anachronistic"
            note = (f"name absent from the feed until {mo[0]}, yet stamped on legacy "
                    f"rows from {lo[0]}")
        elif mo[0] > MODERN_START:
            verdict = "borderline"
            note = (f"name first appears {mo[0]}, only {mo[0]-MODERN_START} year(s) "
                    f"into the feed — probably a formal-name tweak, read it")
        else:
            clean += 1
            continue
        flagged.append({
            "company_key": key, "recorded_name": s["name"],
            "legacy_from": lo[0], "legacy_to": lo[-1],
            "modern_from": mo[0] if mo else "", "modern_to": mo[-1] if mo else "",
            "peak_rank": s["best"], "years": len(lo) + len(mo),
            "verdict": verdict, "era_name": "", "era_to": "", "note": note,
        })

    ORDER = {"anachronistic": 0, "borderline": 1, "legacy-only": 2}
    flagged.sort(key=lambda r: (ORDER[r["verdict"]], r["peak_rank"]))
    with open(DEST, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader(); w.writerows(flagged)

    anach = [r for r in flagged if r["verdict"] == "anachronistic"]
    border = [r for r in flagged if r["verdict"] == "borderline"]
    log(f"companies              : {len(span)}")
    log(f"names dated as sound   : {clean}")
    log(f"ANACHRONISTIC          : {len(anach)}  <- the real worklist")
    log(f"borderline             : {len(border)}  (name appears 1 year into the feed)")
    log(f"legacy-only (unproven) : {orphan}")
    log(f"-> {DEST}   (fill era_name + era_to; blank rows keep the source name)")
    log("top of the worklist:")
    for r in anach[:12]:
        log(f"   #{r['peak_rank']:<4d} {r['legacy_from']}-{r['legacy_to']} recorded as "
            f"{r['recorded_name']!r}, that name only appears from {r['modern_from']}")


if __name__ == "__main__":
    main()
