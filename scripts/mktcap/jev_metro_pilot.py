#!/usr/bin/env python3
"""jev_metro_pilot.py -- evaluation harness for TypeSafe Jev mapping company HQ
(city, state, country) to one of our metro areas, with calibrated confidence,
BEFORE any automation is trusted. NEVER writes to Supabase (no --write flag,
none is coming -- this is measurement only).

Modes: --self-test  --eval [--limit N] [--set hard|control|negative|all]
       --report [file]  --queue
No flags: prints help.

Key: env TYPESAFE_API_KEY, else file typesafe_key.txt next to this script.
Supabase access is via common.py (its own key file/env, unrelated to TypeSafe).
"""
import argparse, csv, hashlib, json, math, os, sys, time
import urllib.request, urllib.error

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common

TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone"
QNAME = "metro"
NONE_DESC = "None of the listed metro areas contains this city, or it cannot be determined"
INSTRUCTIONS = ("Ask which of the listed metropolitan areas contains the company's headquarters "
    "city. A suburb or satellite town belongs to its parent metro area -- pick that metro, not "
    "'none'. Choose 'none' only if no listed metro area contains this city or it cannot be "
    "determined.")
COST_PER_MTOK = 0.042  # unverified third-party figure

def norm(s):
    if s is None:
        return ""
    return " ".join(str(s).split()).strip().lower()

def norm_key(city, state, country):
    return (norm(city), norm(state), norm(country))

def det_hash(symbol, seed):
    h = hashlib.sha256(f"{seed}:{symbol}".encode("utf-8")).hexdigest()
    return int(h[:16], 16)

def build_id_map(metros):
    """metros: iterable of distinct metro names. Returns (metro_to_id, id_to_metro).
    Ids are opaque ('m001'...) because metro names carry commas/accents/slashes
    that must never be interpreted as Jev syntax."""
    names = sorted(set(metros))
    metro_to_id = {n: f"m{i+1:03d}" for i, n in enumerate(names)}
    id_to_metro = {v: k for k, v in metro_to_id.items()}
    return metro_to_id, id_to_metro

def shortlist_for_country(labelled_rows, country, metro_to_id, exclude_metro=None):
    """Distinct metros on labelled rows of the same country (case-insensitive),
    sorted, capped at 254 by labelled-row frequency."""
    ncountry = norm(country)
    freq = {}
    for r in labelled_rows:
        if norm(r["country"]) == ncountry:
            freq[r["metro"]] = freq.get(r["metro"], 0) + 1
    names = sorted(freq.keys())
    if exclude_metro is not None:
        names = [n for n in names if n != exclude_metro]
    if len(names) > 254:
        names = sorted(sorted(names, key=lambda n: (-freq[n], n))[:254])
    return names

def build_criteria(shortlist_names, metro_to_id):
    criteria = {metro_to_id[n]: n for n in shortlist_names}
    criteria["none"] = NONE_DESC
    return criteria

def decide(answer, id_map, threshold):
    """id_map: {id: metro_name} for the shortlist actually sent.
    Returns ("propose", metro) or ("abstain", reason)."""
    if not isinstance(answer, dict):
        return ("abstain", "malformed_answer")
    if "confidence" not in answer:
        return ("abstain", "missing_confidence")
    if "choice" not in answer:
        return ("abstain", "malformed_answer")
    conf = answer["confidence"]
    choice = answer["choice"]
    if not isinstance(conf, (int, float)) or isinstance(conf, bool):
        return ("abstain", "malformed_answer")
    if not isinstance(choice, str):
        return ("abstain", "malformed_answer")
    if choice == "none":
        return ("abstain", "choice_none")
    if choice not in id_map:
        return ("abstain", "unknown_id")
    if conf < threshold:
        return ("abstain", "low_confidence")
    return ("propose", id_map[choice])

def resolve_pick(answer, id_map):
    """Metro name Jev actually picked, independent of threshold. 'none' or 'ERROR'."""
    if not isinstance(answer, dict):
        return "ERROR"
    choice = answer.get("choice")
    if choice == "none":
        return "none"
    if isinstance(choice, str) and choice in id_map:
        return id_map[choice]
    return "ERROR"

