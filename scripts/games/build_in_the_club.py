#!/usr/bin/env python3
"""
build_in_the_club.py — pool builder for the "In the Club" Play & Learn game.

Boolean logic / set theory dressed as geography: which countries are in which
international organisations (UN, EU, NATO, G7, G20, Commonwealth, OPEC,
African Union, ASEAN, OECD). Four ramped levels, tagged with `lvl` for the
shared engine's stratified easy->hard sampling (engine.js, 2026-08-06):

  L1  membership        "Which of these is in the EU?"
  L2  NOT               "Which country is in NATO but NOT in the EU?"
  L3  AND               "Which country is in BOTH the G20 AND the OECD?"
  L4  OR + status       full member vs candidate/applicant; "EU OR NATO"

Reads  public/data/country-orgs.json  (slug -> {ORG: status}),
       public/data/countries.json     (names, pop, continent),
       public/data/country-facts.json (iso3166 -> flag emoji).
Writes public/play/games/pools/in-the-club.js  (window.GAME = {...}).

Only full "Member" status counts as membership; Candidate/Observer/Guest/
Applicant/Dialogue/Partner are treated as NOT a member (and L4 quizzes that
distinction explicitly). Deterministic: seeded RNG.
"""
import json, os, random, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rankings.citizenofnowhere.org"
random.seed(20260806)

orgs_by_country = json.load(open(os.path.join(ROOT, "public/data/country-orgs.json"), encoding="utf-8"))
countries = {c["slug"]: c for c in json.load(open(os.path.join(ROOT, "public/data/countries.json"), encoding="utf-8"))}
facts = json.load(open(os.path.join(ROOT, "public/data/country-facts.json"), encoding="utf-8"))["countries"]

# Countries we never quiz on in the kids' games.
EXCLUDE = {"israel", "palestine"}

def iso2(slug):
    iso = (facts.get(slug) or {}).get("iso3166") or ""
    return iso.lower() if len(iso) == 2 else ""

def flag(slug):
    """flagcdn image URL — flag EMOJI don't render on Windows, always use images."""
    c = iso2(slug)
    return "https://flagcdn.com/w160/%s.png" % c if c else ""

def name(slug):
    return countries[slug]["name"] if slug in countries else slug.replace("-", " ").title()

def continent(slug):
    return (countries.get(slug) or {}).get("continent") or ""

def pop(slug):
    return (countries.get(slug) or {}).get("pop") or 0

def status(slug, org):
    return (orgs_by_country.get(slug) or {}).get(org)

def is_member(slug, org):
    return status(slug, org) == "Member"

# Recognisable-country filter: big populations, or member of a headline club,
# plus a curated shortlist of famous smaller countries.
EXTRA_KNOWN = {"new-zealand", "ireland", "norway", "switzerland", "iceland",
               "qatar", "united-arab-emirates", "singapore", "uruguay",
               "jamaica", "kuwait", "austria", "denmark", "finland", "sweden",
               "portugal", "greece", "croatia", "serbia", "albania"}
def known(slug):
    if slug in EXCLUDE or slug not in countries or not flag(slug):
        return False
    if slug in EXTRA_KNOWN:
        return True
    if pop(slug) >= 8_000_000:
        return True
    return any(is_member(slug, o) for o in ("EU", "NATO", "G7", "G20"))

KNOWN = sorted(s for s in orgs_by_country if known(s))

