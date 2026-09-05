#!/usr/bin/env python3
"""
build_champions.py — pool builder for the "Champions" Play & Learn game's
Medal Table mode (Olympic medal-count reasoning).

The base game (champions.html) ships with a hardcoded 32-nation "best sport"
list that a memory-strong player can simply memorise. This script widens the
data available to the game onto the full Olympic teams table (151 entries)
so a new "Medal Table" mode can ask genuinely harder questions that draw on
real medal counts rather than a fixed trivia list:

  mostGolds   "Which of these four nations has won the most Olympic golds?"
  guessNation "This nation has won <n> gold medals. Which nation is it?"
  firstSummer "In which year did <nation> first compete at a Summer Olympics?"
  moreWinter  "Which of these nations has competed at MORE Winter Games than
               Summer Games?" (teaches Summer and Winter are separate counts)
  goldGap     "Roughly how many more golds has <A> won than <B>?"

Reads  public/data/olympics/teams.json   (medal counts, apps, best_rank)
       public/data/countries.json        (name, continent, capital)
       public/data/country-facts.json    (iso3166, for the flag image)
Writes public/play/games/pools/champions.js (window.CHAMPS = {...})

Flags always come from flagcdn.com (flag EMOJI don't render on Windows),
exactly as scripts/games/build_in_the_club.py does it. Deterministic: seeded
RNG, so re-running produces the same pool file.
"""
import json, math, os, random, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".."))
random.seed(20260905)

teams = json.load(open(os.path.join(ROOT, "public/data/olympics/teams.json"), encoding="utf-8"))
countries = {c["slug"]: c for c in json.load(open(os.path.join(ROOT, "public/data/countries.json"), encoding="utf-8"))}
facts = json.load(open(os.path.join(ROOT, "public/data/country-facts.json"), encoding="utf-8"))["countries"]

# teams.json slugs that spell a country's name differently from countries.json.
ALIAS = {
    "great-britain": "united-kingdom",
    "czechia": "czech-republic",
    "chinese-taipei": "taiwan",
    "trinidad-and-tobago": "trinidad-tobago",
    "ivory-coast": "cote-divoire",
}
# Composite/historical Olympic teams with no modern country to join to —
# teams.json already flags most of these `special`.
NEVER_A_COUNTRY = {"united-states-virgin-islands"}

def flag_url(cslug):
    iso = (facts.get(cslug) or {}).get("iso3166") or ""
    return "https://flagcdn.com/w160/%s.png" % iso.lower() if len(iso) == 2 else ""

def resolve(t):
    """teams.json entry -> joined nation dict, or None if it isn't a real,
    flaggable modern country (composite/historical Olympic teams, dependent
    territories not in countries.json)."""
    slug = t["slug"]
    if t.get("special") or slug in NEVER_A_COUNTRY:
        return None
    cslug = ALIAS.get(slug, slug)
    c = countries.get(cslug)
    if not c:
        return None
    url = flag_url(cslug)
    if not url:
        return None
    return {
        "slug": cslug, "name": c["name"], "flag": url,
        "g": t["g"], "s": t["s"], "b": t["b"], "total": t["total"],
        "apps": t["apps"], "summer_apps": t["summer_apps"], "winter_apps": t["winter_apps"],
        "summer": t.get("summer") or {}, "winter": t.get("winter") or {},
        "best_rank": t.get("best_rank"),
    }

NATIONS = [n for n in (resolve(t) for t in teams) if n]
NATIONS.sort(key=lambda n: n["slug"])
print("joined %d / %d teams to real, flaggable countries" % (len(NATIONS), len(teams)))

GOLD = [n for n in NATIONS if n["g"] >= 1]           # 0-gold nations make dull targets
SUMMER = [n for n in NATIONS if n["summer_apps"] >= 1 and n["summer"].get("first")]

