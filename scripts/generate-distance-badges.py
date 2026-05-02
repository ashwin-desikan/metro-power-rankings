#!/usr/bin/env python3
"""
Generate the distance-based badge CSVs:

  public/data/twin-metros.csv      Connected-component clusters of metros within 75 km.
                                   One row per metro, sharing a cluster_id with its
                                   neighbours and listing all cluster members.
  public/data/isolated-capital.csv National capitals where the nearest peer at or above
                                   the capital's own rank is more than 300 km away.

Both use haversine on the lat/lon present in public/data/metros.json (sourced
upstream from MetroAreas.xlsx). The 'capital' flag is read from
public/data/details/<slug>.json since metros.json does not carry it.

This script is idempotent. Run after every ETL refresh.
"""

import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METROS_JSON = ROOT / "public" / "data" / "metros.json"
DETAILS_DIR = ROOT / "public" / "data" / "details"
OUT_TWIN = ROOT / "public" / "data" / "twin-metros.csv"
OUT_MEGA = ROOT / "public" / "data" / "megaregions.csv"
OUT_ISOLATED = ROOT / "public" / "data" / "isolated-capital.csv"

TWIN_KM = 75.0
ISOLATED_KM = 240.0


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0088
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def has_coords(m):
    lat = m.get("lat") or 0
    lon = m.get("lon") or 0
    return lat != 0 and lon != 0


def load_metros():
    return json.load(open(METROS_JSON, "r", encoding="utf-8"))


def load_capital_flags(metros):
    flags = {}
    for m in metros:
        slug = m["slug"]
        path = DETAILS_DIR / f"{slug}.json"
        if not path.exists():
            flags[slug] = ""
            continue
        try:
            d = json.load(open(path, "r", encoding="utf-8"))
        except Exception:
            flags[slug] = ""
            continue
        meta = d.get("metro") or d
        flags[slug] = (meta.get("capital") or "").strip()
    return flags


# --- Twin Metros: connected-component clusters ---

def find_clusters(metros, threshold_km):
    """Build adjacency by 75 km radius, return dict cluster_id -> [metro objects]."""
    pool = [m for m in metros if has_coords(m)]
    n = len(pool)
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    # O(n^2) edge scan; n <= ~1400 so this is fine.
    for i in range(n):
        a = pool[i]
        for j in range(i + 1, n):
            b = pool[j]
            if haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) <= threshold_km:
                union(i, j)

    clusters = {}
    for i in range(n):
        root = find(i)
        clusters.setdefault(root, []).append(pool[i])
    # Drop singletons
    return {k: v for k, v in clusters.items() if len(v) >= 2}


def cluster_diameter_km(members):
    """Max pairwise distance within a cluster."""
    d = 0.0
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            x = haversine_km(members[i]["lat"], members[i]["lon"],
                             members[j]["lat"], members[j]["lon"])
            if x > d:
                d = x
    return d


def tier_for_twin(size):
    """Twin Metros holds clusters of size 2 or 3 only."""
    if size == 3: return "A"  # triplet
    return "B"                 # pair (size 2)


def tier_for_megaregion(size):
    """Megaregions holds clusters of size 4+."""
    if size >= 15: return "A"  # megaregion (15+)
    if size >= 8:  return "B"  # large cluster (8-14)
    return "C"                  # small cluster (4-7)


def compute_twin_clusters(metros):
    """Return (twin_rows, mega_rows). Twin Metros holds clusters of size 2-3.
    Megaregions holds clusters of size 4+."""
    clusters = find_clusters(metros, TWIN_KM)
    cluster_list = list(clusters.values())
    cluster_list.sort(key=lambda members: min(m["rank"] for m in members))

    twin_rows, mega_rows = [], []
    cluster_id = 0
    for members in cluster_list:
        cluster_id += 1
        members_sorted = sorted(members, key=lambda m: m["rank"])
        member_slugs = [m["slug"] for m in members_sorted]
        member_names = [m["name"] for m in members_sorted]
        size = len(members)
        diameter = round(cluster_diameter_km(members), 1)
        cid = f"c{cluster_id:03d}"
        is_mega = size >= 4
        tier = tier_for_megaregion(size) if is_mega else tier_for_twin(size)
        target = mega_rows if is_mega else twin_rows
        for m in members_sorted:
            others_slugs = [s for s in member_slugs if s != m["slug"]]
            others_names = [n for n, s in zip(member_names, member_slugs) if s != m["slug"]]
            target.append({
                "slug": m["slug"],
                "name": m["name"],
                "country": m["country"],
                "rank": m["rank"],
                "cluster_id": cid,
                "cluster_size": size,
                "cluster_diameter_km": diameter,
                "cluster_member_slugs": ";".join(member_slugs),
                "cluster_member_names": ";".join(member_names),
                "cluster_other_slugs": ";".join(others_slugs),
                "cluster_other_names": ";".join(others_names),
                "tier": tier,
            })
    return twin_rows, mega_rows


# --- Isolated Capital: peer must be at least as prominent ---

def tier_for_isolated(distance_km):
    if distance_km >= 800: return "A"
    if distance_km >= 500: return "B"
    return "C"