def build_eval_sets(labelled_rows, seed):
    """Pure, deterministic (hash of symbol salted by seed; no random module).
    HARD: singleton (city,state,country) key AND city != metro (unseen-suburb sim).
    CONTROL: city == metro, sampled (by hash) to at most len(HARD).
    NEGATIVE: deterministic 20% of HARD, duplicated, true metro stripped from
    shortlist elsewhere -- caller does the stripping; here we just select rows."""
    key_counts = {}
    for r in labelled_rows:
        k = norm_key(r["city"], r["state"], r["country"])
        key_counts[k] = key_counts.get(k, 0) + 1
    hard = [r for r in labelled_rows
            if key_counts[norm_key(r["city"], r["state"], r["country"])] == 1
            and norm(r["city"]) != norm(r["metro"])]
    hard = sorted(hard, key=lambda r: r["symbol"])
    control_pool = [r for r in labelled_rows if norm(r["city"]) == norm(r["metro"])]
    control_pool = sorted(control_pool, key=lambda r: det_hash(r["symbol"], seed))
    control = sorted(control_pool[:len(hard)], key=lambda r: r["symbol"])
    hard_by_hash = sorted(hard, key=lambda r: det_hash(r["symbol"], seed))
    neg_n = (len(hard) * 20) // 100
    negative = sorted(hard_by_hash[:neg_n], key=lambda r: r["symbol"])
    return {"hard": hard, "control": control, "negative": negative}

def baseline_exact(row, labelled_rows):
    """Exact (city,state,country) lookup with the row held out. By construction
    0% on HARD (its key is a singleton) -- reported anyway for the record."""
    key = norm_key(row["city"], row["state"], row["country"])
    for r in labelled_rows:
        if r["symbol"] == row["symbol"]:
            continue
        if norm_key(r["city"], r["state"], r["country"]) == key:
            return r["metro"]
    return None

def baseline_cityname(row, shortlist_names):
    nc = norm(row["city"])
    for m in shortlist_names:
        if norm(m) == nc:
            return m
    return None

def backoff_schedule():
    return [1, 2, 4, 8, 16]

def get_typesafe_key():
    k = os.environ.get("TYPESAFE_API_KEY")
    if k:
        return k.strip()
    here = os.path.dirname(os.path.abspath(__file__))
    cand = os.path.join(here, "typesafe_key.txt")
    if os.path.exists(cand):
        return open(cand, encoding="utf-8-sig").read().strip()
    return None

