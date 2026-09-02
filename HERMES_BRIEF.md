# Hermes Brief: Ashwin Desikan, Citizen of Nowhere, and the Metro Area Project

**Version:** 1.0
**Written:** 2026-09-02
**Written by:** Claude (Cowork session, cloud container linked to the Windows machine `ashgaming`)
**For:** the Hermes agent
**Repo state at time of writing:** `main` @ `53bb230626` ("Add Top 14, Gallagher Premiership, Champions Cup and EuroLeague boards"), committed Tue 1 Sep 2026 17:27 +0100

---

## 0. How to use this brief

Hermes has two jobs. Both are declared by Ashwin:

1. **External reviewer.** Hermes reads, critiques, adjudicates and proposes. Hermes does not have repo access. This brief is the cold start so Hermes can reason about the work without reading the code.
2. **Second brain.** Hermes holds the whole picture across the platform, the brand, the writing, the job search and the personal projects, so that Ashwin does not have to re-explain context.

Read this document in full once. After that, use it as a lookup. The sections that carry the most weight are:

- **Section 8, the standing rulings.** These are decisions Ashwin has already made. Re-proposing a closed decision costs him time and trust.
- **Section 9, the dead ends.** These are ideas that were tested and failed, or refused on taste or risk grounds.
- **Section 12, the review-memo protocol.** There is already a working pattern for an external AI reviewer on this project. Hermes inherits it.

Three rules for anything Hermes produces:

- **Check the ruling ledger before proposing.** If the idea appears in Section 8 or 9, either drop it or open with why the conditions have changed.
- **Label speculation.** The project has a hard norm: a claim is verified only if it was checked against a live source in the current session. Inference is not verification. Say which one you are doing.
- **Route decisions to Ashwin, not around him.** The house pattern is that the agent gives a verdict with reasoning, then names the decision that belongs to Ashwin.

---

## 1. Ashwin in one paragraph

Ashwin Kumar Desikan is a senior commercial and data executive based in Clerkenwell, London, and he moved from New York in early 2025. His career runs through the NFL London office, MLB, Amazon Advertising at Director level (Amazon Marketing Cloud and data clean rooms), Meta, Spotify, Digitas, Omnicom Media Group and Adform, with an earlier bioinformatics career at Illumina. He holds a UPenn bioengineering degree and a WashU master's in computational biology (2007). His expertise is fan data ecosystems, identity infrastructure, clean rooms, commerce media, and the operating-model design that makes those things work inside federated organisations such as a league with thirty-two clubs. He mentors through South Asians in Sports. He is a rigorous, opinionated, high-context operator who wants substance over hedging, and he will tell you plainly when an output is not useful.

**Voice.** Thoughtful, strategic, articulate, slightly erudite, persuasive without stiffness. British and international register. He dislikes em dashes, generic filler, moralising and Gen Z slang. He wants opinions with reasoning attached, and speculation labelled as speculation. For professional material the emphasis is scale, transformation, operating-model design, product leadership, governance, measurable outcomes and cross-functional execution.

**Working style with AI.** He runs several agents at once and expects them to disagree with each other in writing. He delegates mechanical work to cheap models and reserves expensive reasoning for silent failure modes such as root-cause diagnosis, security posture and irreversible changes. He wants explicit stop conditions on any delegated task, for example "stop and escalate after two failures rather than looping."

---

## 2. The portfolio in one table

| Workstream | What it is | Status |
|---|---|---|
| **Metro Area Project** | The code and data platform behind `rankings.citizenofnowhere.org`. About 285 pages, 4,285 metros, dozens of sport, civic and business hubs. | Live, shipping near-daily |
| **Citizen of Nowhere** | The parent brand and studio site at `citizenofnowhere.org`, plus the Substack and podcast. | Live |
| **The Studio** | A martech reference implementation built on the rankings dataset: identity, consent, audience, activation, measurement. | Live as a microsite at `/studio` |
| **Citizen of Nowhere Picks** | A free pick'em game against the site's own prediction models. | Phases 1 to 3 shipped |
| **Brand and IP** | UK trademark and company formation, scoped in detail, nothing filed. | Decision pending, live deadline mid-September 2026 |
| **Job search** | A senior data, identity and martech leadership mandate at a rights holder, media owner or platform. | Active, under strategic review |
| **Advisory practice** | The commercial alternative to employment, sold under Citizen of Nowhere. | Being tested against the job search |
| **Alex's Learning** | Primary-school learning plans for his son. | Small, personal, ongoing |
| **Legacy analytics archive** | A decade-plus of Excel and Tableau sports workbooks that feed the platform. | Reference material |

---

## 3. Citizen of Nowhere: the brand

**Name.** Reclaims a political insult. The phrase was used from a podium to disparage people who see themselves as citizens of the world.

**Positioning line.** "A studio for ideas, indices, and interfaces."

**Thesis.** "Cities are the unit of civilization. Countries are accidents of it."

**Meta description.** "A place to think about cities, countries, movement, and the people who belong to all of them and none of them."

**Voice.** First person, thoughtful, slightly erudite, explicitly not marketing-led.

**Structure.** The brand site is a separate Astro repo. Masthead is Work, Writing, About, Practice. Work lists the Global Metro Power Rankings ("70,000+ parameters. 4,200+ metros. 237 countries.") and The Studio. Writing pulls the five latest Substack posts at build time. About is the reclaimed-insult essay. Practice is the advisory arm.

**Visual system.**

| Token | Dark (primary) | Light |
|---|---|---|
| ink (background) | `#0a0a0b` | `#ffffff` |
| paper (text) | `#f5f4ee` | `#15151a` |
| accent (teal) | `#5eead4` | `#0d9488` |
| muted | `#8b8b93` | `#6b6b73` |
| line | `#1f1f22` | `#e3e1d8` |

**Typography.** Newsreader for display and body. JetBrains Mono for eyebrows, nav, meta and labels. Inter as sans fallback.

**Other.** Twitter card is always `summary_large_image`. Canonical OG image is `/og.png`. Google tag `G-8BQVX0NFZZ`. A separate sub-brand, Zone Zero Sports Club, has its own brand bible and visual identity starter in the project folder.

---

## 4. The platform: what is actually shipped

`rankings.citizenofnowhere.org` is far larger than its name suggests. 364 `page.tsx` routes. The surface area:

**Metro core.** Home, `/rankings`, `/rankings/[slug]`, `/compare`, `/geography`, `/neighborhoods`, `/power` (The Nowhere 100), `/power-atlas` (extending to 1500), `/states`, `/countries`, `/skyscrapers`, `/deep-dives`, `/top-teams`, `/ground-floor` (environmental conditions, deliberately a separate scoreboard from the power ranking).

