#!/usr/bin/env python3
"""Week-by-week NFL playoff and title odds, 1920 on.

WHAT THIS IS. For every regular-season week of a season (and week 0, before a
game is played), every team's probability of reaching the playoffs and of
winning the title, written to public/data/nfl/odds/YYYY.json for the season
page's scrubbed standings (Ashwin's ask, 2026-09-10: "for any single week
that we're looking at ... every week would have a playoff percentage ... and
the probability of winning the Super Bowl").

HOW. A Monte Carlo on the rest of the season. After week N the games through
N are the ledger's real results; every later regular-season game is drawn
from the SAME Elo win probability the live engine prices games with
(scripts/build-nfl-elo.py `win_probability`: logistic on the rating gap plus
65 points to a home side, nothing to a neutral site), using each team's
rating AFTER week N from the season shard, held fixed for the rest of the
simulated season. Each simulated season is then seeded by `picture()` in
scripts/nfl/playoff_seeds.py, the literal tiebreaking procedure of the era,
so P(playoffs) is the share of simulated seasons in which the club held a
seed. The postseason is then played out from those seeds with the era's
bracket (below) and the same Elo, so P(title) is the share it won the last
game. 2,000 draws a week by default; the random stream is seeded from the
season and the week, so a rebuild is byte-identical and `git diff` shows only
real change.

🔴 SCORES ARE DRAWN ONLY BECAUSE THE TIEBREAKERS READ THEM. The procedure's
later steps (points ranking, net points) need a score per game, so a drawn
game gets a margin and a losing score from a loose normal. Those numbers
decide nothing that matters at the top of the procedure; they exist so
`picture()` never divides by an absent number. Ties are not drawn.

🔴 THE BRACKET IS THE ERA'S, NOT TODAY'S. `--verify` replays every complete
season's real wild-card results through `bracket()` and checks the divisional
pairings and hosts it produces against the ledger's actual games, 1975 on:
  1920-32   no game: the standings leader is the champion, so the two odds
            are the same number and the page shows one
  1933-69   a league's two division winners meet in the championship game
            (neutral here; hosting alternated by division); the 1967-69 NFL
            plays conference semi-finals first (Capitol v Century, Coastal v
            Central), the 1969 AFL crosses its divisions (winner hosts the
            other runner-up), the 1949 AAFC seeds one group 1v4 and 2v3;
            1946-49 and 1960-65 crown two champions, one a league; from
            1966 the two champions meet in the Super Bowl
  1970-77   four seeds; the wild card visits the 1 seed unless they share a
            division, then the 2 seed (hosts rotated by division to 1974,
            which the ratings cannot express: the higher seed hosts here)
  1978-89   five seeds; 4 hosts 5; the wild-card winner visits the 1 seed
            unless they share a division, then the 2 seed (1978: Houston, the
            AFC Central runner-up, went to New England, not Pittsburgh);
            the other two division winners meet, higher seed hosting
  1982      eight seeds by conference record, 1v8 2v7 3v6 4v5, reseeded
  1990-2019 six seeds; 3 hosts 6, 4 hosts 5; the 1 seed hosts the lower
            survivor, the 2 seed the other
  2020 on   seven seeds; 2 hosts 7, 3 hosts 6, 4 hosts 5; the 1 seed hosts
            the lowest survivor, the other two meet, higher seed hosting
  every era conference final: higher seed hosts; the title game is neutral

🔴 "OUT" AND "IN" ARE PROVED, NOT SAMPLED (Ashwin, 2026-09-10: "when a team
clinches a spot during the season, can you just indicate that ... I think you
can statistically prove if a team has clinched a spot or not"). A 0.0% from
2,000 draws is not a proof of elimination and 100% is not a clinch, so the
file also carries a status per week that is set only when the records settle
it: the club's worst finish (every game left lost) against each rival's best
(every game left won), in the era's percentage, places handed out the way the
era did (q per division, the rest of the pool's seeds as wild cards, a
division's surplus competing for them), and the threats thinned by the games
they still have to play against each other (a max-flow: two rivals meeting
cannot both win). `in` when the club cannot be pushed out of a place, `out`
when it cannot reach one. Sufficient conditions, never necessary ones: a
club the tiebreakers have already sunk shows a small number rather than a
false "out", and a clinch that rests on a tiebreaker is shown as a number.
See `proved_status()`.

GRADING. For a complete season the file carries `brier` per week: the mean
over clubs of (P(playoffs) - made it)^2, so the hub can say how sharp the
odds were at each point of the season (0.25 is a coin flip, 0 is certainty).

POSTSEASON WEEKS. The regular season is not the whole scrubber: 1994 plays
its postseason in weeks 18-21 after a 17-week regular season, and a team the
divisional round put out still showed a title percentage in Super Bowl week
until this was added (Ashwin, 2026-09-11). `load_postseason()` reads those
games from the ledger (playoff: true, an integer week, home_key/away_key
matching the shard, a "Playoff Bowl"-style third-place game dropped by
NON_BRACKET_ROUND) or, for a live season with no ledger yet, from
public/data/nfl/playoffs.json (its weeks[].week, 1 = Wild Card, offset by
reg_end_week; a full team name is matched to the shard's short name by
`full_name.endswith(key)`).

🔴 ONE WEEK AXIS, INDEX = WEEK, ALWAYS (Ashwin, 2026-09-11, from the rebuilt
1966 file: "the postseason week 16 was appended after the regular-season
index 16 [so] index = week is broken from there on"). `reg_end_week` is the
LAST regular-season week of EVERY league in a two-league era (1946-49 AAFC +
NFL, 1960-69 AFL + NFL): 1966 is NFL 15, AFL 16, so reg_end_week is 16, and
the NFL's own championship (week 16) falls AT reg_end_week while the AFL's
regular season is still finishing. `build()` runs ONE loop over `week_axis()`
(0 to the later of reg_end_week and the last postseason week played); at
w <= reg_end_week it is still the regular-season Monte Carlo
(`odds_for_week`), just fed any postseason result already played by then
(`known`, `force_postseason` applied once `known` is non-empty); at
w > reg_end_week it is `postseason_odds_for_week`, from the real seeds. A
club already knows whether it made the playoffs once the regular season it
belongs to is done, so `playoffs`/`status` still just carry the real, final
picture forward from `reg_end_week` on; `title` is what is re-simulated at
every index, `known` held fixed and only the rounds still ahead drawn from
the Elo ratings after that week (`bracket()`/`title_game()`'s `known` param).
Because the bracket cannot always reproduce an old era's real pairings
(hosting rotated by division before 1975, not by seed), a team the real
results have already eliminated can still pick up stray simulated wins, and
the real champion can fall short of 1.0; `force_postseason()` corrects this
by setting an eliminated club to exactly 0.0 and a decided champion to
exactly 1.0, then rescales the still-undecided clubs (per pool, i.e. league,
before 1966, when each crowned its own; across everyone from 1966 on, when
the Super Bowl alone decides it and the league/conference championship games
are semi-finals: see `_decided_champions()`) so the total stays 1.0. The
file's `postseason_weeks` lists every postseason week covered (which can
include weeks at or before `reg_end_week`) and `champions` the club(s) the
last played final crowned (empty until it is).

HONOURS, WEEK BY WEEK (Ashwin, 2026-09-11: "if it happened in week 12 that
they clinch a playoff spot, you then fill in the playoff square"). Every team
also carries `honours: list[list[str]]`, aligned with `playoffs`/`title`/
`status`, cumulative (once earned, a honour is present in every later week
too). The four regular-season honours (play_app, div_title, best_conf,
best_rec, NFL_HONOURS' first four in lib/nflElo.ts) are proved from the
records alone during the season with a STRICT version of `record_bounds()`
(see `honours_for_week()`; a level finish needs the tiebreakers, which this
does not attempt), then, at the last regular-season week of a complete
season, taken from the shard's final `flags` outright (the retrospective
truth, which catches a tiebroken division title the strict check cannot
prove). The three postseason honours (cf_app, champ_app, champ) come from
`postseason_honours()`: which club earns them at all is the shard's final
flags again, and each is lit at the week its qualifying real game was
actually played, so a live season mid-playoffs never shows one early.

USAGE
  python scripts/nfl/playoff_odds.py --self-test
  python scripts/nfl/playoff_odds.py --season 2024 [--write] [--sims 2000]
  python scripts/nfl/playoff_odds.py --all [--write]           # 1978 to the newest shard
  python scripts/nfl/playoff_odds.py --verify                  # bracket vs the ledger
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
from collections import defaultdict
from dataclasses import dataclass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import playoff_seeds as ps  # noqa: E402

ROOT = ps.ROOT
OUT_DIR = os.path.join(ROOT, "public", "data", "nfl", "odds")
FIRST_SEASON = 1920
HFA_ELO = 65.0
DEFAULT_SIMS = 2000

# Postseason games the ledger lists with the sides the wrong way round; the
# historical record settles each. `--verify` swaps them before comparing.
#   1989 AFC wild card: the Steelers were the visitors at the Astrodome
#   (the same game playoff_seeds.KNOWN_SHARD_SEED_ERRORS cites for the seeds).
KNOWN_LEDGER_HOST_ERRORS = {
    1989: [("Steelers", "Titans")],
}


def win_probability(elo_for: float, elo_against: float, home: int) -> float:
    """The live engine's formula (build-nfl-elo.py): `home` is 1 vs, -1 at, 0 neutral."""
    diff = elo_for - elo_against + home * HFA_ELO
    return 1.0 / (1.0 + 10.0 ** (-diff / 400.0))


