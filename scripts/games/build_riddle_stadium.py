#!/usr/bin/env python3
"""
build_riddle_stadium.py — pool builder for the "Riddle Stadium" game.

Short logic word problems in the classic reasoning-paper style, dressed in
match-day scenes and entirely original. Fully self-contained (no data
inputs). Three ramped levels, tagged `lvl`:

  L1  number chains      "Maya scored 3 more than Ben…" — follow the chain
  L2  finishing order    race clues -> unique finishing order (brute-forced)
  L3  who-plays-what     mini deduction grids and two-step chains (× then +)

Every puzzle is generated FROM a concrete hidden solution, then the clues
are checked by brute force: exactly one assignment/order satisfies them.
The self-test re-solves every puzzle independently. Deterministic: seeded RNG.

Writes public/play/games/pools/riddle-stadium.js  (window.GAME = {...}).
Run with --self-test to verify and emit nothing.
"""
import itertools, json, os, random, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("-") \
    else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rankings.citizenofnowhere.org"
random.seed(20260808)

NAMES = ["Amy", "Ben", "Cara", "Dan", "Ella", "Finn", "Gita", "Hugo", "Isla", "Jack",
         "Kofi", "Lena", "Maya", "Noah", "Omar", "Pia", "Rio", "Sam", "Tara", "Yara"]
THINGS = [("goals", "⚽"), ("laps", "🏃"), ("baskets", "🏀"), ("runs", "🏏"),
          ("saves", "🧤"), ("medals", "🏅"), ("stickers", "⭐"), ("lengths", "🏊")]
SPORTS = ["football", "cricket", "hockey", "tennis", "basketball", "swimming", "rugby", "netball"]
BGS = ["linear-gradient(180deg,#eaf4ff,#ffffff)", "linear-gradient(180deg,#fff3d6,#fffdf4)",
       "linear-gradient(180deg,#e3f9f2,#f7fffd)", "linear-gradient(180deg,#ffe9e3,#fff8f6)",
       "linear-gradient(180deg,#efe9ff,#faf8ff)"]
STAMPS = ["🧠", "🕵️", "🏟️", "💡", "🎯"]
ORDINAL = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}

FACES = ["🧒", "👧", "👦", "🧑", "👧🏽", "👦🏾", "🧒🏻", "👧🏿", "👦🏻", "🧑🏽", "👧🏻", "👦🏿"]
def face(name):
    return FACES[sum(ord(c) for c in name) % len(FACES)]

def card(f, name, items, unk=False, chip=None):
    return ('<span class="rcard"><span class="rface">%s</span><br><span class="rname">%s</span>'
            '<div class="ritems%s">%s</div>%s</span>') % (
        f, name, " unk" if unk else "", items,
        '<span class="rchip">%s</span>' % chip if chip else "")

def count_items(em, n):
    return em * n if n <= 10 else "%s ×%d" % (em, n)

def row(cards):
    return '<div class="rrow">%s</div>' % "".join(cards)

pool = []
def add(lvl, sub, scene, q, opts_texts, ans_index, fact, check, vis="", tile=False):
    """check: dict for the self-test re-solver."""
    opts = [{"t": t} for t in opts_texts]
    # engine expects ans as index into opts as authored (it shuffles display order)
    pool.append({
        "city": scene, "flag": "", "place": "Riddle Stadium",
        "sub": sub, "stamp": random.choice(STAMPS),
        "q": q, "opts": opts, "ans": ans_index, "fact": fact,
        "bg": random.choice(BGS), "lvl": lvl, "chk": check,
        "vis": vis, "tile": tile,
    })

def num_opts(ans):
    ds = []
    for c in (ans + 1, ans - 1, ans + 2, ans - 2, ans + 3):
        if c >= 0 and c != ans and c not in ds:
            ds.append(c)
        if len(ds) == 3: break
    return [str(ans)] + [str(d) for d in ds]

