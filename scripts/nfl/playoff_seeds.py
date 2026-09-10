"""Week-by-week NFL playoff seeding with the real tiebreakers.

WHAT THIS IS. For every regular-season week of a season, the playoff picture
"if the season ended today": every team's rank inside its division, its rank
inside its conference, and its seed (1..7 from 2020, 1..6 from 2002 to 2019,
null when out), written to public/data/nfl/seeds/YYYY.json for the season
page's week scrubber (Ashwin's ask, 2026-09-09: "see the progression of a
team in a playoff spot, where that manifested over time, and what ultimately
happened").

INPUTS. Results come from the expectation ledger
(public/data/nfl/expectation/season-YYYY.json: home_key, away_key, week,
score, result, playoff), conference and division from the Elo shard
(public/data/nfl/elo/seasons/YYYY.json: teams[].name/conf/div). Nothing is
read from the workbook; nothing is written to either input.

THE LIVE SEASON has no ledger until the workbook catches up, so when
season-YYYY.json is missing and public/data/nfl/elo/upcoming.json is for that
season, the results come from its schedule instead (week, home, away,
home_pts, away_pts, phase "Reg. Season"; a game with points is a game
played). The names there are the shard's canonical names, the same key the
ledger's home_key/away_key carry. nfl-live-refresh.yml runs this after the
ESPN carry, so 2026's seeds exist from week 1 on and grow every week
(Ashwin's ask, 2026-09-09).

THE PROCEDURE (NFL tiebreaking procedures, applied literally).
  Division, two clubs: head-to-head; division record; common games; conference
    record; strength of victory; strength of schedule; conference points
    ranking (points scored + points allowed); league points ranking; net
    points in common games; net points in all games; (net touchdowns, not
    in the ledger, skipped); coin toss.
  Division, three or more: head-to-head record among the tied clubs; then the
    same list. Whenever a step leaves fewer clubs tied at the top than it
    started with, the procedure restarts from step one with those clubs
    (two clubs: the two-club list).
  Wild card, two clubs: head-to-head if played; conference record; common
    games, minimum four; SOV; SOS; conference points ranking; league points
    ranking; net points in conference games; net points in all games; coin.
  Wild card, three or more: first, clubs from the same division are reduced
    to that division's best by the division procedure; then head-to-head
    sweep (a club that beat every other tied club takes the spot; a club that
    lost to every other is dropped and the rest restart); then the two-club
    wild-card list from conference record on, restarting whenever the tied
    set shrinks.
  Division winners are seeded against each other with the wild-card
    procedure; wild cards fill the remaining seeds in wild-card order.

🔴 THE COIN TOSS IS NOT A COIN TOSS HERE. When every listed step is level the
club that sorts first by name takes the higher place and the week's `notes`
records it. It happens a handful of times across 24 seasons, always early in
a season when records are 1-0 and nothing has separated anyone yet, and the
note is how a reader can tell. Net touchdowns is skipped for the same reason:
the ledger has scores, not touchdowns.

🔴 GAMES ARE COUNTED BY THE LEDGER'S `week`, NOT BY DATE. The scrubber is a
week scrubber; a Saturday game in week 15 belongs to week 15 whatever the
calendar says. Ties count half a win everywhere a percentage is taken.

SCOPE. Every season from 1920 (Ashwin, 2026-09-09: "if you could do it from
the beginning, from 1920 onwards"). The POOL a team qualifies from is its
conference from 1970 and its league before that; the divisions come from the
shard. What a pool sends to the playoffs, by era:
  1920-1932  no playoff; the standings leader is the champion (position 1)
  1933-1969  every division winner (NFL East/West; the 1967-69 four; AFL
             East/West; AAFC Eastern/Western); AFL 1969 the top two of each
             division; AAFC 1949 the top four of one group
  1970-1977  three division winners and one wild card, four seeds
  1978-1989  five seeds; 1990-2019 six; 2020 on seven; 1982 eight by
             conference record with no division winners
Before 1970 a tie for a division title was played off, so what this shows for
those weeks is the club the procedure would have placed first, flagged as such
in the file's notes. Before 1972 a tie did not count as half a win: the
percentage excludes ties, as the league's standings did. Before 1975 the
divisional round's home fields rotated by division rather than by seed, so the
1970-74 "seed" is a ranking by record, not the league's own number.

USAGE
  python scripts/nfl/playoff_seeds.py --self-test
  python scripts/nfl/playoff_seeds.py --season 2024 [--write]
  python scripts/nfl/playoff_seeds.py --all [--write]      # 2002 to the newest ledger
  python scripts/nfl/playoff_seeds.py --verify             # final-week seeds vs the shard's `seed`
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEDGER_DIR = os.path.join(ROOT, "public", "data", "nfl", "expectation")
SHARD_DIR = os.path.join(ROOT, "public", "data", "nfl", "elo", "seasons")
UPCOMING = os.path.join(ROOT, "public", "data", "nfl", "elo", "upcoming.json")
OUT_DIR = os.path.join(ROOT, "public", "data", "nfl", "seeds")

FIRST_SEASON = 1920
# Located against the shard's final seeds (see the Breaker note): the common
# games step is absent in 1979 (Washington had the better common-games record
# and the Bears took the spot), and the "restart at the two-club format" note
# is absent in 1990 (Seattle beat Houston head-to-head and Houston took the
# spot on conference record after Pittsburgh was eliminated).
COMMON_FROM = int(os.environ.get("NFL_SEEDS_COMMON_FROM", "1980"))
# Division ties before this year go from conference record straight to net
# points in ALL games; the "net points in division games" step is later. 1977
# fixes it: Minnesota over Chicago for the NFC Central at +4 to +2 in all
# games where division games (+44 to +71) would have gone the other way, and
# the same season's seeding of Minnesota over Los Angeles in 1975 (+197 to
# +177) where conference record would have favoured the Rams.
NET_DIV_FROM = int(os.environ.get("NFL_SEEDS_NET_DIV_FROM", "1978"))
RESTART_FROM = int(os.environ.get("NFL_SEEDS_RESTART_FROM", "1991"))
# 1995 needs the restart (San Diego took the fourth seed over Indianapolis on
# head-to-head after Miami was eliminated, where conference record would have
# given it to the Colts); 1990 needs its absence. Nothing between 1991 and
# 1994 separates the two, so 1991 is the earliest consistent year, not a
# sourced one.

# Final seeds the shard carries that the historical record contradicts (the
# workbook's seed column, not the procedure): each is the pair swapped, and
# the playoff hosts of that January settle it. Reported to Ashwin 2026-09-09.
#   1980 AFC 1/2: San Diego hosted the AFC championship, Cleveland the divisional
#   1981 AFC 4/5: the wild-card game was at Shea, Jets over Bills at home
#   1983 AFC 1/2: the Raiders hosted Pittsburgh and then Seattle
#   1985 AFC 1/2: the Raiders hosted New England; Miami hosted Cleveland
#   1986 NFC 1/2: the Giants hosted the NFC championship
#   1989 AFC 4/5: the wild-card game was at the Astrodome
KNOWN_SHARD_SEED_ERRORS = {
    1980: {"Chargers": 1, "Browns": 2},
    1981: {"Jets": 4, "Bills": 5},
    1983: {"Raiders": 1, "Dolphins": 2},
    1985: {"Raiders": 1, "Dolphins": 2},
    1986: {"Giants": 1, "Bears": 2},
    1989: {"Titans": 4, "Steelers": 5},
}


# League rulings that override the procedure for one season. 1921: Chicago
# (the Staleys, "Bears" here) and Buffalo (the All-Americans, "Bisons") both
# finished 9-1 by the APFA's ties-excluded percentage; Buffalo held that the
# 4 December game (Chicago 10-7) was a post-season exhibition, the league's
# executive committee ruled in January 1922 that it counted and that the
# second meeting outweighed the first, and gave Chicago the title (the
# "Staley Swindle"). So between these two clubs, level on percentage, the
# winner of their LATEST meeting is placed first, from the week that meeting
# was played (Ashwin, 2026-09-10, via Gemini: "the model is incorrectly
# awarding the 1921 title to the Buffalo All-Americans").
LEAGUE_RULINGS: dict[int, dict] = {
    1921: {"clubs": ("Bears", "Bisons"), "latest_meeting_wins": True,
           "note": "APFA executive ruling, January 1922: the 4 December meeting counted and the "
                   "later meeting outweighed the earlier, so Chicago was placed above Buffalo"},
}


def apply_rulings(season: int, order: list[str], st: "Standings", notes: list[str]) -> tuple[list[str], bool]:
    """Reorder `order` where a league ruling settled a tie the procedure would
    not; the flag says a ruling applied (so the tie is settled, not played off)."""
    r = LEAGUE_RULINGS.get(season)
    if not r:
        return order, False
    a, b = r["clubs"]
    if a not in order or b not in order:
        return order, False
    if round(st.rec[a].pct, 6) != round(st.rec[b].pct, 6):
        return order, False
    meetings = [g for g in st.rec[a].games if g.opponent(a) == b and g.result_for(a) != 0.5]
    if not meetings:
        return order, False
    last = max(meetings, key=lambda g: g.week)
    winner = a if last.result_for(a) == 1.0 else b
    loser = b if winner == a else a
    if order.index(winner) < order.index(loser):
        return order, True
    out = [c for c in order if c != winner]
    out.insert(out.index(loser), winner)
    notes.append(f"ruling: {r['note']} ({winner} above {loser})")
    return out, True


def seeds_per_conf(season: int) -> int:
    """Seeds per conference in the wild-card era (1978 on)."""
    if season == 1982:
        return 8
    if season >= 2020:
        return 7
    if season >= 1990:
        return 6
    return 5


def pool_format(season: int, league: str, n_divs: int) -> tuple[int, int]:
    """(qualifiers per division, seeds for the pool) for one pool of one season."""
    if season == 1982:
        return 8, 8
    if season >= 1978:
        return 1, seeds_per_conf(season)
    if season >= 1970:
        return 1, n_divs + 1          # three division winners and a wild card
    if league == "AFL" and season == 1969:
        return 2, 4                   # the top two of each division
    if n_divs == 1:
        return (4, 4) if league == "AAFC" else (1, 1)   # AAFC 1949 top four; 1920-32 the leader
    return 1, n_divs                  # every division winner


def ties_half(season: int) -> bool:
    """Ties count half a win from 1972; before that the percentage excludes them."""
    return season >= 1972


# --------------------------------------------------------------------------
# records
# --------------------------------------------------------------------------

@dataclass
class Game:
    week: int
    home: str
    away: str
    hs: int
    as_: int

    def result_for(self, team: str) -> float:
        """1 win, 0.5 tie, 0 loss, from `team`'s side."""
        if self.hs == self.as_:
            return 0.5
        won = (self.hs > self.as_) if team == self.home else (self.as_ > self.hs)
        return 1.0 if won else 0.0

    def opponent(self, team: str) -> str:
        return self.away if team == self.home else self.home

    def pf(self, team: str) -> int:
        return self.hs if team == self.home else self.as_

    def pa(self, team: str) -> int:
        return self.as_ if team == self.home else self.hs


