> **SHIPPED. Frozen 2026-08-07 as a design record.** The generator built from this spec is `scripts/generate_quiz_questions.py` and the runtime is `lib/quiz.ts`, which cites this file by name at line 9. All six scoped modes are implemented. Do not build from this file; read the code.
>
> **Open operational issue:** `public/data/quiz_queue.json` was generated 2026-06-09 and its last issue is dated 2026-07-10, so the daily queue RAN DRY. Also `/play` is in the nav but is not in `app/sitemap.ts`.

# Scoping: Daily quiz layer (`/play`)

Internal scoping document for the largest single track in the backlog. Drafted 2026-05-09. Replaces ad-hoc planning with a phased build plan, an honest cost picture, and the decision points that need to be resolved before any code is written.

The reference projects are GeoSports (geosports.app, the daily five-question core) and MapTap (maptap.gg, the practice-and-leaderboard expansion surface). Neither should be cloned. The intent is to take the validated mechanics from each and repackage them around the rankings dataset, then strip out anything that does not earn its place by leaning into our actual assets.

> **Revision 2026-05-09 (editorial calculus):** the original draft treated "five factoids per day forever" as the binding constraint and the largest strategic risk. Ashwin pushed back, correctly, that the dataset already carries every fact the reveal card needs. Templated factoid generation from `metros.json` + `details/*.json` + the badges registry + the conurbations CSV produces specific, true, short factoids deterministically. Sustained editorial overhead is roughly 2 hours per month, not 7-10. The V1 gate changes from "write 30 days of factoids by hand" to "ship the templated generator and review 30 days of output."

> **Revision 2026-05-09 (brand-fit filter):** Ashwin pointed out that the original draft inherited too much from GeoSports and MapTap directly, including the sassy quip layer ("looks like a ripoff of the other game"). Re-filtered every feature by brand fit and dataset fit rather than reference-project fit. Dropped: sassy quip layer, Picture Clues mode, Antipode Hunter as a named mode, XP and levels with cosmetic unlocks, adaptive practice, Speed Challenge round, streak-freeze grace days, MapTap-style practice-day calendar. Added features that lean into our assets and are not in the reference projects: tier-stacked daily, dimension spotlight reveal, methodology micro-essays, contested call mode, trajectory mode, adjacent reveals, weekly editorial themes. Net effect: ~30-40 engineering hours saved across V3+V4, ~14 hours of one-time editorial work saved (Picture Clues curation), brand register tightened.

---

## TL;DR

The daily quiz layer is the largest single investment on the backlog. Full feature parity to the brand-filtered scope is roughly 15 weeks of part-time engineering work plus sustained editorial overhead of approximately 2 hours per month indefinitely. The strategic risk is engineering sustainability (uptime on a daily mechanic, audience-funnel validation), not editorial sustainability. The recommended sequence ships a localStorage-only V1 in three to four weeks to validate the daily mechanic before committing to backend, accounts, and the social layer.

The single most consequential decision is whether the analytical-rankings audience and the casual-daily-game audience reinforce each other through a cross-link funnel, or whether they remain two separate audiences sharing a domain. That decision cannot be made in advance; it can only be tested by shipping a validation-grade V1.

If only one preliminary action is taken before starting: build the templated factoid generator. The generator pulls from the existing dataset (metro dimension ranks, team rosters, badge memberships, conurbation cluster data, GaWC class, named cultural assets) and produces 1-2 sentence reveal-card copy deterministically across all six question modes. One week of work; the gating artifact for the rest of the project.

---

## What we are not building

Filtered by brand fit and dataset fit. The features below appear in GeoSports or MapTap and are explicitly out of scope.

| Dropped feature | Reason |
|---|---|
| Sassy quip layer | Direct ripoff of GeoSports. Tier emoji plus composite score is our voice already. |
| Picture Clues mode | Image curation cost (12-16 hrs upfront for top-200 metros) not justified. The dataset is the moat, not Wikimedia stadium photos. |
| Antipode Hunter named mode | Concept is interesting and would make a great Substack post; the named-mode treatment is a MapTap copy. |
| XP and levels with cosmetic unlocks | Gamification register fights the analytical brand. Pin colors at level 5 is not a methodology-driven signal. |
| Adaptive "practice your weak spots" | MapTap premium feature. Brand-misaligned and a multi-month engineering bet. Defer indefinitely. |
| Speed Challenge round (5 in 25s) | Speed-tap mechanics undercut the deliberate read of the dataset. |
| Streak-freeze grace days | Duolingo lift. If you miss a day, you miss it. The streak is honest. |
| MapTap-style practice-day calendar | Replaced with Contested Call mode and Top Teams Only mode that surface our existing assets. |

