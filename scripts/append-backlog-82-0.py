#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Append three 82-0-inspired backlog items to BACKLOG.md. Run on Windows:
      python scripts/append-backlog-82-0.py
Idempotent (skips if the section marker is already present). BACKLOG.md is
gitignored internal-docs, so this never touches git.
"""
import os, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fp = os.path.join(ROOT, "BACKLOG.md")
MARKER = "## Inspired by 82-0.com (added 2026-06-21)"
s = io.open(fp, encoding="utf-8").read()
if MARKER in s:
    print("skip BACKLOG.md (82-0 section already present)")
else:
    block = '''

---

''' + MARKER + '''

Source: 82-0.com, a popular all-time NBA draft-and-simulate game (draft one legend per decade via a team+decade slot machine, scored on five box-score metrics through a non-linear win curve, wrapped in a feed, leaderboard, challenges and profiles). Its data is commodity public box-score stats; its moat is the engagement loop and curation. Our site is the inverse: deep reference, no game loop. These items borrow the loop and, more importantly, extend our own metro thesis. See also the Daily quiz layer track above (the pinpoint-the-metro game) and `feedback`/prototype memories for Fan Geography and Metro Similarity.

### Cradles of Greatness — athlete birthplaces mapped to metros  (P1, the standout)

Why: the most on-thesis idea 82-0 surfaces, and one no competitor frames our way. Champions have hometowns; so do the champions themselves. If we map elite athletes' birthplaces to our metro polygons, we get a genuinely novel ranking — which metros produce the most world-class athletes — that extends franchise pages, metro pages, and country pages, and rhymes with the "Every Champion Has a Hometown" editorial line. It is a depth play that also unlocks future player-based games.

Acceptance:
- New data layer: a curated set of elite athletes (start with one or two sports we already cover deeply, e.g. football and basketball) with birthplace geocoded and resolved to the canonical metro via the existing boundary polygons; unresolved births go to the user (skipped.json), never hand-mapped, per `feedback_no_guessing_city_metro`.
- New view at `/sports/cradles` (or a badge): metros ranked by elite athletes produced, with a per-metro list and a per-capita cut.
- Metro pages gain a "Born here" block listing the notable athletes from that metro, linking to their team/sport hub.
- Source athlete lists from public references (Wikipedia/Wikidata birthplace, Basketball-Reference, etc.); birthplace is commodity data exactly like 82-0's stats.
- Open question: scope. Start narrow (a few hundred all-time greats in two sports) and expand; do not attempt every athlete in every sport at once.

### All-time team draft game on our own data  (P2)

Why: the cheapest path to the engagement loop 82-0 proves out, built entirely on data we already have (champion clubs, franchises, Zone Zero pillars) so it needs no new dataset. Complements, does not replace, the pinpoint Daily quiz layer above; this is a draft/builder mechanic, that is a geography mechanic.

Acceptance:
- A draft game where each round a slot machine assigns a constraint (e.g. confederation + decade, or sport + era) and the player picks the strongest qualifying champion/club from our data; the roster is scored on trophies and a simple non-linear curve, with a shareable result card (we already ship OG cards).
- Stateless first: encode the roster and score in the share URL; defer accounts and a leaderboard to the Daily quiz layer's backend if/when that ships.
- Live on a side route (`/sports/draft` or `/play/draft`), keeping the homepage and nav editorial, per the Daily quiz layer's positioning note.
- A "HoopIQ"-style hard mode (stats/ratings hidden) as a fast follow.

### Small engagement wins  (P2, low effort)

Why: cheap borrows from 82-0's UX that reuse existing surfaces.

Acceptance:
- Hidden-information hard mode on the existing `/teams/national/quiz` (names/flags already stripped; add a stats-hidden variant).
- A random-constraint "Surprise me" entry point on `/sports` that drops the reader on a random metro/team under a random constraint (continent + tier), reusing the existing random-metro logic.
'''
    io.open(fp, "a", encoding="utf-8", newline="\n").write(block)
    print(f"PATCH OK: appended 82-0 section ({len(block)} chars) to BACKLOG.md")
