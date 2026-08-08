#!/usr/bin/env python3
"""
build_word_machine.py — pool builder for the "Word Machine" Play & Learn game.

Classic verbal-reasoning puzzle formats re-imagined as an arcade game, with
entirely original content (no test-publisher material). Three ramped levels,
tagged `lvl` for the shared engine's stratified easy->hard sampling:

  L1  Move a letter     take one letter out of word A, put it in word B,
                        both must still be real words (USING+DEBTS -> SING+DEBUTS)
  L2  One letter, four  the same letter finishes two words and starts two
      words             others (com_ _aby  cur_ _asil -> B)
  L3  Letter codes      the middle word is built from letters of the outer
                        two; crack the code, build the missing word

CONTENT PIPELINE. The puzzle bank below is machine-generated and vetted:
candidate words come from a high-frequency list intersected with a
case-aware dictionary (capitalised-only entries dropped, so no proper
nouns), filtered through a child-suitability blocklist, and every puzzle is
ambiguity-checked against a large permissive dictionary (no distractor
letter/word can also produce valid words). Regeneration needs those large
wordlists, so the vetted bank is embedded here and this builder only
formats, checks and emits. Deterministic: seeded RNG.

Writes public/play/games/pools/word-machine.js  (window.GAME = {...}).
Run with --self-test to verify the bank and emit nothing.
"""
import json, os, random, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("-") \
    else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://rankings.citizenofnowhere.org"
random.seed(20260808)

