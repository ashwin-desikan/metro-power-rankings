# Open backlog

Extracted from the 168 KB gitignored `BACKLOG.md` on 2026-08-07, after an item-by-item
check against the live tree found that a large share of its "open" items had already
shipped. This file is TRACKED, so it can be diffed and reviewed. `BACKLOG.md` is frozen
as the historical record; four source files still cite it by path, which is why it stays
on disk.

Every item below was verified ABSENT from the tree on 2026-08-07. Method and the
shipped/open tallies are in the audit note at the bottom.

## P1 - second wave

### Grounded answer box ("ask the index")
A natural-language input on the home page that resolves a question to a deep link plus a short answer composed only from values already in our JSON. Retrieval-first, never free generation, every answer citing the page it came from. Doubles as the AI/LLM discoverability surface that `llms.txt` and JSON-LD want.
**Verified absent 2026-08-07:** 0 content hits for `Ask the index` anywhere under `app/`; no answer-box component in the `app/` tree. The companion half of this item, "My Metro" personalization, HAS shipped (`app/FollowButton.tsx`, `app/FollowingRail.tsx`, `app/me/page.tsx`, `lib/useFollowing.ts`), so only the answer box remains.
**Priority:** P1

### Conurbation cluster sanity guardrail
A build-time check that flags any auto-cluster whose diameter exceeds 80 km AND halves when one member is removed, i.e. bridge-dependent transitive chains masquerading as real conurbations (the Davos-Vaduz artifact). Output a review list per ETL run so editorial overrides land before publication.
**Verified absent 2026-08-07:** no guardrail script in `scripts/` (`generate-distance-badges.py` builds `conurbations.csv` but carries no diameter or bridge-member test); no diameter-review artifact under `public/data/`.
**Priority:** P1

### Newfoundland metro boundary gap
St. John's, Corner Brook, Grand Falls-Windsor and Mount Pearl have no Overture rows, so three NL metro pages fall back to single-pin "Location" maps. Pull boundary GeoJSON from Statistics Canada Census Subdivisions and drop it in; the render layer picks it up automatically.
**Verified absent 2026-08-07:** file search in `public/data/metro-boundaries/` for `st-johns|corner-brook|grand-falls|mount-pearl` returned 0 matches.
**Priority:** P1

### Global metro boundary gaps (Overture coverage holes)
Residual unrenderable metros after 41-country boundary ETL: Crimea and Sevastopol (Feodosia, Kerch, Simferopol, Yalta, Yevpatoria, tagged UA not RU upstream) and a few India tier-2 cities whose workbook district name differs from Overture's local-language form (Bhilai, Roorkee). Fix is supplemental GeoJSON, or `COUNTY_ALIASES` entries in `scripts/build-metro-boundaries.py`.
**Verified absent 2026-08-07:** file search in `public/data/metro-boundaries/` for `simferopol|bhilai|roorkee` returned 0 matches.
**Priority:** P1

## P2 - small wins and polish

### Historical stadium coordinates for closed-league LeagueMaps
The four closed-league maps plot every franchise at its current-day stadium, so a year filter would show the 1925 Bears at Soldier Field. The filter is fully built (`app/teams/_shared/YearFilterBar.tsx`, `useState<seasonYear>`, year-aware point filter, intl-venue conditional) but the JSX is commented out pending per-year coordinates.
**Verified absent 2026-08-07:** `app/teams/nhl/LeagueMap.tsx:75` and `app/teams/nba/LeagueMap.tsx:120` still carry `{/* Year filter UI temporarily disabled; see NFL LeagueMap note + BACKLOG. */}`. Partial credit: `stadium_history` now exists in `scripts/build-nhl-data.py`, `build-nba-data.py` and `build-mlb-data.py` and renders as an arena-history list on team detail pages, but NOT in `build-nfl-data.py`, and no LeagueMap resolves markers by year.
**Priority:** P2

### Blog as first-class nav
A "Writing" or "Blog" entry in primary nav that either deep-links to Substack or renders the three or four most recent posts with hero images. The Substack writing is doing half the positioning work and is currently invisible from the nav.
**Verified absent 2026-08-07:** no `app/blog` directory in the depth-2 `app/` listing; `app/SiteNav.tsx` and `app/DesktopNav.tsx` carry no blog entry. The data is already there (`lib/substack.ts`, `public/data/substack-feed.json`), only the nav surface is missing.
**Priority:** P2

## Daily quiz layer

The GeoSports-style pinpoint round. Note that a different daily-game shape SHIPPED instead
(`/play/arcade`: Metro Globle, Metro Grid, Sports Grid, day-keyed localStorage, emoji share),
so items below are the parts of the original spec the arcade does not cover.

### Trivia card reveal, the editorial layer
Per-question reveal card showing metro, country, tier badge, the hooked dimension rank, one editorial sentence, and a "View full ranking" CTA into `/rankings/[slug]`. Badge questions surface every badge the metro holds; conurbation questions surface the parent cluster's member list. The CTA is the whole funnel.
**Verified absent 2026-08-07:** no reveal-card component under `app/play/`; `app/play/` contains only `arcade/`, `page.tsx` and `PlayBrowser.tsx`, and the arcade games are static HTML in `public/play/` with no reveal card.
**Priority:** P2

### Public leaderboard
`/play/leaderboard` with the day's top 50 plus the player's own row pinned, 14-day archive, per-day permalinks, and server-side recompute of every submitted score from the original tap coordinates.
**Verified absent 2026-08-07:** no `app/play/leaderboard` directory; 0 leaderboard hits in `public/play/`; no leaderboard API route under `app/api/`.
**Priority:** P2

