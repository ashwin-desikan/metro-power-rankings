#!/usr/bin/env python3
"""
reconcile-history.py
====================
Post-processes the Wikidata-pulled history files (see pull-history.py). Wikidata
records term START dates (P580) reliably but frequently omits END dates (P582),
so many past officeholders come back flagged "current" (e.g. Nauru returned
seven simultaneous "current" presidents). This reconstructs each office's
timeline by chaining terms: within the head-of-state line and the
head-of-government line separately, each term's end is set to the next term's
start, leaving only the genuinely current holder open.

Also: strips " of <Country>" suffixes from names, re-labels a small set of
monarchies whose head of state Wikidata mis-typed, and recomputes current/tenure.

Operates ONLY on backfilled files (every row has party==null AND era==null), so
the curated 107 are never touched. Reads from --in, writes to --out (default:
in place is disabled; you pass an output dir and copy over after review).

Usage:
  python scripts/leaders/reconcile-history.py --in public/data/leaders --out /tmp/staged
"""
import json, re, sys, os, glob
from datetime import date
from pathlib import Path
from calendar import monthrange

ROOT = Path(__file__).resolve().parents[2]
COUNTRIES = json.loads((ROOT / "public/data/countries.json").read_text(encoding="utf-8"))
NAME_BY_SLUG = {c["slug"]: c["name"] for c in COUNTRIES}
CROWN, WARN = "\U0001f451", "⚠️"
HOG_TOKENS = ["Prime Minister", "Chancellor", "Premier", "Taoiseach"]
FORCE_MONARCHY = {"tonga"}  # HoS mis-typed as President by Wikidata's current P122

def bare(n): return re.sub(r'^[⚠️\U0001f451\s]+', '', n).strip()
def is_hog(role): return any(t in role for t in HOG_TOKENS)

def tenure(start, end):
    if not start: return None
    try:
        s = date(*(int(x) for x in start[:10].split("-")))
    except Exception:
        return None
    e = date.today()
    if end:
        try: e = date(*(int(x) for x in end[:10].split("-")))
        except Exception: pass
    if e < s: return None
    y = e.year - s.year; m = e.month - s.month; d = e.day - s.day
    if d < 0:
        m -= 1
        pm = e.month - 1 or 12; py = e.year if e.month != 1 else e.year - 1
        d += monthrange(py, pm)[1]
    if m < 0: y -= 1; m += 12
    parts = []
    if y: parts.append(f"{y}y")
    if m: parts.append(f"{m}m")
    parts.append(f"{d}d")
    return " ".join(parts)

def clean_name(name, slug):
    b = bare(name); pref = name[:len(name) - len(b)]
    cn = NAME_BY_SLUG.get(slug, "")
    for suf in (f" of the {cn}", f" of {cn}"):
        if cn and b.endswith(suf):
            b = b[:-len(suf)].strip()
    return pref + b

_MACHINE_TENURE = re.compile(r"\d+y( \d+m)?( \d+d)?$|\d+m( \d+d)?$|\d+d$")
def _looks_curated(rows):
    # Human-written tenures ("33 years", "2005-present (Sovereign Prince)") mark a
    # hand-curated file that must never be treated as a raw Wikidata backfill.
    for r in rows:
        t = r.get("tenure")
        if t and not _MACHINE_TENURE.fullmatch(t):
            return True
    return False

def is_backfilled(rows):
    return (len(rows) > 0
            and all(r.get("party") is None and r.get("era") is None for r in rows)
            and not _looks_curated(rows))

def chain(group):
    group.sort(key=lambda r: r["start"])
    for i in range(len(group) - 1):
        nxt = group[i + 1]["start"]
        if group[i]["end"] is None or (group[i]["end"] and group[i]["end"] > nxt):
            group[i]["end"] = nxt
    return group

def reconcile(slug, rows):
    for r in rows:
        r["name"] = clean_name(r["name"], slug)
        if slug in FORCE_MONARCHY and not is_hog(r["role"]):
            r["role"] = "Monarch"
            if not r["name"].startswith(CROWN):
                r["name"] = f"{CROWN} {bare(r['name'])}"
    hog = [r for r in rows if is_hog(r["role"])]
    hos = [r for r in rows if not is_hog(r["role"])]
    chain(hog); chain(hos)
    for r in rows:
        r["current"] = r["end"] is None
        r["tenure"] = tenure(r["start"], r["end"])
    rows.sort(key=lambda r: (r["start"], 0 if is_hog(r["role"]) else 1))
    return rows

def main(argv):
    ind = argv[argv.index("--in") + 1] if "--in" in argv else "public/data/leaders"
    outd = argv[argv.index("--out") + 1] if "--out" in argv else "/tmp/staged"
    os.makedirs(outd, exist_ok=True)
    done = skipped = 0
    for f in sorted(glob.glob(os.path.join(ind, "*.json"))):
        slug = os.path.basename(f)[:-5]
        if slug == "_current": continue
        try: rows = json.loads(Path(f).read_text(encoding="utf-8"))
        except Exception: continue
        if not isinstance(rows, list) or not is_backfilled(rows):
            skipped += 1; continue
        n_current_before = sum(1 for r in rows if r.get("current"))
        rows = reconcile(slug, rows)
        n_current_after = sum(1 for r in rows if r.get("current"))
        Path(os.path.join(outd, f"{slug}.json")).write_text(
            json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
        done += 1
        if n_current_before != n_current_after:
            print(f"  {slug}: current {n_current_before} -> {n_current_after}")
    print(f"reconciled {done} backfilled files ({skipped} curated/other left untouched) -> {outd}")

if __name__ == "__main__":
    main(sys.argv[1:])
