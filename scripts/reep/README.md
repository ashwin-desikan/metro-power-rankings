# Reep Register join (dry run, 2026-09-22, v0 and v1)

Attaches a stable club identity (Reep ID plus Wikidata QID and provider keys) to every row of the
men's club source of truth, `Champions League-201516.xlsx` sheet `Lookup`. Nothing here writes to the
workbook or to Supabase. The scripts emit CSV reports for review; applying the result is a separate,
later step through the surgical zip edit and the `cl-lookup-sync` skill.

## What Reep is

The Reep Register (github.com/withqwerty/reep, reep.football) is a CC0 identity file for football:
one stable id per club, competition and season, with a crosswalk to Wikidata, Transfermarkt, FBref,
UEFA, ESPN, api-football, ClubElo, FotMob, TheSportsDB and about twenty other providers.

Two generations exist and they are not interchangeable:

| | v0 (this dry run) | v1 |
|---|---|---|
| Where | `data/*.csv` in the GitHub repo | reep.football/downloads (CSV bundles plus a DuckDB file) |
| Status | Frozen. Last data release 2026.25 (21 June 2026) | Live. Release 20260915T203651Z at the time of writing |
| Clubs | 45,337 | 27,727 |
| Competitions | 212, most without a country | 1,430, with seasons and stages |
| Aliases | 27,591 | 673,575 |
| Provider bridges | in-row key columns, thin for espn/api_football/clubelo (10 to 22 clubs each) | `bridges.csv.gz`, 7.5M rows, includes espn, api_football, clubelo, uefa, fbref |
| Matches | none | `matches.csv.gz`, 1.42M rows |
| Licence | CC0 1.0 | CC0 1.0 |

reep.football is not on the egress allowlist from either the cloud container or the device shell
(`403 from proxy`, tested 2026-09-22). GitHub is. So this dry run used v0, and the first real run
needs the v1 bundles downloaded from native Windows or the mini into `Excel Files/reep-v1/` (or any
path passed with `--reep`). The scripts read plain CSV, so the v1 files only need `gunzip`.

## Files

- `reep_join_clubs.py`: the club matcher. Tiers T1, T2a, T2b (primary names), the same three again
  against Wikidata aliases, then T3. Ambiguity is reported, never resolved by scoring.
- `reep_join_competitions.py`: the competition matcher, same normaliser, name-only because Reep v0
  carries no country for 196 of 212 competitions.
- `dryrun-2026-09-22/reep_club_summary.txt`: the numbers below.
- `dryrun-2026-09-22/reep_club_matches.csv`: one row per matched Lookup row, with `sheet_row`, tier,
  `reep_id`, `key_wikidata` and every provider key Reep v0 carries.
- `dryrun-2026-09-22/reep_club_ambiguous.csv`: 521 rows with more than one candidate. Column
  `suggested_if_only_one_has_keys` names the one candidate that carries provider keys when exactly
  one does (254 rows). It is a suggestion for a ruling, not an applied match.
- `dryrun-2026-09-22/reep_club_unmatched.csv`: 3,230 rows with no candidate.
- `dryrun-2026-09-22/reep_competition_matches.csv`: 115 site competitions against Reep v0.
- `dryrun-2026-09-22/site_competitions.csv`: the site list used (football_competitions plus the
  football rows of champion_competitions, pulled from Supabase on 2026-09-22).

## Run

```
python scripts/reep/reep_join_clubs.py --lookup <Lookup sheet as CSV> \
    --reep <reep>/data/teams.csv --names <reep>/data/names.csv --out scripts/reep/dryrun-<date>/
python scripts/reep/reep_join_competitions.py --site scripts/reep/dryrun-<date>/site_competitions.csv \
    --reep <reep>/data/competitions.csv --names <reep>/data/names.csv --out scripts/reep/dryrun-<date>/
```

Dump `Lookup` with openpyxl `read_only=True, data_only=True`, header row kept, into a CSV outside the
repo (the sheet is gitignored workbook content). `sheet_row` in every report is the 1-based Excel row.

## Results, v0, 2026-09-22

Lookup rows 9,956. Matched 6,205 (62.3%). Ambiguous 521 (5.2%). Unmatched 3,230 (32.4%).

By level: Level 1 clubs 1,106 of 1,444 (76.6%), 122 ambiguous. Level 2 368 of 486. Level 3 216 of 267.