### Sassy quip layer
About 40 curated per-tap quips conditioned on distance band and continent of the miss, stored in a single JSON and rendered as a small tooltip on the player's pin rather than a full overlay.
**Verified absent 2026-08-07:** no quip JSON under `public/data/`; no quip pool in `public/play/*.html`.
**Priority:** P3

### /play/how-it-works methodology page
The `/methodology` analogue for the game: scoring formula and curve chart, tier vocabulary mapped to score bands, the multiplier ladder visualized, leaderboard and streak rules, and the inline credit to GeoSports and MapTap.
**Verified absent 2026-08-07:** no `app/play/how-it-works` directory in the `app/play/` listing.
**Priority:** P2

### Cross-link the quiz from the rankings, and vice versa
Metro pages surface "featured in today's quiz" when applicable plus a "quiz me on a metro like this" button; primary nav gets a "Daily" entry with a live indicator dot. Without bidirectional links the game never compounds with the rest of the site.
**Verified absent 2026-08-07:** `app/rankings/[slug]/page.tsx` has no quiz block (it does carry the "Most similar" block at line 815); no Daily entry in `app/SiteNav.tsx`.
**Priority:** P2

### Practice arena
`/play/practice` with five round types at launch: Short (5), Medium (10), Long (15), Speed Challenge (5 in 25s), and Picture Clues. Practice feeds XP but not the streak or daily leaderboard, and is where new question generators get a one-week shakedown before entering daily rotation.
**Verified absent 2026-08-07:** no `app/play/practice` directory.
**Priority:** P3

### Themed practice map collections
Per-collection routes at `/play/collection/[slug]`, each with its own leaderboard, seeded from our existing editorial layers: the Power 100, Continental Metros, Capitals, Twin Metros, Frozen Conurbations, per-badge sets, one per major country, one per continent.
**Verified absent 2026-08-07:** no `app/play/collection` directory.
**Priority:** P3

### XP and levels
Per-round XP scaled by mode, levels capped at 50 on an exponential curve, level surfaced on `/me`, on the leaderboard row and in the share string, with cosmetic-only unlocks at milestones.
**Verified absent 2026-08-07:** no XP or level field in `public/data/play/` (which holds only `grid-teams.json`); no XP logic in `public/play/*.html`.
**Priority:** P3

### Adaptive "practice your weak spots"
A daily `/play/personal` route built from each player's five worst-scoring metros over the past 14 days plus five conceptually adjacent metros, with the reveal card naming the prior miss, and spaced-repetition calibration so a recent miss re-tests in 3 to 5 days rather than next day.
**Verified absent 2026-08-07:** no `app/play/personal` directory; no per-player guess log anywhere in the tree.
**Priority:** P3

### Issue-numbered episodic identity
Label each daily round "Issue #N" rather than a bare date, link the number to `/play/archive/[issue]` as a read-only replay, and put the issue number in the share string. Being on issue #687 is itself a credibility signal.
**Verified absent 2026-08-07:** no `app/play/archive` directory. Partial: `scripts/generate_quiz_questions.py` already models the queue as dated issues of five questions, so the numbering exists in data with no route to render it.
**Priority:** P3

### Curated "Best Of" archive
`/play/best-of` with rule-picked or hand-picked rounds (hardest day by median miss, most controversial reveal, best obscure-metro feature), each with a one-sentence editorial blurb, pinned above the chronological list. Monthly editorial pass.
**Verified absent 2026-08-07:** no `app/play/best-of` directory.
**Priority:** P3

### Versus, asynchronous head-to-head
`/play/versus` generates a challenge URL for a given date; up to 8 players over a 24-hour window play the same five questions and get a side-by-side scoreboard. Results post to the player profile, not to the public daily leaderboard.
**Verified absent 2026-08-07:** no `app/play/versus` directory.
**Priority:** P3

### Groups, private leaderboards
`/play/groups` lets any authenticated player create a named group with an invite link and a private daily leaderboard scoped to its members, plus a 14-day archive and a pinnable group message. Free in v1, including one official "Citizen of Nowhere readers" group.
**Verified absent 2026-08-07:** no `app/play/groups` directory.
**Priority:** P3

### Picture Clues mode
A 1200x800 photograph as the prompt instead of text: stadium exterior, skyline, transit hall, civic landmark. About five images per top-200 metro from Wikimedia Commons and Unsplash, with licensing tracked and attribution surfaced on the reveal card.
**Verified absent 2026-08-07:** `public/data/picture-clues-credits.json` does not exist in the `public/data/` listing; no image library for clue prompts.
**Priority:** P3

### Antipode Hunter side mode
`/play/antipode` rotates one metro per day and asks the player to tap its antipode, scoring by distance to the true antipode and revealing both points with the great-circle line wrapping the globe. One-week launch promotion, then a weekly variant.
**Verified absent 2026-08-07:** no `app/play/antipode` directory; 0 antipode references in `public/play/`.
**Priority:** P3

### Onboarding upsell after first strong round
A post-round modal offering a free account with three named benefits (streak persistence across devices, leaderboard appearance, personal stats), triggered only after a complete round, snoozed 7 days on dismiss, email magic link only, with a GA4 conversion event.
**Verified absent 2026-08-07:** no post-round signup modal in `public/play/*.html`; the only auth in the tree is Google sign-in for follows (`app/me/page.tsx`), which is a different flow.
**Priority:** P3