@dataclass
class Fixture:
    week: int
    home: str
    away: str
    neutral: bool
    hs: int | None = None
    as_: int | None = None
    round: str = ""

    @property
    def played(self) -> bool:
        return self.hs is not None and self.as_ is not None


# --------------------------------------------------------------------------
# inputs
# --------------------------------------------------------------------------

def load_inputs(season: int):
    """(shard, teams, fixtures, reg_end). Fixtures carry every regular-season
    game, played or not; the live season's schedule comes from upcoming.json."""
    with open(os.path.join(ps.SHARD_DIR, f"{season}.json"), encoding="utf-8") as f:
        shard = json.load(f)
    teams = {t["name"]: ps.Team(t["name"], t.get("conf") or t.get("league") or "NFL",
                                t.get("div") or t.get("league") or "NFL", t.get("league") or "NFL")
             for t in shard["teams"]}
    fixtures: list[Fixture] = []
    ledger_path = os.path.join(ps.LEDGER_DIR, f"season-{season}.json")
    if os.path.exists(ledger_path):
        with open(ledger_path, encoding="utf-8") as f:
            ledger = json.load(f)
        for g in ledger["games"]:
            if g.get("playoff") or not isinstance(g.get("week"), int):
                continue
            if season < 1933 and g.get("round"):
                # the 1932 title game: a played-off tie, not a regular week
                # (playoff_seeds.load_season files it the same way)
                continue
            if g["home_key"] not in teams or g["away_key"] not in teams:
                continue
            hs = as_ = None
            if g.get("score") and g.get("result"):
                hs, as_ = (int(x) for x in g["score"].split("-"))
            fixtures.append(Fixture(g["week"], g["home_key"], g["away_key"], bool(g.get("neutral")), hs, as_))
    else:
        up = ps._upcoming_for(season)
        if up is None:
            raise SystemExit(f"{season}: no ledger and upcoming.json is not for this season")
        for g in up["schedule"]:
            if g.get("phase") != "Reg. Season" or not isinstance(g.get("week"), int):
                continue
            if g["home"] not in teams or g["away"] not in teams:
                continue
            hs = g.get("home_pts")
            as_ = g.get("away_pts")
            fixtures.append(Fixture(g["week"], g["home"], g["away"], bool(g.get("neutral")),
                                    int(hs) if hs is not None else None, int(as_) if as_ is not None else None))
    # 🔴 ONE WEEK AXIS FOR THE WHOLE SEASON. A two-league season (1946-49
    # AAFC + NFL, 1960-69 AFL + NFL) has leagues with different regular-
    # season lengths, so reg_end is the LAST week of EITHER league, not just
    # the NFL's own (the shard's reg_end_week carries one entry per league):
    # 1966 is NFL 15, AFL 16, so reg_end is 16. A postseason game (a league
    # final) can then fall at or before this reg_end while the other league
    # is still finishing its regular season; build() folds that game's real
    # result into the regular-season Monte Carlo for those overlap weeks
    # rather than treating index = week as broken past it (Ashwin,
    # 2026-09-11, from the rebuilt 1966 file: "the postseason week 16 was
    # appended after the regular-season index 16").
    reg_end_map = shard.get("reg_end_week") or {}
    reg_end = max(reg_end_map.values()) if reg_end_map else max((f.week for f in fixtures), default=0)
    return shard, teams, fixtures, reg_end


def ratings_after(shard: dict, week: int) -> dict[str, float]:
    """Each team's rating after `week` (week 0 = the preseason seed); a week the
    shard skipped (a bye, a carried week) inherits the last one before it."""
    out = {}
    for t in shard["teams"]:
        e = None
        for w in t.get("weeks", []):
            if w["w"] <= week and "e" in w:
                e = w["e"]
        if e is None:
            e = t.get("start", 1500.0)
        out[t["name"]] = float(e)
    return out


PLAYOFFS_JSON = os.path.join(ROOT, "public", "data", "nfl", "playoffs.json")

# The round label of the game that decides the season's champion outright,
# from 1966 on (before that, see `_decided_champions`: a pool's own last
# scheduled postseason game, whatever its label is called).
SUPER_BOWL_ROUND = "Super Bowl"

# Postseason games that are not part of the championship bracket at all, so
# `load_postseason` drops them before they can be mistaken for a postseason
# week that decides anything: the "Playoff Bowl" (1960-69, the two
# conference/division runners-up playing a third-place game the standings
# never counted), and its rarer synonyms in older round labels.
NON_BRACKET_ROUND = re.compile(r"playoff bowl|third|3rd|consolation|bert bell", re.I)


def load_postseason(season: int, teams: dict[str, ps.Team], reg_end: int) -> list[Fixture]:
    """Every postseason fixture (played or not), `week` continuing on from the
    regular season's own numbering (1994: 18-21). The ledger carries these
    with `playoff: true` and their own week number; a live season with no
    ledger yet (public/data/nfl/expectation/season-YYYY.json absent) falls
    back to public/data/nfl/playoffs.json instead, whose weeks[].week counts
    1 = Wild Card, offset here by `reg_end` to land in the same numbering,
    matching a full team name ("Carolina Panthers") to the shard's short one
    ("Panthers") the way the site does everywhere else: `full_name.endswith(key)`."""
    fixtures: list[Fixture] = []
    ledger_path = os.path.join(ps.LEDGER_DIR, f"season-{season}.json")
    if os.path.exists(ledger_path):
        with open(ledger_path, encoding="utf-8") as f:
            ledger = json.load(f)
        for g in ledger["games"]:
            if not g.get("playoff") or not isinstance(g.get("week"), int):
                continue
            rnd = g.get("round") or ""
            if NON_BRACKET_ROUND.search(rnd):
                # A third-place game (the "Playoff Bowl", 1960-69, e.g. 1966
                # week 17 Colts v Eagles): not part of the bracket, so it is
                # dropped here rather than becoming a postseason week, a
                # `known` result, or an `eliminated` loser.
                continue
            if g["home_key"] not in teams or g["away_key"] not in teams:
                continue
            hs = as_ = None
            if g.get("score") and g.get("result"):
                hs, as_ = (int(x) for x in g["score"].split("-"))
            fixtures.append(Fixture(g["week"], g["home_key"], g["away_key"], bool(g.get("neutral")),
                                    hs, as_, rnd))
        return fixtures
    if not os.path.exists(PLAYOFFS_JSON):
        return fixtures
    with open(PLAYOFFS_JSON, encoding="utf-8") as f:
        pf = json.load(f)
    if (pf.get("meta") or {}).get("season") != season:
        return fixtures
    def match(full_name: str | None) -> str | None:
        if not full_name:
            return None
        for key in teams:
            if full_name.endswith(key):
                return key
        return None
    pf_weeks = pf.get("weeks") or []
    last_pf_week = max((w.get("week", 0) for w in pf_weeks), default=0)
    for wk in pf_weeks:
        week = reg_end + wk.get("week", 0)
        # playoffs.json carries no round label; the only one this function
        # needs to recognise is the final, which in the live (Super Bowl)
        # era is simply the last week of the postseason.
        is_final = wk.get("week") == last_pf_week
        for g in wk.get("games", []):
            home = match((g.get("home") or {}).get("name"))
            away = match((g.get("away") or {}).get("name"))
            if home is None or away is None:
                continue
            completed = bool(g.get("completed"))
            hs = (g.get("home") or {}).get("score") if completed else None
            as_ = (g.get("away") or {}).get("score") if completed else None
            fixtures.append(Fixture(week, home, away, bool(g.get("neutral")),
                                    int(hs) if hs is not None else None,
                                    int(as_) if as_ is not None else None,
                                    "Super Bowl" if is_final else ""))
    return fixtures


def _decided_champions(post: list[Fixture], through: int, season: int, pools: dict[str, str]) -> list[str]:
    """The winner(s) of the season's final(s), played by `through`.

    From 1966 the Super Bowl decides the champion alone: the league
    (from 1970, conference) championship games are semi-finals, whatever the
    ledger calls them, so only the round labelled SUPER_BOWL_ROUND counts (a
    season has at most one; this asserts it does, since a second would mean
    the round label stopped meaning what this function assumes it means).

    Before 1966 a pool IS a league, and each crowns its own champion in the
    winner of THAT POOL'S OWN last scheduled postseason game, whatever its
    week is (1946 week 13 for one league, 16 for the other: they need not be
    the same week, and the earlier one is a champion the moment it is played,
    not when the later league's final catches up to it)."""
    if season >= 1966:
        finals = [f for f in post if f.round == SUPER_BOWL_ROUND]
        assert len(finals) <= 1, f"season {season}: expected at most one {SUPER_BOWL_ROUND} fixture, got {finals}"
        if not finals or finals[0].week > through or not finals[0].played:
            return []
        f = finals[0]
        return [f.home if f.hs > f.as_ else f.away]
    by_pool: dict[str, list[Fixture]] = defaultdict(list)
    for f in post:
        pool = pools.get(f.home) or pools.get(f.away)
        if pool is not None:
            by_pool[pool].append(f)
    champions: list[str] = []
    for fx in by_pool.values():
        final_week = max(g.week for g in fx)
        finals = [g for g in fx if g.week == final_week]
        if len(finals) != 1:
            continue   # defensive: an ambiguous "last week" proves nothing
        g = finals[0]
        if g.week <= through and g.played:
            champions.append(g.home if g.hs > g.as_ else g.away)
    return champions


