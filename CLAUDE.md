# CLAUDE.md

Working notes for any Claude Code instance operating on this repo — this file
loads automatically at session start. Written for Ashwin's two standing
instances (one on his Windows/cloud session, one on the Mac mini with real
filesystem + network access) plus any one-off session that picks this repo up.

## What this is

`rankings.citizenofnowhere.org` — a Next.js site (App Router) that serves
metro-area power rankings, sports team pages, and civic/officeholder data.
Two halves:
- **Frontend** (`app/`, `lib/`) — reads pre-built JSON from `public/data/**`
  via ISR. It does NOT compute rankings or fetch live data itself.
- **Data pipeline** (`scripts/**`) — Python (mostly) and a few `.mjs`/`.ps1`
  scripts that build/refresh `public/data/**` from source workbooks
  (`*.xlsx`), Wikidata SPARQL, ESPN, ForbesAPI, Supabase, etc. Scheduled via
  `.github/workflows/*.yml` and, for egress-sensitive jobs (Wikidata rate-
  limits shared GitHub runner IPs), via `mac-mini-jobs/metro-mini-refresh.sh`
  and friends running as launchd jobs on Ashwin's physical Mac mini.

Read `mac-mini-jobs/README.md` and `mac-mini-jobs/REBUILD-RUNBOOK.md` before
touching anything under `mac-mini-jobs/` — they document the launchd wiring
and disaster-recovery steps this file doesn't repeat.

## Session model — know what you can and can't verify

- **This is one of possibly two live Claude Code instances.** A cloud/web
  session (isolated container, zero filesystem access to anything outside
  its own clone, zero access to the physical Mac mini) and a session running
  directly on the mini (real filesystem, real network egress, can actually
  execute the mini's scripts and see their output). **Never assume you are
  the mini** — check `hostname`/`whoami` if genuinely unsure which you are.
- **`HANDOFF.md`** is the async coordination channel between the two. Read it
  before starting nontrivial civic/data work, follow its protocol (pull
  `--ff-only`, append a dated entry, don't rewrite others' entries, commit
  with `[vercel skip]`, push) and leave the next session — yours or the
  other instance's — enough evidence to pick up cold. `HANDOFF-ARCHIVE-*.md`
  holds closed threads; don't dig there unless investigating history.
- **If you have no network egress**, you cannot verify a live-data claim by
  reasoning about it — you can only get real evidence by (a) dispatching a
  GitHub Actions workflow with `workflow_dispatch` and reading its logs, (b)
  asking the user to run a command on the mini and paste output back, or (c)
  using an MCP tool that has its own real egress (Supabase, Vercel, GitHub).
  **Do not report a diagnosis you haven't verified this way as fact.** "WDQS
  must be down" turned out to be wrong two months running — the actual bug
  was a query-optimizer join order issue. Assume your own code first.

## The working loop for data/pipeline fixes

This project has organically converged on a discipline worth keeping
explicit — apply it before touching any refresh script:

1. **Get real evidence before diagnosing.** A live dispatch run, an actual
   error traceback, or mini output pasted back — not a plausible-sounding
   guess. If a script is failing, find the actual failing line/query before
   proposing a fix.
2. **Prefer the smallest reversible change** at the point that actually owns
   the problem (the query, the timeout, the disambiguation heuristic) over a
   broad rewrite.
3. **New automation is dry-run-by-default.** A refresh script touching data
   that was previously hand-curated (see `scripts/civic/refresh_cabinet.py`,
   `refresh_house_leadership.py`) prints what it *would* change but doesn't
   write until `--write` is passed, and only after a live run has been
   reviewed for accuracy. Once validated, promote it into
   `mac-mini-jobs/metro-mini-refresh.sh` and/or the matching workflow step.
4. **Self-test before any network call.** Every `scripts/civic/*.py` script
   has a `--self-test` covering its pure decision logic (dedup, disambiguation,
   date-plausibility heuristics) with real messy cases hit in production —
   not synthetic happy paths. Run it before every live run; both
   `metro-mini-refresh.sh` and `civic-data-refresh.yml` gate on it.
5. **When data is genuinely ambiguous or missing upstream, say so and stop —
   don't guess.** `discover_positions_by_sitelinks()` and `pick_holder()` in
   `scripts/civic/civic_common.py` log an unresolved case and leave existing
   curated data untouched rather than picking a plausible-looking wrong
   answer. Some things (e.g. House Majority/Minority Whip) simply aren't
   modeled in Wikidata yet — that's a fact to document, not a bug to force a
   fix for.
6. **Verify against the real system, not just a local check.** For frontend
   changes, `npm run verify` (typecheck, client-import check, public-data
   check, table-scroll check, `vitest run`, `next build`) is the closest
   thing to a native proof standard here — run it before calling a UI change
   done. For data pipeline changes, that means an actual dispatch/mini run,
   not just `--self-test` passing offline.

## Deploy discipline (this one costs real money — see below)

> **HARD RULE, no exceptions.** Every commit that does **not** change `app/`,
> `lib/`, `public/` or build config carries the skip marker in its SUBJECT
> line. That means every handoff entry, every `mac-mini-jobs/` change, every
> `scripts/` change, every doc. This applies to the Mac mini's commits exactly
> as much as to yours. **On 2026-08-06 thirteen production builds ran in one
> day** against a 2/day budget, every one of them an untagged
> HANDOFF.md/`mac-mini-jobs/` commit. See
> `feedback_vercel_build_budget_incident` and the HANDOFF entry of that date.
>
> **Check, don't assume.** Count builds with the Vercel MCP
> (`list_deployments`, count `state: READY` — `CANCELED` is free) at the start
> and end of any session with more than ~3 pushes. Do **not** count GitHub
> `deployment_status` events: that endpoint returns **404 under secondary rate
> limiting**, which reads as "no builds" when it means "no answer". That is
> exactly how the 13 went unnoticed for three hours.
>
> **Batch.** One commit per work item, not one per exchange. A handoff entry is
> not worth its own push if another change is ten minutes behind it. Commit
> volume is what turns a latent guard bug into a bill.

- The frontend reads *some* of `public/data/**` via ISR straight from GitHub
  raw, so **those data refreshes need no Vercel build**. Every automated commit
  that only touches data/scripts/docs must carry `[vercel skip]` in the
  message.
- `vercel.json`'s `ignoreCommand` also path-checks the diff (`app/`, `lib/`,
  `public/`, and build config files) as a backstop in case `[vercel skip]`
  gets forgotten on a commit that doesn't actually need a build.
