# The Ground Floor — position, spec, and what we are not building

Response to *Citizen of Nowhere: Practical Progressive Implementation Blueprint*
(Gemini, 2026-08). Decisions taken with Ashwin, 2026-08-06.

**Revision 3, 2026-08-07.** This is a **decision record**, not a build spec. The
feature shipped on 2026-08-06 in commit `0d18abf37`, and this file was committed
in that same commit **unrevised**, so for a day it instructed anyone reading it
to build the PM2.5 dimension on a source that had already been measured wrong
and thrown out. That is corrected below. Read the code as authoritative:
`scripts/groundfloor/*.py` for method, `public/data/ground-floor/index.json`
`_meta` for the shipped parameters, `app/ground-floor/page.tsx` for the surface.

Four claims from earlier revisions were disproved by measurement. Corrections 1
and 2 are marked MEASURED below; corrections 3 and 4 are stated inline where
they bite — the rejection of CAMS/Open-Meteo for PM2.5, and the exclusion of
Aqueduct's `ucw` (untreated wastewater: 105 distinct values worldwide, 0 of 206
countries with more than one, i.e. country-level, not metro-level) and `bws`
(baseline water stress: passes the variation test but is rainfall-driven).

**One finding that governs how this board may be written about.** The published
`_meta.correlations.accumulationVsConditionsRank` of −0.21 reads as "the more a
metro accumulates, the worse its conditions." It does not survive a population
control: the partial correlation is **+0.33**, and within every population band
above roughly 150,000 the sign is positive (+0.36 to +0.56). At equal size,
metros that accumulate more have *better* measured conditions. The per-metro gap
remains a sound descriptive claim. The general one does not.

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

### How every dimension is averaged — REVISED 2026-08-07

All three dimensions are **population-weighted over the metro boundary**:

    E = sum(pop_i * value_i) / sum(pop_i)

over every 30 arcsec GHS-POP cell inside the Overture-derived boundary, source
value read at its own native resolution. `scripts/groundfloor/build_exposure.py`
does the two air dimensions, `scripts/groundfloor/build_water_exposure.py` does
water. Both rewrite the dimension files in place, so the engine and the frontend
are unchanged. Population is GHS-POP R2023A epoch 2025, JRC, CC BY 4.0.

> **HARD REQUIREMENT: do not go back to a centroid sample.** Every builder below
> originally read its source at ONE POINT, the metro centroid, and each said so
> in its own `_meta.limitation`. Measured 2026-08-07: **that value sat at the
> 98.5th to 100th percentile of the population-weighted distribution** — for
> Bangkok, San Francisco, Atlanta, Munich and Mexico City it was the single
> dirtiest cell anyone in the metro is exposed to. This is structural, not a bug:
> a metro's centroid and its traffic core are the same place. Correcting it moved
> 1,720 metros more than a hundred rank places.

> **HARD REQUIREMENT: the error scales with the sharpness of the field, so never
> generalise one dimension's correction to another.** NO2 is combustion-only and
> sharply peaked, so 29.5% of metros moved by 20% or more. PM2.5 is a smooth
> regional field, so only 1.7% did. Water is province-level, so 1,629 metros
> could not move at all. Same pipeline, same boundaries, three magnitudes.

> **HARD REQUIREMENT: H3 is a join key and a presentation grid, NEVER the
> analysis unit.** Binning 1 km population and 11 km concentration onto hexagons
> before averaging inserts a resampling step that costs accuracy it cannot give
> back. Read every source at native resolution and weight ONCE. The r6 cell layer
> built by `scripts/build_metro_grid.py` exists to attach external datasets to
> metros by set intersection, and for drawing. It must not enter this integral.

### Acquiring, in order

**PM2.5 — SHIPPED 2026-08-06, population-weighted 2026-08-07.**
`scripts/groundfloor/build_air_quality.py` (original centroid build, retained for
comparison; `build_exposure.py` now produces the shipped values).
Annual mean for calendar **2024** from **SatPM2.5 V6GL03** (Atmospheric
Composition Analysis Group, Washington University in St. Louis), 0.1°, CC BY
4.0, pulled unsigned from the AWS Registry of Open Data bucket `satpmdata`,
about 5 MB per year, 1998–2024. 28-case self-test, 10-case validation against
the IQAir World Air Quality Report.

> **HARD REQUIREMENT: test for the `-999` sentinel, not for NaN.** The raster
> contains no NaNs at all. Ocean and no-data cells carry `-999`, and they are
> 63% of the grid. A NaN-only guard silently ranks ocean cells as the cleanest
> air on earth.

