#!/usr/bin/env python3
"""Build public/data/supertalls.json for /skyscrapers from Wikipedia.

SOURCE. Wikipedia's "List of tallest structures" - every standing structure of
any type at 350 m (1,148 ft) or more, measured to PINNACLE / height-to-tip. The
article carries a Structure type column (which retires the hand-curated
building/tower/industrial map an earlier draft needed) and coordinates (which
let point-in-polygon assign each structure to a metro, the same machinery as
scripts/skydb/attach_metros.py). Licence is CC BY-SA 4.0: the page must credit
the article and link it. Tower_Data in the workbook almost certainly descends
from this same article - same threshold, same column set - so this is
refreshing the original source, not switching to a new one.

WHY NOT SKYDB for the named list: the SKYDB licence forbids republishing names,
heights, ids or coordinates - only derived aggregates may leave it. SKYDB
contributes counts only, via public/data/skyscrapers.json, which the page reads
separately. NEVER merge the two: this list is height-to-tip and SKYDB is
architectural (Willis Tower 527.0 against 442.1), so a merged list would be
incoherent.

METRO ASSIGNMENT is point-in-polygon against public/data/metro-boundaries/,
smallest containing metro wins where boundaries overlap, with the measured
1 km geodesic coastline snap from attach_metros.py. A structure outside every
boundary stays unplaced rather than being given an invented home.

Usage:
  python3 scripts/build-supertalls.py                  fetch, build, write
  python3 scripts/build-supertalls.py --html FILE      parse a saved fetch
  python3 scripts/build-supertalls.py --dry-run        report, write nothing

Needs shapely + pyproj (same as attach_metros.py). Reruns are idempotent; the
reconciliation section prints what changed against the existing file.
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "supertalls.json"
BDIR = ROOT / "public" / "data" / "metro-boundaries"
METROS = ROOT / "public" / "data" / "metros.json"

STRUCTURES_ARTICLE = "List_of_tallest_structures"
BUILDINGS_ARTICLE = "List_of_tallest_buildings"
REST = "https://en.wikipedia.org/api/rest_v1/page/html/"
WIKI = "https://en.wikipedia.org/wiki/"
UA = "CitizenOfNowhere-metro-data/1.0 (https://rankings.citizenofnowhere.org)"
THRESHOLD_M = 350.0
SNAP_KM = 1.0

# The article's Structure type strings, folded to the page's filter buckets.
# Matched lowercase by keyword, most specific first; anything unmatched lands
# in "other" and is PRINTED so a new type is a visible event, not a silent one.
KIND_RULES = [
    ("mast", "mast"),
    ("chimney", "industrial"),
    ("stack", "industrial"),
    ("smelter", "industrial"),
    ("cooling", "industrial"),
    ("pylon", "industrial"),
    ("power line", "industrial"),
    ("powerline", "industrial"),
    ("crossing", "industrial"),
    ("skyscraper", "building"),
    ("building", "building"),
    ("hotel", "building"),
    ("clock", "building"),
    ("tower", "tower"),
    ("bridge", "other"),
    ("dam", "other"),
    ("platform", "other"),
    ("solar", "other"),
]


def kind_of(structure_type: str) -> str:
    t = (structure_type or "").lower()
    for kw, kind in KIND_RULES:
        if kw in t:
            return kind
    return "other"


# ------------------------------------------------------------- HTML parsing

class TableGrab(HTMLParser):
    """Collect every <table> as rows of (cell_html, colspan, rowspan)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[tuple[str, int, int]]]] = []
        self._in_table = 0
        self._row: list[tuple[str, int, int]] | None = None
        self._row_bg = None
        self._cell: list[str] | None = None
        self._span = (1, 1)

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._in_table += 1
            if self._in_table == 1:
                self.tables.append([])
            return
        if not self._in_table:
            return
        if tag == "tr" and self._in_table == 1:
            self._row = []
            self._row_bg = re.search(r"background-color:\s*(#[0-9A-Fa-f]{6})", dict(attrs).get("style") or "")
        elif tag in ("td", "th") and self._in_table == 1:
            a = dict(attrs)
            self._span = (int(a.get("colspan") or 1), int(a.get("rowspan") or 1))
            self._cell = []
        elif self._cell is not None:
            self._cell.append(self.get_starttag_text() or "")

    def handle_endtag(self, tag):
        if tag == "table":
            self._in_table -= 1
            return
        if self._in_table != 1:
            return
        if tag in ("td", "th") and self._cell is not None:
            self._row.append(("".join(self._cell), *self._span))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                bg = self._row_bg.group(1).upper() if self._row_bg else ""
                self.tables[-1].append((bg, self._row))
            self._row = None
        elif self._cell is not None:
            self._cell.append(f"</{tag}>")

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def expand_rowspans(rows):
    """Yield (row_bg, cells) with cell HTML, rowspans carried down."""
    carry: dict[int, tuple[str, int]] = {}
    for bg, row in rows:
        out, ci, queue = [], 0, list(row)
        while queue or ci in carry:
            if ci in carry:
                html, left = carry.pop(ci)
                out.append(html)
                if left > 1:
                    carry[ci] = (html, left - 1)
                ci += 1
                continue
            html, colspan, rowspan = queue.pop(0)
            for _ in range(colspan):
                out.append(html)
                if rowspan > 1:
                    carry[ci] = (html, rowspan - 1)
                ci += 1
        yield bg, out


