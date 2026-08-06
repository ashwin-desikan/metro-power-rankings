# The Ground Floor — position, spec, and what we are not building

Response to *Citizen of Nowhere: Practical Progressive Implementation Blueprint*
(Gemini, 2026-08). Decisions taken with Ashwin, 2026-08-06.

**Revision 2, same day.** Two claims in revision 1 were disproved by measurement
within an hour of writing them. Both corrections are marked MEASURED below.
Nothing here is inferred where it could be counted.

---

## Conclusion first

The blueprint's diagnosis is correct and better founded than the document
itself argues: every one of the 16 metro ranking dimensions is a count of
accumulated assets, so the site currently has no instrument capable of
detecting a metro that is rich and failing. That is a real analytical gap, not
only a political one, and it sits oddly against the project's own canon.

The blueprint's proposed remedy would not survive contact with the data. Its
composite index puts 65% of its weight on housing and transit measures that do
not exist for the overwhelming majority of 4,305 metros and cannot be acquired
at that coverage. Its mayor scorecard rests on a comparison that is invalid
before politics enters the room, because mayoral powers differ so sharply by
jurisdiction that any delivery ratio would be measuring constitutional design.

So we take the diagnosis and reject the instrument. **The Ground Floor** is a
second, independent scoreboard measuring what a metro delivers to the people in
it. It never merges with the power ranking. The distance between a metro's
accumulation rank and its Ground Floor rank is the finding, and it is more
damning than any weighted index because we assert nothing to produce it.

---

## The seven decisions

| Decision | Resolution |
|---|---|
| Structure | Separate scoreboard. Power ranking untouched. The gap is the product |
| Coverage | Universal base layer for all metros, plus a curated deep layer for the top 100 |
| Composite method | Median of dimension ranks. No weights, no normalisation |
| Officeholders | Conditions attach to the metro, never to the named person |
| Name | The Ground Floor |
| V1 metrics | ~~Air quality, Overture/OSM, per-capita flip~~ **see correction 1** |
| Explicitness | State the principle openly in methodology. Name no party, ideology or person |

---

## MEASURED CORRECTION 1 — the per-capita flip cannot rank, at any scope

Revision 1 called the per-capita re-expression of existing counts "the free
win" and made it phase 1. It is free. It is not a win. Measured across all
4,305 metros from `details/*.json`:

| Dimension | % non-zero |
|---|---|
| totalTeams | 45.8 |
| airportScore | 34.7 |
| universities | 21.6 |
| majorLeagueTeams | 16.0 |
| companies / marketCap | 11.7 |
| portsExchangesInfra | 10.3 |
| skyscrapers | 8.6 |
| museumsLandmarks | 7.9 |
| topUniHospResearch | 7.2 |
| luxuryStars | 6.8 |
| culturalEvents | 6.1 |
| metroStations | 5.8 |
| suburbStations | 5.5 |
| majorSportingEvents | 4.6 |
| trainHubs | 3.5 |

The median metro has **one** non-zero dimension out of fourteen. **34% have
zero of all fourteen.** A population floor does not rescue it: among the 181
metros above five million, 10% still have zero of all fourteen and
`metroStations` is non-zero for only 58%. Among the 800 above one million the
median metro has four.

The power ranking works precisely because it *sums* sparse counts, and a metro
with none of them correctly scores low. A conditions rank needs every input to
discriminate across the field. None of these do.

**Consequence.** The existing dimension set contributes nothing to the Ground
Floor rank at any weight. Per-capita ratios remain worth showing on metro pages
where the underlying count is non-zero, as a display. They are not an input.

*Incidental finding, unrelated but real:* four detail pages exist with no row in
`metros.json` — `almere`, `ghaziabad`, `lelystad`, `pacos-de-ferreira`.
Ghaziabad is a metro well over a million. Worth fixing independently.

---

## MEASURED CORRECTION 2 — OSM-derived measures carry a mapping-density bias