@dataclass
class Team:
    name: str
    conf: str
    div: str
    league: str = "NFL"

    def pool(self, season: int) -> str:
        """Where the team qualifies from: its conference from 1970, its league before."""
        return self.conf if season >= 1970 else self.league


@dataclass
class Record:
    w: int = 0
    l: int = 0
    t: int = 0
    pf: int = 0
    pa: int = 0
    games: list = field(default_factory=list)

    ties_half: bool = True

    @property
    def pct(self) -> float:
        if self.ties_half:
            n = self.w + self.l + self.t
            return (self.w + 0.5 * self.t) / n if n else 0.0
        n = self.w + self.l
        return self.w / n if n else 0.0

    @property
    def n(self) -> int:
        return self.w + self.l + self.t

    def add(self, r: float) -> None:
        if r == 1.0:
            self.w += 1
        elif r == 0.0:
            self.l += 1
        else:
            self.t += 1


class Standings:
    """Every record the procedure needs, for one team set through one week."""

    def __init__(self, teams: dict[str, Team], games: list[Game], ties_half_: bool = True):
        self.teams = teams
        self.games = games
        self.ties_half = ties_half_
        self.rec: dict[str, Record] = {n: Record(ties_half=ties_half_) for n in teams}
        # results by (team, opponent) -> list of results from team's side
        self.vs: dict[str, dict[str, list[float]]] = {n: defaultdict(list) for n in teams}
        for g in games:
            for side in (g.home, g.away):
                if side not in self.rec:
                    continue
                r = g.result_for(side)
                rec = self.rec[side]
                rec.add(r)
                rec.pf += g.pf(side)
                rec.pa += g.pa(side)
                rec.games.append(g)
                self.vs[side][g.opponent(side)].append(r)

    # --- component records -------------------------------------------------
    def pct_vs(self, team: str, opps) -> float | None:
        rs = [r for o in opps for r in self.vs[team].get(o, [])]
        if not self.ties_half:
            rs = [r for r in rs if r != 0.5]
        return sum(rs) / len(rs) if rs else None

    def division_pct(self, team: str) -> float:
        t = self.teams[team]
        return self.pct_vs(team, [n for n, x in self.teams.items() if x.div == t.div and n != team]) or 0.0

    def conference_pct(self, team: str) -> float:
        t = self.teams[team]
        return self.pct_vs(team, [n for n, x in self.teams.items() if x.conf == t.conf and n != team]) or 0.0

    def opponents(self, team: str) -> set[str]:
        return set(self.vs[team].keys())

    def common_pct(self, clubs: list[str], team: str, minimum: int) -> float | None:
        common = set.intersection(*[self.opponents(c) - set(clubs) for c in clubs])
        rs = [r for o in common for r in self.vs[team].get(o, [])]
        if len(rs) < minimum:
            return None
        return sum(rs) / len(rs) if rs else None

    def sov(self, team: str) -> float:
        beaten = [g.opponent(team) for g in self.rec[team].games if g.result_for(team) == 1.0]
        return self._combined(beaten)

    def sos(self, team: str) -> float:
        return self._combined([g.opponent(team) for g in self.rec[team].games])

    def _combined(self, opps: list[str]) -> float:
        w = l = t = 0
        for o in opps:
            r = self.rec.get(o)
            if r is None:
                continue
            w += r.w
            l += r.l
            t += r.t
        if not self.ties_half:
            n = w + l
            return w / n if n else 0.0
        n = w + l + t
        return (w + 0.5 * t) / n if n else 0.0

    def points_rank(self, team: str, pool: list[str]) -> int:
        """Combined ranking in points scored (1 = most) and allowed (1 = fewest); lower is better."""
        # Ties share a rank (1 + the number of clubs strictly better), so two
        # clubs on identical points are level here rather than split by list
        # order.
        pf, pa = self.rec[team].pf, self.rec[team].pa
        r_scored = 1 + sum(1 for n in pool if self.rec[n].pf > pf)
        r_allowed = 1 + sum(1 for n in pool if self.rec[n].pa < pa)
        return r_scored + r_allowed

    def net_points(self, team: str, opps=None) -> int:
        gs = self.rec[team].games
        if opps is not None:
            gs = [g for g in gs if g.opponent(team) in opps]
        return sum(g.pf(team) - g.pa(team) for g in gs)

    def conf_pool(self, team: str) -> list[str]:
        c = self.teams[team].conf
        return [n for n, x in self.teams.items() if x.conf == c]


