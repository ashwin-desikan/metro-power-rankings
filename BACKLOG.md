# Backlog

Future work on the Metro Area Rankings site and citizenofnowhere.org. Grouped by priority. Each item has a short rationale and a concrete acceptance sketch so it is actionable later.

Inspired in part by patterns from Tim's project at https://isitaderby.co.uk, especially the way it treats methodology as a product, uses badges to reframe the same data, and exposes named verdict tiers.

---

## P0 — ship first

### Methodology as a named product page

Why: the single biggest trust gap today. Reader feedback has flagged confusion over naming and categorization, and no page currently walks through the formula, the adjustments, or the editorial overrides. Tim's /scoring-methodology is the template.

Acceptance:
- New route at /methodology (or /how-it-works) linked from primary nav.
- Section 1: "what counts as global depends on what you're measuring" framing paragraph.
- Section 2: dimension weighting table (all 16 dimensions, weights, rationale for each).
- Section 3: adjustments and caps (e.g. tier caps, corridor consolidation, population normalization, anything that deviates from a flat sum).
- Section 4: declared editorial overrides, named explicitly per metro where applied.
- Section 5: known limitations and data vintage.
- Each section anchors so Substack pieces can link to the specific claim.

### Badges layer

Why: badges reframe the same data through categorical lenses. Each badge page becomes an indexable long-tail SEO target and a better URL to share in Substack than "row 37 of the rankings." Directly addresses the "rankings within rankings" framing problem.

Acceptance:
- 8 to 12 badges defined, each with a slug, emoji, short description, and a deterministic rule against the existing metros dataset (no new data ingestion).
- Candidate set to validate:
  - Megacity (metro pop above threshold)
  - Global Gateway (top decile airport score)
  - Finance Capital (top decile market cap + exchanges)
  - Culture Capital (top decile cultural events + museums + Michelin)
  - University Town (top decile universities)
  - Sports Mecca (top decile teams + events)
  - Rail Hub (top decile metro + intercity rail)
  - Twin Metros (within N km of another top-500 metro)
  - Isolated Capital (no top-500 metro within N km)
  - Overperformer (high score per capita)
  - Underperformer (decide editorially whether to ship)
- /badges/[slug] index page for each badge with the qualifying metros ranked and a context metric shown next to each (e.g. airport score for Global Gateway, distance to nearest peer for Twin Metros).
- Badges render as chips on each metro detail page, linking back to the index pages.
- Badges are computed as views over the existing metros table, not a forked dataset.

### Named score tiers

Why: raw numbers do not travel in social. Tim's "Proper Local Derby / Regional Derby / Not a Derby" bands give readers something quotable. A GaWC-inspired naming system fits the audience.

Acceptance:
- Score bands named and applied site-wide:
  - 100+ Global Capital (or "Alpha")
  - 50 to 99 World City
  - 20 to 49 Major Metro
  - 10 to 19 Regional Hub
  - 5 to 9 Established City
  - 1 to 4 Emerging City
  - below 1 Local City
- Tier rendered prominently on each metro detail page, above the numeric score.
- Tier appears on OG share cards.
- Tier appears in the compare grid as a colored pill.
- Final naming TBD, potentially closer to GaWC alpha/beta/gamma to wink at the domain audience.

---

## P1 — second wave

### Fixture-style matchup pages

Why: /compare is a utility, /matchups/new-york-vs-tokyo is content. Canonical pair URLs unlock social sharing in a way the current query-string compare cannot.

Acceptance:
- New route at /matchups/[slug-vs-slug] with a verdict strip ("TIER MATCH: WORLD CITY VS WORLD CITY"), a map showing both metros, an editorial paragraph, a dimension-by-dimension winner grid, and a Share button.
- Editorial paragraph starts as a template driven by dimension winners and tier diff, then upgraded to hand-written copy for the top N pairs (NYC vs London, Tokyo vs Seoul, SF vs Seattle, Paris vs Berlin, etc.).
- Pair generation restricted to pairs where both metros are in the top 200 (to keep page count sane). Expand later.
- OG image per pair with both names, both tiers, and the winner strip.

### Named ranking cuts

Why: each cut becomes a standalone publication and a distinct inbound link target for Substack.

Acceptance:
- Cuts defined as views over the main dataset:
  - Power 100 (the existing main list)
  - Power 10
  - Global Gateways Top 50
  - Culture Capitals Top 50
  - Finance Capitals Top 50
  - Overperformers Top 25 (score per capita)
  - Twin Metros index
- Each cut lives at /rankings/[cut-slug] with a hero paragraph explaining the lens.
- Exposed under a "Rankings" dropdown in primary nav, not as flat top-level links.

### Editorial overrides, declared

Why: Tim's AFC Wimbledon vs MK Dons disclosure is a credibility move. Being explicit about any manual override pre-empts critique.

Acceptance:
- Every editorial override (metro-specific caps, manual reorderings, hand-assigned badges) is listed on the methodology page with the affected metro, what changed, and why.
- Override list rendered from a single source of truth (e.g. overrides.json) so the methodology page cannot drift from the actual code.

---

## P2 — small wins and polish

### Random metro button

Why: cheap, encourages exploration, mirrors Tim's 🎲.

Acceptance:
- Button in the header or hero area, routes to a random metro detail page.
- Optional: weighted by tier so not every roll lands on a tiny metro.

### Per-metro share cards

Why: materially increases Substack-to-site traffic.

Acceptance:
- OG image route that renders a card with the metro name, tier badge, score, and a couple of signature dimensions.
- Share button on each metro detail page.

### Colophon crediting inspirations

Why: standard in this subgenre, costs nothing, nice human gesture.

Acceptance:
- Small "inspired by" or "with thanks to" section on /about naming isitaderby.co.uk and any other projects that influenced the product thinking.

### Blog as first-class nav

Why: the writing on Substack is doing half the work of positioning the site. Surfacing it from the main nav reinforces citizenofnowhere.org as the intellectual home base rather than just a data destination.

Acceptance:
- "Writing" or "Blog" link in the primary nav that either deep-links to the Substack or renders a curated feed of the three or four most recent posts with their hero images.

---

## Explicitly not doing

### Replacing the homepage with a two-object picker

Why: Tim's picker-first homepage works because the atomic unit of his site is a fixture. The atomic unit here is a metro's rank, and the ranked list is the strongest asset. Keep /compare as a named destination, keep the ranked list on the homepage.

### Copying Tim's visual chrome

Why: the current typography and layout are materially stronger than the reference. Borrow structure and information architecture, not chrome.

---

## Sequencing notes

If only one thing ships: methodology page.
If two: methodology + badges.
Named tiers are cheap enough to bolt on in the same sprint as badges because they are just score-band labels plus light UI.
Matchup pages and named cuts are a second wave that compound off the first wave because both rely on the tier and badge vocabulary.
