# Prompt for Gemini — paste this, attach `Board A - HQ worklist.csv`

---

You are helping me place 213 historical American companies into the cities they
were actually headquartered in, year by year, so they can be rolled up by
metropolitan area.

I am building a public board of the largest American companies of every year
since 1955, taken from the Fortune 500 and 1000 exactly as published at the time.
It is a point-in-time cross-section, not a survivor panel, so Bethlehem Steel,
Pan Am and Enron are on it because in their year they were giants. The attached
CSV holds the 213 companies I have no headquarters for that a reader actually
sees: each reached a top 100 in some year, and together they are 38% of the rows
the board displays.

## What I need

For each company, the city or cities it was headquartered in **during the years
it was listed**, with the year each location began and ended.

I do not need today's address. I do not need the address of the company that
bought it. Those are the two answers I keep getting and they are both wrong.

## Output format, exactly

Return CSV. One row per location era. These columns, in this order, with no
extra commentary between rows:

```
company_key,from_year,to_year,city,state,country,confidence,note
```

- **company_key** — copy verbatim from the input CSV. This is the merge key. If
  you alter it the row is unusable.
- **from_year / to_year** — clip to the `listed_from` and `listed_to` values in
  the input. If a company was headquartered somewhere before it was ever listed,
  I do not need that era.
- **confidence** — exactly one of `certain`, `probable`, `unsure`.
- **note** — your reasoning in one sentence, and specifically which part you are
  unsure of.

## The three traps, all of which have already caught me

**1. The successor's address.** Reference sources routinely carry the address of
whoever ended up owning the name. Trans World Airlines resolves to Fort Worth,
which is American Airlines' home, not TWA's. Union Carbide resolves to Seadrift,
Texas, which is a Dow plant. Chevron's infobox says Houston, a 2024 move, for a
company listed from 1955 to 2005. The input CSV has a column literally named
`infobox_says_today_MAY_BE_WRONG` holding this value. It is there so you can see
and discard it. Treat it as a distractor, not as evidence.

**2. Companies moved, and the spans are long.** 112 of these 213 were listed for
more than twenty years. A single address cannot describe them. Chrysler was in
Highland Park until 1996 and Auburn Hills after. RJR Nabisco went Winston-Salem,
then Cobb County, then Midtown Manhattan, which is three different metro areas
under one row of my data.

**3. Fortune back-names companies.** Every year of a company's history is stamped
with its present-day name. 1955's number two appears as "Exxon Mobil" when it was
Standard Oil Co. (New Jersey). "ChevronTexaco" appears in 1955 when the company
was Standard Oil Co. of California. If the name in the CSV is anachronistic for
the period, say so in the note. I keep a separate era-name file and your
correction is useful there too.

## Worked examples

Good, because both bounds are dated and the note says what carries them:

```
chrysler,1955,1995,Highland Park,Michigan,United States,certain,"Headquartered in Highland Park until the Auburn Hills move completed in 1996."
chrysler,1996,1998,Auburn Hills,Michigan,United States,certain,"Move completed 1996; runs to the Daimler merger and the last listed year."
```

Good, because it is honest about the half it cannot support:

```
intl business machines,1964,1995,Armonk,New York,United States,probable,"Armonk is certain for this era; the 1964 start year is my recollection and I could not confirm it."
```

Good, because a known gap beats a silent omission:

```
american zinc lead and smelting,1955,1957,,,,unsure,"Could not establish a headquarters for this company."
```

Bad, do not do this. It is today's address on a historical span:

```
exxon mobil,1955,1995,Spring,Texas,United States,certain,"ExxonMobil is headquartered in Spring, Texas."
```

Bad, do not do this. It flattens a company that moved twice into one value:

```
nabisco group holdings,1955,2000,New York City,New York,United States,certain,"RJR Nabisco was in New York."
```

## How to handle uncertainty

Use `unsure` freely. **A row marked unsure is far more useful to me than a
confident guess, because I can check the unsure ones and I cannot check the ones
that look certain.** Where you do not know, return the row with `city` blank and
`confidence` as `unsure` rather than dropping the company. A known gap is a
result; a missing row reads as an oversight.

Do not invent citations. If you are working from general knowledge rather than a
specific source, say "general knowledge" in the note. That is fine and I would
rather know.

## What I am most stuck on

The city is usually easy. The **boundary year** usually is not. IBM was in
Armonk, but from which year? GE moved to Fairfield, but when? Borden moved to
Columbus, but when? If you can add only one thing, add dated move years for the
companies with the longest spans. Those are the rows where a wrong boundary puts
a company in the wrong metro for a decade.

## Working order and truncation

Work in the order the CSV gives you, which is already sorted by how many board
rows each company costs, so the most valuable answers come first.

If you cannot fit all 213 in one response, **do not silently stop**. Complete as
many as you can in order, then end with a line in this exact form:

```
STOPPED AFTER: <company_key> — <n> of 213 completed
```

and I will ask you to continue from there. A truncated answer that says where it
stopped is useful. One that just ends looks complete and is not.

## One more thing

18 companies are marked `already_drafted` in the CSV. Answer those too, without
looking for what I might have said. Disagreement between two independent attempts
is the most valuable signal in this exercise, and I would rather find it now than
after this is published.