## What we are building that is not in the reference projects

| Added feature | Why it fits our context |
|---|---|
| Tier-stacked daily | Q1 starts at Regional Hub or below, Q5 lands at Global Capital. Multiplier ladder maps to tier intensification. Daily reads as a tour of the tier system. |
| Dimension spotlight reveal | Reveal card shows the metro's 16-dimension breakdown chart with the question's hook dimension highlighted. Every reveal becomes a teaser for /methodology. |
| Methodology micro-essays | Weekly, one reveal includes a paragraph from /methodology about why that dimension matters. Pulls the dataset's intellectual depth into the daily mechanic. |
| Contested call mode | Recurring weekly variant where the question is a Top Teams contested call ("Who actually wins London?") and the reveal pulls the existing rationale field. |
| Trajectory mode | Questions about which metros moved most between refresh cycles. Hooks the freshness fields shipped 2026-04-27 plus the eventual historical-snapshots feature. |
| Adjacent reveals | Reveal card shows 2-3 nearby metros with scores. The user learns geographic neighborhoods, not just answers. |
| Weekly editorial theme | Each Issue (week) has a theme: a country, a continent, a contested metro, a badge. Themes tie into the Substack cadence. |

---

## Phasing

### V1 — Validation-grade daily mechanic (weeks 1-3)

**Goal:** ship a daily five-question round on `/play` that proves the mechanic without requiring backend, accounts, or a leaderboard. localStorage handles streak persistence; questions are pre-baked in a JSON queue from the templated generator; the share string is the viral mechanic.

**Inclusions:**
- `/play` route with daily five-question round, rotating at 00:00 UTC
- Two question generators: pure pinpoint and dimension capital
- 3D globe rendering via react-globe.gl, dark-navy + mint-cyan palette
- Tier-stacked daily: Q1 starts at Regional Hub or lower, Q5 lands at Global Capital
- Distance-decay scoring (Q1×1, Q2×1, Q3×2, Q4×3, Q5×3, perfect day = 1,000)
- Tier vocabulary mapped to per-tap accuracy bands
- Wordle-style emoji share with copy-to-clipboard and per-day permalink
- Streak tracker in localStorage (no cross-device sync, no streak-freeze)
- `/play/how-it-works` methodology page
- Trivia card reveal: metro name, country, tier badge, 16-dimension breakdown chart with hook dimension highlighted, templated factoid pulling from dimension ranks plus 2-3 named entities, 2-3 adjacent metros with scores, "View full ranking →" CTA
- Cross-link surface on metro detail pages: "Featured in today's quiz?" banner if the metro is one of today's five answers
- Issue-numbered identity ("Issue #001 — May 9, 2026") with linked archive replays

**Exclusions:**
- No accounts, no auth, no backend
- No `/me` page, no leaderboard, no Versus, no Groups
- No practice arena, no themed collections
- Generators 3-6 (tier reveal, top teams, badge holder, conurbation member) deferred to V3

**Critical pre-ship deliverable:** templated factoid generator at `scripts/generate_quiz_questions.py`. Pulls from `public/data/metros.json`, `public/data/details/*.json`, the badges registry (`lib/badges.ts`), and `public/data/conurbations.csv`. Produces a 30-day forward queue at `public/data/quiz_queue.json` with question prompt, answer metro slug, score multiplier, tier band, and templated reveal-card factoid composed from dimension ranks, team rosters, badges, conurbation membership, GaWC class, and named cultural assets.

**Effort:** 30-40 hours over three to four weeks. Roughly: one week on the generator (covering all six question modes with per-mode templates), one week on globe + scoring infrastructure, one week on share + streak + reveal card with dimension chart, half a week on methodology page and cross-link surface.

**Validation gate at end of V1:** four-week observation window after launch. Decision matrix:
- Day-over-day return rate above 25% by week 4 → daily mechanic is sticky
- Cross-link funnel: at least 10% of quiz players click through to a rankings metro page → audience reinforcement is real
- Share rate above 5% of completions → viral loop is alive
- Total returning players above 200 → there is enough material to learn from

V2 ships if at least three of four are met. V2 does not ship if fewer than two are met. V2 ships at smaller scope (auth and `/me` only, no leaderboard yet) if exactly two are met.

---

### V2 — Accounts and social proof (weeks 4-7)

**Goal:** add the persistence and social-proof layer that a daily game needs to build long-term retention.