### Settings depth
Non-negotiable launch settings: sound on/off, miles vs kilometers with locale default, confirm-tap mode off by default, high-contrast globe, and UTC vs local time. Persisted in localStorage for guests, in the user record for authenticated players.
**Verified absent 2026-08-07:** no settings panel or preferences store under `app/play/` or `public/play/`.
**Priority:** P3

### Practice-day variants tied to editorial cadence
A weekly variant calendar (Top Teams Tuesday, Picture Clues Thursday, Speed Challenge Friday, region-locked Saturday, badge-themed Sunday), each shipping its own opengraph card so the Substack and LinkedIn linkbacks look distinct, with the calendar published on `/play/how-it-works`.
**Verified absent 2026-08-07:** no variant calendar in `scripts/generate_quiz_questions.py` (the generator produces one uniform tier-stacked issue per day); no per-variant OG route under `app/`.
**Priority:** P3

### Game-mode variants
Sport-specific days, region-locked days, a hard-mode toggle moving the difficulty floor from top-100 to top-1000, and a Top Teams Only mode, each with its own sub-leaderboard and shareable result string.
**Verified absent 2026-08-07:** the six generator modes in `scripts/generate_quiz_questions.py` mix within a single daily issue; no mode-locked variant, no hard-mode flag, no sub-leaderboard.
**Priority:** P3

### Inspiration credit for GeoSports and MapTap
`/about`'s colophon should name GeoSports (Frank Michael Smith) and MapTap alongside isitaderby.co.uk, and `/play/how-it-works` should carry its own inline credit. The colophon entry explicitly deferred this until the daily quiz layer shipped; the arcade has now shipped, so the condition is met.
**Verified absent 2026-08-07:** `app/about/page.tsx` credits isitaderby.co.uk only; no GeoSports or MapTap mention anywhere under `app/`.
**Priority:** P2

## Content engine

### Substack asset bundler
A per-post "build asset bundle" action inside Mission Control that takes the featured metros and dimensions and emits a zip of OG card PNGs, the comparison OG PNG, a CSV of the underlying table, and the primary chart at 2400x1200, plus markdown attribution text. Asset-only; the article text is never generated.
**Verified absent 2026-08-07:** `app/api/admin/` contains only `login`, `logout` and `queue/{add,update,delete}` routes; no bundle route, no bundler in `scripts/`.
**Priority:** P2

### Article series: Transplanted Cities
Six Substack pieces on 20th century metros whose populations were swapped wholesale while the architectural shell stayed: Wroclaw, Smyrna/Izmir, Thessaloniki, Harbin, Kaliningrad, Memel/Klaipeda. Each piece anchors to a metro detail page and its Wikidata QID. Zero new data ingestion.
**Verified absent 2026-08-07:** `docs/series_transplanted_cities.md` does not exist in the `docs/` listing.
**Priority:** P2

### GeoSport-style thinkpiece program
The framing document that welds the existing assets into one editorial voice: three permitted analytical lenses, vocabulary discipline (every piece foregrounds a branded term and links its badge or methodology anchor), format rules, and the bidirectional crosslink loop.
**Verified absent 2026-08-07:** `docs/editorial_program.md` does not exist in the `docs/` listing.
**Priority:** P2

### Standing series: The Metro Brief
The news-pegged workhorse format, 800 to 1,000 words, two per month: one news peg in the lede, one ranking or badge in paragraph two, one chart, one opinionated takeaway. Needs a series header, an OG template, a Substack section tag, and a per-piece template.
**Verified absent 2026-08-07:** no `docs/templates/` directory at all, so `docs/templates/metro_brief.md` is absent.
**Priority:** P2

### Standing series: Five Scenarios for X
The most copyable format in the reference playbook: 1,500 to 2,000 words, quarterly, five named scenarios of 200 to 300 words each, each tied to specific metros, each given a memorable noun phrase so later Metro Briefs can cite it as shorthand.
**Verified absent 2026-08-07:** `docs/templates/five_scenarios.md` absent (no `docs/templates/` directory).
**Priority:** P2

### Standing series: Field Notes from the Index
The series that puts the dataset in the foreground: 1,200 to 1,800 words, monthly, opening on a badge definition and methodology anchor, profiling three to five exemplar metros, closing on what the badge actually predicts. Bidirectional crosslink is mandatory here.
**Verified absent 2026-08-07:** `docs/templates/field_notes.md` absent (no `docs/templates/` directory).
**Priority:** P2

### Inaugural thinkpiece slate, piece 1
"Five Scenarios for the 2036 Olympic Host Cycle", pegged to the Brisbane 2032 prep cycle and the 2036 bidding window, evaluating Riyadh, Doha, Istanbul, a returning European bid, an Indian bid and Santiago against OEGCI tier, conurbation status and the archetype badges. Pieces 2 and 3 of the slate both shipped in May 2026; this is the only one outstanding. Note that `docs/news_peg_watchlist.md` records the 2036 bidding window as open from Q3 2026, i.e. now.
**Verified absent 2026-08-07:** not drafted per the slate's own status block, and no corresponding file in `Substack Drafts/` or at project root.
**Priority:** P1

### Reusable social visual templates
Three parameterized templates (metro comparison card, ranked-list card, bubble map) exportable at 1:1, 16:9 and 9:16 without manual screenshotting. Either a `/share/[template]/[args]` route via `@vercel/og`, or a static-render script.
**Verified absent 2026-08-07:** no `app/share` directory; `app/api/og/` contains only `compare/route.tsx`; no template renderer in `scripts/`.
**Priority:** P2

