#!/usr/bin/env python3
"""
build_higher_or_lower.py — rounds builder for "Higher or Lower" (binary search).

The player knows the city/person and hunts the hidden VALUE on a number line;
every guess answers "higher" or "lower" and shades out the eliminated range.
The coaching line at the end names the strategy: guess the middle = binary
search. Rounds come from metros.json (population, skyscrapers, metro
stations) and billionaires.json (net worth, magnitude framing only, ⚠️
markers stripped).

Writes public/play/games/pools/higher-or-lower.js (window.HLGAME = {...}).
Deterministic: seeded RNG.
"""
import json, os, random, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rankings.citizenofnowhere.org"
random.seed(20260806)

metros = json.load(open(os.path.join(ROOT, "public/data/metros.json"), encoding="utf-8"))
cfacts = json.load(open(os.path.join(ROOT, "public/data/country-facts.json"), encoding="utf-8"))["countries"]
billionaires = json.load(open(os.path.join(ROOT, "public/data/billionaires.json"), encoding="utf-8"))["billionaires"]

def flag(slug):
    """flagcdn image URL — flag EMOJI don't render on Windows, always use images."""
    iso = (cfacts.get(slug or "") or {}).get("iso3166") or ""
    return "https://flagcdn.com/w160/%s.png" % iso.lower() if len(iso) == 2 else ""

BGS = ["linear-gradient(180deg,#9bd3ff,#e8f4ff)", "linear-gradient(180deg,#ffd98a,#fff4d9)",
       "linear-gradient(180deg,#b8ecd9,#eefcf6)", "linear-gradient(180deg,#d5ccff,#f3f0ff)",
       "linear-gradient(180deg,#ffc9c9,#fff0f0)"]

rounds = []
def snap(v, step):
    return int(round(v / step) * step)

def add(name, flag_e, emoji, metric, q, unit, minv, maxv, step, actual, actual_txt, fact, url, link, hard=False):
    t = snap(actual, step)
    t = max(minv + step, min(maxv - step, t))
    rounds.append({
        "name": name, "flagUrl": flag_e, "emoji": emoji, "metric": metric,
        "q": q, "unit": unit, "min": minv, "max": maxv, "step": step,
        "target": t, "actualText": actual_txt, "fact": fact,
        "url": url, "linkLabel": link, "bg": random.choice(BGS),
        "hard": hard,
    })

# ------------------------------------------------- metro population (millions)
POP_CITIES = ["tokyo", "new-york", "london", "paris", "los-angeles", "delhi",
              "shanghai", "sao-paulo", "mexico-city", "cairo", "mumbai",
              "moscow", "istanbul", "seoul", "jakarta", "madrid", "toronto",
              "sydney", "chicago", "singapore", "lagos", "buenos-aires"]
bymslug = {m["slug"]: m for m in metros}
for slug in POP_CITIES:
    m = bymslug.get(slug)
    if not m or not m.get("pop"):
        continue
    mm = m["pop"] / 1e6
    add(m["name"], flag(m.get("countrySlug")), "👥", "population",
        "How many people live in the %s metro area? Somewhere between 1 and 55 million…" % m["name"],
        "million people", 1, 55, 1, mm,
        "about %.1f million people" % mm,
        "That counts the whole metro area — the city plus all its suburbs. %s ranks #%d in the world metro power rankings!" % (m["name"], m.get("rank", 0)),
        "%s/rankings/%s" % (BASE, m["slug"]),
        "See %s on the site →" % m["name"])

# ------------------------------------------------- skyscrapers (count)
SKY = sorted([m for m in metros if (m.get("skyscrapers") or 0) >= 40 and m.get("rank", 999) <= 60],
             key=lambda m: -m["skyscrapers"])[:14]
for m in SKY:
    v = m["skyscrapers"]
    add(m["name"], flag(m.get("countrySlug")), "🏙️", "skyscrapers",
        "How many skyscrapers does %s have? Somewhere between 0 and 900…" % m["name"],
        "skyscrapers", 0, 900, 20, v,
        "%d skyscrapers" % v,
        "%s has %d skyscrapers — that's a serious skyline!" % (m["name"], v),
        "%s/rankings/%s" % (BASE, m["slug"]),
        "See %s on the site →" % m["name"])

# ------------------------------------------------- metro stations (count)
STN = sorted([m for m in metros if (m.get("metroStations") or 0) >= 120 and m.get("rank", 999) <= 60],
             key=lambda m: -m["metroStations"])[:12]
for m in STN:
    v = m["metroStations"]
    add(m["name"], flag(m.get("countrySlug")), "🚇", "metro stations",
        "How many metro stations does %s have? Somewhere between 0 and 900…" % m["name"],
        "stations", 0, 900, 20, v,
        "%d metro stations" % v,
        "%s has %d metro stations on its underground railway network." % (m["name"], v),
        "%s/rankings/%s" % (BASE, m["slug"]),
        "See %s on the site →" % m["name"])

# ------------------------------------------------- billionaire net worth ($bn) — magnitude only
for b in billionaires[:8]:
    nm = b["name"].replace("⚠️", "").strip()
    bn = b["networth"] / 1000.0  # data is $ millions
    add(nm, flag(b.get("countrySlug")), "💰", "net worth",
        "%s is one of the richest people on Earth. How many BILLION dollars? Between 0 and 900…" % nm,
        "billion dollars", 0, 900, 25, bn,
        "about $%d billion" % int(round(bn)),
        "%s has about $%d billion. One billion is a thousand millions — these numbers are for practising BIG place value, not a shopping list!" % (nm, int(round(bn))),
        "%s/billionaires" % BASE,
        "See the billionaires list →", hard=True)

random.shuffle(rounds)
HL = {
    "BASE": BASE,
    "HEADER": {
        "logoEmoji": "🎯", "logoText": "Higher or Lower",
        "title": "Higher or Lower — Play and Learn",
        "grown": "For grown-ups: binary search — narrow a range by halving it. Guess a value on the number line and the game answers higher or lower, shading out everything you've ruled out. Scoring rewards FEW guesses, not speed; the robot hint teaches 'always try the middle', which is exactly how computers search. Estimation and place value into the millions and billions. Ages 7–10.",
        "finaleH": "🎯 Search champion!",
        "finaleP": "You hunted every number down!",
        "again": "Play again 🔁",
    },
    "ROUND_PICK": 5,
    "ROUNDS": rounds,
}
out = os.path.join(ROOT, "public/play/games/pools/higher-or-lower.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.HLGAME=" + json.dumps(HL, ensure_ascii=False) + ";\n")
bad = [r for r in rounds if abs(r["target"] - snap((r["min"] + r["max"]) / 2, r["step"])) >= 0 and not (r["min"] < r["target"] < r["max"])]
clamped = [r["name"] for r in rounds if r["target"] in (r["min"] + r["step"], r["max"] - r["step"])]
print("higher-or-lower.js: %d rounds (%d hard); edge-targets (check ranges!): %s" % (len(rounds), sum(1 for r in rounds if r["hard"]), clamped or "none"))