# --------------------------------------------------------------------------
# tiebreakers
# --------------------------------------------------------------------------

class Breaker:
    def __init__(self, st: Standings, notes: list[str], season: int = 2002):
        self.st = st
        self.notes = notes
        # 🔴 TWO LISTS, ONE SWITCH. Strength of victory, strength of schedule
        # and the two points rankings entered the procedure in 2002. Before
        # that, division ties ran head-to-head, division record, common games,
        # conference record, net points in division games, net points in all
        # games; wild-card ties ran head-to-head (sweep for three or more),
        # conference record, common games (minimum four), net points in
        # conference games, net points in all games. Verified against the
        # shard's final seeds: with the modern list 1979, 1980, 1981, 1983,
        # 1985, 1986, 1989, 1990, 1997 and 1998 all came out wrong; with the
        # older list they match (the 1979 Bears over Washington on net points
        # is the famous one).
        self.modern = season >= 2002
        self.common = season >= COMMON_FROM
        self.restart = season >= RESTART_FROM
        self.net_div = season >= NET_DIV_FROM
        # Filled once every division is ranked: the NFL note that "the
        # original seeding within a division upon application of the division
        # tiebreaker remains the same for all subsequent applications", so a
        # wild-card round picks a division's representative by that order.
        self.div_rank: dict[str, int] = {}
        # Set by picture() while it seeds the division winners against each
        # other, which before 1978 followed a shorter list than a wild-card tie.
        self.seeding_winners = False

    # A step is a function clubs -> {club: value or None}; higher is better.
    # None means the step does not apply to that club (no games); a step
    # applies only if every club has a value.
    def _apply(self, clubs: list[str], steps, label: str) -> list[str]:
        """Return the clubs still tied at the top after running `steps` once through.
        Restarts are the caller's job."""
        tied = list(clubs)
        for name, step, higher_better in steps:
            vals = step(tied)
            if any(vals[c] is None for c in tied):
                continue
            best = max(vals.values()) if higher_better else min(vals.values())
            top = [c for c in tied if vals[c] == best]
            if len(top) < len(tied):
                return top
        # every step level: the deterministic stand-in for the coin toss
        top = sorted(tied)[:1]
        self.notes.append(f"{label}: {', '.join(sorted(tied))} level on every step; {top[0]} placed first by name")
        return top

    def best(self, clubs: list[str], kind: str) -> str:
        """The single best club of a tied set, restarting whenever the set shrinks."""
        tied = list(clubs)
        while len(tied) > 1:
            if kind == "div":
                nxt = self._apply(tied, self._div_steps(tied), "division")
            else:
                nxt = self._wc_round(tied)
            if len(nxt) == len(tied):  # cannot happen: _apply always shrinks
                nxt = sorted(tied)[:1]
            tied = nxt
        return tied[0]

    def order(self, clubs: list[str], kind: str) -> list[str]:
        """Full ordering of a tied set: best, then best of the rest, and so on."""
        rest = list(clubs)
        out = []
        while rest:
            b = self.best(rest, kind)
            out.append(b)
            rest.remove(b)
        return out

    # --- division ----------------------------------------------------------
    def _div_steps(self, tied):
        st = self.st
        two = len(tied) == 2
        if not self.modern:
            common = [("common games", lambda cs: {c: st.common_pct(cs, c, 1) for c in cs}, True)] if self.common else []
            net_div = [("net points, division games", lambda cs: {c: st.net_points(c, {n for n, x in st.teams.items() if x.div == st.teams[c].div}) for c in cs}, True)] if self.net_div else []
            return [
                ("head-to-head", lambda cs: {c: st.pct_vs(c, [o for o in cs if o != c]) for c in cs}, True),
                ("division record", lambda cs: {c: st.division_pct(c) for c in cs}, True),
                ("conference record", lambda cs: {c: st.conference_pct(c) for c in cs}, True),
            ] + common + net_div + [
                ("net points", lambda cs: {c: st.net_points(c) for c in cs}, True),
            ]
        return [
            ("head-to-head", lambda cs: {c: st.pct_vs(c, [o for o in cs if o != c]) for c in cs}, True),
            ("division record", lambda cs: {c: st.division_pct(c) for c in cs}, True),
            ("common games", lambda cs: {c: st.common_pct(cs, c, 1) for c in cs}, True),
            ("conference record", lambda cs: {c: st.conference_pct(c) for c in cs}, True),
            ("strength of victory", lambda cs: {c: st.sov(c) for c in cs}, True),
            ("strength of schedule", lambda cs: {c: st.sos(c) for c in cs}, True),
            ("conference points ranking", lambda cs: {c: st.points_rank(c, st.conf_pool(c)) for c in cs}, False),
            ("league points ranking", lambda cs: {c: st.points_rank(c, list(st.teams)) for c in cs}, False),
            ("net points, common games", lambda cs: {c: st.net_points(c, set.intersection(*[st.opponents(x) - set(cs) for x in cs])) for c in cs}, True),
            ("net points", lambda cs: {c: st.net_points(c) for c in cs}, True),
        ] if not two else [
            ("head-to-head", lambda cs: {c: st.pct_vs(c, [o for o in cs if o != c]) for c in cs}, True),
            ("division record", lambda cs: {c: st.division_pct(c) for c in cs}, True),
            ("common games", lambda cs: {c: st.common_pct(cs, c, 1) for c in cs}, True),
            ("conference record", lambda cs: {c: st.conference_pct(c) for c in cs}, True),
            ("strength of victory", lambda cs: {c: st.sov(c) for c in cs}, True),
            ("strength of schedule", lambda cs: {c: st.sos(c) for c in cs}, True),
            ("conference points ranking", lambda cs: {c: st.points_rank(c, st.conf_pool(c)) for c in cs}, False),
            ("league points ranking", lambda cs: {c: st.points_rank(c, list(st.teams)) for c in cs}, False),
            ("net points, common games", lambda cs: {c: st.net_points(c, set.intersection(*[st.opponents(x) - set(cs) for x in cs])) for c in cs}, True),
            ("net points", lambda cs: {c: st.net_points(c) for c in cs}, True),
        ]

    # --- wild card ---------------------------------------------------------
    def _wc_steps(self, tied):
        st = self.st
        if not self.modern:
            common = [("common games (min 4)", lambda cs: {c: st.common_pct(cs, c, 4) for c in cs}, True)] if self.common else []
            if self.seeding_winners and not self.net_div:
                # 1970-77 seeding of division winners: record, then net
                # points in all games (Minnesota over Los Angeles, 1975).
                return [("net points", lambda cs: {c: st.net_points(c) for c in cs}, True)]
            return [
                ("conference record", lambda cs: {c: st.conference_pct(c) for c in cs}, True),
            ] + common + [
                ("net points, conference games", lambda cs: {c: st.net_points(c, set(st.conf_pool(c))) for c in cs}, True),
                ("net points", lambda cs: {c: st.net_points(c) for c in cs}, True),
            ]
        return [
            ("conference record", lambda cs: {c: st.conference_pct(c) for c in cs}, True),
            ("common games (min 4)", lambda cs: {c: st.common_pct(cs, c, 4) for c in cs}, True),
            ("strength of victory", lambda cs: {c: st.sov(c) for c in cs}, True),
            ("strength of schedule", lambda cs: {c: st.sos(c) for c in cs}, True),
            ("conference points ranking", lambda cs: {c: st.points_rank(c, st.conf_pool(c)) for c in cs}, False),
            ("league points ranking", lambda cs: {c: st.points_rank(c, list(st.teams)) for c in cs}, False),
            ("net points, conference games", lambda cs: {c: st.net_points(c, set(st.conf_pool(c))) for c in cs}, True),
            ("net points", lambda cs: {c: st.net_points(c) for c in cs}, True),
        ]

    def _wc_round(self, tied: list[str]) -> list[str]:
        st = self.st
        # Same division: only that division's best survives this round.
        by_div: dict[str, list[str]] = defaultdict(list)
        for c in tied:
            by_div[st.teams[c].div].append(c)
        survivors = []
        for _, cs in by_div.items():
            if len(cs) == 1:
                survivors.append(cs[0])
            elif all(c in self.div_rank for c in cs):
                survivors.append(min(cs, key=lambda c: self.div_rank[c]))
            else:
                survivors.append(self.best(cs, "div"))
        if len(survivors) == 1:
            return survivors
        if len(survivors) == 2 and (self.restart or len(tied) == 2):
            h2h = {c: st.pct_vs(c, [o for o in survivors if o != c]) for c in survivors}
            if all(v is not None for v in h2h.values()) and len(set(h2h.values())) == 2:
                return [max(survivors, key=lambda c: h2h[c])]
            return self._apply(survivors, self._wc_steps(survivors), "wild card")
        # Three or more: sweep first. Under the modern text the sweep is
        # judged among the survivors of step 1; before the restart note it was
        # judged among every tied club (1990: Seattle beat Houston but never
        # played Pittsburgh, so no sweep, and Houston went through on
        # conference record).
        pool = survivors if self.restart else tied
        for c in survivors:
            others = [o for o in pool if o != c]
            rs = [st.vs[c].get(o, []) for o in others]
            if all(rs) and all(all(r == 1.0 for r in x) for x in rs):
                return [c]
        swept_out = [c for c in survivors
                     if all(st.vs[c].get(o, []) and all(r == 0.0 for r in st.vs[c][o]) for o in pool if o != c)]
        if swept_out and len(swept_out) < len(survivors):
            return [c for c in survivors if c not in swept_out]
        return self._apply(survivors, self._wc_steps(survivors), "wild card")


