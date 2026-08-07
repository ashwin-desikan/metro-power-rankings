> **SHIPPED. Frozen 2026-08-07 as a design record.** Cited by `lib/quiz.ts:9` as the freshness-model rationale; consumed and superseded by working code. See `docs/scoping/daily_quiz_layer.md` for the queue-ran-dry note.

# Quiz factoid samples — six question modes

Hand-built sample question + reveal-card output for each of the six question modes documented in `daily_quiz_layer.md`. Drafted 2026-05-09 from real data in `public/data/metros.json` and `public/data/details/*.json`. Awaiting Ashwin signoff on format before the templated generator is written.

Each mode demonstrates the templating pattern the generator will reproduce. Where the prose composes from structured data, the data source is annotated in `[brackets]`. Where the prose paraphrases an existing field (Top Teams rationale, badge longDesc), the field is named.

---

## Reveal-card layout (common to all modes)

```
┌─────────────────────────────────────────────────────┐
│  [Metro name], [Country]                            │
│  [Tier badge]    Composite [score]    Pop [pop]     │
│                                                     │
│  [16-dimension breakdown chart, hook dim highlit]   │
│                                                     │
│  [Templated factoid, 1-3 sentences]                 │
│                                                     │
│  Adjacent metros within 400 km:                     │
│  · [adj 1] (composite X.X)                          │
│  · [adj 2] (composite X.X)                          │
│  · [adj 3] (composite X.X)                          │
│                                                     │
│  [View full ranking →]   [Share day result]         │
└─────────────────────────────────────────────────────┘
```

The factoid is composed deterministically from the dataset using a per-mode template. Sentence 1 anchors tier and 1-2 strongest dimension ranks. Sentence 2 names 2-3 entities that carry the metro's profile (universities, teams, corporates, cultural assets). Sentence 3, when included, surfaces a comparison or badge fact.

---

## Mode 1: Pure pinpoint

**Multiplier slot:** Q1 (×1) — early-round, calibration question.

**Clue shown to player:** "Where is Bilbao?"

**Answer:** `bilbao` (43.26°N, -2.93°W)

**Reveal card:**

> **Bilbao, Spain.** Regional Hub (composite 17.0). Population 1.19M.
>
> Strongest dimension is corporate market cap, anchored by [Iberdrola, $158B `[details.marketCap.top12[0]]`]. The Athletic Club football tradition and two 3-Star Michelin restaurants [`[details.luxury filtered to 3-Star]`] carry the cultural profile alongside 42 metro stations and the Bizkaia Arena. Basque-language metro with sub-country administrative depth.
>
> *Adjacent within 400 km:*
> · Eibar (composite 1.3)
> · Vitoria-Gasteiz (composite 3.9)
> · Santander (composite 3.3)

**Generator inputs:** `metros.json[bilbao]`, `details/bilbao.json`, haversine top-3 within 400 km.

---

## Mode 2: Dimension capital

**Multiplier slot:** Q4 (×3) — late-round, harder.

**Clue shown to player:** "This metro ranks #4 globally on cultural events."

**Answer:** `brussels` (50.85°N, 4.35°E)

**Reveal card:**

> **Brussels, Belgium.** Continental City (composite 50.5). Population 2.88M.
>
> Ranked #4 globally on cultural events `[details.dimRanks.culturalEvents]`, behind Paris, Tokyo, and Berlin `[generator: top-3 on same dim]`. Also T-11 globally on intercity train hubs and T-23 on museums and landmarks. KU Leuven `[details.universities[0]]` (#105 global) and Anheuser-Busch InBev HQ `[details.marketCap.top12[0]]` ($146B) carry the institutional profile. GaWC class 3 `[details.metro.gawcClass]`, the EU diplomatic anchor.
>
> *Adjacent within 400 km:*
> · Mechelen (composite 1.1)
> · Aalst (composite 1.4)
> · Antwerp (composite 19.4)