**Inclusions:**
- Email magic-link auth (Resend or Postmark for delivery, ~$0-20/month at expected scale)
- Postgres or Turso backend (Turso recommended; free tier handles low scale)
- Server-side score recomputation from original tap coordinates (anti-abuse)
- `/me` personal stats page focused on rankings-relevant insights: accuracy by tier (do you guess Continental Cities better than Global Capitals?), accuracy by continent, dimension breakdown of wrong answers, 7-day score chart colored by daily tier, all-time stats
- `/play/leaderboard` showing today's top 50 plus the player's own row pinned regardless of rank
- 14-day leaderboard archive with date picker
- Onboarding upsell modal triggered after the first complete five-question round on a new device
- Settings panel: sound on/off, miles/km, confirm-tap mode, high-contrast globe, UTC vs local time
- Cross-device streak sync once authenticated
- GA4 event wiring: round_started, question_answered, round_completed, share_clicked, leaderboard_opted_in, metro_page_clicked_from_reveal

**Effort:** 40-50 hours over four weeks. Auth and Postgres data model carry the largest single line item.

**New infra cost:** ~$30-50/month all-in.

---

### V3 — Practice and depth (weeks 8-11)

**Goal:** add the long-tail engagement layer that converts casual daily players into habitual players, using our editorial assets rather than MapTap's expansion playbook.

**Inclusions:**
- `/play/practice` arena with three round types: Short (5/60s), Medium (10/2m), Long (15/3-4m). No Speed Challenge.
- Themed collections at `/play/collection/[slug]` with their own leaderboards. Initial seed maps directly to existing badges and surfaces: Power 100, Continental Cities, Capitals of the World, Twin Metros, Frozen Conurbations, Sports Meccas, Global Gateways, Cosmopolitan Capitals, Greying Powers, Emerging Standouts, plus one per major country (USA, China, India, Brazil, Russia, Japan, Germany, UK, France, Mexico, Indonesia, Australia, Canada, Italy, Spain, Turkey) and one per continent.
- Question generators 3-6: tier reveal, Top Teams (pulls existing rationale text), badge holder, conurbation member
- Per-mode difficulty calibration (easy mode draws from top-100, hard mode from the long tail)
- Methodology micro-essays: weekly, one reveal includes a paragraph from /methodology about why that dimension matters. Costs no new content because the methodology page is already written.

**Effort:** 35-45 hours over four weeks (down from 50-60 with the dropped items).

---

### V4 — Social mechanics and our-context modes (weeks 12-15)

**Goal:** the second engagement engine after the daily mechanic. Versus and Groups create direct social context; the modal variants surface our assets rather than copying MapTap's calendar.

**Inclusions:**
- Versus async head-to-head with shareable challenge URLs, up to 8 players per challenge
- Groups private leaderboards, soft cap of 100 members, official "Citizen of Nowhere readers" group for verified Substack subscribers
- Curated "Best Of" archive with monthly editorial pass
- Contested call mode: recurring weekly variant where the question is a Top Teams contested call and the reveal pulls the existing rationale
- Trajectory mode: questions about which metros moved most between refresh cycles. Hooks the freshness fields plus the eventual historical-snapshots feature.
- Weekly editorial themes: each Issue has a theme tied into the Substack cadence
- Top Teams Only mode as a permanent variant

**Effort:** 30-40 hours over three to four weeks.

---

### V5 — Production polish and conditional features (post-launch)

**Goal:** discretionary polish layer. Each item independently sized 1-3 weeks; ship if traction supports it.

**Candidate items:**
- Game-mode variants beyond Top Teams Only: sport-specific days, region-locked days, hard-mode toggle
- Native iOS app consideration if traction supports it (Apple SSO becomes relevant)
- Premium tier with deep-cut collections and group cap raised
- 3D globe upgrade with moon and star field, Cesium switch if react-globe.gl perf budget tightens
- Picture Clues only if a sponsor or commission funds the image curation

---

## Total effort summary

| Phase | Weeks | Engineering hours | Editorial hours during build | Cumulative running time |
|---|---|---|---|---|
| V1 | 1-3 | 30-40 (incl. generator) | 4-6 (template design + sample-output review) | 3-4 weeks |
| V2 | 4-7 | 40-50 | 1-2 | 7 weeks |
| V3 | 8-11 | 35-45 | 3-5 | 11 weeks |
| V4 | 12-15 | 30-40 | 4-6 | 15 weeks |
| V5 | 16+ | discretionary | discretionary | open-ended |

**To V1 launch:** 3-4 weeks, 30-40 engineering hours, 4-6 editorial hours.
**To full feature parity (V4):** 15 weeks, 135-175 engineering hours, ~12-19 editorial hours during build.

