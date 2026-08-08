#!/usr/bin/env python3
"""
build_spot_the_pattern.py — pool builder for the "Spot the Pattern" game.

Number sequences in the classic reasoning-paper style, entirely original and
fully self-contained (no data inputs). Three ramped levels, tagged `lvl`:

  L1  one-step rules      +d / -d / times-table skip counting
  L2  changing steps      growing gaps, doubling and halving, repeating +a,+b
  L3  hidden structure    two interleaved sequences, multiply-then-add rules,
                          squares and triangular numbers

Every item stores its generator parameters; the self-test rebuilds each
series from those parameters and confirms the shown terms, the answer and
the distractors. Deterministic: seeded RNG.

Writes public/play/games/pools/spot-the-pattern.js  (window.GAME = {...}).
Run with --self-test to verify and emit nothing.
"""
import json, os, random, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("-") \
    else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rankings.citizenofnowhere.org"
random.seed(20260808)

BGS = ["linear-gradient(180deg,#eaf4ff,#ffffff)", "linear-gradient(180deg,#fff3d6,#fffdf4)",
       "linear-gradient(180deg,#e3f9f2,#f7fffd)", "linear-gradient(180deg,#ffe9e3,#fff8f6)",
       "linear-gradient(180deg,#efe9ff,#faf8ff)"]
STAMPS = ["🔢", "🧮", "🚂", "🔍", "🎯"]
SCENES = ["🚂", "🔢", "🧮", "🎢", "🎯"]

# ---------------------------------------------------------------- series makers
# Each maker returns (terms, answer, rule_text, params). `terms` excludes the answer.

def mk_arith(start, d, n):
    seq = [start + k * d for k in range(n + 1)]
    word = "add %d" % d if d > 0 else "take away %d" % -d
    return seq[:-1], seq[-1], "The rule is %s each time. %d %s %d = %d." % (
        word, seq[-2], "+" if d > 0 else "-", abs(d), seq[-1])

def mk_table(t, n):
    seq = [t * (k + 1) for k in range(n + 1)]
    return seq[:-1], seq[-1], "It's the %d times table: count up in %ds. %d + %d = %d." % (
        t, t, seq[-2], t, seq[-1])

def mk_grow(start, g0, n):
    seq, g = [start], g0
    for _ in range(n):
        seq.append(seq[-1] + g); g += 1
    return seq[:-1], seq[-1], "The jump GROWS by one each time: +%d, +%d, +%d… so the last jump is +%d." % (
        g0, g0 + 1, g0 + 2, g - 1)

def mk_double(start, n):
    seq = [start * (2 ** k) for k in range(n + 1)]
    return seq[:-1], seq[-1], "Each number DOUBLES. %d × 2 = %d." % (seq[-2], seq[-1])

