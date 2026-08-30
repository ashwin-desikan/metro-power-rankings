#!/usr/bin/env python3
"""Build public/data/rugby-union/top-games.json — the Rugby Union Greatest Games ranking.

Ranks every men's international test (OtherLeagues.xlsx "Rugby Union - Intl Results",
1871->today) by a computed Game Score = closeness + stakes + quality, where quality is
each side's strength on the day from a CONTINUOUS Elo rating built over the whole history
(so pre-2003 matches, before the official World Rugby rankings existed, sit on the same
scale). A curated date-keyed FLOOR lifts a set of all-time classics whose greatness is
narrative or an upset rather than margin (mirrors the cricket engine's "option b" floor).
A curated PINS table places a handful of matches at an exact rank, which a floor cannot
do: a floor is a number, and no number means "eleventh". Pinned rows are re-spaced
between their new neighbours so the printed score never contradicts the printed order.

Emits: top (50), by_team (top 12 per nation), by_decade (top 12 per decade).
Western Samoa is merged into Samoa; Cote d'Ivoire -> ivory-coast to match teams.json.

Run natively (openpyxl cannot read this workbook inside the Cowork sandbox):
    python scripts/rugby/build_rugby_top_games.py
Optional args: <OtherLeagues.xlsx> <out_json>
"""
import json, re, sys, unicodedata, collections, datetime
import os, time, urllib.request, urllib.parse

_SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
           or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
_SB_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
           or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

def _sb(table, select, order="id"):
    out, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select": select, "order": order, "limit": step, "offset": off})
        req = urllib.request.Request(f"{_SB_URL}/rest/v1/{table}?{q}",
                                     headers={"apikey": _SB_KEY, "Authorization": f"Bearer {_SB_KEY}"})
        for _t in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as rr:
                    batch = json.load(rr); break
            except Exception:
                if _t == 3: raise
                time.sleep(2)
        out += batch
        if len(batch) < step:
            return out
        off += step

HERE = __file__
REPO = re.sub(r"[\\/]scripts[\\/]rugby[\\/].*$", "", HERE.replace("\\", "/"))
WB   = sys.argv[1] if len(sys.argv) > 1 else f"{REPO}/OtherLeagues.xlsx"
OUT  = sys.argv[2] if len(sys.argv) > 2 else f"{REPO}/public/data/rugby-union/top-games.json"
SHEET = "Rugby Union - Intl Results"
TODAY = datetime.date.today()

def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    sg = re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")
    return {"cote-d-ivoire": "ivory-coast", "western-samoa": "samoa"}.get(sg, sg)

MERGE = {"Western Samoa": "Samoa", "Ivory Coast": "Côte d'Ivoire"}