# ---------------------------------------------------------------- L1: number chains
def gen_chain():
    a, b, c = random.sample(NAMES, 3)
    thing, em = random.choice(THINGS)
    va = random.randint(5, 12)
    d1 = random.randint(2, 4); d2 = random.randint(2, 4)
    more1 = random.choice([True, False]); more2 = random.choice([True, False])
    vb = va + d1 if more1 else va - d1
    vc = vb + d2 if more2 else vb - d2
    if vb < 1 or vc < 1: return None
    ask = random.choice([(b, vb), (c, vc)])
    q = ("%s got %d %s. %s got %d %s than %s. %s got %d %s than %s. How many %s did %s get?" %
         (a, va, thing,
          b, d1, ("more" if more1 else "fewer"), a,
          c, d2, ("more" if more2 else "fewer"), b,
          thing, ask[0]))
    steps = "%s: %d. %s: %d %s %d = %d. %s: %d %s %d = %d." % (
        a, va, b, va, "+" if more1 else "-", d1, vb, c, vb, "+" if more2 else "-", d2, vc)
    vis = row([card(face(a), a, count_items(em, va)),
               card(face(b), b, "?", unk=True, chip="%s%d vs %s" % ("+" if more1 else "−", d1, a)),
               card(face(c), c, "?", unk=True, chip="%s%d vs %s" % ("+" if more2 else "−", d2, b))])
    return (1, "Level 1 · Follow the chain", em, q, num_opts(ask[1]), 0,
            "Follow the chain! " + steps,
            {"kind": "chain", "va": va, "d1": d1 if more1 else -d1, "d2": d2 if more2 else -d2,
             "ask": "b" if ask[0] == b else "c", "ans": ask[1]}, vis, True)

# ---------------------------------------------------------------- L2: finishing order
def order_clues(names, perm):
    """perm[i] = finishing position (0 = first) of names[i]; build 3 clue candidates."""
    pos = {n: p for n, p in zip(names, perm)}
    by_pos = sorted(names, key=lambda n: pos[n])
    clues = []
    n1, n2 = random.sample(names, 2)
    if pos[n1] > pos[n2]: n1, n2 = n2, n1
    clues.append(("%s finished ahead of %s." % (n1, n2), ("ahead", n1, n2)))
    mid = by_pos[random.choice([1, 2])]
    lo, hi = by_pos[0], by_pos[3]
    clues.append(("%s finished between %s and %s." % (mid, lo, hi), ("between", mid, lo, hi)))
    k = random.choice([0, 3])
    clues.append(("%s finished %s." % (by_pos[k], "first" if k == 0 else "last"), ("exact", by_pos[k], k)))
    return clues

def satisfies(perm_map, clue):
    kind = clue[0]
    if kind == "ahead": return perm_map[clue[1]] < perm_map[clue[2]]
    if kind == "between":
        m, a, b = perm_map[clue[1]], perm_map[clue[2]], perm_map[clue[3]]
        return (a < m < b) or (b < m < a)
    if kind == "exact": return perm_map[clue[1]] == clue[2]
    return False

def unique_orders(names, clues):
    sols = []
    for perm in itertools.permutations(range(4)):
        pm = {n: p for n, p in zip(names, perm)}
        if all(satisfies(pm, c) for c in clues):
            sols.append(pm)
    return sols

def gen_order():
    names = random.sample(NAMES, 4)
    perm = list(range(4)); random.shuffle(perm)
    pm = {n: p for n, p in zip(names, perm)}
    clues = order_clues(names, perm)
    texts = [c[0] for c in clues]; logic = [c[1] for c in clues]
    sols = unique_orders(names, logic)
    if len(sols) != 1: return None
    spot = random.randint(1, 4)
    winner = [n for n in names if pm[n] == spot - 1][0]
    order_str = " → ".join(sorted(names, key=lambda n: pm[n]))
    q = "In the big race: %s Who finished %s?" % (" ".join(texts), ORDINAL[spot])
    vis = row([card("🏁", "Finish", "1st 2nd 3rd 4th")] +
              [card(face(n), n, "🏃") for n in sorted(names)])
    return (2, "Level 2 · The finishing order", "🏁", q, [winner] + [n for n in names if n != winner], 0,
            "Line them up from the clues: %s. So %s finished %s." % (order_str, winner, ORDINAL[spot]),
            {"kind": "order", "names": names, "clues": logic, "spot": spot, "ans": winner}, vis)