def compute_isolated_capital(metros, capital_flags):
    """Capital qualifies when no metro with rank <= capital's own rank sits
    within ISOLATED_KM. The peer-prominence rule replaces the previous
    arbitrary top-200 floor with a comparability rule: the disqualifying peer
    must be at least as prominent as the capital itself.
    """
    rows = []
    for a in metros:
        if not has_coords(a):
            continue
        marker = capital_flags.get(a["slug"], "")
        if marker not in ("Y", "XY"):
            continue
        a_rank = a["rank"]
        # Peers eligible to disqualify: rank <= a_rank, has coords, not self
        nearest = None
        nearest_d = float("inf")
        for b in metros:
            if b["slug"] == a["slug"]:
                continue
            if not has_coords(b):
                continue
            if b["rank"] > a_rank:
                continue
            d = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
            if d < nearest_d:
                nearest_d = d
                nearest = b
        # Capital with no eligible peer at all is implicitly maximally isolated
        if nearest is None:
            nearest_d = float("inf")
        if nearest_d > ISOLATED_KM:
            rows.append({
                "slug": a["slug"],
                "name": a["name"],
                "country": a["country"],
                "rank": a["rank"],
                "distance_km": round(nearest_d, 1) if nearest else -1,
                "peer_slug": nearest["slug"] if nearest else "",
                "peer_name": nearest["name"] if nearest else "",
                "peer_country": nearest["country"] if nearest else "",
                "peer_rank": nearest["rank"] if nearest else -1,
                "tier": tier_for_isolated(nearest_d if nearest else 9999),
            })
    rows.sort(key=lambda r: -r["distance_km"] if r["distance_km"] >= 0 else -10**9)
    return rows


def write_csv(path, rows, columns):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"wrote {path.relative_to(ROOT)}: {len(rows)} rows")


def main():
    metros = load_metros()
    capital_flags = load_capital_flags(metros)

    twin_rows, mega_rows = compute_twin_clusters(metros)
    iso_rows = compute_isolated_capital(metros, capital_flags)

    cluster_cols = ["slug", "name", "country", "rank", "cluster_id", "cluster_size", "cluster_diameter_km",
                    "cluster_member_slugs", "cluster_member_names", "cluster_other_slugs", "cluster_other_names", "tier"]
    iso_cols = ["slug", "name", "country", "rank", "distance_km", "peer_slug", "peer_name", "peer_country", "peer_rank", "tier"]

    write_csv(OUT_TWIN, twin_rows, cluster_cols)
    write_csv(OUT_MEGA, mega_rows, cluster_cols)
    write_csv(OUT_ISOLATED, iso_rows, iso_cols)

    # Cluster summary across both files
    seen = set()
    cluster_summary = []
    for r in twin_rows + mega_rows:
        if r["cluster_id"] in seen: continue
        seen.add(r["cluster_id"])
        cluster_summary.append((r["cluster_id"], int(r["cluster_size"]), r["cluster_member_names"], float(r["cluster_diameter_km"])))
    print()
    print(f"Total clusters: {len(cluster_summary)}  (twin: {len({r['cluster_id'] for r in twin_rows})}, megaregion: {len({r['cluster_id'] for r in mega_rows})})")
    from collections import Counter
    sizes = Counter(s for _, s, _, _ in cluster_summary)
    print(f"By size: {sorted(sizes.items())}")
    print()
    print("Largest clusters (size >= 3):")
    for cid, sz, names, dia in sorted(cluster_summary, key=lambda c: (-c[1], c[3])):
        if sz < 3: continue
        print(f"  {cid} (n={sz}, max-diameter={dia} km): {names}")
    print()
    print("Selected pairs (size 2) of editorial interest:")
    interest = ["Detroit;Windsor", "Vienna;Bratislava", "El Paso;Ciudad Juarez", "San Diego;Tijuana",
                "Singapore;Johor Bahru", "Kinshasa;Brazzaville", "Nice;Monaco", "Vatican City;Rome", "Rome;Vatican City",
                "Copenhagen;Malmo", "Hong Kong;Macau", "Macau;Hong Kong"]
    for cid, sz, names, dia in cluster_summary:
        if sz != 2: continue
        for hint in interest:
            if all(n in names for n in hint.split(";")):
                print(f"  {cid}: {names}  diameter={dia} km")
                break
    print()
    print(f"Isolated Capitals: {len(iso_rows)}")
    print("Most-isolated 25:")
    for r in iso_rows[:25]:
        peer = f"{r['peer_name']} (#{r['peer_rank']})" if r['peer_name'] else "<none>"
        print(f"  {r['name']:<25} (#{r['rank']:>4}, {r['country']:<22})  nearest peer-of-rank-≤-{r['rank']} = {peer:<28} {r['distance_km']:>6.1f} km  tier {r['tier']}")
    print()
    print("Re-checks for the 6 capitals user asked to bring back:")
    target = ["Brasilia","Brasília","Canberra","Madrid","Buenos Aires","Santiago","Wellington"]
    for r in iso_rows:
        if any(t in r["name"] for t in target):
            print(f"  IN: {r['name']:<25} -> nearest = {r['peer_name'] or '<none>':<22} {r['distance_km']:>6.1f} km")
    print('  (capitals NOT in list among targets:)')
    in_names = {r['name'] for r in iso_rows}
    for t in target:
        if not any(t in n for n in in_names):
            # find target metro and compute closest peer-of-higher-rank
            cand = [m for m in metros if t in m['name']]
            if cand and has_coords(cand[0]):
                c = cand[0]
                ranked = [m for m in metros if has_coords(m) and m['rank'] <= c['rank'] and m['slug'] != c['slug']]
                if not ranked:
                    print(f"  OUT: {t} - no peer-of-higher-rank exists")
                else:
                    nearest = min(ranked, key=lambda x: haversine_km(c['lat'], c['lon'], x['lat'], x['lon']))
                    nd = haversine_km(c['lat'], c['lon'], nearest['lat'], nearest['lon'])
                    print(f"  OUT: {t} (#{c['rank']}) -> nearest peer-of-rank-≤-{c['rank']} = {nearest['name']} (#{nearest['rank']}) {nd:.1f} km")


if __name__ == "__main__":
    main()