Revision 1 proposed Overture/OSM amenity density as a core universal input and
did not flag the obvious hazard. Counting hospitals or schools from OSM partly
measures how thoroughly volunteers have mapped a place, which systematically
flatters wealthy, well-mapped metros. That reproduces the accumulation bias the
Ground Floor exists to escape, under a new name.

This is not yet measured, only reasoned, and it is flagged as such. Before any
OSM-derived measure enters the rank, the bias must be quantified against a
known-good reference across income levels. Satellite-derived measures (PM2.5,
vegetation, built-up density) do not have this problem: they are observed, not
contributed.

---

## What we keep from the blueprint

The core diagnosis, unchanged and credited. Verified directly against
`details/<slug>.json`: the dimension set is `majorLeagueTeams, totalTeams,
majorSportingEvents, companies, marketCap, culturalEvents, universities,
topUniHospResearch, museumsLandmarks, portsExchangesInfra, airportScore,
luxuryStars, metroStations, suburbStations, trainHubs, skyscrapers`. Sixteen
counts of things a metro has. None describes an outcome for a resident.

"Show the map rather than assert the conclusion." This is the strongest line in
the document and it becomes the governing principle of the build. It is also,
read carefully, the decisive argument against the document's own centrepiece: a
weighted composite asserts a conclusion in its weights.

The four pillar families are the right questions. Transit, housing, environment
and labour is a defensible decomposition of material conditions. We adopt the
questions and reject the specific metrics where the data does not exist.

Metro scale is right, which is also why inherited country indicators stay out of
the rank: a conditions score that cannot distinguish London from Manchester is a
country score wearing a metro costume.

---

## What we are not building, and why

**The weighted Material Delivery Index.** Housing Stability carries the heaviest
weight at 35% and asks for rent stabilisation coverage, eviction rates and social
housing production. No global source exists for any of the three. Eviction Lab is
US-only with coverage that thins badly after 2018. Eurostat's housing cost
overburden rate is real but EU-only, NUTS2, and definitionally incompatible with
the US Census ACS cost-burden measure. Transit at 30% needs a metro-level median
income, which does not exist outside the OECD. Union density and wage theft
enforcement are national at best. Municipal utility ownership has no global
registry.

**Optics vs Delivery Ratio.** Two independent objections, either sufficient.
First, measurement: the Mayor of London controls transport and some planning but
not housing benefit; a US mayor controls a city budget; a Greater Manchester
mayor holds different devolved powers again; a Chinese municipal party secretary,
a Tokyo governor and a Paris mayor are three different offices. A cross-metro
delivery ratio measures constitutional design, not performance. Second, standing
rule: this is the May 2026 Operational Reality Matrix with a numerator and a
denominator, and that was settled once.

**The Election Atlas platform filter.** Deciding which planks count as material
relief and which count as symbolic culture-war rhetoric is the political
judgment itself, not an input to one.

**The advocacy naming.** Material Delivery Index, Public Transit Sovereign,
Municipal Energy Shield, Rent-Stabilized Core. The house style already solves
this: Gold Standard, Below the Line, Business of the Metros. Neutral containers,
sharp contents.

**Named political inspiration on site surfaces.** The blueprint names Mamdani,
Burnham and El-Sayed. That framing routes to Substack and the podcast, per the
existing containment rule, which exists precisely so the site stays citable.

---

## Data position

### Already in hand

`country-indicators.json`, 211 countries: Gini, life expectancy, HDI, rule of
law, CO2 per capita, renewable electricity share, internet penetration,
inflation. All CC BY. `state-hdi.json`, 348 subnational HDI values.

**These display as context on metro pages and are excluded from the rank.**
Country values are identical for every metro in a country.

Existing per-metro counts: display only, per correction 1.

### Acquiring, in order

**PM2.5 — BUILT 2026-08-06.** `scripts/groundfloor/build_air_quality.py`.
Annual mean for calendar 2025 from the Open-Meteo Air Quality API serving
Copernicus CAMS reanalysis. No API key. Complete by construction: every land
coordinate returns a value, confirmed against Nuuk, Ulaanbaatar and Alice
Springs. Dry-run by default, resumable cache, 95% coverage floor before write,
23-case self-test.

