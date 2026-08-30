#!/usr/bin/env python3
"""NFL Program 2026: official standings metrics + tiebreaker ladders.

Computes every column GSIS's own standings page carries (Ashwin's account
export, 2026-08-30, is the golden fixture) -- these are the OFFICIAL
tiebreaking statistics:

  overall / division / conference records (ties count half),
  head-to-head, common-games record and net points (vs a named rival),
  strength of victory (pct + combined opponent wins),
  strength of schedule (pct + combined opponent wins),
  combined conference rank in points scored + points allowed,
  combined league rank in points scored + points allowed,
  net points (overall, common games, conference games), net touchdowns.

And applies the official ladders:
  division ladder: H2H, division, common games, conference, SOV, SOS,
    conf combined rank, league combined rank, net pts common, net pts all,
    net TDs, coin toss.
  wild-card ladder (clubs from different divisions; division-mates are
    reduced by the division ladder first): H2H (sweep for 3+), conference,
    common games (minimum 4), SOV, SOS, conf combined rank, league combined
    rank, net pts in conference games, net pts all, net TDs, coin toss.

Era notes, on the record:
  - The CURRENT_ALIGNMENT below is the 2002-realignment map (source: the
    NFL_all.xlsx Lookup sheet, cols N-U). For pre-2002 seasons pass an
    era-correct alignment (Year by Year carries it); the metric math is
    era-independent.
  - The LADDER ITSELF evolved over history. Applying today's ladder to old
    seasons is fine for ANALYSIS, but never re-adjudicate a historical seed
    with it -- historical outcomes are recorded facts in the workbook.
  - Net touchdowns needs per-game TD counts: nflverse pbp (td_team) for
    1999+, gamebook team statistics ("TOUCHDOWNS" row) for 1981-1998.
  - Coin-toss steps are returned as ties (decided=None); the simulator
    randomizes them, a display never needs to.

Inputs are plain dicts so any caller (sim, backtest, page builder) can feed
it: game = {home, away, home_score, away_score, home_tds, away_tds}
(keys are canonical franchise nicknames, the workbook DN vocabulary).

    python nfl_standings.py --self-test
    python nfl_standings.py --golden FIXTURE GAMES_JSON BOX_JSON
"""
import json
import re
import sys
from collections import defaultdict

# 2002-present alignment; source: NFL_all.xlsx Lookup N-U (read 2026-08-30).
CURRENT_ALIGNMENT = {
    "Bills": ("AFC", "AFC East"), "Dolphins": ("AFC", "AFC East"),
    "Patriots": ("AFC", "AFC East"), "Jets": ("AFC", "AFC East"),
    "Ravens": ("AFC", "AFC North"), "Bengals": ("AFC", "AFC North"),
    "Browns": ("AFC", "AFC North"), "Steelers": ("AFC", "AFC North"),
    "Texans": ("AFC", "AFC South"), "Colts": ("AFC", "AFC South"),
    "Jaguars": ("AFC", "AFC South"), "Titans": ("AFC", "AFC South"),
    "Broncos": ("AFC", "AFC West"), "Chiefs": ("AFC", "AFC West"),
    "Raiders": ("AFC", "AFC West"), "Chargers": ("AFC", "AFC West"),
    "Cowboys": ("NFC", "NFC East"), "Giants": ("NFC", "NFC East"),
    "Eagles": ("NFC", "NFC East"), "Commanders": ("NFC", "NFC East"),
    "Bears": ("NFC", "NFC North"), "Lions": ("NFC", "NFC North"),
    "Packers": ("NFC", "NFC North"), "Vikings": ("NFC", "NFC North"),
    "Falcons": ("NFC", "NFC South"), "Panthers": ("NFC", "NFC South"),
    "Saints": ("NFC", "NFC South"), "Buccaneers": ("NFC", "NFC South"),
    "Cardinals": ("NFC", "NFC West"), "Rams": ("NFC", "NFC West"),
    "49ers": ("NFC", "NFC West"), "Seahawks": ("NFC", "NFC West"),
}
# Workbook DN vocabulary: the Washington franchise key.
ALIGN_ALIASES = {"Redskins": "Commanders", "Football Team": "Commanders"}


