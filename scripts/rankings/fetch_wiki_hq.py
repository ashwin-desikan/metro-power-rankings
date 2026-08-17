"""Pull the headquarters evidence for the curation worklist out of Wikipedia,
locally, so the drafting session reads compact extracts instead of 213 web pages.

The bulk-jobs rule says move real acquisition out of the chat loop. Fetching 213
articles through WebFetch would put 213 summarised pages through context; this
puts them on disk and hands back an infobox field plus a handful of sentences
that actually mention a headquarters or a move.

  python fetch_wiki_hq.py --self-test     # offline, extraction logic only
  python fetch_wiki_hq.py                 # 20-company pilot
  python fetch_wiki_hq.py --full --resume # all 213

  -> out/wiki_hq_extracts.jsonl  (one JSON object per company)

Article resolution prefers the QID the backfill already verified — that is the
whole point of having spent the sweep on identity. Only companies with no QID
fall back to a title search, and the title actually used is recorded so a wrong
article is visible rather than silent.
"""
import argparse, csv, json, os, re, sys, time, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

WORKLIST = os.path.join(OUT, "hq_curation_worklist.csv")
EXTRACTS = os.path.join(OUT, "wiki_hq_extracts.jsonl")
WP = "https://en.wikipedia.org/w/api.php"
ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{}.json"
UA = "CitizenOfNowhere-data/1.0 (https://rankings.citizenofnowhere.org) python-urllib"
PILOT = 20
SLEEP = 0.2

# Infobox parameters that carry a headquarters, and the life-cycle dates that
# bound how long any single value can possibly have applied.
HQ_PARAMS = re.compile(
    r"^\s*(hq_location\w*|headquarters\w*|location_city|location_country|location)\s*=",
    re.I)
LIFE_PARAMS = re.compile(
    r"^\s*(foundation|founded|formed|inception|defunct|dissolved|fate|successor|"
    r"predecessor|parent)\s*=", re.I)

# A sentence is worth showing only if it could carry a location or a move.
KEEP = re.compile(r"headquarter|relocat|moved (its|to|from)|move to|based in|"
                  r"offices (in|to)|incorporated in|founded in", re.I)
YEAR = re.compile(r"\b(1[89]\d{2}|20[0-2]\d)\b")


# ---------------------------------------------------------------------------
# EXTRACTION — pure, offline, self-tested. No network below until _get.
# ---------------------------------------------------------------------------

def strip_markup(s):
    """Wikitext to something readable. Crude on purpose: this output is evidence
    for a human to read, not a parse tree."""
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    # [[target|shown]] -> shown ; [[target]] -> target
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    # {{template|a|b}} -> keep the arguments, they often hold the city
    for _ in range(3):
        s2 = re.sub(r"\{\{[^{}]*\}\}",
                    lambda m: " ".join(p for p in m.group(0)[2:-2].split("|")[1:]), s)
        if s2 == s:
            break
        s = s2
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"[ \t]+", " ", s).strip()


def infobox_fields(wikitext):
    """The headquarters and life-cycle parameters of the first infobox.

    Line-based rather than brace-matched: infobox values routinely contain
    nested templates, and a brace matcher that gets it wrong drops the field
    silently. A line starting with '|' and a known parameter name is enough."""
    hq, life = {}, {}
    for raw in wikitext.splitlines():
        line = raw.strip()
        if not line.startswith("|"):
            continue
        body = line[1:]
        if "=" not in body:
            continue
        name, _, val = body.partition("=")
        val = strip_markup(val)
        if not val:
            continue
        if HQ_PARAMS.match(body):
            hq[name.strip().lower()] = val[:200]
        elif LIFE_PARAMS.match(body):
            life[name.strip().lower()] = val[:120]
    return hq, life


def drop_infobox(wikitext):
    """Remove the infobox BLOCK, by counting braces.

    The obvious `re.sub(r"\\{\\{Infobox.*", "", text, flags=re.S)` deletes the
    infobox and the entire article after it, because the infobox is at the top
    and `.*` with DOTALL runs to the end of the string. It returns cleanly and
    yields zero sentences, which reads exactly like "this article says nothing
    about headquarters" — the same shape of silent failure the rankings pipeline
    has been bitten by before."""
    m = re.search(r"\{\{\s*[Ii]nfobox", wikitext)
    if not m:
        return wikitext
    i, depth = m.start(), 0
    while i < len(wikitext):
        if wikitext.startswith("{{", i):
            depth += 1
            i += 2
        elif wikitext.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                return wikitext[:m.start()] + wikitext[i:]
        else:
            i += 1
    return wikitext[:m.start()]      # unbalanced; keep what precedes it