**Generator inputs:** `metros.json[brussels]`, `details/brussels.json`, top-N lookup by dim, haversine top-3 within 400 km.

---

## Mode 3: Tier reveal

**Multiplier slot:** Q3 (×2) — mid-round.

**Clue shown to player:** "This metro is the second-ranked metro in the United Kingdom, after London."

**Answer:** `edinburgh` (55.95°N, -3.19°W)

**Reveal card:**

> **Edinburgh, United Kingdom.** Major Metro (composite 26.5). Population 888K.
>
> #2 in the UK after London `[generator: rank within country]`. Strongest dimensions: T-32 globally on cultural events (Edinburgh Festival Fringe `[details.events]`), T-34 on museums and landmarks, T-51 on universities (anchored by University of Edinburgh `[details.universities[0]]`). Lloyds Banking Group HQ `[details.marketCap.top12[0]]` ($78B). Three Michelin-starred restaurants. Carries the Cosmopolitan Capital badge `[lib/badges.ts buildBadgesByMetroIndex]`.
>
> *Adjacent within 400 km:*
> · Falkirk (composite 1.3)
> · St. Andrews (composite 3.2)
> · Perth Scotland (composite 1.3)

**Generator inputs:** `metros.json[edinburgh]`, `details/edinburgh.json`, country-rank lookup, badges-by-metro index, haversine.

---

## Mode 4: Top Teams

**Multiplier slot:** Q4 (×3) — late-round.

**Clue shown to player:** "The dominant football presence in this metro spans Old Trafford and the Etihad."

**Answer:** `manchester` (53.48°N, -2.24°W)

**Reveal card:**