Of the 6,205 matched rows 6,201 carry a Wikidata QID and 3,791 carry at least one provider key
beyond Wikidata: Transfermarkt 2,779, Soccerway 1,986, TheSportsDB 1,341, FBref 1,307, UEFA 885,
SportMonks 687. ESPN 16, api-football 10, ClubElo 21: those three columns are effectively empty in
v0 and are the reason the real run needs v1.

Worst coverage among countries with 20 or more rows: Gibraltar 10%, Iceland 32%, Sudan 35%, Greece
37%, Brazil 38%, Finland 39%. Greece and Brazil fail on transliteration and on long-form Wikidata
labels (Grêmio is "Grêmio Foot-Ball Porto Alegrense") that v0's 27k aliases do not bridge. v1's 673k
aliases should lift both; that is a forecast, not a measurement.

What the ambiguous set is: 248 of the 521 are two Reep rows with the identical name in the same
country, which is Wikidata carrying a duplicate item, a defunct namesake (Cork City 1938 versus 1984),
or a women's or reserve side typed as a club. The `suggested_if_only_one_has_keys` column resolves
254 of them mechanically if the ruling is "the item with provider mappings is the senior men's club".
That ruling is not always right (Beitar Tel Aviv: the keyed item is the 2000 club, the unkeyed one is
the 1934 club), so it is left as a suggestion.

Competitions: 48 of 115 matched, 6 ambiguous, 61 unmatched. Premier League, Bundesliga and Serie A
are ambiguous because v0 holds the women's league under the same label; Champions League, Europa
League, European Cup and UEFA Cup are simply absent from v0's 212 rows. Verdict: competition and
season IDs wait for v1.

## Rules the matcher enforces

1. No fuzzy scoring. A name matches after normalisation or it does not.
2. Country must agree (Lookup label mapped to the Wikidata label in `COUNTRY_MAP`; England, Scotland,
   Wales and Northern Ireland map to United Kingdom).
3. A Reep primary name beats a Wikidata alias. Wikidata lists "Manchester United" as an alias of
   F.C. United of Manchester; without this rule Manchester United is ambiguous.
4. "united", "city" and "town" are never stripped. Stripping them merged Manchester United,
   Manchester City and F.C. United of Manchester.
5. When a name still has several candidates, rows whose Reep name says women, reserve, academy,
   under-N, II, B, futsal or season are dropped, and only then. If that leaves one, it matches.
6. Anything else is reported as ambiguous or unmatched. Metro Area, Lat and Long are never touched;
   Reep has no stadium entity and its geography is not ours.

## What applying it would change

Two new columns on `Lookup` (`reep_id`, `wikidata_qid`) and the same two on `public.football_lookup`,
plus a `football_team_reep` bridge table in Supabase holding the provider keys per Reep ID. Protected
rows stay protected. `api_name` validation and the ClubElo override map come from the v1 bridges, not
from this file.

## Results, v1 full bundle, 2026-09-22 (night)

All seven v1 files are in `Excel Files/reep-v1/` (release 20260915T203651Z). `bridges.csv` is 456 MB
uncompressed, over the 400 MB staging cap, so it is filtered on the device first:
`awk -F, 'NR==1 || $4 ~ /^rt/' bridges.csv > derived/bridges_teams.csv` (123k rows), same for
`^r[ls]` (competitions and seasons) and for `aliases.csv`. `reshape_v1.py` then builds the matcher
inputs: teams with one `key_<provider>` column per bridge provider, and an alias file keyed by v1 id.
A staging quirk: OneDrive reports the derived files as hard-linked and refuses them; copy to the
project folder first (`scripts/reep/_v1derived/`, gitignore it).

Clubs, v1 with aliases and bridges: 6,226 matched (62.5%), 391 ambiguous, 3,339 unmatched. Level 1
1,263 of 1,444 (87.5%), Level 2 95.5%, Level 3 95.9%. Aliases added 797 matches over the label-only
run, all tagged `-alias` in the tier column. v0 and v1 together give an id for 7,756 rows (77.9%);
Level 1 has an id for 1,352 of 1,444 (93.6%). Level 1 misses are now almost all African (DR Congo 25,
Ethiopia 16, Sudan 16, Tanzania 11, Cameroon 8) plus Hong Kong 8.