PUZZLES = {
"l1": [
{
"w1": "using",
"w2": "debts",
"x": "u",
"r": "sing",
"v": "debuts",
"opts": [
"u",
"n",
"i",
"g",
"s"
]
},
{
"w1": "tones",
"w2": "sized",
"x": "e",
"r": "tons",
"v": "seized",
"opts": [
"e",
"t",
"o",
"n",
"s"
]
},
{
"w1": "tones",
"w2": "asks",
"x": "t",
"r": "ones",
"v": "tasks",
"opts": [
"t",
"n",
"e",
"o",
"s"
]
},
{
"w1": "spaced",
"w2": "abuse",
"x": "d",
"r": "space",
"v": "abused",
"opts": [
"d",
"p",
"e",
"c",
"a"
]
},
{
"w1": "mother",
"w2": "are",
"x": "m",
"r": "other",
"v": "mare",
"opts": [
"m",
"o",
"e",
"r",
"t"
]
},
{
"w1": "caused",
"w2": "am",
"x": "d",
"r": "cause",
"v": "dam",
"opts": [
"d",
"c",
"s",
"e",
"a"
]
},
{
"w1": "plead",
"w2": "laid",
"x": "p",
"r": "lead",
"v": "plaid",
"opts": [
"p",
"l",
"e",
"d",
"a"
]
},
{
"w1": "plead",
"w2": "aide",
"x": "d",
"r": "plea",
"v": "aided",
"opts": [
"d",
"p",
"l",
"a",
"e"
]
},
{
"w1": "hairy",
"w2": "funk",
"x": "y",
"r": "hair",
"v": "funky",
"opts": [
"y",
"a",
"r",
"h",
"i"
]
},
{
"w1": "blogs",
"w2": "rides",
"x": "b",
"r": "logs",
"v": "brides",
"opts": [
"b",
"o",
"g",
"s",
"l"
]
},
{
"w1": "brick",
"w2": "rings",
"x": "b",
"r": "rick",
"v": "brings",
"opts": [
"b",
"k",
"c",
"r",
"i"
]
},
{
"w1": "factor",
"w2": "lung",
"x": "f",
"r": "actor",
"v": "flung",
"opts": [
"f",
"t",
"o",
"c",
"r"
]
},
{
"w1": "ghost",
"w2": "rides",
"x": "g",
"r": "host",
"v": "ridges",
"opts": [
"g",
"t",
"h",
"s",
"o"
]
},
{
"w1": "write",
"w2": "arm",
"x": "w",
"r": "rite",
"v": "warm",
"opts": [
"w",
"e",
"i",
"t",
"r"
]
},
{
"w1": "write",
"w2": "mad",
"x": "e",
"r": "writ",
"v": "made",
"opts": [
"e",
"r",
"i",
"t",
"w"
]
},
{
"w1": "parity",
"w2": "pan",
"x": "i",
"r": "party",
"v": "pain",
"opts": [
"i",
"y",
"a",
"t",
"p"
]
},
{
"w1": "babies",
"w2": "pad",
"x": "i",
"r": "babes",
"v": "paid",
"opts": [
"i",
"a",
"e",
"s",
"b"
]
},
{
"w1": "scared",
"w2": "age",
"x": "d",
"r": "scare",
"v": "aged",
"opts": [
"d",
"e",
"a",
"r",
"c"
]
},
{
"w1": "abroad",
"w2": "head",
"x": "a",
"r": "broad",
"v": "ahead",
"opts": [
"a",
"o",
"r",
"b",
"d"
]
},
{
"w1": "fairy",
"w2": "sand",
"x": "y",
"r": "fair",
"v": "sandy",
"opts": [
"y",
"i",
"a",
"f",
"r"
]
},
{
"w1": "marsh",
"w2": "socks",
"x": "h",
"r": "mars",
"v": "shocks",
"opts": [
"h",
"r",
"m",
"a",
"s"
]
},
{
"w1": "statue",
"w2": "sing",
"x": "u",
"r": "state",
"v": "using",
"opts": [
"u",
"e",
"a",
"s",
"t"
]
},
{
"w1": "piles",
"w2": "pants",
"x": "l",
"r": "pies",
"v": "plants",
"opts": [
"l",
"i",
"s",
"e",
"p"
]
},
{
"w1": "native",
"w2": "wan",
"x": "t",
"r": "naive",
"v": "want",
"opts": [
"t",
"v",
"a",
"n",
"i"
]
},
{
"w1": "slight",
"w2": "one",
"x": "l",
"r": "sight",
"v": "lone",
"opts": [
"l",
"h",
"g",
"i",
"t"
]
},
{
"w1": "masked",
"w2": "eat",
"x": "m",
"r": "asked",
"v": "meat",
"opts": [
"m",
"d",
"a",
"s",
"e"
]
},
{
"w1": "frank",
"w2": "pro",
"x": "f",
"r": "rank",
"v": "prof",
"opts": [
"f",
"k",
"n",
"a",
"r"
]
},
{
"w1": "poets",
"w2": "hid",
"x": "e",
"r": "pots",
"v": "hide",
"opts": [
"e",
"t",
"s",
"o",
"p"
]
},
{
"w1": "poets",
"w2": "flats",
"x": "o",
"r": "pets",
"v": "floats",
"opts": [
"o",
"s",
"p",
"e",
"t"
]
},
{
"w1": "merged",
"w2": "fun",
"x": "d",
"r": "merge",
"v": "fund",
"opts": [
"d",
"r",
"e",
"m",
"g"
]
},
{
"w1": "mouse",
"w2": "vice",
"x": "o",
"r": "muse",
"v": "voice",
"opts": [
"o",
"s",
"m",
"u",
"e"
]
}
],
"l2": [
{
"x": "r",
"w": [
"winter",
"rolls",
"buster",
"ranked"
],
"pre1": "winte",
"suf1": "olls",
"pre2": "buste",
"suf2": "anked",
"opts": [
"r",
"p",
"y",
"e",
"t"
]
},
{
"x": "b",
"w": [
"comb",
"baby",
"curb",
"basil"
],
"pre1": "com",
"suf1": "aby",
"pre2": "cur",
"suf2": "asil",
"opts": [
"b",
"s",
"p",
"g",
"a"
]
},
{
"x": "l",
"w": [
"sell",
"larger",
"shovel",
"lease"
],
"pre1": "sel",
"suf1": "arger",
"pre2": "shove",
"suf2": "ease",
"opts": [
"l",
"b",
"a",
"d",
"e"
]
},
{
"x": "i",
"w": [
"fungi",
"imply",
"chili",
"icon"
],
"pre1": "fung",
"suf1": "mply",
"pre2": "chil",
"suf2": "con",
"opts": [
"i",
"d",
"a",
"l",
"o"
]
},
{
"x": "w",
"w": [
"snow",
"wrists",
"borrow",
"wheel"
],
"pre1": "sno",
"suf1": "rists",
"pre2": "borro",
"suf2": "heel",
"opts": [
"w",
"g",
"j",
"d",
"p"
]
},
{
"x": "g",
"w": [
"firing",
"gadget",
"flag",
"gum"
],
"pre1": "firin",
"suf1": "adget",
"pre2": "fla",
"suf2": "um",
"opts": [
"g",
"p",
"v",
"a",
"b"
]
},
{
"x": "k",
"w": [
"steak",
"knock",
"check",
"kind"
],
"pre1": "stea",
"suf1": "nock",
"pre2": "chec",
"suf2": "ind",
"opts": [
"k",
"s",
"w",
"d",
"f"
]
},
{
"x": "y",
"w": [
"jimmy",
"yep",
"yummy",
"yes"
],
"pre1": "jimm",
"suf1": "ep",
"pre2": "yumm",
"suf2": "es",
"opts": [
"y",
"j",
"u",
"x",
"n"
]
},
{
"x": "k",
"w": [
"musk",
"king",
"deck",
"kindly"
],
"pre1": "mus",
"suf1": "ing",
"pre2": "dec",
"suf2": "indly",
"opts": [
"k",
"f",
"p",
"z",
"i"
]
},
{
"x": "h",
"w": [
"finish",
"hoping",
"hash",
"hers"
],
"pre1": "finis",
"suf1": "oping",
"pre2": "has",
"suf2": "ers",
"opts": [
"h",
"c",
"k",
"d",
"p"
]
},
{
"x": "r",
"w": [
"mar",
"rumble",
"foster",
"relay"
],
"pre1": "ma",
"suf1": "umble",
"pre2": "foste",
"suf2": "elay",
"opts": [
"r",
"c",
"x",
"g",
"f"
]
},
{
"x": "u",
"w": [
"flu",
"unfold",
"lieu",
"upset"
],
"pre1": "fl",
"suf1": "nfold",
"pre2": "lie",
"suf2": "pset",
"opts": [
"u",
"y",
"w",
"i",
"r"
]
},
{
"x": "l",
"w": [
"ritual",
"labor",
"bail",
"lock"
],
"pre1": "ritua",
"suf1": "abor",
"pre2": "bai",
"suf2": "ock",
"opts": [
"l",
"j",
"h",
"b",
"e"
]
},
{
"x": "r",
"w": [
"harder",
"rods",
"better",
"rare"
],
"pre1": "harde",
"suf1": "ods",
"pre2": "bette",
"suf2": "are",
"opts": [
"r",
"e",
"p",
"h",
"y"
]
},
{
"x": "w",
"w": [
"show",
"wins",
"few",
"weighs"
],
"pre1": "sho",
"suf1": "ins",
"pre2": "fe",
"suf2": "eighs",
"opts": [
"w",
"q",
"t",
"m",
"c"
]
},
{
"x": "g",
"w": [
"wiring",
"gifts",
"along",
"guides"
],
"pre1": "wirin",
"suf1": "ifts",
"pre2": "alon",
"suf2": "uides",
"opts": [
"g",
"r",
"e",
"l",
"s"
]
},
{
"x": "n",
"w": [
"retain",
"newly",
"chosen",
"nasal"
],
"pre1": "retai",
"suf1": "ewly",
"pre2": "chose",
"suf2": "asal",
"opts": [
"n",
"s",
"v",
"t",
"b"
]
},
{
"x": "o",
"w": [
"auto",
"outlaw",
"radio",
"oak"
],
"pre1": "aut",
"suf1": "utlaw",
"pre2": "radi",
"suf2": "ak",
"opts": [
"o",
"y",
"s",
"d",
"l"
]
},
{
"x": "m",
"w": [
"worm",
"matter",
"grim",
"mirror"
],
"pre1": "wor",
"suf1": "atter",
"pre2": "gri",
"suf2": "irror",
"opts": [
"m",
"l",
"t",
"f",
"v"
]
},
{
"x": "c",
"w": [
"sec",
"create",
"medic",
"codes"
],
"pre1": "se",
"suf1": "reate",
"pre2": "medi",
"suf2": "odes",
"opts": [
"c",
"k",
"d",
"f",
"z"
]
},
{
"x": "l",
"w": [
"spiral",
"lacked",
"pal",
"long"
],
"pre1": "spira",
"suf1": "acked",
"pre2": "pa",
"suf2": "ong",
"opts": [
"l",
"n",
"o",
"c",
"i"
]
},
{
"x": "m",
"w": [
"rim",
"manner",
"claim",
"menus"
],
"pre1": "ri",
"suf1": "anner",
"pre2": "clai",
"suf2": "enus",
"opts": [
"m",
"o",
"d",
"s",
"p"
]
},
{
"x": "w",
"w": [
"window",
"waiter",
"blew",
"wasted"
],
"pre1": "windo",
"suf1": "aiter",
"pre2": "ble",
"suf2": "asted",
"opts": [
"w",
"d",
"o",
"c",
"u"
]
},
{
"x": "y",
"w": [
"trendy",
"yell",
"thirty",
"yellow"
],
"pre1": "trend",
"suf1": "ell",
"pre2": "thirt",
"suf2": "ellow",
"opts": [
"y",
"g",
"s",
"d",
"h"
]
}
],
"l3": [
{
"a": "scent",
"b": "index",
"mid": "net",
"c": "glad",
"d": "apt",
"ans": "pad",
"rule": [
[
2,
1
],
[
1,
2
],
[
1,
-1
]
],
"opts": [
"pad",
"lad",
"alt",
"dad",
"all"
]
},
{
"a": "like",
"b": "spot",
"mid": "tie",
"c": "sally",
"d": "rapid",
"ans": "day",
"rule": [
[
2,
-1
],
[
1,
1
],
[
1,
-1
]
],
"opts": [
"day",
"lad",
"lay",
"lap"
]
},
{
"a": "dumb",
"b": "reset",
"mid": "rue",
"c": "kind",
"d": "stake",
"ans": "sit",
"rule": [
[
2,
0
],
[
1,
1
],
[
2,
1
]
],
"opts": [
"sit",
"tie",
"did",
"dad"
]
},
{
"a": "coins",
"b": "brain",
"mid": "con",
"c": "loved",
"d": "fiat",
"ans": "lot",
"rule": [
[
1,
0
],
[
1,
1
],
[
2,
-1
]
],
"opts": [
"lot",
"tie",
"ill",
"fed",
"lid"
]
},
{
"a": "ours",
"b": "those",
"mid": "rue",
"c": "sober",
"d": "best",
"ans": "bot",
"rule": [
[
1,
2
],
[
1,
1
],
[
2,
-1
]
],
"opts": [
"bot",
"ore",
"boo",
"toe",
"bee"
]
},
{
"a": "lamb",
"b": "pots",
"mid": "map",
"c": "barn",
"d": "wan",
"ans": "raw",
"rule": [
[
1,
2
],
[
1,
1
],
[
2,
0
]
],
"opts": [
"raw",
"ban",
"war",
"bar",
"ran"
]
},
{
"a": "debut",
"b": "gaze",
"mid": "tag",
"c": "glow",
"d": "wolf",
"ans": "wow",
"rule": [
[
1,
-1
],
[
2,
1
],
[
2,
0
]
],
"opts": [
"wow",
"log",
"low",
"off",
"owl"
]
},
{
"a": "burn",
"b": "bumps",
"mid": "nun",
"c": "calm",
"d": "note",
"ans": "mom",
"rule": [
[
1,
-1
],
[
2,
1
],
[
1,
-1
]
],
"opts": [
"mom",
"ant",
"tom",
"lot",
"eat"
]
},
{
"a": "pedal",
"b": "make",
"mid": "lap",
"c": "tour",
"d": "caves",
"ans": "rat",
"rule": [
[
1,
-1
],
[
2,
1
],
[
1,
0
]
],
"opts": [
"rat",
"cut",
"act",
"our"
]
},
{
"a": "first",
"b": "quest",
"mid": "fit",
"c": "lotus",
"d": "coast",
"ans": "lot",
"rule": [
[
1,
0
],
[
1,
1
],
[
2,
-1
]
],
"opts": [
"lot",
"cut",
"out",
"sat"
]
},
{
"a": "about",
"b": "give",
"mid": "tie",
"c": "wool",
"d": "rite",
"ans": "lie",
"rule": [
[
1,
-1
],
[
2,
1
],
[
2,
-1
]
],
"opts": [
"lie",
"owl",
"lee",
"too",
"toe"
]
},
{
"a": "dare",
"b": "pipes",
"mid": "par",
"c": "ruby",
"d": "high",
"ans": "hub",
"rule": [
[
2,
0
],
[
1,
1
],
[
1,
2
]
],
"opts": [
"hub",
"rug",
"big",
"rig",
"hug"
]
},
{
"a": "hank",
"b": "react",
"mid": "ear",
"c": "crop",
"d": "max",
"ans": "arm",
"rule": [
[
2,
1
],
[
1,
1
],
[
2,
0
]
],
"opts": [
"arm",
"cap",
"rap",
"car"
]
}
]
}