# ---------------------------------------------------------------- L3a: who plays what
def gen_grid():
    kids = random.sample(NAMES, 3)
    sports = random.sample(SPORTS, 3)
    assign = list(sports); random.shuffle(assign)
    truth = dict(zip(kids, assign))
    # clues: one positive about kid0, one negative about kid1
    c_pos = (kids[0], truth[kids[0]])
    wrong = random.choice([s for s in assign if s != truth[kids[1]] and s != truth[kids[0]]])
    c_neg = (kids[1], wrong)
    def solutions():
        sols = []
        for perm in itertools.permutations(assign):
            t = dict(zip(kids, perm))
            if len(set(perm)) == 3 and t[c_pos[0]] == c_pos[1] and t[c_neg[0]] != c_neg[1]:
                sols.append(t)
        return sols
    sols = solutions()
    if len(sols) != 1: return None
    askkid = random.choice(kids[1:])
    ans = truth[askkid]
    q = ("%s, %s and %s each play a different sport: %s, %s or %s. %s plays %s. %s does NOT play %s. "
         "Which sport does %s play?" %
         (kids[0], kids[1], kids[2], sports[0], sports[1], sports[2],
          kids[0], c_pos[1], kids[1], c_neg[1], askkid))
    fact = ("%s plays %s, so that's taken. %s can't play %s, so %s plays %s — and %s gets %s. "
            "Crossing out is the trick!" %
            (kids[0], truth[kids[0]], kids[1], c_neg[1], kids[1], truth[kids[1]], kids[2], truth[kids[2]]))
    SPORT_EM = {"football": "⚽", "cricket": "🏏", "hockey": "🏑", "tennis": "🎾",
                "basketball": "🏀", "swimming": "🏊", "rugby": "🏉", "netball": "🥅"}
    vis = (row([card(face(kids[0]), kids[0], SPORT_EM[c_pos[1]] + " ✔"),
                card(face(kids[1]), kids[1], SPORT_EM[c_neg[1]] + " ✘"),
                card(face(kids[2]), kids[2], "?", unk=True)]) +
           row([card(SPORT_EM[s], s, "") for s in sports]))
    return (3, "Level 3 · Who plays what?", "🕵️", q, [ans] + [s for s in assign if s != ans], 0, fact,
            {"kind": "grid", "kids": kids, "sports": assign, "pos": c_pos, "neg": c_neg, "ask": askkid, "ans": ans}, vis)

# ---------------------------------------------------------------- L3b: two-step chains
def gen_twostep():
    a, b, c = random.sample(NAMES, 3)
    thing, em = random.choice(THINGS)
    vc = random.randint(2, 6)
    d = random.randint(2, 5)
    vb = vc + d
    va = vb * 2
    q = ("%s got %d %s. %s got %d more %s than %s. %s got TWICE as many as %s. How many %s did %s get?" %
         (c, vc, thing, b, d, thing, c, a, b, thing, a))
    fact = "Work backwards: %s has %d, so %s has %d + %d = %d, and %s has %d × 2 = %d." % (
        c, vc, b, vc, d, vb, a, vb, va)
    vis = row([card(face(c), c, count_items(em, vc)),
               card(face(b), b, "?", unk=True, chip="+%d vs %s" % (d, c)),
               card(face(a), a, "?", unk=True, chip="×2 vs %s" % b)])
    return (3, "Level 3 · Double trouble", em, q, num_opts(va), 0, fact,
            {"kind": "twostep", "vc": vc, "d": d, "ans": va}, vis, True)