- **The path check includes `public/data` on purpose. Do not "optimise" it
  out.** It looks redundant, because the ISR-from-raw pattern is the one people
  read about first. It is not: `lib/` and `app/` hold **313 `readFileSync`
  sites** that bake `public/data` in at build time — metros, every sport, every
  elections file, the football season hubs, state facts, the quiz. The
  ISR-backed files are the minority. Excluding `public/data` would silently
  stop deploys for all the rest, and silence is the expensive failure here.
- `scripts/vercel-ignore.sh` **fails closed**: if it cannot resolve the base
  commit it skips rather than builds, because a missed deploy is auto-healed by
  `mac-mini-jobs/run-deploy-watch.sh` and a spurious deploy is healed by
  nothing. It used to fail open, which is what caused the 13.
- That script has a regression suite, `scripts/test-vercel-ignore.sh`, pinned
  to real commits and run in CI (`test.yml`, job `vercel-ignore-guard`, which
  needs `fetch-depth: 0`). **Change the guard, run the suite.**
- The build-relevant path list is a single shared file,
  `scripts/vercel-build-paths.txt`, read by both the guard and the
  `prepare-commit-msg` hook so they cannot drift. **The guard scripts are
  deliberately NOT in it** — editing them cannot change the built artifact, and
  CI proves them for free; leaving them in cost build #14 on 2026-08-06.
- `.githooks/` (auto-tag + post-commit re-check) is **per-clone config and is
  not automatic**. On any machine working this repo, run once:
  `git config core.hooksPath .githooks`. It was inert on the Windows box for
  its first hours of existence because nobody had.
- A change to `public/data/leaders/**` (per-country leadership history) DOES
  need a real build — country pages read it at build time, not via ISR. The
  commit message convention for that case is visible in
  `.github/workflows/civic-data-refresh.yml` and `metro-mini-refresh.sh`.
- Before pushing multiple commits in a row, think about whether each one
  actually needs to trigger a build. Ashwin has been billed for avoidable
  Vercel builds before; don't repeat it.

## Where things live

- `scripts/civic/` — officeholder refresh pipelines (mayors, governors,
  Congress, Cabinet, House leadership), all built on the shared
  discovery-cache + hot-path pattern in `civic_common.py`.
- `.github/workflows/civic-data-refresh.yml` — GitHub Actions fallback for
  the civic refreshes; currently workflow_dispatch-only (schedule disabled,
  the mini owns the weekly run — see the comment at the top of the file for
  why, and don't re-enable both without checking HANDOFF.md first).
- `mac-mini-jobs/metro-mini-refresh.sh` — the mini's own weekly wrapper;
  mirrors the civic-data-refresh Action but runs from a stable residential
  IP that Wikidata doesn't rate-limit as aggressively.
- `package.json` scripts — `npm run verify` is the full local proof gate for
  frontend work.

## Frontend design standards (non-negotiable)

- **Read `DESIGN-STANDARDS.md` before building or redesigning any hub or
  page.** It is the full look-and-feel contract (skeleton, nav idioms,
  theme tokens, table rules, mobile checklist). The bullets here are only
  the non-negotiable core.
- **Phone-clean at 390px, always: no page-level horizontal scroll.** Any
  grid child containing a table needs `min-w-0` (grid items default to
  `min-width:auto`, so a wide table otherwise drags the whole page
  sideways — /business shipped this broken on four tabs, 2026-08-03).
- **Rank-first tables pin the identity column on phones.** A table whose
  first header is `#` must declare `data-sticky-col="2"` (or
  `stickyCol={2}` on TableBox) so swiping keeps the name visible, not the
  rank. Enforced by `check:table-scroll` rule 2 against the ratchet
  baseline `scripts/table-scroll-rank-baseline.json` — shrink it as files
  get fixed, never grow it.
- **Value before metadata on ranked boards.** The headline value column
  sits right after the identity column; low-priority columns (Country and
  similar) take `hidden sm:table-cell` (`SMCOL`), and never in a table's
  first two columns.
- **One share card everywhere.** Titles never hardcode the site-name suffix
  (the layout template appends it); twitter card is `summary_large_image`,
  never `summary`; `app/opengraph-image.png`/`twitter-image.png` are the
  sitewide fallback share image and must not be deleted. Full rules in
  DESIGN-STANDARDS.md "Link sharing / social cards".
- **The site nav (`app/SiteNav.tsx`) is `sticky top-0`, never `fixed`.** It
  occupies its own layout space, so page content can never render underneath
  it — on any viewport. Consequence for every page, new or redesigned: start
  content with ordinary whitespace (`pt-8`/`py-8` on the `<main>`); NEVER add
  nav-clearance padding (the old `pt-24`-style offsets). If content ever
  appears under the top menu again, someone reintroduced `fixed` or a
  negative offset — fix the cause, not the page. Anchor targets still need
  the global `[id] { scroll-margin-top }` rule in `globals.css`, because the
  bar does overlay content once you scroll.