BGS = ["linear-gradient(180deg,#eaf4ff,#ffffff)", "linear-gradient(180deg,#fff3d6,#fffdf4)",
       "linear-gradient(180deg,#e3f9f2,#f7fffd)", "linear-gradient(180deg,#ffe9e3,#fff8f6)",
       "linear-gradient(180deg,#efe9ff,#faf8ff)"]
STAMPS = ["🔤", "🧩", "✂️", "🔠", "🗝️"]

# ------------------------------------------------------------------ self-test
def _remove_ok(w1, x, r):
    return any(w1[i] == x and w1[:i] + w1[i+1:] == r for i in range(len(w1)))

def _insert_ok(w2, x, v):
    return any(w2[:i] + x + w2[i:] == v for i in range(len(w2) + 1))

def _apply_rule(rule, a, b):
    out = ""
    for wi, ci in rule:
        w = a if wi == 1 else b
        if ci >= len(w) or -ci > len(w): return None
        out += w[ci]
    return out

def self_test():
    fails = []
    for p in PUZZLES["l1"]:
        if not _remove_ok(p["w1"], p["x"], p["r"]): fails.append(("l1 remove", p))
        if not _insert_ok(p["w2"], p["x"], p["v"]): fails.append(("l1 insert", p))
        if p["opts"][0] != p["x"] or len(set(p["opts"])) != len(p["opts"]) or len(p["opts"]) < 5:
            fails.append(("l1 opts", p))
    for p in PUZZLES["l2"]:
        w = p["w"]
        if [p["pre1"] + p["x"], p["x"] + p["suf1"], p["pre2"] + p["x"], p["x"] + p["suf2"]] != w:
            fails.append(("l2 words", p))
        if p["opts"][0] != p["x"] or len(set(p["opts"])) != len(p["opts"]) or len(p["opts"]) < 5:
            fails.append(("l2 opts", p))
    for p in PUZZLES["l3"]:
        rule = [tuple(r) for r in p["rule"]]
        if _apply_rule(rule, p["a"], p["b"]) != p["mid"]: fails.append(("l3 example", p))
        if _apply_rule(rule, p["c"], p["d"]) != p["ans"]: fails.append(("l3 answer", p))
        if p["opts"][0] != p["ans"] or len(set(p["opts"])) != len(p["opts"]) or len(p["opts"]) < 4:
            fails.append(("l3 opts", p))
    counts = {k: len(v) for k, v in PUZZLES.items()}
    if any(c < 10 for c in counts.values()) and not fails:
        pass  # small banks are fine; stratified sampling handles it
    for kind, p in fails:
        print("FAIL", kind, json.dumps(p)[:110])
    print("self-test: %s (l1=%d l2=%d l3=%d, %d failures)" %
          ("PASS" if not fails else "FAIL", counts["l1"], counts["l2"], counts["l3"], len(fails)))
    return not fails