def call_jev(api_key, company, city, state, country, criteria, timeout=30):
    """Returns (response_dict_or_None, latency_ms, error_or_None). Exits on 401.
    422 -> (None, latency, '422'). 429/529 -> exponential backoff, max 5 tries."""
    body = {"state": {"company": company, "city": city, "state": state, "country": country},
            "model": "jev-latest",
            "questions": {QNAME: {"type": "choice", "instructions": INSTRUCTIONS,
                                   "criteria": criteria}}}
    data = json.dumps(body).encode("utf-8")
    delays = backoff_schedule()
    for attempt in range(5):
        req = urllib.request.Request(TYPESAFE_URL, data=data,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST")
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                latency_ms = int((time.time() - t0) * 1000)
                return json.loads(r.read().decode("utf-8")), latency_ms, None
        except urllib.error.HTTPError as e:
            latency_ms = int((time.time() - t0) * 1000)
            if e.code == 401:
                sys.exit("FATAL: TypeSafe API key rejected (401)")
            if e.code == 422:
                return None, latency_ms, "422"
            if e.code in (429, 529) and attempt < 4:
                time.sleep(delays[attempt]); continue
            return None, latency_ms, str(e.code)
        except Exception:
            latency_ms = int((time.time() - t0) * 1000)
            if attempt < 4:
                time.sleep(delays[attempt]); continue
            return None, latency_ms, "error"
    return None, 0, "exhausted"

def format_top3(probs, id_map):
    if not isinstance(probs, dict) or not probs:
        return ""
    items = []
    for k, v in probs.items():
        if not isinstance(v, (int, float)):
            continue
        name = "none" if k == "none" else id_map.get(k, k)
        items.append((name, v))
    items.sort(key=lambda x: -x[1])
    return "|".join(f"{n}:{p}" for n, p in items[:3])

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
    """pairs: list of (confidence, correct 0/1). 10 bins over [0,1]."""
    bins = [[] for _ in range(10)]
    for conf, corr in pairs:
        if conf is None:
            continue
        idx = min(int(conf * 10), 9)
        bins[idx].append((conf, corr))
    table = []
    for i, b in enumerate(bins):
        if not b:
            table.append({"bin": i, "n": 0, "mean_conf": None, "accuracy": None})
            continue
        mc = sum(c for c, _ in b) / len(b)
        acc = sum(cr for _, cr in b) / len(b)
        table.append({"bin": i, "n": len(b), "mean_conf": mc, "accuracy": acc})
    return table

def ece(pairs):
    table = reliability_table(pairs)
    n = sum(t["n"] for t in table)
    if n == 0:
        return 0.0
    return sum(t["n"] * abs(t["mean_conf"] - t["accuracy"]) for t in table if t["n"] > 0) / n

def pick_correct(row):
    """Threshold-free: did Jev's raw pick equal the truth ('none' == 'none' counts).
    The CSV 'correct' column is tied to the --threshold of the eval run, so it must
    never feed calibration: a right pick at confidence 0.6 would read as wrong."""
    return 1 if row["pick"] == row["truth"] else 0

def coverage_precision(rows, threshold):
    """rows: dicts with pick, confidence (float|None), truth."""
    proposed = [r for r in rows if r["pick"] not in ("none", "ERROR")
                and r["confidence"] is not None and r["confidence"] >= threshold]
    coverage = len(proposed) / len(rows) if rows else 0.0
    if proposed:
        correct = sum(1 for r in proposed if r["pick"] == r["truth"])
        precision = correct / len(proposed)
    else:
        precision = None
    return coverage, precision

def fetch_labelled_and_stub(key=None):
    rows = common.select_all(
        "/rest/v1/mktcap_geo?select=symbol,name,metro,city,state,country,mapped_by",
        order="symbol", key=key)
    labelled = [r for r in rows if r.get("metro") and (r.get("city") or "").strip()
                and (r.get("country") or "").strip()]
    stubs = [r for r in rows if r.get("mapped_by") == "auto-stub"]
    return labelled, stubs

CSV_COLS = ["set", "symbol", "name", "city", "state", "country", "truth", "pick",
            "confidence", "top3", "decision", "correct", "base_cityname", "latency_ms", "input_tokens", "model"]

def today_csv_path():
    import datetime
    d = datetime.date.today().isoformat()
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "out", f"jev_eval_{d}.csv")

def load_resume(path):
    done = set()
    if not os.path.exists(path):
        return done
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            done.add((row["set"], row["symbol"]))
    return done

def append_csv_row(path, row):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLS)
        if new:
            w.writeheader()
        w.writerow(row)

def run_one(api_key, row, set_name, truth, shortlist, metro_to_id, threshold):
    id_map = {metro_to_id[n]: n for n in shortlist}
    criteria = build_criteria(shortlist, metro_to_id)
    resp, latency_ms, err = call_jev(api_key, row["name"], row["city"], row["state"], row["country"], criteria)
    answer = None
    model = ""
    input_tokens = ""
    if resp is not None:
        model = resp.get("model", "")
        usage = resp.get("usage") or {}
        input_tokens = usage.get("input_tokens", "")
        answer = (resp.get("answers") or {}).get(QNAME)
    pick = resolve_pick(answer, id_map)
    conf = answer.get("confidence") if isinstance(answer, dict) else None
    if not isinstance(conf, (int, float)) or isinstance(conf, bool):
        conf = None
    decision, _ = decide(answer, id_map, threshold)
    correct = 1 if (decision == "propose" and pick == truth) or \
                   (decision == "abstain" and truth == "none") else 0
    top3 = format_top3(answer.get("probabilities", {}) if isinstance(answer, dict) else {}, id_map)
    base = baseline_cityname(row, shortlist) or ""
    return err, {"set": set_name, "symbol": row["symbol"], "name": row["name"], "city": row["city"],
            "state": row["state"] or "", "country": row["country"], "truth": truth, "pick": pick,
            "confidence": "" if conf is None else conf, "top3": top3, "decision": decision,
            "correct": correct, "base_cityname": base, "latency_ms": latency_ms, "input_tokens": input_tokens, "model": model}