def bucket(g):
    """Order-of-magnitude bucket: 1-9, 10-99, 100-999, 1000+."""
    if g <= 0:
        return 0
    return 10 ** int(math.log10(g))

BY_BUCKET = {}
for n in GOLD:
    BY_BUCKET.setdefault(bucket(n["g"]), []).append(n)

def decoys_same_bucket(target, n_needed=3):
    """Distractor nations whose gold count is the same order of magnitude as
    the target's, so the option list can't be solved by digit-counting."""
    b = bucket(target["g"])
    pool = [n for n in BY_BUCKET.get(b, []) if n["slug"] != target["slug"] and n["g"] != target["g"]]
    # USA alone occupies the 1000s bucket — widen down a bucket rather than fail.
    while len(pool) < n_needed and b > 1:
        b //= 10
        pool = list({n["slug"]: n for n in pool + BY_BUCKET.get(b, [])
                     if n["slug"] != target["slug"] and n["g"] != target["g"]}.values())
    random.shuffle(pool)
    return pool[:n_needed]

def opt(n):
    return {"t": n["name"], "flag": n["flag"]}

QUESTIONS = []

def add(qtype, flagMain, emojiMain, nameMain, ask, opts, ans, fact, say=None):
    texts = [o["t"] for o in opts]
    assert len(set(texts)) == 4, ("duplicate option text", texts)
    assert 0 <= ans < 4
    QUESTIONS.append({
        "qtype": qtype, "flagMain": flagMain, "emojiMain": emojiMain,
        "nameMain": nameMain, "ask": ask, "opts": opts, "ans": ans,
        "fact": fact, "say": say or fact,
    })

# ---------------------------------------------------------------- mostGolds
seen_combos = set()
tries = 0
while len([q for q in QUESTIONS if q["qtype"] == "mostGolds"]) < 22 and tries < 4000:
    tries += 1
    four = random.sample(GOLD, 4)
    key = tuple(sorted(n["slug"] for n in four))
    if key in seen_combos:
        continue
    top = max(four, key=lambda n: n["g"])
    rest = [n for n in four if n["g"] == top["g"]]
    if len(rest) > 1:
        continue  # tie — not a fair question
    seen_combos.add(key)
    others = [n for n in four if n["slug"] != top["slug"]]
    add("mostGolds", "", "🥇", "Most Olympic golds?",
        "Which of these four nations has won the MOST Olympic golds?",
        [opt(n) for n in four], four.index(top),
        "%s has won the most — %s Olympic gold%s in all! %s, %s and %s have fewer." %
        (top["name"], "{:,}".format(top["g"]), "" if top["g"] == 1 else "s",
         others[0]["name"], others[1]["name"], others[2]["name"]))