### Historical snapshots and diff reporter
ETL archives the prior `public/data/` tree to `public/data/archive/YYYY-MM-DD/` before regenerating, and `scripts/diff_snapshots.py` reports which metros moved most on which dimensions between any two snapshots. Every "what changed and why" piece depends on this.
**Verified absent 2026-08-07:** no `archive/` directory in the `public/data/` listing; `scripts/diff_snapshots.py` does not exist in the `scripts/` listing.
**Priority:** P2

### Substack Notes derivative engine
Three Notes per long post within seven days (teaser, pull-quote, counter-take), plus one Note per week sourced purely from an anomaly digest entry even in weeks with no long-form, plus a restack discipline for adjacent Substacks. `[vague]` - a working habit, not a build, with no artifact to check into the tree.
**Verified absent 2026-08-07:** no Notes queue or derivative template anywhere in `docs/` or `scripts/`; `CONTENT.md` covers cadence but carries no Notes derivative spec.
**Priority:** P2

### Bluesky and Threads supplemental presence
Claim one account on each for namespace protection, cross-post the strongest 30% of LinkedIn and Notes output, and maintain hand-curated 100-account follow lists per platform so either account can be rebuilt if reset.
**Verified absent 2026-08-07:** `docs/social_follow_lists.md` does not exist in the `docs/` listing; no Bluesky or Threads playbook alongside the shipped reddit and linkedin ones.
**Priority:** P3

### TikTok and Reels short-form video pilot
Ten vertical videos at 9:16, 30 to 60 seconds, hook in the first two seconds, built from existing static visuals plus voiceover, posted to both platforms over three weeks. Decision gate: 100K views on any single video or 500 organic followers commits to a sustained cadence.
**Verified absent 2026-08-07:** no video assets or pilot tracker in the tree; no `shorts/` or video output directory.
**Priority:** P3

### 90-day content-engine validation experiment
The measurement framework that turns the YouTube go/no-go from a vibes call into a decision: three theme tracks tested in parallel over 12 weeks, per-piece reach and conversion tracking, a week-13 decision matrix, GA4 funnel wired before week 1.
**Verified absent 2026-08-07:** `experiments/2026-Q3-validation.md` absent; there is no `experiments/` directory at project root at all (it is listed in `.gitignore` but was never created).
**Priority:** P1

## YouTube long-form (Phase 2, conditional)

All twelve items in this track are gated behind the 90-day validation experiment above,
which has not run. None of the planning documents they call for exist: the `docs/` listing
contains no `youtube_*.md` file of any kind. They are listed individually because each is a
separate artifact, but they should be treated as one blocked track.

### Channel positioning and naming
Working channel name candidates, tagline, banner and avatar in the site's visual language, and About copy naming the methodology page and the CC-BY licensing posture up front.
**Verified absent 2026-08-07:** `docs/youtube_channel.md` absent.
**Priority:** P3

### Format choice and production model
Explicit format decision with rejection rationale for the alternatives; recommended primary is animated data-viz at 8 to 12 minutes, voiceover-led, editor outsourced, with a decision gate at episode 4 if the end-to-end timeline slips past 14 days.
**Verified absent 2026-08-07:** `docs/youtube_format.md` absent.
**Priority:** P3

### Voiceover decision
Choose between self-narrated, hired narrator and AI-generated, with an equipment shortlist. Recommendation on file is self-narrated for the first 13 episodes, then reassess.
**Verified absent 2026-08-07:** `docs/youtube_voiceover.md` absent.
**Priority:** P3

### Production tech stack
Scripting, voiceover, NLE, motion graphics, map animation, stock footage, music, thumbnail and asset-management choices pinned in one document so the wrong tool does not lock in 10x slower iteration.
**Verified absent 2026-08-07:** `docs/youtube_stack.md` absent.
**Priority:** P3

### First series: "The Team That Wins the City"
Thirteen-episode arc off the existing Top Teams rationales, London through Adelaide, each with a contested claim, a methodology section, the case for each side, and a verdict with caveats.
**Verified absent 2026-08-07:** `docs/youtube_series_team_that_wins.md` absent.
**Priority:** P3

### Second series: "How a metro earns rank #N"
Thirteen episodes over the top-25 metros, ordered for narrative effect, each walking the dimension contributions visually then deep-diving the two or three dimensions where the metro over- or under-performs.
**Verified absent 2026-08-07:** `docs/youtube_series_how_a_city.md` absent.
**Priority:** P3

### Third series: "Metros that should not exist on this list"
Thirteen shorter, snappier episodes drawn from the anomaly mining output, designed for clip-friendly Shorts derivatives.
**Verified absent 2026-08-07:** `docs/youtube_series_should_not_exist.md` absent.
**Priority:** P3

### Production cadence and decision gates
Weekly for the first 13, then a rotating two-series and later three-series schedule, with named decision gates at episodes 4, 13, 26 and 52 and an explicit pause trigger to avoid the death-march pattern.
**Verified absent 2026-08-07:** no cadence or gate document in `docs/`.
**Priority:** P3

### Shorts strategy
Two to three Shorts per week from episode 1, cut from long-form verdict moments, cross-posted from the vertical pilot, or scripted standalone, with a tested question-shaped title format and an end screen pointing at the related long-form episode.
**Verified absent 2026-08-07:** no Shorts pipeline or output directory in the tree.
**Priority:** P3