**Sport.** NFL, NBA, MLB, NHL, WNBA, NCAA football and both basketballs, club football with per-season pages from 1959-60 to 2026-27, rugby union and league, cricket, F1, AFL, NRL, CFL, handball, volleyball, IPL, NPB, Olympics, national teams, women's football, boxing. Plus cross-cutting hubs: `/sports/champions`, `/sports/rivalries`, `/sports/standings`, `/sports/valuations`, `/sports/owners`, `/sports/heartbreak`, `/sports/expectation`.

**Predictions and games.** `/predictions/*` (Premier League, UCL, NFL, MLB, CFB), `/predictions/scoreboard` (The Ledger, the public accuracy record), `/play`, `/play/arcade`, `/play/picks` (Citizen of Nowhere Picks), `/banter` (a beta banter engine, noindex).

**Civic and political.** `/leaders`, `/leaders/changes`, `/mayors`, `/governors`, `/us-political-leadership`, `/uk-political-leadership`, both with time machines, `/constitutions` and `/constitutions/leaders`, and a large `/elections` tree with roughly fifty country hubs plus `/elections/forecast`, `/systems`, `/referendums`, `/all`, `/under-fire`. Also `/conflicts`.

**Business and finance.** `/business` hub with companies, markets, currencies, S&P 500, billionaires, leaders, owners, private companies, rankings (Board A) and crossovers.

**Screen and Sound.** Film and music power rankings: `/screen/*` (films, people, Oscars, canon, years, countries, metros, number-ones) and `/sound/*` (artists, charts, scenes, decades, Grammys, Rolling Stone 500).

**Infrastructure surfaces.** `/updates` (public release notes), `/methodology`, `/badges`, `/me`, `/activity`, `/admin`, `/refresh-schedule`, `/about`, `/privacy`, and `/api/mcp`, an MCP endpoint currently scoped to metros only.

---

## 5. Architecture

**Stack.** Next.js 16.2.9 App Router, React 19.2.5, TypeScript 6.0.2, Tailwind CSS 4.2.2, Leaflet and react-leaflet for maps, Zod for validation, `@vercel/analytics`, `mcp-handler` for the MCP route. Vitest for unit tests, Playwright for the mobile probe, pytest for the Python pipeline. Supabase (`@supabase/supabase-js`) and Upstash Redis for KV and rate limiting.

**The central design decision.** The frontend does not compute and does not fetch live. `app/` and `lib/` read pre-built JSON from `public/data/**`. The data pipeline in `scripts/**` builds that JSON from source workbooks, Wikidata SPARQL, ESPN, ForbesAPI and Supabase. This is why the deploy rules in Section 7 matter: 313 `readFileSync` call sites bake `public/data` in at build time, so a data change without a build is invisible.

**Scale.** 618 `.tsx` files, 271 `.ts` files, 493 `.py` files on disk (445 of the Python files are tracked; about 48 are gitignored). `lib/` holds roughly 243 modules, almost all flat, with one `lib/banter/` subdirectory: about fifty per-country election modules, one per sport, one per civic dataset. `scripts/` has 493 Python files across about 46 subdirectories. There is no top-level `components/` directory; shared UI lives under `app/_shared/`, `app/teams/_shared/` and similar.

**Hosting.** Vercel, team `ashwin-desikans-projects`, auto-deploy on push to `main`. The brand site is a separate Vercel project.

**Database.** Supabase project `nmprqkmymrdknffwnuur`. Two access paths:
- The JS client in `lib/supabaseClient.ts` reads `follows`, `pick_profiles` and `picks`. Note that this file hardcodes the production URL and the anon key as a fallback constant, deliberately, after a placeholder env var containing non-Latin-1 characters silently broke browser auth headers.
- Python loaders in `scripts/supabase/*.py` write via PostgREST to `euroleague_seasons`, `wnba_seasons`, `ipl_standings`, `ipl_playoff_matches`, `rugby_results`, `rugby_tables`, `womens_club_football`, `team_valuations`, `domestic_cups` and a majors table set.
- The football research tables (`football_matches`, `football_elo`, `football_gamescore`, `football_club_names`, `football_competitions`, `football_standings`, `football_fixtures`, `football_lookup`) and the market-cap tables (`mktcap_*`) also live there.
- There are no migrations in the repo. Schema changes are applied directly.

**Environment keys** (names only): `ACTIVITY_PASSWORD`, `ACTIVITY_SESSION_SECRET`, `ADMIN_PASSWORD`, `ADMIN_SALT`, `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `REVALIDATE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

**Repo hygiene, honestly stated.** The repo root doubles as a drafting scratch space. It holds the master workbooks and about seventeen timestamped `MetroAreas.xlsx.bak-*` snapshots at 30 to 37 MB each, sport workbooks (`NHL.xlsx` 45 MB, `CBB.xlsx` 29 MB, a 56 MB Champions League file), roughly twenty-five `commit-round*.ps1` scripts, and Substack drafts in `.md`, `.html`, `.pdf` and `.docx`. Directory sizes: `workbooks` 1.8 GB, `data` 887 MB, `public` 445 MB, `site` 507 MB, `scripts` 323 MB, `app` 7.2 MB, `lib` 5.4 MB. This is a working directory, not a clean deploy repo.

---

## 6. The data estate

**Master workbooks.** These live in OneDrive, are gitignored and are the ground truth. The rule is absolute: never override coordinates or continent from an external geo source. The workbook wins.

- `MetroAreas.xlsx`, about 4,285 to 4,314 metros. It carries two place sheets that disagree with each other: a Municipality sheet covering 33 countries and a Counties sheet covering 239.
- `AllFootball.xlsx`, 192 MB, 517,969 rows from 1871 to 2023, with a metro on every row. Largely unused by the repo itself.
- `NFL_all.xlsx`, `Champions_History.xlsx`, `OtherLeagues.xlsx`, `NBA.xlsx`, `NHL.xlsx`, `CBB.xlsx`, `Majors.xlsx`, `Rivalries.xlsx`, `ZoneZero_Champions.xlsx`.

**Research tables in Supabase.** The club football greatest-games programme built a spine of roughly 269,000 to 330,000 match rows, a unified Elo table (`football_elo`, about 269,499 rated rows) and a Game Score table (`football_gamescore`, about 261,300 rows). Row counts moved through the work packages, so treat any specific figure in this brief as approximate and check the live table before quoting it publicly.

**Geodata.** `Projects/MapData/` holds Overture Maps parquet files: a global division-area file, a North America file, a US CONUS file and per-country `overture-XX.parquet` for over 150 ISO codes. This backs the metro boundary work.

**Source status. This is the part that goes stale fastest.**

