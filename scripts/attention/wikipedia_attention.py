#!/usr/bin/env python3
"""Wikipedia readership as an attention signal. PROTOTYPE, not wired to the site.

Why this exists
---------------
The Zone Zero Cup, the metro rankings and the champions ledger are all SUPPLY
measures: what was won, what was built, who holds a title. The site has no
DEMAND measure at all. index.evidense.io ranks the 43 Olympic federations on
nothing but demand -- Wikipedia readership across 16 language editions plus
Google Trends -- and its own framing is the useful part: "attention is not
demand and not revenue; it is an early signal of both."

This proves the readership half. It deliberately does NOT touch Google Trends:
there is no official API, every route to it is a scrape, and this repo has
already lost jobs to exactly that kind of dependency (the ESPN User-Agent flip,
the WDQS rate limits). One fragile source is worth avoiding when the stable one
carries most of the signal.

First question it is pointed at
------------------------------
`--prestige` compares measured attention per sport with the PRESTIGE weights in
scripts/zzc_v1_multipillar.py, which are hand-set and have been argued over for
months (swimming 0.4, golf 0.75, handball 0.8, football 3.0). If the two broadly
agree, the weights have external support they have never had. Where they
disagree sharply, that is either a defensible editorial choice or a weight worth
revisiting, and either way it is better than asserting.

RED FLAG: read the disagreement carefully before acting on it. Attention and
merit prestige are not the same quantity and are not supposed to be identical.
Cricket will read low relative to its real standing because much of its audience
reads in Hindi, Bengali and Urdu; that is the language-is-a-proxy-for-market-
not-country limitation the EvidenSe method states, and it is the single biggest
caveat on everything below.

Usage
-----
    python scripts/attention/wikipedia_attention.py --self-test    # offline, no network
    python scripts/attention/wikipedia_attention.py --sports       # fetch the sport set
    python scripts/attention/wikipedia_attention.py --prestige     # compare with the Cup weights
    python scripts/attention/wikipedia_attention.py --sports --days 30 --out /tmp/att.json

Network: Wikimedia's REST pageviews API, which is public, documented, needs no
key, and asks only for an honest User-Agent. Nothing here writes to public/data.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Wikimedia asks every client to identify itself and to give a contact route.
# An anonymous or browser-spoofing agent is the thing that gets a project
# rate-limited, and this repo has been on the wrong end of that before.
UA = "CitizenOfNowhere-AttentionPrototype/0.1 (https://rankings.citizenofnowhere.org; ashwind@gmail.com)"

API = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
       "{project}/all-access/user/{title}/daily/{start}/{end}")

# Language editions and their weights. EvidenSe weight their 16 editions "by
# market size"; these are rough shares of world nominal GDP for the primary
# markets of each language, normalised to sum to 1. They are a starting point
# and are meant to be argued with, which is why they sit here as one visible
# dict rather than being folded into the arithmetic.
#
# RED FLAG: a language is a proxy for a MARKET, not a country. English
# readership is not "the United States", and Spanish is not "Spain". Any
# per-country claim built on this is wrong.
LANG_WEIGHTS = {
    "en": 0.34, "zh": 0.13, "ja": 0.07, "de": 0.06, "es": 0.06,
    "fr": 0.05, "pt": 0.04, "ru": 0.04, "it": 0.03, "ko": 0.03,
    "hi": 0.03, "ar": 0.03, "nl": 0.02, "pl": 0.02, "sv": 0.01, "id": 0.04,
}

# Sports, keyed to the PRESTIGE names in scripts/zzc_v1_multipillar.py, with the
# article title per edition. Only the editions that carry a real article are
# listed; a missing edition drops out of both the numerator and the weight total
# so a sport is never punished for an edition that does not cover it.
#
# Kept short on purpose. This is a prototype whose job is to answer one
# question, not a data pipeline.
SPORTS = {
    "Football":        {"en": "Association football", "es": "Futbol", "de": "Fussball", "fr": "Football", "pt": "Futebol", "it": "Calcio (sport)", "ru": "Футбол", "id": "Sepak bola"},
    "Cricket":         {"en": "Cricket", "hi": "क्रिकेट", "de": "Cricket", "fr": "Cricket"},
    "Basketball":      {"en": "Basketball", "es": "Baloncesto", "de": "Basketball", "fr": "Basket-ball", "zh": "籃球", "ja": "バスケットボール"},
    "Tennis":          {"en": "Tennis", "es": "Tenis", "de": "Tennis", "fr": "Tennis", "ja": "テニス", "ru": "Теннис"},
    "Golf":            {"en": "Golf", "es": "Golf", "de": "Golf", "fr": "Golf", "ja": "ゴルフ", "ko": "골프"},
    "Athletics":       {"en": "Sport of athletics", "es": "Atletismo", "de": "Leichtathletik", "fr": "Athletisme"},
    "Swimming":        {"en": "Swimming (sport)", "es": "Natacion", "de": "Schwimmsport", "fr": "Natation"},
    "Ice Hockey":      {"en": "Ice hockey", "de": "Eishockey", "fr": "Hockey sur glace", "ru": "Хоккей с шайбой", "sv": "Ishockey"},
    "Rugby Union":     {"en": "Rugby union", "fr": "Rugby a XV", "it": "Rugby a 15"},
    "Volleyball":      {"en": "Volleyball", "es": "Voleibol", "de": "Volleyball", "it": "Pallavolo", "pl": "Pilka siatkowa"},
    "Handball":        {"en": "Handball", "de": "Handball", "fr": "Handball", "es": "Balonmano", "pl": "Pilka reczna"},
    "Baseball":        {"en": "Baseball", "ja": "野球", "ko": "야구", "es": "Beisbol"},
    "Badminton":       {"en": "Badminton", "zh": "羽毛球", "id": "Bulu tangkis", "de": "Badminton"},
    "Table Tennis":    {"en": "Table tennis", "zh": "乒乓球", "de": "Tischtennis", "ja": "卓球"},
    "Cycling Road":    {"en": "Road bicycle racing", "fr": "Cyclisme sur route", "it": "Ciclismo su strada", "nl": "Wielersport"},
}


def fetch_views(project, title, start, end, retries=3):
    """Daily views for one article, summed. None when the article has no data.

    A 404 is a normal answer here (the edition does not carry the article) and
    must not be retried or treated as an outage. Anything else gets a short
    backoff, then gives up and returns None rather than aborting the run: one
    missing edition should cost that edition's weight, not the whole sport.
    """
    url = API.format(project=project + ".wikipedia",
                     title=urllib.parse.quote(title.replace(" ", "_"), safe=""),
                     start=start, end=end)
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            return sum(item.get("views", 0) for item in data.get("items", []))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == retries:
                print("  !! %s:%s HTTP %s, giving up on this edition" % (project, title, e.code))
                return None
            time.sleep(attempt * 2)
        except Exception as e:                      # noqa: BLE001 - one edition, never the run
            if attempt == retries:
                print("  !! %s:%s %s, giving up on this edition" % (project, title, e))
                return None
            time.sleep(attempt * 2)
    return None


def weighted_score(per_lang):
    """Market-weighted mean daily views -> a single figure per subject.

    Renormalises over the editions that actually answered, so a subject covered
    in four editions is compared on the same basis as one covered in nine
    instead of being scored as though five editions returned zero. That
    distinction is the difference between "nobody reads about handball in
    Japan" and "ja.wikipedia has no such article", which are not the same claim.
    """
    num = 0.0
    wsum = 0.0
    for lang, views in per_lang.items():
        if views is None:
            continue
        w = LANG_WEIGHTS.get(lang)
        if not w:
            continue
        num += views * w
        wsum += w
    if wsum == 0:
        return None
    return num / wsum


def rescale(scores):
    """0-100 against the top subject, as the EvidenSe index does. Relative, and
    only ever meaningful within one run of one subject set."""
    vals = [v for v in scores.values() if v is not None]
    if not vals:
        return {}
    top = max(vals)
    if top <= 0:
        return dict.fromkeys(scores, 0.0)
    return {k: (round(v / top * 100, 1) if v is not None else None) for k, v in scores.items()}


def run_sports(days, sleep):
    end = date.today() - timedelta(days=2)      # the API lags ~a day; 2 is safe
    start = end - timedelta(days=days - 1)
    s, e = start.strftime("%Y%m%d"), end.strftime("%Y%m%d")
    print("Wikipedia attention, %d days, %s to %s, %d sports\n" % (days, s, e, len(SPORTS)))

    raw, detail = {}, {}
    for sport, titles in SPORTS.items():
        per_lang = {}
        for lang, title in titles.items():
            v = fetch_views(lang, title, s, e)
            per_lang[lang] = None if v is None else v / days
            time.sleep(sleep)
        raw[sport] = weighted_score(per_lang)
        detail[sport] = {k: (None if v is None else round(v, 1)) for k, v in per_lang.items()}
        got = sum(1 for v in per_lang.values() if v is not None)
        shown = ("%.0f" % raw[sport]) if raw[sport] else "-"
        print("  %-16s %8s weighted daily views   (%d/%d editions)" % (sport, shown, got, len(titles)))
    return {"window": {"start": s, "end": e, "days": days},
            "score": rescale(raw),
            "weightedDailyViews": {k: (round(v, 1) if v else None) for k, v in raw.items()},
            "byEdition": detail, "langWeights": LANG_WEIGHTS}


def _load_zzc():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "zzc", os.path.join(ROOT, "scripts", "zzc_v1_multipillar.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _spearman(rank_a, rank_b):
    """Rank correlation over the keys both dicts share. No scipy in this repo."""
    keys = [k for k in rank_a if k in rank_b]
    n = len(keys)
    if n < 3:
        return None
    d2 = sum((rank_a[k] - rank_b[k]) ** 2 for k in keys)
    return 1 - (6 * d2) / (n * (n * n - 1))


def prestige_table(result):
    """Measured attention against the Cup's hand-set prestige weights.

    Compared BY RANK, not by rescaled difference. The first version of this
    subtracted one 0-100 scale from the other and reported the gap, and every
    sport but football came out negative. That was an artefact, not a finding:
    football is a huge outlier on attention (roughly 5,000 weighted daily views
    against cricket's 3,000 and a long tail below), so pinning both scales at
    football's value compresses everything else on the attention side and
    guarantees a negative gap. The shapes of the two distributions differ; only
    the ORDER is comparable, so order is what this reports.
    """
    zzc = _load_zzc()
    score = result["score"]
    have = {sp: a for sp, a in score.items() if a is not None and zzc.PRESTIGE.get(sp)}
    att_order = sorted(have, key=lambda s: -have[s])
    pres_order = sorted(have, key=lambda s: -zzc.PRESTIGE[s])
    att_rank = {s: i for i, s in enumerate(att_order, 1)}
    pres_rank = {s: i for i, s in enumerate(pres_order, 1)}

    print("\n  Attention rank against the Cup's prestige rank, over %d sports.\n"
          "  Rank, not score: the two distributions have different shapes and only\n"
          "  their order is comparable.\n" % len(have))
    print("  %-16s%8s%10s%8s   %s" % ("sport", "att #", "prestige #", "move", "reading"))
    print("  " + "-" * 62)
    for sport in att_order:
        a, p = att_rank[sport], pres_rank[sport]
        move = p - a                     # positive: read about more than the Cup rewards
        if move >= 4:
            note = "read about far more than the Cup rewards"
        elif move <= -4:
            note = "the Cup rewards it far more than it is read about"
        else:
            note = ""
        print("  %-16s%8d%10d%8s   %s" % (sport, a, p, ("+%d" % move) if move > 0 else str(move), note))

    rho = _spearman(att_rank, pres_rank)
    if rho is not None:
        print("\n  Spearman rank correlation: %.2f" % rho)
        if rho >= 0.6:
            print("  The hand-set weights broadly track measured attention. That is external")
            print("  support they have never had, not proof either is right.")
        elif rho >= 0.3:
            print("  Loosely related. Expect the big movers above to be either a deliberate")
            print("  editorial choice or a weight worth revisiting.")
        else:
            print("  Weakly related or unrelated. Worth understanding WHY before touching a")
            print("  single weight: these measure different things and may be right to differ.")
    print("\n  Caveat that outranks all of the above: a language is a proxy for a market,")
    print("  not a country. See this file's header on cricket.")


def self_test():
    """Offline. Proves the two pieces of arithmetic that can silently be wrong."""
    ok = True

    # Renormalisation: a subject present in two heavy editions must not be
    # scored as though the missing ones returned zero.
    a = weighted_score({"en": 100.0, "zh": 100.0})
    if abs(a - 100.0) > 1e-9:
        print("FAIL: renormalisation, expected 100.0 got %s" % a); ok = False

    # A missing edition drops out entirely rather than counting as zero.
    b = weighted_score({"en": 100.0, "zh": None})
    if abs(b - 100.0) > 1e-9:
        print("FAIL: None must not count as zero, got %s" % b); ok = False

    # A real zero DOES count: nobody reading is a finding, no article is not.
    c = weighted_score({"en": 100.0, "zh": 0.0})
    expect = (100.0 * 0.34) / (0.34 + 0.13)
    if abs(c - expect) > 1e-9:
        print("FAIL: a real zero must pull the mean down, expected %.4f got %s" % (expect, c)); ok = False

    # An unknown edition has no weight and must be ignored, not crash.
    if weighted_score({"xx": 500.0}) is not None:
        print("FAIL: an unweighted edition should yield None"); ok = False

    # Rescale pins the top at 100 and preserves order.
    r = rescale({"a": 50.0, "b": 25.0, "c": None})
    if r["a"] != 100.0 or r["b"] != 50.0 or r["c"] is not None:
        print("FAIL: rescale, got %s" % r); ok = False

    # Every sport key must exist in the Cup's PRESTIGE, or --prestige silently
    # compares against nothing. This is the check most likely to catch a typo.
    zzc = _load_zzc()
    unknown = [s for s in SPORTS if s not in zzc.PRESTIGE]
    if unknown:
        print("FAIL: not PRESTIGE keys in zzc_v1_multipillar.py: %s" % unknown); ok = False

    # Language weights should be a probability-ish vector; drift here quietly
    # reweights every result.
    tot = sum(LANG_WEIGHTS.values())
    if abs(tot - 1.0) > 0.02:
        print("FAIL: LANG_WEIGHTS sum to %.3f, expected ~1.0" % tot); ok = False

    print("self-test PASS" if ok else "self-test FAILED")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true", help="offline checks, no network")
    ap.add_argument("--sports", action="store_true", help="fetch the sport set")
    ap.add_argument("--prestige", action="store_true", help="fetch, then compare with the Cup weights")
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--sleep", type=float, default=0.15, help="seconds between requests; be polite")
    ap.add_argument("--out", help="write the full result as JSON here (never public/data)")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    if not (args.sports or args.prestige):
        ap.print_help()
        return 2

    result = run_sports(args.days, args.sleep)
    if args.prestige:
        prestige_table(result)
    if args.out:
        if os.path.abspath(args.out).startswith(os.path.join(ROOT, "public", "data")):
            print("REFUSING: this is a prototype and does not write to public/data.")
            return 3
        json.dump(result, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("\nwrote %s" % args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