### YouTube SEO and metadata discipline
A per-episode checklist covering front-loaded titles, structured descriptions with chapters and links, tag sets, templated 1280x720 thumbnails, end screens, a pinned comment within 30 minutes, and a Wikidata QID cross-reference in every metro episode.
**Verified absent 2026-08-07:** `docs/youtube_seo.md` absent.
**Priority:** P3

### Remotion Shorts factory
A single "DimensionReveal60" template taking a metro slug plus a dimension key and exporting a 1080x1920 vertical MP4, reusing the site's existing React chart components. Explicitly gated behind the validation experiment surfacing proven themes.
**Verified absent 2026-08-07:** no Remotion dependency in `package.json`; no `shorts/` output directory.
**Priority:** P3

### Cross-channel measurement and attribution
A documented UTM schema on every outbound social URL, GA4 dashboards for traffic and conversions by source, a weekly channel-performance digest script, and a quarterly review written into a CHANGELOG-style doc.
**Verified absent 2026-08-07:** `docs/utm_schema.md` absent; `scripts/weekly_engagement.py` absent.
**Priority:** P2

## Automation and freshness

### Pre-season hardcode audit
A scheduled sweep three weeks before each league opener that greps for year-pinned patterns, pulls the opener date, inventories the hardcoded stadium lists in each `LeagueMap.tsx`, and emits a checklist with file:line citations.
**Verified absent 2026-08-07:** `lib/teamMarkers.ts:108` still reads `const CWUR_INDEX_URL = "https://cwur.org/2025.php";`, the exact hardcode the audit exists to catch. No preseason audit workflow in `.github/workflows/`.
**Priority:** P1

### Overture quarterly release watcher
A weekly check against the Overture releases page that files an Issue when a new release ships, so the two boundary entries that say "re-check after each Overture quarterly release" actually get re-checked. Issue auto-closes after the next boundary refresh commit.
**Verified absent 2026-08-07:** no `overture-release-watch.yml` in the 28-file `.github/workflows/` listing.
**Priority:** P2

### News-peg digest
A weekly Sunday-evening reasoning task that fetches `docs/news_peg_watchlist.md`, runs targeted searches per category, and produces a digest of viable pegs ranked by editorial fit and freshness. The watchlist shipped 2026-05-09; reviewing it is still entirely manual and it went 90 days without one.
**Verified absent 2026-08-07:** no digest workflow in `.github/workflows/`; no `news-peg-digest-*.md` output in the tree.
**Priority:** P2

### USPTO new-filing monitor
A monthly check of TSDR or TESS for the exact mark "CITIZEN OF NOWHERE" and reasonable variants, filing an Issue on any new filing with serial number, class, basis and applicant. Deciding whether to act stays with counsel; the Issue is the whole deliverable.
**Verified absent 2026-08-07:** no USPTO or trademark workflow in `.github/workflows/`.
**Priority:** P2

### Wikipedia infobox schema sniff
A monthly job pulling infobox HTML for about ten representative team pages and checking that the expected field labels (Founded, Stadium, Owner, Championships) still appear, filing an Issue when they move. Wikipedia restructures infoboxes silently and our embeds break quietly.
**Verified absent 2026-08-07:** no `wikipedia-infobox-sniff.yml` in the `.github/workflows/` listing.
**Priority:** P3

### Quarterly BACKLOG hygiene pass
A quarterly reasoning task that scans every backlog entry, greps for the corresponding artifacts, and reports both stale SHIPPED markers and open entries that look already-shipped. Does not modify the file; humans make the calls.
**Verified absent 2026-08-07:** no hygiene-pass workflow in `.github/workflows/`. The 2026-08-07 audit that produced this file is the manual version of exactly that job, and the drift it found is the argument for scheduling it.
**Priority:** P3

## Interactive and viral content layer

### Metro Takes generator
A `/takes` route where a reader types a take about any metro and gets it reformatted as a styled adjudication transcript: presiding voice, challenge, ruling, optional dissent in smaller type. PNG export via the existing share-card renderer. No login, takes not stored.
**Verified absent 2026-08-07:** no `app/takes` directory in the depth-2 `app/` listing.
**Priority:** P2

### Metro vs. Metro debate simulator
Two metros picked from autocomplete, a topic either auto-selected from where they diverge most sharply or chosen from a short list, and a four-round alternating exchange with a verdict block, at a shareable `/debate/[metro1]-vs-[metro2]` route with OG metadata. Seed 20 to 30 classic matchups so the page is not blank at launch.
**Verified absent 2026-08-07:** no `app/debate` directory in the depth-2 `app/` listing.
**Priority:** P1

### "Platform Interviews" recurring Substack section
A recurring in-post section formatted as a one-minute street interview with a fictional hyperlocal resident reacting to their metro's placement, ending with the ranking verdict styled as an onscreen graphic. Zero dev work; the deliverable is two written examples that lock the format.
**Verified absent 2026-08-07:** no such section in `CONTENT.md` and no template in `docs/`.
**Priority:** P2

### Podcast cold open format, "The Local Take"
A 60-second TTS monologue from a fictional local of the episode's featured metro, slightly defensive about its ranking, ending on the question the episode resolves. Voice persona varies by metro; the casting memo is worth writing once.
**Verified absent 2026-08-07:** no cold-open template in `docs/`; no podcast script assets in the tree.
**Priority:** P2

### "Hottest Take" leaderboard
Stored user takes with an upvote count, a weekly editorial pull of the top three for a Substack section, and a manual moderation queue before anything reaches the leaderboard. Depends on the Metro Takes generator shipping first.
**Verified absent 2026-08-07:** blocked on `app/takes`, which is absent; no takes store or upvote API under `app/api/`.
**Priority:** P3

