import json, math, time, urllib.request
from collections import defaultdict

BASE = "https://nmprqkmymrdknffwnuur.supabase.co/rest/v1"
key = None
with open(r"C:\Users\ashwi\Desktop\Projects\Metro Area Project\.env.local") as f:
    for line in f:
        if line.startswith("SUPABASE_SERVICE_KEY="):
            key = line.strip().split("=", 1)[1]
HEAD = {"apikey": key, "Authorization": "Bearer " + key,
        "Content-Type": "application/json", "Prefer": "return=minimal"}

def fetch(path, page=1000):
    rows, off = [], 0
    while True:
        req = urllib.request.Request(BASE + path + "&limit=%d&offset=%d" % (page, off), headers=HEAD)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    batch = json.loads(r.read().decode("utf-8"))
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(3 * (attempt + 1))
        rows += batch
        if len(batch) < page:
            return rows
        off += page

BASE_PARAMS = dict(K=14.0, PHI=0.85, PROMO=1470.0, WINDOW=5, SHRINK=200,
                   HFA0=130.0, NU0=0.72, NU_SCALE=1.05)
UEFA = {"eur|european-cup", "eur|champions-league", "eur|uefa-cup", "eur|europa-league",
        "eur|cup-winners-cup", "eur|inter-cities-fairs-cup", "eur|europa-conference-league"}
# WP5 (ruled 2026-08-31): the ten major domestic cups rate in Elo (standard K,
# no euro multiplier) so cup upsets can be priced. Exclude flag ignored for
# these, same reading as UEFA rows. The n-a| shadow keys are NOT here.
CUPS = {"england|fa-cup", "england|league-cup", "spain|copa-del-rey",
        "italy|coppa-italia", "germany|dfb-pokal", "france|coupe-de-france",
        "scotland|scottish-cup", "scotland|scottish-league-cup",
        "netherlands|knvb-beker", "portugal|taca-de-portugal"}

def gmul(d):
    d = abs(d)
    if d < 2:
        return 1.0
    if d == 2:
        return 1.5
    return (11.0 + d) / 8.0

def davidson(rh, ra, hfa, nu):
    h = 10.0 ** ((rh + hfa) / 400.0)
    a = 10.0 ** (ra / 400.0)
    g = math.sqrt(h * a)
    den = h + a + nu * g
    return h / den, nu * g / den, a / den

def cycle_of(date):
    y, mo = int(date[:4]), int(date[5:7])
    return y if mo >= 7 else y - 1

import pickle, os
CACHE = r"C:\Users\ashwi\AppData\Local\Temp\clubgames_elo_cache.pkl"
if os.path.exists(CACHE):
    with open(CACHE, "rb") as fh:
        comps, cc, uc, M = pickle.load(fh)
    print("cache loaded", flush=True)
else:
    comps = cc = uc = M = None
print("fetching...", flush=True)
if comps is None:
    comps = fetch("/football_competitions?select=comp_key,country&order=comp_key")
    cc = fetch("/cl_league_history?select=cur_name,country,year&level=eq.1&order=id")
    uc = fetch("/uefa_country_coeff_history?select=year,league,cur_country,normalized&order=year")
    M = fetch("/football_matches?select=id,match_date,season,comp_key,home_cur_name,away_cur_name,"
              "hg,ag,neutral,is_league,is_european,level,exclude&order=id", page=1000)
    with open(CACHE, "wb") as fh:
        pickle.dump((comps, cc, uc, M), fh)
    print("cache saved", flush=True)
CTRY = {c["comp_key"]: c["country"] for c in comps}
latest = {}
for r in cc:
    if r["cur_name"] and (r["cur_name"] not in latest or int(r["year"]) > latest[r["cur_name"]][1]):
        latest[r["cur_name"]] = (r["country"], int(r["year"]))
CLUB_CTRY = {k: v[0] for k, v in latest.items()}
COEF = defaultdict(dict)
for r in uc:
    y = int(r["year"])
    nv = float(r["normalized"]) if r["normalized"] is not None else None
    if nv is None:
        continue
    if r["league"]:
        COEF[y][r["league"]] = nv
    if r["cur_country"] and r["cur_country"] not in COEF[y]:
        COEF[y][r["cur_country"]] = nv
print("coef years:", len(COEF), flush=True)
print("matches:", len(M), flush=True)