ORG = {
    "UN":            {"emoji": "🕊️", "label": "the United Nations (UN)", "short": "UN"},
    "EU":            {"emoji": "⭐", "label": "the European Union (EU)", "short": "EU"},
    "NATO":          {"emoji": "🛡️", "label": "NATO", "short": "NATO"},
    "G7":            {"emoji": "💼", "label": "the G7 club of big economies", "short": "G7"},
    "G20":           {"emoji": "🌐", "label": "the G20", "short": "G20"},
    "Commonwealth":  {"emoji": "👑", "label": "the Commonwealth", "short": "Commonwealth"},
    "OPEC":          {"emoji": "🛢️", "label": "OPEC, the oil producers' club", "short": "OPEC"},
    "African Union": {"emoji": "🌍", "label": "the African Union", "short": "African Union"},
    "ASEAN":         {"emoji": "🌏", "label": "ASEAN, the Southeast Asia club", "short": "ASEAN"},
    "OECD":          {"emoji": "📊", "label": "the OECD", "short": "OECD"},
}
BGS = ["linear-gradient(180deg,#eaf4ff,#ffffff)", "linear-gradient(180deg,#fff3d6,#fffdf4)",
       "linear-gradient(180deg,#e3f9f2,#f7fffd)", "linear-gradient(180deg,#ffe9e3,#fff8f6)",
       "linear-gradient(180deg,#efe9ff,#faf8ff)"]
STAMPS = ["🧩", "🔑", "🎟️", "🧠", "🎯"]

def the(short):
    """'the EU' but plain 'NATO'/'OPEC'/'ASEAN'."""
    return short if short in ("NATO", "OPEC", "ASEAN") else "the " + short


def members(org):
    return [s for s in KNOWN if is_member(s, org)]

def famous(slugs, n, avoid=()):
    """Pick n population-weighted-famous slugs, shuffled run to run."""
    cand = [s for s in slugs if s not in avoid]
    cand.sort(key=lambda s: -pop(s))
    top = cand[:max(n * 4, 8)]
    random.shuffle(top)
    return top[:n]

pool = []
def add(lvl, org_emoji, org_short, q, correct, wrong, fact, stamp=None):
    opts = [{"t": name(correct), "logo": flag(correct)}] + \
           [{"t": name(w), "logo": flag(w)} for w in wrong]
    pool.append({
        "city": org_emoji, "flag": "", "place": "In the Club",
        "sub": "Level %d · %s" % (lvl, org_short),
        "stamp": stamp or random.choice(STAMPS),
        "q": q, "opts": opts, "ans": 0, "fact": fact,
        "url": "%s/countries/%s" % (BASE, correct),
        "linkLabel": "See %s on the site →" % name(correct),
        "bg": random.choice(BGS), "lvl": lvl,
    })

# ---------------------------------------------------------------- L1: membership
# Hand-tuned distractor sets so wrong answers are the *interesting* near-misses.
L1_PLANS = [
    ("EU",  ["united-kingdom", "norway", "switzerland", "iceland", "serbia", "albania", "ukraine", "turkey"],
     "%s is a member of the EU. %s and %s are European but NOT in the EU — being in Europe and being in the European Union are different things!"),
    ("NATO", ["ireland", "austria", "switzerland", "serbia", "japan", "australia", "brazil", "mexico"],
     "%s is a NATO member. %s and %s are NOT — a country can be friendly with NATO without being in the club."),
    ("Commonwealth", ["united-states", "france", "brazil", "japan", "china", "ireland", "egypt", "indonesia"],
     "%s is in the Commonwealth, a club of countries with historic ties to Britain. %s and %s are NOT members — the United States left that family long ago!"),
    ("African Union", ["saudi-arabia", "turkey", "iran", "portugal", "spain", "iraq", "greece"],
     "%s is in Africa, so it belongs to the African Union. %s and %s are NOT in Africa, so they are not in this club."),
    ("ASEAN", ["india", "china", "japan", "south-korea", "australia", "pakistan", "bangladesh"],
     "%s is in Southeast Asia, so it belongs to ASEAN. %s and %s are Asian neighbours but NOT members — ASEAN is only for Southeast Asia."),
    ("OPEC", ["united-states", "norway", "brazil", "canada", "mexico", "china", "australia"],
     "%s is in OPEC, the club of big oil producers. %s and %s produce oil too, but they are NOT OPEC members."),
    ("G7",  ["china", "india", "russia", "brazil", "spain", "australia", "south-korea", "mexico"],
     "%s is one of the seven countries in the G7. %s and %s are big countries, but NOT in the G7 — big does not always mean member!"),
    ("G20", ["nigeria", "egypt", "pakistan", "philippines", "colombia", "vietnam", "thailand"],
     "%s is in the G20, the club of the world's twenty biggest economies. %s and %s are NOT members."),
]
for org, wrongs, fact_tpl in L1_PLANS:
    mem = members(org)
    wrongs = [w for w in wrongs if w in countries and not is_member(w, org) and w not in EXCLUDE]
    for correct in famous(mem, 4):
        wr = random.sample(wrongs, 2)
        add(1, ORG[org]["emoji"], ORG[org]["short"],
            "Which of these countries is in %s?" % ORG[org]["label"],
            correct, wr, fact_tpl % (name(correct), name(wr[0]), name(wr[1])))

