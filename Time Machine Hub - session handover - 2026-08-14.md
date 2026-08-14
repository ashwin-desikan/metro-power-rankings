# Time Machine Hub — session handover, 2026-08-14 (evening)

Shipped at **`6fa1a24ad`** (35 files, +2,558/−107, one batched real build).
`npm run verify` green before push: typecheck, 5 checks, 78 vitest, 112 pytest,
`next build` over 4,977 pages.

> **First thing next session:** `node scripts/deploy-status.mjs`. The deploy for
> `6fa1a24ad` was still BUILDING when this was written. Nothing below assumes it
> went green.

---

## Read this before touching anything

Three rules were learned the hard way in this session and are now encoded as
comments in the files they govern. Do not quietly undo them.

1. **`emoji` in `lib/timeMachines.ts` is never a flag emoji.** Windows ships no
   glyph for regional-indicator pairs, so `🇬🇧` renders as the letters "GB" in a
   box. A country board carries `flag: "<country-slug>"` and gets a real
   flagcdn image through `MachineIcon`. This is a site-wide standing rule and
   the registry broke it on its first day.

2. **`deepLink` is a promise about another page.** Set it only where you have
   READ the target's code and confirmed it parses the year off the URL. A link
   that silently drops its parameter is worse than no link: the reader asks for
   1912, lands on a board showing 1985, and cannot tell the site ignored them.
   Six of sixteen boards qualify today; the copy says so out loud.

3. **`/time-machine` is `force-dynamic` for two reasons at once** — the random
   notable year on cold arrival, and the champions strand's `Math.random()`.
   Both are server-side. Move either into a client component, or add caching,
   and you get a hydration mismatch or a frozen page.

---

## What is where

| File | What it is |
|---|---|
| `lib/timeMachines.ts` | The registry. 16 entries. Add one and it appears on the hub, the year-jump list and the cross-section with no page edit. |
| `lib/timeMachineYear.ts` | The cross-section: population, power, champions, film. Each strand reads the same file its own board reads. |
| `lib/timeMachineYears.ts` | 24 notable years with a `why`; `randomNotableYear()`, `whyThisYear()`. |
| `app/time-machine/page.tsx` | The hub. `MachineCard`, `MachineIcon`, `GrainPill`, `StrandIcon`, the grain legend. |
| `app/time-machine/YearPicker.tsx` | Client. Local `draft` state, commits on release, `router.replace`. |
| `lib/championsHistory.ts` | `getChampionsInYear(year)` is new: rows plus the competition's tier. |
| `scripts/business/load_population_series.py` | OWID → Supabase. `TO_YEAR` now tracks the calendar. |
| `scripts/build-country-population.py` | Supabase → `public/data/country-population.json`. Reads `kind` to keep projections out of ranks. |

---

## The highest-value next piece of work

