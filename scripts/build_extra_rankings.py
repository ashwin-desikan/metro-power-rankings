#!/usr/bin/env python3
"""Zone Zero Cup 'extra sports' ranking snapshot.

These sports are NOT tracked in the League hubs and have NO title pillar; they
feed the Cup ONLY through the current-standing (ranking) layer. Rankings change
slowly, so this is a hand-maintained snapshot: edit the lists below and re-run.
Men's national-team rankings, keyed by engine slug (the engine folds England ->
Great Britain etc.). Emits public/data/rankings/zzc-extra.json.

Provenance (captured 2026-06-20):
  Water polo  - World Aquatics Men's Ranking (Apr 2026). Top 5 + AUS #12 are
                from the official release; 6-11/13-14 are the established order.
  Futsal      - FIFA Futsal Men's World Ranking (8 May 2026). 1-7 from FIFA;
                tail approximate. Russia is suspended in the Cup, so omitted.
  Table tennis- ITTF Men's Team Ranking (Jun 2026). China #1 (2026 world team
                champions); rest approximate competitive order.
  Badminton   - approximate men's national strength (BWF is player-level; no
                clean nation ranking). Refine when convenient.
  W volleyball- FIVB Senior Women's World Ranking (5 Sep 2026), all 132 published
                nations less Russia and Belarus, who are suspended in the Cup.
Refresh: replace any list with the official current order, re-run this script,
then scripts/zzc_v1_multipillar.py.
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "rankings", "zzc-extra.json")

SPORTS = {
    # --- men's ranking-only sports (no hub, no title pillar) ---
    "Water Polo": ["spain","hungary","greece","serbia","croatia","italy","montenegro",
                   "united-states","france","georgia","netherlands","australia","romania","japan"],
    "Futsal": ["brazil","portugal","spain","argentina","iran","morocco","kazakhstan",
               "ukraine","italy","paraguay","thailand","japan","uzbekistan","colombia"],
    "Table Tennis": ["china","japan","south-korea","sweden","germany","chinese-taipei",
                     "france","brazil","england","hong-kong","india","iran","slovenia","portugal"],
    "Badminton": ["china","japan","south-korea","indonesia","malaysia","india","denmark",
                  "chinese-taipei","thailand","france","singapore","hong-kong"],
    # --- lacrosse: World Lacrosse men's order. USA/Canada/Haudenosaunee dominate.
    #     Returns to the Olympics (sixes) at LA28; revisit as a titles pillar then.
    #     Haudenosaunee Nationals = a sovereign Indigenous nation, no country page,
    #     so it scores in absolute merit but is excluded from per-capita (composite). ---
    "Lacrosse": ["united-states","canada","haudenosaunee","australia","england","japan",
                 "israel","ireland","scotland","germany","netherlands","czechia"],
    # --- women's ranking-only layer (Phase 1). Each is its own canonical slot,
    #     parallel to Women's Football; no double-count with the mixed Olympic medals.
    #     Netball is women's-only (no men's equivalent). Leaders verified Jun 2026;
    #     tails approximate established order. Upgrade to title pillars in Phase 2. ---
    "Netball": ["australia","new-zealand","england","jamaica","south-africa","malawi",
                "uganda","trinidad-tobago","fiji","wales","scotland","northern-ireland"],
    "Women's Cricket": ["australia","england","india","new-zealand","south-africa",
                        "west-indies","pakistan","sri-lanka","bangladesh","ireland"],
    # 🔴 Women's Basketball is DELIBERATELY ABSENT. It used to be a hand-kept
    # top ten here, and scripts/basketball/apply_womens_ranking.py now writes
    # the full FIBA 119 over this file after it runs. A literal here would be
    # dead data that reads as live.
    "Women's Volleyball": [
        "italy", "brazil", "turkey", "poland", "united-states", "japan",
        "china", "canada", "serbia", "netherlands", "germany", "thailand",
        "dominican-republic", "czech-republic", "belgium", "france", "slovenia", "sweden",
        "argentina", "colombia", "cuba", "ukraine", "kenya", "mexico",
        "greece", "puerto-rico", "south-korea", "bulgaria", "switzerland", "romania",
        "vietnam", "finland", "hungary", "slovakia", "taiwan", "croatia",
        "iran", "egypt", "cameroon", "peru", "kazakhstan", "spain",
        "azerbaijan", "portugal", "bosnia-herzegovina", "scotland", "bermuda", "saint-lucia",
        "san-marino", "austria", "indonesia", "antigua-barbuda", "latvia", "philippines",
        "barbados", "montenegro", "rwanda", "nicaragua", "cote-divoire", "jamaica",
        "cape-verde", "nigeria", "lithuania", "zimbabwe", "honduras", "chile",
        "ghana", "nepal", "dominica", "guam", "india", "palau",
        "jordan", "american-samoa", "malta", "namibia", "liechtenstein", "tunisia",
        "anguilla", "british-virgin-islands", "guadeloupe", "guinea", "marshall-islands", "israel",
        "algeria", "ireland", "benin", "suriname", "costa-rica", "uganda",
        "trinidad-tobago", "maldives", "qatar", "singapore", "zambia", "iraq",
        "new-zealand", "cook-islands", "congo", "andorra", "guinea-bissau", "mali",
        "el-salvador", "malawi", "venezuela", "togo", "estonia", "bolivia",
        "bahamas", "sri-lanka", "senegal", "australia", "bangladesh", "kyrgyzstan",
        "northern-ireland", "cyprus", "lebanon", "albania", "macau", "kosovo",
        "tajikistan", "grenada", "ecuador", "hong-kong", "faroe-islands", "denmark",
        "mongolia", "georgia", "luxembourg", "uzbekistan",
    ],
    "Women's Hockey": ["netherlands","argentina","australia","england","belgium","germany",
                       "spain","china","india","new-zealand"],
    "Women's Rugby": ["england","canada","new-zealand","france","australia","ireland",
                      "italy","united-states","wales","scotland"],
}

# 🔴 CARRY FORWARD what other scripts own. scripts/basketball/apply_womens_ranking.py
# writes the full FIBA women's basketball ranking (119 nations) into this file
# AFTER this script runs. Rebuilding `sports` purely from SPORTS would silently
# revert it to whatever literal lived here, which is why that literal is gone.
# Any sport already in the output and absent from SPORTS is preserved.
prev = {}
if os.path.exists(OUT):
    try:
        prev = json.load(open(OUT, encoding="utf-8")).get("sports", {})
    except Exception:
        prev = {}

data = {"_meta": {"asof": "2026-06", "note": "national rankings, ranking-only ZZC feed. Women's volleyball is the FIVB Senior World Ranking as of 2026-09-05 (en.volleyballworld.com), 130 nations, replacing a hand-kept top ten; Russia and Belarus are suspended in the Cup and therefore absent, the same treatment as futsal and women's ice hockey."},
        "sports": {**{sp: v for sp, v in prev.items() if sp not in SPORTS},
                   **{sp: {"ranks": [[slug, i + 1] for i, slug in enumerate(lst)]}
                      for sp, lst in SPORTS.items()}}}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(data, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT, "-", {sp: len(v["ranks"]) for sp, v in data["sports"].items()})
