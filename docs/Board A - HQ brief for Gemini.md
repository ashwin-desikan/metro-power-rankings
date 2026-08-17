# Where were these 213 American companies actually headquartered, year by year?

**What I need back:** for each company, the city or cities it was headquartered in
**during the years it was listed**, with the year each location started and ended.
Not today's address. Not the address of whoever bought it.

Attached: `Board A - HQ worklist.csv`, 213 companies.

## The context, briefly

I am building a board of the largest American companies of every year since 1955,
taken from the Fortune 500 and 1000 as published at the time. The point of the
board is that it is a point-in-time cross-section rather than a survivor panel, so
Bethlehem Steel, Pan Am and Enron are all on it because in their year they were
giants. Each company needs to be placed in a metropolitan area so the board can be
rolled up by metro.

These 213 are the companies I have no headquarters for and which actually matter:
they are the ones that reached a top 100 in some year, so they are what a reader
sees. Together they account for 38% of the rows the board displays.

## The three traps, all of which I have already been caught by

**1. The successor's address.** Wikidata and Wikipedia infoboxes routinely carry
the address of the company that ended up owning the name. Trans World Airlines
resolves to Fort Worth, which is American Airlines' home. Union Carbide resolves
to a Dow plant in Seadrift, Texas. Chevron's infobox says Houston, a 2024 move,
for a company listed 1955-2005. **The CSV column `infobox_says_today_MAY_BE_WRONG`
is exactly this value, included so you can see and discard it, not rely on it.**

**2. Companies moved, and the spans are long.** 112 of the 213 were listed for
more than twenty years. One address cannot describe them. Chrysler was in Highland
Park until 1996 and Auburn Hills after. Mobil was in New York and then Fairfax
County. RJR Nabisco went Winston-Salem, then Cobb County, then Midtown Manhattan,
which is three different metros under one row in my data.

**3. Fortune back-names companies.** Every row of a company's history is stamped
with its present-day name, so 1955's number two is listed as "Exxon Mobil" when it
was Standard Oil Co. (New Jersey), and "ChevronTexaco" appears in 1955 when the
company was Standard Oil Co. of California. **If the name in the CSV is
anachronistic for the period, say so** — I maintain a separate era-name file and
your correction is useful there too.

## What to return

CSV rows, one per location era, using exactly these columns:

```
company_key,from_year,to_year,city,state,country,confidence,note
```

- `company_key` — copy it verbatim from the input so the rows can be merged.
- `from_year` / `to_year` — clip to the listing span given in the input. If the
  company was headquartered somewhere before it was ever listed, that era is not
  needed.
- `confidence` — `certain`, `probable` or `unsure`. Use `unsure` freely. A row
  marked unsure is far more useful to me than a confident guess, because I can
  check the unsure ones and I cannot check the ones that look certain.
- `note` — the reasoning, any anachronistic name, and especially any year
  boundary you are unsure of. If the city is certain but the move year is not,
  say precisely that.

Where you do not know, return the row with `city` blank and `confidence` as
`unsure` rather than omitting the company. A known gap is a result; a missing row
looks like an oversight.

## What I am most stuck on

The city is usually easy and the **boundary year** is usually not. IBM was in
Armonk, but from which year exactly? GE moved to Fairfield, but when? Borden moved
to Columbus, but when? If you can only add one thing, add dated move years with a
source, for the companies whose span is longest.

Twelve companies are marked `already_drafted` in the CSV. Answer them anyway —
disagreement between two independent attempts is the most useful signal in this
whole exercise, and I would rather find it now than after it is published.