# --------------------------------------------------------------------------
# one week's picture
# --------------------------------------------------------------------------

def picture(teams: dict[str, Team], games: list[Game], season: int, notes: list[str]) -> dict[str, dict]:
    """{team: {dr, cr, seed}} for the games given (already cut to the week)."""
    st = Standings(teams, games, ties_half(season))
    br = Breaker(st, notes, season)
    out: dict[str, dict] = {}
    for pool in sorted({t.pool(season) for t in teams.values()}):
        members = [n for n, t in teams.items() if t.pool(season) == pool]
        league = teams[members[0]].league
        divs = sorted({teams[n].div for n in members})
        q, nseeds = pool_format(season, league, len(divs))
        winners = []
        shared: list[str] = []   # clubs level for a title that would be played off
        for div in divs:
            dm = [n for n in members if teams[n].div == div]
            ranked = _rank(dm, st, br, "div")
            for i, n in enumerate(ranked):
                out[n] = {"dr": i + 1}
                br.div_rank[n] = i + 1
            winners.extend(ranked[:q])
            # Before 1970 there was no tiebreaker for a division title: level
            # clubs played it off. So a club level with the leader on the
            # record IS in the playoff picture that week, with a playoff to
            # come (Ashwin, 2026-09-10: 1963 AFL East, Boston and Buffalo).
            # The NFL adopted tiebreakers for 1967 (the Coastal: Rams over the
            # Colts, both 11-1-2, on the points in their two games, no playoff);
            # the AFL played its ties off to the end (1968 West, Raiders 41-6
            # Chiefs). `--verify` is what says so: 1967 Colts "computed in,
            # shard has no appearance" the moment this rule forgets the NFL.
            played_off = season < 1967 or league != "NFL"
            if played_off and q == 1 and len(divs) > 1:
                top = round(st.rec[ranked[0]].pct, 6)
                level = [n for n in ranked if round(st.rec[n].pct, 6) == top]
                if len(level) > 1:
                    shared.extend(level[1:])
                    for n in level:
                        out[n]["tie"] = True
        if season == 1982:
            # The strike season: a 16-team tournament seeded by conference
            # record, division standings not used.
            pool_order = _rank(members, st, br, "wc")
        elif len(divs) == 1:
            # One group (1920-32, AAFC 1949): the standings are the seeding,
            # unless the league ruled otherwise (1921). Before 1933 clubs
            # level at the top were, once, played off: 1932, the Bears and
            # the Spartans both 6-1 on the ties-excluded percentage, the
            # league arranging a game (18 December, Chicago Stadium, Bears
            # 9-0) that the record then counted. Level clubs at the top
            # share the leader's place with the `tie` flag, as a division
            # title level on the record does after 1932 (Ashwin, 2026-09-11:
            # "you show that both teams are qualified for the playoffs").
            pool_order, ruled = apply_rulings(season, _rank(members, st, br, "div"), st, notes)
            if nseeds == 1 and not ruled and len(pool_order) > 1:
                top = round(st.rec[pool_order[0]].pct, 6)
                level = [n for n in pool_order if round(st.rec[n].pct, 6) == top]
                if len(level) > 1:
                    shared.extend(level[1:])
                    for n in level:
                        out[n]["tie"] = True
        else:
            br.seeding_winners = True
            seeded_winners = _rank(winners, st, br, "wc")
            br.seeding_winners = False
            others = [n for n in members if n not in winners]
            seeded_others = _rank(others, st, br, "wc")
            pool_order = seeded_winners + seeded_others
        for i, n in enumerate(pool_order):
            out[n]["cr"] = i + 1
            out[n]["seed"] = i + 1 if i < nseeds else None
        # A club sharing a played-off title takes the leader's place (the
        # same seed), not a place of its own: the ranking above is what the
        # procedure would say, and the flag says the procedure did not apply.
        for n in shared:
            leader = next((m for m in winners if teams[m].div == teams[n].div), pool_order[0])
            out[n]["seed"] = out[leader]["seed"]
    return out