> **DO NOT substitute CAMS / Open-Meteo. It was built, measured, and rejected on
> 2026-08-06.** An earlier revision of this spec made `domains=cams_global` a
> hard requirement; that instruction is **withdrawn**. CAMS is right on London
> and wrong on rank order, because its total PM2.5 includes sea salt and dust:
> it put Delhi at 80.3 against Beijing 83.4 when reality is roughly two to one
> the other way, and Los Angeles at 23.7, above El Paso's 11.4 — El Paso being
> the most polluted US city in the reference data. The tell was a near-neighbour
> check: coastal Jeddah 79.2 against inland Mecca 44.7, where the correct source
> gives 44.0 against 61.5. The rejected build is parked at
> `_to_delete/build_air_quality_CAMS_rejected.py`. See the header of
> `scripts/groundfloor/build_air_quality.py` for the full evidence table.

**NO2 — SHIPPED 2026-08-06, population-weighted 2026-08-07.**
`scripts/groundfloor/build_no2.py` (original centroid build;
`build_exposure.py` now produces the shipped values). **This is the dimension
the centroid was worst on** — 74.3% of metros moved by 5% or more and 29.5% by
20% or more, because NO2 peaks exactly where a centroid lands. Annual mean
for **2023** from **GlobalNO2_AiT** (Mu & Tao, ESSD 2026), 0.1°, CC BY 4.0,
Zenodo 10.5281/zenodo.13842191, about 100 MB, 2005–2023. 37-case self-test.
Earns its place on the collinearity test: Spearman 0.53 against PM2.5.

> **HARD REQUIREMENT: binary-search the latitude axis.** It is **not** uniformly
> spaced — 1,394 steps of 0.1° plus jumps of 0.4, 0.6, 0.7 and 1.9° where empty
> southern rows were dropped. Arithmetic indexing put London at latitude −28.55
> and only the coverage floor caught it. Note also that this raster fills with
> NaN, unlike SatPM2.5's `-999`; a sampler shared between them must test both.

**Water and sanitation — SHIPPED 2026-08-06, population-weighted 2026-08-07.**
`scripts/groundfloor/build_water_sanitation.py` (original centroid build);
`scripts/groundfloor/build_water_exposure.py` now produces the shipped values.
Aqueduct is polygons rather than a raster, so the weighted build **rasterises
`udw`, `usa` and a polygon id onto a 0.05° global grid once** (cached at
`_to_delete/aqueduct_udw_usa_005deg.npz`) and then reuses the exposure path
unchanged. `combine()` is applied PER CELL so a cell missing either
sub-indicator leaves both numerator and denominator instead of contributing half
a measure. Rasterisation fidelity was **measured, not assumed**: against exact
point-in-polygon at 600 sampled centroids, 97.0% exact agreement, median
disagreement 0.0021 and max 0.0951 on a 0–1 share, an order of magnitude below
the weighting effect it sits inside (`_to_delete/verify_water_raster.py`).
61.9% of metros changed; **1,629 could not, because they sit wholly inside one
polygon.** `detail` now reports the polygon holding the largest share of the
metro's population, and that share, rather than implying one region covers the
whole metro. WRI **Aqueduct 4.0** baseline
annual, indicators `udw` (unimproved drinking water) and `usa` (unimproved
sanitation) as population shares.
ESRI FileGDB, needs `pyogrio` — the published CSV carries no geometry. 27-case
self-test. `udw` and `usa` correlate at 0.818 but diverge usefully (Dhaka: water
0.015, sanitation 0.305), so they are combined into **one** dimension with both
raw values kept in `detail`; registering them separately would have given water
half the median's weight by accident. 31 metros unresolved (remote islands
Aqueduct does not cover), and because `dimensionsRequired: 3` they are dropped
from the board entirely rather than merely unranked — Honolulu among them.

**Satellite vegetation / tree canopy, and built-up density — REJECTED, not
deferred.** Built-up density fails the unambiguous-direction test: dense is
arguably good, which is Zone Zero's own thesis. Vegetation is rainfall-driven,
the same biome confound that ruled out Aqueduct's `bws` water stress. Ozone was
rejected too: urban NOx titrates O3, so high-traffic metros read *lower*, which
would reward exactly what the NO2 dimension penalises. Ookla broadband was
rejected on licence (CC BY-NC-SA 4.0, non-commercial and share-alike). Urban
heat island was rejected by Ashwin.

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

**Phase 1. PM2.5 ingest. SHIPPED 2026-08-06, commit `0d18abf37`.**
One honest, complete, objectively-measured dimension, end to end.

**Phase 2. The second and third dimensions. SHIPPED 2026-08-06, commit
`0d18abf37`** — as NO2 and water+sanitation, not as the vegetation and
built-up density this spec originally proposed. Both of those were rejected on
the grounds recorded above.

**Phase 3. The Ground Floor rank and the gap surface. SHIPPED 2026-08-06,
commit `0d18abf37`.** Median-of-ranks with average ties over three dimensions,
`dimensionsRequired: 3`, **4,269 metros ranked**, `provisional: false`, at the
standalone route `/ground-floor`, wired into `app/DesktopNav.tsx` and
`app/MobileMenu.tsx`. The gap is reported in **percentile points**;
`gapRanks` is display-only and is not comparable across the table.

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
