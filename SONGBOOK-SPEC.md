# SONGBOOK-SPEC.md

The Citizen of Nowhere Songbook. A scoped proposal for a video and music
content track built on the site's two most underused datasets: `public/data/sound/`
and the sports narrative layer.

Status: PROPOSAL. Not in BACKLOG.md yet. Drafted 2026-09-03.
Depends on a decision that contradicts CONTENT.md. See section 9.

---

## 1. The thesis

The interesting thing about the two existing Suno tracks is not that they are
AI songs. It is the conceit: the 1999 NFL season sung as 1999 pop punk, the
1895 rugby schism sung as a period tavern song. The joke has an argument inside
it. The music of a moment is evidence about the moment.

That conceit becomes an engine only when the style is derived from data instead
of guessed. The site already holds the derivation inputs:

| Asset | Path | What it gives the engine |
|---|---|---|
| 2,580 artists, metro-attributed | `sound/artists.json` | Who was making music where |
| Artists by decade and by year, 1958 onward | `sound/artists_by_period.json` | Era-correct reference set |
| 221 metros scored, with `signature_decade` and `distinctiveness` | `sound/metros.json` | Which cities have a strong musical identity, and when |
| Named scenes with era ranges and rosters | `sound/scenes.json` | Motown, and five others |
| Measured audio signature, 314 tracks | `sound/velvet_rock_signature.json` | Real tempo, energy, valence values for prompt construction |
| 68 Grammy ceremonies, full nominee slates | `sound/grammys.json` | Prestige and snub narratives |
| 250 US/UK chart disagreements | `sound/chart_disagreements.json` | Standalone story class |
| Droughts, never-winners, parade droughts | `sports/heartbreak.json` | Song-shaped sports narratives |
| Curated agony events, calibrated in "pangs" | `sports/agony-events.json` | Editorial ranking of what hurts |
| Champions, honours, rivalries, conflicts, Olympics | multiple | Event supply |

The defensible product sits at the intersection, not in either dataset alone.
A song about a team, written in the exact musical idiom of that team's city in
that team's year. Detroit 1968 is a Motown record about the Tigers. Seattle 1995
is a grunge record about the Mariners. Nobody else can generate that pairing at
volume, because nobody else holds both sides keyed to the same metro slug.

**Working name:** Citizen of Nowhere: Songbook. Sub-brand, not a pivot.
Keep the analytical parent brand intact and cross-link.

---

## 2. The four hard constraints

### 2.1 Suno has no public API

As of 2026 Suno operates an invite-only partner programme and no self-serve API.
Third-party "Suno API" resellers exist and they automate the consumer product,
which breaches Suno's terms. Do not build on them.

**Consequence:** the engine automates everything up to the audio step, and a
human pastes the derived style prompt and lyrics into Suno. That is acceptable.
The audio step is 90 seconds of work per song. The expensive parts, story
selection and style derivation and video assembly, are the parts that automate.

**Also required:** commercial ownership of Suno output is gated behind a paid
plan. Confirm the plan on the `adesikan` account before any monetised upload.

### 2.2 YouTube's inauthentic content policy is the business risk

The policy was renamed from "repetitious content" in July 2025 and now explicitly
covers AI audio. Reporting through 2026 puts disqualification or suspension at
roughly 40 percent of pure AI music channels. The flagged pattern is: high upload
cadence, generic titles, identical thumbnails, no narration, no visual change,
low watch time against runtime.

Every one of those is avoidable here, and the avoidance is the same thing that
makes the content good:

- Original visuals bound to real data, not stock loops
- A written human thesis per episode, on screen and in the description
- Chapters on long-form
- Per-episode art, never a template thumbnail with the title swapped

**Non-negotiable:** toggle "Altered or synthetic content" in YouTube Studio on
every upload. Non-disclosure is a standalone violation, and disclosure alone does
not demonetise.

### 2.3 Fully generative video is the wrong architecture

A three-minute music video at five-second clips is about 36 clips. At current
gen-video rates and realistic 2x to 3x iteration waste, that is roughly 50 to 150
USD per video. Estimate, not a quote. It also produces a channel with no visual
consistency, which is the single biggest predictor of a channel failing to
compound.

The Higgsfield balance on this account is 10 credits on the free plan. Any plan
that assumes heavy generative video needs a budget line first.

**Recommendation:** a Remotion composition is the spine, generative video is the
garnish.