def _rank(clubs: list[str], st: Standings, br: Breaker, kind: str) -> list[str]:
    """Order clubs by record, breaking each tie group with the procedure."""
    groups: dict[float, list[str]] = defaultdict(list)
    for c in clubs:
        groups[round(st.rec[c].pct, 6)].append(c)
    ordered = []
    for pct in sorted(groups, reverse=True):
        g = groups[pct]
        ordered.extend(g if len(g) == 1 else br.order(g, kind))
    return ordered


# --------------------------------------------------------------------------
# io
# --------------------------------------------------------------------------

def _upcoming_for(season: int) -> dict | None:
    if not os.path.exists(UPCOMING):
        return None
    with open(UPCOMING, encoding="utf-8") as f:
        up = json.load(f)
    return up if up.get("season") == season and isinstance(up.get("schedule"), list) else None


def load_season(season: int):
    with open(os.path.join(SHARD_DIR, f"{season}.json"), encoding="utf-8") as f:
        shard = json.load(f)
    teams = {t["name"]: Team(t["name"], t.get("conf") or t.get("league") or "NFL", t.get("div") or t.get("league") or "NFL", t.get("league") or "NFL")
             for t in shard["teams"]}
    games = []
    tiebreaks: list[dict] = []
    ledger_path = os.path.join(LEDGER_DIR, f"season-{season}.json")
    if os.path.exists(ledger_path):
        with open(ledger_path, encoding="utf-8") as f:
            ledger = json.load(f)
        for g in ledger["games"]:
            if ((g.get("playoff") and g.get("round") == "Div. Playoff" and season < 1970 and g.get("score"))
                    or (season < 1933 and g.get("round") and g.get("score"))):
                # The played-off division title (1941, 1943, 1947, 1950, 1952,
                # 1957, 1958, 1963 AFL, 1965, 1968 AFL), and the 1932 title
                # game (the ledger's only pre-1933 row with a round, filed as
                # a regular game because the record counted it): kept for the
                # file's `tiebreaks`, never counted in the standings here.
                hs, as_ = (int(x) for x in g["score"].split("-"))
                tiebreaks.append({"home": g["home_key"], "away": g["away_key"], "score": g["score"],
                                  "date": g.get("date"), "winner": g["home_key"] if hs > as_ else g["away_key"]})
                continue
            if g.get("playoff") or not g.get("result") or not g.get("score") or not isinstance(g.get("week"), int):
                continue
            hs, as_ = (int(x) for x in g["score"].split("-"))
            games.append(Game(g["week"], g["home_key"], g["away_key"], hs, as_))
    else:
        up = _upcoming_for(season)
        if up is None:
            raise SystemExit(f"{season}: no ledger and upcoming.json is not for this season")
        for g in up["schedule"]:
            if g.get("phase") != "Reg. Season" or g.get("home_pts") is None or g.get("away_pts") is None:
                continue
            if not isinstance(g.get("week"), int):
                continue
            games.append(Game(g["week"], g["home"], g["away"], int(g["home_pts"]), int(g["away_pts"])))
    reg_end = shard.get("reg_end_week", {}).get("NFL") or max((g.week for g in games), default=0)
    for tb in tiebreaks:
        tb["div"] = teams[tb["home"]].div if tb["home"] in teams else None
    return shard, teams, games, reg_end, tiebreaks


