# -*- coding: utf-8 -*-
"""Forecast data acquisition. Stdlib only, so the weekly GitHub Action and a
local run behave identically.

Outputs (data/forecast/):
  uk_polls.json     — GB voting-intention polls from Wikipedia (national tables)
  us_polls.json     — 2026 generic-congressional-ballot polls from Wikipedia
  uk_base_2024.json — per-constituency per-party GE2024 shares
                      (House of Commons Library, CBP-10009)

Sources and licences: Wikipedia (CC BY-SA 4.0); Commons Library GE2024
results (Open Parliament Licence). Wikipedia's polling tables use two-row
sticky headers with rowspan/colspan, so column titles are reconstructed from
the header grid before rows are read.
"""
import json, os, re, sys, urllib.request, urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "forecast")
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "MetroPowerRankings-forecast/1.0 (rankings.citizenofnowhere.org)"}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")

def wikitext(title):
    return get("https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title) + "&action=raw")

# ---------------- wikitable parsing ----------------

def strip_markup(cell):
    c = cell
    c = re.sub(r"<ref[^>]*/>", "", c)
    c = re.sub(r"<ref[^>]*>.*?</ref>", "", c, flags=re.S)
    c = re.sub(r"\{\{party name link\|([^}|]+)[^}]*\}\}", r"\1", c, flags=re.I)
    # date/sort templates carry their payload as arguments — keep it
    c = re.sub(r"\{\{(?:dts|opdrts|date table sorting|sortname|sort|vert ?header)\s*\|([^}]*)\}\}",
               lambda m: " ".join(a for a in m.group(1).split("|") if "=" not in a), c, flags=re.I)
    # wrapper templates keep their payload (candidate names in FR scenario headers
    # sit inside {{nowrap|[[Édouard Philippe]]}} and similar)
    for _ in range(2):
        c = re.sub(r"\{\{(?:nowrap|small|center|abbr|tooltip|hs)\s*\|((?:[^{}]|\[\[[^\]]*\]\])*)\}\}",
                   r"\1", c, flags=re.I)
    c = re.sub(r"\{\{(?:efn|refn|sfn)[^}]*\}\}", "", c, flags=re.I)
    c = re.sub(r"\{\{[^}]*\}\}", "", c)
    c = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", c)
    # external links: [https://url Label] -> Label; bare [https://url] -> ''
    c = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", c)
    c = re.sub(r"\[https?://[^\]\s]+\]", "", c)
    c = re.sub(r"<[^>]+>", " ", c)
    c = c.replace("'''", "").replace("''", "")
    return c.strip()

def top_level_pipe(raw):
    """Index of the first '|' outside {{ }} and [[ ]], or -1."""
    depth_t = depth_l = 0
    i = 0
    while i < len(raw):
        two = raw[i:i + 2]
        if two == "{{":
            depth_t += 1; i += 2; continue
        if two == "}}":
            depth_t = max(0, depth_t - 1); i += 2; continue
        if two == "[[":
            depth_l += 1; i += 2; continue
        if two == "]]":
            depth_l = max(0, depth_l - 1); i += 2; continue
        if raw[i] == "|" and depth_t == 0 and depth_l == 0:
            return i
        i += 1
    return -1

def cell_parts(raw):
    """(text, rowspan, colspan) for one header/data cell. The attribute
    prefix ends at the first top-level '|' (pipes inside templates and links
    don't count), and only if the prefix actually looks like attributes."""
    rs = cs = 1
    txt = raw
    p = top_level_pipe(raw)
    if p >= 0:
        head = raw[:p]
        if "=" in head or re.search(r"rowspan|colspan|style|class|scope|align|width", head):
            attrs, txt = raw[:p], raw[p + 1:]
            mr = re.search(r"rowspan\s*=\s*\"?(\d+)", attrs)
            mc = re.search(r"colspan\s*=\s*\"?(\d+)", attrs)
            if mr: rs = int(mr.group(1))
            if mc: cs = int(mc.group(1))
    return strip_markup(txt), rs, cs

def parse_tables(wt):
    """Yield (columns, data_rows). Columns come from the (possibly two-row)
    header grid with rowspan/colspan resolved; deeper header rows override
    group titles, so party names win over 'Vote share'."""
    for m in re.finditer(r"\{\|.*?\n\|\}", wt, flags=re.S):
        lines = m.group(0).split("\n")
        header_rows, data_rows, current, in_header = [], [], [], True
        hcells = []
        for ln in lines:
            ln = ln.rstrip()
            if ln.startswith("!"):
                for c in re.split(r"!!", ln[1:]):
                    hcells.append(cell_parts(c))
            elif ln.startswith("|-"):
                if hcells:
                    header_rows.append(hcells); hcells = []
                if current:
                    data_rows.append(current); current = []
            elif ln.startswith("|}"):
                break
            elif ln.startswith("|"):
                in_header = False
                for c in re.split(r"\|\|", ln[1:]):
                    t, rs, cs = cell_parts(c)
                    current.append(t)
            else:
                # wikitext lets a cell continue on the next plain line
                # (e.g. "! rowspan=3 |Polling\nperiod") — glue it on
                t = strip_markup(ln).strip()
                if t:
                    if current:
                        current[-1] = (current[-1] + " " + t).strip()
                    elif hcells:
                        tt, rs, cs = hcells[-1]
                        hcells[-1] = ((tt + " " + t).strip(), rs, cs)
        if hcells:
            header_rows.append(hcells)
        if current:
            data_rows.append(current)
        if not header_rows:
            continue
        # resolve the header grid: occ[slot] = header-row index through which
        # the slot is occupied by an earlier rowspanning cell
        width = sum(cs for _, _, cs in header_rows[0])
        cols = [""] * width
        occ = [-1] * width
        for ri, hrow in enumerate(header_rows[:3]):
            pos = 0
            for text, rs, cs in hrow:
                while pos < width and occ[pos] >= ri:
                    pos += 1
                for k in range(cs):
                    if pos + k < width:
                        if text:  # deeper rows override group titles, but
                            cols[pos + k] = text  # blank colour cells don't
                        if rs > 1:
                            occ[pos + k] = ri + rs - 1
                pos += cs
        yield cols, data_rows

PARTY_PAT = {
    "con": r"^con\b|conservat|tory",
    "lab": r"^lab\b|labour",
    "ld": r"lib ?dem|liberal dem|^ld\b",
    "ref": r"reform|^ruk\b|^ref\b",
    "grn": r"green|^grn\b",
    "snp": r"^snp\b|scottish nat",
    "pc": r"plaid|^pc\b",
    "dem": r"democrat",
    "rep": r"republican|^gop\b",
    # New Zealand
    "nat": r"^nat\b|^national\b",
    "act": r"^act\b",
    "nzf": r"^nzf\b|nz first|new zealand first",
    "tpm": r"^tpm\b|te p[āa]ti|m[āa]ori party",
    "top": r"^top\b|opportunities",
}

def find_cols(cols, wanted):
    out, meta = {}, {}
    for i, h in enumerate(cols):
        hl = h.lower().strip()
        if not hl:
            continue
        for key in wanted:
            if key not in out and re.search(PARTY_PAT[key], hl):
                out[key] = i
        if re.search(r"pollster|polling firm|polling organi|poll source|source of poll|conducted by", hl):
            meta.setdefault("pollster", i)
        if re.search(r"date|fieldwork|administered", hl):
            meta.setdefault("date", i)
        if "sample" in hl:
            meta.setdefault("sample", i)
    return out, meta

NUM = re.compile(r"(\d+(?:\.\d+)?)\s*%?")
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

def parse_date(s, default_year):
    # numeric ymd from {{dts|2026|7|16}}-style payloads
    mnum = re.search(r"(20\d\d)\s+(\d{1,2})\s+(\d{1,2})", s)
    if mnum:
        return "%04d-%02d-%02d" % (int(mnum.group(1)), int(mnum.group(2)), int(mnum.group(3)))
    y = re.search(r"(20\d\d)", s)
    year = int(y.group(1)) if y else default_year
    best = None
    for m in re.finditer(r"(\d{1,2})\s+([A-Za-z]{3,9})|([A-Za-z]{3,9})\.?\s+(\d{1,2})(?!\d)", s):
        if m.group(1) and m.group(2):
            d, mo = int(m.group(1)), m.group(2)[:3].lower()
        else:
            mo, d = m.group(3)[:3].lower(), int(m.group(4))
        if mo in MONTHS and 1 <= d <= 31:
            best = (year, MONTHS[mo], d)
    if best:
        return "%04d-%02d-%02d" % best
    mo = re.search(r"([A-Za-z]{3,9})", s)
    if mo and mo.group(1)[:3].lower() in MONTHS:
        return "%04d-%02d-15" % (year, MONTHS[mo.group(1)[:3].lower()])
    return None

def extract_polls(wt, wanted, default_year, exclude_header_pat=None):
    polls = []
    for cols, rows in parse_tables(wt):
        joined = " | ".join(cols).lower()
        if exclude_header_pat and re.search(exclude_header_pat, joined):
            continue
        pcols, meta = find_cols(cols, wanted)
        if len(pcols) < 2 or "date" not in meta:
            continue
        for r in rows:
            if len(r) <= max(list(pcols.values()) + [meta["date"]]):
                continue
            date = parse_date(r[meta["date"]], default_year)
            if not date:
                continue
            shares, ok = {}, 0
            for k, i in pcols.items():
                mnum = NUM.search(r[i])
                if mnum:
                    v = float(mnum.group(1))
                    if 0 <= v <= 80:
                        shares[k] = v; ok += 1
            if ok < 2:
                continue
            pollster = r[meta["pollster"]] if "pollster" in meta and meta["pollster"] < len(r) else ""
            pollster = re.sub(r"\(.*?\)", "", pollster).strip()[:48]
            samp = None
            if "sample" in meta and meta["sample"] < len(r):
                ms = re.search(r"([\d,]{3,})", r[meta["sample"]])
                if ms:
                    samp = int(ms.group(1).replace(",", ""))
            polls.append({"date": date, "pollster": pollster or "Unknown", "sample": samp, **shares})
    seen, out = set(), []
    for p in polls:
        key = (p["date"], p["pollster"], round(p.get(wanted[0], -1), 1))
        if key in seen:
            continue
        seen.add(key); out.append(p)
    out.sort(key=lambda p: p["date"])
    return out

def section_slice(wt, start_pat, end_pats):
    ms = re.search(start_pat, wt)
    if not ms:
        return ""
    start = ms.end()
    end = len(wt)
    for ep in end_pats:
        me = re.search(ep, wt[start:])
        if me:
            end = min(end, start + me.start())
    return wt[start:end]

# ---------------- UK ----------------

def fetch_uk():
    wt = wikitext("Opinion polling for the next United Kingdom general election")
    national = section_slice(wt, r"==\s*National poll results\s*==", [r"==\s*Seat projections", r"==\s*Sub-national"])
    if not national:
        national = wt
    all_polls = []
    year_secs = re.split(r"===\s*(20\d\d)\s*===", national)
    # re.split gives [pre, '2026', chunk, '2025', chunk, ...]
    for i in range(1, len(year_secs) - 1, 2):
        year, chunk = int(year_secs[i]), year_secs[i + 1]
        got = extract_polls(chunk, ["con", "lab", "ld", "ref", "grn", "snp"], year)
        print(f"  UK {year}: {len(got)} polls")
        all_polls.extend(got)
    seen, polls = set(), []
    for p in sorted(all_polls, key=lambda p: p["date"]):
        key = (p["date"], p["pollster"])
        if key in seen:
            continue
        seen.add(key); polls.append(p)
    json.dump({"source": "Wikipedia: Opinion polling for the next United Kingdom general election (CC BY-SA 4.0)",
               "parties": ["con", "lab", "ld", "ref", "grn", "snp"],
               "polls": polls}, open(os.path.join(OUT, "uk_polls.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("UK polls total:", len(polls))
    if polls:
        print("  latest:", polls[-1])

# ---------------- US ----------------

def fetch_us():
    """The 2026 House article carries a generic-ballot AGGREGATOR table
    (Decision Desk HQ, RCP, etc.) rather than individual polls, so the US
    input is the set of aggregator averages — labelled as such downstream.
    Any individual-poll tables that appear later are picked up too."""
    wt = wikitext("2026 United States House of Representatives elections")
    sec = section_slice(wt, r"==\s*Opinion polling\s*==", [r"\n==[^=]"])
    if not sec:
        sec = wt
    aggs = []
    for cols, rows in parse_tables(sec):
        joined = " | ".join(cols).lower()
        if "aggregat" not in joined:
            continue
        pcols, meta = find_cols(cols, ["dem", "rep"])
        src_i = next((i for i, c in enumerate(cols) if "source" in c.lower()), 0)
        upd_i = next((i for i, c in enumerate(cols) if "updated" in c.lower()), None)
        for r in rows:
            if len(r) <= max(pcols.values() if pcols else [0]):
                continue
            vals = {}
            for k, i in pcols.items():
                mnum = NUM.search(r[i]) if i < len(r) else None
                if mnum:
                    v = float(mnum.group(1))
                    if 20 <= v <= 70:
                        vals[k] = v
            if len(vals) < 2:
                continue
            updated = parse_date(r[upd_i], 2026) if upd_i is not None and upd_i < len(r) else None
            aggs.append({"source": r[src_i][:48] if src_i < len(r) else "Unknown",
                         "updated": updated, **vals})
    polls = extract_polls(sec, ["dem", "rep"], 2026, exclude_header_pat=r"aggregat")
    print(f"  US aggregators: {len(aggs)}; individual polls: {len(polls)}")
    json.dump({"source": "Wikipedia: 2026 United States House of Representatives elections, generic congressional ballot (CC BY-SA 4.0)",
               "parties": ["dem", "rep"],
               "aggregators": aggs,
               "polls": polls}, open(os.path.join(OUT, "us_polls.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if aggs:
        print("  aggs:", [(a["source"], a.get("dem"), a.get("rep")) for a in aggs])

# ---------------- US Senate (ratings-based) ----------------

RATING_WORD = {"solid": 3.0, "safe": 3.0, "likely": 2.0, "lean": 1.0, "tilt": 0.5, "tossup": 0.0}

def fetch_us_senate():
    """Parse the race-ratings table on '2026 United States Senate elections':
    one row per seat up in 2026 (Class 2 plus specials), the incumbent party,
    and the {{USRaceRating|...}} calls from the eight ratings agencies. The
    consensus score (D-positive: Solid D = +3 ... Solid R = -3) feeds the
    ratings-based Senate simulation."""
    wt = wikitext("2026 United States Senate elections")
    block = None
    for m in re.finditer(r"\{\|.*?\n\|\}", wt, flags=re.S):
        b = m.group(0)
        if "USRaceRating" in b and "Cook" in b and "Sabato" in b:
            block = b
            break
    races = []
    if block:
        state, party, ratings, retiring = None, None, [], False
        def flush():
            nonlocal state, party, ratings, retiring
            if state and ratings:
                score = sum(ratings) / len(ratings)
                races.append({"state": state, "incumbentParty": party or "?",
                              "nRatings": len(ratings), "score": round(score, 2),
                              "retiring": retiring})
            state, party, ratings, retiring = None, None, [], False
        for ln in block.split("\n"):
            ln = re.sub(r"<!--.*?-->", "", ln).strip()  # '<!--Cook--> | {{USRaceRating...' rows
            if ln.startswith("|-"):
                flush(); continue
            if ln.startswith("!"):
                ms = re.search(r"\[\[2026 United States Senate (?:special )?election in ([^|\]]+)", ln)
                if ms:
                    state = ms.group(1).strip()
                continue
            if not ln.startswith("|"):
                continue
            if re.search(r"Party shading/Republican", ln) and party is None:
                party = "R"
            if re.search(r"Party shading/(Democratic|DFL|Farmer)", ln) and party is None:
                party = "D"  # DFL covers Minnesota's Democratic-Farmer-Labor label
            if re.search(r"retiring|resigning", ln, re.I):
                retiring = True
            for mr in re.finditer(r"\{\{USRaceRating\|(\w+)(?:\|(\w))?", ln):
                word = mr.group(1).lower()
                pty = (mr.group(2) or "").upper()
                if word in RATING_WORD:
                    v = RATING_WORD[word]
                    ratings.append(v if pty == "D" else (-v if pty == "R" else 0.0))
        flush()
    d_up = sum(1 for r in races if r["incumbentParty"] == "D")
    r_up = sum(1 for r in races if r["incumbentParty"] == "R")
    out = {"source": "Wikipedia: 2026 United States Senate elections, race-ratings table citing Cook, Inside Elections, Sabato, The Economist, RCP, DDHQ, Race to the WH and Fox (CC BY-SA 4.0)",
           # 119th Congress: 53 R, 47 D-caucus. Carryover = totals minus seats up.
           "senateNow": {"R": 53, "D": 47},
           "seatsUp": {"D": d_up, "R": r_up},
           "races": races}
    json.dump(out, open(os.path.join(OUT, "us_senate.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"  US Senate races parsed: {len(races)} (D-held {d_up}, R-held {r_up})")
    comp = sorted(races, key=lambda r: abs(r["score"]))[:8]
    print("  most competitive:", [(r["state"], r["incumbentParty"], r["score"]) for r in comp])

# ---------------- UK 2024 constituency base ----------------

HOC_URL = "https://researchbriefings.files.parliament.uk/documents/CBP-10009/HoC-GE2024-results-by-constituency.csv"

def fetch_uk_base():
    import csv, io, time
    dest = os.path.join(OUT, "uk_base_2024.json")
    if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
        print("  uk_base_2024.json already present — skipping refetch (2024 results are static)")
        return
    raw = None
    for attempt in range(3):
        try:
            raw = get(HOC_URL)
            break
        except Exception as e:
            print("  HoC fetch attempt", attempt + 1, "failed:", repr(e))
            time.sleep(10)
    if raw is None:
        print("  !! HoC CSV unavailable; keeping any existing base file")
        return
    rows = list(csv.DictReader(io.StringIO(raw)))
    print("  HoC csv rows:", len(rows))
    seats = []
    for r in rows:
        low = {k.strip().lower(): (v or "").replace(",", "").strip() for k, v in r.items()}
        def num(*names):
            for n in names:
                v = low.get(n, "")
                if v and v.replace(".", "", 1).isdigit():
                    return float(v)
            return 0.0
        name = (low.get("constituency name") or "").strip()
        region = (low.get("region name") or "").strip()
        country = (low.get("country name") or "").strip()
        valid = num("valid votes")
        if not name or not valid:
            continue
        votes = {"con": num("con"), "lab": num("lab"), "ld": num("ld"), "ref": num("ruk"),
                 "grn": num("green"), "snp": num("snp"), "pc": num("pc")}
        oth = max(0.0, valid - sum(votes.values()))
        shares = {k: round(v / valid * 100, 2) for k, v in votes.items()}
        shares["oth"] = round(oth / valid * 100, 2)
        seats.append({"name": name, "region": region or country, "country": country, "shares": shares})
    json.dump({"source": "House of Commons Library, GE2024 results by constituency (CBP-10009, Open Parliament Licence)",
               "seats": seats}, open(os.path.join(OUT, "uk_base_2024.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("UK base seats:", len(seats), "(NI:", sum(1 for s in seats if s["country"] == "Northern Ireland"), ")")

# ---------------- New Zealand ----------------

def fetch_nz():
    wt = wikitext("Opinion polling for the 2026 New Zealand general election")
    sec = section_slice(wt, r"===\s*Table of polls\s*===", [r"\n==[^=]"])
    polls = extract_polls(sec or wt, ["nat", "lab", "grn", "act", "nzf", "tpm", "top"], 2026)
    json.dump({"source": "Wikipedia: Opinion polling for the 2026 New Zealand general election (CC BY-SA 4.0)",
               "parties": ["nat", "lab", "grn", "act", "nzf", "tpm", "top"],
               "polls": polls}, open(os.path.join(OUT, "nz_polls.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("NZ polls:", len(polls), "latest:", polls[-1] if polls else None)

# ---------------- Israel (seat polls) ----------------

META_COLS_IL = r"fieldwork|polling firm|publisher|sample|date"

def fetch_il():
    wt = wikitext("Opinion polling for the next Israeli legislative election")
    m = re.search(r"#REDIRECT\s*\[\[([^\]]+)\]\]", wt, re.I)
    if m:
        wt = wikitext(m.group(1))
    parties, polls = None, []
    for cols, rows in parse_tables(wt):
        joined = " ".join(cols).lower()
        if "likud" not in joined or "fieldwork" not in joined:
            continue
        # party columns sit between Sample size and Others/Gov
        try:
            start = next(i for i, c in enumerate(cols) if "sample" in c.lower()) + 1
        except StopIteration:
            continue
        end = len(cols)
        for i, c in enumerate(cols):
            if i > start and re.search(r"^others?$|^gov", c.lower()):
                end = min(end, i)
        pnames = [cols[i] for i in range(start, end)]
        if parties is None:
            parties = pnames  # first matching table (top of page) sets the slate
        elif set(pnames) != set(parties):
            continue  # older cycle / different party slate — skip this table
        gov_i = next((i for i, c in enumerate(cols) if re.match(r"^gov", c.lower())), None)
        date_i = next((i for i, c in enumerate(cols) if re.search(r"fieldwork|date", c.lower())), 0)
        firm_i = next((i for i, c in enumerate(cols) if "polling firm" in c.lower()), 1)
        for r in rows:
            if len(r) < end:
                continue
            date = parse_date(r[date_i], 2026)
            if not date:
                continue
            seats = {}
            for k, i in zip(pnames, range(start, end)):
                cell = r[i]
                if "%" in cell:      # below-threshold share shown as (x.y%)
                    seats[k] = 0
                else:
                    mnum = re.search(r"^(\d{1,2})$", cell.strip())
                    if mnum:
                        seats[k] = int(mnum.group(1))
            if sum(seats.values()) < 100:  # not a national seat row
                continue
            gov = None
            if gov_i is not None and gov_i < len(r):
                mg = re.search(r"(\d{2,3})", r[gov_i])
                if mg:
                    gov = int(mg.group(1))
            polls.append({"date": date, "pollster": r[firm_i][:40] if firm_i < len(r) else "?",
                          "seats": seats, "gov": gov})
    polls.sort(key=lambda p: p["date"])
    json.dump({"source": "Wikipedia: Opinion polling for the 2026 Israeli legislative election (CC BY-SA 4.0)",
               "parties": parties or [], "polls": polls},
              open(os.path.join(OUT, "il_polls.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("IL seat polls:", len(polls), "parties:", parties)
    if polls:
        print("  latest:", polls[-1])

# ---------------- Brazil & France (candidate-scenario polls) ----------------

SKIP_COLS = r"pollster|polling|fieldwork|sample|others?|blank|margin|lead$|link|undecided|abstention|refus|no ?answer|don'?t"

def candidate_tables(sec, default_year):
    """Yield (candidates, rows) where candidates maps column index -> name for
    every column that isn't structural. Values are percentages."""
    for cols, rows in parse_tables(sec):
        date_i = next((i for i, c in enumerate(cols) if re.search(r"fieldwork|polling period|date", c.lower())), None)
        if date_i is None:
            continue
        cands = {i: c for i, c in enumerate(cols)
                 if c and not re.search(SKIP_COLS, c.lower()) and i != date_i}
        if len(cands) < 2:
            continue
        out = []
        for r in rows:
            if len(r) <= date_i:
                continue
            date = parse_date(r[date_i], default_year)
            if not date:
                continue
            shares = {}
            for i, name in cands.items():
                if i < len(r):
                    mnum = NUM.search(r[i])
                    if mnum:
                        v = float(mnum.group(1))
                        if 0 <= v <= 85:
                            shares[name] = v
            if len(shares) >= 2:
                out.append({"date": date, "shares": shares})
        if out:
            yield cands, out

def clean_cand(n):
    return re.sub(r"\s+(PT|PL|PSD|Novo|Repub\.?|MDB|PSDB|PDT|PSB|UB|Missione?s?|Avante)\.?$", "", n).strip()

def fetch_br():
    wt = wikitext("Opinion polling for the 2026 Brazilian presidential election")
    y26 = section_slice(wt, r"===\s*2026\s*===", [r"\n===\s*2025", r"\n==[^=]"])
    r1sec = section_slice(y26, r"====\s*First round\s*====", [r"\n====", r"\n==="]) or y26
    r2sec = section_slice(y26, r"====\s*Second round\s*====", [r"\n====", r"\n==="])
    first = []
    for cands, rows in candidate_tables(r1sec, 2026):
        for r in rows:
            first.append({"date": r["date"], "shares": {clean_cand(k): v for k, v in r["shares"].items()}})
    matchups = []
    if r2sec:
        for cands, rows in candidate_tables(r2sec, 2026):
            names = sorted({clean_cand(n) for r in rows for n in r["shares"]})
            matchups.append({"names": names,
                             "polls": [{"date": r["date"], "shares": {clean_cand(k): v for k, v in r["shares"].items()}} for r in rows]})
    json.dump({"source": "Wikipedia: Opinion polling for the 2026 Brazilian presidential election (CC BY-SA 4.0)",
               "firstRound": sorted(first, key=lambda p: p["date"]), "matchups": matchups},
              open(os.path.join(OUT, "br_polls.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("BR first-round poll rows:", len(first), "runoff tables:", len(matchups))
    if first:
        print("  latest R1:", first[-1])

def fetch_fr():
    wt = wikitext("Opinion polling for the 2027 French presidential election")
    r1sec = section_slice(wt, r"===\s*Since July 2026\s*===", [r"\n===[^=]", r"\n==[^=]"])
    first = []
    for cands, rows in candidate_tables(r1sec, 2026):
        first.extend(rows)
    # second-round head-to-heads: every 'X vs. Y' subsection
    r2 = section_slice(wt, r"==\s*Second round\s*==", [r"\n==[^=]"])
    matchups = []
    for mh in re.finditer(r"====?\s*([^=\n]+ vs\.? [^=\n]+?)\s*====?\n", r2):
        title = mh.group(1).strip()
        sub = r2[mh.end():]
        nxt = re.search(r"\n====?[^=]", sub)
        if nxt:
            sub = sub[:nxt.start()]
        rows_all = []
        for cands, rows in candidate_tables(sub, 2026):
            rows_all.extend(rows)
        if rows_all:
            matchups.append({"title": title, "polls": sorted(rows_all, key=lambda p: p["date"])})
    json.dump({"source": "Wikipedia: Opinion polling for the 2027 French presidential election (CC BY-SA 4.0)",
               "firstRound": sorted(first, key=lambda p: p["date"]), "matchups": matchups},
              open(os.path.join(OUT, "fr_polls.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("FR first-round scenario rows:", len(first), "head-to-heads:", len(matchups))
    if first:
        print("  latest R1:", first[-1])

if __name__ == "__main__":
    print("fetching UK polls...")
    fetch_uk()
    print("fetching US polls...")
    fetch_us()
    print("fetching US Senate ratings...")
    fetch_us_senate()
    print("fetching UK 2024 constituency base...")
    fetch_uk_base()
    print("fetching NZ polls...")
    fetch_nz()
    print("fetching IL seat polls...")
    fetch_il()
    print("fetching BR polls...")
    fetch_br()
    print("fetching FR polls...")
    fetch_fr()
    print("done")
