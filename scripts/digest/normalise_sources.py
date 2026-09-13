#!/usr/bin/env python3
"""One publication, one name.

The digest archive carries 132 distinct `source_name` values over thirty days, and a
chunk of them are the same publication written two or three ways. Measured 2026-09-13:

    Washington Post            87     The Washington Post        79
    New York Times              2     The New York Times          8     NYT      1
    Front Office Sports        42     FOS                         3
    Semafor 40, Semafor Flagship 7, Semafor Washington DC 5, Semafor Business 4, Semafor DC 1

Nothing was broken by this until now, because nothing counted by source. The moment the
digest page grows a "most active sources" panel — the thing that makes an aggregator feel
authoritative — those splits become visibly wrong, and wrong in the way that reads as
carelessness rather than as a bug.

🔴 THE MAP IS EXPLICIT ON PURPOSE. The obvious shortcut is to strip a leading "The " and
lowercase, which merges "The Washington Post" correctly and merges "The Athletic" into
"Athletic" at the same time, inventing a publication that does not exist. Every merge here
is a decision somebody made and can argue with. `--report` FINDS candidates; only this map
ACTS on them.

Usage:
    python scripts/digest/normalise_sources.py --self-test
    python scripts/digest/normalise_sources.py --report     # unmapped near-duplicates
    python scripts/digest/normalise_sources.py              # dry run, shows every change
    python scripts/digest/normalise_sources.py --write
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_topics import key, req  # noqa: E402

# variant (lowercased) -> canonical name.
CANONICAL: dict[str, str] = {
    # Definite-article and abbreviation pairs.
    "washington post": "The Washington Post",
    "new york times": "The New York Times",
    "nyt": "The New York Times",
    "hollywood reporter": "The Hollywood Reporter",
    "fos": "Front Office Sports",
    "sbj": "Sports Business Journal",
    # Editions of one title. A reader looking at a source panel wants "Semafor", not five
    # rows; the edition still lives in the story's own link.
    "semafor flagship": "Semafor",
    "semafor washington dc": "Semafor",
    "semafor dc": "Semafor",
    "semafor business": "Semafor",
    "sportbusiness gameday": "SportBusiness",
    "sport & story daily": "Sport & Story",
    # Found by --report on the first run rather than by reading the list, which is the
    # whole point of having the report.
    "aisecret": "AI Secret",
    "vox (user friendly)": "Vox",
    "vox user friendly": "Vox",
    # Ben Thompson's family of titles, filed under the one people name.
    "sharp text": "Stratechery",
    "stratechery / sharp text": "Stratechery",
    # Where the story reached us is not who published it.
    "linkedin / the current": "The Current",
    "linkedin / global game hq": "Global Game HQ",
    "linkedin / refacto ai": "Refacto AI",
}

# 🔴 NOT merged, though the near-duplicate report flags them:
#   "SportBusiness" (UK, sportbusiness.com) and "Sports Business Journal" (US) are
#   different mastheads that a stripped-whitespace comparison makes look identical.
#   "Sport & Story" and "Sports Marketing Mavericks" are different newsletters.
KNOWN_DISTINCT = {("sportbusiness", "sportsbusinessjournal")}


def canon(name: str) -> str:
    """The canonical spelling, or the name unchanged. Never guesses."""
    s = (name or "").strip()
    return CANONICAL.get(s.lower(), s)


def fingerprint(name: str) -> str:
    """Loose key used ONLY to propose merges in --report, never to apply one."""
    s = re.sub(r"[^a-z0-9]+", "", (name or "").lower())
    return re.sub(r"^the", "", s)


TABLES = ("digest_item", "digest_item_textonly")


def fetch_sources() -> list[dict]:
    rows: list[dict] = []
    for table in TABLES:
        offset = 0
        while True:
            page = req("GET", f"{table}?select=id,source_name&order=id"
                              f"&limit=1000&offset={offset}")
            if not page:
                break
            for r in page:
                r["_table"] = table
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += 1000
    return rows


def report(rows: list[dict]) -> None:
    """Near-duplicates the map does not yet cover. A to-do list, not an instruction."""
    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[canon(r.get("source_name") or "")] += 1

    groups: dict[str, list[str]] = defaultdict(list)
    for name in counts:
        if name:
            groups[fingerprint(name)].append(name)

    flagged = 0
    for fp, names in sorted(groups.items()):
        if len(names) < 2:
            continue
        if tuple(sorted(fingerprint(n) for n in names)) in KNOWN_DISTINCT:
            continue
        flagged += 1
        print(f"  {fp}: " + ", ".join(f"{n} ({counts[n]})" for n in sorted(names)))
    print(f"\n{flagged} unmapped near-duplicate group(s) across "
          f"{len([c for c in counts if c])} canonical sources")


def main() -> None:
    args = sys.argv[1:]
    if "--self-test" in args:
        self_test()

    rows = fetch_sources()
    print(f"{len(rows)} rows across {len(TABLES)} tables")

    if "--report" in args:
        report(rows)
        return

    changes = [(r, canon(r["source_name"])) for r in rows
               if r.get("source_name") and canon(r["source_name"]) != r["source_name"]]
    by_pair: dict[tuple[str, str], int] = defaultdict(int)
    for r, new in changes:
        by_pair[(r["source_name"], new)] += 1
    for (old, new), n in sorted(by_pair.items(), key=lambda x: -x[1]):
        print(f"  {old!r} -> {new!r}  ({n} rows)")
    print(f"\n{len(changes)} rows would change across {len(by_pair)} spelling(s)")

    if "--write" not in args:
        print("(dry run, nothing written)")
        return

    key()
    for n, (r, new) in enumerate(changes, start=1):
        # PATCH of source_name only. A whole-row upsert here could re-insert a story the
        # morning push has deleted, the trap documented in build_topics.py.
        req("PATCH", f"{r['_table']}?id=eq.{r['id']}", {"source_name": new},
            prefer="return=minimal")
        if n % 100 == 0:
            print(f"    {n}/{len(changes)}")
    print(f"  wrote {len(changes)} rows")


def self_test() -> None:
    bad = 0
    cases = [
        ("Washington Post", "The Washington Post"),
        ("The Washington Post", "The Washington Post"),
        ("washington post", "The Washington Post"),     # case-insensitive lookup
        ("  FOS  ", "Front Office Sports"),             # whitespace
        ("NYT", "The New York Times"),
        ("Semafor DC", "Semafor"),
        ("LinkedIn / The Current", "The Current"),
        # 🔴 The reason the map is explicit. A strip-"The" heuristic invents "Athletic".
        ("The Athletic", "The Athletic"),
        ("The Ringer", "The Ringer"),
        ("The Guardian", "The Guardian"),
        # Two different mastheads that must not merge.
        ("SportBusiness", "SportBusiness"),
        ("Sports Business Journal", "Sports Business Journal"),
        # Anything unknown passes through untouched rather than being guessed at.
        ("Some New Newsletter", "Some New Newsletter"),
        ("", ""),
    ]
    for raw, want in cases:
        got = canon(raw)
        if got != want:
            print(f"  FAIL canon({raw!r}) -> {got!r}, want {want!r}")
            bad += 1

    # The fingerprint must GROUP the pairs the map merges, or --report would never have
    # surfaced them in the first place.
    for a, b in (("Washington Post", "The Washington Post"),
                 ("Hollywood Reporter", "The Hollywood Reporter")):
        if fingerprint(a) != fingerprint(b):
            print(f"  FAIL fingerprint({a!r}) != fingerprint({b!r})")
            bad += 1
    # And it must NOT group two real, different publications.
    if fingerprint("The Athletic") == fingerprint("Athletic Business"):
        print("  FAIL fingerprint merged two distinct titles")
        bad += 1

    # Every canonical target must itself be stable: canon(canon(x)) == canon(x).
    for variant, target in CANONICAL.items():
        if canon(target) != target:
            print(f"  FAIL {target!r} is not a fixed point (from {variant!r})")
            bad += 1

    print("self-test:", "OK" if bad == 0 else f"{bad} FAILURE(S)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
