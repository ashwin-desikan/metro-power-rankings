#!/usr/bin/env python3
"""
Build current world-ranking data files for three national-team sports, scraped
2026-06-19 from the official federations:
  - IIHF men's ice hockey  (iihf.com, as of 2026-06-03)
  - WBSC men's baseball     (wbsc.org, as of 2026-03-26)
  - FIFA women's football   (fifa.com, as of 2026-04-21)

Emits public/data/rankings/{hockey-men,baseball-men,womens-football}.json with
rows [{rank, name, points, slug, engineSlug}] where:
  slug       = countries.json slug (for /countries/[slug] hub links), or null
  engineSlug = Olympic-NOC slug used by the Zone Zero Cup engine, or null

Run from anywhere: python scripts/build_rankings.py
"""
import io
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# The rankings themselves live in scripts/data/rankings-manual/*.txt, not in
# this file. They used to be pasted in as string literals with the as-of date
# typed separately at the emit() call, which is how the FIVB ranking reached
# eleven months old without anything noticing: updating one meant editing
# Python, and the date lived somewhere other than the numbers it described.
#
# Each file carries its own header:
#   # <source>
#   # asOf: YYYY-MM-DD
#   # separator: <char>
# so a refresh is a data edit, the date travels with the data it belongs to,
# and check:data-currency reads the emitted asOf and says when one goes stale.
# (Extracted 2026-09-04. The emitted JSON is byte-identical to what the string
# literals produced; that was the acceptance test for the move.)
MANUAL_DIR = os.path.join(ROOT, "scripts", "data", "rankings-manual")


def load_manual(name):
    """Return (body, asOf, source, separator) for one hand-maintained ranking."""
    path = os.path.join(MANUAL_DIR, name + ".txt")
    with io.open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    head = [l for l in lines if l.startswith("#")]
    body = "\n".join(l for l in lines if l and not l.startswith("#"))
    meta = {"source": head[0].lstrip("# ").strip() if head else name}
    for l in head:
        for key in ("asOf", "separator"):
            m = re.match(r"#\s*%s:\s*(.+)$" % key, l)
            if m:
                meta[key] = m.group(1).strip()
    if "asOf" not in meta:
        raise SystemExit("%s has no '# asOf:' header" % path)
    return body, meta["asOf"], meta["source"], meta.get("separator", "|")


D = os.path.join(ROOT, "public", "data")
OUT_DIR = os.path.join(D, "rankings")

# ---------------------------------------------------------------- raw data
# IIHF men, 2026-06-03. "Name|points" in rank order; Russia/Belarus suspended.

# WBSC men's baseball, 2026-03-26. IOC code:points in rank order.

# FIFA women's football, 2026-04-21. "Name~points" in rank order (top ~190).


# ---------------------------------------------------------------- slug maps
def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(?:and|the|of|republic|pr|dr|ir|fr)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)


countries = json.load(open(os.path.join(D, "countries.json"), encoding="utf-8"))
oly = json.load(open(os.path.join(D, "olympics", "teams.json"), encoding="utf-8"))
cslug = {c["slug"] for c in countries}
cbyname = {norm(c["name"]): c["slug"] for c in countries}
cnameBySlug = {c["slug"]: c["name"] for c in countries}
obyname = {norm(t["name"]): t["slug"] for t in oly}
obycode = {(t.get("code") or "").upper(): t["slug"] for t in oly if t.get("code")}

# federation name -> (countries slug, engine/oly slug). Only the divergent ones.
NAME_ALIAS = {
    "great britain": ("united-kingdom", "great-britain"),
    "czechia": ("czech-republic", "czechia"),
    "chinese taipei": ("taiwan", "chinese-taipei"),
    "turkiye": ("turkey", "turkey"),
    "korea republic": ("south-korea", "south-korea"),
    "south korea": ("south-korea", "south-korea"),
    "korea dpr": ("north-korea", "north-korea"),
    "dpr korea": ("north-korea", "north-korea"),
    "china pr": ("china", "china"),
    "china": ("china", "china"),
    "republic of ireland": ("ireland", "ireland"),
    "hong kong, china": ("hong-kong", "hong-kong"),
    "hong kong china": ("hong-kong", "hong-kong"),
    "cote d'ivoire": ("cote-divoire", "ivory-coast"),
    "ir iran": ("iran", "iran"),
    "cabo verde": ("cape-verde", "cape-verde"),
    "kyrgyz republic": ("kyrgyzstan", "kyrgyzstan"),
    "usa": ("united-states", "united-states"),
    "timor-leste": ("east-timor", "east-timor"),
    "st lucia": ("saint-lucia", "saint-lucia"),
}
# IOC code -> countries slug for baseball codes not resolvable via Olympic teams
CODE_ALIAS = {
    "GBR": "united-kingdom", "TPE": "taiwan", "CZE": "czech-republic", "IRI": "iran",
    "CUW": "curacao", "PLE": "palestine", "ISV": "us-virgin-islands", "SXM": "sint-maarten",
    "MNP": "northern-mariana-islands", "PLW": "palau", "FSM": "micronesia", "SSD": "south-sudan",
    "HKG": "hong-kong", "TUR": "turkey",
    "NCA": "nicaragua", "GUM": "guam", "HON": "honduras", "LAO": "laos", "ESA": "el-salvador",
    "ARU": "aruba", "BAN": "bangladesh", "BEN": "benin", "CAM": "cambodia",
}