| Source | Status |
|---|---|
| ClubElo | **Dead.** The site changed and there are no snapshots. Do not re-propose it as a benchmark. |
| nflverse injuries feed | **Dead after 2024.** ESPN injuries plus depth charts replace it. Never build on the old feed. |
| Pro-Football-Reference historical play-by-play | **Superseded for 1981 onward.** It sits behind Cloudflare Turnstile. The no-bypass rule binds every session. The GSIS archive (verified live, 1981 to 2026) replaced it. The posture there is derive and cite, never redistribute PDFs. |
| Wikidata P159 (headquarters) | Unreliable for historical HQ. The sweep is parked. |
| Comparative Constitutions Project | No egress from either agent session. ZIPs are downloaded by hand to `C:\Users\ashwi\Desktop\New folder (2)`. Annual cadence. |
| Brazil runoff scraper | Broken. A heading-format change returns zero matchups. Diagnosed, not fixed, because no session has egress to verify a fix. |
| Wikidata SPARQL generally | Rate-limits shared GitHub runner IPs. This is why the Mac mini owns most live refresh jobs. |

---

## 7. The operating model

This is the part most likely to be misunderstood by a new agent, and it is where the project's hard-won discipline lives.

### 7.1 Two machines, possibly two agents

Two Claude Code instances can be live at the same time:
- a cloud or Windows session, isolated, with no access to the Mac mini;
- a session on the physical Mac mini, with a real filesystem and residential-IP network egress.

An agent must never assume which one it is. It checks `hostname` and `whoami`. Without egress, a live-data claim cannot be verified by reasoning. The named lesson: for two months the diagnosis was "WDQS must be down." The real bug was a query-optimizer join order issue. The rule that came out of it: **do not report a diagnosis you have not verified as fact.**

### 7.2 The session-open protocol

Mandatory on the first user message, before answering any question about status or next work:
1. `git log` and `git status`.
2. Fetch the Substack archive.
3. Read `/updates`.
4. Reconcile stale memory labels against what git actually shows.
5. Read `.deploy-status.json`.

Skipping it "is a protocol failure. Treat it the same as fabricating a citation." Memory records intent at write time. Git records what happened. When they disagree, git wins. This has bitten the project repeatedly: the memory header was wrong twice on 2026-08-12, three days stale on 2026-08-17, and on 2026-08-19 the tree changed between two turns of a single session because the other instance pushed concurrently.

### 7.3 HANDOFF.md

`HANDOFF.md` is the async coordination channel between the two instances. Protocol: `git pull --ff-only`, append under a dated `## YYYY-MM-DD, from, to` heading, never rewrite someone else's entry, commit with `[vercel skip]`, push. Closed threads move to `HANDOFF-ARCHIVE-*.md`. The file is about 8,300 lines. It is CRLF and nothing enforces that, so bare-LF appends from the mini have caused whole-file renormalisation diffs at least three times.

### 7.4 Deploy discipline (hard rule)

Every commit that does not touch `app/`, `lib/`, `public/` or build config must carry `[vercel skip]` in the subject line. This applies to human and machine commits equally. The budget is roughly two production builds per day.

On 2026-08-06, thirteen production builds ran in one day, all from untagged HANDOFF and `mac-mini-jobs/` commits. The root cause was `scripts/vercel-ignore.sh` failing open. It now fails closed, and `scripts/test-vercel-ignore.sh` guards that behaviour in CI. Build fourteen that same day came from the guard scripts themselves being in the watched path list; they were removed, because editing a guard cannot change the artifact.

Count builds with the Vercel MCP `list_deployments` and the `READY` state. Never count GitHub `deployment_status` events: under secondary rate limiting they 404, and a 404 reads as "no builds," which is a false negative.

`public/data` stays in the path list on purpose. Excluding it would silently stop deploys for the majority of pages, because of the 313 build-time readers. `public/data/leaders/**` in particular needs a real build, since country pages read it at build time rather than through ISR.

`.githooks/` is per-clone. Run `git config core.hooksPath .githooks` once on each machine.

### 7.5 Release notes (hard rule)

Any day with a commit touching `app/`, `lib/` or `public/` gets a same-day entry in `lib/releases.ts`, which powers the public `/updates` log. On 2026-08-30, twenty commits shipped across five sessions with zero entries. `npm run check:release-notes` now fails for any earlier day with missing coverage and warns for today. The build enforces the format: maximum four bullets, one short sentence each, 220 characters, a headline of four to eight words with a twelve-word ceiling, and no script names, paths or ETL mechanics. Violating it fails `next build` with `RELEASE_NOTES_VIOLATION`. Write the entry into the shipping commit, because a follow-up commit burns a second build.

### 7.6 The verify gate

`npm run verify` is the proof gate, and it is long:

`typecheck` → `check:client-imports` → `check:public-data` → `check:slug-drift` → `check:team-placement` → `check:skyscrapers` → `check:score-parity` → `check:table-scroll` → `check:election-dates` → `check:release-notes` → `check:mobile` → `check:live-data` → `vitest` → `pytest` → `next build --webpack`

Most `check:*` scripts are ratchets backed by a JSON baseline (`mobile-baseline.json`, `skyscraper-baseline.json`, `slug-baseline.json`, `score-drift-baseline.json`, `table-scroll-rank-baseline.json`, `team-placement-baseline.json`). The rule is never to grow a baseline to make a check pass.

### 7.7 Working on a Windows-mounted repo

The repo is Windows-hosted and reached through a bindfs mount. The accumulated rules:
- Never run sandboxed git against it. It locks.
- Never use the Edit or Write tools on project files. They truncate silently above about 26 KB. All writes go through bash heredocs or `scripts/safe-edit.py`.
- Never run sandboxed `tsc` or `next build` against it. Mount read truncation produces phantom errors.
- Preferred pattern: build in `/tmp`, copy to the repo path, verify with md5.
- Pushing requires the stash, rebase-retry-loop, `--theirs` on `HANDOFF.md`, pop sequence, because the mini pushes concurrently and wins a naive race.
- **Never push without explicit approval.**

### 7.8 Scheduled jobs

Most GitHub Actions schedules are deliberately disabled with a comment saying the mini owns the job. Still scheduled in Actions:

| Workflow | Cadence |
|---|---|
| `anomaly-digest.yml` | Mon 06:00 UTC |
| `cfl-refresh.yml` | daily 12:00 UTC |
| `espn-standings-snapshot.yml` | every 3h at :25 |
| `external-url-monitor.yml` | daily 07:30 UTC |
| `footy-refresh.yml` (AFL, NRL) | daily 22:00 UTC plus finals catch-ups |
| `honours-2026-champions.yml` | Wed and Sat 08:10 UTC, Aug to Oct |
| `honours-county-cricket.yml` | 5 Oct annually |
| `honours-rugby-league.yml` | 5 Nov annually |
| `majors-ingest.yml` | daily 05:30 UTC |
| `staleness-watch.yml` | every 6h, dead-man's switch |
| `updates-drift-watcher.yml` | daily 09:00 UTC |
| `wnba-refresh.yml` | daily 08:00 UTC |
| `test.yml` | on push to main |
| `cloudflare-purge.yml` | on deployment_status |

