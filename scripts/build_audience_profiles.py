#!/usr/bin/env python3
"""Build the Audience Builder profile dataset.

Joins public/data/metros.json (summary attributes) with
public/data/details/<slug>.json (16-dimension ranks) into one
activation-ready record per metro. Dimensions are normalized to a 0..1
score and a 0..100 percentile the same way docs/prototypes/metro_similarity.py
does (best rank -> 1.0, missing -> worst). Consent and suppression are
SYNTHETIC, derived deterministically from the slug so they are stable
across builds; they exist only to make the governance gate demonstrable.

Run from repo root:
    python scripts/build_audience_profiles.py
Output: public/data/audience/profiles.json  (UTF-8)
"""
import json, os, glob, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")

DIMS = [
    "majorLeagueTeams", "totalTeams", "majorSportingEvents", "companies",
    "marketCap", "culturalEvents", "universities", "topUniHospResearch",
    "museumsLandmarks", "portsExchangesInfra", "airportScore", "luxuryStars",
    "metroStations", "suburbStations", "trainHubs", "skyscrapers",
]

def parse_rank(v):
    if v is None:
        return None
    s = str(v).replace("T-", "").strip()
    try:
        return int(s)
    except ValueError:
        return None

def govern(slug):
    h = int(hashlib.sha1(slug.encode()).hexdigest(), 16)
    consent_roll = h % 100
    consent = "opted_in" if consent_roll < 78 else "unknown" if consent_roll < 93 else "opted_out"
    suppressed = (h // 100) % 100 < 3
    return {"consent": consent, "suppressed": suppressed}

def main():
    metros = json.load(open(os.path.join(DATA, "metros.json"), encoding="utf-8"))

    # Pass 1: read detail files, gather parsed ranks per dim and a few attrs.
    detail = {}
    for m in metros:
        p = os.path.join(DATA, "details", m["slug"] + ".json")
        if not os.path.exists(p):
            continue
        try:
            d = json.load(open(p, encoding="utf-8"))
        except Exception:
            continue
        dr = d.get("dimRanks") or {}
        mt = d.get("metro") or {}
        detail[m["slug"]] = {
            "ranks": {k: parse_rank(dr.get(k)) for k in DIMS},
            "capital": bool(mt.get("capital")),
            "gdpPerCapita": mt.get("gdpPerCapita"),
        }

    # Global max rank per dim (for normalization).
    maxr = {}
    for k in DIMS:
        vals = [detail[s]["ranks"][k] for s in detail if detail[s]["ranks"][k] is not None]
        maxr[k] = max(vals) if vals else 1

    def pct(k, r):
        # Percentile 0..100 (best rank -> 100, missing -> 0). The segment
        # builder thresholds on percentiles; lookalike scoring lives in a
        # separate precomputed neighbors file, so we keep this file compact.
        if r is None:
            return 0
        denom = maxr[k] - 1 if maxr[k] > 1 else 1
        return round((1 - (r - 1) / denom) * 100)

    profiles = []
    for m in metros:
        det = detail.get(m["slug"])
        ranks = det["ranks"] if det else {k: None for k in DIMS}
        profiles.append({
            "slug": m["slug"],
            "name": m["name"],
            "country": m["country"],
            "region": m["region"],
            "continent": m["continent"],
            "capital": det["capital"] if det else False,
            "attrs": {
                "rank": m.get("rank"),
                "pop": m.get("pop"),
                "gdpPerCapita": (det.get("gdpPerCapita") if det else None),
                "majorTeams": m.get("majorTeams"),
                "companies": m.get("companies"),
                "skyscrapers": m.get("skyscrapers"),
                "marketCap": m.get("marketCap"),
            },
            "dims": {k: pct(k, ranks[k]) for k in DIMS},
            "governance": govern(m["slug"]),
        })

    out_dir = os.path.join(DATA, "audience")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "profiles.json")
    json.dump(profiles, open(out, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    # Quick provenance summary.
    import collections
    cons = collections.Counter(p["governance"]["consent"] for p in profiles)
    supp = sum(1 for p in profiles if p["governance"]["suppressed"])
    print("wrote %d profiles to %s" % (len(profiles), out))
    print("consent:", dict(cons), "| suppressed:", supp,
          "| with detail:", len(detail))

if __name__ == "__main__":
    main()