- Remotion renders the data scenes: standings tables, ladders, timelines, maps,
  score reveals. These come straight out of `public/data/` and are the exact
  thing that clears the authenticity bar, because they are real and specific.
- A small recurring cast of characters, generated once as a character sheet and
  reused, carries the narrative shots.
- Generative clips are reserved for six to eight hero moments per episode.

This lands the per-episode video cost around 10 to 25 USD, gives the channel a
recognisable look, and reuses the BACKLOG.md position that Remotion is right for
templated short-form and wrong for human-edited long-form. Songbook is templated
short-form. Remotion is correct here.

### 2.4 Intellectual property

- Do not name living artists in Suno style prompts. It breaches Suno's terms and
  creates a takedown vector. The style deriver must emit genre, instrumentation,
  tempo and production descriptors, never "in the style of [artist]". This is a
  further reason the derivation layer should exist rather than hand-prompting.
- Team names and factual results are reportable. Club crests and league logos are
  not. Use team colour palettes and abstracted marks in the animation.
- Retain the Suno generation record, style prompt and seed for every track. AI
  audio draws Content ID false positives and the record is the dispute evidence.

---

## 3. Engine architecture

Six layers. Layers 1, 2 and 5 are the build. Layers 3 and 4 stay human-supervised.

### Layer 1 — Story selection: `scripts/sound/build_songbook_queue.py`

Emits `internal/songbook_queue.json`. Candidate sources already on disk:
`sports/heartbreak.json` (droughts, never-winners, parade droughts),
`sports/agony-events.json`, `champions-history.json`, `honours/*`,
`rivalries.json`, `olympics/*`, the Against Expectation ledger, `conflicts.json`,
and the music-only sources `chart_disagreements.json`,
`uk_december_number_ones.json`, `longest_reigns.json`, `grammys.json`.

Score each candidate on four axes, 1 to 5:

1. **Arc** — does it have a turn? A drought that ends beats a dynasty that continues.
2. **Era clarity** — is it pinned to a single year or a tight window?
3. **Metro musical identity** — read `distinctiveness` and `signature_decade` from
   `sound/metros.json`. A high-distinctiveness metro whose signature decade matches
   the event year is the top of the queue. This axis is the whole product.
4. **Audience** — metro population and league reach.

Rank, then hand-triage in Mission Control, same pattern as the Insight Engine digest.

### Layer 2 — Style derivation: `scripts/sound/derive_style.py`

Input: `(metro_slug, year)`. Output: a style prompt block and a lyrical register note.

Procedure:
- Pull the decade bucket from `artists_by_period.json` for that metro.
- Check `scenes.json` for a named scene covering the metro and year. If present,
  it dominates.
- Map the resulting artist cluster to genre and instrumentation descriptors via a
  hand-maintained lookup. Do not emit artist names.
- Take tempo, energy and valence bands from `velvet_rock_signature.json` where the
  track set overlaps, otherwise from a per-decade table.
- Emit: genre, instrumentation, production era, tempo range, vocal treatment,
  and a two-line register note for the lyricist.

This file is the moat. Everything else is assembly.

### Layer 3 — Lyrics

Prompt template plus a factual payload extracted from the data, so the lyrics are
verifiably accurate. Constraints in the template: verse and chorus structure, two
named facts per verse, one narrative turn, no invented scores or dates. Always a
human edit pass. Do not delegate this to a local model. It is nuanced work and the
failure mode is silent.

### Layer 4 — Audio

Manual in Suno on a commercial plan. Log to `internal/songbook_ledger.json`:
slug, metro, year, style prompt, lyrics hash, Suno URL, seed, date, plan tier.

### Layer 5 — Video: `remotion/songbook/`

One composition, three scene types, two output sizes from a single render.

- **Scene A, data reveal.** Table, ladder, timeline or map, animated in sync with
  the bar. Pulled live from `public/data/`.
- **Scene B, character.** Recurring cast, generated once as a character sheet and
  reused across episodes.
- **Scene C, hero.** Generative clip, six to eight per episode.

Render 9:16 for Shorts, Reels and TikTok. Render 16:9 for the long-form cut.

### Layer 6 — Publish and measure

Reuse the CONTENT.md discipline exactly: UTM tagging on every URL, GA4 conversion
event, canonical destination link to the relevant metro or team page in every
description. The song is the hook. The site is the destination. If a video does
not drive a metro page visit, it did not work, regardless of view count.

---

## 4. Format and cadence

