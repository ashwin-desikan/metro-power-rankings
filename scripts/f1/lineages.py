"""Which Ergast constructor records belong to which CONTINUOUS TEAM.

Jolpica inherits Ergast's identity model, and that model is not "teams". It is
chassis-plus-engine, and it is wrong in both directions.

  It SPLITS one team across records. Team Lotus's 79 wins sit under `team_lotus`
  (45), `lotus-climax` (22), `lotus-ford` (11) and `lotus-brm` (1). Brabham's sit
  under `brabham` and `brabham-repco`. Published raw, an expert stops trusting
  the board on sight.

  It MERGES organisations sharing nothing but a badge. `alfa` runs 1950 to 2023
  and welds the Fangio-era works team, some 1960s private entries, the 1979-85
  Autodelta team and Sauber-in-Alfa-branding into one row. `ats` welds an Italian
  1963 team to an unrelated German 1978-84 team that shares only an acronym.

This file is the curation layer, the same shape as the rankings board's
`era_names.csv` and `hq_spans_master.csv`: a team is a sequence of dated ERAS,
each claiming a set of constructor records for a span of years.

## The four rules, applied in this order

1. MERGE chassis-engine variants of one marque. Uncontested; "Brabham-Repco" was
   never a different team from "Brabham".
2. SPLIT only where the spans are indisputably different organisations. Six
   cases: alfa, mercedes, renault, honda, aston_martin, ats.
3. CHAIN where the entrant organisation is continuous and the succession is
   documented, even though the name changed.
4. NOTE everything else. Where a link is arguable it carries contested=1 and a
   sentence, and the page SHOWS that rather than hiding the judgement.

## Why most spans are open

An era's (from_year, to_year) exists to ASSIGN a result row, not to describe it.
Where a constructor_id belongs to exactly one lineage the bounds are open and
the displayed years are MEASURED from the results, so a typo in a year cannot
silently mislabel a season. Real bounds appear only where one record is split
across lineages or eras, which is the six split cases plus Sauber's three
separate spells under its own name.

## Headline numbers must show BOTH

The page shows the current identity's own record AND the chain total, labelled
separately. Folding Tyrrell's wins into Mercedes silently would be the same
error as the rankings board asserting an undated name.
"""

OPEN = (0, 9999)

# (lineage_id, era_name, [constructor_ids], from_year, to_year, contested, note)
ERAS = []


def era(lineage, name, ids, span=OPEN, contested=0, note=""):
    ERAS.append({"lineage": lineage, "era_name": name, "ids": list(ids),
                 "from_year": span[0], "to_year": span[1],
                 "contested": contested, "note": note})


# ── RULE 3: CHAINS. One organisation, several names. ─────────────────────────

# Brackley. Ken Tyrrell's team was at Ockham in Surrey; BAR built the Brackley
# factory in 1999 and the entrant has been continuous through it ever since.
era("mercedes", "Tyrrell Racing", ["tyrrell"])
era("mercedes", "British American Racing", ["bar"], note=(
    "BAR bought Tyrrell's entry in 1998 and moved the operation to a new "
    "Brackley factory. The purchase of the entry, not just the assets, is what "
    "makes this one organisation rather than two."))
era("mercedes", "Honda Racing F1", ["honda"], (2006, 2008), note=(
    "Honda bought the team outright for 2006. Distinct from the 1964-68 Honda "
    "works team, which is filed separately."))
era("mercedes", "Brawn GP", ["brawn"], note=(
    "Ross Brawn's management buyout after Honda withdrew in late 2008. One "
    "season, both titles, then sold to Mercedes."))
era("mercedes", "Mercedes", ["mercedes"], (2010, 2026), note=(
    "Distinct from the 1954-55 Mercedes-Benz works team, filed separately."))

# Enstone. Toleman and early Benetton were at Witney; the move to Enstone came
# in 1992, so the chain is the entrant, not the postcode.
era("alpine", "Toleman", ["toleman"])
era("alpine", "Benetton Formula", ["benetton"])
era("alpine", "Renault F1 Team", ["renault"], (2002, 2011), note=(
    "Renault bought Benetton in 2000 and ran under its own name from 2002. "
    "Distinct from the 1977-85 Renault works team, filed separately."))
era("alpine", "Lotus F1 Team", ["lotus_f1"], note=(
    "Genii Capital's renaming of the same Enstone entrant. No relation to Team "
    "Lotus, nor to the 2010-11 Lotus Racing that became Caterham."))
era("alpine", "Renault F1 Team", ["renault"], (2016, 2020))
era("alpine", "Alpine F1 Team", ["alpine"])

# Milton Keynes.
era("red-bull", "Stewart Grand Prix", ["stewart"])
era("red-bull", "Jaguar Racing", ["jaguar"], note=(
    "Ford bought Stewart in 1999 and rebranded it Jaguar for 2000."))