**Sustained editorial overhead post-launch:** approximately 2 hours per month indefinitely. Generator output quality review (~30 min/week), Best Of curation (~30 min/month), weekly theme selection (~15 min/week).

---

## Critical path

The hard dependency chain is: V1 generator → V1 globe rendering → V1 scoring + share → V2 backend + auth → V3 themed collections → V4 social mechanics. Most other items are parallelisable within their phase.

Three items belong on the critical path before V1 starts:
- Backend platform decision (Turso recommended; lock before V2)
- Map provider decision (react-globe.gl recommended; needs validation in V1 perf-budget)
- Templated generator: must be working and producing 30 days of reviewed output before V1 ships

---

## Decision points

### 1. Sub-route vs sub-domain (decide before V1)

Options: `rankings.citizenofnowhere.org/play` vs `play.citizenofnowhere.org`.

**Recommended: sub-route initially** (`/play`). Inherits domain authority, consolidates SEO, simplifies cross-link funnel. Switch to sub-domain only if analytics show audience separation. Easy to migrate; near-impossible to consolidate the other direction.

### 2. Backend platform (decide before V2)

**Recommended: Vercel + Turso.** Free tier handles V1 and early V2; ~$29/month at modest scale. Edge replication gives the leaderboard the latency the daily-game UX needs. Postgres-via-Neon is the alternative if Drizzle ORM or richer relational features become needed later.

Fully static + client-only is rejected because the leaderboard is core to the social-proof loop, not optional.

### 3. Map provider (validate in V1, decide before V2)

**Recommended: react-globe.gl.** Easiest learning curve, smallest bundle, sufficient performance for the daily-game UX on mobile. Validate in V1 by measuring time-to-interactive on mid-tier mobile and checking that the globe spins smoothly under three-finger pinch-zoom on iOS Safari.

### 4. Auth model (decide before V2)

**Recommended: email magic link only via Resend or Postmark.** No passwords, no OAuth, no SSO surface area. Apple SSO becomes relevant if and only if a native iOS app ships.

### 5. Editorial queue ownership (decide before V1) — REVISED