Provider keys attached to matched Lookup rows: Opta 6,193, Wyscout 5,795, FotMob 3,931, api-football
3,581, SportMonks 3,480, FIFA 3,406, ESPN 1,846, UEFA 850, ClubElo 624, Understat 184. No Wikidata
and no FBref bridges exist for teams in v1; those come from v0 (QID 6,202, FBref 1,307).

**Trust the rung, not the count.** Every v1 bridge carries a `rung` (evidence tier). ESPN ids are
`corroborated-mint` and UEFA ids are `first-party`: take those. **api-football, ClubElo, Capology, FM
and SportMonks are `name-nationality`, a name match by Reep's own engine.** Measured against the
workbook's `API Teams` sheet (populated from the api-football API itself): of 336 Lookup rows where
both sides hold an api-football id, 232 agree and 104 do not (Wigan 61 vs 22652, AC Ajaccio 3248 vs
98). So Reep's api-football key must not validate or overwrite `api_name`; the workbook is the
stronger source there, and the 104 conflicts are a list to check against the live API from the mini.
ClubElo has no id other than its label, so `name-nationality` is the only rung possible; the 624
labels are still the right seed for the override map, verified against a live ClubElo snapshot.

Combined file `dryrun-2026-09-22-v1/reep_club_combined_v0_v1.csv`, one row per Lookup row: `status`
in agree 3,683 / both-matched-names-differ 993 / v1-only 1,550 / v0-only 1,530 / ambiguous 332 /
none 1,868. `both-matched-names-differ` is mostly v1 short labels against v0 Wikidata labels
(Rennes / Stade Rennais F.C.) and is not by itself a conflict; the real conflicts inside it are the
ones where the v0 and v1 countries or founding eras disagree (Randers FC / Randers Freja).

Competitions, v1 with aliases: 69 of 115 T1, 1 T2, 8 ambiguous, 37 unmatched. Remaining misses are
short site labels (Champions League, Europa League, La Liga, Cup Winners Cup), defunct competitions
v1 does not carry (Mitropa Cup, Latin Cup, Inter-Cities Fairs Cup, Soviet Cup, Tschammer-Pokal), and
`champion_competitions` rows with no country (Premier League, Bundesliga, Serie A, Ligue 1 hit every
national namesake). Women's competitions show NONE because the matcher input drops `gender=women`.
Verdict stands: a hand crosswalk from site slug to v1 id for those 46 rows.

`relationships.csv` (kinds: in_stage 1,417,576, participates_in 521,237, stage_of 26,110, season_of
8,008, affiliated_to 1,909, succeeded_by 41) is what ties `matches.csv` to a competition and season:
match -> in_stage -> stage -> stage_of -> season -> season_of -> competition. The corpus is usable
once that chain is joined; it is not joined here.

## National teams (2026-09-22, later)

The 255 national-team rows in Lookup (`Club` column starts with "Country") are matched by COUNTRY, not
by name (tier `NAT`): the senior men's side is the entity in that country whose label carries no age
or women's marker and that has a `national_football_teams` bridge. Two Reep v1 defects forced this.
A country's football federation is filed as an `rt` entity with the same label as the team (its only
bridge is `fifa` in the `association` namespace); `reshape_v1.py` drops association-only entities.
And age-group sides carry the bare country as an alias (China PR U22 has alias "China") while the
senior side is labelled "China PR", so a name match lands on the wrong entity. A territory never falls
back to its parent state (Saar is not Germany, Saba is not Bonaire); renames are listed in
`NAT_RENAMES`. Result 248 of 255; the 7 left (Kurdistan, Saba, Sint Eustatius, Saint Barthélemy,
Saint Pierre and Miquelon, Christmas Island, Cocos Islands) have no Reep entity.

## Elimination through league history (Ashwin's method, 2026-09-22)