def cmd_eval(args):
    key = get_typesafe_key()
    if not key:
        print("No TYPESAFE_API_KEY set and no typesafe_key.txt next to this script. Nothing to do.")
        return
    labelled, _ = fetch_labelled_and_stub()
    metro_to_id, _ = build_id_map(r["metro"] for r in labelled)
    sets = build_eval_sets(labelled, args.seed)
    order = ["hard", "control", "negative"] if args.set == "all" else [args.set]
    path = today_csv_path()
    done = load_resume(path)
    count = errors = 0
    for set_name in order:
        for row in sets[set_name]:
            if (set_name, row["symbol"]) in done:
                continue
            if count >= args.limit:
                print(f"Reached --limit {args.limit}. Re-run to resume (already-written rows are skipped).")
                return
            if set_name == "negative":
                truth = "none"
                shortlist = shortlist_for_country(labelled, row["country"], metro_to_id,
                                                   exclude_metro=row["metro"])
            else:
                truth = row["metro"]
                shortlist = shortlist_for_country(labelled, row["country"], metro_to_id)
            err, out = run_one(key, row, set_name, truth, shortlist, metro_to_id, args.threshold)
            count += 1
            if err is not None:
                # A transport or API error is not a Jev answer. Do not record it: a recorded
                # row is skipped on resume and would count as a wrong pick for ever.
                errors += 1
                common.log(f"{set_name} {row['symbol']}: API error {err}, not recorded, will retry on resume")
                continue
            append_csv_row(path, out)
            common.log(f"{set_name} {row['symbol']}: pick={out['pick']} conf={out['confidence']} "
                       f"decision={out['decision']} correct={out['correct']}")
    print(f"Done. {count - errors} rows appended to {path}, {errors} API errors not recorded")

def cmd_queue(args):
    key = get_typesafe_key()
    if not key:
        print("No TYPESAFE_API_KEY set and no typesafe_key.txt next to this script. Nothing to do.")
        return
    labelled, stubs = fetch_labelled_and_stub()
    metro_to_id, _ = build_id_map(r["metro"] for r in labelled)
    no_city = [r for r in stubs if not (r.get("city") or "").strip()]
    has_city = [r for r in stubs if (r.get("city") or "").strip()]
    print(f"auto-stub queue: {len(stubs)} rows, {len(no_city)} need HQ city first, "
          f"{len(has_city)} ready for a Jev proposal (dry run, no writes)")
    for r in no_city:
        print(f"  NEEDS CITY: {r['symbol']}  {r.get('name','')}")
    for r in has_city:
        shortlist = shortlist_for_country(labelled, r["country"], metro_to_id)
        id_map = {metro_to_id[n]: n for n in shortlist}
        criteria = build_criteria(shortlist, metro_to_id)
        resp, latency_ms, err = call_jev(key, r.get("name", ""), r["city"], r.get("state"), r["country"], criteria)
        answer = (resp.get("answers") or {}).get(QNAME) if resp else None
        decision, reason = decide(answer, id_map, args.threshold)
        pick = resolve_pick(answer, id_map)
        conf = answer.get("confidence") if isinstance(answer, dict) else None
        print(f"  {r['symbol']}  {r.get('name','')} -> {decision} "
              f"({pick if decision=='propose' else reason}, conf={conf})")

THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95]