class Rec:
    __slots__ = ("w", "l", "t")

    def __init__(self):
        self.w = self.l = self.t = 0

    def add(self, pf, pa):
        if pf > pa:
            self.w += 1
        elif pf < pa:
            self.l += 1
        else:
            self.t += 1

    @property
    def games(self):
        return self.w + self.l + self.t

    @property
    def pct(self):
        g = self.games
        return 0.0 if g == 0 else (self.w + 0.5 * self.t) / g

    @property
    def half_wins(self):
        return self.w + 0.5 * self.t

    def wlt(self):
        return f"{self.w}-{self.l}-{self.t}"


class Standings:
    """All official metrics for one set of regular-season games."""

    def __init__(self, games, alignment=None):
        self.alignment = dict(alignment or CURRENT_ALIGNMENT)
        for alias, canon in ALIGN_ALIASES.items():
            if canon in self.alignment:
                self.alignment.setdefault(alias, self.alignment[canon])
        self.games = list(games)
        self.overall = defaultdict(Rec)
        self.division = defaultdict(Rec)
        self.conference = defaultdict(Rec)
        self.pf = defaultdict(int)
        self.pa = defaultdict(int)
        self.tds = defaultdict(int)
        self.tds_allowed = defaultdict(int)
        self.opponents = defaultdict(list)     # per game, repeats kept
        self.defeated = defaultdict(list)      # per win, repeats kept
        self.conf_net_pts = defaultdict(int)
        self.results = {}                      # (a,b) -> [(pf_a, pa_a), ...]
        for g in self.games:
            h, a = g["home"], g["away"]
            hs, as_ = g["home_score"], g["away_score"]
            for team, opp, pf, pa, tdf, tda in (
                    (h, a, hs, as_, g.get("home_tds"), g.get("away_tds")),
                    (a, h, as_, hs, g.get("away_tds"), g.get("home_tds"))):
                self.overall[team].add(pf, pa)
                self.pf[team] += pf
                self.pa[team] += pa
                if tdf is not None:
                    self.tds[team] += tdf
                    self.tds_allowed[team] += tda or 0
                self.opponents[team].append(opp)
                if pf > pa:
                    self.defeated[team].append(opp)
                same_conf = self._conf(team) == self._conf(opp)
                if same_conf:
                    self.conference[team].add(pf, pa)
                    self.conf_net_pts[team] += pf - pa
                if same_conf and self._div(team) == self._div(opp):
                    self.division[team].add(pf, pa)
                self.results.setdefault((team, opp), []).append((pf, pa))
        self.teams = sorted(self.overall)
        self._ranks = None

    def _conf(self, t):
        return self.alignment[t][0]

    def _div(self, t):
        return self.alignment[t][1]

    # ---- derived metrics -------------------------------------------------

    def net_pts(self, t):
        return self.pf[t] - self.pa[t]

    def net_tds(self, t):
        return self.tds[t] - self.tds_allowed[t]

    def _strength(self, opponent_list):
        wins = sum(self.overall[o].half_wins for o in opponent_list)
        games = sum(self.overall[o].games for o in opponent_list)
        pct = 0.0 if games == 0 else wins / games
        return pct, wins

    def sov(self, t):
        return self._strength(self.defeated[t])

    def sos(self, t):
        return self._strength(self.opponents[t])

    def combined_rank(self, t, conference_only):
        """Rank in points scored (desc) + rank in points allowed (asc);
        competition ranking (ties share the better rank); lower sum wins."""
        group = [x for x in self.teams
                 if not conference_only or self._conf(x) == self._conf(t)]
        score_rank = 1 + sum(1 for x in group if self.pf[x] > self.pf[t])
        allow_rank = 1 + sum(1 for x in group if self.pa[x] < self.pa[t])
        return score_rank + allow_rank

    def h2h(self, a, b):
        rec = Rec()
        for pf, pa in self.results.get((a, b), []):
            rec.add(pf, pa)
        return rec

    def common_opponents(self, teams):
        sets = [set(self.opponents[t]) - set(teams) for t in teams]
        common = set.intersection(*sets) if sets else set()
        return common

    def record_vs(self, t, opps):
        rec = Rec()
        net = 0
        for g in self.games:
            for me, other, pf, pa in ((g["home"], g["away"], g["home_score"], g["away_score"]),
                                      (g["away"], g["home"], g["away_score"], g["home_score"])):
                if me == t and other in opps:
                    rec.add(pf, pa)
                    net += pf - pa
        return rec, net

    def row(self, t):
        sov_pct, sov_w = self.sov(t)
        sos_pct, sos_w = self.sos(t)
        return {
            "team": t,
            "overall": self.overall[t].wlt(),
            "division": self.division[t].wlt(),
            "conference": self.conference[t].wlt(),
            "pct": round(self.overall[t].pct, 5),
            "sov_pct": round(sov_pct, 3), "sov_wins": sov_w,
            "sos_pct": round(sos_pct, 3), "sos_wins": sos_w,
            "conf_rank": self.combined_rank(t, True),
            "overall_rank": self.combined_rank(t, False),
            "net_pts": self.net_pts(t),
            "net_tds": self.net_tds(t),
        }

    # ---- ladders ---------------------------------------------------------

    def _steps(self, kind, tied):
        """Yields (name, {team: value}) with HIGHER value better."""
        multi = len(tied) > 2
        if kind == "division":
            common = self.common_opponents(tied)

            def common_pct(t):
                rec, _ = self.record_vs(t, common)
                return rec.pct
            yield "head-to-head", self._h2h_values(tied, multi)
            yield "division record", {t: self.division[t].pct for t in tied}
            yield "common games", {t: common_pct(t) for t in tied}
            yield "conference record", {t: self.conference[t].pct for t in tied}
            yield "strength of victory", {t: self.sov(t)[0] for t in tied}
            yield "strength of schedule", {t: self.sos(t)[0] for t in tied}
            yield "conf points rank", {t: -self.combined_rank(t, True) for t in tied}
            yield "league points rank", {t: -self.combined_rank(t, False) for t in tied}
            yield "net pts common", {t: self.record_vs(t, common)[1] for t in tied}
            yield "net pts overall", {t: self.net_pts(t) for t in tied}
            yield "net tds", {t: self.net_tds(t) for t in tied}
        else:
            common = self.common_opponents(tied)
            enough = all(self.record_vs(t, common)[0].games >= 4 for t in tied)
            yield "head-to-head", self._h2h_values(tied, multi, sweep=multi)
            yield "conference record", {t: self.conference[t].pct for t in tied}
            if enough:
                yield "common games", {t: self.record_vs(t, common)[0].pct for t in tied}
            yield "strength of victory", {t: self.sov(t)[0] for t in tied}
            yield "strength of schedule", {t: self.sos(t)[0] for t in tied}
            yield "conf points rank", {t: -self.combined_rank(t, True) for t in tied}
            yield "league points rank", {t: -self.combined_rank(t, False) for t in tied}
            yield "net pts conference", {t: self.conf_net_pts[t] for t in tied}
            yield "net pts overall", {t: self.net_pts(t) for t in tied}
            yield "net tds", {t: self.net_tds(t) for t in tied}

    def _h2h_values(self, tied, multi, sweep=False):
        vals = {}
        for t in tied:
            rec = Rec()
            for o in tied:
                if o == t:
                    continue
                for pf, pa in self.results.get((t, o), []):
                    rec.add(pf, pa)
            if rec.games == 0:
                vals[t] = None       # not applicable
            elif sweep:
                # 3+ clubs wild card: applies only to a club that swept or
                # was swept by ALL the others
                played_all = all(self.results.get((t, o)) for o in tied if o != t)
                if played_all and rec.l == 0 and rec.t == 0:
                    vals[t] = 1.0
                elif played_all and rec.w == 0 and rec.t == 0:
                    vals[t] = -1.0
                else:
                    vals[t] = None
            else:
                vals[t] = rec.pct
        if all(v is None for v in vals.values()):
            return None
        return vals

    def _apply_ladder(self, kind, tied):
        """Best club among `tied` (already one per division for wild card).
        Returns (winner or None, step_name or None)."""
        tied = list(tied)
        while len(tied) > 1:
            progressed = False
            for name, vals in self._steps(kind, tied):
                if vals is None:
                    continue
                usable = {t: v for t, v in vals.items() if v is not None}
                if len(usable) < len(tied):
                    if not usable:
                        continue
                    # sweep semantics: a lone +1 wins, a lone -1 is dropped
                    if 1.0 in usable.values() and list(usable.values()).count(1.0) == 1:
                        w = next(t for t, v in usable.items() if v == 1.0)
                        return w, name
                    dropped = [t for t, v in usable.items() if v == -1.0]
                    if dropped and len(dropped) < len(tied):
                        tied = [t for t in tied if t not in dropped]
                        progressed = True
                        break
                    continue
                best = max(usable.values())
                leaders = [t for t, v in usable.items() if v == best]
                if len(leaders) == 1:
                    return leaders[0], name
                if len(leaders) < len(tied):
                    tied = leaders       # 3+ reduced: restart the ladder
                    progressed = True
                    break
            if not progressed:
                return None, None        # coin toss territory
        return tied[0], None

    def break_tie(self, teams, kind="division"):
        """Order a set of tied clubs, worst-last. kind: division|wildcard.
        Wild card reduces division-mates via the division ladder first, per
        the official procedure. Returns [(team, decided_by)]."""
        remaining = list(teams)
        ordered = []
        while len(remaining) > 1:
            pool = remaining
            if kind == "wildcard":
                by_div = defaultdict(list)
                for t in remaining:
                    by_div[self._div(t)].append(t)
                pool = []
                for div_teams in by_div.values():
                    if len(div_teams) == 1:
                        pool.append(div_teams[0])
                    else:
                        w, _ = self._apply_ladder("division", div_teams)
                        pool.append(w or sorted(div_teams)[0])
            winner, step = self._apply_ladder(kind, pool)
            if winner is None:
                winner, step = sorted(pool)[0], None   # coin toss: flagged
            ordered.append((winner, step))
            remaining.remove(winner)
        ordered.append((remaining[0], None))
        return ordered

    def order_group(self, teams, kind):
        """Full ordering: sort by pct, break exact-pct ties with the ladder."""
        by_pct = defaultdict(list)
        for t in teams:
            by_pct[round(self.overall[t].pct, 6)].append(t)
        out = []
        for pct in sorted(by_pct, reverse=True):
            group = by_pct[pct]
            if len(group) == 1:
                out.append((group[0], None))
            else:
                out.extend(self.break_tie(group, kind))
        return out

    def seed_conference(self, conf):
        """Seeds 1-7: division winners by ladder, then wild cards."""
        divs = defaultdict(list)
        for t in self.teams:
            if self._conf(t) == conf:
                divs[self._div(t)].append(t)
        winners, rest = [], []
        for div_teams in divs.values():
            ordered = self.order_group(div_teams, "division")
            winners.append(ordered[0][0])
            rest.extend(t for t, _ in ordered[1:])
        seeded = [t for t, _ in self.order_group(winners, "wildcard")]
        wilds = [t for t, _ in self.order_group(rest, "wildcard")][:3]
        return seeded + wilds