**Teach more boards to read `?year=`.** Ten of the sixteen ignore it. The hub
is honest about this ("the rest open at their own default until they learn to
read a year from the address bar"), but the honesty is a placeholder for work,
not a design.

The pattern to copy is `app/countries/CountryTimeMachine.tsx` and
`app/power-atlas/PowerHistory.tsx`. **Read the comment in `PowerHistory.tsx`
before you copy the Countries idiom** — the Countries board reads `?year=`
synchronously inside `useState`, which is safe ONLY because its subtree never
server-renders. Copying that into a subtree that does server-render is a
hydration mismatch; `PowerHistory` uses a post-hydration `useEffect` instead
and says why. Getting this wrong was a real error in this session, caught
before it shipped.

Candidates, easiest first: `/screen/number-ones`, `/screen/oscars`,
`/sound/grammys`, `/teams/olympics`. Each already has a year or edition
selector; the work is reading the URL on mount and writing back on change.
Add `deepLink` to the registry entry only after verifying the round trip.

**Do NOT re-enable the league-map year scrubbers** in `app/teams/nfl/LeagueMap.tsx`.
The comment there explains they were disabled deliberately because the map pins
are current-day stadium coordinates. I proposed uncommenting them this session
and withdrew it after reading the file.

---

## Other open threads, roughly by value

- **Reciprocal hub links.** `/sports/champions`, `/leaders` and `/teams/olympics`
  have no link back to `/time-machine`. `app/_shared/HubBackLink.tsx` exists for
  exactly this and is currently used in one place.
- **Heartbreak Index calibration pass.** Chosen at session open, parked
  immediately by the first redirect, never started. The scoring weights in
  `scripts/heartbreak/build_heartbreak.py` have not been reviewed since the
  parade-drought fix changed what counts as a title.
- **WNBA / EuroLeague / CBA in Heartbreak.** Audited and deferred. WNBA and CBA
  are tractable. EuroLeague is blocked: Ashwin specified weighting by domestic
  league success for present-day clubs only, and the domestic series for those
  clubs is not in the data yet.
- **`/rankings` time machine** over the 8 orphaned `power-ranking-history`
  snapshots. They are already in Supabase and nothing reads them.
- **The half-open vs inclusive seam.** 53 territories disagree by exactly one
  year between the `NOT_SOVEREIGN` audit table (half-open) and the curated
  windows (inclusive). Three Benelux entries were fixed; **50 were left
  untouched on purpose.** Decide the rule once and sweep, or leave them — do
  not fix them one at a time, which is how the seam got inconsistent.
- Carried and untouched across several sessions: two `football_lookup` metro
  edits, the USC-1940 CFB ledger row, and the Chicago Stars FC + Brescia
  workbook recalc.

---

## Things that will bite you if you do not know them

- **The population fallback wakes on 1 Jan 2027.** Above the annual series the
  hub sums `countries.json` (~8.13bn from 247 national counts) instead of going
  blank. It is dormant today because the series reaches 2026. When the calendar
  rolls, either re-run `load_population_series.py` (the intended fix, since
  `TO_YEAR` now tracks the calendar) or the hub will show the workbook sum,
  which is ~1.2% below the OWID line and will look like a drop.
- **Pre-1800 population is twelve benchmarks, not a series.** OWID has 1500,
  1600 and then one point per decade to 1790. The hub shows the nearest
  PRECEDING value labelled with its year. Do not interpolate it, and do not
  load it into `country-population.json` — that would set `_meta.first` to 1500
  and pad every country's dense array with ~300 nulls.
- **Champion tiers are current tiers, not era tiers.** `getChampionsInYear`
  returns the competition's tier as it stands today. Fine for ordering by
  prominence; wrong for any claim about how important a competition was at the
  time.
- **`heartbreak.json` is a build-time `readFileSync`.** A data-only rescore must
  NOT carry `[vercel skip]` at push HEAD or the site keeps serving the old
  numbers.
- **Every push to main is a paid production build.** Batch. The 2026-08-06
  incident ran thirteen builds in one day against a 2/day budget.

---

## Suggested opening prompt for the next session

> Continue the Countries / Time Machine work on the Metro Area Project.
>
> Start by reading `Time Machine Hub - session handover - 2026-08-14.md` and the
> 2026-08-14 (evening) entry in `HANDOFF.md`, then run
> `node scripts/deploy-status.mjs` to confirm `6fa1a24ad` deployed green. If it
> failed, fix that first and tell me what broke.
>
> Then pick up the main thread: **ten of the sixteen time machines still ignore
> `?year=` in the URL**, so the hub's deep links only work for six of them. Work
> through the easy ones first — `/screen/number-ones`, `/screen/oscars`,
> `/sound/grammys`, `/teams/olympics` — teaching each to read the year on mount
> and write it back on change, then add `deepLink` to that board's entry in
> `lib/timeMachines.ts` only after you have verified the round trip by loading
> the URL and reading the rendered year back.
>
> Read the comment at the top of `app/power-atlas/PowerHistory.tsx` before you
> copy the Countries board's `useState`-reads-the-URL idiom; it explains why
> that shortcut is only safe in a subtree that never server-renders.
>
> Do not re-enable the year scrubbers on `app/teams/nfl/LeagueMap.tsx` — the
> comment there says why they are off.
>
> Batch everything into one commit, run `npm run verify` before pushing (stop
> the dev server first, it holds :3000), amend the existing 2026-08-14 release
> block if we are still on the same day rather than adding a second one, and
> ask me before you push.
