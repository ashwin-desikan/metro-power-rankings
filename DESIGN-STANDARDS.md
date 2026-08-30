# DESIGN-STANDARDS.md — the look, feel and behaviour contract

Read this before building or redesigning ANY page, hub, table or control.
CLAUDE.md carries the short non-negotiables; this file is the full standard,
and it binds every Claude instance and every human working this repo.

It exists because this site keeps shipping pages that are excellent on a
1440px desktop and unusable on a phone, while passing every automated gate
in place at the time. Two documented rounds of that:

- **2026-08-02/03** — /business shipped with page-level horizontal scroll on
  four of nine tabs and every ranked table pinning the rank number instead
  of the name. `check:table-scroll` was written that night.
- **2026-08-30** — a measured sweep of 25 representative routes at 390px
  found **9 failing**. `/teams/national` ran **50.4 phone screens** against
  4.3 on desktop; `/leaders` **29.3 against 1.6** — eighteen times the
  desktop length for the same data. `/screen` scrolled sideways to 423px.
  None of it was visible in source review. `check:mobile` and
  `probe:mobile` were written that day.

The pattern in both: **the failure was in the mobile half of a responsive
pair, and nobody had measured it.** Everything below follows from that.

---

## 0. The three laws

1. **Measure, don't eyeball.** A mobile claim you have not measured at 390px
   is a guess. `npm run check:mobile` for the static rules; `npm run
   probe:mobile` for the real browser. Neither is optional before calling a
   UI change done.
2. **The phone gets the same information, at a different density.** Not
   less data, not a nested scroll box, not a cut-down page — the same board,
   with the tail one tap away. See §2.
3. **Copy an existing idiom before inventing one.** Every hub already has a
   header, a tab row, a table shell, a sources card. Reinventing one is how
   the site drifts into nine dialects of the same page.

---

## 1. The page skeleton

Every page, hub tab and board:

1. `<main className="mx-auto max-w-6xl px-4 py-8">` — ordinary padding.
   **NEVER add nav-clearance padding** (`pt-24` and friends). `app/SiteNav.tsx`
   is `sticky top-0`, never `fixed`: it occupies its own layout space, so
   content can never render under it. If content appears under the bar,
   someone reintroduced `fixed` or a negative offset — fix the cause.
   Enforced by `check:mobile` rule NAV_CLEARANCE.
   (Both `/sound` and `/screen` carried a dead `pt-12` clearance wrapper for
   months after the nav became sticky — pure wasted vertical room on the
   viewport with least of it. Removed 2026-08-30.)
2. **Breadcrumbs** — `Crumbs` in /business, same idiom elsewhere: Home / Hub
   / Tab, `text-xs`, muted.
3. **Header block** (`TabHeader`): emoji + `h1` (`text-3xl sm:text-4xl`), a
   one-line sub in muted 15px, then a MONO uppercase stamp carrying "as of"
   + row counts + source. **Every data page states its source and as-of
   date.**
4. **Tab nav** — a flex-wrap underline row (`BusinessNav`/`SoundNav`/
   `ScreenNav` idiom): `px-3 py-2 text-sm font-semibold`, active = 2px
   accent underline. Add the tab to the nav in the SAME commit that adds
   the page.
5. **Sections** — `SectionHead` (h2 `text-2xl font-bold` + muted sub,
   `max-w-3xl`), with anchored ids for deep links (`[id]` scroll-margin is
   global in globals.css).
6. **Close with a "Where these numbers come from" card** — `rounded-2xl`
   border, 13.5px muted prose, sources and caveats.

Anchor targets still need the global `[id] { scroll-margin-top }` rule,
because the sticky bar does overlay content once you scroll.

---

## 2. Density by environment — the load-bearing idea

**A desktop viewport has room; a phone viewport has taps.** The same board
should therefore render at two densities from ONE tree, with CSS choosing.

This is the rule the site kept breaking. The mechanism is that a responsive
board renders twice — a `hidden sm:block` table and a `sm:hidden` card list.
The desktop table is height-capped **for free** by the globals.css
`.overflow-x-auto:has(> table)` rule (an 80vh scroll box). The card list is
not a table, so it inherits **none** of that and renders every row at full
height. A 32px table row becomes a 200px card. Two hundred rows becomes
fifty screens of thumb.

