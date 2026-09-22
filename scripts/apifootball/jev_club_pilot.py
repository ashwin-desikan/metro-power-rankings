#!/usr/bin/env python3
"""jev_club_pilot.py -- evaluation harness for TypeSafe Jev resolving an
api-football team name to a club in our football_lookup crosswalk, with
calibrated confidence, BEFORE any automation is trusted. NEVER writes to
Supabase and never edits Lookup (no --write flag, none is coming -- this is
measurement only, same stance as scripts/mktcap/jev_metro_pilot.py).

The gap it measures: refresh.py resolves an api team by EXACT normalised name
against the Lookup alias columns, and exits 3 with an UNMATCHED alert for
anything left over. Today that backlog is 3,465 teams. Some of them are clubs
we already carry under a different spelling (a Lookup edit); most are clubs we
have never curated (correctly left alone). Telling those apart is the judgment.

Modes: --self-test            pure logic, no network, no API key
       --recall [--limit N]   retrieval recall + lexical baseline, NO API spend
       --eval [--limit N] [--set hard|control|negative|all]
       --report [file]
       --queue [--limit N]    proposals for the real unmatched backlog (dry run)
No flags: prints help.

Run --recall FIRST and read it. Jev can only ever pick a club that code put in
front of it, so recall@N is a hard ceiling on coverage, and the top-1 lexical
column tells you how much of the job needs no model at all. That ordering is
the 2026-09-22 mktcap ruling (run the free check first) applied here.

Truth for --eval comes from Lookup itself: 2,199 rows carry an api_name that
differs from the canonical team name, so each one is a real (incoming name ->
correct club) pair. The true club's api_name/api_name_2 are HELD OUT from both
retrieval and the option descriptions, which is what makes the task non-trivial
-- without the holdout this measures nothing but exact string equality.

Key: env TYPESAFE_API_KEY, else file typesafe_key.txt next to this script.
Supabase access is via refresh.py's supa_key()/supa_get() (unrelated key).
"""
import argparse, csv, hashlib, json, math, os, re, sys, time
import urllib.request, urllib.error

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh import norm, supa_get, supa_key   # same normalisation as the real resolver

HERE = os.path.dirname(os.path.abspath(__file__))
UNMATCHED_JSON = os.path.join(HERE, "_scratch", "unmatched_teams.json")

TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone"
QCLUB = "club"
QRESERVE = "reserve"
COST_PER_MTOK = 0.042   # docs.typesafe.ai/models, verified 2026-09-22: $0.042/M input, output free

NONE_DESC = ("None of the listed clubs is this team, or it cannot be determined. Choose this "
             "when the team is a club we do not carry, rather than forcing a lexically similar one.")

CLUB_INSTRUCTIONS = (
    "The state carries a football team name exactly as the api-football provider spells it, plus "
    "whatever context we have. Ask which of the listed clubs it refers to. The listed names are "
    "our own spellings and may differ from the provider's: abbreviations, a dropped or added "
    "FC/CF/SC prefix, an accent or transliteration difference, a sponsor name, a city-only or "
    "nickname-only form, and a regional suffix such as /RJ or /SP all still describe the same "
    "club. Choose 'none' only if none of the listed clubs is this team, or it cannot be "
    "determined. A team that merely plays in the same city or has a similar name is not a match.")

RESERVE_INSTRUCTIONS = (
    "Does the provider's team name denote a team OTHER than the club's senior men's first team, "
    "such as a reserve or B team, an academy or youth age-group side, or a women's team?")
RESERVE_CRITERIA = {
    "true": ("The name marks it as a second, youth or women's side: a B/II/III suffix, a "
             "reserve or amateur designation, an age group such as U19, U21 or U23, or a "
             "women's marker such as W, Women, Feminin, Femminile or Ladies."),
    "false": "The name denotes the club's senior men's first team, with no such marker.",
}

# Token noise in club names. Stripped for the TOKEN half of the similarity only; the trigram
# half always sees the full string, so discriminative power is not thrown away. Deliberately
# excludes anything that identifies a club ("inter", "real", "atletico", "1860", "1927").
STOP = {"fc", "cf", "sc", "ac", "afc", "cfc", "cd", "ud", "sd", "rc", "rcd", "cs", "ca", "fk",
        "sk", "nk", "hk", "bk", "if", "ff", "sv", "tsv", "vfl", "vfb", "fsv", "ss", "as", "us",
        "ssd", "asd", "club", "calcio", "futbol", "football", "fussball", "fotball", "futebol",
        "de", "del", "da", "do", "der", "the"}

RESERVE_BLOCK = 0.50   # noul at or above this blocks a proposal regardless of choice confidence

# Reserve/youth/women markers in a club name. Used ONLY on OUR OWN Lookup names, where the
# spelling is curated and a regex is reliable -- the provider's messy spelling is what the noul
# is for. Anywhere-tokens are words; FINAL-only tokens are the single letters and roman numerals,
# which are suffixes in every real naming convention and would otherwise eat clubs like
# "W Connection" (Trinidad) and "B68 Toftir" (Faroe Islands).
RESERVE_TOKENS_ANY = {"reserve", "reserves", "reserva", "amateur", "amateure", "junior",
                      "juniors", "academy", "youth", "women", "womens", "feminin", "feminine",
                      "femenino", "femminile", "ladies", "dames"}
RESERVE_TOKENS_FINAL = {"b", "ii", "iii", "w"}
RESERVE_AGE_RE = re.compile(r"^(u|sub)(1[5-9]|2[0-3])$")


# ---------------------------------------------------------------- pure helpers

def det_hash(key, seed):
    h = hashlib.sha256(f"{seed}:{key}".encode("utf-8")).hexdigest()
    return int(h[:16], 16)


def sample_order(rows, seed, keyfn):
    """Deterministic pseudo-random order so any --limit prefix is representative.

    Same lesson as the metro pilot: the labelled rows arrive sorted by club name, and an
    alphabetical prefix is a biased sample (all the A-clubs, which skew to one or two
    countries). Hash ordering keeps a run reproducible while making a prefix unbiased."""
    return sorted(rows, key=lambda r: det_hash(keyfn(r), seed))


def trigrams(s):
    s = f"  {s}  "
    return {s[i:i + 3] for i in range(len(s) - 2)}


def dice(a, b):
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def content_tokens(nrm):
    """Tokens of an ALREADY-normalised string, minus generic club-name noise.
    Falls back to the unstripped tokens when stripping would empty the set, so a club
    literally called 'FC' still compares against something."""
    toks = [t for t in nrm.split() if t]
    kept = [t for t in toks if t not in STOP]
    return set(kept) if kept else set(toks)


def looks_reserve(name):
    """Does a club name we curate mark itself as a reserve, youth or women's side?"""
    toks = norm(name or "").split()
    if not toks:
        return False
    for t in toks:
        if t in RESERVE_TOKENS_ANY or RESERVE_AGE_RE.match(t):
            return True
    return toks[-1] in RESERVE_TOKENS_FINAL