def read_eval_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row["confidence"] = float(row["confidence"]) if row["confidence"] != "" else None
            row["correct"] = int(row["correct"]) if row["correct"] != "" else 0
            row["latency_ms"] = float(row["latency_ms"]) if row["latency_ms"] else 0.0
            row["input_tokens"] = int(row["input_tokens"]) if row["input_tokens"] else 0
            rows.append(row)
    return rows

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
        acc = sum(pick_correct(r) for r in sub) / len(sub) if sub else 0.0
        based = [r for r in sub if r.get("base_cityname")]
        bacc = sum(1 for r in based if r["base_cityname"] == r["truth"])
        print(f"[{s}] n={len(sub)} raw pick accuracy={acc:.3f} | baseline city-name rule: "
              f"answered {len(based)}, correct {bacc}")
    print()
    for s in sets + ["pooled"]:
        sub = rows if s == "pooled" else [r for r in rows if r["set"] == s]
        print(f"[{s}] coverage/precision by threshold:")
        for t in THRESHOLDS:
            cov, prec = coverage_precision(sub, t)
            prec_s = "n/a" if prec is None else f"{prec:.3f}"
            print(f"  t={t:.2f}  coverage={cov:.3f}  precision={prec_s}")
    print()
    pairs = [(r["confidence"], pick_correct(r)) for r in rows if r["confidence"] is not None]
    table = reliability_table(pairs)
    print("Reliability (10 bins, mean confidence vs observed accuracy):")
    for t in table:
        if t["n"] == 0:
            print(f"  bin {t['bin']}: n=0")
        else:
            print(f"  bin {t['bin']}: n={t['n']} mean_conf={t['mean_conf']:.3f} accuracy={t['accuracy']:.3f}")
    print(f"ECE = {ece(pairs):.4f}")
    print()
    neg = [r for r in rows if r["set"] == "negative"]
    if neg:
        print("Negative set: abstain rate / wrong-proposal rate by threshold:")
        for t in THRESHOLDS:
            cov, _ = coverage_precision(neg, t)
            print(f"  t={t:.2f}  wrong_proposal_rate={cov:.3f}  abstain_rate={1-cov:.3f}")
    print()
    lat = [r["latency_ms"] for r in rows if r["latency_ms"]]
    if lat:
        print(f"latency p50={percentile(lat,0.5):.0f}ms p95={percentile(lat,0.95):.0f}ms")
    tot_in = sum(r["input_tokens"] for r in rows)
    cost = tot_in * COST_PER_MTOK / 1_000_000
    print(f"total input_tokens={tot_in}  est. cost=${cost:.4f} "
          f"(${COST_PER_MTOK}/M tokens -- unverified third-party figure)")

