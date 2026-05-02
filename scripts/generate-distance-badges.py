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
OUT_CONURBATIONS = ROOT / "public" / "data" / "conurbations.csv"
OUT_ISOLATED = ROOT / "public" / "data" / "isolated-capital.csv"

TWIN_KM = 75.0
ISOLATED_KM = 240.0


def max_avg_pairwise_km_for_size(size):
    """Size-dependent ceiling on a cluster's average pairwise distance.
    Pairs through quartets get the link distance (75 km). From quintets
    onward the ceiling starts at 80 and tightens by 1 km per added member
    (size 5 = 80, size 6 = 79, size 7 = 78, size 8 = 77, size 9 = 76,
    size 10 = 75, etc.). Lets in Toronto-Buffalo-Niagara, the Scottish
    central belt, and similar networks that just edge over the link
    distance, while keeping out runaway whole-country chains."""
    if size <= 4:
        return 75.0
    return max(0.0, 85.0 - 1.0 * size)


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

def _connected_components(pool, threshold_km):
    """Union-find connected components at the given link distance."""
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
    return [v for v in clusters.values() if len(v) >= 2]


def _split_failing_cluster(members, current_link_km, min_link_km=30):
    """Recursively split a cluster until all sub-clusters pass the size-
    dependent avg-pairwise filter, or the link distance drops below the floor.
    A failing 42-metro Benelux/Rhine-Ruhr blob splits at tighter link distances
    until the Randstad core, the Rhine-Ruhr core, etc. emerge as clean
    sub-clusters that satisfy the filter."""
    if len(members) < 2:
        return []
    avg = cluster_avg_pairwise_km(members)
    if avg <= max_avg_pairwise_km_for_size(len(members)):
        return [members]
    if current_link_km <= min_link_km:
        return []
    next_link = current_link_km - 10
    sub_clusters = _connected_components(members, next_link)
    result = []
    for sub in sub_clusters:
        result.extend(_split_failing_cluster(sub, next_link, min_link_km))
    return result


def find_clusters(metros, threshold_km):
    """Form connected components at threshold_km, then recursively split any
    cluster that fails the avg-pairwise filter. Returns dict cluster_id -> [metros]."""
    pool = [m for m in metros if has_coords(m)]
    initial = _connected_components(pool, threshold_km)
    final = []
    for cluster in initial:
        final.extend(_split_failing_cluster(cluster, threshold_km))
    return {i: c for i, c in enumerate(final)}


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


def cluster_avg_pairwise_km(members):
    """Average of every pair's haversine distance inside the cluster."""
    n = len(members)
    if n < 2:
        return 0.0
    total = 0.0
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            total += haversine_km(members[i]["lat"], members[i]["lon"],
                                  members[j]["lat"], members[j]["lon"])
            count += 1
    return total / count


def tier_for_score_sum(score_sum):
    """Tier by total cluster economic weight, aligned with the individual
    metro tier scale. Tier A = Global (>=100), B = World (50-100),
    C = Major (20-50), D = Regional (<20)."""
    if score_sum >= 100: return "A"
    if score_sum >= 50:  return "B"
    if score_sum >= 20:  return "C"
    return "D"