rated = []
for m in M:
    if m["is_european"] and m["comp_key"] in UEFA:
        rated.append(m)  # UEFA matches rate regardless of the workbook Exclude flag (hub-scope flag, not data quality)
    elif m["comp_key"] in CUPS:
        rated.append(m)  # WP5: major domestic cups rate regardless of Exclude
    elif m["exclude"]:
        continue
    elif m["is_league"] and (m["level"] == 1 or m["level"] is None):
        rated.append(m)
rated.sort(key=lambda m: (m["match_date"], m["id"]))
print("rated:", len(rated), flush=True)

agg = defaultdict(lambda: [0, 0, 0])
for m in rated:
    grp = "EUR" if m["is_european"] else (CTRY.get(m["comp_key"]) or "OTHER")
    a = agg[(grp, cycle_of(m["match_date"]))]
    a[0 if m["hg"] > m["ag"] else (1 if m["hg"] == m["ag"] else 2)] += 1
group_cycles = defaultdict(list)
for (grp, cyc) in agg:
    group_cycles[grp].append(cyc)
p = BASE_PARAMS
PAR = {}
for grp, cycs in group_cycles.items():
    cycs.sort()
    for i, cyc in enumerate(cycs):
        h = d = a = 0
        for w in cycs[max(0, i - p["WINDOW"]):i]:
            c = agg[(grp, w)]
            h += c[0]; d += c[1]; a += c[2]
        n = h + d + a
        if n < 200:
            PAR[(grp, cyc)] = (p["HFA0"], p["NU0"])
            continue
        H, D, A = h / n, d / n, a / n
        hfa = 400.0 * math.log10(max(H, 1e-6) / max(A, 1e-6))
        nu = D / math.sqrt(max(H * A, 1e-9))
        k = n / (n + p["SHRINK"])
        PAR[(grp, cyc)] = (k * hfa + (1 - k) * p["HFA0"], k * nu + (1 - k) * p["NU0"])