### The primitives — `app/_shared/Disclosure.tsx`

All three are plain server components built on `<details>`: no JS, no
hydration flash, keyboard- and screen-reader-native, and reachable by the
browser's in-page find. They work inside client components too.

| Use | Component |
| --- | --- |
| A long list beside a desktop table | `<CappedList items={…} initial={12} noun="clubs" />` |
| Any secondary section (sources, a breakdown, a roster) | `<Disclosure title="…" meta={…}>` |
| Non-uniform overflow content | `<ShowMore label="Show all 42 metros">` |

```tsx
<div className="grid grid-cols-1 gap-2 sm:hidden">
  <CappedList
    initial={12}
    noun="clubs"
    className="rounded-lg border border-[var(--border)]"
    bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
    items={rows.map((r) => <ClubCard key={r.slug} {...r} />)}
  />
</div>
```

**`data-desktop-open` is how "contracted on mobile, expanded on desktop"
works with no JavaScript.** globals.css force-reveals a marked `<details>`
above 640px. The summary is neutralised there, not removed: a `Disclosure`
summary carries the section TITLE, so it keeps its words and loses only the
chevron and the pointer, reading as a plain heading. `ShowMore` is the
exception — its summary is pure control text, and "Show all 42 metros" is a
false sentence once the desktop shows all 42 — so that one is hidden
outright. `Disclosure` sets `desktopOpen` by default; pass
`desktopOpen={false}` for a genuinely optional appendix that stays
collapsible everywhere, or `defaultOpen` for a section that should also
start open on a phone.

### Rules

- **Every mobile-only list of more than ~12 rows is capped.** `<CappedList>`
  is the default answer. Enforced by `check:mobile` rule
  UNCAPPED_MOBILE_LIST.
- **A cap by count beats a nested scroll box.** A scroll box inside a
  scrolling page traps the thumb and hides the page's own end. Use an
  explicit `max-h-… overflow-y-auto overscroll-contain` only where a scroll
  box genuinely suits (a filter panel, a short reference list), and say why.
- **A bounded list needs no cap.** Three cricket formats, four compare
  columns — "Show all 3" is worse than the list. Mark the container
  `data-mobile-uncapped` with a one-line reason, so the exemption is a
  decision in the code rather than an omission.
- **Reset the cap when the list changes.** In a client component with
  filters or sorting, `key` the `CappedList` on the filter state
  (`key={\`${continent}-${sortKey}-${rows.length}\`}`) — otherwise "show
  all" survives into a list the reader has since narrowed.
- **`ResponsiveTable` caps its mobile list automatically** (`mobileInitial`,
  default 12). Pass `mobileNoun` so the control reads "Show all 20 clubs",
  not "Show all 20 rows".
- **Prefer `variant="list"` over `variant="cards"`** for anything
  standings-shaped: ~40px a row against ~200px. `cards` is only for
  genuinely card-shaped data.
- **A `<Disclosure>` is the right container for a secondary section** even on
  desktop — it is open there, so it costs the desktop reader nothing and
  saves the phone reader a screen.

### Profile pages: the catalogue collapses, the identity does not

A profile page (`/rankings/[slug]`, `/countries/[slug]`, a club page) is a
headline fact plus a catalogue of domains. Those two halves get opposite
treatment:

- **The identity block is always open and always first.** Name, rank, score,
  tier. `/rankings/[slug]` rendered its rank/score card LAST on a phone —
  y=1022, below mayor, land area and GAWC class — because the hero was a
  two-column grid and a one-column grid renders DOM order. On a rankings
  site the rank is the headline. Where a grid collapses, check what ends up
  on top; `order-*` or explicit `lg:row-start` placement fixes it without
  touching the desktop layout.
- **Measurements are a stat grid, not sentences.** Nine `Label: value` lines
  became six mono cells in a 2-col/3-col `<dl>`: same facts, a third of the
  height, and the numbers line up where the eye can compare them.