def compute_conurbation_clusters(metros):
    """Return one list of cluster rows, ranked by total cluster score. One row
    per cluster, identified by its lead (lowest-rank member). The full member
    list is in cluster_member_slugs / cluster_member_names; the others fields
    exclude the lead. Pairs through n-metro networks all live in one list."""
    clusters = find_clusters(metros, TWIN_KM)
    cluster_list = list(clusters.values())
    cluster_list.sort(key=lambda members: min(m["rank"] for m in members))

    rows = []
    cluster_id = 0
    for members in cluster_list:
        cluster_id += 1
        members_sorted = sorted(members, key=lambda m: m["rank"])
        lead = members_sorted[0]
        member_slugs = [m["slug"] for m in members_sorted]
        member_names = [m["name"] for m in members_sorted]
        others_slugs = member_slugs[1:]
        others_names = member_names[1:]
        size = len(members)
        diameter = round(cluster_diameter_km(members), 1)
        avg_pairwise = round(cluster_avg_pairwise_km(members), 1)
        # find_clusters already enforces the avg-pairwise filter via recursive
        # splitting, so this is a sanity guard rather than a primary gate.
        if avg_pairwise > max_avg_pairwise_km_for_size(size):
            continue
        score_sum = round(sum(m.get("score", 0) or 0 for m in members), 1)
        cid = f"c{cluster_id:03d}"
        tier = tier_for_score_sum(score_sum)
        rows.append({
            "slug": lead["slug"],
            "name": lead["name"],
            "country": lead["country"],
            "rank": lead["rank"],
            "cluster_id": cid,
            "cluster_size": size,
            "cluster_diameter_km": diameter,
            "cluster_avg_pairwise_km": avg_pairwise,
            "cluster_score_sum": score_sum,
            "cluster_member_slugs": ";".join(member_slugs),
            "cluster_member_names": ";".join(member_names),
            "cluster_other_slugs": ";".join(others_slugs),
            "cluster_other_names": ";".join(others_names),
            "tier": tier,
        })
    rows.sort(key=lambda r: -r["cluster_score_sum"])
    return rows


# --- Isolated Capital: peer must be in the same or higher score tier ---

# Score tier index, mirroring lib/tiers.ts. Lower index = higher tier:
# 0=Global Capital, 1=World City, 2=Major Metro, 3=Regional Hub,
# 4=Established, 5=Emerging, 6=Local. The score is used only to bucket
# the metro into a tier; comparison is then strictly tier-vs-tier.
_TIER_LOWER_BOUNDS = [100.0, 50.0, 20.0, 10.0, 5.0, 1.0, 0.0]


def tier_index(score):
    for i, lb in enumerate(_TIER_LOWER_BOUNDS):
        if score >= lb:
            return i
    return len(_TIER_LOWER_BOUNDS) - 1


def tier_for_isolated(distance_km):
    if distance_km >= 800: return "A"
    if distance_km >= 500: return "B"
    return "C"


def compute_isolated_capital(metros, capital_flags):
    """Capital qualifies when no metro in the same or higher tier sits within
    ISOLATED_KM. Comparison is strictly tier-vs-tier: a Local City small town
    never disqualifies a Major Metro capital; only peers in the capital's own
    tier or above count.
    """
    rows = []
    for a in metros:
        if not has_coords(a):
            continue
        marker = capital_flags.get(a["slug"], "")
        if marker not in ("Y", "XY"):
            continue
        a_tier = tier_index(a.get("score", 0) or 0)
        nearest = None
        nearest_d = float("inf")
        for b in metros:
            if b["slug"] == a["slug"]:
                continue
            if not has_coords(b):
                continue
            # Peer must be at the capital's tier or higher (lower index = higher tier)
            if tier_index(b.get("score", 0) or 0) > a_tier:
                continue
            d = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
            if d < nearest_d:
                nearest_d = d
                nearest = b
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


# Country pairs/triplets that are *real* geographic adjacencies across
# continents. Clusters drawn entirely from these sets are not flagged.
_KNOWN_CROSS_CONTINENT_GROUPS = [
    {"Spain", "Morocco", "Gibraltar"},
    {"Spain", "Morocco"},
    {"Israel", "Egypt", "Jordan", "Palestine"},
    {"Israel", "Jordan", "Palestine"},
    {"Russia", "Kazakhstan"},
    {"Turkey", "Greece"},
    {"Indonesia", "Papua New Guinea", "East Timor"},
    {"Yemen", "Djibouti", "Eritrea"},
    {"Singapore", "Malaysia", "Indonesia"},  # southern tip of Malay Peninsula
]