def run(euro_mult, spill, coef_w=0.0, collect=False):
    R = {}
    members = defaultdict(set)
    of_club = {}
    def init_club(club, comp_key, is_league, is_cup=False):
        ctry = CLUB_CTRY.get(club) or (CTRY.get(comp_key) if (is_league or is_cup) else None) or "OTHER"
        of_club[club] = ctry
        if not is_cup:
            members[ctry].add(club)
        # members = the CORE population (league + European entrants). Cup-only
        # clubs are rated but NEVER join it: letting hundreds of non-league
        # minnows into the country mean deflates the summer reversion anchor
        # for everyone (first attempt did exactly that: euro Brier 0.639).
        ms = [R[c] for c in members[ctry] if c in R]
        cm = sum(ms) / len(ms) if len(ms) >= 3 else None
        if is_league:
            R[club] = (cm - 30.0) if cm is not None else p["PROMO"]
        elif is_cup:
            # lower-division or non-league entrant: deep discount below the
            # top-flight country mean so giant-killings price as upsets
            R[club] = (cm - 250.0) if cm is not None else 1250.0
        else:
            R[club] = cm if cm is not None else 1500.0
    out = []
    snaps = {}
    eb, en, lb, ln, cb, cn = 0.0, 0, 0.0, 0, 0.0, 0
    prev_cycle = None
    for m in rated:
        cyc = cycle_of(m["match_date"])
        if prev_cycle is not None and cyc != prev_cycle:
            if prev_cycle in (1959, 1974, 1989, 2004, 2014, 2024):
                snaps[prev_cycle] = dict(R)
            cms = {}
            for ctry, mem in members.items():
                ms = [R[c] for c in mem if c in R]
                cms[ctry] = sum(ms) / len(ms) if ms else 1500.0
            coefs = COEF.get(prev_cycle + 1, {})
            if coef_w > 0.0 and coefs:
                gmean = sum(R.values()) / len(R)
                present = [c for c in cms if c in coefs]
                if present:
                    mnorm = sum(coefs[c] for c in present) / len(present)
                    for ctry in present:
                        cms[ctry] = gmean + coef_w * (coefs[ctry] - mnorm)
            for club in R:
                ct = of_club.get(club, "OTHER")
                base = cms.get(ct, 1500.0)
                if club not in members[ct]:
                    base -= 250.0  # cup-only clubs revert toward their own stratum
                R[club] = base + p["PHI"] * (R[club] - base)
        prev_cycle = cyc
        h, a = m["home_cur_name"], m["away_cur_name"]
        is_cup = m["comp_key"] in CUPS
        if h not in R:
            init_club(h, m["comp_key"], m["is_league"], is_cup)
        if a not in R:
            init_club(a, m["comp_key"], m["is_league"], is_cup)
        if not is_cup:
            # a formerly cup-only club now in league/European play joins the
            # core, entering no lower than a normal promoted club would
            for c in (h, a):
                ct = of_club.get(c, "OTHER")
                if c not in members[ct]:
                    members[ct].add(c)
                    ms = [R[x] for x in members[ct] if x in R and x != c]
                    if len(ms) >= 3:
                        R[c] = max(R[c], sum(ms) / len(ms) - 30.0)
        grp = "EUR" if m["is_european"] else (CTRY.get(m["comp_key"]) or "OTHER")
        hfa, nu = PAR[(grp, cyc)]
        nu *= p["NU_SCALE"]
        use_hfa = 0.0 if m["neutral"] else hfa
        rh, ra = R[h], R[a]
        pH, pD, pA = davidson(rh, ra, use_hfa, nu)
        res = 1 if m["hg"] > m["ag"] else (0 if m["hg"] == m["ag"] else -1)
        w = 1.0 if res == 1 else (0.5 if res == 0 else 0.0)
        kk = p["K"] * (euro_mult if m["is_european"] else 1.0)
        delta = kk * gmul(m["hg"] - m["ag"]) * (w - (pH + 0.5 * pD))
        R[h] = rh + delta
        R[a] = ra - delta

        if m["is_european"] and spill > 0.0:
            ch, ca = of_club.get(h, "OTHER"), of_club.get(a, "OTHER")
            if ch != ca:
                for ctry, sign, part in ((ch, 1.0, h), (ca, -1.0, a)):
                    mates = [c for c in members[ctry] if c in R and c != part]
                    if mates:
                        s = sign * spill * delta / len(mates)
                        for c in mates:
                            R[c] += s
        b3 = (pH - (res == 1)) ** 2 + (pD - (res == 0)) ** 2 + (pA - (res == -1)) ** 2
        if cyc >= 1960:
            if m["is_european"]:
                eb += b3; en += 1
            elif is_cup:
                cb += b3; cn += 1
            else:
                lb += b3; ln += 1
        if collect:
            out.append({"match_id": m["id"], "home_pre": round(rh, 2), "away_pre": round(ra, 2),
                        "home_post": round(R[h], 2), "away_post": round(R[a], 2),
                        "p_home": round(pH, 4), "p_draw": round(pD, 4), "p_away": round(pA, 4),
                        "hfa": round(use_hfa, 1), "nu": round(nu, 3)})
    snaps[prev_cycle] = dict(R)
    return out, snaps, eb / max(en, 1), lb / max(ln, 1), cb / max(cn, 1), of_club

def ranks_of(snap, clubs):
    order = sorted(snap.items(), key=lambda x: -x[1])
    pos = {c: i + 1 for i, (c, _) in enumerate(order)}
    return {c: pos.get(c) for c in clubs}

EM, SP, CW = 2.5, 1.5, 0.0
print("=== FINAL run em=%.1f sp=%.1f cw=%.0f ===" % (EM, SP, CW), flush=True)
out, snaps, ebr, lbr, cbr, _ = run(EM, SP, CW, collect=True)
print("euroBrier=%.5f leagueBrier=%.5f cupBrier=%.5f rows=%d" % (ebr, lbr, cbr, len(out)), flush=True)
print("GUARD: shipped pre-cup baselines euro 0.55167 league 0.58471", flush=True)
for yy in (1959, 1974, 1989, 2004, 2014, 2024):
    topn = sorted(snaps.get(yy, {}).items(), key=lambda x: -x[1])[:10]
    print("%d top10: " % yy + " | ".join("%d.%s %.0f" % (i + 1, c, r) for i, (c, r) in enumerate(topn)), flush=True)

def rest(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=HEAD, method=method)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.status
        except Exception:
            if attempt == 4:
                raise
            time.sleep(4 * (attempt + 1))

print("deleting old football_elo...", flush=True)
print("delete status:", rest("DELETE", "/football_elo?match_id=gte.0"), flush=True)
print("posting %d rows..." % len(out), flush=True)
for i in range(0, len(out), 2000):
    rest("POST", "/football_elo", out[i:i + 2000])
    if (i // 2000) % 20 == 0:
        print("posted through", i + 2000, flush=True)
print("post complete:", len(out), flush=True)