A three-minute song is a weak YouTube long-form product. Low retention structure,
low RPM. Split the output:

| Unit | Length | Frequency | Role |
|---|---|---|---|
| Songbook Short | 45 to 75 sec | 2 per week | One verse and chorus, ending on a data reveal. Discovery. |
| Full track | 2.5 to 3.5 min | 1 per fortnight | The song, full video. The artefact. |
| "The Season, Sung" | 8 to 12 min | 1 per month | Four or five tracks stitched with narrated data interstitials and chapters. |

The monthly long-form is the important one. It carries human narration, original
visuals, chapters and a thesis. It is the piece that clears the authenticity bar
comfortably, earns the higher RPM band, and gives the Shorts somewhere to funnel.

One song yields three Shorts. Weekly song production on top of a weekly Substack
is not sustainable. Do not attempt it.

---

## 5. Cost model

All figures are estimates and should be replaced with actuals after the pilot.

| Line | Per episode | Notes |
|---|---|---|
| Suno subscription | amortised | Confirm tier for commercial rights |
| Generative video, 6 to 8 hero clips | 8 to 20 USD | Higgsfield currently free tier, 10 credits. Needs a budget line. |
| Character sheet | one-off | Amortised across the whole channel |
| Remotion render | near zero | Compute only |
| Human time | 4 to 6 hours | Lyric editing and video assembly dominate |

Human time is the real constraint, not spend. Budget the pilot in hours.

---

## 6. Pilot: six weeks, then a gate

| Week | Work |
|---|---|
| 1 | `build_songbook_queue.py` and `derive_style.py`. Rank and pick six stories. |
| 2 | Remotion template v1, three scene types. Character sheet generated once. |
| 3 to 4 | Produce three tracks end to end. |
| 5 | Ship six Shorts and one long-form cut. |
| 6 | Read the gate. |

**Gate.** Inherit the existing vertical-video gate in BACKLOG.md, and add one
condition that matters more than either:

1. Any single video clears 100K views, **or** the channel adds 500 organic followers, **and**
2. At least one video drives measurable UTM traffic to a metro or team page.

Condition 2 is the one that decides whether this is a content engine for the
project or a separate hobby. If songs get views and nobody clicks through, the
Songbook is not serving the site and should be judged on its own economics.

---

## 7. Ten candidate episodes

Drawn from data already on disk. Ranked by the Layer 1 criteria.

1. **Seattle 1995.** The Mariners' run that kept baseball in the city, sung as
   grunge. Highest-scoring candidate on every axis. The format's thesis in one
   episode. Make this the pilot.
2. **Detroit 1968.** Tigers win the World Series a year after the city burned,
   sung as Motown. `scenes.json` covers the scene, era 1961 to 1975.
3. **New Orleans 2006.** The Superdome reopens, sung as brass band and second line.
4. **Manchester 1999.** The treble, sung in the city's own late-90s idiom.
5. **Liverpool 1977.** Rome, sung Merseyside.
6. **The Never Winners.** From `heartbreak.json`. A lament, country or blues,
   naming the longest droughts still running. Recurring format, annual refresh.
7. **Number One Nowhere.** From `chart_disagreements.json`. A record that topped
   one chart and died on the other. Music-only episode class.
8. **The Christmas Number One.** From `uk_december_number_ones.json`. Panto register.
   Seasonal, and the most obviously shareable thing in the whole queue.
9. **1895.** Already produced. Recut to the new template as the format's origin story.
10. **1999 NFL.** Already produced. Same treatment.

Items 9 and 10 give the channel a back catalogue on day one. Launch with the two
existing tracks recut, plus Seattle 1995 as the new flagship.

---

## 8. Sound identity

`velvet_rock_signature.json` holds a measured signature across 314 tracks:
danceability 0.638, energy 0.538, with standard deviations. Velvet Rock is an
invented genre with a real audio fingerprint, and it is already a Citizen of
Nowhere asset with a podcast cover and a studio map in the repo.

Use it as the channel's house sound for modern-era episodes and for the interstitial
beds in "The Season, Sung". It gives the channel a sonic signature that is
genuinely proprietary, and it makes the Songbook a distribution surface for a
concept the project already owns.

---

## 9. This contradicts CONTENT.md

CONTENT.md deprioritises TikTok and Reels "until proven stories exist to repurpose"
and gates YouTube long-form behind the 90-day validation experiment. BACKLOG.md
line 1064 says to treat the YouTube section as a planning artifact, not an active
backlog, until the gate clears.