def mk_halve(start, n):
    seq = [start // (2 ** k) for k in range(n + 1)]
    return seq[:-1], seq[-1], "Each number HALVES. Half of %d is %d." % (seq[-2], seq[-1])

def mk_zigzag(start, a, b, n):
    seq = [start]
    for k in range(n):
        seq.append(seq[-1] + (a if k % 2 == 0 else b))
    step = a if (n - 1) % 2 == 0 else b
    return seq[:-1], seq[-1], "Two jumps take turns: %+d, %+d, %+d, %+d… The next turn is %+d, and %d %s %d = %d." % (
        a, b, a, b, step, seq[-2], "+" if step > 0 else "-", abs(step), seq[-1])

def mk_interleave(s1, d1, s2, d2, n):
    seq = []
    for k in range(n + 1):
        seq.append(s1 + (k // 2) * d1 if k % 2 == 0 else s2 + (k // 2) * d2)
    which = "first" if n % 2 == 0 else "second"
    d = d1 if n % 2 == 0 else d2
    return seq[:-1], seq[-1], ("TWO number lines take turns! One goes %d, %d, %d… the other goes %d, %d, %d… "
        "The next number belongs to the %s line: %+d gives %d.") % (
        s1, s1 + d1, s1 + 2 * d1, s2, s2 + d2, s2 + 2 * d2, which, d, seq[-1])

def mk_mult_add(start, m, c, n):
    seq = [start]
    for _ in range(n):
        seq.append(seq[-1] * m + c)
    op = "then add %d" % c if c > 0 else "then take away %d" % -c
    return seq[:-1], seq[-1], "The rule is: times %d, %s. %d × %d %s %d = %d." % (
        m, op, seq[-2], m, "+" if c > 0 else "-", abs(c), seq[-1])

def mk_squares(k0, n):
    seq = [(k0 + k) ** 2 for k in range(n + 1)]
    return seq[:-1], seq[-1], "These are SQUARE numbers: %s… Next is %d × %d = %d." % (
        ", ".join("%d×%d" % (k0 + k, k0 + k) for k in range(3)), k0 + n, k0 + n, seq[-1])

def mk_triangle(n):
    seq, t = [], 0
    for k in range(1, n + 2):
        t += k; seq.append(t)
    return seq[:-1], seq[-1], ("Triangle numbers: each jump is one bigger — +2, +3, +4… "
        "%d + %d = %d.") % (seq[-2], n + 1, seq[-1])

# ---------------------------------------------------------------- assembly
pool = []
def distractors(ans, terms):
    gap = abs(ans - terms[-1]) or 2
    cands = [ans + gap, ans - gap, ans + 1, ans - 1, ans + 2, terms[-1], ans + 10, ans - 10]
    out = []
    for c in cands:
        if c > 0 and c != ans and c not in out:
            out.append(c)
        if len(out) == 3: break
    return out

def add(lvl, terms, ans, rule, params):
    opts = [{"t": str(ans)}] + [{"t": str(d)} for d in distractors(ans, terms)]
    wagons = "".join('<span class="swag">%d</span>' % t for t in terms)
    pool.append({
        "city": random.choice(SCENES), "flag": "", "place": "Spot the Pattern",
        "sub": "Level %d · What comes next?" % lvl,
        "stamp": random.choice(STAMPS),
        "q": "The number train follows a secret rule. What number is on the last wagon?",
        "vis": '<div class="strain"><span class="sloco">🚂</span>%s<span class="swag q">?</span></div>' % wagons,
        "say": "The numbers so far are %s. What number comes next?" % ", ".join(str(t) for t in terms),
        "tile": True,
        "opts": opts, "ans": 0, "fact": rule,
        "bg": random.choice(BGS), "lvl": lvl, "gen": params,
    })

# L1 — one-step rules (20)
for d in (2, 3, 4, 5, 6, 7, 8, 9):
    t, a, r = mk_arith(random.randint(1, 30), d, 5); add(1, t, a, r, ["arith", t[0], d, 5])
for d in (2, 3, 4, 6):
    t, a, r = mk_arith(random.randint(40, 90), -d, 5); add(1, t, a, r, ["arith", t[0], -d, 5])
for tab in (3, 4, 6, 7, 8, 9, 11, 12):
    t, a, r = mk_table(tab, 5); add(1, t, a, r, ["table", tab, 5])

# L2 — changing steps (20)
for g in (1, 2, 3, 4, 5, 2, 3, 4):
    t, a, r = mk_grow(random.randint(1, 15), g, 5); add(2, t, a, r, ["grow", t[0], g, 5])
for s in (2, 3, 4, 5):
    t, a, r = mk_double(s, 5); add(2, t, a, r, ["double", s, 5])
for s in (96, 160, 224, 320):
    t, a, r = mk_halve(s, 5); add(2, t, a, r, ["halve", s, 5])
for a_, b_ in ((5, -2), (4, -1), (6, -3), (3, 2)):
    t, an, r = mk_zigzag(random.randint(5, 20), a_, b_, 6); add(2, t, an, r, ["zigzag", t[0], a_, b_, 6])

# L3 — hidden structure (20)
for d1, d2 in ((1, -1), (2, -1), (1, -2), (2, 2), (3, -2), (1, 1)):
    s1, s2 = random.randint(20, 40), random.randint(15, 35)
    t, a, r = mk_interleave(s1, d1, s2, d2, 8); add(3, t, a, r, ["inter", s1, d1, s2, d2, 8])
for m, c in ((2, 1), (2, -1), (3, -1), (2, 3), (3, 1)):
    s = random.randint(2, 5)
    t, a, r = mk_mult_add(s, m, c, 4); add(3, t, a, r, ["multadd", s, m, c, 4])
for k0 in (1, 2, 3, 4, 5):
    t, a, r = mk_squares(k0, 5); add(3, t, a, r, ["squares", k0, 5])
for _ in range(4):
    t, a, r = mk_triangle(random.randint(5, 8)); add(3, t, a, r, ["tri", len(t)])

# ---------------------------------------------------------------- self-test
MAKERS = {"arith": mk_arith, "table": mk_table, "grow": mk_grow, "double": mk_double,
          "halve": mk_halve, "zigzag": mk_zigzag, "inter": mk_interleave,
          "multadd": mk_mult_add, "squares": mk_squares, "tri": mk_triangle}

def self_test():
    fails = 0
    for it in pool:
        kind, args = it["gen"][0], it["gen"][1:]
        terms, ans, _ = MAKERS[kind](*args)
        shown = [int(o["t"]) for o in it["opts"]]
        q_terms = [int(x) for x in it["say"].split("are")[1].split(".")[0].replace(",", " ").split()]
        v_terms = [int(x) for x in it["vis"].replace('<span class="swag">', " ").replace("</span>", " ")
                   .replace('<div class="strain">', " ").replace('<span class="sloco">🚂', " ")
                   .replace('<span class="swag q">?', " ").replace("</div>", " ").split()]
        ok = (q_terms == terms and v_terms == terms and shown[0] == ans and it["ans"] == 0
              and len(set(shown)) == len(shown) and ans not in shown[1:]
              and all(v > 0 for v in shown))
        if not ok:
            fails += 1
            print("FAIL", kind, args, q_terms, terms, shown, ans)
    print("self-test: %s (%d items, %d failures)" % ("PASS" if not fails else "FAIL", len(pool), fails))
    return fails == 0

def main():
    if not self_test():
        sys.exit(1)
    if "--self-test" in sys.argv:
        return
    for it in pool:
        del it["gen"]  # runtime pool doesn't need generator params
    random.shuffle(pool)
    GAME = {
        "BASE": BASE,
        "HEADER": {
            "logoEmoji": "🔢", "logoText": "Spot the Pattern",
            "title": "Spot the Pattern — Play and Learn",
            "grown": "For grown-ups: number sequences in the classic reasoning-paper style — one-step rules, growing gaps, doubling and halving, two interleaved sequences, times-then-add rules, square and triangle numbers. Every answer is explained with its rule, so the pattern is the lesson. Ages 7–11.",
            "finaleH": "🔢 Pattern detective!",
            "finaleP": "Hidden rules found, secret sequences cracked — superb spotting!",
            "again": "Play again 🔁",
        },
        "POOL_PICK": 9,
        "POOL": pool,
    }
    out = os.path.join(ROOT, "public/play/games/pools/spot-the-pattern.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.GAME=" + json.dumps(GAME, ensure_ascii=False) + ";\n")
    levels = {}
    for x in pool:
        levels[x["lvl"]] = levels.get(x["lvl"], 0) + 1
    print("spot-the-pattern.js: %d items %s" % (len(pool), levels))

if __name__ == "__main__":
    main()