`reep_elimination_match.py`. The site's league tables (workbook sheets Leagues History, Stand2nd,
StandOth, World: 117,603 club-seasons, 7,346 tables, 293 country-league pairs, 76 countries; the same
rows are `public.cl_league_history`) say which clubs sat in which competition in which season. Reep's
`relationships.csv` (`participates_in`, `stage_of`, `season_of`) says which Reep teams sat in which
Reep season. For each site table: find the Reep season whose participants best overlap the clubs that
already have a Reep id (at least 3 known, at least half present); remove the known from both sides;
what is left on each side must be each other. One versus one is a match (`ELIM-1`); inside a larger
leftover set an exact name (`ELIM-name`) or a distinctive shared token unique in both directions
(`ELIM-token`) is a match; the rest is written out for a ruling. Evidence pools across seasons; a
match with 3 or more seasons goes into the combined file (`match_source = elimination (n seasons)`),
1 or 2 seasons goes to the rulings file as type 4. Passes are cumulative and converge in three.

Measured: 2,907 of 7,346 tables identified a Reep season. 501 club matches the name matchers could
not make, 319 on Lookup rows (183 with 3+ seasons applied, 136 to rule) and 188 on table spellings
that are not in Lookup at all (those are aliases for `football_club_names`). 37 clubs where the
evidence points at two Reep ids across eras (Lierse 1960s and Lierse SK 2024, Carpi and AC Carpi):
Reep carries two entities for one lineage, and those are rulings type 5. 618 leftover sets remain
unresolved (`reep_elimination_unresolved.csv`, 320 distinct site clubs; 185 sets have at most two
names a side and are quick to rule by eye).

By-product: `reep_competition_crosswalk_from_tables.csv`, 184 site (country, league) pairs mapped to a
Reep competition by the seasons that were accepted, 134 strong (2+ seasons agreeing, 70%+). This is
the crosswalk the name matcher could not produce.

**The ceiling is Reep's season coverage, not the matcher.** Share of site tables for which a Reep
season exists: 88% in the 2020s, 94% in the 2010s, 75% in the 2000s, 27% in the 1990s, 5% before
1990. Reep is a present-day register with a shallow history. The workbook remains the historical
source of truth; Reep ids attach to lineages, they do not replace the tables.

Totals after everything (`reep_club_combined_v0_v1.csv`): 8,070 of 9,956 Lookup rows have a Reep v1
id or a QID (81.1%); 6,650 have a v1 id; Level 1 1,372 of 1,444 (95.0%). `RULINGS_NEEDED.csv` holds
513 rows in five types; 69 of them are Level 1.

## Match audit and the disambiguator (2026-09-22, late night)

Ashwin reviewed the rulings file and found choices that should never have reached him. Two defects in
the name matcher were behind them, both now fixed and both now audited on every run:

1. **Clubs landed on national-team entities.** RC France went to the France national side, México FC
   to Mexico, San Marino Calcio to San Marino. Cause: a club-form word ("Racing Club", "FC") stripped
   at the loose tier left the bare country, and Wikidata lists "Holland" as an alias of the
   Netherlands. Fix: for a club row, an entity whose label equals its own country and that carries a
   `national_football_teams` bridge but no ClubElo entry is never a candidate (AS Monaco is filed as
   "Monaco" with ClubElo, so it survives). National teams match by country only (`NAT` tier).
2. **Senior rows landed on youth and reserve entities, and reserve rows were unmatchable.** AC Verona
   was offered Hellas Verona U19 against U17. The blanket "drop anything with II, B or U-number" rule was
   wrong in both directions: Lookup itself carries Sturm Graz II, Club Brugge II, Jong Ajax and the U21
   sides as rows, because they sit in league tables. Fix: `side_flag()` classifies both sides (senior,
   reserve, youth); a match requires the flags to agree. A trailing II/B counts as a reserve marker only
   when the base name is itself an entity, so Willem II stays a senior club and Sturm Graz II does not.
   Women's entities are dropped before matching, in every language Reep uses.

Audit after the fix, on the matched set: clubs on national entities 0, senior rows on reserve or youth
entities 0, women's entities 0.

**The disambiguator** (`reep_disambiguate.py`) replaces the suggestion column. It runs eight rules in
order, each deciding only when it leaves one candidate, and writes the rule and the evidence into the
decision. Every later rule chooses within the pool of candidates whose label carries the Lookup name
(abbreviations expanded: CA is Club Atlético, CD is Club Deportivo), so a date or a season can never
pick a differently named club.