TAG_RE = re.compile(r"<[^>]+>")
SUP_RE = re.compile(r"<sup\b.*?</sup>", re.S)  # citation refs
REF_RE = re.compile(r"\[\s*(?:\d+|[a-z])\s*\]")
GEO_RE = re.compile(r'class="geo"[^>]*>\s*(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)')
NUM_RE = re.compile(r"(-?\d[\d,]*(?:\.\d+)?)")


def text_of(cell_html: str) -> str:
    t = SUP_RE.sub(" ", cell_html)
    t = TAG_RE.sub(" ", t)
    t = REF_RE.sub("", t)
    return re.sub(r"\s+", " ", t).replace(" ", " ").strip()


def parse_height_m(cell_html: str) -> float | None:
    t = text_of(cell_html)
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*m\b", t)
    if not m:
        m = NUM_RE.search(t)
    if not m:
        return None
    return float(m.group(1).replace(",", ""))


def parse_year(cell_html: str) -> int | None:
    m = re.search(r"\b(1[89]\d\d|20\d\d)\b", text_of(cell_html))
    return int(m.group(1)) if m else None


def parse_coords(cell_html: str) -> tuple[float, float] | None:
    m = GEO_RE.search(cell_html)
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def fetch_html(article: str, path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    req = urllib.request.Request(REST + article, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8")


def parse_structures(html: str) -> tuple[list[dict], list[str]]:
    """The structures article's main table: every standing structure >= 350 m
    to pinnacle. Grey rows (#D3D3D3) are no longer standing and are excluded;
    blue rows (#CEDFF2) are mostly under water (offshore platforms) and are
    kept but flagged."""
    grab = TableGrab()
    grab.feed(html)
    warnings: list[str] = []
    for rows in grab.tables:
        if not rows:
            continue
        _, hdr_cells = next(expand_rowspans(rows[:1]))
        header = [text_of(h).lower() for h in hdr_cells]
        if not (header and header[0].startswith("name") and any("pinnacle" in h for h in header)):
            continue

        def col(*names):
            for n in names:
                for i, h in enumerate(header):
                    if n in h:
                        return i
            return None

        idx = {
            "name": col("name"),
            "height": col("pinnacle", "height"),
            "year": col("year"),
            "type": col("structure type", "type"),
            "use": col("main use", "use"),
            "country": col("country"),
            "town": col("town", "city"),
            "coords": col("coordinates"),
        }
        missing = [k for k, v in idx.items() if v is None and k != "use"]
        if missing:
            sys.exit(f"structures table found but columns missing: {missing} in {header}")

        out, gone = [], 0
        for bg, cells in expand_rowspans(rows[1:]):
            if len(cells) <= idx["coords"]:
                continue
            name = text_of(cells[idx["name"]])
            h = parse_height_m(cells[idx["height"]])
            if not name or h is None:
                continue
            if bg == "#D3D3D3":  # no longer standing
                gone += 1
                continue
            if h < THRESHOLD_M:
                warnings.append(f"below threshold, skipped: {name} {h}m")
                continue
            coords = parse_coords(cells[idx["coords"]])
            stype = text_of(cells[idx["type"]])
            row = {
                "name": name,
                "heightM": round(h, 1),
                "heightFt": round(h * 3.28084),
                "yearBuilt": parse_year(cells[idx["year"]]),
                "type": stype,
                "kind": kind_of(stype),
                "use": text_of(cells[idx["use"]]) if idx["use"] is not None else "",
                "country": text_of(cells[idx["country"]]),
                "town": text_of(cells[idx["town"]]),
            }
            if bg == "#CEDFF2":
                row["submerged"] = True
            if coords:
                row["lat"], row["lon"] = round(coords[0], 5), round(coords[1], 5)
            if row["kind"] == "other" and stype and "platform" not in stype.lower():
                warnings.append(f"unmapped structure type '{stype}' ({name}) -> kind=other")
            out.append(row)
        print(f"  structures: {len(out)} standing (excluded {gone} no-longer-standing)")
        return out, warnings
    sys.exit("no table with a Name + Pinnacle height header found; structures article layout changed")


def parse_buildings(html: str) -> list[dict]:
    """The buildings article's main table: the world's 100 tallest buildings,
    ARCHITECTURAL height (CTBUH-comparable). No coordinates; city + country."""
    grab = TableGrab()
    grab.feed(html)
    for rows in grab.tables:
        if len(rows) < 50:
            continue
        _, hdr_cells = next(expand_rowspans(rows[:1]))
        header = [text_of(h).lower() for h in hdr_cells]
        if not ("name" in header and "floors" in header and "image" in header):
            continue

        def col(name):
            for i, h in enumerate(header):
                if name in h:
                    return i
            return None

        i_name, i_h, i_floors = col("name"), col("height"), col("floors")
        i_city, i_country, i_year = col("city"), col("country"), col("year")
        out = []
        for _, cells in expand_rowspans(rows[1:]):
            if len(cells) <= max(i_name, i_h, i_city, i_country, i_year):
                continue
            name = text_of(cells[i_name])
            h = parse_height_m(cells[i_h])
            if not name or h is None:
                continue
            out.append({
                "name": name,
                "heightM": round(h, 1),
                "heightFt": round(h * 3.28084),
                "floors": (lambda m: int(m.group(1)) if m else None)(NUM_RE.search(text_of(cells[i_floors]))),
                "yearBuilt": parse_year(cells[i_year]),
                "country": text_of(cells[i_country]),
                "town": text_of(cells[i_city]),
            })
        print(f"  buildings: {len(out)} (architectural height)")
        return out
    sys.exit("no 100-tallest-buildings table found; buildings article layout changed")


# --------------------------------------------------------- metro assignment

def assign_metros(rows: list[dict]) -> dict[str, int]:
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
    from shapely.prepared import prep
    from shapely.ops import nearest_points
    from pyproj import Geod

    geod = Geod(ellps="WGS84")
    geoms, slugs = [], []
    for f in sorted(BDIR.glob("*.geojson")):
        try:
            gj = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        for feat in gj.get("features", []):
            g = feat.get("geometry")
            if not g:
                continue
            sh = shape(g)
            if not sh.is_valid:
                sh = sh.buffer(0)
            if sh.is_empty:
                continue
            geoms.append(sh)
            slugs.append((feat.get("properties") or {}).get("slug") or f.stem)
    if len(geoms) < 1000:
        sys.exit(f"only {len(geoms)} boundaries loaded; refusing a partial boundary set")
    areas = [g.area for g in geoms]
    prepared = [prep(g) for g in geoms]
    tree = STRtree(geoms)

    stats = {"contained": 0, "ambiguous": 0, "snapped": 0, "unplaced": 0, "no_coords": 0}
    for r in rows:
        if "lat" not in r:
            stats["no_coords"] += 1
            continue
        pt = Point(r["lon"], r["lat"])
        hits = [i for i in tree.query(pt) if prepared[i].contains(pt)]
        if hits:
            if len(hits) > 1:
                stats["ambiguous"] += 1
                hits.sort(key=lambda i: areas[i])
            r["metroSlug"] = slugs[hits[0]]
            stats["contained"] += 1
            continue
        i = tree.nearest(pt)
        a, b = nearest_points(pt, geoms[i])
        km = geod.inv(a.x, a.y, b.x, b.y)[2] / 1000.0
        if km <= SNAP_KM:
            r["metroSlug"] = slugs[i]
            stats["snapped"] += 1
        else:
            stats["unplaced"] += 1
    return stats


# ------------------------------------------------------------------- build

def name_keys(name: str) -> set[str]:
    """Full name, the part outside parentheses, and each parenthetical alias -
    Tower_Data wrote '875 North Michigan Avenue (John Hancock Center)' where
    the article writes either half."""
    out = {norm_name(name)}
    out.add(norm_name(re.sub(r"\([^)]*\)", " ", name)))
    for inner in re.findall(r"\(([^)]*)\)", name):
        out.add(norm_name(inner))
    out.discard("")
    return out


def norm_name(n: str) -> str:
    n = unicodedata.normalize("NFKD", n)
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = n.lower().replace("&", " and ").replace("centre", "center")
    return re.sub(r"[^a-z0-9]+", " ", n).strip()


def arg_after(flag: str) -> str | None:
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None


def dedupe_names(rows: list[dict]) -> None:
    """Duplicate names would silently double a country's count and break the
    page's row keys. Disambiguate with the town, then the height."""
    seen: dict[str, int] = {}
    for r in rows:
        seen[r["name"]] = seen.get(r["name"], 0) + 1
    for r in rows:
        if seen[r["name"]] > 1 and r["town"] and r["town"].lower() not in r["name"].lower():
            r["name"] = f"{r['name']} ({r['town']})"
    names = [r["name"] for r in rows]
    still = {n for n in names if names.count(n) > 1}
    for r in rows:  # same name, same town: two masts on one site
        if r["name"] in still:
            r["name"] = f"{r['name']} ({r['heightM']:g} m)"
    names = [r["name"] for r in rows]
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        sys.exit(f"ERROR: duplicate structure name(s) after disambiguation: {dupes}")


# Curated town -> metro slugs for cases the generic name join cannot carry:
# conurbation members with no metro of their own (the polygon pass puts their
# towers in these metros, so the name fallback must agree with it), a
# sovereignty mismatch (the article files Hong Kong under China; the metro's
# country field is Hong Kong), and one styling difference (New York City).
TOWN_TO_METRO = {
    ("shenzhen", "china"): "guangzhou",       # matches attach_metros polygons
    ("dongguan", "china"): "guangzhou",       # Pearl River Delta, same basis
    ("hong kong", "china"): "hong-kong",
    ("new york city", "united states"): "new-york",
}


def place_by_town(rows: list[dict], meta: dict) -> int:
    """Unambiguous town+country name match for rows polygons could not place.
    A name is not an identifier (the sixth-time lesson), so the match must be
    unique AND the countries must agree, else the row stays unplaced."""
    by_town: dict[str, list[dict]] = {}
    for m in meta.values():
        for key in {norm_name(m["name"]), norm_name(m.get("primaryCity") or "")}:
            if key:
                by_town.setdefault(key, []).append(m)
    placed = 0
    for r in rows:
        if r.get("metroSlug"):
            continue
        town_keys = {norm_name(r["town"])}
        town_keys.add(norm_name(re.sub(r"(?i)^saint[- ]", "st ", r["town"])))
        town_keys.discard("")
        cands = {m["slug"]: m for k in town_keys for m in by_town.get(k, [])}
        good = [m for m in cands.values()
                if norm_name(m.get("country") or "") == norm_name(r["country"])]
        if len(good) == 1:
            r["metroSlug"] = good[0]["slug"]
            placed += 1
            continue
        curated = TOWN_TO_METRO.get((norm_name(r["town"]), norm_name(r["country"])))
        if curated and curated in meta:
            r["metroSlug"] = curated
            placed += 1
    return placed


def attach_meta(rows: list[dict], meta: dict) -> None:
    for r in rows:
        slug = r.get("metroSlug")
        m = meta.get(slug) if slug else None
        if slug and not m:
            print(f"  WARN metroSlug {slug} not in metros.json ({r['name']})")
            m = None
        r["metro"] = m["name"] if m else ""
        r["metroSlug"] = (slug if m else "") or ""
        r["continent"] = (m.get("continent") or "") if m else ""


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    dry = "--dry-run" in sys.argv

    t0 = time.time()
    structures, warnings = parse_structures(fetch_html(STRUCTURES_ARTICLE, arg_after("--html")))
    buildings = parse_buildings(fetch_html(BUILDINGS_ARTICLE, arg_after("--buildings-html")))
    print(f"parsed both articles in {time.time()-t0:.1f}s")
    for w in warnings:
        print(f"  WARN {w}")

    dedupe_names(structures)
    dedupe_names(buildings)

    stats = assign_metros(structures)
    print("structures polygon assignment:", stats)
    meta = {m["slug"]: m for m in json.loads(METROS.read_text(encoding="utf-8"))}
    print(f"  structures placed by town+country name: {place_by_town(structures, meta)}")

    # The buildings article carries no coordinates, but most of its rows also
    # appear in the structures article, where the polygon pass just placed
    # them. Borrow that assignment (name-key + country match) before falling
    # back to the town name, so a Shenzhen tower lands in the Guangzhou metro
    # the polygon put it in rather than failing a name lookup.
    by_key: dict[tuple[str, str], str] = {}
    for s in structures:
        if s.get("metroSlug"):
            for k in name_keys(s["name"]):
                by_key.setdefault((k, norm_name(s["country"])), s["metroSlug"])
    borrowed = 0
    for b in buildings:
        if b.get("metroSlug"):
            continue
        for k in name_keys(b["name"]):
            slug = by_key.get((k, norm_name(b["country"])))
            if slug:
                b["metroSlug"] = slug
                borrowed += 1
                break
    print(f"  buildings placed via the structures board : {borrowed}")
    print(f"  buildings placed by town+country name     : {place_by_town(buildings, meta)}")
    unplaced_b = [b["name"] for b in buildings if not b.get("metroSlug")]
    if unplaced_b:
        print(f"  buildings unplaced ({len(unplaced_b)}): {unplaced_b}")
    attach_meta(structures, meta)
    attach_meta(buildings, meta)

    structures.sort(key=lambda r: (-r["heightM"], r["name"]))
    buildings.sort(key=lambda r: (-r["heightM"], r["name"]))

    # Reconciliation against what the site publishes today (the Tower_Data-era
    # file has a flat "structures" list; the new format has both boards).
    if OUT.exists():
        keys_of = name_keys
        old = json.loads(OUT.read_text(encoding="utf-8"))
        old_rows = old.get("structures", [])
        new_keys = set()
        for r in structures + buildings:
            new_keys |= keys_of(r["name"])
        lost = [s for s in old_rows if not (keys_of(s["name"]) & new_keys)]
        old_keys = set()
        for s in old_rows:
            old_keys |= keys_of(s["name"])
        gained = [r for r in structures if not (keys_of(r["name"]) & old_keys)]
        print(f"reconciliation vs current file: {len(old_rows)} old, "
              f"{len(structures)} structures + {len(buildings)} buildings new, "
              f"{len(gained)} gained, {len(lost)} in ours but absent upstream")
        for s in sorted(lost, key=lambda s: -s.get("heightM", 0)):
            print(f"  OURS-NOT-UPSTREAM: {s['name']}  {s.get('heightM')}m  ({s.get('metro','')})")

    payload = {
        "retrieved": time.strftime("%Y-%m-%d"),
        "licence": "CC BY-SA 4.0",
        "structures": {
            "measure": "pinnacle",
            "thresholdM": int(THRESHOLD_M),
            "source": "Wikipedia, List of tallest structures",
            "sourceUrl": WIKI + STRUCTURES_ARTICLE,
            "count": len(structures),
            "rows": structures,
        },
        "buildings": {
            "measure": "architectural",
            "source": "Wikipedia, List of tallest buildings",
            "sourceUrl": WIKI + BUILDINGS_ARTICLE,
            "count": len(buildings),
            "rows": buildings,
        },
    }
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if dry:
        print(f"dry run: would write {len(text):,} bytes")
        return 0
    OUT.write_text(text, encoding="utf-8")
    kinds = {}
    for r in structures:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    placed = sum(1 for r in structures if r["metroSlug"])
    print(f"supertalls.json: {len(structures)} structures ({placed} placed, kinds {kinds}), "
          f"{len(buildings)} buildings, {len(text):,} bytes")
    print(f"  tallest structure: {structures[0]['name']} {structures[0]['heightM']}m (pinnacle)")
    print(f"  tallest building : {buildings[0]['name']} {buildings[0]['heightM']}m (architectural)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