# ---------------------------------------------------------------- L2: NOT
def l2(org_in, org_not, corrects, n=4):
    """Correct: in org_in but NOT org_not. Distractors: in both."""
    both = [s for s in KNOWN if is_member(s, org_in) and is_member(s, org_not)]
    corrects = [c for c in corrects if is_member(c, org_in) and not is_member(c, org_not)]
    for correct in famous(corrects, n):
        wr = random.sample(both, 2)
        add(2, ORG[org_in]["emoji"], "%s, NOT %s" % (ORG[org_in]["short"], ORG[org_not]["short"]),
            "Which country is in %s but NOT in %s?" % (ORG[org_in]["label"], ORG[org_not]["label"]),
            correct, wr,
            "%s is in %s but NOT in %s. %s and %s are in both clubs. NOT means we leave those out!" %
            (name(correct), the(ORG[org_in]["short"]), the(ORG[org_not]["short"]), name(wr[0]), name(wr[1])))

l2("NATO", "EU", ["united-kingdom", "united-states", "canada", "turkey", "norway", "albania", "iceland"])
l2("EU", "NATO", ["ireland", "austria", "cyprus", "malta"], n=3)
l2("UN", "EU", ["united-kingdom", "norway", "switzerland", "japan", "brazil", "india", "australia", "egypt"])
l2("G20", "G7", ["china", "india", "brazil", "australia", "south-korea", "mexico", "indonesia", "saudi-arabia", "turkey", "argentina", "south-africa"])
l2("OPEC", "African Union", ["saudi-arabia", "venezuela", "iraq", "kuwait", "united-arab-emirates", "iran"], n=3)
# African OPEC members: AND-flavoured NOT ("OPEC members IN Africa") saved for L3.

# ---------------------------------------------------------------- L3: AND
def l3(org_a, org_b, n=4):
    both = [s for s in KNOWN if is_member(s, org_a) and is_member(s, org_b)]
    only_a = [s for s in KNOWN if is_member(s, org_a) and not is_member(s, org_b)]
    only_b = [s for s in KNOWN if is_member(s, org_b) and not is_member(s, org_a)]
    if not (both and only_a and only_b):
        return
    for correct in famous(both, n):
        wa, wb = famous(only_a, 1)[0], famous(only_b, 1)[0]
        add(3, "🧩", "%s AND %s" % (ORG[org_a]["short"], ORG[org_b]["short"]),
            "Which country is in BOTH %s AND %s?" % (ORG[org_a]["label"], ORG[org_b]["label"]),
            correct, [wa, wb],
            "%s is in BOTH clubs. %s is in %s but not %s; %s is in %s but not %s. AND means you need both!" %
            (name(correct), name(wa), the(ORG[org_a]["short"]), the(ORG[org_b]["short"]),
             name(wb), the(ORG[org_b]["short"]), the(ORG[org_a]["short"])))

l3("G20", "OECD")
l3("EU", "NATO")
l3("G7", "EU", n=3)             # Germany/France/Italy vs US/UK/Japan
l3("Commonwealth", "G20")       # Australia/Canada/India/South Africa/UK
l3("OPEC", "African Union", n=3)  # Nigeria/Algeria/Libya...
l3("G7", "NATO", n=3)           # Japan is the classic distractor
l3("ASEAN", "G20", n=2)         # Indonesia — the only one!