Mini-owned: CFB predictions (Sun 23:40 and Fri 11:40 UTC, roughly Aug to Jan), owners weekly research (Mon 08:00 UTC, proposal-only, never writes), the sound pipeline (Wed 07:30, runs from a separate drifted copy in OneDrive), api-football refresh (daily 05:00 UTC), the weekly boundary refresh (Sun 08:01). GitHub scheduled runs fire one to four hours late; across 348 measured runs, never call a job a no-show before cron plus three hours.

### 7.9 The five project skills

Under `.claude/skills/`:

- **`workbook-sync`** orchestrates the full seven to nine step refresh through `scripts/run-workbook-sync.py`: sync, stage leagues, extract, NFL, NBA, MLB, NHL, sports index, boundaries, check imports, tsc. It stages league workbooks out of OneDrive first so sharing-violation aborts surface early. Standing rule: **ask before commit**. It proposes the commit and stops.
- **`cl-lookup-sync`** is a diff-first replacement for a destructive DELETE-then-INSERT mirror that silently reverted Supabase corrections not yet in the workbook. Four verdicts: ADD, CHANGE, REMOVE, HELD. Holds live in `references/protected_rows.json`, because rulings recorded only in `HANDOFF.md` get reverted, since nothing reads that file at sync time.
- **`apifootball-refresh`** keeps `football_standings`, `football_fixtures` and `football_lookup` current. Split by machine: `sync_lookup.py` is Windows-only, `refresh.py` is mini-only. Hard invariant: every api-football team must resolve to a Lookup club or `--write` exits 3.
- **`mktcap-refresh`** ingests CompaniesMarketCap and CB Insights weekly into `mktcap_*`. Writes need the service-role key. Aborts on a source-count swing above 5 percent week over week. It does not touch `public/data`; a manual xlsx import bridge is required before `workbook-sync` picks it up.
- **`handoff`** governs the `HANDOFF.md` protocol, including the CRLF hazard.

### 7.10 Engineering norms

- **Fix the class, not the instance.** This is the single most repeated correction on the project. Recurring bug classes get root fixes plus regression guards, not per-case patches.
- **Bulk jobs need a budget gate.** Anything above roughly fifty repeating units requires piloting a random sample (not the top of the list), projecting cost, and stopping for approval.
- **New automation is dry-run by default** until `--write`, and is promoted into the mini runner or a workflow only after a reviewed live run.
- **Every `scripts/civic/*.py` has `--self-test`** against real messy production cases, gated in both the mini runner and the workflow.
- **When upstream data is ambiguous, log and stop.** Do not guess. `civic_common.py` logs unresolved cases rather than inventing a holder.

---

## 8. The standing rulings

These are closed decisions. Quote them back rather than re-opening them, unless a stated condition has changed.

### Product and taste

- **"A metrics board is not a page."** Ashwin, 2026-08-21, on `/teams/nfl/expectation`: "I don't know what to do with this page. Even someone as nerdy about stats just doesn't see a use for this." The board was retired to a 301. The general form: a page that shows a metric without telling the reader what to do with it does not ship.
- **Heartbreak Index taste ruling.** Deaths and tragedies are never priced as pang events.
- **Heysel stays on the boards.** "The game was still played."
- **Ground Floor is a separate scoreboard, never merged with the power ranking.** "Merging them would hide the only thing worth knowing: how far apart they are."
- **Champions next-title dates:** flag a past-due date, never auto-roll it.
- **Owners watchlist:** a deal is resolved only when a league approval or a completed closing is actually reported.
- **Boxing vacancy convention:** a competition with no current row is how the ledger represents a vacancy.

### Club football greatest games (the largest recent build)

- Unified Elo, not per-competition Elo.
- 2026-08-31: the workbook `Exclude` flag governs **league rows only**. UEFA rows always score. The original v1 defect was that the exclude filter rated no European football before 2014.
- Final universe: **league plus UEFA plus ten major domestic cups.** No Libertadores, AFC, CAF or CONCACAF. Playoff pseudo-competitions do not score. Russian and Soviet league matches do not score. A rivalry stakes floor applies.

### Elections and constitutions

- 2026-09-01: reframe the US constitutional idea into a **global comparative constitutions hub**.
- Universe is the full Comparative Constitutions Project set, not the roughly eighty-polity elections coverage rule.
- Serbia (CCP code 340) is the successor to Yugoslavia and to Serbia and Montenegro. Russia (365) follows the same pattern.
- `_names.json` is the lineage resolver. No defunct-registry entries are needed.
- **Uncodified constitutions are a first-class form.** Inclusion rule, the middle of three options: statutes that condition the citizen-state relationship in a general way or alter fundamental rights, plus the franchise landmarks.
- The endurance model publishes descriptive findings. The per-country forecast does not ship.
- The site will not be monetised. The condition attached: build the constitutions module as one isolated, removable module.

### Predictions and NFL

- Prediction hub strategy, 2026-08-22: **no money, but market-aware.** Bookmaker and exchange prices are a data column, never a partnership. Refused: sweepstakes, coins, real money, affiliate odds links, parlays, a daily three-task loop, and another per-sport metrics board.
- NFL Program 2026, agreed 2026-08-30: strategy blueprint first then builds; the north star is all three of model skill, audience and engagement, staged; full nflverse adoption; sentiment analysis refused; picks deepened only, with no DFS-style lineup game and no duel.
- **The backtest gate.** Every model feature must beat the market Brier score on a walk-forward basis from 1999 to 2025 before it ships. v3 runs in shadow until it passes. Recorded results: EPA alone at minus 6.10 percent fails; Elo re-expressed at minus 4.08 percent; Elo plus EPA at minus 3.42 percent passes, later tuned to minus 3.15 percent over 2001 to 2025 with an honest split (tune on 2001 to 2012, validate on 2013 to 2025). A finer grid corner won the tune window and lost validation, which is the split doing its job.

### Brand, IP and commercial

- **April 2026: reach over subscription revenue.** Paid features activate only after reach justifies them. B2B licensing only on inbound demand.
- 2026-08-22: do **not** file a TM26(N) revocation now against the German Konstanz "Citizen of Nowhere" luggage mark.
- Filing plan: UK TM3 in classes 35 and 41; a US direct filing rather than Madrid; a UK limited company, with no US entity until a named trigger.
- **X and Twitter are permanently and hard-excluded from all distribution.**

### Geography

- District rows with no metro **by design**: South Norfolk (Hethel), Breckland (Thetford, Hingham), South Kesteven (Bourne), Vichy, Romorantin-Lanthenay. Do not re-propose.
- The `guangzhou` row remains one metro area. Do not re-propose a split.
- The workbook is ground truth for coordinates and continent.

