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
    "Women's Basketball": ["united-states","australia","china","france","belgium","spain",
                           "serbia","canada","nigeria","japan"],
    "Women's Volleyball": ["italy","brazil","united-states","turkey","china","poland",
                           "japan","serbia","netherlands","dominican-republic"],
    "Women's Hockey": ["netherlands","argentina","australia","england","belgium","germany",
                       "spain","china","india","new-zealand"],
    "Women's Rugby": ["england","canada","new-zealand","france","australia","ireland",
                      "italy","united-states","wales","scotland"],
}

data = {"_meta": {"asof": "2026-06", "note": "men's national rankings; ranking-only ZZC feed"},
        "sports": {sp: {"ranks": [[slug, i + 1] for i, slug in enumerate(lst)]} for sp, lst in SPORTS.items()}}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(data, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT, "-", {sp: len(v["ranks"]) for sp, v in data["sports"].items()})
