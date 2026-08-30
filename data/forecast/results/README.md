# Filing an election result

`build_forecast.py` freezes the last pre-election forecast into
`../snapshots/<code>-<date>.json` automatically. You do not touch that.

After a race settles, add `<code>-<date>.json` HERE with the same basename, and
`score_forecasts.py --write` grades the snapshot against it.

## Rules

1. **State facts, not claims.** Seat counts and a winner's name. The scorer
   decides which probabilities and intervals get graded. That way whoever types
   the result cannot pick the questions.
2. **Final counts only.** New Zealand's specials move seats for two weeks after
   election night; Israel's surplus agreements settle late. File when the count
   is final, not when the media call it. A pending race printing
   "VOTED, RESULT NOT FILED" is the correct state in the meantime.
3. **Partial is fine.** Omit a fact and nothing derived from it is graded.
4. **`market` is the CLOSING price**, in percent, from a real market on the same
   claim (Polymarket, Betfair). Omit it rather than substituting a weaker
   benchmark: the skill number is only meaningful against a price someone could
   actually have taken.
5. **`sources`** should let a stranger check every number.

## Shapes

    us: {"houseDem": 230, "senateDem": 49, "govDem": 24,
         "senateDemControl": false,          // optional: overrides seats>=51
         "market": {"us_house": 80.0, "us_senate": 35.0, "us_gov": 30.0}}

    nz: {"seats": {"nat": 44, "act": 11, "nzf": 8,
                   "lab": 38, "grn": 14, "tpm": 6},
         "totalSeats": 121}                  // overhang changes the majority

    il: {"govBloc": 58, "seats": {"Likud": 24, "Yashar": 26}}

    br: {"firstRound": {"Lula": 38.0, "F. Bolsonaro": 37.0},
         "runoff": {"a": "Lula", "b": "F. Bolsonaro", "winner": "F. Bolsonaro"}}
        (names must match the snapshot's spelling exactly)

    fr: same shape as br.

    uk: {"seats": {"lab": 250, "con": 150, "ref": 180, ...}, "totalSeats": 650}

Every shape also takes `"note"` (one line, shown on the scoreboard) and
`"sources"` (a list of strings).

## The calendar this was built for

    2026-10-04  Brazil, first round      (runoff 25 October)
    2026-10-27  Israel, Knesset
    2026-11-03  United States, midterms
    2026-11-07  New Zealand              (final count about 20 November)
