#!/usr/bin/env python3
"""Second tagging pass: ask the local model for COMPANIES the dictionary missed.

build_topics.py matches a generated vocabulary and is precise but literal: it only
fires on a name it already holds. This pass takes the stories it left bare and asks
llama3.1:8b to name any company the story mentions.

The model PROPOSES, the dictionary DECIDES. A company is kept only if build_topics.py's
own vocabulary already knows the name AND the name appears verbatim in the story text.
Anything else is dropped. So the model can add recall and cannot invent an entity.

🔴 THIS PASS DOES NOT PROPOSE THEMES, AND MUST NOT BE CHANGED TO. It did on
2026-09-13, and the result was measured the same day and rolled back:

    5   of 334 rows gained a company, each one substring-checked
    329 of 334 rows gained ONLY a theme, with no keyword evidence behind it

The reason is structural, not a prompt problem. build_topics.py already matches every
theme by keyword needle, and this pass only ever sees the rows those needles missed. So
an LLM theme is by construction a theme whose own words are absent from the story: the
single most inferential call there is, handed to the smallest model in the house. A
twelve-row sample was mostly wrong ("Vandals are destroying license-plate cameras" ->
public-health; "People Inc. CEO: We're not turning off Google crawlers" -> data-centres).
When the tags exist to be counted, a wrong tag is worse than no tag.

The durable fix for theme recall is to widen the needle lists in build_topics.py, which
is auditable and applies to every future day. See scripts/digest/topics_llm_rollback.py.

Talks to ollama over localhost HTTP rather than one MCP call per story, so 800 stories
is one process on this machine instead of 800 round trips.

Usage:
    python scripts/digest/topics_llm.py --self-test
    python scripts/digest/topics_llm.py --limit 20          # dry run, prints proposals
    python scripts/digest/topics_llm.py --write             # whole backlog
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_topics import (  # noqa: E402  reuse the one vocabulary, never a second copy
    build_vocab, find_topics, key, req, story_text,
)

OLLAMA = "http://localhost:11434/api/chat"
MODEL = "llama3.1:8b"

SYSTEM = (
    "You read news stories and name the companies in them. You answer with JSON only, "
    "no prose.\n"
    "Return an object with exactly one key:\n"
    '  "companies": an array of 0 to 3 company names the story mentions, spelled exactly '
    "as the story spells them\n"
    "Name a company only if it appears in the text in front of you. Do not infer a "
    "company from the subject matter. An empty array is a good answer. Never explain "
    "yourself."
)


def ask(text: str, timeout: int = 90) -> dict:
    payload = {
        "model": MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Story: {text}"},
        ],
    }
    r = urllib.request.Request(OLLAMA, data=json.dumps(payload).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        body = json.loads(resp.read().decode())
    try:
        return json.loads(body["message"]["content"])
    except (KeyError, json.JSONDecodeError):
        return {}


def keep(proposal: dict, vocab: dict, text: str = "") -> list[dict]:
    """The decider. A company must be in the generated vocabulary AND actually appear in
    the story text. A theme proposal is discarded outright, whatever it says.

    🔴 That second company condition is not belt and braces. On the first trial run the
    model answered "Apple" for a story about the First Amendment, and a vocabulary check
    alone passed it, because Apple is a real company. Being a real name is not evidence
    the story mentions it. Requiring the substring is what makes this path safe.

    Everything kept here is marked src=llm, so a tag this pass produced can always be told
    apart from one the dictionary matched, and swept later if it proves noisy. That
    marking is what made the theme rollback possible; keep it.
    """
    out: list[dict] = []
    seen: set[str] = set()
    hay = text.lower()

    for c in (proposal.get("companies") or [])[:3]:
        name = str(c).strip()
        meta = vocab.get(name.lower())
        if not meta or meta["type"] != "company":
            continue
        if hay and name.lower() not in hay:
            continue  # named but not present: a hallucination, however real the company
        k = f"company:{meta['id']}"
        if k not in seen:
            seen.add(k)
            out.append({"type": "company", "id": meta["id"], "label": meta["label"],
                        "src": "llm"})
    return out


def self_test() -> None:
    v = {"nvidia": {"type": "company", "id": "nvidia", "label": "Nvidia"}}
    bad = 0
    HIT = "Nvidia and the chip market"
    MISS = "A ruling on the First Amendment"
    cases = [
        (HIT, {"companies": ["Nvidia", "Totally Made Up Corp"]}, {"company:nvidia"}),
        (HIT, {"companies": ["Nvidia", "Nvidia"]}, {"company:nvidia"}),   # dedupe
        (HIT, {}, set()),
        # A real company the story never mentions. This is the Apple / First Amendment
        # failure, and the substring check is the only thing that catches it.
        (MISS, {"companies": ["Nvidia"]}, set()),
        # Themes are refused whatever the model sends, valid ids included.
        (HIT, {"themes": ["ai", "tariffs"], "companies": []}, set()),
        (HIT, {"themes": ["ai"], "companies": ["Nvidia"]}, {"company:nvidia"}),
    ]
    for text, proposal, want in cases:
        got = {f"{h['type']}:{h['id']}" for h in keep(proposal, v, text)}
        if got != want:
            print(f"  FAIL {proposal} on {text!r} -> {got}, want {want}")
            bad += 1
    print("self-test:", "OK" if bad == 0 else f"{bad} FAILURE(S)")
    sys.exit(1 if bad else 0)


def main() -> None:
    args = sys.argv[1:]
    if "--self-test" in args:
        self_test()
    write = "--write" in args
    limit = 0
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])

    print("Loading the vocabulary build_topics.py uses ...")
    vocab = build_vocab()
    key()  # fail fast if Supabase is unreachable before a long run

    for table in ("digest_item", "digest_item_textonly"):
        rows, offset = [], 0
        while True:
            page = req("GET", f"{table}?select=id,headline,why,topics,entities"
                              f"&order=id&limit=1000&offset={offset}")
            if not page:
                break
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += 1000

        bare = [r for r in rows
                if not (r.get("topics") or []) and not (r.get("entities") or [])]
        if limit:
            bare = bare[:limit]
        print(f"\n{table}: {len(rows)} rows, {len(bare)} with nothing at all")
        if not bare:
            continue

        gained, started = 0, time.time()
        for i, r in enumerate(bare, start=1):
            # story_text, not headline + why. A quarter of the archive's `why` values
            # describe the day's SECTION rather than the story, and feeding that to the
            # model invites it to name the neighbour's company.
            text = story_text(r["headline"], r.get("why"))
            try:
                proposal = ask(text)
            except (urllib.error.URLError, TimeoutError) as e:
                print(f"  [{i}] ollama error, skipping: {e}")
                continue

            topics = keep(proposal, vocab, text)
            # Belt and braces: the dictionary gets another look at the same text, in case
            # the first pass ran before a vocabulary change.
            for t in find_topics(text, vocab):
                if not any(x["type"] == t["type"] and x["id"] == t["id"] for x in topics):
                    topics.append(t)

            if not topics:
                continue
            gained += 1
            if write:
                req("PATCH", f"{table}?id=eq.{r['id']}", {"topics": topics[:8]},
                    prefer="return=minimal")
            if i <= 10 or i % 50 == 0:
                rate = i / max(time.time() - started, 1)
                tags = ", ".join(f"{t['type']}:{t['id']}" for t in topics)
                print(f"  [{i}/{len(bare)}] {rate:.2f}/s  {r['headline'][:58]}  -> {tags}")

        print(f"  {gained}/{len(bare)} gained a tag"
              + ("" if write else "  (dry run, nothing written)"))


if __name__ == "__main__":
    main()
