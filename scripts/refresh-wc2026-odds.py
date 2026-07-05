#!/usr/bin/env python3
"""Refresh public/data/international/wc2026-odds.json from LIVE Polymarket odds.

Keeps the WC sim's market blend + the site's "Market" column current instead of
frozen. Runs on the mini (which has internet). The agent/CI fetches the
Polymarket events payload and saves it to disk; this parses that file. It picks
the outright-winner event, reads each team market's implied probability, maps
Polymarket team names to our slugs, converts probability to American odds (the
exact format the sim already de-vigs), and rewrites wc2026-odds.json preserving
its shape. Teams absent from Polymarket keep their prior odds and are flagged
'imputed', so coverage gaps never zero a team out.

Fetch (save to a file, then pass the path):
  https://gamma-api.polymarket.com/events?closed=false&limit=40&order=volume&ascending=false&tag=World%20Cup

Usage:
  python3 scripts/refresh-wc2026-odds.py /tmp/polymarket-wc.json
  python3 scripts/refresh-wc2026-odds.py /tmp/polymarket-wc.json --dry-run
"""
import sys, os, json, re, unicodedata, datetime, argparse

INTL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data", "international")
ODDS = os.path.join(INTL, "wc2026-odds.json")

# Polymarket display name -> our slug, where the normalizer isn't enough.
ALIAS = {
    "usa": "united-states", "united states": "united-states", "usmnt": "united-states",
    "south korea": "south-korea", "korea republic": "south-korea",
    "ivory coast": "cote-d-ivoire", "cote d'ivoire": "cote-d-ivoire",
    "bosnia": "bosnia-herzegovina", "bosnia and herzegovina": "bosnia-herzegovina",
    "czechia": "czech-republic", "dr congo": "congo-dr", "congo dr": "congo-dr",
    "cape verde": "cape-verde", "new zealand": "new-zealand", "saudi arabia": "saudi-arabia",
    "south africa": "south-africa",
}

def slugify(s):
    s = "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c))
    s = s.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def to_slug(name, known):
    n = (name or "").strip().lower()
    if n in ALIAS: return ALIAS[n]
    s = slugify(name)
    return s if s in known else (s or None)

def looks_like_winner_event(ev):
    t = (ev.get("title") or "").lower()
    if any(x in t for x in ("top scorer", "golden boot", "group ", "advance", "reach", "host", "player")):
        return False
    return "world cup" in t and ("winner" in t or "win the" in t or "to win" in t or "champion" in t)

def market_prob(m):
    """Yes-probability for a 'will <team> win' market."""
    try:
        prices = m.get("outcomePrices")
        if isinstance(prices, str): prices = json.loads(prices)
        outs = m.get("outcomes")
        if isinstance(outs, str): outs = json.loads(outs)
        if prices and outs:
            for o, p in zip(outs, prices):
                if str(o).strip().lower() == "yes":
                    return float(p)
            return float(prices[0])
    except Exception:
        pass
    ltp = m.get("lastTradePrice")
    return float(ltp) if ltp not in (None, "") else None

def american_from_prob(p):
    # sim de-vigs via 100/(odds+100), which assumes positive (underdog) American
    # odds. Every team in a 48-side field is < 50%, so this stays positive.
    p = max(1e-6, min(p, 0.98))
    return round(100.0 * (1.0 - p) / p)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("payload", help="saved Polymarket /events JSON")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.load(open(args.payload, encoding="utf-8"))
    events = data if isinstance(data, list) else data.get("data", [])
    winners = [e for e in events if looks_like_winner_event(e)]
    if not winners:
        sys.exit("No outright-winner World Cup event found in payload; not touching odds.")
    # richest winner market set (most per-team markets)
    ev = max(winners, key=lambda e: len(e.get("markets") or []))
    print(f"Winner event: {ev.get('title')!r}  ({len(ev.get('markets') or [])} markets)")

    doc = json.load(open(ODDS, encoding="utf-8"))
    known = set(doc.get("american_odds", {}).keys())
    prior = dict(doc.get("american_odds", {}))

    live = {}; unmapped = []
    for m in ev.get("markets") or []:
        name = m.get("groupItemTitle") or ""
        if not name:
            q = m.get("question") or ""
            mm = re.search(r"will (.+?) win", q, re.I)
            name = mm.group(1) if mm else ""
        p = market_prob(m)
        if not name or p is None or p <= 0:
            continue
        slug = to_slug(name, known)
        if not slug:
            unmapped.append(name); continue
        live[slug] = american_from_prob(p)

    if len(live) < 8:
        sys.exit(f"Only {len(live)} teams parsed from Polymarket — refusing to overwrite (transient/short read).")

    merged = dict(prior)          # keep prior for teams Polymarket doesn't list
    merged.update(live)           # overwrite with live where available
    imputed = sorted(s for s in merged if s not in live)

    doc["american_odds"] = merged
    doc["format"] = "american"
    doc["source"] = "Polymarket (gamma-api, de-vigged live market)"
    doc["source_url"] = "https://gamma-api.polymarket.com/events?tag=World%20Cup"
    doc["as_of"] = datetime.date.today().isoformat()
    doc["note"] = ("American odds derived from Polymarket implied probabilities. Teams not "
                   "listed on Polymarket retain their prior board value and are flagged 'imputed'.")
    doc["imputed"] = imputed

    print(f"live from Polymarket: {len(live)} teams | imputed (kept prior): {len(imputed)}")
    if unmapped:
        print("UNMAPPED (add to ALIAS):", ", ".join(sorted(set(unmapped))))
    top = sorted(live.items(), key=lambda kv: kv[1])[:6]
    print("shortest prices:", ", ".join(f"{s} +{o}" for s, o in top))

    if args.dry_run:
        print("DRY-RUN: not writing."); return
    json.dump(doc, open(ODDS, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"wrote {ODDS}")

if __name__ == "__main__":
    main()