def sentences(wikitext, limit=8):
    """Sentences that mention a headquarters or a move, newest evidence first if
    they carry a year. Everything else is noise for this task."""
    body = drop_infobox(wikitext)[:60000]
    text = strip_markup(body)
    text = re.sub(r"\n+", " ", text)
    out, seen = [], set()
    for s in re.split(r"(?<=[.!?])\s+", text):
        s = s.strip()
        if len(s) < 25 or len(s) > 400 or not KEEP.search(s):
            continue
        key = s[:60]
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    # A sentence with a year is worth more than one without: the whole problem
    # is boundaries, and an undated sentence cannot supply one.
    out.sort(key=lambda s: (0 if YEAR.search(s) else 1))
    return out[:limit]


def extract(wikitext):
    hq, life = infobox_fields(wikitext)
    return {"infobox_hq": hq, "infobox_life": life,
            "sentences": sentences(wikitext)}


# ---------------------------------------------------------------------------
# NETWORK
# ---------------------------------------------------------------------------

def _get(url):
    from common import fetch_url
    last = None
    for a in range(3):
        try:
            return json.loads(fetch_url(url, timeout=45, ua=UA).decode("utf-8", "replace"))
        except Exception as e:
            last = e
            time.sleep((10 if "429" in str(e) else 2) * (a + 1))
    raise RuntimeError(f"{url} -> {last}")


def title_from_qid(qid):
    d = _get(ENTITY.format(qid))
    e = (d.get("entities") or {}).get(qid) or {}
    sl = (e.get("sitelinks") or {}).get("enwiki") or {}
    return sl.get("title")


def title_from_search(name):
    q = urllib.parse.urlencode({"action": "query", "list": "search",
                                "srsearch": name, "srlimit": 1,
                                "format": "json", "formatversion": 2})
    d = _get(f"{WP}?{q}")
    hits = (d.get("query") or {}).get("search") or []
    return hits[0]["title"] if hits else None


def wikitext(title):
    q = urllib.parse.urlencode({"action": "parse", "page": title,
                                "prop": "wikitext", "redirects": 1,
                                "format": "json", "formatversion": 2})
    d = _get(f"{WP}?{q}")
    if "error" in d:
        return None, d["error"].get("info", "")[:120]
    p = d.get("parse") or {}
    return p.get("wikitext"), p.get("title") or title