def load_matches():
    seen, M = set(), []
    for r in _sb("rugby_results",
                 "date,team,wld,opp,pf,pa,comp,stage,city,country,home_away,"
                 "rugby_world_cup,home_five_six_nations,tri_nations_rugby_champ,nations_championship"):
        t, o = r["team"], r["opp"]
        if not t or not o: continue
        t = MERGE.get(str(t), str(t)); o = MERGE.get(str(o), str(o))
        ds = str(r["date"])
        if len(ds) != 8: continue
        d = datetime.date(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
        if d > TODAY: continue
        wld = str(r["wld"] or "")
        pf = int(r["pf"] or 0); pa = int(r["pa"] or 0)
        if wld not in ("W", "L", "D") or (pf == 0 and pa == 0): continue
        key = (d, frozenset((t, o)))
        if key in seen: continue
        seen.add(key)
        M.append(dict(d=d, team=t, opp=o, wld=wld, pf=pf, pa=pa, margin=abs(pf - pa),
            comp=str(r["comp"] or ""), stage=str(r["stage"] or ""),
            rwc=bool(r["rugby_world_cup"]), six=bool(r["home_five_six_nations"]),
            tri=bool(r["tri_nations_rugby_champ"]), nc=bool(r["nations_championship"]),
            home=str(r["home_away"] or ""), city=str(r["city"] or ""),
            country=str(r["country"] or "")))
    M.sort(key=lambda m: m["d"])
    return M

def elo(M):
    R = collections.defaultdict(lambda: 1500.0); HFA = 60.0
    for m in M:
        a, b = m["team"], m["opp"]; ra, rb = R[a], R[b]
        adj = -HFA if m["home"] == "Home" else (HFA if m["home"] == "Away" else 0.0)
        Ea = 1 / (1 + 10 ** ((rb - ra + adj) / 400.0))
        Sa = 1.0 if m["wld"] == "W" else (0.5 if m["wld"] == "D" else 0.0)
        K = 40.0 * (1.5 if m["rwc"] else 1.0); mov = 1 + min(m["margin"], 40) / 40.0 * 0.75
        # `ea` is kept on the match so upset() reuses the SAME expectation the
        # rating update used, home advantage included. Recomputing it later from
        # ra/rb alone would silently drop the 60-point HFA.
        dl = K * mov * (Sa - Ea)
        m["ra"], m["rb"], m["ea"], m["sa"] = ra, rb, Ea, Sa
        R[a] = ra + dl; R[b] = rb - dl

D = datetime.date
FLOORS = {
 (D(2000,7,15), frozenset({"australia","new-zealand"})): 95,
 (D(2015,9,19), frozenset({"south-africa","japan"})): 94,
 (D(2023,10,15), frozenset({"france","south-africa"})): 92,
 (D(1999,10,31), frozenset({"france","new-zealand"})): 92,
 (D(2013,10,5), frozenset({"south-africa","new-zealand"})): 88,
 (D(2023,10,14), frozenset({"ireland","new-zealand"})): 90,
 (D(2015,10,18), frozenset({"australia","scotland"})): 86,
 (D(2007,9,29), frozenset({"wales","fiji"})): 88,
 (D(2019,3,16), frozenset({"england","scotland"})): 88,
 (D(2017,3,18), frozenset({"france","wales"})): 85,
 (D(2018,9,15), frozenset({"new-zealand","south-africa"})): 88,
 (D(1991,10,20), frozenset({"australia","ireland"})): 87,
 (D(2015,10,31), frozenset({"australia","new-zealand"})): 92,
}

# Exact ranks, set by hand. A FLOOR can only lift a match, and only to wherever
# its hand-set number happens to land once the model has moved underneath it;
# that is the right tool for "this belongs on the board" and the wrong one for
# "this is #11", because no floor value means eleventh. A PIN states the rank
# itself and survives every retune of the weights. The 1995 and 2003 finals were
# floored at 101 and 96 before this and are pinned now, so the two mechanisms do
# not fight over the same rows.
PINS = {
 (D(1995,6,24), frozenset({"south-africa","new-zealand"})): 1,    # RWC final, Ellis Park
 (D(2003,11,22), frozenset({"australia","england"})): 2,          # RWC final, extra time
 (D(2011,10,23), frozenset({"france","new-zealand"})): 11,        # RWC final, 8-7
}
# ---------------------------------------------------------------- tunables --
# The four things the score is trying to say: it was close, it mattered, it was
# good rugby between good sides, and the result was a shock. The first three are
# weighted terms; the last two are additive bonuses so that neither can DEMOTE a
# tight low-scoring final between two favourites, which is a real category of
# great match. Change these here rather than in the formula.
W_CLOSE, W_STAKES, W_QUALITY = 0.36, 0.36, 0.21
B_VOLUME = 7.0    # a fully open game (72+ points) is worth this much
B_UPSET = 15.0    # a 5%-chance winner is worth about this much

# How much the weaker side drags the quality term down. This used to be 0.55 on
# the weaker side, which is why a mismatch scored as a low-quality game even when
# one of the best teams in history was playing in it -- and why the greatest
# upset in the sport scored 66. Leaning on the mean instead is both fairer to
# upsets and a better description of what "quality" means.
Q_WEAKER, Q_MEAN = 0.45, 0.55


def norm(r): return max(0.0, min(1.15, (r - 1450) / 300.0))


def closeness(m):
    """How close it was, RELATIVE TO how much scoring there was.

    The old version was `1 - margin/28`, an absolute scale on which a 12-point
    margin scored 0.571 whatever the game. That is defensible in a 23-point
    final and wrong in a 74-point one: France beating New Zealand 43-31 in the
    1999 semi-final was a close game, and the model called it a blowout. The
    denominator now scales with the match total, with a floor so that a tight
    low-scoring final is still rewarded for being tight.
    """
    if m["wld"] == "D":
        return 0.95
    total = m["pf"] + m["pa"]
    return max(0.0, min(1.0, 1 - m["margin"] / max(16.0, 0.45 * total)))


def volume(m):
    """A proxy for open, attacking rugby: how much scoring there was.

    🔴 It IS a proxy. What this should measure is tries, lead changes and
    ball-in-play time, and none of those are in `rugby_results` -- the table
    carries date, teams, points, competition, stage and venue, and nothing
    about how the points were scored. Total points is the only signal
    available for the difference between a 39-35 Bledisloe and a 16-15
    kicking duel, so it is used, additively and capped, and it is not allowed
    to demote a tight final for the crime of being tight.
    """
    return max(0.0, min(1.0, ((m["pf"] + m["pa"]) - 32) / 40.0))
def stakes(m):
    if m["rwc"]:
        st = m["stage"].lower()
        if st == "final": return 1.0
        if "semi" in st: return 0.88
        if "quarter" in st: return 0.82
        if "bronze" in st: return 0.55
        return 0.68
    if m["tri"] or m["nc"]: return 0.60
    if m["six"]: return 0.55
    if "bledisloe" in m["comp"].lower(): return 0.62
    return 0.42
def upset(m):
    """How far the result beat the pre-match expectation, 0-1.

    THE DEFECT THIS FIXES. The quality term reads both sides' Elo, so the
    greatest upset in the sport's history is PENALISED for the very thing that
    made it great: South Africa 32-34 Japan scored 66 because Japan's rating was
    low, and only a hand-set floor of 94 kept it on the board at all. Eight of
    the top ten were floors, and the floors were concentrated on upsets, which
    is a model telling you what it cannot see.

    The Elo is already computed, so the pre-match win probability is free. A
    5%-chance winner scores 0.95; a favourite winning scores 0.

    🔴 This does NOT abolish the floors, and it was not tuned to. At a weight of
    12 it lifts Brighton by about 11 points, which moves it a long way up the
    board and still leaves it short of the #4 its floor buys. That placement is
    an editorial claim rather than a model output, and the run-time floor audit
    below now says so on every build instead of leaving it implicit.
    """
    return max(0.0, min(1.0, m["sa"] - m["ea"]))


def _respace(order):
    """Give every pinned row a score that agrees with where it now sits.

    Without this a pin would print a score out of order, and the page would look
    broken in exactly the way that destroys trust in a ranking. Runs of adjacent
    pins are spread evenly between the unpinned scores on either side.
    """
    n, i = len(order), 0
    while i < n:
        if not order[i].get("pin"):
            i += 1
            continue
        j = i
        while j < n and order[j].get("pin"):
            j += 1
        k = j - i
        lo = order[j]["gs"] if j < n else 0.0
        hi = order[i - 1]["gs"] if i > 0 else lo + (k + 1) * 1.0
        step = (hi - lo) / (k + 1)
        for t in range(k):
            order[i + t]["gs"] = round(hi - step * (t + 1), 2)
        i = j
    return order


def apply_pins(alls, pins=None):
    """Move pinned matches to their exact rank, in place, keeping order sane.

    `alls` comes in sorted by score. Pins are placed first, ascending by rank,
    with the unpinned board filling in around them; then the pinned scores are
    re-spaced. The model score is untouched in `base`, and the run-time audit
    prints the gap, so a pin can never pass itself off as a computed result.
    """
    pins = PINS if pins is None else pins
    if not pins:
        return alls
    want = {}
    for m in alls:
        r = pins.get((m["d"], frozenset({slug(m["team"]), slug(m["opp"])})))
        if r:
            want[r] = m
            m["pin"] = r
            m["ep"] = True          # a pin is an editorial claim; star it like a floor
    rest = [m for m in alls if not m.get("pin")]
    order, i = [], 0
    for r in sorted(want):
        while len(order) < r - 1 and i < len(rest):
            order.append(rest[i]); i += 1
        order.append(want[r])
    order.extend(rest[i:])
    _respace(order)
    alls[:] = order
    return alls


def badge(m):
    if m["rwc"]: return "RWC"
    if m["nc"]: return "NC"
    if m["tri"]: return "RC"
    if m["six"]: return "6N"
    return "TEST"

def main():
    M = load_matches(); elo(M)
    for m in M:
        cl = closeness(m); st = stakes(m); vol = volume(m); up = upset(m)
        q = Q_WEAKER * norm(min(m["ra"], m["rb"])) + Q_MEAN * norm((m["ra"] + m["rb"]) / 2)
        # Closeness used to be counted TWICE: once as a 0.38 term and again as a
        # (0.80 + 0.20*cl) multiplier on the whole score. Its marginal effect was
        # about 0.55 against 0.37 for stakes, so the stated "equal weights" were
        # not the weights being applied, and the board filled up with one-score
        # knockout grinds. The multiplier is gone and the weights are now what
        # they say they are, with scoring volume added as a small bonus on top.
        # Volume and upset are additive bonuses rather than weighted terms, so
        # neither can demote a tight low-scoring final for being tight or for
        # being between two favourites.
        gs = 100 * (W_CLOSE * cl + W_STAKES * st + W_QUALITY * q) + B_VOLUME * vol + B_UPSET * up
        fl = FLOORS.get((m["d"], frozenset({slug(m["team"]), slug(m["opp"])})))
        m["cl"], m["st"], m["q"], m["vol"], m["up"] = round(cl,3), round(st,3), round(q,3), round(vol,3), round(up,3)
        # `base` is the score before any floor, so the audit can show what the
        # model actually thinks and a redundant floor can be spotted and deleted.
        m["base"], m["gs"], m["ep"] = round(gs, 2), max(gs, fl) if fl else gs, bool(fl)
        m["floor"] = fl
    alls = sorted(M, key=lambda m: -m["gs"])
    apply_pins(alls)
    # MAX comes after the pins so the 0-100 `norm` column is scaled to the board
    # that actually gets published, not to a score a pin has since replaced.
    MAX = max(m["gs"] for m in M)

    def rec(m):
        return dict(comp=badge(m), date=m["d"].isoformat(),
            team=m["team"], teamSlug=slug(m["team"]), opp=m["opp"], oppSlug=slug(m["opp"]),
            winner=("" if m["wld"] == "D" else (m["team"] if m["wld"] == "W" else m["opp"])),
            pf=m["pf"], pa=m["pa"], draw=(m["wld"] == "D"),
            competition=m["comp"], stage=m["stage"], city=m["city"], country=m["country"],
            gs=round(m["gs"], 2), norm=round(100 * m["gs"] / MAX, 1), editorPick=m["ep"],
            cl=m["cl"], st=m["st"], q=m["q"], vol=m["vol"], up=m["up"],
            base=m["base"], floor=m["floor"], pin=m.get("pin"))
    top = [rec(m) for m in alls[:50]]
    teams = set(m["team"] for m in M) | set(m["opp"] for m in M)
    by_team = {}
    for tm in teams:
        tg = [m for m in alls if m["team"] == tm or m["opp"] == tm][:12]
        if tg: by_team[slug(tm)] = [rec(m) for m in tg]
    decs = sorted({f"{(m['d'].year//10)*10}s" for m in alls})
    by_decade = {dec: [rec(m) for m in alls if f"{(m['d'].year//10)*10}s" == dec][:12] for dec in decs}
    out = dict(generated=TODAY.isoformat(),
        method="continuous-elo + game-score (relative closeness/stakes/quality + volume and upset bonuses) + curated floors and rank pins",
        count=len(M), top=top, by_team=by_team, by_decade=by_decade)
    json.dump(out, open(OUT, "w"), indent=0)
    print(f"wrote {OUT}: {len(M)} matches, {len(by_team)} teams, {len(by_decade)} decades")
    report(alls)


def report(alls):
    """Print the board and audit the curated floors.

    Two questions this answers every run, so neither has to be asked again:
    what does the ranking actually look like, and how much of it is the model
    versus the hand-set FLOORS. A floor whose lift is 0 has been overtaken by
    the model and should be DELETED from FLOORS, not left to rot.
    """
    top = alls[:20]
    print()
    print("  #  date        matchup                              score    gs    base   cl    st    q     vol   up")
    for i, m in enumerate(top, 1):
        print("  %-2d %-11s %-36s %-8s %-5.1f %-6.1f %-5.3f %-5.3f %-5.3f %-5.2f %-5.2f%s" % (
            i, m["d"].isoformat(), ("%s v %s" % (m["team"], m["opp"]))[:36],
            "%d-%d" % (m["pf"], m["pa"]), m["gs"], m["base"],
            m["cl"], m["st"], m["q"], m["vol"], m["up"],
            ("  P%d" % m["pin"]) if m.get("pin") else ("  *" if m["ep"] else "")))

    pinned = [m for m in alls if m.get("pin")]
    if pinned:
        print()
        print("  PIN AUDIT: %d matches placed at an exact rank by hand" % len(pinned))
        for m in sorted(pinned, key=lambda x: x["pin"]):
            model = [i for i, x in enumerate(sorted(alls, key=lambda y: -y["base"]), 1) if x is m][0]
            print("    #%-3d %-11s %-36s model would rank #%-4d (score %.1f)"
                  % (m["pin"], m["d"].isoformat(),
                     ("%s v %s" % (m["team"], m["opp"]))[:36], model, m["base"]))

    floored = [m for m in alls if m.get("floor")]
    redundant = [m for m in floored if m["base"] >= m["floor"]]
    print()
    print("  FLOOR AUDIT: %d curated floors, %d of the top 10 floored"
          % (len(floored), sum(1 for m in top[:10] if m.get("floor"))))
    for m in sorted(floored, key=lambda x: -(x["gs"] - x["base"])):
        lift = m["gs"] - m["base"]
        note = "REDUNDANT - delete from FLOORS" if lift <= 0 else ""
        print("    %-11s %-36s floor %-5s model %-6.1f lift %+6.1f  %s"
              % (m["d"].isoformat(), ("%s v %s" % (m["team"], m["opp"]))[:36],
                 m["floor"], m["base"], lift, note))
    if redundant:
        print("    -> %d floor(s) the model has overtaken; removing them changes nothing"
              % len(redundant))

    t10 = top[:10]
    print()
    print("  TOP 10 SHAPE: %d/10 South Africa, %d/10 games of 50+ points, mean margin %.1f, %d nations"
          % (sum(1 for m in t10 if "South Africa" in (m["team"], m["opp"])),
             sum(1 for m in t10 if m["pf"] + m["pa"] >= 50),
             sum(m["margin"] for m in t10) / 10.0,
             len({t for m in t10 for t in (m["team"], m["opp"])})))


# ---------------------------------------------------------------- self-test --


def _self_test():
    """Cases drawn from the games the old scoring got wrong."""
    fails = []

    def g(pf, pa, wld="W"):
        return dict(pf=pf, pa=pa, margin=abs(pf - pa), wld=wld)

    ran = []

    def check(label, cond):
        ran.append(label)
        if not cond:
            fails.append(label)

    # A one-point World Cup final is still a one-point game. The relative scale
    # must not punish it for being low-scoring.
    check("tight final stays tight", closeness(g(11, 12)) > 0.9)
    # France 43-31 New Zealand, 1999: a 12-point margin in a 74-point game is
    # NOT a blowout, and the old absolute scale scored it 0.571.
    check("high-scoring 12-point game is not a blowout",
          closeness(g(43, 31)) > 0.60)
    # ...but a 17-point win in a 51-point final still is one.
    check("real blowout still scores low", closeness(g(34, 17)) < 0.35)
    check("draw is near-perfect", closeness(g(38, 38, "D")) == 0.95)
    check("closeness is bounded", 0.0 <= closeness(g(3, 145)) <= 1.0)

    # Volume separates an open game from a kicking duel, and only additively.
    check("kicking duel scores no volume", volume(g(15, 16)) < 0.05)
    check("open game scores volume", volume(g(43, 31)) > 0.9)
    check("volume is capped", volume(g(100, 90)) == 1.0)

    # The headline property: two one-point games, same stage, differ only by how
    # much rugby was played. The open one must now win.
    base = dict(st=0.85, q=1.0)
    duel = 100 * (0.36 * closeness(g(15, 16)) + 0.36 * base["st"] + 0.21 * base["q"]) + 7 * volume(g(15, 16))
    open_ = 100 * (0.36 * closeness(g(28, 29)) + 0.36 * base["st"] + 0.21 * base["q"]) + 7 * volume(g(28, 29))
    check("the open one-point game outranks the kicking duel", open_ > duel)

    # --- upset -------------------------------------------------------------
    def u(sa, ea):
        return upset(dict(sa=sa, ea=ea))

    # A 5%-chance side winning is the maximum-value case.
    check("huge upset scores near 1", u(1.0, 0.05) > 0.9)
    # A favourite winning is not an upset, and must not go negative.
    check("favourite winning scores 0", u(1.0, 0.95) < 0.06)
    check("favourite losing does not score", u(0.0, 0.95) == 0.0)
    # A draw against a strong favourite is a partial upset.
    check("draw against a favourite counts", 0.3 < u(0.5, 0.1) < 0.45)
    check("upset is bounded", 0.0 <= u(1.0, 0.0) <= 1.0)

    # What the bonus must actually do. NOT "every shock beats every good game":
    # a close, high-scoring final between two great sides is a great match and
    # should be allowed to win. What it must do is (a) move a shock a long way,
    # and (b) put a shock above the same fixture won by the favourite.
    def score(cl, st, q, vol, up):
        return (100 * (W_CLOSE * cl + W_STAKES * st + W_QUALITY * q)
                + B_VOLUME * vol + B_UPSET * up)

    # Brighton-shaped: a minnow beats a great side by two points.
    shock = score(0.93, 0.68, 0.41, 0.85, 0.95)
    routine = score(0.93, 0.68, 0.41, 0.85, 0.00)   # same game, favourite wins
    check("the shock is worth more than ten points over the routine win",
          shock - routine > 10)
    check("a shock outranks the same fixture won by the favourite", shock > routine)

    # ...and the quality term no longer buries a mismatch involving a great side.
    # Under the old 0.55-on-the-weaker-side split a 1900 v 1450 game scored 0.11.
    q_mismatch = Q_WEAKER * norm(1450) + Q_MEAN * norm((1900 + 1450) / 2)
    check("a great side against a minnow is no longer near-zero quality",
          q_mismatch > 0.35)
    check("two great sides still score top quality",
          Q_WEAKER * norm(1900) + Q_MEAN * norm(1900) > 1.1)

    # --- pins ---------------------------------------------------------------
    # A pin has to do three things or it is worse than useless: land the match
    # on the exact rank asked for, leave the printed scores in order, and keep
    # the model's own number visible in `base`.
    def board(n=12):
        return [dict(d=D(1900 + i, 1, 1), team="T%d" % i, opp="U%d" % i,
                     gs=100.0 - i, base=100.0 - i, ep=False) for i in range(n)]

    def key(m):
        return (m["d"], frozenset({slug(m["team"]), slug(m["opp"])}))

    def monotonic(b):
        return all(b[i]["gs"] >= b[i + 1]["gs"] for i in range(len(b) - 1))

    b = board(); last = b[-1]
    apply_pins(b, {key(last): 1})
    check("a pin promotes to the exact rank", b[0] is last)
    check("a promoted pin outscores the new second", b[0]["gs"] > b[1]["gs"])
    check("a pin leaves the model score in base", b[0]["base"] == 89.0)
    check("a promoted pin keeps the board monotonic", monotonic(b))

    # A pin must be able to DEMOTE too, which is the whole point of #11.
    b = board(); first = b[0]
    apply_pins(b, {key(first): 5})
    check("a pin demotes to the exact rank", b[4] is first)
    check("a demoted pin scores between its neighbours",
          b[3]["gs"] > b[4]["gs"] > b[5]["gs"])
    check("a demoted pin keeps the board monotonic", monotonic(b))

    # Two adjacent pins at the top is the live case (1995 at #1, 2003 at #2).
    b = board(); x, y = b[7], b[9]
    apply_pins(b, {key(x): 1, key(y): 2})
    check("adjacent pins both land", b[0] is x and b[1] is y)
    check("adjacent pins stay ordered and above the field",
          b[0]["gs"] > b[1]["gs"] > b[2]["gs"])
    check("adjacent pins keep the board monotonic", monotonic(b))
    check("a pin stars the row like a floor", b[0]["ep"] and b[1]["ep"])
    check("an unpinned match is left alone", not b[2].get("pin"))

    # And an empty table must be a no-op, so PINS can be emptied to see the
    # model's own board without editing any other code.
    b = board()
    check("no pins is a no-op", apply_pins(b, {}) == b and b[0]["gs"] == 100.0)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("build_rugby_top_games self-test OK (%d cases)" % len(ran))
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(_self_test())
    main()