| Rule | Decides by | Example |
|---|---|---|
| R1 exact | a Lookup name equals one label | Amiens AC |
| R7 current | levelled row (plays now); one name-carrying candidate sat in a current season | FC Arges is Argeș (2013-), not FC Argeș Pitești (folded 2013) |
| R2 subset | one candidate carries every token and adds none; club-type suffixes are neutral, the city is neutral, a parenthetical naming another place disqualifies | CA Del Plata is Club Atlético Del Plata, not La Plata FC; Johnstone is Johnstone F.C., not Johnstone Athletic |
| R3 city | Lookup City or Metro appears in one candidate's label or aliases, and is not already in the club's own name | Club de Gimnasia y Esgrima (Jujuy) |
| R4 api-id | workbook API Teams id equals one candidate's api-football key | |
| R5 qualifier | a parenthetical or bare year in the Lookup name matches one candidate's alias, label or founding year; if it matches none, the duplicate rules are switched off | Washington Diplomats 1981 stays open: both items are 1974 and 1987 |
| R8 founded | v0 founding year against the club's own table years; the latest founding before the first season | Wimbledon F.C. (1889), not AFC Wimbledon (2002), for tables 1978-2004 |
| R6 duplicate | identical labels: the one with provider keys; if both keyed, the one at least twice as rich; if neither keyed, the item with founding or stadium data, else the older Wikidata item | |

Result: v1 179 ambiguous rows, 118 decided, 61 open. v0 521, 408 decided, 113 open. After the union
of registers, elimination and Ashwin's five rulings, 28 rows remain in type 1, each carrying its full
rule trace in `how_to_rule`. What is left there is Reep's own defects (two current entities for one
club, a wrong alias on their side) or a Lookup row with no city and two same-named clubs in different
cities (AD Guarany: Bagé or Sobral).

The elimination matcher now also enforces the side flag when pairing leftovers, which stopped Jong FC
Volendam landing on AFC.

Totals: 8,131 of 9,956 Lookup rows carry a Reep id or QID (81.7%); Level 1 1,384 of 1,444 (95.8%).
Rulings file 397 rows, 50 at Level 1: type 1 28, type 2 api-football conflicts 104, type 3 v0/v1 name
conflicts 127, type 4 elimination on 1-2 seasons 126, type 5 two-era ids 18.

A note on the file Ashwin reviewed: `RULINGS_NEEDED.csv` was open in Excel from the first version on,
so every later write was refused and the copy on screen stayed the first, 551-row draft. The lock is
the reason the earlier fixes never reached the screen; the defects above were real all the same.

## Applied, 2026-09-22 (night)

The dry run became live in three places. `write_lookup_ids.py` put `Reep ID`, `Wikidata QID`, `ESPN ID`
and `UEFA ID` on `Lookup` columns AF:AI of the master workbook (inline strings, surgical zip edit,
backup `.bak-20260922-reepids` beside the master). `load_bridge.py` upserted
`dryrun-2026-09-22-v1/football_team_reep.json` into `public.football_team_reep`, one row per Lookup
row keyed on `sheet_row`, with `lookup_id` linking to `football_lookup`, `provider_keys` (every Reep
bridge with its rung) and `names` (workbook columns, Reep label, Reep aliases). In the database,
`refresh_football_identity_alias()` flattens that into `public.football_identity_alias`,
`football_name_norm(text)` reproduces `strict_norm`, and `resolve_football_team(provider, key,
country)` answers a lookup. `lib/teamIdentity.ts` and `identity.py` wrap it for the site and the
scrapers: exact after normalisation, workbook columns outrank Reep labels outrank Reep aliases, the
workbook's api-football ids outrank Reep's, and an ambiguous name is returned as ambiguous.

`build_rulings.py` also learned two things that night: an elimination pair needs name evidence (a
blind pair is offered only after three league seasons, as type 4b), and `Cur. Name` is the workbook's
lineage key, so an old-name row carries its franchise's current entity and keeps its own era in
`reep_v1_predecessors`.

Rerun order after a new Reep release or a batch of rulings: `reshape_v1.py`, `reep_join_clubs.py`
(v0 and v1), `build_rulings.py`, then three passes of `reep_elimination_match.py` ->
`reep_disambiguate.py` -> `build_rulings.py`; then regenerate `football_team_reep.json` (see
HANDOFF 2026-09-22 night for the builder), `load_bridge.py --write`, `select
refresh_football_identity_alias()`, and `write_lookup_ids.py --write` only if the workbook columns
are empty (it refuses to overwrite).