def cmd_self_test():
    fail = []
    def check(label, cond):
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            fail.append(label)

    check("pick_correct: right pick below threshold still counts",
          pick_correct({"pick": "Boston", "truth": "Boston", "correct": 0}) == 1)
    check("pick_correct: none == none on a negative case", pick_correct({"pick": "none", "truth": "none"}) == 1)
    check("pick_correct: ERROR is wrong", pick_correct({"pick": "ERROR", "truth": "none"}) == 0)

    # normalization
    check("norm: case+whitespace", norm("  New   York  ") == "new york")
    check("norm: None -> empty", norm(None) == "")
    check("norm: accents kept", norm("Bogotá") == "bogotá")
    check("norm_key: None state -> ''", norm_key("Cupertino", None, "USA") == ("cupertino", "", "usa"))

    # id map round trip, comma + slash in name
    tricky = "Dallas/Fort Worth, TX"
    m2i, i2m = build_id_map(["Austin, TX", tricky, "Zurich"])
    check("id map: round trip with comma+slash name", i2m[m2i[tricky]] == tricky)
    check("id map: ids sorted, deterministic", m2i["Austin, TX"] < m2i["Zurich"])

    # shortlist cap + none always present
    many = [{"metro": f"Metro{i:03d}", "country": "USA"} for i in range(300)]
    freq_boost = [{"metro": "Metro001", "country": "USA"}] * 5  # push freq up so cap keeps it
    m2i2, _ = build_id_map([r["metro"] for r in many])
    sl = shortlist_for_country(many + freq_boost, "USA", m2i2)
    check("shortlist: capped at 254", len(sl) == 254)
    check("shortlist: high-frequency metro survives cap", "Metro001" in sl)
    crit = build_criteria(sl, m2i2)
    check("criteria: none always present", crit.get("none") == NONE_DESC)
    check("criteria: <= 255 options", len(crit) <= 255)
    sl_excl = shortlist_for_country(many, "USA", m2i2, exclude_metro="Metro005")
    check("shortlist: exclude_metro really removes it", "Metro005" not in sl_excl)

    # singleton / city==metro detection for eval-set building
    labelled = [
        {"symbol": "AAA", "city": "Cupertino", "state": "CA", "country": "USA", "metro": "San Francisco Bay Area"},
        {"symbol": "BBB", "city": "cupertino", "state": "ca", "country": "usa", "metro": "San Francisco Bay Area"},  # dup key of AAA
        {"symbol": "CCC", "city": "Austin", "state": "TX", "country": "USA", "metro": "Austin"},  # city==metro
        {"symbol": "DDD", "city": "Redmond", "state": "WA", "country": "USA", "metro": "Seattle"},  # singleton, hard
        {"symbol": "EEE", "city": "Seattle", "state": "WA", "country": "USA", "metro": "Seattle"},  # control candidate
    ]
    sets1 = build_eval_sets(labelled, seed=0)
    hard_syms = {r["symbol"] for r in sets1["hard"]}
    check("eval-set: AAA/BBB (dup key) excluded from HARD", "AAA" not in hard_syms and "BBB" not in hard_syms)
    check("eval-set: DDD (singleton, city!=metro) is HARD", "DDD" in hard_syms)
    check("eval-set: CCC (city==metro) not HARD", "CCC" not in hard_syms)
    control_syms = {r["symbol"] for r in sets1["control"]}
    check("eval-set: CONTROL drawn only from city==metro rows, capped at len(HARD)==1",
          control_syms <= {"CCC", "EEE"} and len(control_syms) == 1)

    # negative construction really strips the truth
    neg_row = sets1["negative"][0] if sets1["negative"] else sets1["hard"][0]
    m2i3, _ = build_id_map(r["metro"] for r in labelled)
    sl_full = shortlist_for_country(labelled, neg_row["country"], m2i3)
    sl_neg = shortlist_for_country(labelled, neg_row["country"], m2i3, exclude_metro=neg_row["metro"])
    check("negative: true metro removed from shortlist", neg_row["metro"] in sl_full and neg_row["metro"] not in sl_neg)

    # determinism: same input+seed -> same sets; different seed can change sampled sets
    big = [{"symbol": f"S{i:04d}", "city": "Redmond", "state": "WA", "country": "USA", "metro": "Seattle"}
           for i in range(40)] + \
          [{"symbol": f"C{i:04d}", "city": "Seattle", "state": "WA", "country": "USA", "metro": "Seattle"}
           for i in range(60)]
    # make HARD rows unique keys
    for i, r in enumerate(big[:40]):
        r["city"] = f"Redmond{i}"
    a = build_eval_sets(big, seed=7)
    b = build_eval_sets(big, seed=7)
    c = build_eval_sets(big, seed=8)
    check("determinism: same seed -> identical sets",
          [r["symbol"] for r in a["control"]] == [r["symbol"] for r in b["control"]] and
          [r["symbol"] for r in a["negative"]] == [r["symbol"] for r in b["negative"]])
    check("determinism: different seed -> can change sampled sets",
          [r["symbol"] for r in a["control"]] != [r["symbol"] for r in c["control"]] or
          [r["symbol"] for r in a["negative"]] != [r["symbol"] for r in c["negative"]])
    check("negative: ~20% of HARD", len(a["negative"]) == (len(a["hard"]) * 20) // 100)
    check("control: capped at len(HARD)", len(a["control"]) <= len(a["hard"]))

    # resume skip logic
    resume_rows = [{"set": "hard", "symbol": "AAA"}, {"set": "control", "symbol": "BBB"}]
    done = {(r["set"], r["symbol"]) for r in resume_rows}
    check("resume: already-written pair is skipped", ("hard", "AAA") in done)
    check("resume: different set/symbol pair is not skipped", ("negative", "AAA") not in done)

    # decide()
    idmap = {"m001": "Austin", "m002": "Seattle"}
    check("decide: confident correct", decide({"choice": "m002", "confidence": 0.95}, idmap, 0.9)
          == ("propose", "Seattle"))
    check("decide: below threshold", decide({"choice": "m002", "confidence": 0.5}, idmap, 0.9)
          == ("abstain", "low_confidence"))
    check("decide: choice none", decide({"choice": "none", "confidence": 0.99}, idmap, 0.9)
          == ("abstain", "choice_none"))
    check("decide: unknown id", decide({"choice": "m999", "confidence": 0.99}, idmap, 0.9)
          == ("abstain", "unknown_id"))
    check("decide: missing confidence", decide({"choice": "m001"}, idmap, 0.9)
          == ("abstain", "missing_confidence"))
    check("decide: missing answers (None answer)", decide(None, idmap, 0.9)
          == ("abstain", "malformed_answer"))
    check("decide: answer wrong type", decide("not a dict", idmap, 0.9)
          == ("abstain", "malformed_answer"))
    check("decide: missing choice key", decide({"confidence": 0.9}, idmap, 0.9)
          == ("abstain", "malformed_answer"))

    # top3 formatting
    t3 = format_top3({"m001": 0.7, "m002": 0.2, "none": 0.1}, idmap)
    check("top3: sorted desc, 3 entries, names not ids", t3 == "Austin:0.7|Seattle:0.2|none:0.1")
    check("top3: empty probs -> empty string", format_top3({}, idmap) == "")

    # reliability bins + ECE hand-computed
    pairs = [(0.95, 1), (0.92, 1), (0.55, 0), (0.58, 1)]
    tbl = reliability_table(pairs)
    b9 = next(t for t in tbl if t["bin"] == 9)
    b5 = next(t for t in tbl if t["bin"] == 5)
    check("reliability: bin 9 has the two 0.9x rows, accuracy 1.0", b9["n"] == 2 and b9["accuracy"] == 1.0)
    check("reliability: bin 5 has the two 0.5x rows, accuracy 0.5", b5["n"] == 2 and b5["accuracy"] == 0.5)
    # ECE = (2*|mean(.95,.92)-1| + 2*|mean(.55,.58)-.5|)/4
    expect_ece = (2 * abs(0.935 - 1.0) + 2 * abs(0.565 - 0.5)) / 4
    check("ECE: matches hand computation", abs(ece(pairs) - expect_ece) < 1e-9)

    # coverage/precision hand-computed
    cprows = [{"pick": "Austin", "confidence": 0.95, "truth": "Austin"},
              {"pick": "Seattle", "confidence": 0.95, "truth": "Austin"},
              {"pick": "none", "confidence": 0.99, "truth": "Austin"},
              {"pick": "Austin", "confidence": 0.6, "truth": "Austin"}]
    cov, prec = coverage_precision(cprows, 0.9)
    check("coverage@0.9: 2 of 4 proposed", cov == 0.5)
    check("precision@0.9: 1 of 2 proposed rows correct", prec == 0.5)
    cov2, prec2 = coverage_precision(cprows, 0.99)
    check("coverage@0.99: only the 0.99-conf row qualifies but it's a 'none' pick (not proposed)",
          cov2 == 0.0 and prec2 is None)

    # percentile
    check("percentile: p50 of 1..10 is 5.5", abs(percentile(list(range(1, 11)), 0.5) - 5.5) < 1e-9)
    check("percentile: p0 is min, p100 is max", percentile([3, 1, 2], 0.0) == 1 and percentile([3, 1, 2], 1.0) == 3)
    check("percentile: empty -> 0.0", percentile([], 0.5) == 0.0)

    # backoff schedule
    check("backoff: 5 exponential delays", backoff_schedule() == [1, 2, 4, 8, 16])

    # baselines
    lrows = [{"symbol": "X1", "city": "Cupertino", "state": "CA", "country": "USA", "metro": "SF Bay Area"},
             {"symbol": "X2", "city": "cupertino", "state": "ca", "country": "usa", "metro": "SF Bay Area"}]
    check("baseline_exact: finds match excluding self", baseline_exact(lrows[0], lrows) == "SF Bay Area")
    solo = [{"symbol": "Y1", "city": "Redmond", "state": "WA", "country": "USA", "metro": "Seattle"}]
    check("baseline_exact: no match when held out (HARD simulation)", baseline_exact(solo[0], solo) is None)
    check("baseline_cityname: city equals a shortlisted metro name", baseline_cityname(
        {"city": "Austin"}, ["Austin", "Seattle"]) == "Austin")
    check("baseline_cityname: no match -> None", baseline_cityname({"city": "Cupertino"}, ["Austin"]) is None)

    print(f"\n{len(fail)} failures" if fail else "\nALL SELF-TESTS PASS")
    sys.exit(1 if fail else 0)

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--eval", action="store_true")
    ap.add_argument("--report", nargs="?", const="", default=None, metavar="FILE")
    ap.add_argument("--queue", action="store_true")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--set", choices=["hard", "control", "negative", "all"], default="all")
    ap.add_argument("--threshold", type=float, default=0.90)
    ap.add_argument("--seed", default="0")
    args = ap.parse_args()

    if args.self_test:
        cmd_self_test(); return
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