> **Manchester, United Kingdom.** Major Metro (composite 35.2). Population 3.09M.
>
> Manchester United and Manchester City both anchor a Tier 1 football presence; the metro carries the Sports Mecca badge with T-7 globally on total teams across all sports `[details.dimRanks.totalTeams]` and T-17 on major league teams. Old Trafford and the Etihad sit roughly 6 km apart inside the same labor market. University of Manchester (#53 global `[details.universities[0]]`) anchors the academic side.
>
> *Adjacent within 400 km:*
> · Blackburn-Burnley (composite 1.8)
> · Preston (composite 0.9)
> · Liverpool (composite 23.6)

**Generator inputs:** `metros.json[manchester]`, `details/manchester.json` (specifically the football and teams arrays plus dimRanks), badges-by-metro for Sports Mecca confirmation, haversine.

**Note:** for the Top Teams mode the factoid can pull the existing `rationale` field from the Top Teams asset where one exists. The generator's job is to detect when a contested-call rationale exists and prefer it over the templated factoid.

---

## Mode 5: Badge holder

**Multiplier slot:** Q3 (×2) — mid-round.

**Clue shown to player:** "This metro carries the Greying Power badge — once forged by industry, now in its second civic act."

**Answer:** `pittsburgh` (40.44°N, -79.99°W)

**Reveal card:**

> **Pittsburgh, United States.** Major Metro (composite 32.9). Population ~2.4M.
>
> One of 24 metros in the Greying Power badge `[lib/badges.ts greying-power CSV]`: cities once forged by industry whose population has flattened or reversed. Pittsburgh's headline composite reflects the post-US Steel rebuild: Carnegie Mellon, University of Pittsburgh, and UPMC anchor the medical-and-research economy that replaced the steel base `[details.universities, details.culture[Hospital]]`. Detroit, Cleveland, and Buffalo are the closest peer cases on the badge `[badges-by-metro index lookup, filter to Greying Power]`.
>
> *Adjacent within 400 km:*
> · Wheeling (composite 0.8)
> · Morgantown (composite 1.3)
> · Youngstown (composite 1.5)

**Generator inputs:** `metros.json[pittsburgh]`, `details/pittsburgh.json`, badges-by-metro for Greying Power membership, peer-case lookup within same badge, haversine.

---

## Mode 6: Conurbation member

**Multiplier slot:** Q5 (×3) — final-round, hardest.

**Clue shown to player:** "This metro anchors a Tier A conurbation cluster spanning the Canadian-US border, including Hamilton, Kitchener-Waterloo, Buffalo, and St. Catharines-Niagara."

**Answer:** `toronto` (43.65°N, -79.38°W)

**Reveal card:**

> **Toronto, Canada.** Continental City (composite 71.5). Population 7.67M.
>
> Anchors a 5-metro Tier A conurbation `[conurbations.csv c004, cluster_score_sum 100.1]` spanning the Canadian-US border. Toronto carries top-20 dimension ranks on companies (T-17), market cap (#18), university research (T-19), and skyscrapers (#16) `[details.dimRanks]`. Royal Bank of Canada `[details.marketCap.top12[0]]` ($250B) anchors the corporate base; the cluster's cross-border component (Buffalo) adds 3.4M to the regional labor market `[conurbations.csv member-list expansion]`.
>
> *Adjacent within 400 km:*
> · St. Catharines-Niagara (composite 3.3)
> · Hamilton (composite 6.2)
> · Kitchener-Waterloo (composite 6.5)

**Generator inputs:** `metros.json[toronto]`, `details/toronto.json`, `conurbations.csv` cluster lookup, member expansion, haversine.

---

## Freshness model: how questions stay in sync with the data

The data flow is: you edit `MetroAreas.xlsx`, the ETL regenerates `public/data/`, Vercel redeploys. Question content has three different refresh policies because three different things can go stale at different rates.

### The three-level freshness model

**Level 1: Answer slug — locked when issue freezes (T-1 day before play).**

The answer slug for an issue locks 24 hours before the issue goes live. After lock, the leaderboard for that issue measures the same answer for every player. Each ETL run re-validates locked slugs against the current corpus. If a locked slug has disappeared from `metros.json` (rare), the question regenerates and a warning is logged.

**Level 2: Clue text — templated to use tier-bands, re-rendered live.**

The clue text uses durable tier-bands rather than specific ranks. "This metro ranks top-10 globally on cultural events" instead of "ranks #4." Tier-band clues stay true through small rank shifts; specific-rank clues do not. The clue is composed at render time from current data, so even the band ("top-10," "top-50," "top-200") reflects today's truth.

If a metro genuinely falls out of its tier band between freeze and play (e.g., it slips from #9 to #11 on cultural events, exiting top-10), the issue regenerates on the next forward-queue tick. In practice this is rare because ETL runs are batch and most metros do not move 2+ ranks per refresh.

**Level 3: Reveal-card factoid — fully composed at render time, never frozen.**

The factoid prose pulls from current `metros.json`, `details/*.json`, badge registry, and `conurbations.csv` on every page load. Composite, tier badge, dimension ranks, market cap, university rankings, badge eligibility, conurbation membership, adjacent metros — all live. If Iberdrola's market cap shifts from $158B to $172B, the Bilbao reveal card shows $172B without any code change.

### Regeneration triggers

| Trigger | What regenerates |
|---|---|
| Every ETL run (`sync_source_xlsx.py` + `extract.py`) | Forward-queue slots not yet locked. The generator re-runs against the freshly written `public/data/`. |
| Daily cron at 23:00 UTC | Freezes the next day's issue (locks the answer slug). Clue and factoid remain live-rendered. |
| New badge ships in `lib/badges.ts` | Forward queue regenerates on next scheduled tick (badge-holder mode questions might shift). |
| Conurbation rebuild | Forward queue regenerates on next scheduled tick (conurbation-member mode questions might shift). |

### Why locked answer slugs matter for leaderboard integrity

Without locked answer slugs, two players answering "Issue #042 Q3" at different points in the same day could be measuring different metros. The leaderboard becomes meaningless. Locking the slug at T-1 ensures every player on play day gets the same five answers. The clue and factoid wrappers stay live because they are display-only; only the slug + correct lat/long are leaderboard-relevant.

### What this rules out

The original spec implied a "build the queue once, run forever" model. The corrected model is "regenerate forward queue every ETL, freeze T-1, render live at play time." Three implications:

- The factoid in `quiz_queue.json` is not stored. The queue stores `answerSlug`, `mode`, `multiplier`, `hookDimension`, `clueTemplate`, `lockedAt`. The reveal card composes everything else at render time. Smaller queue file, no staleness possible.
- The clue text is templated, not stored verbatim. Storing `clueTemplate: "dimension-capital:culturalEvents:top-10"` lets the render pipeline produce "This metro ranks top-10 globally on cultural events" with current rank data each time. If the dataset shifts the metro out of top-10, the renderer flags the question for regeneration.
- The /play archive replay mode shows historical issues with their locked answer slugs but rendered against current data. If you want a "data as it was" view, that requires the historical-snapshots feature (separate backlog item), not the quiz queue.

### Edge cases to guard

- **Metro disappears from corpus.** Validation step on each ETL: every locked slug must resolve to a real `metros.json` entry. If not, regenerate that question and email-alert.
- **Tier-band clue becomes false.** Renderer checks band membership at render time; if the metro is no longer in band, the question is flagged. If the issue has not yet played, regenerate. If the issue is live, fall back to a softer clue ("This metro ranks among the top-100 globally on cultural events") and log the slip for review.
- **Adjacent metros change.** Adjacents always pull live; no special handling needed.
- **Badge or conurbation membership changes.** Renderer checks at render time; same flagging logic as tier-band.

---

## What the generator will do programmatically

For each of the six modes, the generator function takes a metro slug, queries the data sources, applies the per-mode template, and emits a structured JSON record. The queue stores **only the load-bearing fields** (answer slug, mode, multiplier, clue template, lockedAt timestamp). All display fields (factoid, tier badge, adjacents, dimension chart, current ranks) are composed at render time from current data.

```json
{
  "issue": 42,
  "date": "2026-06-20",
  "questions": [
    {
      "mode": "pinpoint",
      "multiplier": 1,
      "answerSlug": "bilbao",
      "clueTemplate": "pinpoint",
      "hookDimension": "marketCap",
      "lockedAt": "2026-06-19T23:00:00Z"
    },
    {
      "mode": "dimension-capital",
      "multiplier": 3,
      "answerSlug": "brussels",
      "clueTemplate": "dimension-capital",
      "hookDimension": "culturalEvents",
      "tierBand": "top-10",
      "lockedAt": "2026-06-19T23:00:00Z"
    }
    // ... three more
  ]
}
```

At render time, the reveal-card component:
1. Reads the question record from the queue
2. Loads `public/data/metros.json[answerSlug]` and `public/data/details/[answerSlug].json`
3. Confirms the question is still valid against current data (tier band still holds, badge membership still holds, conurbation still exists, etc.)
4. If valid, composes clue text and factoid prose from current data
5. If invalid (the slot has not regenerated yet on the latest ETL but the data has shifted), shows a softer fallback clue and logs the slip

The queue file is therefore tiny (~5 KB for 30 days of issues) and contains no display copy. All copy is live.

---

## Open format questions for Ashwin

1. **Factoid length.** Samples above run 2-3 sentences. Is that the right ceiling? Could shrink to 1-2 if the dimension chart is doing the visual work; could expand to 3-4 if readers want more depth before the click-through.

2. **Adjacent metros block.** Always show, or skip when the adjacents are weak (e.g., Pittsburgh's adjacents are all sub-2.0 composite metros which adds little)? Recommendation: always show but cap at 2 entries when the third is weaker than 2.0.

3. **Hook dimension highlight on the chart.** Should the chart show all 16 dimensions every time with the hook one highlighted, or just show the hook dimension as a bar with global rank annotation? The first is more methodology-heavy; the second is faster to read.

4. **Top Teams contested-call factoid override.** When a Top Teams rationale exists, use it verbatim or paraphrase to fit the card length? Recommendation: use verbatim, even if it runs longer — the rationale field is hand-written voice and worth preserving.

5. **Tier-stacked daily question selection.** Q1 should pull from Regional Hub or below; Q5 should pull from Global Capital. Should the per-mode assignment respect this? Specifically, "Pure pinpoint" works at any tier; "Dimension capital" requires top-N which biases toward Global Capital; "Conurbation member" only works for clustered metros which biases toward Tier A and Tier B clusters. The assignment matrix needs to balance multiplier slot × mode tier-availability.

6. **Per-question difficulty signaling.** Beyond the tier-stack, should the clue itself signal difficulty (e.g. "well-known capital" vs "regional anchor city")? GeoSports does not; the clue is the question. Recommendation: do not signal difficulty in the clue text. The multiplier slot already does that.

7. **Freshness model — does the three-level approach work?** Locked answer slug at T-1 (preserves leaderboard integrity), templated clue using tier-bands (durable through small rank shifts), live-rendered factoid (always reflects current data). Tradeoff: an answer locked at T-1 can have its qualifying condition shift between freeze and play; the renderer falls back to a softer clue if the band slips. Alternative: regenerate everything every ETL run including locked slugs, accept that leaderboard for "today" might split if the data shifts mid-day. Recommendation: the three-level approach. Most ETL runs are weekly batch; the freeze window is short.

8. **Clue durability — tier-bands vs specific ranks.** The samples above use specific ranks ("ranks #4 globally on cultural events"). The freshness model recommends tier-bands ("ranks top-10 globally") so small shifts do not invalidate the clue. Tradeoff: tier-band clues are slightly less specific and so less satisfying to read on the reveal. Specific-rank clues are sharper but require regeneration on every shift. Recommendation: tier-bands for the clue, specific ranks in the reveal-card factoid (where they render live anyway). Player sees specific ranks at reveal time, just not in the clue.
### What this rules out

The original spec implied a "build the queue once, run forever" model. The corrected model is "regenerate forward queue every ETL, freeze T-1, render live at play time." Three implications:

- The factoid in `quiz_queue.json` is not stored. The queue stores `answerSlug`, `mode`, `multiplier`, `hookDimension`, `clueTemplate`, `lockedAt`. The reveal card composes everything else at render time. Smaller queue file, no staleness possible.
- The clue text is templated, not stored verbatim. Storing `clueTemplate: "dimension-capital:culturalEvents:top-10"` lets the render pipeline produce "This metro ranks top-10 globally on cultural events" with current rank data each time. If the dataset shifts the metro out of top-10, the renderer flags the question for regeneration.
- The /play archive replay mode shows historical issues with their locked answer slugs but rendered against current data. If you want a "data as it was" view, that requires the historical-snapshots feature (separate backlog item), not the quiz queue.

### Edge cases to guard

- **Metro disappears from corpus.** Validation step on each ETL: every locked slug must resolve to a real `metros.json` entry. If not, regenerate that question and email-alert.
- **Tier-band clue becomes false.** Renderer checks band membership at render time; if the metro is no longer in band, the question is flagged. If the issue has not yet played, regenerate. If the issue is live, fall back to a softer clue ("This metro ranks among the top-100 globally on cultural events") and log the slip for review.
- **Adjacent metros change.** Adjacents always pull live; no special handling needed.
- **Badge or conurbation membership changes.** Renderer checks at render time; same flagging logic as tier-band.

---

## What the generator will do programmatically

For each of the six modes, the generator function takes a metro slug, queries the data sources, applies the per-mode template, and emits a structured JSON record. The queue stores **only the load-bearing fields** (answer slug, mode, multiplier, clue template, lockedAt timestamp). All display fields (factoid, tier badge, adjacents, dimension chart, current ranks) are composed at render time from current data.

```json
{
  "issue": 42,
  "date": "2026-06-20",
  "questions": [
    {
      "mode": "pinpoint",
      "multiplier": 1,
      "answerSlug": "bilbao",
      "clueTemplate": "pinpoint",
      "hookDimension": "marketCap",
      "lockedAt": "2026-06-19T23:00:00Z"
    },
    {
      "mode": "dimension-capital",
      "multiplier": 3,
      "answerSlug": "brussels",
      "clueTemplate": "dimension-capital",
      "hookDimension": "culturalEvents",
      "tierBand": "top-10",
      "lockedAt": "2026-06-19T23:00:00Z"
    }
  ]
}
```

At render time, the reveal-card component:
1. Reads the question record from the queue
2. Loads `public/data/metros.json[answerSlug]` and `public/data/details/[answerSlug].json`
3. Confirms the question is still valid against current data (tier band still holds, badge membership still holds, conurbation still exists)
4. If valid, composes clue text and factoid prose from current data
5. If invalid (the slot has not regenerated yet on the latest ETL but the data has shifted), shows a softer fallback clue and logs the slip

The queue file is therefore tiny (~5 KB for 30 days of issues) and contains no display copy. All copy is live.

---

## Open format questions for Ashwin

1. **Factoid length.** Samples above run 2-3 sentences. Is that the right ceiling? Could shrink to 1-2 if the dimension chart is doing the visual work; could expand to 3-4 if readers want more depth before the click-through.

2. **Adjacent metros block.** Always show, or skip when the adjacents are weak (e.g., Pittsburgh's adjacents are all sub-2.0 composite metros which adds little)? Recommendation: always show but cap at 2 entries when the third is weaker than 2.0.

3. **Hook dimension highlight on the chart.** Should the chart show all 16 dimensions every time with the hook one highlighted, or just show the hook dimension as a bar with global rank annotation? The first is more methodology-heavy; the second is faster to read.

4. **Top Teams contested-call factoid override.** When a Top Teams rationale exists, use it verbatim or paraphrase to fit the card length? Recommendation: use verbatim, even if it runs longer — the rationale field is hand-written voice and worth preserving.

5. **Tier-stacked daily question selection.** Q1 should pull from Regional Hub or below; Q5 should pull from Global Capital. Should the per-mode assignment respect this? Specifically, "Pure pinpoint" works at any tier; "Dimension capital" requires top-N which biases toward Global Capital; "Conurbation member" only works for clustered metros which biases toward Tier A and Tier B clusters. The assignment matrix needs to balance multiplier slot × mode tier-availability.

6. **Per-question difficulty signaling.** Beyond the tier-stack, should the clue itself signal difficulty? GeoSports does not; the clue is the question. Recommendation: do not signal difficulty in the clue text. The multiplier slot already does that.

7. **Freshness model — does the three-level approach work?** Locked answer slug at T-1 (preserves leaderboard integrity), templated clue using tier-bands (durable through small rank shifts), live-rendered factoid (always reflects current data). Tradeoff: an answer locked at T-1 can have its qualifying condition shift between freeze and play; the renderer falls back to a softer clue if the band slips. Alternative: regenerate everything every ETL run including locked slugs, accept that leaderboard for "today" might split if the data shifts mid-day. Recommendation: the three-level approach.

8. **Clue durability — tier-bands vs specific ranks.** The samples above use specific ranks ("ranks #4 globally on cultural events"). The freshness model recommends tier-bands ("ranks top-10 globally") so small shifts do not invalidate the clue. Tradeoff: tier-band clues are slightly less specific and so less satisfying to read on the reveal. Specific-rank clues are sharper but require regeneration on every shift. Recommendation: tier-bands for the clue, specific ranks in the reveal-card factoid (where they render live anyway). Player sees specific ranks at reveal time, just not in the clue.