That reasoning was sound and it still is, for the format it was written about.
It was written about repurposing Substack analysis into video. This is a different
product with a different audience and a much lower production cost per unit,
because the visuals are generated from data the site already renders.

**Recommendation:** do not overturn CONTENT.md. Slot the Songbook in as a bounded
pilot alongside the existing vertical-video pilot, with the gate in section 6, and
leave the YouTube long-form Phase 2 gate untouched. If the Songbook pilot clears,
it becomes the evidence that unlocks Phase 2 rather than an argument for skipping it.

Do not touch the permanent X exclusion.

---

## 10. Open decisions

1. Suno plan tier on the `adesikan` account, and whether commercial rights are covered.
2. Video budget line. Higgsfield free tier will not carry a pilot.
3. Channel naming and handle. Sub-brand under Citizen of Nowhere, or separate.
4. Whether the character cast is a cast at all, or whether the channel is purely
   typographic and data-driven with no characters. The second option is cheaper,
   more consistent, and arguably more on-brand for a project whose voice is
   "thoughtful and slightly erudite".

---

## 11. Reconciliation with Hermes's scope (2026-09-03)

Hermes produced an independent scope the same day. Story selection and the
data-supply argument are strong and are folded in. Four corrections, verified this
session, and two disagreements.

### Corrections

**11.1 "Suno's API is straightforward" is wrong.** Suno operates an invite-only
partner programme and no public self-serve API as of 2026. No API keys, no public
docs, no usage billing, no webhooks. Third-party "Suno API" resellers automate the
consumer product and breach Suno's terms. Hermes's Stage 4 cannot be automated and
the claim "I can scope the song pipeline end to end" rests on this error. The audio
step is manual. This is not fatal, it is 90 seconds per song, but it must not be
planned around.

**11.2 Suno pricing.** Verified from suno.com/pricing, 2026-09-03:

| Plan | Price | Credits/mo | Songs | Commercial rights |
|---|---|---|---|---|
| Free | 0 | 50/day | ~10/day | **No** |
| Pro | 8 USD | 2,500 | up to 500 | Yes |
| Premier | 24 USD | 10,000 | up to 2,000 | Yes |

Hermes quoted 10 USD, 2,500 credits and 250 songs. Price and song count are both off.
The material point is the last column: **free-tier output carries no commercial
rights.** If the two existing prototypes were made on the free tier they cannot be
monetised as they stand. Confirm the tier on `adesikan` before any upload.

**11.3 Higgsfield needs no research. It is a connected MCP server on this account.**
Checked directly. It exposes Seedance 2.5 and 2.0, Grok Video 1.5, MiniMax H3 Max,
Gemini Omni Flash 1.1 and Wan 3.0. All accept image references, several are tagged
for consistent identity, and all render both 16:9 and 9:16. **Character consistency
is a solved capability, not an open question.**

The constraint is budget, not capability: the account is on the free plan with 10
credits. Do not spend cycles on a Kaiber / Runway / Pika comparison. Buy credits on
the tool already wired in, or do not do generative video.

**11.4 Champions history row count confirmed.** 6,813 rows, first row 1930 FIFA
World Cup, fields include `metroSlug`, `date`, `scope`, `tier`. The `metroSlug` field
is what joins this to the sound layer. Hermes's supply argument holds.

### Disagreements

**11.5 Three songs across three domains is the wrong pilot.** Hermes proposes one
sport, one music, one film episode. Three formats is three promises and no channel
identity. A channel compounds on a repeatable promise. Prove one format three times,
then branch. The format to prove is the sports-in-its-city's-idiom one, because it is
the only one that needs both datasets.

**11.6 Hermes's Stage 1 gives away the moat.** Hermes calls topic and genre selection
"the one step that needs human judgement" and pipelines the rest. Genre selection is
not the human step, it is the product. Hand-picked genre is national-idiom mapping:
Brazil 1970 as samba, Pakistan 1992 as qawwali. Those are good picks and any competent
writer could make them. They do not need this site.

Derived genre is different. Seattle 1995 as grunge is defensible because
`sound/metros.json` records Seattle's `signature_decade` and `distinctiveness`.
Detroit 1968 as Motown is defensible because `scenes.json` holds the scene with its
era range. That join, on `metroSlug`, is the thing nobody else can run at volume.