### Tier Reaction Cards, "This just in from [Metro]"
On tier-diff detection, auto-generate a one to three sentence in-character civic statement from the metro's perspective using its tier, notable facts, teams and badges, exported as a branded card in the metro's tier colour. Dry, formal register; the joke lands only if it reads like a real press release.
**Verified absent 2026-08-07:** no reaction-card generator in `scripts/`; no tier-diff hook emitting cards; `app/api/og/` holds only the compare route.
**Priority:** P2

### "Officially Overrated" and "Criminally Underrated" editorial cuts
Two annual short-lists naming the metros where the editorial override diverges most from raw score in each direction, published as a dedicated Substack post and cross-linked from the featured metros' pages. Mid-year and end-of-year for calendar rhythm.
**Verified absent 2026-08-07:** no such cut in `app/rankings/` or `app/badges/`; no draft at project root.
**Priority:** P2

### "Wrong. You're Just Wrong." response format
An opt-in secondary output on the Metro Takes generator: a formal three-paragraph rebuttal citing at least two real data points for the metro, ending in a single sentence of withering finality. Never mean about residents, only about the claim.
**Verified absent 2026-08-07:** blocked on `app/takes`, which is absent.
**Priority:** P3

## Fan Geography layer

### "Top in view" viewport-reactive leaderboard
A side panel that recomputes the top teams or metros from whatever is inside the current map viewport, updating on every pan and zoom. Near-zero data cost, works against `all-teams.json` today, drops straight onto the `/sports` map. The cheapest high-value item in this section and the one to ship first.
**Verified absent 2026-08-07:** the only `getBounds()` call under `app/` is in `app/MetroMapInner.tsx:50` and is a fit-bounds use, not a viewport tally. A working prototype exists at `docs/prototypes/fan-map-leaderboard-faceoff.html` but is not wired into any route.
**Priority:** P2

### Map-based face-off (head-to-head) mode
Two team selectors recolour the map by whichever of the pair leads in each metro, grey where neither is present, with a metros-won readout bar and a cross-link from the existing matchup pages. The map version of `/matchups/[slug]`.
**Verified absent 2026-08-07:** no face-off mode in `app/sports/SportsMapInner.tsx` or `SportsMapToggle.tsx`; implemented only against mock data in the prototype above.
**Priority:** P2

### v0 crowdsourced fan-allegiance layer
One league pilot (NFL), region-level not county-level, coarse location only and no PII, collected through a single "help build the map" Substack post. The strategic value is putting revealed preference from real humans next to revealed preference from our model and surfacing where they disagree. We already own the hard part, the Overture polygons.
**Verified absent 2026-08-07:** no submission model, store or API under `app/api/`; no allegiance aggregate in `public/data/`.
**Priority:** P2

## Everynoise-inspired data lenses

### Atlas of Metros, 2D similarity embedding
A scatter where each metro is a point, similar profiles cluster, colour encodes archetype or tier, and points route to `/rankings/[slug]`. Axes must be interpretable (x economic weight, y cultural and amenity weight, built from existing dimension groups) rather than opaque t-SNE or UMAP, so the layout is defensible.
**Verified absent 2026-08-07:** no atlas or scatter route under `app/`. Partial: the similarity vectors already exist (`scripts/build-similar-metros.py`, `public/data/similar-metros.json`, rendered as the "Most similar" block at `app/rankings/[slug]/page.tsx:815`), so only the visualization is missing.
**Priority:** P2

### "Every Metro at Once" global re-sortable similarity explorer
A single page listing every metro where clicking one re-sorts all the others by similarity to it, with region and continent scope toggles. We shipped the per-page neighbour block; this is the actual interaction the reference is known for, and it is an indexable discovery page in its own right.
**Verified absent 2026-08-07:** no explorer route under `app/rankings/` or elsewhere; `public/data/similar-metros.json` holds per-metro neighbours only, not the top-N needed for re-ranking.
**Priority:** P2

### Metro signature colour
A deterministic colour per metro derived from its dimension vector (for example three principal components mapped to RGB), stored alongside the metro data and applied consistently across the rankings table, maps, chips and cards, with the mapping documented on `/methodology`.
**Verified absent 2026-08-07:** 0 content hits for `signatureColor` or `signatureColour` under `app/`; no colour field in `public/data/metros.json`.
**Priority:** P2

### "Distinctive by country/region" view
Per country or region, the metros that most over-index on each dimension, reusing the raw-z signature data that already powers the per-metro signature line. Turns signature data into an editorial and SEO surface that pairs with the country and state pages we already have.
**Verified absent 2026-08-07:** content search for `distinctive` under `app/` returns hits only in `app/sound/`, `app/teams/_shared/` and `app/studio/audience-builder/`, none in `app/countries/` or `app/states/`.
**Priority:** P2

## Revenue and business model

### Method: the playbook sequence, applied
Validate willingness to pay adversarially before building anything: map four or five candidate buyer segments, argue against each (who holds budget, buyer vs influencer, why they would not pay), then have real conversations. Then define unit economics and a measurement framework, ship a minimal paid offer for the chosen segment rather than a platform, and write the one-page moat narrative.
**Verified absent 2026-08-07:** no buyer-segment analysis, unit-economics model or moat narrative in `docs/` or at project root; the backlog entry itself flags every segment as an untested hypothesis.
**Priority:** P1

## Geographic data enrichment