def build(season: int) -> dict:
    if season < FIRST_SEASON:
        raise SystemExit(f"{season}: seeds are built from {FIRST_SEASON} on (see the module docstring)")
    shard, teams, games, reg_end, tiebreaks = load_season(season)
    if not teams or not games:
        raise SystemExit(f"{season}: no teams or no games")
    played_through = max((g.week for g in games), default=0)
    if played_through == 0:
        raise SystemExit(f"{season}: no regular-season game played yet; nothing to seed")
    # A finished season runs to the ledger's last regular-season week whatever
    # the shard says the schedule was (2001: the shard says 18 for the week
    # moved after 11 September, the ledger numbers the games as played).
    last = played_through if shard.get("complete") else min(reg_end, played_through)
    if shard.get("complete"):
        reg_end = last
    weeks: dict[str, dict] = {}
    notes_all: dict[str, list[str]] = {}
    for w in range(1, last + 1):
        notes: list[str] = []
        pic = picture(teams, [g for g in games if g.week <= w], season, notes)
        weeks[str(w)] = pic
        if notes:
            notes_all[str(w)] = notes
    pools = sorted({t.pool(season) for t in teams.values()})
    per_pool = {}
    for pool in pools:
        members = [n for n, t in teams.items() if t.pool(season) == pool]
        divs = sorted({teams[n].div for n in members})
        q, nseeds = pool_format(season, teams[members[0]].league, len(divs))
        per_pool[pool] = {"seeds": nseeds, "per_division": q, "divisions": len(divs)}
    per_team = {}
    for n in teams:
        per_team[n] = {
            "conf": teams[n].pool(season),
            "div": teams[n].div,
            "seed": [weeks[str(w)][n]["seed"] for w in range(1, last + 1)],
            "dr": [weeks[str(w)][n]["dr"] for w in range(1, last + 1)],
            "cr": [weeks[str(w)][n]["cr"] for w in range(1, last + 1)],
        }
        if season < 1970:
            per_team[n]["tie"] = [bool(weeks[str(w)][n].get("tie")) for w in range(1, last + 1)]
    label = "seed" if season >= 1970 else ("place" if season >= 1933 else "leader")
    return {
        "season": season,
        "seeds_per_conf": max(v["seeds"] for v in per_pool.values()),
        "pools": per_pool,
        "label": label,
        "reg_end_week": reg_end,
        "through_week": last,
        "complete": last >= reg_end,
        "note": ("If the season ended after that week: division rank (dr), rank in the pool the team "
                 "qualifies from (cr: the conference from 1970, the league before) and seed or place by "
                 "the tiebreaking procedure of the era; net touchdowns skipped, a level coin toss goes to "
                 "the club first by name and is listed under notes. Before 1970 a tied division title was "
                 "played off; before 1972 the percentage excludes ties; before 1975 the divisional round's "
                 "home fields rotated, so the 1970-74 seed is a ranking by record."),
        "teams": per_team,
        "notes": notes_all,
        # The played-off titles, so the page can show the playoff as one more
        # column after the last week: winner in, loser out.
        # Only a game between two clubs the final week left level counts:
        # the 1969 AFL's divisional round is labelled "Div. Playoff" too.
        "tiebreaks": [tb for tb in tiebreaks
                      if shard.get("complete") and season < 1970
                      and per_team.get(tb["home"], {}).get("tie", [False])[-1]
                      and per_team.get(tb["away"], {}).get("tie", [False])[-1]],
    }