def read_done():
    done = {}
    if os.path.exists(EXTRACTS):
        with open(EXTRACTS, encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                    done[r["company_key"]] = r
                except Exception:
                    pass
    return done


def run(full, resume, search_only=False, only_keys=None):
    with open(WORKLIST, encoding="utf-8") as f:
        todo = list(csv.DictReader(f))
    if only_keys:
        want = {k.strip() for k in open(only_keys, encoding="utf-8").read().splitlines()
                if k.strip()}
        todo = [t for t in todo if t["company_key"] in want]
        log(f"re-looking up {len(todo)} of {len(want)} requested keys")
        done = {}
    else:
        done = read_done() if resume else {}
        if done:
            log(f"resuming: {len(done)} already extracted")
            todo = [t for t in todo if t["company_key"] not in done]
        if not full:
            todo = todo[:PILOT]

    t0, stats = time.time(), {"ok": 0, "no_article": 0, "no_hq": 0, "error": 0}
    # APPEND on a re-lookup, never truncate: `done` is empty in that mode and the
    # obvious `"a" if (resume and done)` would have wiped 213 good extracts to
    # rewrite 37. Readers take the LAST record per company_key, so an appended
    # re-lookup supersedes the original without losing it.
    mode = "a" if (only_keys or (resume and done)) else "w"
    with open(EXTRACTS, mode, encoding="utf-8") as out:
        for i, t in enumerate(todo, 1):
            rec = {"company_key": t["company_key"], "company": t["company"],
                   "first_year": int(t["first_year"]), "last_year": int(t["last_year"]),
                   "board_rows": int(t["board_rows"]), "qid": t.get("qid") or "",
                   "title": "", "url": "", "via": "", "error": ""}
            try:
                # 🔴 The QID path follows the entity to TODAY'S company. That is
                # how NCR resolved to an Indian railway zone, Hanson Industries to
                # Outer Hebrides, Triangle Industries to a person, and Bestfoods to
                # Unilever — 37 of 195 landed on a successor or a namesake. Same
                # absorption drift that made P159 unusable, one layer up. --search
                # forces a title search on the era's own name instead.
                title = None
                if t.get("qid") and not search_only:
                    title = title_from_qid(t["qid"])
                rec["via"] = "qid" if title else "search"
                if not title:
                    title = title_from_search(t["company"])
                if not title:
                    rec["error"] = "no article found"
                    stats["no_article"] += 1
                else:
                    wt, resolved = wikitext(title)
                    if not wt:
                        rec["error"] = f"parse failed: {resolved}"
                        stats["no_article"] += 1
                    else:
                        rec["title"] = resolved
                        rec["url"] = ("https://en.wikipedia.org/wiki/"
                                      + urllib.parse.quote(resolved.replace(" ", "_")))
                        rec.update(extract(wt))
                        if rec["infobox_hq"] or rec["sentences"]:
                            stats["ok"] += 1
                        else:
                            stats["no_hq"] += 1
            except Exception as e:
                rec["error"] = str(e)[:200]
                stats["error"] += 1
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            out.flush()
            time.sleep(SLEEP)
            if i % 25 == 0 or i == len(todo):
                log(f"{i}/{len(todo)}  {time.time()-t0:.0f}s")

    log(f"-> {EXTRACTS}")
    for k, v in stats.items():
        log(f"  {k:<12} {v}")
    if todo:
        log(f"rate: {(time.time()-t0)/len(todo):.2f}s/company")
    if not full:
        log("PILOT ONLY. Re-run with --full --resume.")


# ---------------------------------------------------------------------------
# SELF-TEST — the extraction only, on wikitext shaped like the real thing.
# ---------------------------------------------------------------------------

FIXTURE = """{{Infobox company
| name = Atlantic Richfield Company
| founded = {{start date|1966}}
| hq_location_city = [[Los Angeles]], [[California]]
| hq_location_country = U.S.
| defunct = {{end date|2000}}
| fate = Acquired by [[BP]]
| num_employees = 1,000
}}
The '''Atlantic Richfield Company''' was founded in 1966.<ref name="a">x</ref>
It was headquartered in New York City from 1966 until 1971.
The company moved to Los Angeles in 1971, occupying ARCO Plaza.
ARCO sold widgets and had 1,000 employees at its peak.
Its oil and gas division was based in Dallas, Texas.
<!-- a comment that mentions headquarters and should vanish -->
"""


def self_test():
    ok = fail = 0

    def check(name, got, want):
        nonlocal ok, fail
        if got == want:
            ok += 1
        else:
            fail += 1
            print(f"  FAIL {name}\n       got  {got!r}\n       want {want!r}")

    hq, life = infobox_fields(FIXTURE)
    check("infobox city found", hq.get("hq_location_city"), "Los Angeles, California")
    check("infobox country found", hq.get("hq_location_country"), "U.S.")
    check("a template value keeps its argument", life.get("founded"), "1966")
    check("end date template too", life.get("defunct"), "2000")
    check("fate is captured", life.get("fate"), "Acquired by BP")
    check("unrelated params ignored", "num_employees" in hq or "num_employees" in life,
          False)

    ss = sentences(FIXTURE)
    joined = " || ".join(ss)
    check("the 1966-1971 sentence survives",
          any("New York City from 1966 until 1971" in s for s in ss), True)
    check("the 1971 move survives", any("moved to Los Angeles in 1971" in s for s in ss),
          True)
    check("an unrelated sentence is dropped", "sold widgets" in joined, False)
    check("a comment is stripped even though it says headquarters",
          "a comment that mentions" in joined, False)
    check("a ref body is stripped", "<ref" in joined and "name=" in joined, False)
    check("dated sentences sort first", bool(YEAR.search(ss[0])), True)
    check("divisional line still offered as evidence",
          any("Dallas" in s for s in ss), True)

    # The bug this file was written around: a DOTALL wildcard deleted the whole
    # article after the infobox and produced a clean, empty, wrong result.
    kept = drop_infobox(FIXTURE)
    check("dropping the infobox keeps the prose",
          "moved to Los Angeles in 1971" in kept, True)
    check("dropping the infobox removes its params",
          "hq_location_city" in kept, False)
    check("nested braces inside an infobox do not end it early",
          "still here" in drop_infobox(
              "{{Infobox x\n| a = {{nested|1}}\n| b = 2\n}}\nstill here"), True)
    check("no infobox is a no-op", drop_infobox("plain text"), "plain text")
    check("an unbalanced infobox does not take the article with it",
          drop_infobox("before {{Infobox x\n| a = 1\n"), "before ")

    # Markup handling in isolation.
    check("piped link shows the label",
          strip_markup("moved to [[New York City|New York]] in 1977"),
          "moved to New York in 1977")
    check("plain link keeps the target",
          strip_markup("in [[Harrison, New York]]"), "in Harrison, New York")
    check("bold and italic go", strip_markup("'''Texaco''' was ''big''"),
          "Texaco was big")

    # An article with no usable evidence must produce nothing, not a crash.
    empty = extract("{{Infobox company\n| name = Foo\n}}\nFoo made things.")
    check("no evidence yields empty", (empty["infobox_hq"], empty["sentences"]),
          ({}, []))

    print(f"self-test: {ok} passed, {fail} failed")
    return 1 if fail else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--search", action="store_true",
                    help="ignore the QID and search on the era's own name")
    ap.add_argument("--only-keys", help="file of company_keys, one per line")
    a = ap.parse_args()
    if a.self_test:
        sys.exit(self_test())
    run(a.full, a.resume, search_only=a.search, only_keys=a.only_keys)


if __name__ == "__main__":
    main()