# ---------------------------------------------------------------- guessNation
targets = sorted(GOLD, key=lambda n: -n["g"])
# spread picks across the whole range, not just the most famous nations
step = max(1, len(targets) // 26)
picks = targets[::step][:26]
for target in picks:
    decoys = decoys_same_bucket(target, 3)
    if len(decoys) < 3:
        continue
    four = [target] + decoys
    random.shuffle(four)
    add("guessNation", "", "🏅", "{:,}".format(target["g"]) + " golds",
        "This nation has won " + "{:,}".format(target["g"]) + " Olympic gold medals. Which nation is it?",
        [opt(n) for n in four], four.index(target),
        "%s has won %s Olympic golds." % (target["name"], "{:,}".format(target["g"])))

# ---------------------------------------------------------------- firstSummer
years_pool = sorted({n["summer"]["first"] for n in SUMMER})
step = max(1, len(SUMMER) // 26)
for target in sorted(SUMMER, key=lambda n: n["slug"])[::step][:26]:
    y = target["summer"]["first"]
    other_years = [x for x in years_pool if x != y]
    random.shuffle(other_years)
    decoy_years = other_years[:3]
    if len(decoy_years) < 3:
        continue
    opts4 = [{"t": str(y)}] + [{"t": str(x)} for x in decoy_years]
    idxs = list(range(4))
    random.shuffle(idxs)
    opts_shuf = [opts4[i] for i in idxs]
    add("firstSummer", target["flag"], "", target["name"],
        "In which year did %s first compete at a SUMMER Olympics?" % target["name"],
        opts_shuf, idxs.index(0),
        "%s first competed at a Summer Olympics in %d." % (target["name"], y))

# ---------------------------------------------------------------- moreWinter
WINTER_HEAVY = [n for n in NATIONS if n["winter_apps"] > n["summer_apps"]]
others_pool = [n for n in NATIONS if n not in WINTER_HEAVY]
for i in range(12):
    target = WINTER_HEAVY[i % len(WINTER_HEAVY)]
    decoys = random.sample(others_pool, 3)
    four = [target] + decoys
    random.shuffle(four)
    detail = ("%s has been to %d Winter Games but only %d Summer Games." %
              (target["name"], target["winter_apps"], target["summer_apps"])) \
        if target["summer_apps"] else \
        ("%s has been to %d Winter Games and has NEVER been to a Summer Olympics!" %
         (target["name"], target["winter_apps"]))
    add("moreWinter", "", "⛷️", "Winter vs Summer",
        "Which of these nations has competed at MORE Winter Olympic Games than Summer Olympic Games?",
        [opt(n) for n in four], four.index(target),
        detail + " The Summer and Winter Olympics are counted completely separately!")

# ---------------------------------------------------------------- goldGap
tries = 0
made = 0
seen_pairs = set()
while made < 22 and tries < 4000:
    tries += 1
    a, b = random.sample(GOLD, 2)
    if a["g"] == b["g"]:
        continue
    hi, lo = (a, b) if a["g"] > b["g"] else (b, a)
    key = (hi["slug"], lo["slug"])
    if key in seen_pairs:
        continue
    diff = hi["g"] - lo["g"]
    step = max(1, round(diff * 0.15))
    cands = {diff + step, max(1, diff - step), hi["g"] + lo["g"], diff + step * 2, max(1, diff - step * 2)}
    cands.discard(diff)
    decoys = list(cands)
    random.shuffle(decoys)
    decoys = decoys[:3]
    if len(decoys) < 3:
        continue
    seen_pairs.add(key)
    made += 1
    nums = [diff] + decoys
    idxs = list(range(4))
    random.shuffle(idxs)
    opts4 = [{"t": "{:,}".format(nums[i])} for i in idxs]
    vs_html = ('<img class="vsflag" src="%s" alt="">%s <span class="vs">vs</span> '
               '<img class="vsflag" src="%s" alt="">%s') % (hi["flag"], hi["name"], lo["flag"], lo["name"])
    add("goldGap", "", "", vs_html,
        "About how many MORE Olympic golds has %s won than %s?" % (hi["name"], lo["name"]),
        opts4, idxs.index(0),
        "%s: %s golds. %s: %s golds. %s − %s = %s more." %
        (hi["name"], "{:,}".format(hi["g"]), lo["name"], "{:,}".format(lo["g"]),
         "{:,}".format(hi["g"]), "{:,}".format(lo["g"]), "{:,}".format(diff)),
        say="%s has %d golds, %s has %d golds. About how many more does %s have?" %
            (hi["name"], hi["g"], lo["name"], lo["g"], hi["name"]))

random.shuffle(QUESTIONS)

counts = {}
for q in QUESTIONS:
    counts[q["qtype"]] = counts.get(q["qtype"], 0) + 1
print("QUESTIONS:", len(QUESTIONS), counts)

CHAMPS = {"NATIONS": NATIONS, "QUESTIONS": QUESTIONS}
out = os.path.join(ROOT, "public/play/games/pools/champions.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.CHAMPS=" + json.dumps(CHAMPS, ensure_ascii=False) + ";\n")
print("wrote", out)