def containment(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def sim(a_norm, b_norm):
    """Lexical similarity of two ALREADY-normalised names, 0..1. Exact match is 1.0."""
    if not a_norm or not b_norm:
        return 0.0
    if a_norm == b_norm:
        return 1.0
    d = dice(trigrams(a_norm), trigrams(b_norm))
    c = containment(content_tokens(a_norm), content_tokens(b_norm))
    return 0.6 * d + 0.4 * c


ALIAS_COLS = ("team", "cur_name", "lookup_name", "uefa_name", "uefa_name_2", "efs_name")
API_COLS = ("api_name", "api_name_2")


def club_key(rec):
    return (rec.get("team"), rec.get("country"))


def club_aliases(rec, hold_api=False):
    """Visible spellings of a club. hold_api=True drops the api_name columns, which is how a
    labelled row is turned back into an honest unmatched case: those columns ARE the answer."""
    cols = ALIAS_COLS if hold_api else ALIAS_COLS + API_COLS
    out, seen = [], set()
    for c in cols:
        v = (rec.get(c) or "").strip()
        if not v:
            continue
        n = norm(v)
        if not n or n in seen:
            continue
        seen.add(n)
        out.append(v)
    return out


def club_score(incoming_norm, rec, hold_api=False):
    """Best similarity over any visible spelling of the club."""
    best = 0.0
    for a in club_aliases(rec, hold_api):
        s = sim(incoming_norm, norm(a))
        if s > best:
            best = s
    return best


def country_pool(country, clubs, known_countries):
    """Hard-filter by country ONLY when the provider's country string is one Lookup actually
    uses. api-football and the workbook do not always agree on a country's spelling, and
    filtering on an unrecognised string would silently empty the candidate list -- a failure
    that looks exactly like 'no match exists'. 2,240 of the 3,465 unmatched teams carry no
    country at all, so the unfiltered path is the common one, not the exception."""
    n = norm(country or "")
    if n and n in known_countries:
        return [c for c in clubs if norm(c.get("country") or "") == n]
    return clubs


def retrieve(incoming, country, clubs, known_countries, n=30, hold_key=None, drop_key=None):
    """Top-n candidate clubs by lexical similarity, best first.

    hold_key: club key whose api_name columns are hidden (the eval holdout).
    drop_key: club key removed entirely (the NEGATIVE set -- truth is not on the menu).
    Ties break on the canonical name so a run is reproducible."""
    q = norm(incoming)
    scored = []
    for rec in country_pool(country, clubs, known_countries):
        k = club_key(rec)
        if drop_key is not None and k == drop_key:
            continue
        s = club_score(q, rec, hold_api=(hold_key is not None and k == hold_key))
        if s <= 0:
            continue
        scored.append((s, rec))
    scored.sort(key=lambda t: (-t[0], str(club_key(t[1]))))
    return [(s, r) for s, r in scored[:n]]


def build_id_map(cands):
    """Opaque ids: club names carry commas, slashes and accents that must never be read as
    Jev syntax, and an id keeps the option label from leaking similarity information."""
    id_map, order = {}, []
    for i, (_, rec) in enumerate(cands):
        cid = f"c{i + 1:03d}"
        id_map[cid] = rec
        order.append(cid)
    return id_map, order


def describe_club(rec, hold_api=False):
    """Option description. Names the club, its country and tier, and the other spellings we
    hold, because the docs are explicit that descriptions must separate the options."""
    bits = [rec.get("team") or "?"]
    ctry = (rec.get("country") or "").strip()
    lvl = rec.get("level")
    tail = ctry if ctry else ""
    if lvl:
        tail = f"{tail}, tier {lvl}" if tail else f"tier {lvl}"
    if tail:
        bits.append(f"({tail})")
    others = [a for a in club_aliases(rec, hold_api) if norm(a) != norm(rec.get("team") or "")]
    head = " ".join(bits)
    if others:
        return f"{head}; also spelled: {', '.join(others[:4])}"
    return head


def build_criteria(id_map, order, hold_key=None):
    crit = {}
    for cid in order:
        rec = id_map[cid]
        crit[cid] = describe_club(rec, hold_api=(hold_key is not None and club_key(rec) == hold_key))
    crit["none"] = NONE_DESC
    return crit


def resolve_pick(answer, id_map):
    """Club key Jev actually picked, independent of threshold. 'none' or 'ERROR'."""
    if not isinstance(answer, dict):
        return "ERROR"
    choice = answer.get("choice")
    if choice == "none":
        return "none"
    if isinstance(choice, str) and choice in id_map:
        return club_key(id_map[choice])
    return "ERROR"


def decide(answer, reserve_noul, id_map, threshold, reserve_block=RESERVE_BLOCK):
    """("propose", club_key) or ("abstain", reason).

    The reserve gate is checked BEFORE confidence on purpose. 'Granada II' scores ~0.95
    lexically against 'Granada CF' and a confident wrong link is exactly the failure the
    collision guard cannot catch: it is a plausible club, just not this team.

    It fires only when the PICKED club is a senior side. We carry 118 reserve teams as clubs
    in their own right, so 'Villarreal II' -> 'Villarreal B' is the correct answer and must
    not be blocked. The first measured run (2026-09-22) blocked 13 rows and several were
    exactly that shape, which is what this second condition is for: the noul reads the
    provider's messy name, the regex reads our own curated one."""
    if not isinstance(answer, dict):
        return ("abstain", "malformed_answer")
    if "choice" not in answer:
        return ("abstain", "malformed_answer")
    if "confidence" not in answer:
        return ("abstain", "missing_confidence")
    conf, choice = answer["confidence"], answer["choice"]
    if not isinstance(choice, str):
        return ("abstain", "malformed_answer")
    if not isinstance(conf, (int, float)) or isinstance(conf, bool):
        return ("abstain", "malformed_answer")
    if choice == "none":
        return ("abstain", "choice_none")
    if choice not in id_map:
        return ("abstain", "unknown_id")
    picked = club_key(id_map[choice])
    if isinstance(reserve_noul, (int, float)) and not isinstance(reserve_noul, bool) \
            and reserve_noul >= reserve_block and not looks_reserve(picked[0]):
        return ("abstain", "reserve_or_womens")
    if conf < threshold:
        return ("abstain", "low_confidence")
    return ("propose", picked)


def proposal_action(club, tid, owners, alias_map, known_ids):
    """What a human would actually DO with an accepted proposal. Mirrors the buckets in
    build_unmatched_report.classify, because a proposal whose club is already owned by a
    different team_id is not a Lookup edit at all -- refresh.py's collision guard would
    reject it. It is an alias row."""
    if tid in known_ids:
        return "already_linked"
    if tid in alias_map:
        return "already_aliased"
    owner = owners.get(club)
    if owner is not None and owner != tid:
        return "alias_row"
    return "lookup_edit"


# ------------------------------------------------------------- eval-set design

def build_labelled(clubs):
    """Every Lookup club whose api_name is a real, differing provider spelling becomes one
    (incoming name -> correct club) pair. api_name_2 yields a second pair when present."""
    out = []
    for rec in clubs:
        for col in API_COLS:
            v = (rec.get(col) or "").strip()
            if not v:
                continue
            out.append({"incoming": v, "country": rec.get("country"), "truth": club_key(rec),
                        "rec": rec, "col": col})
    return out


def exact_resolves_without_api(incoming, rec):
    """Would refresh.py's exact-name match still find this club with the api columns held out?
    If yes the pair is CONTROL (code already handles it); if no it is HARD, and is a faithful
    replay of a team sitting in today's UNMATCHED backlog."""
    q = norm(incoming)
    return any(norm(a) == q for a in club_aliases(rec, hold_api=True))


def build_eval_sets(labelled, seed):
    hard, control = [], []
    for p in labelled:
        (control if exact_resolves_without_api(p["incoming"], p["rec"]) else hard).append(p)
    hard = sorted(hard, key=lambda p: (str(p["truth"]), p["incoming"]))
    control = sorted(control, key=lambda p: (str(p["truth"]), p["incoming"]))
    control = sorted(sample_order(control, seed, pair_key)[:len(hard)],
                     key=lambda p: (str(p["truth"]), p["incoming"]))
    neg_n = (len(hard) * 20) // 100
    negative = sorted(sample_order(hard, seed, pair_key)[:neg_n],
                      key=lambda p: (str(p["truth"]), p["incoming"]))
    return {"hard": hard, "control": control, "negative": negative}


def pair_key(p):
    return f"{p['incoming']}|{p['truth'][0]}|{p['truth'][1]}"


def rank_of_truth(cands, truth):
    for i, (_, rec) in enumerate(cands):
        if club_key(rec) == truth:
            return i + 1
    return None


# ------------------------------------------------------------------- transport

def backoff_schedule():
    return [1, 2, 4, 8, 16]


def get_typesafe_key():
    k = os.environ.get("TYPESAFE_API_KEY")
    if k:
        return k.strip()
    cand = os.path.join(HERE, "typesafe_key.txt")
    if os.path.exists(cand):
        return open(cand, encoding="utf-8-sig").read().strip()
    return None


def call_jev(api_key, incoming, country, extra, criteria, timeout=30):
    """(response|None, latency_ms, error|None). Exits on 401. 422 -> ('422'). 429/529 backoff."""
    state = {"provider_team_name": incoming, "country": country or "unknown"}
    state.update(extra or {})
    body = {"state": state, "model": "jev-latest",
            "questions": {
                QCLUB: {"type": "choice", "instructions": CLUB_INSTRUCTIONS, "criteria": criteria},
                QRESERVE: {"type": "noul", "instructions": RESERVE_INSTRUCTIONS,
                           "criteria": RESERVE_CRITERIA},
            }}
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    delays = backoff_schedule()
    for attempt in range(5):
        req = urllib.request.Request(
            TYPESAFE_URL, data=data,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST")
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8")), int((time.time() - t0) * 1000), None
        except urllib.error.HTTPError as e:
            ms = int((time.time() - t0) * 1000)
            if e.code == 401:
                sys.exit("FATAL: TypeSafe API key rejected (401)")
            if e.code == 422:
                return None, ms, "422"
            if e.code in (429, 529) and attempt < 4:
                time.sleep(delays[attempt]); continue
            return None, ms, str(e.code)
        except Exception:
            ms = int((time.time() - t0) * 1000)
            if attempt < 4:
                time.sleep(delays[attempt]); continue
            return None, ms, "error"
    return None, 0, "exhausted"


def noul_value(resp):
    a = (resp.get("answers") or {}).get(QRESERVE) if resp else None
    if isinstance(a, dict) and isinstance(a.get("noul"), (int, float)) \
            and not isinstance(a.get("noul"), bool):
        return a["noul"]
    return None


def format_top3(probs, id_map):
    if not isinstance(probs, dict) or not probs:
        return ""
    items = []
    for k, v in probs.items():
        if not isinstance(v, (int, float)):
            continue
        name = "none" if k == "none" else (club_key(id_map[k])[0] if k in id_map else k)
        items.append((name, v))
    items.sort(key=lambda x: -x[1])
    return "|".join(f"{n}:{p}" for n, p in items[:3])


# --------------------------------------------------------------------- metrics

def percentile(values, p):
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * p
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return float(s[int(k)])
    return s[f] + (s[c] - s[f]) * (k - f)


def reliability_table(pairs):
    bins = [[] for _ in range(10)]
    for conf, corr in pairs:
        if conf is None:
            continue
        bins[min(int(conf * 10), 9)].append((conf, corr))
    table = []
    for i, b in enumerate(bins):
        if not b:
            table.append({"bin": i, "n": 0, "mean_conf": None, "accuracy": None})
            continue
        table.append({"bin": i, "n": len(b),
                      "mean_conf": sum(c for c, _ in b) / len(b),
                      "accuracy": sum(cr for _, cr in b) / len(b)})
    return table


def ece(pairs):
    table = reliability_table(pairs)
    n = sum(t["n"] for t in table)
    if n == 0:
        return 0.0
    return sum(t["n"] * abs(t["mean_conf"] - t["accuracy"]) for t in table if t["n"] > 0) / n


def pick_correct(row):
    """Threshold-free: did the raw pick equal the truth ('none' == 'none' counts)? The CSV
    'correct' column is tied to the run's --threshold, so it must never feed calibration."""
    return 1 if row["pick"] == row["truth"] else 0


def coverage_precision(rows, threshold):
    proposed = [r for r in rows if r["pick"] not in ("none", "ERROR")
                and r["confidence"] is not None and r["confidence"] >= threshold]
    coverage = len(proposed) / len(rows) if rows else 0.0
    precision = (sum(1 for r in proposed if r["pick"] == r["truth"]) / len(proposed)
                 if proposed else None)
    return coverage, precision


# ------------------------------------------------------------------- data load

def load_clubs():
    rows = supa_get("/rest/v1/football_lookup?select=" + ",".join(
        ("team", "country", "level") + ALIAS_COLS[1:] + API_COLS), supa_key())
    return [r for r in rows if (r.get("team") or "").strip()]


def known_country_set(clubs):
    return {norm(c.get("country") or "") for c in clubs if (c.get("country") or "").strip()}


def load_unmatched():
    if not os.path.exists(UNMATCHED_JSON):
        sys.exit(f"No {UNMATCHED_JSON}. Run audit_unmatched.py first.")
    age_days = (time.time() - os.path.getmtime(UNMATCHED_JSON)) / 86400
    rows = json.load(open(UNMATCHED_JSON, encoding="utf-8"))
    if age_days > 7:
        print(f"WARNING: {os.path.basename(UNMATCHED_JSON)} is {age_days:.0f} days old. "
              f"Re-run audit_unmatched.py for a current backlog; proposals below may name "
              f"teams that have since been linked.\n")
    return rows


# ------------------------------------------------------------------------- CSV

CSV_COLS = ["set", "key", "incoming", "country", "truth", "pick", "confidence", "top3",
            "reserve_noul", "decision", "reason", "correct", "n_cands", "truth_rank",
            "base_top1", "base_top1_correct", "latency_ms", "input_tokens", "model"]


def today_csv_path(kind="eval"):
    import datetime
    return os.path.join(HERE, "out", f"jev_club_{kind}_{datetime.date.today().isoformat()}.csv")


def load_resume(path):
    done = set()
    if not os.path.exists(path):
        return done
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            done.add((row["set"], row["key"]))
    return done


def append_csv_row(path, row):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLS)
        if new:
            w.writeheader()
        w.writerow(row)


def read_eval_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row["confidence"] = float(row["confidence"]) if row["confidence"] != "" else None
            row["reserve_noul"] = float(row["reserve_noul"]) if row["reserve_noul"] != "" else None
            row["correct"] = int(row["correct"]) if row["correct"] != "" else 0
            row["latency_ms"] = float(row["latency_ms"]) if row["latency_ms"] else 0.0
            row["input_tokens"] = int(row["input_tokens"]) if row["input_tokens"] else 0
            row["truth_rank"] = int(row["truth_rank"]) if row["truth_rank"] else None
            row.setdefault("reason", "")   # CSVs written before the reason column existed
            rows.append(row)
    return rows


# ---------------------------------------------------------------------- recall

def cmd_recall(args):
    """Pure code. No API key, no spend. The ceiling on everything Jev could do, plus the
    lexical baseline it has to beat to be worth calling at all."""
    clubs = load_clubs()
    known = known_country_set(clubs)
    labelled = build_labelled(clubs)
    sets = build_eval_sets(labelled, args.seed)
    print(f"football_lookup: {len(clubs)} clubs, {len(known)} country spellings")
    print(f"labelled pairs: {len(labelled)}  |  hard={len(sets['hard'])} "
          f"control={len(sets['control'])} negative={len(sets['negative'])}\n")
    for name in ("hard", "control"):
        rows = sample_order(sets[name], args.seed, pair_key)[:args.limit]
        hit1 = hitn = base1 = 0
        ranks = []
        for p in rows:
            cands = retrieve(p["incoming"], p["country"], clubs, known, n=args.candidates,
                             hold_key=p["truth"])
            r = rank_of_truth(cands, p["truth"])
            if r is not None:
                hitn += 1
                ranks.append(r)
                if r == 1:
                    hit1 += 1
            if cands and club_key(cands[0][1]) == p["truth"]:
                base1 += 1
        n = len(rows) or 1
        print(f"[{name}] n={len(rows)}  recall@{args.candidates}={hitn/n:.3f}  "
              f"recall@1={hit1/n:.3f}  lexical top-1 baseline accuracy={base1/n:.3f}")
        if ranks:
            print(f"         truth rank p50={percentile(ranks,0.5):.0f} "
                  f"p95={percentile(ranks,0.95):.0f} worst={max(ranks)}")
    print("\nRead this before spending: recall@N caps Jev's coverage (it cannot pick a club "
          "code never showed it),\nand the lexical top-1 column is what pure code already gets "
          "for free on the same rows.")


# ------------------------------------------------------------------------ eval

def run_one(api_key, incoming, country, extra, cands, hold_key, threshold):
    id_map, order = build_id_map(cands)
    criteria = build_criteria(id_map, order, hold_key=hold_key)
    resp, ms, err = call_jev(api_key, incoming, country, extra, criteria)
    answer = (resp.get("answers") or {}).get(QCLUB) if resp else None
    nv = noul_value(resp)
    pick = resolve_pick(answer, id_map)
    conf = answer.get("confidence") if isinstance(answer, dict) else None
    if not isinstance(conf, (int, float)) or isinstance(conf, bool):
        conf = None
    decision, reason = decide(answer, nv, id_map, threshold)
    top3 = format_top3(answer.get("probabilities", {}) if isinstance(answer, dict) else {}, id_map)
    model = resp.get("model", "") if resp else ""
    itok = (resp.get("usage") or {}).get("input_tokens", "") if resp else ""
    return err, {"pick": pick, "conf": conf, "decision": decision, "reason": reason,
                 "top3": top3, "reserve": nv, "latency_ms": ms, "model": model,
                 "input_tokens": itok, "id_map": id_map}


def cmd_eval(args):
    key = get_typesafe_key()
    if not key:
        print("No TYPESAFE_API_KEY set and no typesafe_key.txt next to this script. Nothing to do.")
        return
    clubs = load_clubs()
    known = known_country_set(clubs)
    sets = build_eval_sets(build_labelled(clubs), args.seed)
    order = ["hard", "control", "negative"] if args.set == "all" else [args.set]
    path = today_csv_path()
    done = load_resume(path)
    count = errors = 0
    for set_name in order:
        for p in sample_order(sets[set_name], args.seed, pair_key):
            k = pair_key(p)
            if (set_name, k) in done:
                continue
            if count >= args.limit:
                print(f"Reached --limit {args.limit}. Re-run to resume (written rows are skipped).")
                return
            negative = set_name == "negative"
            truth = "none" if negative else p["truth"]
            cands = retrieve(p["incoming"], p["country"], clubs, known, n=args.candidates,
                             hold_key=p["truth"], drop_key=p["truth"] if negative else None)
            if not cands:
                print(f"  {k}: no candidates retrieved, skipped (nothing to ask)")
                continue
            err, o = run_one(key, p["incoming"], p["country"], None, cands, p["truth"],
                             args.threshold)
            count += 1
            if err is not None:
                # A transport error is not a Jev answer. Never record it: a recorded row is
                # skipped on resume and would count as a wrong pick for ever.
                errors += 1
                print(f"  {k}: API error {err}, not recorded, will retry on resume")
                continue
            base = cands[0][1] if cands else None
            append_csv_row(path, {
                "set": set_name, "key": k, "incoming": p["incoming"],
                "country": p["country"] or "", "truth": "none" if negative else str(truth),
                "pick": "none" if o["pick"] == "none" else str(o["pick"]),
                "confidence": "" if o["conf"] is None else o["conf"], "top3": o["top3"],
                "reserve_noul": "" if o["reserve"] is None else o["reserve"],
                "decision": o["decision"],
                # Why it abstained, not just that it did. Without this the report cannot tell a
                # reserve block from a low-confidence abstain, and reported 0 blocks for both.
                "reason": o["reason"] if o["decision"] == "abstain" else "",
                "correct": 1 if ((o["decision"] == "propose" and o["pick"] == truth) or
                                 (o["decision"] == "abstain" and truth == "none")) else 0,
                "n_cands": len(cands), "truth_rank": rank_of_truth(cands, p["truth"]) or "",
                "base_top1": base.get("team") if base else "",
                "base_top1_correct": 1 if (base and not negative and
                                           club_key(base) == p["truth"]) else 0,
                "latency_ms": o["latency_ms"], "input_tokens": o["input_tokens"],
                "model": o["model"]})
            print(f"  {set_name} {p['incoming']} -> {o['decision']} "
                  f"({o['pick'] if o['decision']=='propose' else o['reason']}, "
                  f"conf={o['conf']}, reserve={o['reserve']})")
    print(f"Done. {count - errors} rows appended to {path}, {errors} API errors not recorded")


THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95]