# ---------------------------------------------------------------- L4: OR + status nuance
# (a) Full member vs candidate/applicant.
def l4_status(org, waiting_status, waiting_word, n=4):
    mem = members(org)
    waiting = [s for s in KNOWN if status(s, org) == waiting_status]
    if len(waiting) < 2:
        return
    for correct in famous(mem, n):
        wr = random.sample(waiting, 2)
        add(4, ORG[org]["emoji"], "%s: member or %s?" % (ORG[org]["short"], waiting_word),
            "Which of these is a FULL MEMBER of %s — not just waiting to join?" % ORG[org]["label"],
            correct, wr,
            "%s is a full member. %s and %s are only %ss — they have asked to join, but they are NOT members yet. In logic, 'nearly in the club' still counts as NOT in the club!" %
            (name(correct), name(wr[0]), name(wr[1]), waiting_word))

l4_status("EU", "Candidate", "candidate")
l4_status("OECD", "Candidate", "candidate", n=3)
l4_status("NATO", "Applicant", "applicant", n=2)

# (b) OR questions: in A or B (either counts); distractors in neither.
def l4_or(org_a, org_b, corrects, neither, n=4):
    ok = [c for c in corrects
          if is_member(c, org_a) != is_member(c, org_b)]  # exactly one — the teaching case
    nope_ = [s for s in neither
             if s in countries and not is_member(s, org_a) and not is_member(s, org_b) and s not in EXCLUDE]
    for correct in famous(ok, n):
        wr = random.sample(nope_, 2)
        in_a = is_member(correct, org_a)
        yes_org = ORG[org_a]["short"] if in_a else ORG[org_b]["short"]
        no_org = ORG[org_b]["short"] if in_a else ORG[org_a]["short"]
        add(4, "🧩", "%s OR %s" % (ORG[org_a]["short"], ORG[org_b]["short"]),
            "Which country is in %s OR %s? (Either one counts!)" % (ORG[org_a]["label"], ORG[org_b]["label"]),
            correct, wr,
            "OR means at least one. %s is not in %s, but it IS in %s — so it counts! %s and %s are in neither." %
            (name(correct), the(no_org), the(yes_org), name(wr[0]), name(wr[1])))

l4_or("EU", "NATO",
      ["norway", "turkey", "united-kingdom", "united-states", "canada", "ireland", "austria", "iceland", "albania"],
      ["switzerland", "japan", "brazil", "australia", "egypt", "south-africa", "india", "mexico", "new-zealand"])
l4_or("Commonwealth", "EU",
      ["australia", "canada", "india", "new-zealand", "jamaica", "france", "germany", "spain", "portugal"],
      ["united-states", "japan", "brazil", "china", "mexico", "turkey", "norway"])

# ---------------------------------------------------------------- write
random.shuffle(pool)
GAME = {
    "BASE": BASE,
    "HEADER": {
        "logoEmoji": "🧩", "logoText": "In the Club",
        "title": "In the Club — Play and Learn",
        "grown": "For grown-ups: Boolean logic and sets (and / or / not) using real membership of the UN, EU, NATO, the G7 and G20, the Commonwealth, OPEC, the African Union and ASEAN. Levels ramp from simple membership to AND / OR / NOT and member-versus-candidate. KS2 reasoning and a first taste of the logic behind coding. Ages 7–10.",
        "finaleH": "🧩 Club logic champion!",
        "finaleP": "AND, OR, NOT — you cracked the secret code of every club!",
        "again": "Play again 🔁",
    },
    "POOL_PICK": 10,
    "POOL": pool,
}
out = os.path.join(ROOT, "public/play/games/pools/in-the-club.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.GAME=" + json.dumps(GAME, ensure_ascii=False) + ";\n")
levels = {}
for x in pool:
    levels[x["lvl"]] = levels.get(x["lvl"], 0) + 1
print("in-the-club.js: %d items %s" % (len(pool), levels))