Keep human judgement at the shortlist and the lyric. Derive the genre. See Layer 2.

---

## 12. Decisions taken, and three corrections from first contact with the data (2026-09-03)

### Decisions (Ashwin)
- **Sequencing:** paired with the Substack relaunch. Song and post ship together.
  The Substack relaunch itself needs its own scoping session; there is a large
  backlog of shipped features to announce since 1 July.
- **Video:** data-scene spine, generative garnish. Not full generative animation.
- **Suno tier: FREE.** No commercial rights on anything generated to date.

### 12.1 `signature_decade` is the wrong derivation key. I over-claimed.

Section 11.6 argued Seattle 1995 as grunge is defensible because
`sound/metros.json` records Seattle's `signature_decade`. It records **1950s**.
Checked, not assumed:

| Metro | `signature_decade` | Peak decade by `by_decade.combined` | `distinctiveness` |
|---|---|---|---|
| Seattle | 1950s | 1990s (11.0) | 3.66 |
| Detroit | 1960s | 1960s (105.2) | 1.81 |
| Manchester | 2020s | 1960s (30.8) | 2.02 |
| New Orleans | 1950s | 2000s (31.9) | 3.86 |

`signature_decade` appears to measure distinctiveness against the global
per-decade average, not output. It is useful for a different question. Peak
`by_decade.combined` is better but still misfires: Manchester peaks 1960s on chart
weight, which is true and useless for a 1999 song.

**The key that works is neither.** Filter `artists_by_period.json` `decades[<event
decade>]` by `metro_slug`. Take the event's own decade, not the metro's best one.
Verified output:

- **Seattle, 1990s** → Sir Mix-a-Lot, Pearl Jam, Heart, Nirvana
- **Detroit, 1960s** → The Supremes, The Temptations, Stevie Wonder, Aretha Franklin,
  Four Tops, Martha and the Vandellas, Mary Wells, Jackie Wilson
- **Manchester, 1990s** → Take That, Oasis, Lisa Stansfield, M People
- **New Orleans, 2000s** → Britney Spears, Lil Wayne, Mystikal, Lil' Romeo, Juvenile,
  Soulja Slim

`derive_style.py` keys on (metro_slug, event decade) against `artists_by_period.json`,
with `scenes.json` as an override where a named scene covers the year. `distinctiveness`
becomes a **shortlist score**, not a style input: it ranks which metros are worth a
song at all. Seattle 3.66 and New Orleans 3.86 are strong candidates for that reason.

### 12.2 The derivation beats the human guess. This is the proof the moat is real.

Section 7 proposed New Orleans 2006 as brass band and second line. The chart data
says New Orleans in the 2000s is Cash Money and bounce: Lil Wayne, Juvenile, Mystikal,
Soulja Slim. **The Saints' return to the Superdome should be a bounce record, not a
second-line record.** Brass band is the tourist answer. Bounce is what the city was
actually making that decade, and it is the better song.

That is the whole argument for Layer 2 in one example. Hand-picked genre gives you the
postcard. Derived genre gives you the city.

### 12.3 The video pipeline already exists. Do not build Remotion.

`scripts/reel/build_reel.py` (347 lines, committed 2026-09-02) is already a vertical
1080x1920 assembler: Playwright screenshots of live site pages as segments, Ken Burns
push, PNG caption overlays, ElevenLabs narration and music bed, ffmpeg concat and mix.
`scripts/reel/README.md` documents the step-wise re-runnable CLI and the gotchas,
including that this ffmpeg build has neither `drawtext` nor `subtitles`.

This is the data-scene spine, already working, in Python rather than Remotion.

**Revised Layer 5:** extend `build_reel.py` rather than starting a Remotion app.
Changes needed:
1. Replace the ElevenLabs `narrate` and `music` steps with a Suno track input, and
   key the segment list to song timestamps instead of word counts.
2. Add a 16:9 output alongside 1080x1920.
3. Add an optional generative-clip segment type that takes a Higgsfield asset instead
   of a Playwright screenshot.

Everything else, including the caption workaround and the re-runnable step structure,
carries over. This is materially less work than the Remotion plan in Layer 5 and it
reuses tested code.

Its README rule applies to the Songbook too, and doubly so for lyrics: **check every
number against the rendered page, not the release note.**

### 12.4 The Substack number

1,899 commits to this repo since 1 July 2026. Zero Substack posts in the same window.
That is the case for the pairing decision, and the input to the relaunch session.