def write(season: int, data: dict) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    p = os.path.join(OUT_DIR, f"{season}.json")
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
        f.write("\n")
    return p


def seasons_available() -> list[int]:
    ys = set()
    for p in glob.glob(os.path.join(LEDGER_DIR, "season-*.json")):
        y = int(os.path.basename(p)[7:11])
        if y >= FIRST_SEASON and os.path.exists(os.path.join(SHARD_DIR, f"{y}.json")):
            ys.add(y)
    # The live season, from upcoming.json, once it has a played game.
    if os.path.exists(UPCOMING):
        with open(UPCOMING, encoding="utf-8") as f:
            up = json.load(f)
        y = up.get("season")
        if isinstance(y, int) and y >= FIRST_SEASON and os.path.exists(os.path.join(SHARD_DIR, f"{y}.json")) \
                and any(g.get("home_pts") is not None for g in up.get("schedule", [])):
            ys.add(y)
    return sorted(ys)


# --------------------------------------------------------------------------
# verification against the shard's final seeds
# --------------------------------------------------------------------------

def verify(seasons: list[int]) -> int:
    bad = 0
    for y in seasons:
        shard, teams, games, reg_end, _tb = load_season(y)
        if not shard.get("complete"):
            continue
        data = build(y)
        if not data["complete"]:
            print(f"{y}: regular season not complete in the ledger, skipped")
            continue
        expected = {t["name"]: t.get("seed") for t in shard["teams"] if t.get("seed")}
        corrected = KNOWN_SHARD_SEED_ERRORS.get(y, {})
        expected.update(corrected)
        got = {n: v["seed"][-1] for n, v in data["teams"].items() if v["seed"][-1]}
        n_notes = sum(len(v) for v in data["notes"].values())
        diff = []
        if expected:
            for n in sorted(set(expected) | set(got)):
                if expected.get(n) != got.get(n):
                    diff.append(f"{n}: shard {expected.get(n)} vs computed {got.get(n)}")
            what = f"{len(got)} seeds match the shard"
        else:
            # No seeds in the shard (before 1975): the set of qualifiers against
            # the shard's playoff-appearance flags. A club the shard says went to
            # the playoffs but the procedure left out is usually a tied division
            # title that was played off (1941, 1943, 1947, 1950, 1952, 1957,
            # 1958, 1965, AFL 1963 and 1968) or, before 1933, the champion by
            # standings; those are listed, not counted as failures.
            apps = {t["name"] for t in shard["teams"] if (t.get("flags") or {}).get("play_app")} \
                or {t["name"] for t in shard["teams"] if (t.get("flags") or {}).get("champ")}
            missing = sorted(set(got) - apps)
            extra = sorted(apps - set(got))
            diff = [f"{n}: computed in, shard has no appearance" for n in missing]
            if y < 1933 and diff:
                # 1921 (Buffalo and Chicago at .900, the league ruled for
                # Chicago) and 1925 (Pottsville stripped of the title): the
                # standings leader is the point of the exercise, so these are
                # listed, not counted.
                for d in diff:
                    print(f"    {y} note: {d} (the title was the league's ruling, not the standings)")
                diff = []
            for n in extra:
                print(f"    {y} note: {n} reached the playoffs but the procedure placed another club (played off?)")
            what = f"{len(got)} qualifiers within the shard's {len(apps)} appearances"
        if diff:
            bad += 1
            print(f"{y}: MISMATCH ({len(diff)})")
            for d in diff:
                print("   ", d)
        else:
            tag = f" (shard corrected for {', '.join(corrected)})" if corrected else ""
            print(f"{y}: OK, {what}{tag}; {n_notes} name-order notes across the season")
    return bad


