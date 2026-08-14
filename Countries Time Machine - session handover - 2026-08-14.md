# Countries Time Machine — session handover, 2026-08-14

**Status: SHIPPED and live-verified.** `526c0e45a` on `origin/main`, working tree clean.
Live at `rankings.citizenofnowhere.org/countries` → Time Machine tab.

---

## What is live

A second tab on `/countries`. Pick any year from 1800 to 2025 and the board shows who held
every territory on earth and how many people lived in it. Empires, dissolved states,
occupations, partitions and territories that were not yet countries are all resolved from a
single atom table, so the empire view and the territory view agree by construction rather
than by coincidence.

Verified on the deployed site, not assumed:

| Probe | Result |
| --- | --- |
| `/api/country-timeline` | 211 countries, 20 polities, 192 curated holdings, 1800–2025 |
| Yugoslavia dissolution gap | 1941–1944 |
| Ottoman Empire members | 20, each with its own leave year |
| Indonesia 1942–45 | occupied by Japan, not Dutch |
| `/countries` | HTTP 200, Time Machine tab present |
| `/updates` | HTTP 200, release note present |

The same push carried the Heartbreak Index out of soft launch (nav, sitemap, release notes,
team-page exposure panels), the bitcoin backfill to its first quoted price (18 July 2010,
$0.08584), the 21-file markets-series rewrite, the St Kilda 2010 and Newtown 1910 premiership
corrections, and the MLB/NFL prediction standings split one league per column.

---

## The one thing worth carrying forward

Every serious defect in this feature was the same shape: **a rule that was true, enforced in
one place, and silently absent in another.** Ashwin found five of them by reading boards, and
each time I fixed the instance he named he came back with the next instance of the same class.

- Hong Kong's holder changed, so I patched Hong Kong and Macau. The real bug was that **no
  dependency had an acquisition year**, so all fifteen were attributed to their modern holder
  back to 1800 — Guam under the United States in 1818, eighty years before Paris.
- Poland was modelled with one occupier. Germany and the Soviet Union both held it in 1940.
- **Sovereignty was the default**, so any territory no rule claimed rendered as an independent
  country with a flag, a population and a rank. The absence of information displayed in exactly
  the same confident voice as a fact.
- An occupation superseded a colonial claim — but only *inside* the curated table. Indonesia's
  Dutch claim comes from COLDAT, so nothing compared the two sources and the Netherlands won on
  Map insertion order. The Philippines behaved correctly only because both of its claims
  happened to be curated.
- A live polity absorbed its members, and absorption swallowed their occupation tags whole. In
  1942 the data knew Ukraine, Belarus, the Baltics, Moldova and all seven pieces of Yugoslavia
  were held by Germany, Italy, Bulgaria or Romania, and displayed none of it.

Before shipping a fix for one row, ask what class it belongs to and where else that class lives.

---

## The three audit instruments

These are the durable asset. A curated history is only as good as what checks it, and Ashwin
was explicit that he does not have the bandwidth to check every country every year.

**`scripts/audit-sovereignty.py`** — for every year 1800–2025 (`--sweep`), lists every territory
the board renders as a plain sovereign state and compares it against `NOT_SOVEREIGN`. Currently
**0 offending spans across 196 territories**. Two traps are baked into its comments:

- Its spans are **half-open**. `(a, b)` means not sovereign from `a` until `b`, and `b` itself
  is sovereign. The first version was inclusive at both ends and reported Germany as a
  non-country in 1871, Italy in 1861 and Iceland in 1944 — eleven findings that were one
  off-by-one. An audit that cries wolf on its own boundary condition trains you to skim it.
- **Benchmark years were the hole.** Nine sample years cannot see a gap that opens in 1818 and
  closes in 1853, which is the shape of most of what was wrong. The full sweep found Senegal,
  Belgium, Vietnam and thirty more.

**`scripts/audit-occupation.py`** — a year-by-year ledger of who was under foreign control
through 1914–1923 and 1936–1946. Currently **0 missing**. A sovereignty audit is blind here by
construction: Denmark in 1942 was a sovereign kingdom under German occupation, so it passes
either way. Three distinctions this file exists to defend, because popular memory blurs all
three and a map of Axis-controlled Europe would "fix" them wrongly:

- An **ally** is not a possession. Romania, Bulgaria, Hungary, Finland and Thailand fought
  alongside the Axis as sovereign states. Each was occupied eventually, and the year is the
  only interesting fact about them: Hungary March 1944, Romania and Bulgaria September 1944.
- A **client** is not a possession. Slovakia and the Independent State of Croatia had their own
  governments.
- **Neutrals** stayed neutral. Sweden, Switzerland, Spain, Portugal, Ireland and Turkey.

**`scripts/report-time-machine-history.py`** — regenerates `Time Machine - curated history for
review.md` (594 lines) from the built JSON, so the review sheet cannot drift from the data it
describes. The hand-written first version was materially stale within a day.

---

## Open questions for Ashwin