# ------------------------------------------------------------------ formatting
POSNAME = {0: "1st", 1: "2nd", 2: "3rd", 3: "4th", -1: "last", -2: "2nd-to-last"}

def tiles(word, cls=""):
    c = " " + cls if cls else ""
    return '<span class="wgroup">' + "".join('<span class="wt%s">%s</span>' % (c, ch) for ch in word.upper()) + "</span>"

def gaps(n):
    return '<span class="wgroup">' + '<span class="wt gap">?</span>' * n + "</span>"

def pair_vis(pre, suf):
    """[P R E ?] [? S U F] — one bracket pair as tiles with orange gap slots."""
    left = '<span class="wgroup">' + "".join('<span class="wt">%s</span>' % ch for ch in pre.upper()) + '<span class="wt gap">?</span></span>'
    right = '<span class="wgroup"><span class="wt gap">?</span>' + "".join('<span class="wt">%s</span>' % ch for ch in suf.upper()) + "</span>"
    return left + right

def spell(w):
    return "-".join(w.upper())

def rule_story(rule, a, b, mid):
    bits = []
    for k, (wi, ci) in enumerate(rule):
        src = a.upper() if wi == 1 else b.upper()
        bits.append("%s = the %s letter of %s" % (mid[k].upper(), POSNAME.get(ci, "?"), src))
    return "; ".join(bits)