def qa_flag_suspect_clusters(metros, cluster_rows):
    """Surface cluster rows whose membership looks geographically inconsistent.
    Editorial choices in the workbook are respected; this is a lightweight
    prompt to verify lat/long values.

    Filters: clusters spanning multiple continents AND not entirely contained
    in a known cross-continent geographic group; small clusters (size<=4)
    spanning 3+ countries are also flagged unless their countries match a
    known group.
    """
    by_slug = {m["slug"]: m for m in metros}
    suspects = []
    for r in cluster_rows:
        slugs = r["cluster_member_slugs"].split(";")
        members = [by_slug.get(s) for s in slugs if s in by_slug]
        continents = {(m.get("continent") or "").strip() for m in members}
        continents.discard("")
        countries = {(m.get("country") or "").strip() for m in members}
        size = int(r["cluster_size"])
        flag = None
        if len(continents) > 1:
            flag = "cross-continent"
        elif size <= 4 and len(countries) >= 3:
            flag = "3+countries-small"
        if flag is None:
            continue
        # Apply allowlist
        ok = any(countries.issubset(group) for group in _KNOWN_CROSS_CONTINENT_GROUPS)
        if ok:
            continue
        suspects.append((r["cluster_id"], size, sorted(continents), sorted(countries), slugs, flag))
    if not suspects:
        print("\n=== QA: no suspect clusters detected ===")
        return
    print("\n=== QA: suspect clusters (verify lat/long values) ===")
    for cid, sz, conts, ctry, slugs, flag in suspects:
        print(f"  {cid} [{flag}] (n={sz}, continents={conts}, countries={ctry}): {';'.join(slugs)}")


def main():
    metros = load_metros()
    capital_flags = load_capital_flags(metros)

    conurbation_rows = compute_conurbation_clusters(metros)
    iso_rows = compute_isolated_capital(metros, capital_flags)

    cluster_cols = ["slug", "name", "country", "rank", "cluster_id", "cluster_size", "cluster_diameter_km",
                    "cluster_avg_pairwise_km", "cluster_score_sum", "cluster_member_slugs", "cluster_member_names",
                    "cluster_other_slugs", "cluster_other_names", "tier"]
    iso_cols = ["slug", "name", "country", "rank", "distance_km", "peer_slug", "peer_name", "peer_country", "peer_rank", "tier"]

    write_csv(OUT_CONURBATIONS, conurbation_rows, cluster_cols)
    write_csv(OUT_ISOLATED, iso_rows, iso_cols)

    # Cluster summary
    cluster_summary = []
    for r in conurbation_rows:
        cluster_summary.append((r["cluster_id"], int(r["cluster_size"]), r["cluster_member_names"], float(r["cluster_diameter_km"])))
    print()
    print(f"Total clusters: {len(cluster_summary)}")
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
        print(f"  {r['name']:<25} (#{r['rank']:>4}, {r['country']:<22})  nearest same-or-higher-tier peer = {peer:<28} {r['distance_km']:>6.1f} km  tier {r['tier']}")
    qa_flag_suspect_clusters(metros, conurbation_rows)

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
                a_tier = tier_index(c.get('score', 0) or 0)
                ranked = [m for m in metros if has_coords(m) and tier_index(m.get('score', 0) or 0) <= a_tier and m['slug'] != c['slug']]
                if not ranked:
                    print(f"  OUT: {t} - no peer-of-higher-rank exists")
                else:
                    nearest = min(ranked, key=lambda x: haversine_km(c['lat'], c['lon'], x['lat'], x['lon']))
                    nd = haversine_km(c['lat'], c['lon'], nearest['lat'], nearest['lon'])
                    print(f"  OUT: {t} (#{c['rank']}) -> nearest same-or-higher-tier peer = {nearest['name']} (#{nearest['rank']}) {nd:.1f} km")


if __name__ == "__main__":
    main()