---

## 9. Dead ends: do not re-propose

- **The exposure essay.** Never mention, propose or redraft it, in any form.
- **Content-gap nagging** of the "the build is ahead of the narrative" kind.
- **Twitter and X recommendations.**
- **Political taxonomy on Citizen of Nowhere**, and unsolicited nudges on Israel and Palestine boundary questions. West Bank and Gaza stay under Palestine.
- **ClubElo as a benchmark.**
- **The formal constitutional rigidity index.** It failed a hand check, ranking Uganda most rigid and Germany near the bottom, with three unfixable causes. Do not rebuild it.
- **An injunction or survival classifier on executive orders.**
- **Invented composite indices**, for example a "separation of powers index" or a "federalism drift predictor."
- **Any risk score on a named living administration.**
- **A Federalist Papers corpus.**
- **A per-country constitutional-life forecast.** It failed a walk-forward backtest: the 1999 cut predicted 91 against an actual 134 by 2019.
- **A DFS-style NFL lineup or duel game**, sentiment analysis in the model, affiliate odds links, parlays, a daily three-task loop, another per-sport metrics board.
- **Re-enabling `f1-refresh.yml` or the civic-data-refresh schedule** without checking `HANDOFF.md` first. The mini owns them.
- **Fabricated verification.** "Verified" means a live lookup performed in the current session, not an inference.
- **Bypassing bot protection.** PFR sits behind Cloudflare Turnstile. The mini correctly refused to bypass it, and that rule binds every session.

---

## 10. Hard-won lessons

These are worth reading as a set, because they generalise well beyond this codebase.

**Spatial and statistical**

- **Never sample a spatial field at a centroid.** The centroid sat at the 98.5th to 100th percentile of exposure, that is, the metro's dirtiest cell. Correcting to population-weighting over the boundary moved 1,720 metros by more than 100 rank places.
- **Never generalise one dimension's correction magnitude to another.** NO2, sharply peaked, moved 29.5 percent of metros by more than 20 percent. PM2.5, smooth, moved 1.7 percent. Province-level water data could not move 1,629 metros at all.
- **Test for domain sentinel values, not just NaN.** SatPM2.5 uses `-999` for ocean and no-data across 63 percent of the grid, with zero actual NaNs. A NaN-only guard ranks the ocean as the cleanest air on earth.
- **A raster's coordinate axis may not be uniformly spaced.** GlobalNO2_AiT drops empty southern rows, so arithmetic indexing put London at latitude minus 28.55. Binary-search the axis.
- **H3 hex grids are a join key and a presentation layer, never the analysis unit.** Binning before averaging costs accuracy you cannot recover.
- **A panel that looks like it stopped may have changed recording mode.** The CCP switched to event-only recording from 2020. Reading the missing filler rows as missing coverage produced a false claim that 145 of 196 countries' records stopped in 2019.
- **Two Brier scales must never share a column.** Use `1 − model/market Brier` as the universal unit.
- **A raw correlation can invert under a control.** The raw minus 0.21 accumulation-versus-conditions correlation becomes plus 0.33 partial once population is controlled. The general claim did not survive; the per-metro gap did.

**Pipeline and data integrity**

- **A builder that overwrites rather than merges can destroy curated history.** On 2026-09-01 the conflicts refresh replaced five centuries of curated and scraped war data with 75 scrape-only rows from 1945 to 2026. It was caught and fully recovered in commit `8849f5577`, which restored the file from `af4c2a596`. The fix pattern is now standard: merge forward, and refuse to write any output that would shrink the dataset. The same guard has since been added preemptively to `build_champions.py` and `build_intl_basketball.py`.
- **A destructive full-mirror sync silently reverts out-of-band corrections.** Hence `cl-lookup-sync` and `protected_rows.json`.
- **Regenerating a whole artifact from one script can clobber another script's later edits.** `gen_hub_early.py` rewriting whole football hubs wiped the Belgium play-off splice. The rule recorded verbatim: always rerun `splice_belgium` and `backfill_cups` after `gen_hub_early`.
- **Hardcoded per-season years rot silently.** `lib/teamMarkers.ts:115` hardcodes `CWUR_INDEX_URL = "https://cwur.org/2026.php"`. That one is current, confirmed live on 2026-08-25, but it is a manual bump every year. A general pre-season hardcode audit is on the backlog and has not been built.
- **A feed can die quietly.** The nflverse injuries feed died after 2024 with no announcement.

**Platform and API**

- **A GitHub API 404 under secondary rate limiting reads as "no data."** Retry. Do not trust silence.
- **RLS enabled with zero policies returns empty arrays over HTTP 200, not an error.** This is the `skydb_structures` incident, and `PICKEM-SPEC.md` calls it out as the exact failure mode a naive leaderboard table would reproduce. Write policies at table-creation time.
- **`.deploy-status.json` is stale by design.** Never trust it and never edit it.
- **`CappedList` cannot cap table rows.** It renders `<details>` inside `<tbody>`, which is invalid, silently hoisting rows out of table layout and jumping columns at the cap boundary. The house fix is a real table at `hidden sm:block` plus capped cards at `sm:hidden`.

---

## 11. Design, content and editorial standards

### 11.1 Design (DESIGN-STANDARDS.md, 496 lines)

The document exists because "the site keeps shipping pages excellent on 1440px desktop and unusable on a phone while passing every automated gate at the time." Two documented failure rounds: `/business` on 2026-08-02 and 03, and a sweep of 25 routes on 2026-08-30 that found nine failing, with `/teams/national` at 50.4 phone screens against 4.3 desktop screens.

**Three laws.** Measure, do not eyeball. The phone gets the same information at a different density, never less. Copy an existing idiom rather than inventing one.

**The mechanics that matter:**
- Phone-clean at 390px. No page-level horizontal scroll. Grid children containing tables need `min-w-0`.
- Density by environment. A desktop `<table>` gets a free 80vh scroll box from `globals.css`. The `sm:hidden` card twin gets nothing, so any mobile list above roughly twelve rows must use `<CappedList>` from `app/_shared/Disclosure.tsx`. Secondary sections use `<Disclosure>`.
- `npm run check:mobile` enforces this against the `scripts/mobile-baseline.json` ratchet. Never grow it. `npm run probe:mobile` drives real Chromium at 390px. A mobile-to-desktop length ratio above 3.0x is always a bug.
- Every desktop table control must exist on mobile. The idiom is a sort `<select>` plus a direction button.
- Rank-first tables need `data-sticky-col="2"` or `stickyCol={2}`, checked against `scripts/table-scroll-rank-baseline.json`.
- Value before metadata. Low-priority columns get `hidden sm:table-cell`, never in the first two columns.
- One share card everywhere. Never hardcode the site-name suffix. `summary_large_image` always. `app/opengraph-image.png` and `twitter-image.png` must never be deleted.
- `app/SiteNav.tsx` is `sticky top-0` and never `fixed`. Content starts with ordinary `pt-8` or `py-8`, never nav-clearance padding. The `fixed` to `sticky` change was the root cause fix for mobile nav overlap.
- 44px tap targets, using the `tap-row` plus `tap-target` primitive. Counting visible elements needs `checkVisibility()` so hidden `<details>` content is not counted.
- The 1024px mega-menu breakpoint is a measured constant, not a guess.