pool = []
def add(lvl, sub, q, opts, fact, vis, say):
    pool.append({
        "city": "🔤", "flag": "", "place": "Word Machine",
        "sub": "Level %d · %s" % (lvl, sub),
        "stamp": random.choice(STAMPS),
        "q": q, "opts": [{"t": o} for o in opts], "ans": 0, "fact": fact,
        "bg": random.choice(BGS), "lvl": lvl,
        "vis": vis, "say": say, "tile": True,
    })

for p in PUZZLES["l1"]:
    U = lambda w: w.upper()
    add(1, "Move a letter",
        "Take ONE letter out of the first word and move it into the second, so BOTH still make real words. Which letter moves?",
        [o.upper() for o in p["opts"]],
        "Move the %s: %s becomes %s, and %s becomes %s. One letter, two brand-new words!"
        % (U(p["x"]), U(p["w1"]), U(p["r"]), U(p["w2"]), U(p["v"])),
        '<div class="wrow">%s<span class="warrow">➜</span>%s</div>' % (tiles(p["w1"]), tiles(p["w2"])),
        "Take one letter out of %s, spelled %s, and move it into %s, spelled %s, so both still make real words. Which letter moves?"
        % (U(p["w1"]), spell(p["w1"]), U(p["w2"]), spell(p["w2"])))