era("red-bull", "Red Bull Racing", ["red_bull"], note=(
    "Red Bull bought Jaguar from Ford in November 2004 for a reported one "
    "dollar plus a commitment to invest."))

# Faenza, with a design office at Bicester.
era("racing-bulls", "Minardi", ["minardi"])
era("racing-bulls", "Scuderia Toro Rosso", ["toro_rosso"], note=(
    "Red Bull bought Minardi in 2005 and renamed it for 2006. The entrant at "
    "Faenza has been the same company throughout."))
era("racing-bulls", "Scuderia AlphaTauri", ["alphatauri"])
era("racing-bulls", "Racing Bulls", ["rb"])


# Silverstone.
era("aston-martin", "Jordan Grand Prix", ["jordan"])
era("aston-martin", "MF1 Racing", ["mf1", "spyker_mf1"], note=(
    "Midland bought Jordan in 2005 and ran as MF1 for 2006. Ergast splits the "
    "single 2006 season across two records; both are claimed here."))
era("aston-martin", "Spyker F1", ["spyker"])
era("aston-martin", "Force India", ["force_india"], note=(
    "Vijay Mallya's consortium bought Spyker in October 2007."))
era("aston-martin", "Racing Point", ["racing_point"], contested=1, note=(
    "THE ARGUABLE LINK IN THIS CHAIN. Force India went into administration in "
    "July 2018 and Lawrence Stroll's consortium bought the ASSETS, not the "
    "company; the FIA treated the 2018 entry as two entrants and split the "
    "season's points. Recorded as continuous because the factory, the staff and "
    "the entry all carried on, but a reader who wants to cut the chain here has "
    "a real argument."))
era("aston-martin", "Aston Martin", ["aston_martin"], (2021, 2026), note=(
    "Distinct from the 1959-60 Aston Martin works team, filed separately."))

# Hinwil. Sauber's own name returns twice, so these spans are real, not open.
era("audi", "Sauber", ["sauber"], (1993, 2005))
era("audi", "BMW Sauber", ["bmw_sauber"], note=(
    "BMW bought a controlling stake in 2005 for the 2006 season."))
era("audi", "Sauber", ["sauber"], (2010, 2018), note=(
    "Peter Sauber bought the team back when BMW withdrew at the end of 2009."))
era("audi", "Alfa Romeo", ["alfa"], (2019, 2023), note=(
    "A title-sponsorship rename of the Hinwil team, not the Alfa Romeo works "
    "team of 1950-51 or 1979-85. Ergast files all three under one record; they "
    "are separated here."))
era("audi", "Stake F1 Team Kick Sauber", ["sauber"], (2024, 2025), note=(
    "The full entrant name, because 'Kick Sauber' is how the 2024-25 team is "
    "listed elsewhere on the site and the lookup from a valuations row has to "
    "find it."))
era("audi", "Audi", ["audi"], note=(
    "Audi completed its acquisition of Sauber Holding in January 2025 and the "
    "entry runs as the Audi works team from 2026."))

# The rest of the chains.
era("arrows", "Arrows", ["arrows"], (1978, 1990))
era("arrows", "Footwork", ["footwork"], note=(
    "Footwork bought into Arrows in 1990 and the entry ran under the Footwork "
    "name from 1991 before reverting."))
era("arrows", "Arrows", ["arrows"], (1997, 2002))

era("manor", "Virgin Racing", ["virgin"])
era("manor", "Marussia", ["marussia"])
era("manor", "Manor Marussia", ["manor"])

era("caterham", "Lotus Racing", ["lotus_racing"], note=(
    "Tony Fernandes's Hingham team, licensed to use the Lotus name. No relation "
    "to Team Lotus or to the Enstone Lotus F1 Team."))
era("caterham", "Caterham", ["caterham"])


# ── RULE 2: SPLITS. One Ergast record, several unrelated organisations. ──────

era("alfa-romeo", "Alfa Romeo SpA", ["alfa"], (1950, 1951), note=(
    "The Portello works team that won the first two drivers' championships with "
    "Farina and Fangio, then withdrew."))
era("alfa-romeo", "Alfa Romeo private entries", ["alfa"], (1963, 1965),
    contested=1, note=(
    "Two scattered mid-sixties entries Ergast files under the same record. They "
    "are neither the works team nor Autodelta, and are kept with the marque "
    "rather than assigned to an organisation we cannot name."))
era("alfa-romeo", "Autodelta / Euroracing Alfa Romeo", ["alfa"], (1979, 1985), note=(
    "Alfa's return as a constructor, run by Autodelta and then Euroracing. "
    "Unconnected to the 2019-23 Alfa Romeo, which was Sauber."))