> **HARD REQUIREMENT: `domains=cams_global`, always.** Open-Meteo defaults to
> `auto`, which serves CAMS-Europe inside Europe and CAMS-global elsewhere.
> Measured on the same London coordinate and hours: Jan 2025 mean 13.92 under
> auto versus 12.25 forced global; on a two-day sample, 4.39 versus 7.04.
> Defaulting would measure European metros on one instrument and the rest of the
> world on another, then rank them against each other. Never switch it to auto
> for "better European accuracy." Accuracy is not the goal. Comparability is.

**Satellite vegetation / tree canopy, and built-up density.** Gridded, observed,
global, no contributor bias. The natural second and third dimensions.

**Deep layer, top 100 metros only, hand-curated with a source per row.** Fare
cap existence and level, rent regulation in force, municipal utility ownership.
Same pattern and same footprint as `mayors-overrides.json`.

**Housing cost burden, coverage-where-it-exists.** US Census ACS for US metros,
Eurostat for EU regions, published as two clearly labelled series and never
merged into one falsely comparable number.

**OSM-derived amenity density — gated behind the bias measurement in
correction 2.**

### Cannot, and will not pretend to

Global eviction rates. Global social housing production. Metro-level median
income outside the OECD. Metro-level union density. Wage theft enforcement.
Municipal utility ownership at global coverage.

---

## Methodology language, draft

> The power ranking measures accumulation: what a metro has gathered. It is a
> good instrument for that question and a useless one for any other. It cannot
> tell you whether the people living there breathe clean air, can reach work, or
> can afford to live near it.
>
> The Ground Floor measures the second question separately. We do not merge the
> two scores, because merging them would hide the only thing worth knowing: how
> far apart they are.
>
> We rank each metro on each condition independently and take the median of
> those ranks. There are no weights, because we are not in a position to tell
> you that clean air matters more than transit access.
>
> The position underneath this is stated rather than concealed: a metro that
> concentrates extraordinary capital while failing the people inside it is not
> succeeding, whatever its rank says.

No party, ideology or living individual appears. The claim grades conditions,
not persons, consistent with the wide-tent principle.

---

## Build phases, revised

**Phase 1. PM2.5 ingest.** BUILT, self-test green, full run executing.
One honest, complete, objectively-measured dimension, end to end.

**Phase 2. Satellite vegetation and built-up density.** The second and third
objective dimensions. Only after phase 1 has a shipped shape to copy.

**Phase 3. The Ground Floor rank and the gap surface.** Median-of-ranks over
whatever dimensions exist by then, the standalone view, and the gap presentation
on metro pages. Needs at least three dimensions to be worth calling a rank.

**Phase 4. Deep layer, top 100.** Curated policy records attached to metros.
Feeds the editorial programme rather than the rank.

**Not a phase.** Per-capita display of existing counts on metro pages, whenever
convenient. It is a nice-to-have, not a dependency.

Nothing before phase 3 requires a public position to be taken, and nothing
before phase 3 needs a Vercel build.

---

## What routes to Substack and the podcast instead

The pointed version of the argument: performative politics, the named
practitioners the blueprint admires, the case that accumulation has been
mistaken for success for forty years. That piece lands harder when the data it
cites is visibly not the author's opinion.

The strategic argument beyond brand discipline: the site serves an MCP endpoint
and is built for AI and journalist discoverability. Neutral, consistently
measured, well-sourced data gets cited. An advocacy-weighted index does not.
Reach is the stated priority, so the restrained version travels further, and it
supplies the ammunition the sharper channel fires.

---

## Open items

- Route and IA. Standalone section versus a view inside `/rankings`, and where
  the gap surfaces on metro profile pages.
- Whether the gap gets a homepage presence or stays a section-level story.
- Badge treatment. The concept survives if the names do not.
- PM2.5 refresh cadence and staleness budget in `staleness_check.py`. Annual
  means change once a year, so this is a yearly job, not a daily one.
- Whether PM2.5 ships visibly on its own before the rank exists, or waits.
- The four orphan detail files, `ghaziabad` especially.
