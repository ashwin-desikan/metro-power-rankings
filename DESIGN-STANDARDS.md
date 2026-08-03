# DESIGN-STANDARDS.md — the consistent look-and-feel contract

Read this before building or redesigning ANY page, and especially any hub.
CLAUDE.md carries the short non-negotiables; this file is the full standard.
It exists because /business shipped 2026-08-02/03 passing every automated
gate while violating the mobile standards in spirit — four of nine tabs had
page-level horizontal scroll on phones and every ranked table pinned the
rank number instead of the name. The gates below were extended the same
night so that class of miss fails `npm run verify` instead of shipping.

## The one-sentence version

A hub is phone-first: at 390px wide the page never scrolls sideways, every
table's identity column stays visible while its values scroll, the headline
value sits one swipe-free column from the name, and nav/breadcrumb/header
idioms are copied from an existing hub rather than reinvented.

## Page skeleton (every hub tab)

1. `<main className="mx-auto max-w-6xl px-4 py-8">` — ordinary top padding.
   The site nav is `sticky top-0` (never `fixed`); NEVER add nav-clearance
   padding like the old `pt-24`. If content renders under the top bar,
   someone reintroduced `fixed` — fix the cause (CLAUDE.md rule).
2. Breadcrumbs (`Crumbs` in /business, same idiom elsewhere): Home / Hub /
   Tab, text-xs, muted.
3. Header block (`TabHeader`): emoji + h1 (text-3xl sm:text-4xl), one-line
   sub in muted 15px, then a MONO uppercase stamp line carrying "as of" +
   row counts + source. Every data page states its source and as-of date.
4. Tab nav: a flex-wrap underline row (`BusinessNav`/`SoundNav`/`ScreenNav`
   idiom): px-3 py-2 text-sm font-semibold links, active = 2px accent
   underline. Add the tab to the nav in the SAME commit that adds the page.
5. Sections: `SectionHead` (h2 text-2xl font-bold + muted sub, max-w-3xl),
   anchored ids for deep links (`[id]` scroll-margin is global).
6. Close with a "Where these numbers come from" / "How this board works"
   card: rounded-2xl border, 13.5px muted prose, sources + caveats.

## Theme tokens (never hardcode)

Colors come from globals.css custom properties: `--bg`, `--bg-card`,
`--border`, `--text`, `--text-muted`, `--text-dim`, `--accent`, the region
palette. Numbers render in JetBrains Mono (the shared `MONO` style const).
Positive/negative deltas: #10b981 / #E2628B. Cards: rounded-xl border with
`CARD`. Flag emoji never render on Windows — use flagCdnUrl() images.

## Tables — the load-bearing rules

- Every `<table>` sits DIRECTLY inside a scroll wrapper: `TableScroll`,
  `ResponsiveTable`, `TableBox` (business), or a div carrying
  overflow-x-auto. Direct child matters — the globals.css `:has(> table)`
  rule provides the scroll box, height cap, sticky header, and (under
  640px) sticky first column + touch scrolling. Enforced by
  `npm run check:table-scroll` (AST-based, runs in `npm run verify`).
- RANK-FIRST TABLES: any table whose first header is `#` MUST declare
  `data-sticky-col="2"` (raw table) or `stickyCol={2}` (TableBox) so the
  NAME column pins on phones, not the rank. Enforced by the same checker
  (rule 2) against scripts/table-scroll-rank-baseline.json — a ratchet
  freezing legacy offenders; new/edited tables must comply. Shrink the
  baseline as you fix files (`--write-rank-baseline`); never grow it.