def cmd_report(args):
    path = args.file or today_csv_path()
    if not os.path.exists(path):
        print(f"No eval file at {path}. Run --eval first.")
        return
    rows = read_eval_csv(path)
    sets = sorted(set(r["set"] for r in rows))
    print(f"Report for {path} -- {len(rows)} rows total\n")
    for s in sets:
        sub = [r for r in rows if r["set"] == s]
        acc = sum(pick_correct(r) for r in sub) / len(sub)
        base = sum(int(r["base_top1_correct"]) for r in sub) / len(sub)
        inlist = [r for r in sub if r["truth_rank"]]
        print(f"[{s}] n={len(sub)} raw pick accuracy={acc:.3f} | lexical top-1 baseline="
              f"{base:.3f} | truth in candidate list={len(inlist)/len(sub):.3f}")
    print()
    for s in sets + ["pooled"]:
        sub = rows if s == "pooled" else [r for r in rows if r["set"] == s]
        print(f"[{s}] coverage/precision by threshold:")
        for t in THRESHOLDS:
            cov, prec = coverage_precision(sub, t)
            print(f"  t={t:.2f}  coverage={cov:.3f}  precision="
                  f"{'n/a' if prec is None else f'{prec:.3f}'}")
    print()
    pairs = [(r["confidence"], pick_correct(r)) for r in rows if r["confidence"] is not None]
    print("Reliability (10 bins, mean confidence vs observed accuracy):")
    for t in reliability_table(pairs):
        print(f"  bin {t['bin']}: n=0" if t["n"] == 0 else
              f"  bin {t['bin']}: n={t['n']} mean_conf={t['mean_conf']:.3f} "
              f"accuracy={t['accuracy']:.3f}")
    print(f"ECE = {ece(pairs):.4f}\n")
    neg = [r for r in rows if r["set"] == "negative"]
    if neg:
        print("Negative set (true club absent from the list -- a proposal here is a WRONG LINK):")
        for t in THRESHOLDS:
            cov, _ = coverage_precision(neg, t)
            print(f"  t={t:.2f}  wrong_link_rate={cov:.3f}  abstain_rate={1-cov:.3f}")
        print()
    # A high noul is NOT the same as a block: the gate stands down when the picked club is
    # itself a reserve side, because we carry those as clubs. Report the two separately or
    # the line reads as 13 blocked links when it was 9.
    hi = [r for r in rows if r["reserve_noul"] is not None and r["reserve_noul"] >= RESERVE_BLOCK]
    blocked = [r for r in hi if r.get("reason") == "reserve_or_womens"]
    allowed = [r for r in hi if r.get("reason") != "reserve_or_womens"]
    print(f"Reserve/women noul >= {RESERVE_BLOCK} on {len(hi)} of {len(rows)} rows; "
          f"the gate BLOCKED {len(blocked)} of them:")
    for r in blocked[:10]:
        print(f"  BLOCKED  {r['incoming']}  noul={r['reserve_noul']}  would-have-linked={r['pick']}")
    for r in allowed[:10]:
        why = r["reason"] or "proposed"
        print(f"  allowed  {r['incoming']}  noul={r['reserve_noul']}  -> {r['pick']}  ({why})")
    if not hi:
        print("  (none)")
    lat = [r["latency_ms"] for r in rows if r["latency_ms"]]
    if lat:
        print(f"\nlatency p50={percentile(lat,0.5):.0f}ms p95={percentile(lat,0.95):.0f}ms")
    tot = sum(r["input_tokens"] for r in rows)
    print(f"total input_tokens={tot}  est. cost=${tot * COST_PER_MTOK / 1_000_000:.4f} "
          f"(${COST_PER_MTOK}/M input)")