### 11.2 Content and distribution (CONTENT.md, gitignored)

Reach over subscription revenue for 90 days. Channel priority: Substack long-form weekly on Tuesday morning, then Reddit, then LinkedIn twice a week, then Substack Notes three times a week, then Bluesky and Threads as needed. TikTok, Reels and YouTube long-form are deprioritised or conditional on validation. **X is permanently excluded.**

Four templated openers exist for four anomaly types: polarity, score sensitivity, obscurity, and contested editorial calls. There is a twelve-point per-piece checklist: hook in the first paragraph, canonical URL in the body, methodology link, hero image, subscribe and share buttons, three to five tags, an author note; then Reddit within two hours, LinkedIn within 48 hours, a Notes teaser within 24 hours, a day-seven follow-up and an optional carousel.

**The LLM policy, and it is directly relevant to Hermes.** LLM use is permitted for research briefs, historical-context summaries, contested-call identification, headline candidates and teaser variants. It is disallowed for article body copy, Top Teams rationale, methodology copy and video voiceover scripts. The principle: **LLMs stay upstream of the writing, not in the writing.**

---

## 12. The review-memo protocol: how an external AI reviewer already works here

There is a precedent Hermes should inherit and improve on. A second AI (referred to as Gemini) has been independently reviewing the live site and sending unsolicited critiques and product requirement documents. Claude replies with formal adjudication memos, saved in the project document folder as `Reply to Gemini - <topic> - <date>.md`.

The structure of those memos is consistent and effective:

1. **Header line.** From, date, subject.
2. **The short version.** The verdict, up front, in two or three sentences.
3. **Where you are right.** Concede the real points explicitly and specifically.
4. **Where the data disagrees with you.** Correct the reviewer's claims against live or current data, with the actual figures. This section is where the value is. Examples include disproving a "despair" thesis and catching stale ranking numbers used as evidence.
5. **What this actually costs and sequences into.** Feasibility, not just merit.
6. **The close: what belongs to Ashwin.** Name the decision and hand it back. "Ashwin adjudicates." "The dial belongs to Ashwin."

Worked example of the verdicts in the monetisation exchange: B2B licensing parked on rights, operations and market grounds, since Sportradar, Nielsen and Gracenote own that market. A premium Banter Engine tier declined as sequencing backwards for a beta with single-digit testers. The Heartbreak Index accepted, but re-scoped from a monetisation epic to a content feature. Fantasy Metro flagged as real-money gaming risk under the UK Gambling Commission if it ever charges.

**What this means for Hermes.** Hermes is now a formal participant in a three-way editorial review: Ashwin, Claude and Hermes. Claude has been acting as the gatekeeper and fact-checker against external proposals. That role is available to whichever agent has live access at the time. Hermes should assume that any proposal it makes will be checked against the live data, and should therefore state its evidence and its confidence explicitly.

---

## 13. Active workstreams, status and next step