# --------------------------------------------------------------------------
# self-test on hand-built fixtures
# --------------------------------------------------------------------------

def self_test() -> None:
    def T(n, conf, div):
        return Team(n, conf, div)

    teams = {n: T(n, "AFC", "AFC East") for n in ["A", "B", "C", "D"]}
    teams.update({n: T(n, "AFC", "AFC West") for n in ["E", "F", "G", "H"]})
    teams.update({n: T(n, "NFC", "NFC East") for n in ["I", "J", "K", "L"]})
    teams.update({n: T(n, "NFC", "NFC West") for n in ["M", "N", "O", "P"]})

    # 1. two-club division tie: head-to-head decides
    games = [Game(1, "A", "B", 20, 10), Game(2, "A", "C", 3, 7), Game(2, "B", "D", 30, 0)]
    # A 1-1, B 1-1, C 1-0, D 0-1 -> C first (1.000), then A over B on head-to-head
    notes: list[str] = []
    pic = picture(teams, games, 2024, notes)
    assert pic["C"]["dr"] == 1 and pic["A"]["dr"] == 2 and pic["B"]["dr"] == 3, pic
    # the clubs that have not played are level by name and say so; A and B were not
    assert not any("A, B" in n for n in notes), notes

    # 2. three-club division tie, head-to-head among the three: B beat A and C, A beat C
    games = [Game(1, "B", "A", 21, 14), Game(2, "B", "C", 21, 14), Game(3, "A", "C", 21, 14),
             Game(4, "A", "D", 10, 20), Game(4, "B", "D", 10, 20), Game(4, "C", "D", 10, 20),
             Game(5, "A", "E", 30, 0), Game(5, "B", "F", 30, 0), Game(5, "C", "G", 30, 0)]
    # A 2-2, B 2-2, C 2-2? B: beat A, beat C, lost D, beat F = 3-1. Recount:
    # A: lost B, beat C, lost D, beat E = 2-2; B = 3-1; C: lost B, lost A, lost D, beat G = 1-3; D 3-0
    notes = []
    pic = picture(teams, games, 2024, notes)
    assert [n for n in "ABCD" if pic[n]["dr"] == 1] == ["D"], pic
    assert pic["B"]["dr"] == 2 and pic["A"]["dr"] == 3 and pic["C"]["dr"] == 4

    # 3. wild card, two clubs from different divisions, no head-to-head: conference record decides
    games = [Game(1, "A", "E", 20, 10),   # A beat E (conf game)
             Game(1, "B", "I", 20, 10),   # B beat I (non-conf)
             Game(2, "A", "I", 10, 20),   # A lost to I (non-conf)
             Game(2, "B", "E", 10, 20),   # B lost to E (conf)
             Game(1, "C", "J", 30, 0), Game(1, "D", "K", 0, 30), Game(1, "F", "L", 30, 0),
             Game(1, "G", "M", 0, 30), Game(1, "H", "N", 0, 30)]
    notes = []
    pic = picture(teams, games, 2024, notes)
    # AFC East: C 1-0 wins; A and B both 1-1 -> A conference record 1-0 beats B's 0-1
    assert pic["C"]["dr"] == 1 and pic["A"]["dr"] == 2 and pic["B"]["dr"] == 3, pic
    # Seeds: division winners C (1-0) and, AFC West, E (1-1) or F (1-0): F 1-0 wins the West.
    assert pic["F"]["seed"] in (1, 2) and pic["C"]["seed"] in (1, 2)
    assert pic["A"]["seed"] == 3, pic["A"]   # best non-winner in the AFC

    # 4. the coin-toss stand-in leaves a note
    games = [Game(1, "A", "I", 20, 10), Game(1, "B", "J", 20, 10)]
    notes = []
    pic = picture(teams, games, 2024, notes)
    assert pic["A"]["dr"] == 1 and pic["B"]["dr"] == 2
    assert any("level on every step" in n for n in notes), notes

    # 5. seven seeds from 2020, six before
    assert seeds_per_conf(2019) == 6 and seeds_per_conf(2020) == 7
    print("playoff_seeds self-test: OK")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args(argv)
    if a.self_test:
        self_test()
        return 0
    seasons = [a.season] if a.season else seasons_available() if (a.all or a.verify) else []
    if not seasons:
        ap.error("give --season YYYY, --all, --verify or --self-test")
    if a.verify:
        return 1 if verify(seasons) else 0
    for y in seasons:
        data = build(y)
        n_notes = sum(len(v) for v in data["notes"].values())
        line = f"{y}: through week {data['through_week']} of {data['reg_end_week']}, {n_notes} notes"
        if a.write:
            line += f" -> {os.path.relpath(write(y, data), ROOT)}"
        else:
            last = data["through_week"]
            seeded = sorted(((v['seed'][-1], v['conf'], n) for n, v in data["teams"].items() if v["seed"][-1]))
            line += " | " + " ".join(f"{c[:1]}{s}:{n}" for s, c, n in seeded)
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
