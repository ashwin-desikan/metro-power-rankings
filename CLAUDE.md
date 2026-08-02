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

- The frontend reads `public/data/**` via ISR straight from GitHub raw, so
  **routine data refreshes need no Vercel build**. Every automated commit
  that only touches data/scripts/docs must carry `[vercel skip]` in the
  message.
- `vercel.json`'s `ignoreCommand` also path-checks the diff (`app/`, `lib/`,
  `public/`, and build config files) as a backstop in case `[vercel skip]`
  gets forgotten on a commit that doesn't actually need a build.
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

- **The site nav (`app/SiteNav.tsx`) is `sticky top-0`, never `fixed`.** It
  occupies its own layout space, so page content can never render underneath
  it — on any viewport. Consequence for every page, new or redesigned: start
  content with ordinary whitespace (`pt-8`/`py-8` on the `<main>`); NEVER add
  nav-clearance padding (the old `pt-24`-style offsets). If content ever
  appears under the top menu again, someone reintroduced `fixed` or a
  negative offset — fix the cause, not the page. Anchor targets still need
  the global `[id] { scroll-margin-top }` rule in `globals.css`, because the
  bar does overlay content once you scroll.