| Programme | Status | Next step or blocker |
|---|---|---|
| **Club football greatest games** | Shipped 2026-08-31. Unified Elo plus Game Score v10 across leagues, UEFA and ten domestic cups. Four stakes-integrity gates with a 21-row regression suite. | Three open items. Ashwin's ruling on floor and pin candidates (Wigan 2013, Wimbledon 1988, Sunderland 1973, Hereford 1972, Liverpool 4-3 Newcastle 1996). A workbook master fix list: about 49 rows with the home/away flag wrong, 40 of which credit the win to the wrong club, which also implicates the English Against Expectation ledger. And the 2026-27 live refresh, which is not designed. **Durability risk: the pipeline scripts live in Windows `%TEMP%`, not in the repo.** |
| **Constitutions hub** | WP1 to WP5 built 2026-09-01. 196 countries, 758 systems. | WP6 Wikidata backfill for stale countries. An open route decision: `/constitutions` standalone or under `/elections`. Three defects in `/constitutions/leaders`: rotating offices such as the Swiss presidency and Malaysia's Agong must be excluded; open-ended tenures need next-holder-start backfill; 25 countries' backbone leader rows are excluded and flagged approximate. |
| **Conflicts history** | ✅ Recovered. The 2026-09-01 builder regression that replaced curated 1500-present data with 75 scrape-only rows was fixed and committed in `8849f5577`. `public/data/conflicts.json` now holds 623 rows spanning 1500 to 2026. | Nothing open. Kept here because the incident is the origin of the shrink-guard pattern now applied across builders. |
| **NFL Program 2026** | Blueprint agreed. Stage 1 ETL, backtest, standings and simulation shipped. Headline minus 3.15 percent against market. | The QB layer must pass the backtest gate. Then rest, travel and weather. Then the v3 production build and a shadow ledger. Kickoff is Wed 9 Sep 2026. Gate review around 28 Sep. |
| **Elections hub expansion** | Scoped 2026-08-30. Wave 1 shipped: six country hubs (Greece, Austria, Portugal, Ireland, Philippines, Egypt) plus the German presidency. | Three known defects. The New Zealand forecast date is hardcoded to 2026-10-17 but the real date is 7 Nov 2026. `referendums.json` stops in 2023. The Nigeria date is 16 Jan 2027, not February. A date resolver must ship before 4 Oct 2026. |
| **Citizen of Nowhere Picks** | Phases 1 and 2 shipped 2026-08-10. CFB entry shipped 2026-08-25, ahead of schedule. | MLB Postseason edition is P1 with a hard October deadline. It needs a `'series'` value added to the Supabase `picks` mode check constraint. UCL entry is P2, blocked on the model. Season Locks P2. Social layer P3, deliberately deferred until a player base exists. |
| **Against Expectation** | Shipped. English top-flight 1888 to 2025, plus a cross-sport view at `/sports/expectation`. | 22 bad fixtures. A Wimbledon linkage ruling. A deferred Substack essay on the decline of home advantage. |
| **Boxing, owners and sound** | Shipped 2026-08-27. | The Seahawks sale resolved to the Khosla family at 9.612 billion dollars on a 32-0 vote, but which individual is the designated controlling owner is unsettled, so the family is named. Timberwolves and Lynx are on the watchlist pending the NBA vote on 15 to 16 Sep 2026. The sound pipeline has drifted: three files need copying to the mini before the Wednesday refresh. 443 collaboration entities remain without a metro. |
| **Heartbreak Index** | Shipped, v3.18, 1,148 clubs. | Calibration pass parked. |
| **Ground Floor** | Three dimensions shipped 2026-08-06 and 07: PM2.5, NO2, water and sanitation. | Deliberately rejected, not deferred: vegetation and tree canopy (rainfall confound), built-up density (fails the unambiguous-direction test), ozone (urban NOx titration inverts the signal), Ookla broadband (non-commercial licence), urban heat island (Ashwin's call). |
| **Historical market cap, Tier 1** | Pilot green. | Full sweep parked, awaiting go-ahead. |
| **HQ Wikidata backfill** | Built and pilot-measured. | Full sweep parked. |
| **Trademark and incorporation** | Fully scoped. Nothing filed. | ⏰ The US opposition window on serial 99774268 closes around 17 Sep 2026, extendable to roughly 14 Feb 2027. Note the audit finding: the `legal/` directory does not exist at project root and is not gitignored, so the evidence trail is unaccounted for. |

**Backlog structure.** `BACKLOG.md` at repo root is **frozen as of 2026-08-07** and is a historical record, not a work queue. An audit found 33 of 126 items already shipped, ten with no marker. It stays on disk only because four source files cite it by path. The live queue is `docs/BACKLOG-OPEN.md`: about 80 genuinely open engineering items, plus eight items that need an Ashwin decision rather than a build.

---

## 14. Calendar

| Date | What |
|---|---|
| Wed 9 Sep 2026 | NFL kickoff, New England at Seattle. v3 runs in shadow from week 1. |
| 15 to 16 Sep 2026 | NBA Board of Governors review of the Timberwolves and Lynx sale. |
| ~17 Sep 2026 | US trademark opposition window closes, serial 99774268. |
| ~28 Sep 2026 | NFL v3 backtest gate review. |
| Late Sep 2026 | MLB October pick'em cadence to be commissioned. |
| 4 Oct 2026 | Deadline for the elections date resolver. |
| 5 Oct 2026 | County cricket honours job runs. |
| ~15 Oct 2026 | End of the 60-day job-search strategy test. |
| 5 Nov 2026 | Rugby league honours job runs. |
| 7 Nov 2026 | Actual New Zealand election date. |
| Q4 2026 | Stated relocation to California, which is in tension with the London and Amsterdam roles being pursued. |
| 16 Jan 2027 | Actual Nigeria election date. |
| 30 Jan 2027 | German presidential election, treated as the 2027 calibration set. |
| 14 Feb 2027 | Super Bowl LXI, SoFi Stadium. Also the extended trademark opposition deadline. |

---

## 15. Adjacent context

### 15.1 Commercial position

The standing decision from April 2026 is reach over subscription revenue, with paid features activating only after reach justifies them, and B2B licensing only on inbound demand. The 2026-09-01 constitutions ruling states plainly that the site will not be monetised, which was used to unblock CC BY-NC 3.0 licensed constitutional text. Read those together: the platform is currently a credibility and audience asset, not a revenue line. The revenue path decision is an open P1 item on the backlog, and there is a recorded willingness to reverse the reach-versus-revenue stance if the evidence changes.

Fantasy Metro, if it ever charges, is a UK Gambling Commission risk. That is the sharpest regulatory edge in the portfolio.

### 15.2 Podcast and newsletter pipeline

Outside the repo, at `C:\Users\ashwi\newsletter-podcast\`, two automated shows run: a private daily newsletter digest on Spotify, and a public weekly "Metro Power Rankings" show that narrates the Substack feed. Uploads to Anchor and Spotify for Creators are manual, because Anchor removed its public upload API in 2019. A one-way cross-link writes urban and metro news items into `digest-newsfeed/YYYY-MM-DD.md` inside the project document folder.

### 15.3 Job search and advisory practice

**The mandate.** A senior in-house data, identity and marketing-technology leadership role, Director through C-suite, at a rights holder, media owner or platform, weighted heavily to sport and to football, based in New York or London. Four archetypes: a senior digital, data or product leader in sport; a cross-club or cross-market enablement leader; a commercial platform or ad-product leader in EMEA; a data and technology strategy lead at a growth-stage sports property. Dealbreakers: early-stage startups, campaign-execution roles disguised as leadership, narrow single-tool roles.

**The positioning line.** "I help large, complex organisations modernise fragmented data and measurement environments and turn them into scalable, privacy-conscious operating models across cloud, analytics, product, and marketing teams." Proof points: the NFL (governance and identity across 32 clubs), MLB (a CDP across 30 clubs), Samsung and Digitas (a Google Cloud CDP), Amazon (clean rooms and measurement), Spotify (monetisation measurement at scale). The recurring theme is leadership without authority in federated, league-to-club structures.

**The strategic tension, and it is the most useful thing in this section.** `Two_Strategies_Decision_Memo.md` diagnoses that two conflicting strategies were running at once: take a lower seat to re-enter a sports organisation from the inside, or build the Citizen of Nowhere advisory practice and sell the expertise directly. Both were failing for the same reason, which was near-zero outreach volume rather than a documents problem. The recommendation is a bounded 60-day test to around 15 October 2026 that tracks conversations rather than applications.

**The machinery.** `Job_Search_Workflow_Guide.md` is the master knowledge base: career profile, competencies, a STAR story bank, a weighted ten-criterion fit-scoring rubric (Transformation Scope 15 percent, Strategic Authority 15 percent, Sports Relevance 15 percent, and so on, with 80 to 100 meaning apply immediately), voice rules by region, a "negative inference rule" that forbids inventing gaps, and a fixed three-deliverable workflow per application: fit scorecard, tailored cover letter, tailored CV, logged to a tracker. `Follow_Up_Tracker.md` is the outreach log, with a cadence of an initial touch within 24 to 48 hours, one follow-up after seven to ten days with a new angle, then stop. It was empty at the time of writing, which is the point the strategy memo makes.

**The best idea in the folder, currently unbuilt.** The First-Party Index: publish a free, evidence-based index scoring fifteen major sports organisations on data-ownership maturity, then pre-brief all fifteen with their own scorecard before publication. It buys fifteen warm senior contacts for roughly twenty hours of work, and it uses the platform as the credential rather than the CV. This is the single clearest bridge between the platform and the career, and it is exactly the kind of thing Hermes should keep pushing.

### 15.4 Other projects on disk

- **`Projects/F1 Data/`**: a Formula 1 pipeline loading into Supabase.
- **`Projects/MapData/`**: the Overture Maps parquet cache.
- **`Projects/ollama-mcp-server/`**: a local Ollama MCP server. Ashwin runs local inference on an RTX 4060 Windows machine with Llama 3.1 8B, orchestrated from Claude Code, for bulk classification, cleaning and embedding at zero marginal API cost. His standing rule: use the local model for mechanical, low-stakes work such as bulk reformatting, basic classification and tagging, short factual summarisation and boilerplate drafts. Never for nuance, cross-file reasoning, financial or job-related content, or client-facing writing.
- **`Excel Files/`**: a decade-plus unpruned archive of sports workbooks and Tableau dashboards, including artefacts from previous ad-tech roles. Useful as source material, chaotic as a store.
- **`Alex's Learning/`**: primary-school learning plans for his son, designed around interest-led short sessions that protect enthusiasm rather than drill it.

---

## 16. How Hermes and Claude should work together

The two agents have genuinely different positions, and the division should follow from that rather than from preference.

**Claude's position.** Claude has the tools and the access. It can read and write the repo through a shell on Ashwin's machine, run the verify gate, query Supabase, drive a browser, read email and calendar, and hold the project memory that records every ruling. It is inside the system and can therefore verify.

**Hermes's position.** Hermes has distance. It is not carrying the sunk cost of the last build, it did not write the code it is reviewing, and it can see the portfolio without the tunnel vision that comes from being mid-work-package. It is also, per Ashwin's framing, the second brain that spans the platform, the brand, the writing and the career, which no single working session does.

The failure mode to design against is two agents doing the same work and producing two versions of the truth. The pattern that avoids it is simple: **Hermes proposes and adjudicates; Claude verifies and executes; Ashwin decides.**

### 16.1 Concrete division of labour

| Type of work | Owner | Why |
|---|---|---|
| Strategy, scoping, prioritisation, "should we build this" | **Hermes** | Distance is an advantage. No sunk cost. |
| Reviewing a shipped feature against its own spec | **Hermes** | An outside reader catches what the builder cannot see. |
| Editorial critique, headline candidates, structural notes on a draft | **Hermes** | Upstream of the writing, which is the stated policy. |
| Cross-workstream connections, for example platform to career | **Hermes** | Only the second brain sees both sides. |
| Devil's advocate on a model result | **Hermes** | The backtest gate needs an adversary. |
| Any factual claim about live data, row counts or the tree | **Claude** | Only Claude can verify. Hermes states the hypothesis, Claude checks it. |
| Code, pipelines, migrations, refreshes, deploys | **Claude** | Tool access, and the guard rails are wired into its workflow. |
| Anything gated by `npm run verify` | **Claude** | The gate runs where the code is. |
| Recording rulings and decisions | **Claude** | Project memory and `HANDOFF.md` are the durable record. |
| Final judgement on taste, scope, money and risk | **Ashwin** | Non-negotiable. Both agents route to him. |

### 16.2 Five workflows worth setting up

**1. The adjudication memo, formalised.** Hermes writes proposals and critiques in the `Reply to` format described in Section 12: verdict first, concessions, then the evidence-based disagreements, then feasibility, then the decision that belongs to Ashwin. Claude replies in the same format with verification results. Both memos go into the project document folder with a date in the filename, so the exchange is a durable record rather than chat history. This is already a proven pattern here; it just needs Hermes named in it.

**2. The claim ledger.** Hermes marks every factual assertion in a proposal as one of three states: `[verified]` if Hermes checked a primary source, `[assumed]` if it is drawn from this brief, `[speculation]` if it is a hypothesis. Claude checks anything marked `[assumed]` or `[speculation]` that the decision depends on, and returns a corrected list. This directly addresses the project's single most-repeated failure mode, which is a confident diagnosis that was never verified.

**3. The pre-mortem on every work package.** Before Claude builds, Hermes writes 300 words on how the build will fail: which data assumption is fragile, which guard is missing, which page will be unusable on a phone. Section 10 of this brief is the evidence that this pays: the centroid sampling error, the `-999` sentinel, the conflicts wipe and the CappedList table bug were all findable in advance by someone asking "what would make this silently wrong."

**4. The Monday portfolio review.** Once a week, Hermes reads the release notes at `/updates`, the tail of `HANDOFF.md` and the open backlog, and returns one page: what shipped, what slipped, what is now the highest-value next move across all workstreams, and one thing that should be dropped. The value is in the last item. The project's pattern is accumulation, and the frozen `BACKLOG.md` with 33 already-shipped items is the evidence.

**5. The career and platform bridge.** Hermes owns the connection between the platform and the job search, because no working session ever gets to it. The First-Party Index is the immediate case: it is scoped, it is unbuilt, it uses the platform as the credential, and the 60-day test ends around 15 October 2026. Hermes should be the agent that keeps asking whether the week's building serves that.

### 16.3 What Hermes should ask for, and what it should never do

**Ask for:** the current `HEAD` hash and date before reasoning about state; a live figure before quoting a row count; the relevant ruling before proposing anything in an area covered by Section 8.

**Never do:**
- Re-propose anything in Sections 8 or 9 without opening on what changed.
- Present an inference as a verified fact. The house standard is that "verified" means a live lookup in the current session.
- Propose a new metrics board, a money-based game, an affiliate odds link, or an X and Twitter strategy.
- Nag about the content gap. It is a closed topic.
- Assume a memory record is current. Git is the truth; memory records intent at write time.

---

## 17. Open questions for Ashwin

These are live and blocking. They are decisions, not builds.

1. **Floor and pin candidates** for the club greatest games boards: Wigan 2013, Wimbledon 1988, Sunderland 1973, Hereford 1972, Liverpool 4-3 Newcastle 1996.
2. **The constitutions route:** `/constitutions` standalone, or under `/elections`.
3. **The trademark filing decision.** The dossier has been complete since 2026-05-09. The opposition window closes around 17 Sep 2026. The `legal/` directory is missing from the project root.
4. **The revenue path.** Reach over revenue was decided in April 2026, and the reversal condition has never been named.
5. **The 60-day strategy test.** It ends around 15 October 2026. What is the decision rule?
6. **Where the club greatest-games pipeline scripts should live.** They are currently in Windows `%TEMP%`, which is a durability risk on a shipped feature.
7. **The workbook home/away fix list:** roughly 49 rows, 40 crediting the wrong winner, which also implicates the Against Expectation ledger.

---

## 18. Maintenance of this brief

This document ages in three ways: the git HEAD moves, the row counts move, and the calendar passes. Anything in Sections 5, 6, 13 and 14 should be treated as a snapshot dated 2026-09-02 and re-checked before it is quoted. Sections 7, 8, 9, 10, 11 and 12, the operating model, the rulings, the dead ends, the lessons, the standards and the review protocol, are the durable core and change slowly.

Suggested cadence: Claude refreshes Sections 13 and 14 monthly, or after any programme ships, and appends new rulings to Section 8 in the session in which they are made.

**Note for whoever commits this file.** It touches neither `app/`, `lib/`, `public/` nor build config, so the commit subject must carry `[vercel skip]`.
