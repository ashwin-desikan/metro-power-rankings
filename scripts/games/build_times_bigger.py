#!/usr/bin/env python3
"""
build_times_bigger.py — pool builder for "How Many Times Bigger?".

Proportional reasoning on real metro data (metros.json). Three ramped levels,
tagged `lvl` for the shared engine's stratified easy->hard sampling:

  L1  compare       "Which metro has MORE people: X or Y?"
                    (absorbs the retired Bigger City game as the opening level)
  L2  ratio         "About how many times bigger is X than Y by people?"
                    — raw numbers shown on the scene so the division is visible
  L3  flip          "X has more people than Y. But which has the bigger GDP?"
                    — pairs chosen so the obvious answer is wrong

Writes public/play/games/pools/times-bigger.js. Deterministic: seeded RNG.
"""
import json, os, random, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rankings.citizenofnowhere.org"
random.seed(20260806)

metros = json.load(open(os.path.join(ROOT, "public/data/metros.json"), encoding="utf-8"))
cfacts = json.load(open(os.path.join(ROOT, "public/data/country-facts.json"), encoding="utf-8"))["countries"]

def flag(m):
    """flagcdn image URL — flag EMOJI don't render on Windows, always use images."""
    iso = (cfacts.get(m.get("countrySlug") or "") or {}).get("iso3166") or ""
    return "https://flagcdn.com/w160/%s.png" % iso.lower() if len(iso) == 2 else ""

TOP = [m for m in metros if m.get("rank") and m["rank"] <= 70 and flag(m)]

METRICS = {
    "pop":           {"emoji": "👥", "noun": "people",         "q": "people"},
    "skyscrapers":   {"emoji": "🏙️", "noun": "skyscrapers",   "q": "skyscrapers"},
    "majorTeams":    {"emoji": "🏟️", "noun": "major sports teams", "q": "major sports teams"},
    "metroStations": {"emoji": "🚇", "noun": "metro stations", "q": "metro stations"},
    "gdp":           {"emoji": "💰", "noun": "GDP",            "q": "GDP (all the money the city makes in a year)"},
}
BGS = ["linear-gradient(180deg,#9bd3ff,#e8f4ff)", "linear-gradient(180deg,#ffd98a,#fff4d9)",
       "linear-gradient(180deg,#b8ecd9,#eefcf6)", "linear-gradient(180deg,#ffc9c9,#fff0f0)",
       "linear-gradient(180deg,#d5ccff,#f3f0ff)"]

def val(m, k):
    v = m.get(k)
    return v if isinstance(v, (int, float)) and v > 0 else None

def fmt(k, v):
    if k == "pop":
        return "about %.1f million people" % (v / 1e6)
    if k == "gdp":
        bn = round(v / 10) * 10
        s = "about $%s billion of GDP" % format(int(bn), ",")
        if bn >= 1000:
            s += " (that's over $%.1f trillion!)" % (bn / 1000 - 0.049)
        return s
    return "%s %s" % (format(int(v), ","), METRICS[k]["noun"])

def short(k, v):
    if k == "pop":
        return "%.1fM people" % (v / 1e6)
    if k == "gdp":
        return "$%s bn" % format(int(round(v / 10) * 10), ",")
    return "%s %s" % (format(int(v), ","), METRICS[k]["noun"])

pool = []
seen = set()
def add(lvl, key, sub, q, opts, ans, fact, a):
    pool.append({
        "city": METRICS[key]["emoji"], "flag": "", "place": "How Many Times Bigger?",
        "sub": sub, "stamp": random.choice(["📏", "➗", "🔢", "⚖️", "🧮"]),
        "q": q, "opts": opts, "ans": ans, "fact": fact,
        "url": "%s/rankings/%s" % (BASE, a["slug"]),
        "linkLabel": "See %s on the site →" % a["name"],
        "bg": random.choice(BGS), "lvl": lvl,
    })

# ---------------------------------------------------------------- L1: compare
MIN_FLOOR = {"skyscrapers": 15, "majorTeams": 3, "metroStations": 20}
l1 = 0
tries = 0
while l1 < 32 and tries < 4000:
    tries += 1
    key = random.choice(["pop", "skyscrapers", "majorTeams", "metroStations"])
    a, b = random.sample(TOP, 2)
    va, vb = val(a, key), val(b, key)
    if not va or not vb:
        continue
    if va < vb:
        a, b, va, vb = b, a, vb, va
    if va < vb * 1.7 or vb < MIN_FLOOR.get(key, 0):
        continue
    pair = (1, key, tuple(sorted([a["slug"], b["slug"]])))
    if pair in seen:
        continue
    seen.add(pair)
    first_a = random.random() < 0.5
    opts = ([{"t": a["name"], "logo": flag(a)}, {"t": b["name"], "logo": flag(b)}]
            if first_a else [{"t": b["name"], "logo": flag(b)}, {"t": a["name"], "logo": flag(a)}])
    add(1, key, "Level 1 · Compare",
        "Which metro has MORE %s: %s or %s?" % (METRICS[key]["q"], opts[0]["t"], opts[1]["t"]),
        opts, 0 if first_a else 1,
        "%s has %s; %s has %s. %s wins this one!" % (a["name"], fmt(key, va), b["name"], fmt(key, vb), a["name"]),
        a)
    l1 += 1

# ---------------------------------------------------------------- L2: ratio buckets
BUCKETS = [1.3, 1.5, 2, 3, 4, 5, 6, 8, 10]
def blabel(x):
    if x == 1.3: return "about 1.3× — just a bit bigger"
    if x == 1.5: return "about 1½ times bigger"
    if x == 2:   return "about 2× (double)"
    if x == 3:   return "about 3× (triple)"
    return "about %d×" % x