# ----------------------------------------------------------------------- queue

def cmd_queue(args):
    """Proposals for the REAL unmatched backlog. Dry run: prints, never writes, and every
    line is a question for a human. An accepted proposal is a Lookup edit or an alias row,
    which build_unmatched_report.py already knows how to bucket -- so we bucket it the same
    way here rather than implying every match is a Lookup edit."""
    key = get_typesafe_key()
    if not key:
        print("No TYPESAFE_API_KEY set and no typesafe_key.txt next to this script. Nothing to do.")
        return
    clubs = load_clubs()
    known = known_country_set(clubs)
    unmatched = load_unmatched()
    skey = supa_key()
    ft = supa_get("/rest/v1/football_team?select=team_id,canonical_name,country", skey)
    owners = {(r["canonical_name"], r["country"]): r["team_id"] for r in ft}
    known_ids = {r["team_id"] for r in ft}
    alias_map = {r["dup_team_id"]: r["primary_team_id"] for r in
                 supa_get("/rest/v1/football_team_alias?select=dup_team_id,primary_team_id", skey)}

    rows = sample_order(unmatched, args.seed, lambda t: str(t.get("team_id")))[:args.limit]
    print(f"unmatched backlog: {len(unmatched)} teams, showing {len(rows)} "
          f"(threshold {args.threshold}, dry run, no writes)\n")
    counts = {}
    for t in rows:
        tid = t.get("team_id")
        cands = retrieve(t.get("name"), t.get("country"), clubs, known, n=args.candidates)
        if not cands:
            counts["no_candidates"] = counts.get("no_candidates", 0) + 1
            print(f"  {tid:>7}  {t.get('name')}  -> no candidates")
            continue
        extra = {"seasons_seen": ", ".join(t.get("seasons") or []) or "unknown",
                 "appearances": t.get("appearances"),
                 "played_in_european_competition": bool(t.get("in_europe"))}
        err, o = run_one(key, t.get("name"), t.get("country"), extra, cands, None, args.threshold)
        if err is not None:
            counts["api_error"] = counts.get("api_error", 0) + 1
            print(f"  {tid:>7}  {t.get('name')}  -> API error {err}")
            continue
        if o["decision"] == "propose":
            action = proposal_action(o["pick"], tid, owners, alias_map, known_ids)
            counts[action] = counts.get(action, 0) + 1
            print(f"  {tid:>7}  {t.get('name')}  ({t.get('country') or 'no country'})")
            print(f"           -> {o['pick'][0]} @ {o['conf']}  [{action}]")
            print(f"           top3={o['top3']}")
        else:
            counts[o["reason"]] = counts.get(o["reason"], 0) + 1
            print(f"  {tid:>7}  {t.get('name')}  -> abstain ({o['reason']}, conf={o['conf']})")
    print("\nsummary: " + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print("Every proposal above is a QUESTION. Nothing here writes to Lookup or Supabase.")


# ------------------------------------------------------------------- self-test

def cmd_self_test():
    fail = []

    def check(label, cond):
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            fail.append(label)

    # ---- similarity
    check("sim: identical normalised strings are 1.0", sim("arsenal", "arsenal") == 1.0)
    check("sim: empty is 0.0", sim("", "arsenal") == 0.0 and sim("arsenal", "") == 0.0)
    check("sim: unrelated clubs score below a real variant",
          sim(norm("Nott'm Forest"), norm("Nottingham Forest")) >
          sim(norm("Nott'm Forest"), norm("Norwich City")))
    check("sim: dropped FC prefix still scores high",
          sim(norm("FC Koln"), norm("Koln")) > 0.6)
    check("sim: regional suffix still scores high (Brazil /RJ idiom)",
          sim(norm("Botafogo"), norm("Botafogo/RJ")) > 0.6)
    check("sim: accent difference is erased by norm before scoring",
          sim(norm("Gremio"), norm("Grêmio")) == 1.0)
    check("sim: symmetric", abs(sim(norm("AC Milan"), norm("Milan")) -
                                sim(norm("Milan"), norm("AC Milan"))) < 1e-12)
    check("sim: bounded 0..1", all(0.0 <= sim(norm(a), norm(b)) <= 1.0 for a, b in
                                   [("Ajax", "Ajax"), ("Ajax", "Feyenoord"), ("A", "B")]))

    # ---- stopwords
    check("content_tokens: drops generic club noise", content_tokens(norm("SS Lazio")) == {"lazio"})
    check("content_tokens: keeps identifying numerals", "1927" in content_tokens(norm("Shkupi 1927")))
    check("content_tokens: keeps 'real' and 'inter'",
          content_tokens(norm("Real Madrid")) == {"real", "madrid"} and
          "inter" in content_tokens(norm("Inter Milan")))
    check("content_tokens: all-stopword name falls back rather than emptying",
          content_tokens(norm("FC")) == {"fc"})

    # ---- alias visibility / holdout, the whole basis of the eval
    rec = {"team": "Nottingham Forest", "country": "England", "level": 1,
           "lookup_name": "Nott'm Forest", "api_name": "Nottingham Forest",
           "api_name_2": None, "cur_name": None, "uefa_name": None,
           "uefa_name_2": None, "efs_name": None}
    check("club_aliases: api columns present by default",
          "Nottingham Forest" in club_aliases(rec, hold_api=False))
    check("club_aliases: hold_api drops the api spelling",
          "Nottingham Forest" not in [a for a in club_aliases(rec, hold_api=True)
                                      if a == rec["api_name"] and a != rec["team"]])
    dupy = {"team": "Koln", "country": "Germany", "api_name": "Koln", "lookup_name": "FC Koln"}
    check("club_aliases: dedupes by normalised form", len(club_aliases(dupy)) == 2)
    check("club_aliases: skips empty and whitespace columns",
          club_aliases({"team": "Ajax", "cur_name": "   ", "api_name": ""}) == ["Ajax"])

    # ---- describe_club
    d = describe_club(rec, hold_api=False)
    check("describe_club: names club, country and tier", "Nottingham Forest" in d
          and "England" in d and "tier 1" in d)
    check("describe_club: lists an alternate spelling", "Nott'm Forest" in d)
    check("describe_club: no country or level still renders",
          describe_club({"team": "Solo"}) == "Solo")

    # ---- retrieval
    clubs = [
        {"team": "Nottingham Forest", "country": "England", "lookup_name": "Nott'm Forest",
         "api_name": "Nottingham Forest"},
        {"team": "Norwich City", "country": "England", "api_name": "Norwich"},
        {"team": "Notts County", "country": "England", "api_name": "Notts County"},
        {"team": "Botafogo", "country": "Brazil", "lookup_name": "Botafogo/RJ",
         "api_name": "Botafogo"},
    ]
    known = known_country_set(clubs)
    cands = retrieve("Nott'm Forest", "England", clubs, known, n=3)
    check("retrieve: best match first", club_key(cands[0][1]) == ("Nottingham Forest", "England"))
    check("retrieve: respects n", len(retrieve("Nott", "England", clubs, known, n=2)) <= 2)
    check("retrieve: known country hard-filters out other countries",
          all(r.get("country") == "England" for _, r in retrieve("Botafogo", "England", clubs, known, n=5)))
    check("retrieve: UNKNOWN country spelling does NOT filter (would empty the list)",
          any(club_key(r) == ("Botafogo", "Brazil")
              for _, r in retrieve("Botafogo", "Brasil", clubs, known, n=5)))
    check("retrieve: country None searches every club",
          any(club_key(r) == ("Botafogo", "Brazil")
              for _, r in retrieve("Botafogo", None, clubs, known, n=5)))
    check("retrieve: drop_key really removes the truth (NEGATIVE set)",
          all(club_key(r) != ("Nottingham Forest", "England") for _, r in
              retrieve("Nott'm Forest", "England", clubs, known, n=5,
                       drop_key=("Nottingham Forest", "England"))))
    # Norwich City carries api_name "Norwich", a spelling no other column holds. Holding out
    # the api columns must take the exact match away; a club whose api_name merely repeats its
    # canonical name is unaffected, which is why the holdout only bites on a differing spelling.
    check("retrieve: hold_key hides that club's api spelling from scoring",
          club_score(norm("Norwich"), clubs[1], hold_api=False) == 1.0
          and club_score(norm("Norwich"), clubs[1], hold_api=True) < 1.0)
    check("retrieve: holdout leaves a club whose api spelling repeats the canonical name alone",
          club_score(norm("Nottingham Forest"), clubs[0], hold_api=True) == 1.0)
    check("retrieve: zero-similarity clubs are not offered",
          all(s > 0 for s, _ in retrieve("Zzzzq", None, clubs, known, n=10)))
    check("retrieve: deterministic across calls",
          [club_key(r) for _, r in retrieve("Nott", "England", clubs, known, n=3)] ==
          [club_key(r) for _, r in retrieve("Nott", "England", clubs, known, n=3)])

    # ---- id map + criteria
    id_map, order = build_id_map(cands)
    check("build_id_map: opaque sequential ids", order[:1] == ["c001"])
    check("build_id_map: ids resolve back to the club",
          club_key(id_map[order[0]]) == club_key(cands[0][1]))
    crit = build_criteria(id_map, order)
    check("criteria: none always present", crit.get("none") == NONE_DESC)
    check("criteria: one entry per candidate plus none", len(crit) == len(order) + 1)
    check("criteria: <= 255 options for a full list",
          len(build_criteria(*build_id_map([(1.0, {"team": f"T{i}"}) for i in range(254)]))) == 255)
    crit_held = build_criteria(id_map, order, hold_key=("Nottingham Forest", "England"))
    check("criteria: holdout keeps the answer out of the option text",
          "Nott'm Forest" in crit_held["c001"])

    # ---- rank_of_truth
    check("rank_of_truth: 1-indexed", rank_of_truth(cands, ("Nottingham Forest", "England")) == 1)
    check("rank_of_truth: absent -> None", rank_of_truth(cands, ("Nowhere FC", "Mars")) is None)

    # ---- decide()
    im = {"c001": {"team": "Arsenal", "country": "England"},
          "c002": {"team": "Aston Villa", "country": "England"}}
    check("decide: confident pick proposes",
          decide({"choice": "c002", "confidence": 0.95}, 0.01, im, 0.9)
          == ("propose", ("Aston Villa", "England")))
    check("decide: below threshold abstains",
          decide({"choice": "c002", "confidence": 0.5}, 0.01, im, 0.9)
          == ("abstain", "low_confidence"))
    check("decide: choice none abstains",
          decide({"choice": "none", "confidence": 0.99}, 0.01, im, 0.9)
          == ("abstain", "choice_none"))
    check("decide: unknown id abstains",
          decide({"choice": "c999", "confidence": 0.99}, 0.01, im, 0.9)
          == ("abstain", "unknown_id"))
    check("decide: missing confidence abstains",
          decide({"choice": "c001"}, 0.01, im, 0.9) == ("abstain", "missing_confidence"))
    check("decide: None answer abstains",
          decide(None, 0.01, im, 0.9) == ("abstain", "malformed_answer"))
    check("decide: non-dict answer abstains",
          decide("nope", 0.01, im, 0.9) == ("abstain", "malformed_answer"))
    check("decide: bool confidence is not a number",
          decide({"choice": "c001", "confidence": True}, 0.01, im, 0.9)
          == ("abstain", "malformed_answer"))
    # ---- looks_reserve: run against the exact names the 2026-09-22 run produced
    check("looks_reserve: B suffix", looks_reserve("Villarreal B") is True)
    check("looks_reserve: II suffix", looks_reserve("Granada II") is True)
    check("looks_reserve: word anywhere, not just the end",
          looks_reserve("Lask Juniors Linz") is True and looks_reserve("Meaux Academy") is True)
    check("looks_reserve: age group", looks_reserve("Chelsea U21") is True
          and looks_reserve("Flamengo Sub20") is True)
    check("looks_reserve: women's markers",
          looks_reserve("Arsenal W") is True and looks_reserve("Lyon Feminin") is True)
    check("looks_reserve: plain senior club is not a reserve",
          looks_reserve("Granada CF") is False and looks_reserve("Villarreal CF") is False)
    # the two real false positives a naive regex would produce, both live Lookup clubs
    check("looks_reserve: 'W Connection' is a senior club, not a women's side",
          looks_reserve("W Connection") is False)
    check("looks_reserve: 'B68 Toftir' is a senior club, not a B team",
          looks_reserve("B68 Toftir") is False)
    check("looks_reserve: empty/None is False",
          looks_reserve("") is False and looks_reserve(None) is False)

    # the reserve gate -- 'Granada II' -> 'Granada CF' at 0.99 is the case this exists for
    check("decide: reserve noul blocks even a 0.99 pick at a SENIOR club",
          decide({"choice": "c001", "confidence": 0.99}, 0.97, im, 0.9)
          == ("abstain", "reserve_or_womens"))
    check("decide: reserve gate is checked before confidence",
          decide({"choice": "c001", "confidence": 0.20}, 0.97, im, 0.9)
          == ("abstain", "reserve_or_womens"))
    check("decide: reserve exactly at the block counts",
          decide({"choice": "c001", "confidence": 0.99}, RESERVE_BLOCK, im, 0.9)
          == ("abstain", "reserve_or_womens"))
    # the refinement: we carry 118 reserve sides as clubs, so a reserve->reserve match is RIGHT
    im_b = {"c001": {"team": "Villarreal B", "country": "Spain"}}
    check("decide: reserve gate does NOT block when the picked club is itself the reserve side",
          decide({"choice": "c001", "confidence": 0.99}, 0.99, im_b, 0.9)
          == ("propose", ("Villarreal B", "Spain")))
    check("decide: a reserve-to-reserve match still has to clear confidence",
          decide({"choice": "c001", "confidence": 0.40}, 0.99, im_b, 0.9)
          == ("abstain", "low_confidence"))
    check("decide: low reserve noul does not block",
          decide({"choice": "c001", "confidence": 0.99}, 0.02, im, 0.9)[0] == "propose")
    check("decide: missing reserve noul does not block (gate fails open, confidence still rules)",
          decide({"choice": "c001", "confidence": 0.99}, None, im, 0.9)[0] == "propose")
    check("decide: 'none' wins over the reserve gate (both abstain, reason stays choice_none)",
          decide({"choice": "none", "confidence": 0.99}, 0.99, im, 0.9)
          == ("abstain", "choice_none"))

    # ---- proposal_action: mirrors the real collision guard
    owners = {("Arsenal", "England"): 42}
    check("proposal_action: unowned club is a Lookup edit",
          proposal_action(("Aston Villa", "England"), 77, owners, {}, set()) == "lookup_edit")
    check("proposal_action: club owned by another team_id is an alias row",
          proposal_action(("Arsenal", "England"), 77, owners, {}, set()) == "alias_row")
    check("proposal_action: club owned by THIS team_id is not a conflict",
          proposal_action(("Arsenal", "England"), 42, owners, {}, set()) == "lookup_edit")
    check("proposal_action: team already in football_team is already linked",
          proposal_action(("Arsenal", "England"), 42, owners, {}, {42}) == "already_linked")
    check("proposal_action: team already aliased is not new work",
          proposal_action(("Arsenal", "England"), 77, owners, {77: 42}, set()) == "already_aliased")

    # ---- eval-set construction
    lk = [
        # api spelling differs AND no other alias matches it -> HARD
        {"team": "Nottingham Forest", "country": "England", "lookup_name": "Forest",
         "api_name": "Nott'm Forest"},
        # api spelling differs but lookup_name matches it exactly -> CONTROL
        {"team": "Koln", "country": "Germany", "lookup_name": "FC Koln", "api_name": "FC Koln"},
        # api spelling equals the canonical name -> CONTROL
        {"team": "Ajax", "country": "Netherlands", "api_name": "Ajax"},
        # no api_name at all -> not labelled
        {"team": "Unlabelled", "country": "Spain"},
    ]
    lab = build_labelled(lk)
    check("build_labelled: one pair per non-empty api column",
          len(lab) == 3 and all(p["incoming"] for p in lab))
    check("build_labelled: a club with no api_name yields no pair",
          all(p["truth"][0] != "Unlabelled" for p in lab))
    lk2 = [{"team": "Melilla", "country": "Spain", "api_name": "Melilla",
            "api_name_2": "Melilla CD"}]
    check("build_labelled: api_name_2 yields a second pair", len(build_labelled(lk2)) == 2)

    check("exact_resolves_without_api: alias still matches -> CONTROL",
          exact_resolves_without_api("FC Koln", lk[1]) is True)
    check("exact_resolves_without_api: nothing matches once api is held out -> HARD",
          exact_resolves_without_api("Nott'm Forest", lk[0]) is False)
    check("exact_resolves_without_api: canonical name itself still matches",
          exact_resolves_without_api("Ajax", lk[2]) is True)
    check("exact_resolves_without_api: accent/case insensitive via norm",
          exact_resolves_without_api("ajax", lk[2]) is True)

    s = build_eval_sets(lab, seed="0")
    hardnames = {p["incoming"] for p in s["hard"]}
    check("eval-set: the genuinely unresolvable pair is HARD", "Nott'm Forest" in hardnames)
    check("eval-set: alias-resolvable pairs are not HARD",
          "FC Koln" not in hardnames and "Ajax" not in hardnames)
    check("eval-set: CONTROL capped at len(HARD)", len(s["control"]) <= len(s["hard"]))
    check("eval-set: NEGATIVE is ~20% of HARD",
          len(s["negative"]) == (len(s["hard"]) * 20) // 100)

    big = [{"team": f"Club {i}", "country": "England", "lookup_name": f"C{i}",
            "api_name": f"Klub {i}"} for i in range(50)]
    lab_big = build_labelled(big)
    a = build_eval_sets(lab_big, seed="7")
    b = build_eval_sets(lab_big, seed="7")
    c = build_eval_sets(lab_big, seed="8")
    check("determinism: same seed -> identical sets",
          [pair_key(p) for p in a["negative"]] == [pair_key(p) for p in b["negative"]])
    check("determinism: different seed -> different sample",
          [pair_key(p) for p in a["negative"]] != [pair_key(p) for p in c["negative"]])
    check("eval-set: every HARD pair really is hard",
          all(not exact_resolves_without_api(p["incoming"], p["rec"]) for p in a["hard"]))

    # ---- sample_order
    keys = [{"team_id": i} for i in [1, 2, 3, 10, 20, 100, 200, 300]]
    so = sample_order(keys, "0", lambda t: str(t["team_id"]))
    check("sample_order: preserves every row",
          sorted(t["team_id"] for t in so) == sorted(t["team_id"] for t in keys))
    check("sample_order: reorders away from the input order",
          [t["team_id"] for t in so] != [t["team_id"] for t in keys])
    check("sample_order: same seed -> identical order",
          [t["team_id"] for t in sample_order(keys, "0", lambda t: str(t["team_id"]))] ==
          [t["team_id"] for t in so])
    check("sample_order: different seed -> different order",
          [t["team_id"] for t in sample_order(keys, "9", lambda t: str(t["team_id"]))] !=
          [t["team_id"] for t in so])

    # ---- resolve_pick / noul_value / top3
    check("resolve_pick: id maps back to the club key",
          resolve_pick({"choice": "c001"}, im) == ("Arsenal", "England"))
    check("resolve_pick: none passes through", resolve_pick({"choice": "none"}, im) == "none")
    check("resolve_pick: unknown id is ERROR", resolve_pick({"choice": "zz"}, im) == "ERROR")
    check("resolve_pick: non-dict is ERROR", resolve_pick(None, im) == "ERROR")
    check("noul_value: reads the noul field",
          noul_value({"answers": {QRESERVE: {"type": "noul", "noul": 0.93}}}) == 0.93)
    check("noul_value: missing question -> None", noul_value({"answers": {}}) is None)
    check("noul_value: bool is not a noul",
          noul_value({"answers": {QRESERVE: {"noul": True}}}) is None)
    check("noul_value: no response -> None", noul_value(None) is None)
    t3 = format_top3({"c001": 0.7, "c002": 0.2, "none": 0.1}, im)
    check("top3: names not ids, sorted desc", t3 == "Arsenal:0.7|Aston Villa:0.2|none:0.1")
    check("top3: empty -> empty string", format_top3({}, im) == "")

    # ---- metrics (hand-computed, same shapes the metro pilot proved)
    check("pick_correct: right pick regardless of threshold",
          pick_correct({"pick": "X", "truth": "X"}) == 1)
    check("pick_correct: none == none counts", pick_correct({"pick": "none", "truth": "none"}) == 1)
    check("pick_correct: ERROR is wrong", pick_correct({"pick": "ERROR", "truth": "none"}) == 0)
    cp = [{"pick": "A", "confidence": 0.95, "truth": "A"},
          {"pick": "B", "confidence": 0.95, "truth": "A"},
          {"pick": "none", "confidence": 0.99, "truth": "A"},
          {"pick": "A", "confidence": 0.60, "truth": "A"}]
    cov, prec = coverage_precision(cp, 0.9)
    check("coverage@0.9: 2 of 4 proposed", cov == 0.5)
    check("precision@0.9: 1 of 2 correct", prec == 0.5)
    cov2, prec2 = coverage_precision(cp, 0.99)
    check("coverage@0.99: the only 0.99 row is a 'none', so nothing is proposed",
          cov2 == 0.0 and prec2 is None)
    pr = [(0.95, 1), (0.92, 1), (0.55, 0), (0.58, 1)]
    tbl = reliability_table(pr)
    b9 = next(t for t in tbl if t["bin"] == 9)
    b5 = next(t for t in tbl if t["bin"] == 5)
    check("reliability: bin 9 holds the 0.9x rows", b9["n"] == 2 and b9["accuracy"] == 1.0)
    check("reliability: bin 5 holds the 0.5x rows", b5["n"] == 2 and b5["accuracy"] == 0.5)
    check("ECE: matches hand computation",
          abs(ece(pr) - ((2 * abs(0.935 - 1.0) + 2 * abs(0.565 - 0.5)) / 4)) < 1e-9)
    check("ECE: empty -> 0.0", ece([]) == 0.0)
    check("percentile: p50 of 1..10 is 5.5", abs(percentile(list(range(1, 11)), 0.5) - 5.5) < 1e-9)
    check("percentile: p0 min, p100 max",
          percentile([3, 1, 2], 0.0) == 1 and percentile([3, 1, 2], 1.0) == 3)
    check("percentile: empty -> 0.0", percentile([], 0.5) == 0.0)
    check("backoff: 5 exponential delays", backoff_schedule() == [1, 2, 4, 8, 16])

    print(f"\n{len(fail)} failures" if fail else "\nALL SELF-TESTS PASS")
    sys.exit(1 if fail else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--recall", action="store_true",
                    help="retrieval ceiling + lexical baseline, pure code, no API spend")
    ap.add_argument("--eval", action="store_true")
    ap.add_argument("--report", nargs="?", const="", default=None, metavar="FILE")
    ap.add_argument("--queue", action="store_true",
                    help="proposals for the real unmatched backlog (dry run)")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--set", choices=["hard", "control", "negative", "all"], default="all")
    ap.add_argument("--candidates", type=int, default=30,
                    help="how many clubs code puts in front of Jev (ceiling 254)")
    ap.add_argument("--threshold", type=float, default=0.90)
    ap.add_argument("--seed", default="0")
    args = ap.parse_args()

    if args.candidates > 254:
        sys.exit("--candidates cannot exceed 254 (255 options including 'none')")
    if args.self_test:
        cmd_self_test(); return
    if args.recall:
        cmd_recall(args); return
    if args.eval:
        cmd_eval(args); return
    if args.report is not None:
        args.file = args.report or None
        cmd_report(args); return
    if args.queue:
        cmd_queue(args); return
    ap.print_help()


if __name__ == "__main__":
    main()