None of these block anything. All are judgment calls I made and he may want to overturn.

1. **Should the United Kingdom row read "British Empire"?** It currently reads "United Kingdom
   and its colonies". The era-name machinery exists and would carry it.
2. **`PRE_COLONIAL_STATES` is a judgment, not a lookup.** It is the exception list that stops a
   colonised territory being labelled "not yet one country" for the years before its coloniser
   arrived — Vietnam under the Nguyễn, Morocco, Egypt, Ethiopia, Korea, Japan, China, Iran,
   Myanmar under the Konbaung. Being colonised later does not make you a patchwork before, but
   the membership deserves his eye.
3. **India, Pakistan and Bangladesh read colonised only from 1857**, because COLDAT dates the
   Raj from Crown rule rather than from the Company. Arguably wrong by a century.
4. **Coverage thins before about 1870** in general. Sub-Saharan Africa in 1820 is mostly
   "not yet one country" windows derived from colonisation dates, which is honest but thin.
5. **Two territorial calls made against him**, flagged at the time: Montenegro is a *client* of
   the Ottomans rather than a member, because it governed itself; and Nepal, Bhutan and Oman
   were removed from the non-sovereign list, since British treaties bound their foreign
   relations without ending their statehood.

---

## Also open, unrelated to this feature

- **Heartbreak Index calibration pass** — parked, never started. Then methodology copy, then the
  Gemini v3.18 note and the GFL folklore round.
- **USC-1940 CFB ledger row** still unresolved.
- **Two `football_lookup` metro edits** flagged as probable slips: San Martín de San Juan →
  Mendoza, Estudiantes de Mérida → Valera.
- **Chicago Stars FC and Brescia** need `MetroAreas.xlsx` recalculated in Excel, saved, and
  `extract.py` re-run. Same batch.
- **22 data files were resolved to my side during the rebase** (`markets-series/*`,
  `markets-overlay.json`, `nrl/data.json`) because the automated jobs rewrote them mid-session.
  The backfill extends history backwards and the crons append forwards, so it is self-healing,
  but spot-check that the next markets refresh landed cleanly.

---

## Toolchain notes earned here

- PowerShell cannot take a multi-line inline `python -c` with quotes. Write a temp `.py`.
- `$vars` are **stripped** from inline `-Command` strings passed through Desktop Commander.
  Write a `commit-round*.ps1` (gitignored) and run it with `-File`.
- MCP calls cap at 60 seconds; `npm run verify` takes about 220. Use `start_process` and poll
  `read_process_output`. An orphaned build blocks the next attempt with no lock file.
- `cmd /c "a && b"` stops on a non-zero exit. Use `&` to chain audits that exit 1 by design.
- Set `PYTHONIOENCODING=utf-8` or the ⚠️ in audit output dies on cp1252.
- The Desktop Commander content search **masks the matched text**. Read the file at the line
  number it gives you.
- `check:table-scroll` wants `data-sticky-col={2}` *and* a `<TableScroll>` wrapper.

---

## Prompt for the next session

> Read the session-open protocol first and run it: `git log --oneline -5`, `git status -sb`,
> and check `/updates` on the live site. Do not trust these notes over git.
>
> Live is `526c0e45a`. The Countries Time Machine shipped on 2026-08-14 and is verified live;
> the Heartbreak Index shipped fully in the same push. Working tree was clean at that point.
>
> Context: `project_countries_time_machine_v1_2026_08_14` in memory has the full story,
> including the class of bug that produced almost every defect in it — a rule enforced in one
> place and silently absent in another. Three audit scripts police the feature and all three
> are green: `python scripts/audit-sovereignty.py --sweep` (0 findings across 226 years),
> `python scripts/audit-occupation.py` (0 missing across both world wars), and
> `python scripts/report-time-machine-history.py` (regenerates the review sheet from the built
> JSON). **Run all three before touching any of the curated tables, and again after.**
>
> The highest-value work available, in the order I would take it:
>
> 1. **The Heartbreak Index calibration pass.** Ashwin has had this parked for two days. It is
>    his judgment call on the scoring weights, and nothing downstream can be finished without
>    it — methodology copy and the Gemini v3.18 note both wait on it.
> 2. **The five open editorial calls on the Time Machine**, listed in the handover doc. The
>    India/Pakistan/Bangladesh 1857 date is the one I would push hardest on, because COLDAT
>    dating the Raj from Crown rule rather than the Company understates the subcontinent's
>    colonial period by a century, and the fix is a curated override rather than an argument
>    with the dataset.
> 3. **Coverage before 1870**, if he wants depth rather than breadth next. Sub-Saharan Africa
>    and Central Asia are currently mostly derived "not yet one country" windows.
>
> Standing constraints: never commit or push without his explicit approval; the workbook is
> ground truth and never gets unsolicited edits; release notes ship with every public-facing
> commit and same-day pushes amend the one date block rather than appending; and every push to
> main is a paid production build, so batch.