### Metro population time series, area and density
Ingest UN World Urbanization Prospects agglomeration series, attach a 10-year population CAGR and a sparkline-ready series per metro as additive fields with a manual override table for name mismatches, derive area from the existing boundary polygons, and compute real density. This is what promotes Greying Power from a curated CSV to a computed rule and unlocks fastest-growing and shrinking lenses.
**Verified absent 2026-08-07:** 0 content hits for `pop10yrCagr` or `area_sq_km` under `lib/`; `public/data/greying-power.csv` is still the curated override list the badge shipped against.
**Priority:** P2

### Governance and qualitative country context
Add government type, currency and official languages as an additive country block, plus one credible governance or press-freedom signal (Worldwide Governance Indicators, V-Dem or RSF). Verify the CIA Factbook's current status before making it load-bearing; prefer Wikidata or World Bank for anything that must stay live.
**Verified absent 2026-08-07:** `public/data/country-facts.json` exists but a content search over it for `government|currency|governance|pressFreedom` returns nothing (only a `Languages` key matched).
**Priority:** P3

## Inspired by 82-0.com

### Cradles of Greatness, athlete birthplaces mapped to metros
Map elite athletes' birthplaces to our metro polygons to produce a genuinely novel ranking: which metros produce the most world-class athletes. Start narrow with two sports we already cover deeply, resolve births via the existing boundary polygons, send unresolved ones to a skipped list rather than hand-mapping. New view at `/sports/cradles`, plus a "Born here" block on metro pages.
**Verified absent 2026-08-07:** no `app/sports/cradles` directory; the only `cradles` and `birthplace` hits in `scripts/` are inside `scripts/append-backlog-82-0.py`, the script that wrote the original backlog entry.
**Priority:** P1

### All-time team draft game on our own data
A draft mechanic where each round a slot machine assigns a constraint (confederation plus decade, or sport plus era) and the player picks the strongest qualifying champion or club from data we already hold, scored on trophies through a non-linear curve with a shareable result card. Stateless first: encode roster and score in the share URL.
**Verified absent 2026-08-07:** no `app/sports/draft` or `app/play/draft` directory; no draft game in the `public/play/` listing.
**Priority:** P2

### Small engagement wins
Two cheap borrows that reuse existing surfaces: a stats-hidden hard mode on the existing `/teams/national/quiz`, and a "Surprise me" entry point on `/sports` that drops the reader on a random metro or team under a random constraint (continent plus tier).
**Verified absent 2026-08-07:** `app/teams/national/quiz/` exists but carries no hidden-stats variant; the only `Surprise me` hit under `app/` is `app/play/PlayBrowser.tsx:160`, which is the arcade's shuffle, not the `/sports` entry point.
**Priority:** P2

## Power Atlas, follow-ups

Deferred by Ashwin 2026-07-03. The base feature shipped at `app/power-atlas/`.

### Most under-rated and over-rated powers of all time
An editorial page ranking the biggest latent-vs-recognised gaps across the whole 1789 to 2026 timeline rather than a single year.
**Verified absent 2026-08-07:** `app/power-atlas/` contains only `page.tsx` and `PowerHistory.tsx`; no gap-ranking route.
**Priority:** P3

### Shareable export cards for the Power Atlas
A given year's ranking, or a single country's latent-vs-recognised arc, as a downloadable image for social.
**Verified absent 2026-08-07:** no `opengraph-image` or export route under `app/power-atlas/`; `app/api/og/` holds only `compare/route.tsx`.
**Priority:** P3

## Needs a decision, not a build

Eight items are blocked on Ashwin rather than on engineering. Each names exactly what is
needed from him.

**Defensive trademark filing, CITIZEN OF NOWHERE, Class 41 (P0).** The dossier and filing
direction were complete as of 2026-05-09 and the work has been idle since. Needed: (a) engage
an attorney (roughly $1,000 to $1,350 for a Class 41 filing) or self-file TEAS Standard at
$350; (b) decide whether to add Class 35 alongside Class 41, given the .store and .shop
registrations already document forward-looking commerce intent; (c) confirm the July 11, 2025
first-use date, not the May 1, 2020 origination date. See the audit note for the broken
evidence trail, which must be resolved first.

**Pearl River Delta / Greater Bay Area conurbation audit (P1).** The audit is complete
(`docs/audits/gba_conurbation_audit.md`) and the finding is that seven GBA metros, roughly
53 million people, are simply not in the corpus. Needed: add shenzhen, foshan, dongguan,
zhuhai, zhongshan, jiangmen and zhaoqing to the MetroAreas.xlsx Team List sheet with full
dimension data. Shenzhen first, plausibly a top-30 metro on its own. Everything downstream
is mechanical once the rows exist. Confirmed still blocked: a content search of
`public/data/conurbations.csv` for `shenzhen|foshan|dongguan|Greater Bay` returns 0 matches.
Meanwhile `lib/badges.ts:1189` ships "Pearl River Delta at 188.5" to the public
`/badges/conurbations` page for a cluster the data does not contain.

**Siena workbook coordinate fix (P2).** Siena carries Albany NY's coordinates
(`42.716238, -73.750008`) in both MetroAreas.xlsx FootballClub_Data cols 9/10 and the grand
football workbook Lookup cols U/V. Needed: correct both to `43.321667, 11.326111`. A
temporary override at `scripts/build-football-data.py:76` is holding the site together and
cannot be removed until the workbook is fixed.

**Map provider, the 3D globe call.** Whether the game UI defaults to a 3D globe
(react-globe.gl, Cesium, Three.js) or inherits the flat Leaflet stack. Materially affects
cost and timeline. Needed: pick one.