- **Every catalogue section is a `<Disclosure>`** — Sports, Championships,
  Companies, Culture, Education, Infrastructure, Luxury. Open on desktop,
  collapsed on a phone, each with a `meta` count so the closed state is a
  table of contents with substance ("Sports · 109 teams") rather than a
  guessing game. `/rankings/new-york` went from **17.2 phone screens to
  6.6** this way, with the desktop page unchanged.
- **A section nav belongs directly under the hero**, and does not need to be
  sticky once the tail collapses. Thirteen chips wrap to four rows on a
  phone; spending 160px of every screen on navigation is a worse trade than
  one scroll back up.
- **A jump link must reveal what it jumped to.** globals.css force-opens a
  `data-desktop-open` details on `:target`, so tapping "Sports" in the nav
  lands on Sports *open*. Without that rule the nav looks broken on exactly
  the viewport it matters on.

### The number to watch

`probe:mobile` reports **ratio** = phone screens ÷ desktop screens, and it
is the diagnostic number. Above **3.0x** the mobile rendering has lost
containment the desktop rendering has — always a bug, always a hard failure.

Raw length is judged against it rather than on its own. Over **25 phone
screens** AND over 2.0x is the same bug and fails; over 25 screens at a
normal ratio is a long read on every device (/methodology is 28 screens at
1.8x) and is reported as a **warning**. The answer to a warning is in-page
navigation — a `<Disclosure>` jump index over the anchors the sections
already have, as /neighborhoods now carries — not truncating the content.

---

## 3. Width — never scroll the page sideways

**At 390px, `document.scrollingElement.scrollWidth` must be ≤ 390 on every
route.** No exceptions. Wide content scrolls inside its own box; the page
never does.

- **`min-w-0` on any flex/grid child that holds wide content.** Flex and
  grid items default to `min-width: auto`, so a wide table inflates its
  track and drags the whole page sideways. This is the single worst mobile
  failure the site has shipped (/business, 2026-08-03). `TableBox` carries
  it; hand-rolled wrappers need it explicitly. Enforced by `check:mobile`
  rule GRID_CHILD_NO_MIN_W_0.
- **`truncate` and `line-clamp-*` grant their own shrink permission.**
  globals.css gives `min-width: 0` to any element that declares one and to
  its parent and grandparent — because the flex/grid ITEM that has to shrink
  is usually the row or section wrapping the text, not the text itself — in
  `@layer base`, so explicit `min-w-*` utilities still win. That covers the
  231 existing call sites that carried `truncate` with no `min-w-0`. Deeper
  than two levels, write it by hand. It is a safety net, not a licence.
- **Long unbreakable strings** (a bare URL in a Sources line) widen the
  whole document. `body { overflow-wrap: break-word }` handles it sitewide;
  do not remove it.
