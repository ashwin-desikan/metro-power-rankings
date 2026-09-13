#!/usr/bin/env python3
"""Undo the local model's THEME guesses, keep the entities it actually evidenced.

Why this exists. topics_llm.py runs only on stories the dictionary left bare, and
build_topics.py already matches every theme by keyword needle. So an LLM theme is, by
construction, a theme whose own words are absent from the story: exactly the inferential
call an 8B model is worst at. Measured on 2026-09-13 over the 334 rows it touched:

    5   rows gained a company, each one substring-checked against the story text
    329 rows gained ONLY a theme, with no keyword evidence behind it
    0   rows also carried a dictionary tag

A twelve-row sample of those 329 was mostly wrong ("Vandals are destroying license-plate
cameras" -> public-health; "People Inc. CEO: We're not turning off Google crawlers" ->
data-centres; two unrelated stories -> retail-media). A wrong tag is worse than no tag
when the tags exist to be counted, so the themes come out and the companies stay.

Coverage falls back from 96.5% to roughly 78.6%. That number was never real.

The durable fix is to widen the THEMES needle lists in build_topics.py and re-run the
dictionary pass, which is auditable and helps every future day as well.

Usage:
    python scripts/digest/topics_llm_rollback.py            # dry run, prints the counts
    python scripts/digest/topics_llm_rollback.py --write
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_topics import key, req  # noqa: E402


def strip_llm_themes(topics: list[dict]) -> list[dict]:
    """Drop theme tags the model sourced. An LLM company tag survives: it had to appear
    in the story text verbatim to be written in the first place."""
    return [t for t in topics if not (t.get("src") == "llm" and t.get("type") == "theme")]


def self_test() -> None:
    cases = [
        ([{"type": "theme", "id": "ai", "src": "llm"}], []),
        ([{"type": "company", "id": "nvidia", "src": "llm"}],
         [{"type": "company", "id": "nvidia", "src": "llm"}]),
        ([{"type": "theme", "id": "ai"}], [{"type": "theme", "id": "ai"}]),  # dictionary theme stays
        ([{"type": "theme", "id": "ai", "src": "llm"},
          {"type": "company", "id": "nvidia", "src": "llm"}],
         [{"type": "company", "id": "nvidia", "src": "llm"}]),
    ]
    bad = 0
    for got_in, want in cases:
        got = strip_llm_themes(got_in)
        if got != want:
            print(f"  FAIL {got_in} -> {got}, want {want}")
            bad += 1
    print("self-test:", "OK" if bad == 0 else f"{bad} FAILURE(S)")
    sys.exit(1 if bad else 0)


def main() -> None:
    args = sys.argv[1:]
    if "--self-test" in args:
        self_test()
    write = "--write" in args
    key()

    for table in ("digest_item", "digest_item_textonly"):
        rows, offset = [], 0
        while True:
            page = req("GET", f"{table}?select=id,topics&topics=cs."
                              f"%5B%7B%22src%22%3A%22llm%22%7D%5D&order=id"
                              f"&limit=1000&offset={offset}")
            if not page:
                break
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += 1000

        emptied = changed = 0
        for r in rows:
            before = r.get("topics") or []
            after = strip_llm_themes(before)
            if after == before:
                continue
            changed += 1
            if not after:
                emptied += 1
            if write:
                # PATCH of `topics` only, never a whole-row upsert: a push may be
                # rewriting these rows at the same time.
                req("PATCH", f"{table}?id=eq.{r['id']}", {"topics": after},
                    prefer="return=minimal")

        print(f"{table}: {len(rows)} llm-tagged, {changed} changed, {emptied} back to no tags"
              + ("" if write else "   (dry run, nothing written)"))


if __name__ == "__main__":
    main()