def _known_and_eliminated(post: list[Fixture], through: int) -> tuple[dict[frozenset, str], set[str]]:
    """(`known`, `eliminated`) from every postseason game played by `through`:
    `known` maps the unordered pair to its real winner (fed to `bracket()`
    and `title_game()`), `eliminated` is every real loser so far. Shared by
    the regular-season weeks that overlap a postseason game (a two-league
    era) and by `postseason_odds_for_week`."""
    played = [f for f in post if f.week <= through and f.played]
    known = {frozenset((f.home, f.away)): (f.home if f.hs > f.as_ else f.away) for f in played}
    eliminated = {(f.away if f.hs > f.as_ else f.home) for f in played}
    return known, eliminated


def week_axis(reg_end: int, post_weeks_played: list[int]) -> list[int]:
    """The whole season's week axis, index = week, always: 0 up to the LAST
    week covered, regular season or postseason, whichever runs later. A
    two-league era can have a postseason week at or before `reg_end` (one
    league's final while the other's regular season is still running); that
    does not extend the axis, since `reg_end` already covers it. A pure
    function so the axis logic can be checked without a shard."""
    last_week = max([reg_end, *post_weeks_played]) if post_weeks_played else reg_end
    return list(range(0, last_week + 1))


# --------------------------------------------------------------------------
# drawing a season
# --------------------------------------------------------------------------

def draw_game(rng: random.Random, fx: Fixture, elo: dict[str, float]) -> ps.Game:
    """One drawn result: the winner by the Elo probability, the score loose."""
    home = 0 if fx.neutral else 1
    p = win_probability(elo[fx.home], elo[fx.away], home)
    home_wins = rng.random() < p
    edge = abs(elo[fx.home] - elo[fx.away] + home * HFA_ELO)
    margin = max(1, int(round(abs(rng.gauss(3.0 + edge / 25.0, 9.0)))))
    lose = max(0, int(round(rng.gauss(17.0, 8.0))))
    win = lose + margin
    return ps.Game(fx.week, fx.home, fx.away, win if home_wins else lose, lose if home_wins else win)


def played_games(fixtures: list[Fixture], through: int) -> list[ps.Game]:
    return [ps.Game(f.week, f.home, f.away, f.hs, f.as_) for f in fixtures if f.week <= through and f.played]


# --------------------------------------------------------------------------
# the postseason
# --------------------------------------------------------------------------

def _play(rng: random.Random, elo: dict[str, float], home: str, away: str, neutral: bool = False) -> str:
    p = win_probability(elo[home], elo[away], 0 if neutral else 1)
    return home if rng.random() < p else away