- **No fixed width wider than a phone** without `max-w-full` to fall back
  to. Inside an `overflow-x-auto` box a `min-w-[640px]` is the point (a wide
  table's column floor, a pipeline diagram) and is exempt. Enforced by rule
  HARD_WIDTH.
- **No `grid-cols-4`+ without a responsive prefix.** Four columns in 390px
  is four unreadable columns; write `grid-cols-2 sm:grid-cols-4`. Enforced
  by rule RIGID_WIDE_GRID. (Small in-card stat grids predating this rule are
  frozen in the baseline; do not add more.)
- **A nowrap row of chips needs somewhere to scroll** — `overflow-x-auto` on
  the container. Rule NOWRAP_LIST_NO_SCROLL.
- **`overflow-x-hidden` on a page container is not a fix.** It hides the
  symptom and clips real content. Find the element that is too wide — the
  probe names it for you.

---

## 4. Tables

- **Every `<table>` sits DIRECTLY inside a scroll wrapper**: `TableScroll`,
  `ResponsiveTable`, `TableBox`, or a div carrying `overflow-x-auto`. Direct
  child matters — the globals.css `:has(> table)` rule provides the scroll
  box, the 80vh height cap, the sticky header and (under 640px) the sticky
  first column. Enforced by `check:table-scroll` (AST-based).
- **Rank-first tables pin the identity column.** A table whose first header
  is `#` MUST declare `data-sticky-col="2"` (raw table) or `stickyCol={2}`
  (TableBox), so swiping keeps the NAME visible, not the rank. Enforced by
  `check:table-scroll` rule 2 against the ratchet baseline
  `scripts/table-scroll-rank-baseline.json` — shrink it as files are fixed,
  never grow it.
- **Value before metadata.** On a ranked board the headline value column
  comes immediately after the identity column (`#`, Name, Value, …), so a
  phone shows the point of the table with no sideways swipe.
- **Demote low-priority columns** (Country beside a linked Metro, and
  similar) with `hidden sm:table-cell` (the shared `SMCOL` const in
  `app/business/ui.tsx`) on BOTH `th` and `td`. **Never demote a table's
  first two columns** — the sticky-column CSS counts children by position,
  and hidden cells still count.
- **Headerless tables** (tbody-only key/value boards) are fine, but if they
  lead with a rank cell, still pass `stickyCol={2}`.
- A table's mobile counterpart is a `<CappedList>`, per §2 — the table rules
  above cover only half of a responsive board.

---

## 5. Navigation and wayfinding

- **The nav is `sticky top-0`, never `fixed`** (§1.1). `DesktopNav` renders
  mega-menus from **1024px** up; `MobileMenu` fills everything below with the
  SAME sections as collapsible groups, generated from the same sources
  (`lib/sportsCatalog`) so the two surfaces cannot drift. **A new destination
  goes in both, in the commit that adds it.**
- **The desktop nav's breakpoint is a measurement, not a taste.** The
  mega-menu row measures ~640–840px and the wordmark ~230px; below 1024 they
  do not both fit. It used to switch on at `md` (768) and the wordmark simply
  painted **over** the menu at every width from 768 to ~1350px (measured
  2026-08-30). Secondary chrome yields first — the "← Citizen of Nowhere"
  backlink now waits for `2xl` — and the wordmark carries `truncate` as a
  backstop so it can never overflow its track again. **If you add a top-level
  nav item, re-measure the row against the wordmark at 1024, 1280 and 1536
  before shipping it.**
- **A page that isn't reachable is a bug.** Wire the hub tab nav, the site
  nav dropdown, and any league/competition link maps (`lib/teamLinks`,
  `lib/competitionLinks`) in the same commit as the page.
- **Big destinations get a first-class entry point** — a hero card or banner
  link, not a footer link inside a collapsed accordion (the
  /teams/football/seasons lesson, fixed 2026-08-03).
- **Tab rows wrap; they do not scroll off.** Three rows maximum at 390px.
- **Never scroll-jack.** A `scrollIntoView` in a scrollspy made country
  pages unscrollable on 2026-08-04 and passed every gate, because static
  probes measure a document that is never scrolled. `probe:mobile` now jumps
  the page and checks the position holds.
- **Provide a way back up** on any page over ~5 screens (`BackToTop` is the
  shared component).

---

## 6. Controls, targets and forms

- **Tap targets are ≥44px tall** for anything a thumb must hit: buttons,
  segmented toggles, disclosure summaries, select controls, standalone
  links. `min-h-11` is the utility. The disclosure primitives already carry
  it. An inline link inside a paragraph is text, not a control, and is
  exempt.
- **Adjacent controls get ≥8px between them** so a fat thumb cannot hit two.
- **In a mobile card or row list, the ROW is the tap target — not the name
  inside it.** A `<Link>` wrapped around 20px of text in a 60px row gives the
  thumb a third of the row and misses land on nothing. Two ways to fix it,
  both fine:
  - Make the link itself `block`/`flex` and let it fill the row's padding box
    (the football club list does this — give it enough `py` to clear 44px).
  - **`tap-row` + `tap-target`** (globals.css) for a row the link cannot
    wrap: `tap-row` on the row, `tap-target` on the ONE primary link. The
    link grows a pseudo-element covering the row, so the whole row is the hit
    area while the link keeps its inline text styling; secondary links and
    controls in the row are lifted above the overlay automatically. The
    trade-off is that the overlay swallows text selection inside the row —
    right for a navigation row, wrong for a row of copyable data.
- **Secondary links inside a `tap-row` are exempt**, the same way table cells
  are: once the row is a 44px target, a tier pill or a state name in the
  metadata line is a link in a block of text, not a control competing for the
  thumb. `probe:mobile` scores them that way.
- **`taps<40` only counts what a thumb can actually reach.** Content inside a
  collapsed `<details>` still reports a bounding box — `content-visibility:
  hidden` keeps the last layout — so the probe uses `checkVisibility()`.
  Without it /teams/football scored 1,128 offenders, ~1,030 of them club rows
  inside groups the reader had never opened.
- **Every control a desktop table header provides must exist on mobile
  too.** When a sortable `<th onClick>` disappears behind `hidden sm:block`,
  the card list needs its own sort control driving the same state — the
  Sort-by `<select>` + direction button idiom in `LeadersDirectory` and
  `NationalIndexClient`. A phone reader who cannot re-sort has a different
  product, not a smaller one.
- **Filter and sort state belongs in the URL** where a reader might share
  or bookmark the result.
- **Announce state changes** to assistive tech (`aria-live="polite"` +
  `sr-only`), as the sort controls already do.
- **Inputs are ≥16px** on mobile, or iOS zooms the page on focus.

---

## 7. Type, colour, motion

- **Never hardcode colour.** Tokens come from globals.css custom
  properties: `--bg`, `--bg-card`, `--bg-card-hover`, `--border`, `--text`,
  `--text-muted`, `--text-dim`, `--accent`, plus the region palette.
- **Numbers render in JetBrains Mono** (the shared `MONO` style const) and
  `tabular-nums` wherever they align in a column.
- **Positive/negative deltas**: `#10b981` / `#E2628B`.
- **Cards**: `rounded-xl` border with the shared `CARD` style.
- **Body text is ≥13px; 10px is for uppercase mono stamps only**, never for
  prose or a value a reader must read.
- **Flag emoji never render on Windows** — use `flagCdnUrl()` images.
- **Respect `prefers-reduced-motion`.** globals.css disables the sitewide
  smooth scroll and near-zeroes transitions under it; do not reintroduce
  motion that ignores the query.

---

## 8. Maps, charts and images

- A map or chart is wide content: it needs `min-w-0` in a grid, and a
  height that is a fraction of the viewport, not a fixed 520px, on a phone.
- Leaflet containers carry `isolation: isolate` (globals.css) so their
  internal panes cannot paint over the nav. Do not remove it.
- Images carry `loading="lazy"`, `decoding="async"`, and explicit
  `width`/`height` to avoid layout shift.

---

## 9. Link sharing / social cards (the brand travels with the URL)

Every page must produce ONE consistent preview wherever it is shared — big
dark brand card, clean title, honest description. The failure mode (found
2026-08-03: most pages shared with no image at all, small vs large Twitter
cards at random, doubled titles) came from Next's SHALLOW metadata merge: a
page that exports its own `openGraph` object replaces the layout's ENTIRELY,
images included.

- `app/opengraph-image.png` + `app/twitter-image.png` (+ `alt.txt`) are the
  sitewide fallback card — file-convention images inherit into every route,
  so a page-level `openGraph` without `images` still shares with the brand
  card. **Never delete these**; update both together with
  `public/og-default.png`.
- **Titles never hardcode "| Global Metro Power Rankings"** — the layout's
  title template appends it (hardcoding doubles it in the tab and in
  shares). og/twitter titles MAY spell out `${TITLE} | ${SITE_NAME}`,
  because templates do not apply there.
- **Twitter card is `summary_large_image` everywhere.** Never `summary`.
- Every `page.tsx` exports metadata (or `generateMetadata`) with: title,
  description (≤160 chars, reads like a sentence, no keyword soup),
  `alternates.canonical`, and `openGraph` carrying title/description/url/
  type. Pure-redirect pages are exempt; client-component pages inherit the
  layout defaults (fine for private pages like /me).
- Data-rich pages may earn a DYNAMIC share image via an `/api/og` route (the
  /compare pattern). If you set custom `openGraph.images`, you own BOTH og
  and twitter images — set both.
- Verify by view-sourcing the built page for `og:image`, `og:title`,
  `twitter:card`. A share with a missing image or a doubled title is a
  broken build, not a cosmetic nit.

---

## 10. Verification — what "done" means

### The gates (`npm run verify`)

`typecheck` → `check:client-imports` → `check:public-data` →
`check:slug-drift` → `check:team-placement` → `check:skyscrapers` →
`check:score-parity` → `check:table-scroll` → **`check:mobile`** →
`check:live-data` → `vitest` → `pytest` → `next build`.

Run it before declaring ANY frontend change done. Never `next build` while
the dev server holds :3000.

**`check:mobile`** (`scripts/check-mobile.mjs`) enforces §2–§3 statically:
UNCAPPED_MOBILE_LIST, GRID_CHILD_NO_MIN_W_0, RIGID_WIDE_GRID, HARD_WIDTH,
NAV_CLEARANCE, NOWRAP_LIST_NO_SCROLL. It has its own unit tests
(`scripts/check-mobile.test.mjs`) and a ratchet baseline
(`scripts/mobile-baseline.json`) freezing the legacy tail per file, per
rule. Useful flags:

```
node scripts/check-mobile.mjs --list             # every finding, baseline ignored
node scripts/check-mobile.mjs --write-baseline   # ONLY to SHRINK the ratchet
```

**Growing the baseline to make the gate pass defeats the gate.** If a
finding is genuinely intentional, say so in code — an explicit `max-h`, or
`data-mobile-uncapped` with a reason — not in the baseline file. The gate
tells you when a baselined file has become clean so the ratchet keeps
tightening.

If a gate ever prints nothing, treat that as the gate being broken, not
passing. (`check:table-scroll` was a silent no-op on Windows for a while
because its main() guard compared path strings; both gates now compare
`pathToFileURL` and tolerate a missing `argv[1]`.)

### The probe (`npm run probe:mobile`)

The static gate catches the antipatterns we know the names of.
`scripts/probe-mobile.mjs` catches the ones we do not: it loads real routes
in real Chromium at a real 390px viewport and measures what a thumb gets.

```bash
npm run dev                                   # in another terminal
npm run probe:mobile                          # 25-route representative sample
node scripts/probe-mobile.mjs --all --concurrency 6
node scripts/probe-mobile.mjs /teams/f1 /power --json out.json
CHROME_PATH=/path/to/chrome node scripts/probe-mobile.mjs   # non-standard browser
```

It reports, per route: `scrollWidth` at 390px, phone screens, the
mobile:desktop ratio, the widest overflowing element (with its classes, so
the fix is one selector away), sub-40px tap targets, and whether a scroll
position holds. It is deliberately NOT part of `verify` — it needs a running
server and a browser — but it is the standard of proof for any change to a
board, a hub, or a shared shell.

### Mobile acceptance checklist

At 390px CSS width, before calling any page done:

1. `scrollWidth ≤ 390` — no page-level sideways scroll, ever.
2. Phone screens under ~25, and under ~3x the same page on desktop.
3. Scroll the page and confirm the position holds (no scroll-jacking).
4. Swipe every wide table: the name column stays pinned, values scroll.
5. The headline value of each ranked board is visible without swiping.
6. Every sort/filter the desktop table offers exists on the phone.
7. Tab rows wrap to three rows or fewer; stat grids collapse.
8. Tap targets ≥44px; nothing important below 13px.
9. The `<details>` reveals actually open, and are already open at ≥640px.

Browser-zoom users defeat window-resize testing; use devtools device mode,
or the probe. **Note:** after editing `app/globals.css`, the dev server can
serve a stale CSS chunk from `.next` — if a new rule seems not to apply,
confirm it in the served stylesheet before concluding it does not work, and
`rm -rf .next` if it is missing.

---

## 11. When you think a rule is wrong

Say so, in the pull request or in HANDOFF.md, with the measurement that
makes the case. Every rule here is the residue of a specific shipped
failure, so overturning one needs evidence of the same kind. What is not
acceptable is silently routing around a rule: growing a ratchet baseline,
adding `overflow-x-hidden` over an overflow, or marking a 200-row list
`data-mobile-uncapped` because the control looked untidy.