**The five quiz-layer decisions.** Sub-domain vs sub-route; backend (edge functions plus
Postgres or Turso vs fully static with no leaderboard); map provider; auth (email magic link
only); and the GA4 event set. Needed: rule on all five, particularly whether the leaderboard
is core or optional, since that decides whether there is a backend at all.

**Canonical platform copy.** The Substack About and Spotify podcast descriptions are written
and final in `BACKLOG.md`. Needed: paste them into the six mirror surfaces (Substack About,
Spotify show page, Apple Podcasts, RSS channel description, the `/about` footer, LinkedIn
newsletter and podcast fields) so they stop drifting apart.

**Citizens of Nowhere podcast, human-hosted format.** Format, scope and the derivative loop
are specified. Needed: the cohost decision (solo with rotating guests, fixed duo, or rotating
panel) before episode three, and a launch date, which the entry itself defers until the
inaugural thinkpiece slate ships.

**Revenue paths, ranked.** The diagnosis is that the binding constraint is buyer validation,
not features, and the recorded strategic stance is reach over revenue. Needed: a deliberate
decision to reverse that stance, or not. Everything in the revenue track is downstream of it.

## Audit note, 2026-08-07

**Tallies.** 126 `###` items examined across 17 sections. 22 already carried a SHIPPED marker
and one carried ABSORBED, for 23 self-declared done. A further 10 were listed open but are
demonstrably shipped (below). 4 sit under "Explicitly not doing". 3 are parked by prior
decision (brand-portfolio commerce optionality, the Spotify "Sound of [City]" link-out, the
stretch Country Power Index). 8 are blocked on Ashwin and are listed above rather than as
build items. That leaves **78 genuinely open engineering items**, plus the 2 Power Atlas
follow-ups, all catalogued here.

The drift rate is lower than an earlier 23-item sample implied. That sample extrapolated to
roughly 62 already-shipped items; the full pass found 33 in total (23 marked plus 10
unmarked). The sample happened to draw heavily from the two sections where drift concentrated.

**Shipped but still listed open in BACKLOG.md.** These ten are why the old file could not be
trusted:

1. **Leadership history for the remaining ~100 countries (P0).** `public/data/leaders/` holds
   313 per-country JSON files. The item's own target date of 2026-06-29 passed uncelebrated.
2. **Core daily game.** Shipped in a different shape than specified: `app/play/arcade/` with
   `TodayStrip.tsx` driving three day-keyed dailies (Metro Globle, Metro Grid, Sports Grid) as
   static HTML under `public/play/`, with UTC day rollover and refresh-safe localStorage
   progress. Not the GeoSports five-question pinpoint round, but the return mechanic exists.
3. **Question generators driven by the dataset.** `scripts/generate_quiz_questions.py`, 611
   lines, implements all six specified modes on the exact Q1x1 to Q5x3 multiplier ladder,
   emitting `public/data/quiz_queue.json`. `scripts/check_quiz_queue.py` enforces the forward
   buffer and `scripts/extract.py:1569` calls the generator on every ETL run.
4. **Wordle-style emoji share.** `public/play/metro-globle.html:115` builds an emoji-square
   result string plus a copy button and toast; `metro-grid.html:153` and `sports-grid.html:160`
   do the same. The `/play/results?date=` variant does not exist, but the viral mechanic does.
5. **Streak tracker.** `app/play/arcade/page.tsx` lines 25 and 37, surfaced on the hub at
   `app/play/page.tsx:17`.
6. **/me personal stats page.** `app/me/page.tsx` and `app/me/layout.tsx` are live, as a
   "Following" surface with Google sign-in rather than the 7-day score chart in the
   acceptance. The route is occupied by a different feature.
7. **Anomaly digest cron wiring (P1).** `.github/workflows/anomaly-digest.yml`.
8. **In-season standings burst (P1).** `.github/workflows/espn-standings-snapshot.yml`, with
   `public/data/espn-snapshots/` as its output.
9. **Country economic and development spine (P1).** `public/data/country-indicators.json`,
   wired into render at five call sites in `lib/countries.ts` and two in `lib/business.ts`.
   Outstanding: the scheduled refresh, which has no workflow.
10. **Capital and administrative status (P1).** `isCapital` is live at four call sites in
    `app/states/[slug]/page.tsx` and three in `app/countries/[slug]/MetrosExplorer.tsx`.

**Broken evidence trail.** The P0 trademark filing cites eight files under `legal/`:
`FILING_DIRECTION.md`, `trademark-evidence/README.md`, the TSDR capture for serial 99774268,
the GoDaddy receipt PDF, two Substack feed artifacts, the Anchor podcast feed parse, and the
Wayback verification. **The `legal/` directory does not exist at the project root, and it is
not listed anywhere in `.gitignore`.** So the entire dossier for the project's only P0 item is
unaccounted for: either it was never created on this machine, or it lives outside the repo
with no pointer. Locate or reconstruct it before any filing decision, because the July 11,
2025 first-use date rests on the Substack and Anchor feed parses inside it.

**Partial-credit items worth re-scoping rather than starting from zero.** Historical stadium
coordinates (the `stadium_history` field already exists in the NHL, NBA and MLB builders and
renders on team detail pages; missing are the NFL builder, year-aware marker resolution, and
uncommenting `YearFilterBar` in four files). The Atlas of Metros embedding (similarity vectors
exist; only the visualization is missing). Governance country context
(`public/data/country-facts.json` exists with a Languages block but no government type,
currency or governance signal).