**Recommended: templated generator at `scripts/generate_quiz_questions.py`.** Pulls from the four data sources (metros.json, details/*.json, badges registry, conurbations.csv), composes 1-2 sentence reveal-card factoids per question mode, emits a forward-looking JSON queue. The generator is an engineering deliverable, not an editorial one. Sustained editorial overhead is generator output quality review (~30 min/week) plus Best Of curation (~30 min/month).

Where hand-editorial work IS still needed: occasional template improvements as new question modes come online, weekly theme selection. Voice work in long-form Substack pieces remains entirely hand-written and LLM-untouched per CONTENT.md.

The CONTENT.md LLM-use policy needs sharpening to distinguish two cases: (1) long-form opinion prose where the editorial argument is the voice → no LLM, no exceptions; (2) templated structured-data composition where the dataset is the voice → templating is fine. The factoid is structured-data composition, not opinion prose.

### 6. Premium tier and monetization (decide at V4)

**Recommended: defer until at least 5,000 daily active users or until the Substack passes 10,000 subscribers, whichever comes first.** Capture the design space in the existing brand-portfolio commerce backlog item; do not implement until traction supports it.

### 7. Validation gate at end of V1 (decide pre-launch criteria)

V1 is a validation-grade ship, not a permanent product. Locked criteria:
- Day-over-day return rate above 25% by week 4
- Cross-link funnel: at least 10% of quiz players click through to a rankings metro page
- Share rate above 5% of completions
- Total returning players above 200

V2 ships if at least three of four are met. V2 does not ship if fewer than two are met. V2 ships at smaller scope if exactly two are met.

---

## Strategic risk assessment

### Risk 1: audience separation (largest)

The premise of the cross-link strategy is that quiz players become rankings readers. The premise can be wrong. If the cross-link funnel converts under 5% of quiz players to rankings visits, the quiz layer is a separate product co-located on a domain rather than a feeder funnel.

**Mitigation:** the V1 validation gate explicitly tests this. If audience separation is the answer, the right move is sub-domain (`play.citizenofnowhere.org`) and treating the quiz as a co-marketed but editorially-distinct product.

### Risk 2: maintenance debt

A daily game that goes silent for a week is dead. The streak mechanic is the retention engine; if the daily breaks for any reason for several days, the streak resets for everyone, and the most engaged players churn.

**Mitigation:** uptime monitoring on `/play` from V1 onward (Better Stack or UptimeRobot, free tier sufficient). Server-side cron at 23:00 UTC each day verifies the next 7 days have a queued question; alert by email if it does not. The generator can run on a daily Vercel cron to extend the queue automatically.

### Risk 3: brand register dilution

The rankings site's editorial gravity is methodology, named tiers, archetype badges. The daily quiz is a different register. Co-locating them is a real tension.

**Mitigation:** sub-route placement (`/play`), kept off the homepage and out of the primary nav until the validation gate is cleared. The brand-fit filter applied to the feature set already drops the worst offenders (sassy quip, gamification XP). The "Daily" nav entry is a V2 addition, not V1.

### Risk 4: template quality drift

If new question modes ship without proper template design, the reveal cards read as data-dump rather than as polished mini-facts.

**Mitigation:** template review at every new mode launch (one engineering review per quarter), and generator output sampling at the 30-min-per-week cadence. CI rule: `scripts/check_quiz_queue.py` fails the build if forward queue drops below 21 days.

### Risk 5: premature optimization toward MapTap depth

MapTap has many features because it has been compounding for years. Building all of them in 16 weeks because they are listed in BACKLOG is the wrong interpretation. The right read is V1 ships the daily mechanic; V2 adds accounts; V3 and V4 are conditional on V1 + V2 traction.

**Mitigation:** the phased structure of this scoping doc plus the brand-fit filter that already dropped the weakest fits. V3 and V4 should not start without explicit go decisions at the end of V2.

---

## Cost projection

### One-time

- Engineering: 135-175 hours to V4. At self-time, this is 15 weeks of part-time work or 3-4 weeks of full-time work. At $150/hour outsourced, this is $20,000-26,000 if outsourced. Recommend self-build for V1 and V2 to internalize the data model; consider contractor for V3 themed collections and V4 social mechanics if the validation gate clears.
- Editorial: 12-19 hours during build. Self-only.
- Domain: existing.

### Recurring

| Item | V1 | V2 | V3 | V4 | At scale (1k DAU) |
|---|---|---|---|---|---|
| Vercel | $0-20 | $0-20 | $20 | $20 | $20-50 |
| Turso | $0 | $0 | $0-29 | $29 | $29-99 |
| Email (magic link) | $0 | $0-20 | $20 | $20 | $20-50 |
| Uptime monitoring | $0 | $0 | $0 | $0 | $0-10 |
| **Monthly total** | **$0-20** | **$0-40** | **$40-70** | **$70-100** | **$70-210** |

The daily quiz layer can run at $20-100/month all-in for at least its first year, which is well within the brand budget.

### Editorial

~2 hours per month sustained, indefinitely. At self-time, this is the real ongoing cost.

---

## Recommended sequencing (one-page summary)

**This week:** finish the inaugural thinkpiece slate (Sovereign City Index drafted; Five Scenarios for the 2036 Olympic Cycle next). Do not start `/play` work yet.

**Week 1 from start:** build the templated factoid generator at `scripts/generate_quiz_questions.py`. Six question modes, JSON queue output, sample first 30 days. Review sample for quality; iterate on templates.

**Weeks 2-4:** V1 build. Globe, scoring, share, streak (localStorage), reveal card pulling from the generator's queue, methodology page, cross-link surface. Ship to `/play` quietly, no homepage promotion, single Substack note announcing the soft launch.

**Weeks 5-8:** four-week V1 observation window. Watch the four validation criteria. Run the generator weekly to extend the queue.

**Week 9:** V2 go/no-go decision. If go, V2 starts week 10.

**Weeks 10-13:** V2 build. Auth, backend, `/me`, leaderboard, settings.

**Weeks 14-17:** V2 observation. Decide whether V3 ships at original scope or trimmed.

**Weeks 18+:** V3 and V4 sequencing depends on V2 traction. Default plan is V3 then V4; the alternative is V4 (Versus + Groups) before V3 if the social-mechanic signal is stronger than the practice signal.

---

## Open questions for Ashwin

The decisions in this doc that have a clear recommendation can be locked now. One decision needs explicit conversation before any code is written:

**The brand register tradeoff.** Are you willing to accept a casual-game register on a sub-route of the analytical-rankings site for the duration of the V1 validation window, knowing that the validation outcome may be that the audiences do not reinforce each other and the project should sub-domain or shut down? The honest answer is required because halfway commitment is the failure mode here.

If yes, the next step is committing to the inaugural-slate completion first, then starting V1 in earnest in 2-3 weeks. If no, the project should not start, and the BACKLOG entry should be moved to "Explicitly not doing" with the reason captured.

The editorial commitment question (originally listed as the largest blocker) is no longer a real gate. The templated generator carries the load. Sustained 2 hours per month is well within the budget the rest of the editorial track already absorbs.