def bracket(season: int, seeds: list[str], divs: dict[str, str], wc_winners: dict[tuple[str, str], str] | None = None,
            rng: random.Random | None = None, elo: dict[str, float] | None = None, confs: dict[str, str] | None = None,
            known: dict[frozenset, str] | None = None):
    """One conference's bracket from its seeds (index 0 is the 1 seed).

    Returns (games, champion): `games` is the list of (round, home, away) it
    produced, `champion` the conference champion. With `wc_winners` given
    ({(home, away): winner}) the wild-card round is replayed from real
    results and the later rounds are not played (for --verify); otherwise
    every game is drawn from `elo`. With `known` given ({frozenset({home,
    away}): winner}, the postseason odds' real results so far) a game whose
    pair is in it returns that real winner directly, WITHOUT drawing an rng
    number, so a regular-season call (where `known` is always None) consumes
    the rng in exactly the sequence it always has."""
    games: list[tuple[str, str, str]] = []

    def play(rnd, home, away, neutral=False):
        games.append((rnd, home, away))
        if known is not None:
            w = known.get(frozenset((home, away)))
            if w is not None:
                return w
        if wc_winners is not None:
            if rnd != "WC":
                return None
            return wc_winners.get((home, away)) or wc_winners.get((away, home))
        return _play(rng, elo, home, away, neutral)

    n = len(seeds)
    seed_of = {t: i + 1 for i, t in enumerate(seeds)}
    if n <= 1:
        # 1920-32: the standings leader is the champion; no game.
        return games, (seeds[0] if seeds else None)
    if season < 1970:
        # Before the merger a pool is a league: two division winners met in
        # the championship game (neutral here; the hosting alternated by
        # division, which no seed can express), except the 1967-69 NFL, whose
        # four division winners first met inside their conference (Capitol
        # v Century, Coastal v Central), the 1969 AFL, where each division
        # winner hosted the other division's runner-up, and the 1949 AAFC,
        # one group of seven with the top four playing 1v4 and 2v3.
        if n == 2:
            return games, play("FINAL", seeds[0], seeds[1], True)
        if divs is not None and confs is not None and len({confs[t] for t in seeds}) == 2 and len({divs[t] for t in seeds}) == 4:
            pairs = {}
            for t in seeds:
                pairs.setdefault(confs[t], []).append(t)
            semis = [play("SEMI", p[0], p[1]) for p in pairs.values()]
        elif divs is not None and len({divs[t] for t in seeds}) == 2:
            by_div = {}
            for t in seeds:
                by_div.setdefault(divs[t], []).append(t)
            (d1, d2) = sorted(by_div)
            semis = [play("SEMI", by_div[d1][0], by_div[d2][1]), play("SEMI", by_div[d2][0], by_div[d1][1])]
        else:
            semis = [play("SEMI", seeds[0], seeds[n - 1]), play("SEMI", seeds[1], seeds[n - 2])]
        if None in semis:
            return games, None
        hi, lo = (semis[0], semis[1]) if seed_of[semis[0]] < seed_of[semis[1]] else (semis[1], semis[0])
        return games, play("FINAL", hi, lo, True)
    if season < 1978:
        # Four per conference, 1970-77: the wild card visits the 1 seed unless
        # they share a division, then the 2 seed; the other two winners meet.
        # 1970-74 hosts rotated by division rather than by seed; the higher
        # seed hosts here, which is the only thing the ratings can express.
        s1, s2, s3, wc = seeds[0], seeds[1], seeds[2], seeds[3]
        if divs[wc] == divs[s1]:
            a = play("DIV", s2, wc)
            b = play("DIV", s1, s3)
        else:
            a = play("DIV", s1, wc)
            b = play("DIV", s2, s3)
        if a is None or b is None:
            return games, None
        hi, lo = (a, b) if seed_of[a] < seed_of[b] else (b, a)
        return games, play("CONF", hi, lo)
    if season == 1982:
        # a 16-team tournament: 1v8, 2v7, 3v6, 4v5, then reseeded
        alive = [play("WC", seeds[i], seeds[n - 1 - i]) for i in range(n // 2)]
        while len(alive) > 1 and None not in alive:
            alive.sort(key=lambda t: seed_of[t])
            nxt = []
            for i in range(len(alive) // 2):
                nxt.append(play("DIV" if len(alive) == 4 else "CONF", alive[i], alive[len(alive) - 1 - i]))
            alive = nxt
        return games, (alive[0] if alive and alive[0] else None)

    if season < 1990:
        # five seeds: the two wild cards meet, the winner visits the 1 seed
        # unless they share a division, then the 2 seed
        wc = play("WC", seeds[3], seeds[4])
        if wc is None:
            return games, None
        s1, s2, s3 = seeds[0], seeds[1], seeds[2]
        if divs[wc] == divs[s1]:
            a = play("DIV", s2, wc)
            b = play("DIV", s1, s3)
        else:
            a = play("DIV", s1, wc)
            b = play("DIV", s2, s3)
    elif season < 2020:
        w1 = play("WC", seeds[2], seeds[5])
        w2 = play("WC", seeds[3], seeds[4])
        if w1 is None or w2 is None:
            return games, None
        lo, hi = sorted([w1, w2], key=lambda t: -seed_of[t])[0], sorted([w1, w2], key=lambda t: seed_of[t])[0]
        a = play("DIV", seeds[0], lo)
        b = play("DIV", seeds[1], hi)
    else:
        w1 = play("WC", seeds[1], seeds[6])
        w2 = play("WC", seeds[2], seeds[5])
        w3 = play("WC", seeds[3], seeds[4])
        if None in (w1, w2, w3):
            return games, None
        rest = sorted([w1, w2, w3], key=lambda t: seed_of[t])
        a = play("DIV", seeds[0], rest[-1])
        b = play("DIV", rest[0], rest[1])
    if a is None or b is None:
        return games, None
    hi, lo = (a, b) if seed_of[a] < seed_of[b] else (b, a)
    champ = play("CONF", hi, lo)
    return games, champ


def title_game(rng: random.Random, elo: dict[str, float], champs: list[str], season: int,
               known: dict[frozenset, str] | None = None) -> list[str]:
    """The champions of the season: one per league before 1966 (the AAFC and
    the AFL crowned their own), the Super Bowl winner from 1966 (the NFL and
    AFL champions met from the 1966 season; the conference champions from
    1970), drawn on a neutral field. With `known` given and the two champions'
    pair in it, the real result is returned instead of a draw (see `bracket`)."""
    champs = [c for c in champs if c]
    if season >= 1966 and len(champs) == 2:
        if known is not None:
            w = known.get(frozenset((champs[0], champs[1])))
            if w is not None:
                return [w]
        return [_play(rng, elo, champs[0], champs[1], neutral=True)]
    return champs


# --------------------------------------------------------------------------
# proved status
# --------------------------------------------------------------------------

def _pct(w: float, l: float, t: float, half: bool) -> float:
    if half:
        n = w + l + t
        return (w + 0.5 * t) / n if n else 0.0
    n = w + l
    return w / n if n else 0.0


def _can_all_reach(need: dict[str, int], among: dict[tuple[str, str], int], left: dict[str, int]) -> bool:
    """Can every club in `need` win at least need[c] of its remaining games at
    once, when `among` counts the remaining games between pairs of them and
    `left` each club's games left? A game against anyone outside the set is
    assumed won, so a club's need is what is left after those; the rest is a
    max-flow: source -> club (its remaining need) -> the games it is in ->
    sink (the games' capacity). Feasible when the flow meets every need."""
    games = [(a, b, g) for (a, b), g in among.items() if g > 0 and (a in need and b in need)]
    inside = defaultdict(int)
    for a, b, g in games:
        inside[a] += g
        inside[b] += g
    need = {c: max(0, k - (left[c] - inside[c])) for c, k in need.items()}
    clubs = [c for c, k in need.items() if k > 0]
    if not clubs:
        return True
    # capacities: S=0, clubs 1..n, games n+1..n+m, T=n+m+1
    n, m = len(clubs), len(games)
    idx = {c: i + 1 for i, c in enumerate(clubs)}
    T = n + m + 1
    cap: dict[tuple[int, int], int] = {}
    def add(u, v, c):
        cap[(u, v)] = cap.get((u, v), 0) + c
        cap.setdefault((v, u), 0)
    for c in clubs:
        add(0, idx[c], need[c])
    for j, (a, b, g) in enumerate(games):
        gn = n + 1 + j
        if a in idx:
            add(idx[a], gn, g)
        if b in idx:
            add(idx[b], gn, g)
        add(gn, T, g)
    adj: dict[int, list[int]] = defaultdict(list)
    for (u, v) in cap:
        adj[u].append(v)
    flow = 0
    while True:
        parent = {0: -1}
        queue = [0]
        while queue and T not in parent:
            u = queue.pop(0)
            for v in adj[u]:
                if v not in parent and cap[(u, v)] > 0:
                    parent[v] = u
                    queue.append(v)
        if T not in parent:
            break
        f = float("inf")
        v = T
        while v != 0:
            u = parent[v]
            f = min(f, cap[(u, v)])
            v = u
        v = T
        while v != 0:
            u = parent[v]
            cap[(u, v)] -= f
            cap[(v, u)] += f
            v = u
        flow += f
    return flow >= sum(need[c] for c in clubs)


def _max_reaching(cands: list[str], need: dict[str, int], among: dict[tuple[str, str], int], left: dict[str, int],
                  cap_n: int = 12) -> int:
    """The largest number of `cands` that can all reach their need at once; the
    plain count when there are too many to enumerate (a bound stays a bound)."""
    if len(cands) > cap_n:
        return len(cands)
    from itertools import combinations
    for k in range(len(cands), 0, -1):
        for sub in combinations(cands, k):
            if _can_all_reach({c: need[c] for c in sub}, among, left):
                return k
    return 0


def record_bounds(teams: dict[str, ps.Team], games: list[ps.Game], fixtures: list[Fixture], through: int,
                  season: int) -> tuple[dict[str, float], dict[str, float]]:
    """(worst, best) per club: worst is the record after losing every game
    still to play, best after winning every one, in the era's percentage
    (ties half a win from 1972, excluded before). Shared by `proved_status`
    (its threat/certain thresholds) and `honours_for_week` (its div_title /
    best_conf / best_rec cutoffs), so the two cannot drift apart."""
    half = ps.ties_half(season)
    rec: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    for g in games:
        for side in (g.home, g.away):
            if side in teams:
                r = g.result_for(side)
                rec[side][0 if r == 1.0 else 1 if r == 0.0 else 2] += 1
    left: dict[str, int] = defaultdict(int)
    for f in fixtures:
        if f.week > through or not f.played:
            left[f.home] += 1
            left[f.away] += 1
    worst = {n: _pct(rec[n][0], rec[n][1] + left[n], rec[n][2], half) for n in teams}
    best = {n: _pct(rec[n][0] + left[n], rec[n][1], rec[n][2], half) for n in teams}
    return worst, best


def proved_status(teams: dict[str, ps.Team], games: list[ps.Game], fixtures: list[Fixture], through: int,
                  season: int) -> dict[str, str | None]:
    """'in' / 'out' / None per club from the records alone (see the module note).

    A club's worst finish is its record after losing every game left; a
    rival's best is after winning every game left; the percentage is the
    era's (ties half a win from 1972, excluded before). A rival is a THREAT
    when its best is at least the club's worst, CERTAIN when its worst beats
    the club's best. Places are counted the way the era hands them out: q
    per division (one, or two in the 1969 AFL) and the rest of the pool's
    seeds as wild cards; a division rival above the club takes a division
    place, and only the surplus of a division competes for a wild card.
    Threats are then thinned by what the schedule allows: rivals still to
    play each other cannot all win those games (a max-flow over the games
    among them), which is what turns a 12-2 club into a proved place in
    December rather than in January."""
    half = ps.ties_half(season)
    rec: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    for g in games:
        for side in (g.home, g.away):
            if side in teams:
                r = g.result_for(side)
                rec[side][0 if r == 1.0 else 1 if r == 0.0 else 2] += 1
    left: dict[str, int] = defaultdict(int)
    among: dict[tuple[str, str], int] = defaultdict(int)
    for f in fixtures:
        if f.week > through or not f.played:
            left[f.home] += 1
            left[f.away] += 1
            a, b = sorted((f.home, f.away))
            among[(a, b)] += 1
    worst, best = record_bounds(teams, games, fixtures, through, season)
    def need_for(n: str, target: float) -> int:
        """Wins from the games left that lift `n` to at least `target`; left+1 when none does."""
        for k in range(0, left[n] + 1):
            if _pct(rec[n][0] + k, rec[n][1] + left[n] - k, rec[n][2], half) >= target - 1e-9:
                return k
        return left[n] + 1
    out: dict[str, str | None] = {}
    for pool in {t.pool(season) for t in teams.values()}:
        members = [n for n, t in teams.items() if t.pool(season) == pool]
        divs = sorted({teams[n].div for n in members})
        q, nseeds = ps.pool_format(season, teams[members[0]].league, len(divs))
        grouped = len(divs) > 1 and season != 1982
        wild = nseeds - q * len(divs) if grouped else nseeds
        for n in members:
            others = [m for m in members if m != n]
            threats = [m for m in others if best[m] >= worst[n] - 1e-9]
            certain = [m for m in others if worst[m] > best[n] + 1e-9]
            need = {m: need_for(m, worst[n]) for m in threats}
            status = None
            if grouped:
                own = teams[n].div
                by_div: dict[str, list[str]] = defaultdict(list)
                for m in threats:
                    by_div[teams[m].div].append(m)
                # a division place: fewer than q rivals can still reach the club
                rivals_reaching = _max_reaching(by_div.get(own, []), need, among, left) if half else len(by_div.get(own, []))
                if rivals_reaching < q:
                    status = "in"
                elif wild > 0:
                    competitors = 0
                    for d, ms in by_div.items():
                        k = _max_reaching(ms, need, among, left) if half else len(ms)
                        competitors += max(0, k - q)
                    if competitors < wild:
                        status = "in"
                if status is None:
                    cert_div: dict[str, list[str]] = defaultdict(list)
                    for m in certain:
                        cert_div[teams[m].div].append(m)
                    if len(cert_div.get(own, [])) >= q:
                        surplus = sum(max(0, len(ms) - q) for ms in cert_div.values())
                        if wild <= 0 or surplus >= wild:
                            status = "out"
            else:
                reaching = _max_reaching(threats, need, among, left) if half else len(threats)
                if reaching < nseeds:
                    status = "in"
                elif len(certain) >= nseeds:
                    status = "out"
            out[n] = status
    return out


# The four honours a club can earn purely from the arithmetic of records
# during the regular season, in the order NFL_HONOURS (lib/nflElo.ts) lists
# them. `cf_app`, `champ_app`, `champ` are postseason honours (see the
# module's POSTSEASON WEEKS note); they are added in `build()` from the
# shard's final flags and the real postseason fixtures, never here.
REGULAR_SEASON_HONOURS = ("play_app", "div_title", "best_conf", "best_rec")
HONOUR_ORDER = ("play_app", "div_title", "best_conf", "best_rec", "cf_app", "champ_app", "champ")


def honours_for_week(teams: dict[str, ps.Team], games: list[ps.Game], fixtures: list[Fixture], through: int,
                     season: int, status: dict[str, str | None]) -> dict[str, set[str]]:
    """This week's OWN earned honours (a subset of REGULAR_SEASON_HONOURS; the
    caller unions them across weeks, since once earned a club keeps a honour).
    `play_app` follows `proved_status`'s "in" directly. The other three
    compare `record_bounds()`'s worst/best STRICTLY (a level finish needs the
    tiebreakers, which this does not attempt to prove): `div_title` when the
    club's worst beats every division rival's best (only in an era with more
    than one division in the pool, excluding the 1982 conference-record
    tournament, which had none); `best_conf` against every other club in the
    same pool (the conference from 1970, the league before); `best_rec`
    against every other club in the same league. Week 0 always comes back
    empty: with nothing played, everyone's worst is 0 and everyone's best is
    1, so no strict comparison can pass."""
    worst, best = record_bounds(teams, games, fixtures, through, season)
    out: dict[str, set[str]] = {n: set() for n in teams}
    for n in teams:
        if status.get(n) == "in":
            out[n].add("play_app")
        conf_rivals = [m for m in teams if m != n and teams[m].pool(season) == teams[n].pool(season)]
        if worst[n] > max((best[m] for m in conf_rivals), default=-1.0) + 1e-9:
            out[n].add("best_conf")
        league_rivals = [m for m in teams if m != n and teams[m].league == teams[n].league]
        if worst[n] > max((best[m] for m in league_rivals), default=-1.0) + 1e-9:
            out[n].add("best_rec")
    for pool in {t.pool(season) for t in teams.values()}:
        members = [n for n, t in teams.items() if t.pool(season) == pool]
        divs = sorted({teams[n].div for n in members})
        if not (len(divs) > 1 and season != 1982):
            continue
        for n in members:
            div_rivals = [m for m in members if m != n and teams[m].div == teams[n].div]
            if worst[n] > max((best[m] for m in div_rivals), default=-1.0) + 1e-9:
                out[n].add("div_title")
    return out


def _last_played_before(post: list[Fixture], team: str, before: int | None) -> int | None:
    """The latest week strictly before `before` in which `team` played a
    (played) postseason game; None if it played none."""
    if before is None:
        return None
    ws = [f.week for f in post if f.played and f.week < before and team in (f.home, f.away)]
    return max(ws) if ws else None


def _played_at(post: list[Fixture], team: str, week: int | None) -> bool:
    return week is not None and any(f.week == week and f.played and team in (f.home, f.away) for f in post)


def postseason_honours(post: list[Fixture], shard_flags: dict[str, set[str]],
                       reg_end: int) -> dict[str, dict[str, int]]:
    """{team: {honour: week it is first true}} for cf_app, champ_app and champ,
    from the shard's final flags (which teams earn them at all, retrospective
    over the whole postseason) and the real postseason fixtures (when: only
    once the qualifying game is actually played, so a live season mid-
    playoffs never shows one early). `final_week` is the title game(s)'
    week (post's last); `champ_app` is lit at the week of the team's last
    played game before it (the win that put it in the final), or `reg_end`
    for a direct entrant with none (1933-69 could send a division winner
    straight to the league final). `cf_app` is the same one round earlier
    (before `final_week - 1`, the conference final's own week); if the shard
    says a club has it but it never actually played in that week (a data
    oddity), it is lit at `reg_end` rather than left unlit. `champ` is lit
    at `final_week` itself, and only once that week's game is confirmed
    played."""
    final_week = max((f.week for f in post), default=None)
    cf_week = final_week - 1 if final_week is not None else None
    out: dict[str, dict[str, int]] = defaultdict(dict)
    for n, flags in shard_flags.items():
        if "champ_app" in flags and final_week is not None:
            wk = _last_played_before(post, n, final_week)
            out[n]["champ_app"] = wk if wk is not None else reg_end
        if "cf_app" in flags and cf_week is not None:
            if not _played_at(post, n, cf_week):
                out[n]["cf_app"] = reg_end
            else:
                wk = _last_played_before(post, n, cf_week)
                out[n]["cf_app"] = wk if wk is not None else reg_end
        if "champ" in flags and final_week is not None and _played_at(post, n, final_week):
            out[n]["champ"] = final_week
    return out


# --------------------------------------------------------------------------
# one season
# --------------------------------------------------------------------------

def seed_lists(pic: dict, teams: dict[str, ps.Team], season: int, rng: random.Random,
               elo: dict[str, float]) -> dict[str, list[str]]:
    """Per-pool ordered seed lists (index 0 is the 1 seed) from one `picture()`
    result. Before 1970 a division title level on the record was played off
    (and in 1932 the league title itself), and `picture()` gives every club
    in the tie the leader's seed; that game is played off here (one game,
    the first-listed club at home) so the bracket gets one club per seed.
    Shared by `odds_for_week` (a simulated `pic`) and `postseason_odds_for_week`
    (the one real, final `pic`); the rng draws happen in the same order
    either way, so refactoring this out of `odds_for_week` changed nothing
    about the regular-season numbers."""
    by_pool: dict[str, list[str]] = defaultdict(list)
    for n, v in pic.items():
        if v.get("seed"):
            by_pool[teams[n].pool(season)].append(n)
    out: dict[str, list[str]] = {}
    for pool, names in by_pool.items():
        by_seed: dict[int, list[str]] = defaultdict(list)
        for t in sorted(names, key=lambda t: pic[t]["seed"]):
            by_seed[pic[t]["seed"]].append(t)
        seeds = []
        for sv in sorted(by_seed):
            group = by_seed[sv]
            while len(group) > 1:
                group = [_play(rng, elo, group[0], group[1])] + group[2:]
            seeds.append(group[0])
        out[pool] = seeds
    return out


def odds_for_week(season: int, teams: dict[str, ps.Team], fixtures: list[Fixture], shard: dict, through: int,
                  sims: int, known: dict[frozenset, str] | None = None) -> tuple[dict[str, float], dict[str, float]]:
    """`known` is only ever non-empty in a two-league era, for a regular-
    season week that a postseason game (another league's final, played while
    this one's regular season is still running) overlaps: fed straight into
    `bracket()`/`title_game()` so that already-played final is held fixed
    rather than drawn, exactly as a postseason week's own `known` is. It
    defaults to None, so a plain call (every era outside that overlap) draws
    the whole bracket exactly as before and consumes the rng identically."""
    rng = random.Random(season * 1000 + through)
    elo = ratings_after(shard, through)
    known_games = played_games(fixtures, through)
    todo = [f for f in fixtures if f.week > through or not f.played]
    divs = {n: t.div for n, t in teams.items()}
    confs = {n: t.conf for n, t in teams.items()}
    made: dict[str, int] = defaultdict(int)
    won: dict[str, int] = defaultdict(int)
    for _ in range(sims):
        games = known_games + [draw_game(rng, f, elo) for f in todo]
        pic = ps.picture(teams, games, season, [])
        for n, v in pic.items():
            if v.get("seed"):
                made[n] += 1          # a club in a played-off tie reached the playoff too
        by_pool = seed_lists(pic, teams, season, rng, elo)
        champs = []
        for pool, seeds in by_pool.items():
            _g, c = bracket(season, seeds, divs, None, rng, elo, confs, known=known)
            champs.append(c)
        for w in title_game(rng, elo, champs, season, known=known):
            won[w] += 1
    return ({n: made[n] / sims for n in teams}, {n: won[n] / sims for n in teams})


def force_postseason(won: dict[str, float], eliminated: set[str], champions: list[str],
                     pools: dict[str, str], season: int) -> dict[str, float]:
    """Turn one postseason week's simulated title shares into the invariants
    the real bracket guarantees: a club the real results have eliminated is
    out (0.0), a club a real final has crowned is in (1.0). The bracket
    cannot always reproduce an old era's real pairings (hosting rotated by
    division before 1975, not by seed), so a proven-eliminated club can pick
    up stray simulated wins in a mismatched sim, and a proven champion can
    fall short of 1.0 the same way; zeroing and forcing those directly can
    then leave the still-undecided clubs short of the mass they are entitled
    to (1.0 in total, per pool before 1966 when two champions were crowned,
    across every club together from 1966 on, since only one club can hold
    that mass at a time), so what is left over after the forced clubs is
    rescaled back onto them, in proportion to their simulated share. Once a
    pool's champion is forced to 1.0 the undecided clubs in that pool rescale
    to exactly 0.0 (nothing is left to give them): the runner-up in that
    pool's final is always already in `eliminated` by then, so this only
    ever touches a club the bracket got wrong."""
    out = dict(won)
    for n in eliminated:
        out[n] = 0.0
    for c in champions:
        out[c] = 1.0
    champ_set = set(champions)
    if season >= 1966:
        groups = [list(out)]
    else:
        by_pool: dict[str, list[str]] = defaultdict(list)
        for n in out:
            by_pool[pools[n]].append(n)
        groups = list(by_pool.values())
    for members in groups:
        target = 0.0 if any(c in champ_set for c in members) else 1.0
        alive = [n for n in members if n not in eliminated and n not in champ_set]
        mass = sum(out[n] for n in alive)
        if alive and mass > 0:
            scale = target / mass
            for n in alive:
                out[n] *= scale
    return out


def postseason_odds_for_week(season: int, teams: dict[str, ps.Team], fixtures: list[Fixture],
                             post: list[Fixture], shard: dict, reg_end: int, through: int, sims: int,
                             final: dict) -> dict[str, float]:
    """Title odds for one postseason week (`through` > reg_end). `final` is the
    real, completed regular season's `picture()` (computed once by the
    caller, not per sim: the real seeds do not change). Every real postseason
    result through `through` is held to its actual winner (`known`, fed to
    `bracket()`/`title_game()`), so a simulated bracket replays what actually
    happened and only draws the rounds still ahead, from the Elo ratings
    after `through`. `force_postseason()` then corrects the raw shares for
    what the real bracket cannot always express (see its docstring)."""
    elo = ratings_after(shard, through)
    rng = random.Random(season * 1000 + through)
    divs = {n: t.div for n, t in teams.items()}
    confs = {n: t.conf for n, t in teams.items()}
    pools = {n: teams[n].pool(season) for n in teams}
    known, eliminated = _known_and_eliminated(post, through)
    champions = _decided_champions(post, through, season, pools)
    won: dict[str, int] = defaultdict(int)
    for _ in range(sims):
        by_pool = seed_lists(final, teams, season, rng, elo)
        champs = []
        for pool, seeds in by_pool.items():
            _g, c = bracket(season, seeds, divs, None, rng, elo, confs, known=known)
            champs.append(c)
        for w in title_game(rng, elo, champs, season, known=known):
            won[w] += 1
    won_pct = {n: won[n] / sims for n in teams}
    return force_postseason(won_pct, eliminated, champions, pools, season)


def build(season: int, sims: int = DEFAULT_SIMS, quiet: bool = False) -> dict:
    if season < FIRST_SEASON:
        raise SystemExit(f"{season}: odds are built from {FIRST_SEASON} on")
    shard, teams, fixtures, reg_end = load_inputs(season)
    if not teams or not fixtures:
        raise SystemExit(f"{season}: no teams or no fixtures")
    played_through = max((f.week for f in fixtures if f.played), default=0)
    last_reg = played_through if shard.get("complete") else min(reg_end, played_through)
    if shard.get("complete"):
        reg_end = last_reg
    pools = {n: teams[n].pool(season) for n in teams}   # team -> pool, for force_postseason/_decided_champions

    # Every postseason fixture (played or not; the ledger's own week, which
    # can be <= reg_end in a two-league era: see load_inputs' ONE WEEK AXIS
    # note), and which of its weeks are covered: every game played for a
    # complete season, at least one game played for a live one still mid-week.
    post = load_postseason(season, teams, reg_end)
    postseason_weeks: list[int] = []
    if post:
        if shard.get("complete"):
            by_week: dict[int, list[Fixture]] = defaultdict(list)
            for f in post:
                by_week[f.week].append(f)
            postseason_weeks = sorted(w for w, gs in by_week.items() if all(g.played for g in gs))
        else:
            postseason_weeks = sorted({f.week for f in post if f.played})

    # ONE index axis for the whole season, index = week, always: a two-
    # league postseason week at or before reg_end does not add an index (it
    # is folded into that regular-season week instead, below); only a week
    # past reg_end extends the axis.
    weeks = week_axis(last_reg, postseason_weeks)
    last_week = weeks[-1]

    complete = last_reg >= reg_end and bool(shard.get("complete"))
    final = None
    made: dict[str, float] = {}
    if complete or postseason_weeks:
        # The real seeds for the whole postseason: the completed regular
        # season's picture(), computed once (not per sim, not per week).
        final = ps.picture(teams, played_games(fixtures, last_reg), season, [])
        made = {n: 1.0 if final[n].get("seed") else 0.0 for n in teams}

    # Every honour a club has picked up SO FAR (cumulative: once earned, a
    # honour never disappears from a later week's list); `shard_flags` is the
    # retrospective truth used both to settle the four regular-season honours
    # at the last regular-season week and to drive the three postseason ones.
    shard_flags: dict[str, set[str]] = {t["name"]: {k for k, v in (t.get("flags") or {}).items() if v}
                                        for t in shard["teams"]}
    post_honours = postseason_honours(post, shard_flags, reg_end) if postseason_weeks else {}

    playoffs: dict[str, list[float]] = {n: [] for n in teams}
    title: dict[str, list[float]] = {n: [] for n in teams}
    status: dict[str, list[str | None]] = {n: [] for n in teams}
    honours_running: dict[str, set[str]] = {n: set() for n in teams}
    honours: dict[str, list[list[str]]] = {n: [] for n in teams}

    for w in weeks:
        # A postseason result already played by week w, whether w is still a
        # regular-season index (a two-league overlap) or a postseason one.
        known, eliminated = _known_and_eliminated(post, w)
        champs_w = _decided_champions(post, w, season, pools)
        if w <= reg_end:
            p, t = odds_for_week(season, teams, fixtures, shard, w, sims, known=known or None)
            if known:
                # A league final already played while another league's
                # regular season runs on: hold it fixed rather than let the
                # bracket's imperfect reproduction of an old era's real
                # pairings (see force_postseason's docstring) leave its loser
                # with stray simulated mass.
                t = force_postseason(t, eliminated, champs_w, pools, season)
            st = proved_status(teams, played_games(fixtures, w), fixtures, w, season)
            if w == reg_end and shard.get("complete"):
                # The regular season is over: play_app/div_title/best_conf/
                # best_rec are settled facts by then, not a bound the strict
                # records-alone check can miss (a division title level on the
                # record and decided by a tiebreaker, say).
                wk_honours = {n: shard_flags.get(n, set()) & set(REGULAR_SEASON_HONOURS) for n in teams}
            else:
                wk_honours = honours_for_week(teams, played_games(fixtures, w), fixtures, w, season, st)
            for n in teams:
                playoffs[n].append(round(p[n], 3))
                title[n].append(round(t[n], 3))
                status[n].append(st[n])
                honours_running[n] |= wk_honours[n]
                for h, lit_wk in post_honours.get(n, {}).items():
                    if lit_wk <= w:
                        honours_running[n].add(h)
                honours[n].append([h for h in HONOUR_ORDER if h in honours_running[n]])
            top, top_p = max(t.items(), key=lambda kv: kv[1])
            label = "week"
        else:
            wt = postseason_odds_for_week(season, teams, fixtures, post, shard, reg_end, w, sims, final)
            for n in teams:
                playoffs[n].append(made[n])
                title[n].append(round(wt[n], 3))
                status[n].append("in" if made[n] else "out")
                for h, lit_wk in post_honours.get(n, {}).items():
                    if lit_wk <= w:
                        honours_running[n].add(h)
                honours[n].append([h for h in HONOUR_ORDER if h in honours_running[n]])
            top, top_p = max(wt.items(), key=lambda kv: kv[1])
            label = "postseason week"
        if not quiet:
            print(f"  {season} {label} {w:>2}: {top} {top_p:.1%} for the title", file=sys.stderr)

    if complete:
        # After the last regular-season week nothing is drawn: the seeds are
        # the procedure's, so playoffs and status are a fact at THAT index,
        # not a bound. A club level for a played-off title (before 1970) is
        # in: the playoff it went on to play IS the playoff. (A postseason
        # index past reg_end already carries `made` forward as playoffs, so
        # this only ever touches the regular-season index.)
        for n in teams:
            playoffs[n][reg_end] = made[n]
            status[n][reg_end] = "in" if made[n] else "out"

    champions = _decided_champions(post, last_week, season, pools) if post else []

    brier = None
    if complete:
        brier = [round(sum((playoffs[n][i] - made[n]) ** 2 for n in teams) / len(teams), 4) for i in range(len(weeks))]

    # Index = week, always: every per-team array must be exactly this long.
    for n in teams:
        assert len(playoffs[n]) == len(title[n]) == len(status[n]) == len(honours[n]) == len(weeks), \
            f"{season} {n}: array length {len(playoffs[n])}/{len(title[n])}/{len(status[n])}/{len(honours[n])} != {len(weeks)} (through_week {last_week} + 1)"

    pools_summary = {}
    for pool in sorted({t.pool(season) for t in teams.values()}):
        members = [n for n, t in teams.items() if t.pool(season) == pool]
        divs = sorted({teams[n].div for n in members})
        _q, nseeds = ps.pool_format(season, teams[members[0]].league, len(divs))
        pools_summary[pool] = {"seeds": nseeds}
    return {
        "season": season,
        "sims": sims,
        "hfa_elo": HFA_ELO,
        "reg_end_week": reg_end,
        "through_week": last_week,
        "complete": complete,
        "pools": pools_summary,
        "postseason_weeks": postseason_weeks,
        "champions": champions,
        "note": ("Index 0 is before the first game; index w is after week w, ONE axis for the whole season "
                 "(index = week, always), through reg_end_week the regular season (the LAST week of every "
                 "league in a two-league era, 1946-49 and 1960-69: a league final played at or before it, "
                 "while another league's regular season still runs, is folded into that regular-season "
                 "index rather than appended after it) and then, for postseason_weeks, one index per "
                 "postseason week past reg_end_week. playoffs: the share of simulated seasons (the games "
                 "so far as played, the rest drawn from the Elo ratings after that week, held fixed) in "
                 "which the club held a seed by the tiebreaking procedure of the era; a postseason index, "
                 "or the regular-season index at reg_end_week once the season is complete, just carries the "
                 "real, final picture forward instead, since a club already knows by then whether it made "
                 "it. title: the share in which the club won the season's final; a real postseason result "
                 "already played (`known`, whether at a postseason index or an earlier overlapping regular-"
                 "season one) is held fixed and only the rounds still ahead are drawn, from the Elo ratings "
                 "after that week, then a club the real results have eliminated is forced to exactly 0.0 "
                 "and, once the season's final has been played, its winner to exactly 1.0 (from 1966 the "
                 "Super Bowl alone; before that each pool, i.e. league, crowns its own in the winner of "
                 "that pool's own last scheduled postseason game; champions lists them; see "
                 "_decided_champions() and force_postseason()). status is set only where the arithmetic of "
                 "wins alone settles it (in, out); brier grades the playoff odds against what happened, for "
                 "a complete season. honours is cumulative: once a club earns one it stays for every later "
                 "week, filled in progressively as the records settle it (play_app, div_title, best_conf, "
                 "best_rec) and then, in the postseason, from the shard's final flags at the week the "
                 "qualifying game was actually played, which can itself be at or before reg_end_week in a "
                 "two-league era (cf_app, champ_app, champ); see honours_for_week() and "
                 "postseason_honours()."),
        "teams": {n: {"conf": teams[n].pool(season), "div": teams[n].div,
                      "playoffs": playoffs[n], "title": title[n], "status": status[n],
                      "honours": honours[n]} for n in teams},
        "brier": brier,
    }


def write(season: int, data: dict) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    p = os.path.join(OUT_DIR, f"{season}.json")
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
        f.write("\n")
    return p


def seasons_available() -> list[int]:
    return [y for y in ps.seasons_available() if y >= FIRST_SEASON]


# --------------------------------------------------------------------------
# verify the bracket against the ledger
# --------------------------------------------------------------------------

def verify(seasons: list[int]) -> int:
    """1975 on: the seeds decide the pairings (before 1975 the hosts and the
    pairings rotated by division, which the ratings cannot express, and before
    1970 the leagues' finals are one game between two division winners)."""
    bad = 0
    for y in seasons:
        if y < 1975:
            continue
        shard, teams, fixtures, reg_end = load_inputs(y)
        if not shard.get("complete"):
            continue
        ledger_path = os.path.join(ps.LEDGER_DIR, f"season-{y}.json")
        with open(ledger_path, encoding="utf-8") as f:
            ledger = json.load(f)
        post = [g for g in ledger["games"] if g.get("playoff") and g.get("score") and g.get("result")]
        if not post:
            print(f"{y}: no postseason in the ledger, skipped")
            continue
        final = ps.picture(teams, played_games(fixtures, max(f.week for f in fixtures if f.played)), y, [])
        divs = {n: t.div for n, t in teams.items()}
        confs = {n: t.conf for n, t in teams.items()}
        # Rounds by WEEK, not by the ledger's label: 1982 says "Round 1" and
        # "Round 2", and 2002 files the Falcons at Green Bay (4 January, a
        # wild-card Saturday) as "Div. Playoff". The first postseason week is
        # the wild-card round in every season from 1978.
        post_weeks = sorted({g["week"] for g in post})
        if y < 1978:
            wc_week, div_week = None, post_weeks[0]
        else:
            wc_week, div_week = post_weeks[0], post_weeks[1]
        wc_winners = {}
        for g in post:
            if g["week"] == wc_week:
                hs, as_ = (int(x) for x in g["score"].split("-"))
                wc_winners[(g["home_key"], g["away_key"])] = g["home_key"] if hs > as_ else g["away_key"]
        expected = {(g["home_key"], g["away_key"]) for g in post if g["week"] == div_week}
        expected_wc = {(g["home_key"], g["away_key"]) for g in post if wc_week is not None and g["week"] == wc_week}
        for h, a in KNOWN_LEDGER_HOST_ERRORS.get(y, ()):
            if (h, a) in expected_wc:
                expected_wc.remove((h, a))
                expected_wc.add((a, h))
        got: set = set()
        got_wc: set = set()
        for pool in {t.pool(y) for t in teams.values()}:
            seeds = sorted([n for n in teams if teams[n].pool(y) == pool and final[n].get("seed")],
                           key=lambda t: final[t]["seed"])
            games, _c = bracket(y, seeds, divs, wc_winners, confs=confs)
            for rnd, h, a in games:
                (got_wc if rnd == "WC" else got if rnd == "DIV" else set()).add((h, a))
        diff = sorted(expected_wc ^ got_wc) + sorted(expected ^ got)
        if diff:
            bad += 1
            print(f"{y}: MISMATCH wild card {sorted(expected_wc)} vs {sorted(got_wc)}; divisional {sorted(expected)} vs {sorted(got)}")
        else:
            print(f"{y}: OK, {len(got_wc)} wild-card and {len(got)} divisional pairings match the ledger")
    return bad


# --------------------------------------------------------------------------
# self-test
# --------------------------------------------------------------------------

def self_test() -> None:
    # the live engine's number (build-nfl-elo.py docstring)
    assert abs(win_probability(1610.675837, 1711.392234, -1) - 0.278093094) < 1e-8
    assert abs(win_probability(1500, 1500, 0) - 0.5) < 1e-12

    divs = {f"T{i}": ("A" if i < 4 else "B") for i in range(1, 9)}
    divs["T5"] = "A"  # the 5 seed shares a division with the 1 seed
    seeds = [f"T{i}" for i in range(1, 6)]
    games, c = bracket(1985, seeds, divs, {("T4", "T5"): "T5"})
    assert games[0] == ("WC", "T4", "T5")
    assert ("DIV", "T2", "T5") in games and ("DIV", "T1", "T3") in games, games
    games, c = bracket(1985, seeds, divs, {("T4", "T5"): "T4"})
    assert ("DIV", "T1", "T4") in games and ("DIV", "T2", "T3") in games, games

    seeds6 = [f"T{i}" for i in range(1, 7)]
    games, c = bracket(2005, seeds6, divs, {("T3", "T6"): "T6", ("T4", "T5"): "T4"})
    assert ("DIV", "T1", "T6") in games and ("DIV", "T2", "T4") in games, games

    seeds7 = [f"T{i}" for i in range(1, 8)]
    games, c = bracket(2023, seeds7, divs, {("T2", "T7"): "T7", ("T3", "T6"): "T3", ("T4", "T5"): "T5"})
    assert ("DIV", "T1", "T7") in games and ("DIV", "T3", "T5") in games, games

    seeds8 = [f"T{i}" for i in range(1, 9)]
    games, c = bracket(1982, seeds8, divs, {("T1", "T8"): "T1", ("T2", "T7"): "T2", ("T3", "T6"): "T6", ("T4", "T5"): "T5"})
    assert ("WC", "T1", "T8") in games and ("WC", "T4", "T5") in games, games

    # a drawn bracket ends with one champion and a title game
    rng = random.Random(1)
    elo = {n: 1500.0 + i * 10 for i, n in enumerate(seeds7)}
    _g, champ = bracket(2023, seeds7, divs, None, rng, elo)
    assert champ in seeds7
    assert title_game(rng, elo, ["T1", "T2"], 2023) == [title_game(rng, elo, ["T1", "T2"], 2023)[0]]
    assert sorted(title_game(rng, elo, ["T1", "T2"], 1962)) == ["T1", "T2"]      # two leagues, two titles
    assert len(title_game(rng, elo, ["T1", "T2"], 1966)) == 1                    # the first Super Bowl
    # 1975-77: four seeds, the wild card at the 1 seed unless they share a division
    games, c = bracket(1976, ["T1", "T2", "T3", "T5"], divs, {})
    assert ("DIV", "T2", "T5") in games and ("DIV", "T1", "T3") in games, games
    # 1933-66: two division winners, one final; 1920-32: the leader, no game
    games, c = bracket(1950, ["T1", "T5"], divs, None, rng, elo)
    assert games == [("FINAL", "T1", "T5")] and c in ("T1", "T5")
    assert bracket(1925, ["T1"], divs, None, rng, elo) == ([], "T1")
    # 1967-69 NFL: conference semi-finals then the final
    divs4 = {"T1": "Capitol", "T2": "Century", "T3": "Coastal", "T4": "Central"}
    confs4 = {"T1": "Eastern", "T2": "Eastern", "T3": "Western", "T4": "Western"}
    games, c = bracket(1968, ["T1", "T2", "T3", "T4"], divs4, None, rng, elo, confs4)
    assert [g[0] for g in games] == ["SEMI", "SEMI", "FINAL"] and {frozenset(g[1:]) for g in games[:2]} == {frozenset(("T1", "T2")), frozenset(("T3", "T4"))}, games
    # 1969 AFL: each winner hosts the other division's runner-up
    divsA = {"T1": "East", "T2": "West", "T3": "East", "T4": "West"}
    confsA = {t: "AFL" for t in divsA}
    games, c = bracket(1969, ["T1", "T2", "T3", "T4"], divsA, None, rng, elo, confsA)
    assert {frozenset(g[1:]) for g in games[:2]} == {frozenset(("T1", "T4")), frozenset(("T2", "T3"))}, games

    # `known` honours a real wild-card upset instead of drawing it
    games, champ = bracket(2023, seeds7, divs, None, rng, elo, confs=None, known={frozenset(("T2", "T7")): "T7"})
    assert ("WC", "T2", "T7") in games and champ in seeds7, games
    # and, fully known, a bracket consumes NO rng draws at all (postseason
    # weeks only ever feed `known` results, never the regular season, so
    # this refactor must not change the regular season's rng consumption)
    known_full = {frozenset(("T2", "T7")): "T2", frozenset(("T3", "T6")): "T3", frozenset(("T4", "T5")): "T4",
                  frozenset(("T1", "T4")): "T1", frozenset(("T2", "T3")): "T2", frozenset(("T1", "T2")): "T1"}
    rng_before = random.Random(99)
    rng_after = random.Random(99)
    games, champ = bracket(2023, seeds7, divs, None, rng_after, elo, confs=None, known=known_full)
    assert champ == "T1", (games, champ)
    assert rng_after.random() == rng_before.random()   # rng_after untouched by the fully-known bracket
    assert title_game(rng, elo, ["T1", "T2"], 2023, known={frozenset(("T1", "T2")): "T2"}) == ["T2"]

    # force_postseason: an eliminated club is zeroed, the alive clubs
    # renormalise to what is left, and a decided champion takes it all
    won = {"A": 0.3, "B": 0.3, "C": 0.3, "D": 0.1}
    pools4 = {n: "AFC" for n in won}
    out = force_postseason(won, {"D"}, [], pools4, 2020)
    assert out["D"] == 0.0 and abs(sum(out.values()) - 1.0) < 1e-9, out
    out2 = force_postseason(won, {"D"}, ["A"], pools4, 2020)
    assert out2 == {"A": 1.0, "B": 0.0, "C": 0.0, "D": 0.0}, out2
    # before 1966, two pools each carry their own 1.0
    won2 = {"A": 0.4, "B": 0.6, "C": 0.7, "D": 0.3}
    pools2 = {"A": "NFL", "B": "NFL", "C": "AFL", "D": "AFL"}
    out3 = force_postseason(won2, set(), [], pools2, 1962)
    assert abs(out3["A"] + out3["B"] - 1.0) < 1e-9 and abs(out3["C"] + out3["D"] - 1.0) < 1e-9, out3

    # proved status: eight clubs, two divisions, five seeds (1985). T1 has won
    # its seven games and only T2 (five, two to play) can still reach seven:
    # in by arithmetic. T8 is 0-7 with nothing left, six clubs above it and a
    # division rival among them: out. T5 at 3-4 with two left: nothing proved.
    T = {f"T{i}": ps.Team(f"T{i}", "AFC", "AFC East" if i <= 4 else "AFC West") for i in range(1, 9)}
    played = [ps.Game(1, "T1", f"T{i}", 20, 10) for i in range(2, 9)]           # T1 7-0, everyone else 0-1
    wins = {"T2": 5, "T3": 4, "T4": 4, "T5": 3, "T6": 3, "T7": 2, "T8": 0}
    w = 2
    for n, k in wins.items():
        for _ in range(k):
            played.append(ps.Game(w, n, "T8" if n != "T8" else "T7", 20, 10))
    fx = [Fixture(9, f"T{i}", f"T{i + 1}", False) for i in range(1, 7)]   # T1-T2 ... T6-T7; T8 has nothing left
    st = proved_status(T, played, fx, 8, 1985)
    assert st["T1"] == "in" and st["T8"] == "out" and st["T5"] is None, st
    # a division place is the era's only place before 1978: T1 is 7-0 and T2
    # (its division rival, 5-0 with two left) can still catch it, so nothing
    # is proved for T1 in 1965; in 1985 the wild card covered it.
    assert proved_status(T, played, fx, 8, 1965)["T1"] is None
    # ...but once T2 cannot reach 7 wins, the division is won
    fx2 = [f for f in fx if "T2" not in (f.home, f.away)]
    assert proved_status(T, played, fx2, 8, 1965)["T1"] == "in"
    # the schedule thins the threats: three rivals at 5-0 with two games left
    # that are all against each other cannot all reach 7, so a 7-0 club with
    # one wild card behind two divisions is in (8 clubs, 5 seeds: 2 divisions
    # + 3 wild cards; competitors for them must be fewer than 3)
    T3 = {f"T{i}": ps.Team(f"T{i}", "AFC", "AFC East" if i <= 4 else "AFC West") for i in range(1, 9)}
    played3 = [ps.Game(1, "T1", f"T{i}", 20, 10) for i in range(2, 9)]
    for n in ("T5", "T6", "T7"):
        for k in range(5):
            played3.append(ps.Game(2, n, "T8", 20, 10))
    fx3 = [Fixture(9, "T5", "T6", False), Fixture(10, "T6", "T7", False), Fixture(11, "T7", "T5", False)]
    # 5-0 each with two games left against each other: at most two of the
    # three can reach 7-0 (three games, three wins to share), so the West
    # surplus over its one division place is at most one, under the three
    # wild cards; and T1's own division cannot reach it at all.
    st3 = proved_status(T3, played3, fx3, 8, 1985)
    assert st3["T1"] == "in", st3
    # the same three with an outside game each instead could all reach 7
    fx4 = [Fixture(9, "T5", "T2", False), Fixture(9, "T6", "T3", False), Fixture(9, "T7", "T4", False)] * 2
    st4 = proved_status(T3, played3, fx4, 8, 1985)
    assert st4["T1"] == "in", st4  # T1 is 7-0 and the West trio tops out at 7-0: level, a threat; East cannot reach; 3 surplus >= 3 wild? no: West has 3 threats over 1 place = 2 surplus < 3 wild cards, in
    assert _can_all_reach({"A": 1, "B": 1}, {("A", "B"): 1}, {"A": 1, "B": 1}) is False
    assert _can_all_reach({"A": 1, "B": 1}, {("A", "B"): 2}, {"A": 2, "B": 2}) is True
    assert _can_all_reach({"A": 1, "B": 1}, {("A", "B"): 1}, {"A": 2, "B": 1}) is True   # A has an outside game

    # honours_for_week wants a STRICT domination (see its docstring), which
    # the "proved status" fixture above does not give T1 (it still has T2 on
    # its own schedule, so T2's naive best-case ties T1's worst-case at the
    # same number): a fresh, simpler fixture where T1 has finished 7-0 with
    # NO games left and everyone else has only a single loss, to T1, with
    # their 6 games among each other still to come. T1's worst (1.0, done)
    # strictly beats every rival's best (6/7, one loss already on the books),
    # so it clinches its division, its conference and the league outright,
    # all in the same week; T8 (0-1, 6 to go, symmetric with the rest) earns
    # nothing yet.
    Th = {f"T{i}": ps.Team(f"T{i}", "AFC", "AFC East" if i <= 4 else "AFC West") for i in range(1, 9)}
    played_h = [ps.Game(1, "T1", f"T{i}", 20, 10) for i in range(2, 9)]
    fx_h = [Fixture(9, f"T{i}", f"T{j}", False) for i in range(2, 9) for j in range(i + 1, 9)]
    st_h = proved_status(Th, played_h, fx_h, 8, 1985)
    assert st_h["T1"] == "in", st_h
    hn = honours_for_week(Th, played_h, fx_h, 8, 1985, st_h)
    assert hn["T1"] == {"play_app", "div_title", "best_conf", "best_rec"}, hn["T1"]
    assert hn["T8"] == set(), hn["T8"]
    # week 0: nothing played means everyone's worst is 0 and best is 1, so no
    # strict comparison and no status can pass.
    hn0 = honours_for_week(Th, [], fx_h, 0, 1985, {n: None for n in Th})
    assert all(not v for v in hn0.values()), hn0

    # week_axis: index = week, always. A postseason week at or before
    # reg_end (a two-league era, one league's final while the other's
    # regular season runs on) does not extend the axis; one past it does.
    assert week_axis(16, [16, 17, 18]) == list(range(0, 19))          # 1966: NFL 15, AFL 16
    assert week_axis(15, [13, 16]) == list(range(0, 17))               # 1946: AAFC 13, NFL 15/16
    assert week_axis(17, []) == list(range(0, 18))                     # no postseason yet: just the regular season

    # force_postseason on a synthetic two-league week 15: league A's own (and
    # only) final has just been played, crowning A1; league B's own regular
    # season runs to week 16, so its clubs are untouched by A's result.
    won5 = {"A1": 0.6, "A2": 0.4, "B1": 0.5, "B2": 0.5}
    pools5 = {"A1": "NFL", "A2": "NFL", "B1": "AFL", "B2": "AFL"}
    out5 = force_postseason(won5, {"A2"}, ["A1"], pools5, 1962)
    assert out5["A1"] == 1.0 and out5["A2"] == 0.0, out5
    assert out5["B1"] == 0.5 and out5["B2"] == 0.5, out5               # league B untouched

    # _decided_champions / force_postseason, >= 1966: the Super Bowl alone
    # decides it, not the league (from 1970, conference) championship games.
    sb_teams = {"Cowboys": "NFC", "Packers": "NFC", "Bills": "AFC", "Chiefs": "AFC"}
    post_sb = [
        Fixture(16, "Cowboys", "Packers", False, 27, 34, "NFL Champ"),
        Fixture(17, "Bills", "Chiefs", False, 27, 31, "AFL Champ"),
        Fixture(18, "Chiefs", "Packers", True, 10, 35, "Super Bowl"),
    ]
    # both league finals played (through week 17), no Super Bowl yet: no
    # champion, and the two league champions carry all the (renormalised) mass.
    assert _decided_champions(post_sb, 17, 1966, sb_teams) == []
    known17, elim17 = _known_and_eliminated(post_sb, 17)
    assert elim17 == {"Cowboys", "Bills"}
    out17 = force_postseason({"Cowboys": 0.0, "Packers": 0.5, "Bills": 0.0, "Chiefs": 0.5},
                             elim17, [], sb_teams, 1966)
    assert out17["Cowboys"] == 0.0 and out17["Bills"] == 0.0, out17
    assert out17["Packers"] > 0 and out17["Chiefs"] > 0, out17
    assert abs(out17["Packers"] + out17["Chiefs"] - 1.0) < 1e-9, out17
    # the Super Bowl played (through week 18): Packers, and only Packers, at 1.0
    champs18 = _decided_champions(post_sb, 18, 1966, sb_teams)
    assert champs18 == ["Packers"], champs18
    known18, elim18 = _known_and_eliminated(post_sb, 18)
    assert elim18 == {"Cowboys", "Bills", "Chiefs"}
    out18 = force_postseason({"Cowboys": 0.0, "Packers": 0.5, "Bills": 0.0, "Chiefs": 0.5},
                             elim18, champs18, sb_teams, 1966)
    assert out18 == {"Cowboys": 0.0, "Packers": 1.0, "Bills": 0.0, "Chiefs": 0.0}, out18
    print("playoff_odds self-test OK")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--from", dest="from_", type=int, default=FIRST_SEASON)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--sims", type=int, default=DEFAULT_SIMS)
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args(argv)
    if a.self_test:
        self_test()
        return 0
    if a.verify:
        ys = [a.season] if a.season else seasons_available()
        return 1 if verify(ys) else 0
    ys = [a.season] if a.season else (seasons_available() if a.all else [])
    ys = [y for y in ys if y >= a.from_]
    if not ys:
        ap.error("--season YYYY or --all")
    for y in ys:
        data = build(y, a.sims, a.quiet)
        if a.write:
            p = write(y, data)
            print(f"{y}: wrote {p} ({data['through_week']} weeks, {data['sims']} draws)")
        else:
            best = max(data["teams"], key=lambda n: data["teams"][n]["title"][-1])
            print(f"{y}: dry run; after week {data['through_week']} {best} {data['teams'][best]['title'][-1]:.1%} for the title"
                  + (f"; brier {data['brier'][0]} at week 0 to {data['brier'][-1]} at the end" if data["brier"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