def resolve_country(name):
    n = norm(name)
    if name.strip().lower() in NAME_ALIAS:
        return NAME_ALIAS[name.strip().lower()][0]
    if n in cbyname:
        return cbyname[n]
    # via Olympic name -> its name -> countries
    return None


def resolve_engine(name):
    if name.strip().lower() in NAME_ALIAS:
        return NAME_ALIAS[name.strip().lower()][1]
    n = norm(name)
    if n in obyname:
        return obyname[n]
    if n in cbyname:
        return cbyname[n]
    return None






def emit(fname, source, as_of, rows, suspended=None):
    out = {"_meta": {"sport": fname, "source": source, "asOf": as_of, "count": len(rows)},
           "rows": rows}
    if suspended:
        out["suspended"] = suspended
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(out, open(os.path.join(OUT_DIR, fname + ".json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    miss = [r["name"] for r in rows if not r["slug"]]
    print("%-18s %3d rows | unmatched country slug: %s" % (fname, len(rows), miss[:12]))


def build_named(raw, sep):
    rows = []
    for i, line in enumerate(raw.strip().splitlines(), 1):
        name, pts = line.rsplit(sep, 1)
        name = name.strip()
        rows.append({"rank": i, "name": name, "points": float(pts),
                     "slug": resolve_country(name), "engineSlug": resolve_engine(name)})
    return rows


def build_baseball(raw):
    rows = []
    for i, tok in enumerate(raw.split(","), 1):
        code, pts = tok.split(":")
        code = code.upper()
        eng = obycode.get(code)
        ctry = None
        if eng and eng in cslug:
            ctry = eng
        if not ctry:
            ctry = CODE_ALIAS.get(code)
        if not ctry and eng:
            # map via olympic name -> countries norm
            onm = next((t["name"] for t in oly if t["slug"] == eng), None)
            if onm:
                ctry = cbyname.get(norm(onm))
        disp = cnameBySlug.get(ctry, code)
        rows.append({"rank": i, "code": code, "name": disp, "points": float(pts),
                     "slug": ctry, "engineSlug": eng or CODE_ALIAS.get(code)})
    return rows


HOCKEY, HOCKEY_ASOF, HOCKEY_SRC, HOCKEY_SEP = load_manual("hockey")
HOCKEY_SUSPENDED, _, _, _ = load_manual("hockey_suspended")
BASEBALL, BASEBALL_ASOF, BASEBALL_SRC, _ = load_manual("baseball")
WOMENS, WOMENS_ASOF, WOMENS_SRC, WOMENS_SEP = load_manual("womens")
VOLLEYBALL, VOLLEY_ASOF, VOLLEY_SRC, VOLLEY_SEP = load_manual("volleyball")
HANDBALL, HANDBALL_ASOF, HANDBALL_SRC, HANDBALL_SEP = load_manual("handball")

hockey = build_named(HOCKEY, HOCKEY_SEP)
hockey_susp = build_named(HOCKEY_SUSPENDED, HOCKEY_SEP)
emit("hockey-men", HOCKEY_SRC, HOCKEY_ASOF, hockey,
     suspended=[{"name": r["name"], "points": r["points"], "slug": r["slug"],
                 "engineSlug": r["engineSlug"]} for r in hockey_susp])
emit("baseball-men", BASEBALL_SRC, BASEBALL_ASOF, build_baseball(BASEBALL))
emit("womens-football", WOMENS_SRC, WOMENS_ASOF, build_named(WOMENS, WOMENS_SEP))
emit("volleyball-men", VOLLEY_SRC, VOLLEY_ASOF, build_named(VOLLEYBALL, VOLLEY_SEP))
emit("handball-men", HANDBALL_SRC, HANDBALL_ASOF, build_named(HANDBALL, HANDBALL_SEP))