def bphrase(x, key):
    """Full comparison phrase: 'about twice as many skyscrapers as'."""
    noun = "GDP" if key == "gdp" else METRICS[key]["noun"]
    many = "much" if key == "gdp" else "many"
    if x == 1.3: return "just a bit more %s than" % noun
    if x == 1.5: return "about one and a half times as %s %s as" % (many, noun)
    if x == 2:   return "about twice as %s %s as" % (many, noun)
    return "about %d times as %s %s as" % (x, many, noun)

l2 = 0
tries = 0
while l2 < 36 and tries < 20000:
    tries += 1
    key = random.choice(["pop", "skyscrapers", "metroStations", "gdp"])
    a, b = random.sample(TOP, 2)
    va, vb = val(a, key), val(b, key)
    if not va or not vb:
        continue
    if va < vb:
        a, b, va, vb = b, a, vb, va
    if vb < MIN_FLOOR.get(key, 0):
        continue
    r = va / vb
    bi = min(range(len(BUCKETS)), key=lambda i: abs(BUCKETS[i] - r))
    if abs(BUCKETS[bi] - r) > 0.09 * BUCKETS[bi]:
        continue
    pair = (2, key, tuple(sorted([a["slug"], b["slug"]])))
    if pair in seen:
        continue
    # distractors: two buckets clearly away (>=2 steps)
    cands = [i for i in range(len(BUCKETS)) if abs(i - bi) >= 2]
    lo = [i for i in cands if i < bi]
    hi = [i for i in cands if i > bi]
    if lo and hi:
        d = [random.choice(lo), random.choice(hi)]
    elif len(cands) >= 2:
        d = random.sample(cands, 2)
    else:
        continue
    seen.add(pair)
    order = [bi] + d
    random.shuffle(order)
    opts = [{"t": blabel(BUCKETS[i])} for i in order]
    ratio_str = ("%.1f" % r).rstrip("0").rstrip(".")
    add(2, key, "%s %s · %s %s" % (a["name"], short(key, va), b["name"], short(key, vb)),
        "About how many times bigger is %s than %s by %s?" % (a["name"], b["name"], METRICS[key]["q"]),
        opts, order.index(bi),
        "Divide! %s ÷ %s is about %s — %s has %s %s. Estimating like this is how data people size things up fast." %
        (short(key, va), short(key, vb), ratio_str, a["name"], bphrase(BUCKETS[bi], key), b["name"]),
        a)
    l2 += 1

# ---------------------------------------------------------------- L3: the flip
FLIPS = [("pop", "gdp"), ("pop", "skyscrapers"), ("pop", "metroStations")]
l3 = 0
tries = 0
while l3 < 28 and tries < 30000:
    tries += 1
    k1, k2 = random.choice(FLIPS)
    a, b = random.sample(TOP, 2)
    v1a, v1b, v2a, v2b = val(a, k1), val(b, k1), val(a, k2), val(b, k2)
    if not all([v1a, v1b, v2a, v2b]):
        continue
    # a is bigger by k1 but SMALLER by k2, both by a clear margin
    if not (v1a >= 1.25 * v1b and v2b >= 1.25 * v2a and v2a >= MIN_FLOOR.get(k2, 0)):
        continue
    pair = (3, k1 + k2, tuple(sorted([a["slug"], b["slug"]])))
    if pair in seen:
        continue
    seen.add(pair)
    first_b = random.random() < 0.5
    opts = ([{"t": b["name"], "logo": flag(b)}, {"t": a["name"], "logo": flag(a)}]
            if first_b else [{"t": a["name"], "logo": flag(a)}, {"t": b["name"], "logo": flag(b)}])
    add(3, k2, "Level 3 · The flip",
        "%s has more people than %s. But which one has more %s?" % (a["name"], b["name"], METRICS[k2]["q"]),
        opts, 0 if first_b else 1,
        "Surprise: %s! %s has %s but %s; %s has %s people yet %s. More people does NOT always mean more %s — always check the data!" %
        (b["name"], a["name"], fmt(k1, v1a), "only " + short(k2, v2a),
         b["name"], "fewer", fmt(k2, v2b), METRICS[k2]["noun"]),
        b)
    l3 += 1

# ---------------------------------------------------------------- write
random.shuffle(pool)
GAME = {
    "BASE": BASE,
    "HEADER": {
        "logoEmoji": "📏", "logoText": "How Many Times Bigger?",
        "title": "How Many Times Bigger? — Play and Learn",
        "grown": "For grown-ups: ratio, division and estimation with real city data — people, skyscrapers, metro stations and GDP. Level 1 compares, level 2 asks 'how many times bigger?' with the raw numbers on show, and level 3 springs the flip: more people but less money. Rounding and place value into the millions and billions. Ages 7–10.",
        "finaleH": "📏 Ratio master!",
        "finaleP": "You sized up the world's cities like a real analyst!",
        "again": "Play again 🔁",
    },
    "POOL_PICK": 9,
    "POOL": pool,
}
out = os.path.join(ROOT, "public/play/games/pools/times-bigger.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.GAME=" + json.dumps(GAME, ensure_ascii=False) + ";\n")
levels = {}
for x in pool:
    levels[x["lvl"]] = levels.get(x["lvl"], 0) + 1
print("times-bigger.js: %d items %s" % (len(pool), levels))