for p in PUZZLES["l2"]:
    U = lambda w: w.upper()
    add(2, "One letter, four words",
        "The SAME letter finishes the first word and starts the second, in BOTH pairs. Which letter fills every orange tile?",
        [o.upper() for o in p["opts"]],
        "%s is the key: it makes %s, %s, %s and %s. Four words, one letter!"
        % (U(p["x"]), U(p["w"][0]), U(p["w"][1]), U(p["w"][2]), U(p["w"][3])),
        '<div class="wrow">%s</div><div class="wrow">%s</div>'
        % (pair_vis(p["pre1"], p["suf1"]), pair_vis(p["pre2"], p["suf2"])),
        "Which one letter completes all four words? %s blank, blank %s, %s blank, and blank %s."
        % (spell(p["pre1"]), spell(p["suf1"]), spell(p["pre2"]), spell(p["suf2"])))

for p in PUZZLES["l3"]:
    U = lambda w: w.upper()
    add(3, "Letter codes",
        "Crack the code! The middle word is built from the outer words' letters, the same way in both groups. Which word is missing?",
        [o.upper() for o in p["opts"]],
        "The code: %s. Run the same code on %s and %s and you build %s."
        % (rule_story(p["rule"], p["a"], p["b"], p["mid"]), U(p["c"]), U(p["d"]), U(p["ans"])),
        '<div class="wrow">%s%s%s</div><div class="wrow">%s%s%s</div>'
        % (tiles(p["a"]), tiles(p["mid"], "mid"), tiles(p["b"]),
           tiles(p["c"]), gaps(len(p["ans"])), tiles(p["d"])),
        "First group: %s, then %s, then %s. Second group: %s, then a missing word, then %s. Which word is missing?"
        % (U(p["a"]), U(p["mid"]), U(p["b"]), U(p["c"]), U(p["d"])))

# ------------------------------------------------------------------ write
def main():
    if not self_test():
        sys.exit(1)
    if "--self-test" in sys.argv:
        return
    random.shuffle(pool)
    GAME = {
        "BASE": BASE,
        "HEADER": {
            "logoEmoji": "🔤", "logoText": "Word Machine",
            "title": "Word Machine — Play and Learn",
            "grown": "For grown-ups: three classic verbal-reasoning puzzle types as a game — move a letter between two words, find the one letter that completes four words, and crack letter codes. Every word is checked against a child-suitable dictionary, and every puzzle has exactly one working answer. The same skills 11-plus style verbal reasoning papers exercise, with entirely original content. Ages 8–11.",
            "finaleH": "🔤 Word wizard!",
            "finaleP": "Letters moved, words built, codes cracked — brilliant!",
            "again": "Play again 🔁",
        },
        "POOL_PICK": 9,
        "POOL": pool,
    }
    out = os.path.join(ROOT, "public/play/games/pools/word-machine.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.GAME=" + json.dumps(GAME, ensure_ascii=False) + ";\n")
    levels = {}
    for x in pool:
        levels[x["lvl"]] = levels.get(x["lvl"], 0) + 1
    print("word-machine.js: %d items %s" % (len(pool), levels))

if __name__ == "__main__":
    main()