era("mercedes-works", "Mercedes-Benz", ["mercedes"], (1954, 1955), note=(
    "The W196 works team. Two seasons, two drivers' titles, withdrawn after Le "
    "Mans 1955 and unconnected to the Brackley team that carries the name now."))

era("renault-works", "Équipe Renault Elf", ["renault"], (1977, 1985), note=(
    "The Viry-Châtillon works team that introduced the turbo engine to Formula "
    "1. Unconnected to the Enstone team that later carried the name."))

era("honda-works", "Honda R&D", ["honda"], (1964, 1968), note=(
    "Honda's first works entry, which won at Mexico in 1965 and Monza in 1967 "
    "before withdrawing. Unconnected to the 2006-08 Brackley team."))

era("aston-martin-works", "Aston Martin", ["aston_martin"], (1959, 1960), note=(
    "The DBR4 works entry, six races and no points. Unconnected to the "
    "Silverstone team that carries the name now."))

# An acronym collision, not a lineage. Two teams, two countries, no link.
era("ats-italy", "ATS (Automobili Turismo e Sport)", ["ats"], (1963, 1963), note=(
    "Founded by Ferrari engineers who walked out in the 1961 palace revolt. One "
    "season."))
era("ats-germany", "ATS (Auto Technisches Spezialzubehör)", ["ats"], (1978, 1984), note=(
    "Günter Schmid's wheel company. Shares an acronym with the 1963 Italian "
    "team and nothing else; Ergast files both under one record."))


# ── RULE 1: MERGES. Chassis-engine variants of one marque. ──────────────────
# Uncontested: "Lotus-Climax" was never a different team from "Team Lotus".
# Spans stay open because each record belongs to exactly one marque.

era("team-lotus", "Team Lotus", [
    "team_lotus", "lotus-climax", "lotus-maserati", "lotus-borgward",
    "lotus-brm", "lotus-ford", "lotus-pw"], note=(
    "Ergast files Colin Chapman's team under seven chassis-engine records. They "
    "are one team, and the wins only make sense added together."))
era("cooper", "Cooper Car Company", [
    "cooper", "cooper-borgward", "cooper-climax", "cooper-maserati",
    "cooper-osca", "cooper-castellotti", "cooper-alfa_romeo", "cooper-ford",
    "cooper-ferrari", "cooper-ats", "cooper-brm"])
era("brabham", "Brabham", [
    "brabham", "brabham-brm", "brabham-climax", "brabham-ford",
    "brabham-repco", "brabham-alfa_romeo"])
era("mclaren", "McLaren", [
    "mclaren", "mclaren-ford", "mclaren-seren", "mclaren-brm",
    "mclaren-alfa_romeo"])
era("march", "March Engineering", ["march", "march-alfa_romeo", "march-ford"])
era("de-tomaso", "De Tomaso", [
    "tomaso", "de_tomaso-alfa_romeo", "de_tomaso-osca", "de_tomaso-ferrari"])
era("lds", "LDS", ["lds", "lds-alfa_romeo", "lds-climax"])
era("shadow", "Shadow Racing Cars", ["shadow", "shadow-ford", "shadow-matra"])
era("eagle", "Anglo American Racers", ["eagle-climax", "eagle-weslake"], note=(
    "Dan Gurney's team. Its 1967 Spa win with the Eagle-Weslake remains the "
    "only championship win by an American constructor with an American driver."))
era("matra", "Matra", ["matra", "matra-ford"], contested=1, note=(
    "THE ARGUABLE MERGE. The Matra-Ford entries of 1968-69, including Stewart's "
    "1969 title, were run by Ken Tyrrell's Matra International, not by Matra "
    "Sports. The chassis constructor is credited here because that is what the "
    "constructors' championship recognised, but the ENTRANT was the team that "
    "became Tyrrell, and a reader who wants those wins under Tyrrell is not "
    "wrong."))
era("brm", "BRM", ["brm", "brm-ford"])

# ── RULE 4: NOTES on records left as they are. ───────────────────────────────
NOTES = {
    "williams": (
        "Ergast runs this record from 1975, but Williams Grand Prix Engineering "
        "was founded in 1977 and first raced in 1978. The 1975-76 entries are "
        "Frank Williams Racing Cars, the earlier team he sold to Walter Wolf. "
        "Left together because the constructors' record treats them as one; the "
        "distinction is recorded here rather than acted on."),
    "lola": (
        "Lola built cars for several different entrants rather than running one "
        "continuous works team, so this record is a marque, not an organisation."),
    "hill": "Graham Hill's Embassy Hill team, ended by the 1975 air crash.",
    "kurtis_kraft": (
        "An Indianapolis chassis builder. Its five wins came in the Indy 500, "
        "which counted for the World Championship from 1950 to 1960."),
}
