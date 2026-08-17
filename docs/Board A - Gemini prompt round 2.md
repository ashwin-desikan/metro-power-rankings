# Prompt for Gemini, round 2 — paste this, attach `Board A - HQ round 2.csv`

---

Thank you for the 213 headquarters spans. They were structurally perfect: every
company key valid, every era inside its listed span, no gaps, no overlaps, nothing
truncated. I merged them against an independent check and **121 of them are now
settled**.

This is the remainder. 92 companies where I could not corroborate your answer.

## First, the thing I need you to change

You marked **303 of 309 rows `certain` and none `unsure`**. I checked your answers
against Wikipedia article text you did not see, and at least one `certain` row is
contradicted by an explicit source. So the confidence column told me nothing, and
I had to verify all 213 myself rather than the handful you were unsure about.

**This round, calibrate.** If you would not bet on a boundary year, say so. I am
going to publish these, and a row you flag as shaky costs me five minutes to check
while a wrong row I trust costs me a correction after publication. Use `unsure`.
Aim to be wrong about 10% of the time on rows you mark `probable`, and essentially
never on rows you mark `certain`.

## What the CSV contains

For each company: what you answered in round 1, and a `why_unconfirmed` column
explaining what kind of doubt applies. There are five kinds and they need
different things from you:

- **NO EVIDENCE (29)** — the Wikipedia article I checked never mentions a
  headquarters. Your answer is unverified, not contradicted. **Give me a citation**
  I can check: a specific source, ideally with a year.
- **UNCONFIRMED (28)** — the article discusses a headquarters but never mentions
  any city you named. **Reconsider from scratch** before restating. If you still
  believe your answer, say what it rests on.
- **PARTLY UNCONFIRMED (21)** — the article supports one of your eras but is
  silent on another, usually the earliest. This is often the article being thin
  about the 1950s and 60s rather than you being wrong. **Confirm or correct the
  unsupported era specifically.**
- **I COULD NOT CHECK IT (12)** — my article lookup landed on the wrong company.
  NCR resolved to an Indian administrative region, Hanson Industries to the Outer
  Hebrides, Triangle Industries to Nelson Peltz. **Tell me the correct Wikipedia
  article title** as well as the headquarters, in a `wikipedia_title` column.
- **DISPUTED (2)** — I hold a source that contradicts you. Read these two
  carefully, they are the only ones where I think you are probably wrong.

## The two disputes

**Atlantic Richfield.** You gave Philadelphia 1955-1971, then Los Angeles
1972-2000, marked `certain`. Wikipedia states a **New York City headquarters from
1966 to 1971**, between your two eras, which is what I would expect after the 1966
Atlantic Refining and Richfield merger. Please reconsider and cite.

**Exxon Mobil.** You gave Irving from 1990. Wikidata carries a dated statement of
Las Colinas 1989-1999 for the Exxon entity. One year apart. Which is right, and
what dates the move?

## Two corrections from round 1, so you can calibrate

You were **right and I was wrong** on two, and I want you to know because it should
raise your confidence on similar reasoning:

- **Honeywell Intl.** I read it as Honeywell Inc. of Minneapolis. You read it as
  the Allied Chemical to AlliedSignal lineage. You were right, and I proved it from
  the revenue data: both companies appear in the same years at different sizes.
- **Borden.** You said the move to Columbus was 1971. I said the late 1980s. You
  were right by sixteen years.

One row came back with corrupted text: McDermott read "Mc工事ermott". Please check
your output is clean ASCII.

## Output format, same as before

```
company_key,from_year,to_year,city,state,country,confidence,wikipedia_title,source,note
```

Two new columns this round: `wikipedia_title` (required for the 12 I could not
check, useful everywhere) and `source` (what the claim rests on — a specific
source where you have one, or the literal word `recollection` where you do not).

Keep `company_key` verbatim. Clip years to the listed span. Cover all 92 in the
order given, which is by how many board rows each company costs. If you cannot
finish in one response, end with:

```
STOPPED AFTER: <company_key> — <n> of 92 completed
```

## What good looks like

```
georgia pacific,1955,1981,Portland,Oregon,United States,probable,"Georgia-Pacific","Company history; the Atlanta move is well documented, the Portland origin less so","Founded in Augusta, moved to Portland in the 1950s; I am confident on the city and less so on the 1981 boundary."
ncr,1955,1991,Dayton,Ohio,United States,certain,"NCR Corporation","NCR was synonymous with Dayton until the AT&T acquisition","Note the article you want is NCR Corporation, not the Indian region."
hanson industries na,1983,1994,,,,unsure,"Hanson plc","recollection","I cannot separate the US arm's own offices from the London parent's with any confidence."
```

That last one is the most useful row in this whole exercise. A blank city with
`unsure` tells me exactly where to spend my own time. A confident guess does not.