- VALUE BEFORE METADATA: on ranked boards the headline value column comes
  immediately after the identity column (#, Name, Value, ...). A phone
  shows the point of the table without any sideways swipe.
- DEMOTED COLUMNS: low-priority columns (Country next to a linked Metro,
  and similar) take `hidden sm:table-cell` (the shared `SMCOL` const in
  app/business/ui.tsx) on BOTH th and td. Never demote a table's first two
  columns — the sticky-col CSS counts children by position, and hidden
  cells still count.
- MIN-W-0 IN GRIDS: any grid child that contains a table (or any wide
  content) needs `min-w-0`. Grid items default to `min-width: auto`, so a
  wide table otherwise inflates its column past the viewport and the WHOLE
  PAGE scrolls sideways — the single worst mobile failure this site has
  shipped. TableBox carries min-w-0 itself; wrapper divs (heading + table
  cards) need it explicitly.
- Headerless tables (tbody-only key/value boards) are fine, but if they
  lead with a rank cell, still pass stickyCol={2}.

## Mobile acceptance checklist (before calling any hub done)

At 390px CSS width (device toolbar, or the iframe trick below):
1. `document.scrollingElement.scrollWidth <= 390` on EVERY tab — no
   page-level sideways scroll, ever.
2. Swipe every wide table: the name column stays pinned, values scroll.
3. The headline value of each ranked board is visible without swiping.
4. Tab nav rows wrap acceptably (three rows max); hero/stat card grids
   collapse (`grid-cols-2`/`sm:grid-cols-*` patterns, never bare
   `grid-cols-4`).
5. No fixed-width element (w-44 etc.) forces overflow in a flex row.

Browser-zoom users defeat window-resize testing; inject a 390px iframe of
the page and measure inside it (same-origin), or use devtools device mode.

## Navigation wiring (from the burned-user file)

A new page that isn't reachable is a bug: wire the hub tab nav, the site
nav dropdown, and any league/competition link maps (lib/teamLinks,
lib/competitionLinks) in the same commit (CLAUDE.md + memory rules). Big
destination pages deserve a first-class entry point — a hero card or
banner link — not a footer link inside a collapsed accordion (the
/teams/football/seasons lesson, fixed 2026-08-03).

## Verification

`npm run verify` = typecheck, client-import check, public-data check,
table-scroll check (both rules), vitest, `next build`. Run it before
declaring any frontend change done; never `next build` while the dev
server holds :3000. The table-scroll checker's main() guard is
pathToFileURL-based — the old string comparison made it a silent no-op on
Windows (fixed 2026-08-03); if a gate ever prints nothing, treat that as
the gate being broken, not passing.

## Link sharing / social cards (the brand travels with the URL)

Every page must produce ONE consistent preview wherever it's shared - big
dark brand card, clean title, honest description. The failure mode (found
2026-08-03: most pages shared with no image at all, small vs large Twitter
cards at random, doubled titles) came from Next's SHALLOW metadata merge:
a page that exports its own `openGraph` object replaces the layout's
ENTIRELY, images included.

- `app/opengraph-image.png` + `app/twitter-image.png` (+ alt.txt) are the
  sitewide fallback card - file-convention images inherit into every route,
  so a page-level openGraph without `images` still shares with the brand
  card. Never delete these; update both together with public/og-default.png.
- Titles NEVER hardcode "| Global Metro Power Rankings" - the layout's
  title template appends it (hardcoding doubles it in the tab and in
  shares). og/twitter titles MAY spell out `${TITLE} | ${SITE_NAME}`
  because templates don't apply there.
- Twitter card is `summary_large_image` everywhere. Never `summary` - the
  small square card is the off-brand look that prompted this section.
- Every page.tsx exports metadata (or generateMetadata) with: title,
  description (<=160 chars, reads like a sentence, no keyword soup),
  `alternates.canonical`, and openGraph carrying title/description/url/type.
  Pure-redirect pages are exempt; client-component pages inherit the layout
  defaults (fine for private pages like /me).
- Data-rich pages may earn a DYNAMIC share image via an /api/og route (the
  /compare pattern: og:image renders the actual comparison). If you set
  custom `openGraph.images`, you own both og AND twitter images - set both.
- Verifying: view-source the built page and check `og:image`, `og:title`,
  `twitter:card`; or paste the URL into a scraper debugger. A share with a
  missing image or a doubled title is a broken build, not a cosmetic nit.