# ---------------------------------------------------------------- L2b: match-day time
def gen_days():
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    start = random.randint(0, 6); jump = random.randint(3, 6)
    ans = days[(start + jump) % 7]
    q = "The cup final is %d days after %s. What day is the final?" % (jump, days[start])
    wrong = [d for d in days if d != ans]
    random.shuffle(wrong)
    fact = "Count on %d days from %s and you land on %s." % (jump, days[start], ans)
    vis = row([card("📅", days[start], "start here"),
               card("➕", "%d days" % jump, "count on"),
               card("❓", "?", "", unk=True)])
    return (2, "Level 2 · Count the days", "📅", q, [ans] + wrong[:3], 0, fact,
            {"kind": "days", "start": start, "jump": jump, "ans": ans}, vis)

# ---------------------------------------------------------------- build
made = {1: 0, 2: 0, 3: 0}
GOALS = {gen_chain: 18, gen_order: 12, gen_days: 6, gen_grid: 10, gen_twostep: 8}
for gen, want in GOALS.items():
    got, tries = 0, 0
    while got < want and tries < 4000:
        tries += 1
        r = gen()
        if not r: continue
        add(*r)
        made[r[0]] += 1
        got += 1

# ---------------------------------------------------------------- self-test
def resolve(chk):
    k = chk["kind"]
    if k == "chain":
        vb = chk["va"] + chk["d1"]; vc = vb + chk["d2"]
        return vb if chk["ask"] == "b" else vc
    if k == "order":
        sols = unique_orders(chk["names"], [tuple(c) for c in chk["clues"]])
        if len(sols) != 1: return None
        pm = sols[0]
        return [n for n in chk["names"] if pm[n] == chk["spot"] - 1][0]
    if k == "grid":
        sols = []
        for perm in itertools.permutations(chk["sports"]):
            t = dict(zip(chk["kids"], perm))
            if t[chk["pos"][0]] == chk["pos"][1] and t[chk["neg"][0]] != chk["neg"][1]:
                sols.append(t)
        return sols[0][chk["ask"]] if len(sols) == 1 else None
    if k == "twostep":
        return (chk["vc"] + chk["d"]) * 2
    if k == "days":
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return days[(chk["start"] + chk["jump"]) % 7]
    return None

def self_test():
    fails = 0
    for it in pool:
        want = str(it["chk"]["ans"])
        got = resolve(it["chk"])
        shown = [o["t"] for o in it["opts"]]
        min_opts = 3 if it["chk"]["kind"] == "grid" else 4  # grids have 3 sports
        ok = (got is not None and str(got) == want and shown[it["ans"]] == want
              and len(set(shown)) == len(shown) and len(shown) >= min_opts)
        if not ok:
            fails += 1
            print("FAIL", it["chk"], "got", got, "shown", shown)
    print("self-test: %s (%d items, %d failures)" % ("PASS" if not fails else "FAIL", len(pool), fails))
    return fails == 0

def main():
    if not self_test():
        sys.exit(1)
    if "--self-test" in sys.argv:
        return
    for it in pool:
        del it["chk"]
    random.shuffle(pool)
    GAME = {
        "BASE": BASE,
        "HEADER": {
            "logoEmoji": "🧠", "logoText": "Riddle Stadium",
            "title": "Riddle Stadium — Play and Learn",
            "grown": "For grown-ups: short logic word problems in the classic reasoning-paper style, set on match day — number chains, finishing-order puzzles, day counting, mini deduction grids and two-step chains. Every puzzle is machine-checked to have exactly one right answer, and every reveal walks through the reasoning. Ages 7–11.",
            "finaleH": "🧠 Riddle master!",
            "finaleP": "Chains followed, orders untangled, mysteries solved — what a performance!",
            "again": "Play again 🔁",
        },
        "POOL_PICK": 9,
        "POOL": pool,
    }
    out = os.path.join(ROOT, "public/play/games/pools/riddle-stadium.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.GAME=" + json.dumps(GAME, ensure_ascii=False) + ";\n")
    levels = {}
    for x in pool:
        levels[x["lvl"]] = levels.get(x["lvl"], 0) + 1
    print("riddle-stadium.js: %d items %s" % (len(pool), levels))

if __name__ == "__main__":
    main()
