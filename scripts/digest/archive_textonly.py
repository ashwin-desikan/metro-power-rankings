#!/usr/bin/env python3
"""Load the pre-cutover digest-newsfeed files into digest_item_textonly.

These 43 files (2026-05-11 to 2026-06-29) are the curated urban-relevant items the
daily digest wrote into the project tree before the pipeline moved to the mini. They
carry a headline, a source and a why, but NO article URL, and none exists anywhere on
disk: the socials step that captured links only began around 2026-06-20, and the
narration scripts are spoken-word with zero http in them.

So they go in digest_item_textonly, not digest_item. The public archive keeps its
promise that every story links out; these still join the analysis through the
digest_story_all view.

Bullet shape:
    - **Headline text** — prose explaining why it matters. *(Source: Front Office Sports)*

Usage:
    python archive_textonly.py <dir> [--write]
    python archive_textonly.py --self-test
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co"

BULLET = re.compile(r"^\s*[-*]\s+(.*\S)\s*$")
SOURCE = re.compile(r"\*\(\s*Source:\s*(?P<src>[^)]+?)\s*\)\*\s*$", re.I)
BOLD_HEAD = re.compile(r"^\*\*(?P<head>.+?)\*\*\s*(?:[—–-]\s*)?(?P<rest>.*)$", re.S)
DASHES = re.compile(r"\s+[—–]\s+")


def key() -> str:
    f = ROOT / "scripts" / "mktcap" / "supabase_key.txt"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    for var in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"):
        k = os.environ.get(var, "").strip()
        if k:
            return k
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith(("SUPABASE_SERVICE_ROLE_KEY=", "SUPABASE_SERVICE_KEY=")):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("No Supabase key found")


def req(method: str, path: str, body=None, prefer=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", data=data, method=method)
    k = key()
    r.add_header("apikey", k)
    r.add_header("Authorization", f"Bearer {k}")
    r.add_header("Content-Type", "application/json")
    if prefer:
        r.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase {method} {path} -> {e.code}: {e.read().decode()[:400]}")


def strip_md(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = re.sub(r"\[(.+?)\]\([^)]*\)", r"\1", s)   # any stray links -> their text
    return re.sub(r"\s+", " ", s).strip()


def parse_bullet(body: str) -> dict | None:
    source = None
    m = SOURCE.search(body)
    if m:
        source = strip_md(m.group("src"))
        body = body[: m.start()].strip()

    bold = BOLD_HEAD.match(body.strip())
    if bold:
        headline = strip_md(bold.group("head"))
        why = strip_md(bold.group("rest"))
    else:
        parts = DASHES.split(body.strip(), maxsplit=1)
        headline = strip_md(parts[0])
        why = strip_md(parts[1]) if len(parts) > 1 else ""

    headline = headline.rstrip(" .,:;—-").strip()
    if len(headline) < 6:
        return None
    if not why:
        why = "Recorded in the day's digest without further detail."
    # These whys are prose sentences; keep them readable but bounded.
    if len(why) > 400:
        cut = why[:400].rsplit(". ", 1)[0]
        why = (cut + ".") if len(cut) > 80 else why[:400].rstrip() + "..."
    return {"headline": headline, "why": why, "source_name": source}


def extract(path: Path) -> dict:
    date = path.stem
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = BULLET.match(line)
        if not m:
            continue
        parsed = parse_bullet(m.group(1))
        if not parsed:
            continue
        parsed["position"] = len(items) + 1
        items.append(parsed)
    return {"digest_date": date, "items": items}


def self_test() -> None:
    bad = 0
    s = ("**Atlanta as the new epicenter of U.S. Soccer** — U.S. Soccer opened a $250M "
         "HQ in Fayetteville. *(Source: Front Office Sports)*")
    r = parse_bullet(s)
    if not r or not r["headline"].startswith("Atlanta as the new epicenter"):
        print(f"  FAIL headline: {r}")
        bad += 1
    if not r or r["source_name"] != "Front Office Sports":
        print(f"  FAIL source: {r}")
        bad += 1
    if not r or "250M" not in r["why"]:
        print(f"  FAIL why: {r}")
        bad += 1

    r2 = parse_bullet("**PWHL expansion to Detroit** — adds a 9th franchise.")
    if not r2 or r2["source_name"] is not None:
        print(f"  FAIL no-source case: {r2}")
        bad += 1

    r3 = parse_bullet("**Too short**")
    if not r3 or r3["why"] != "Recorded in the day's digest without further detail.":
        print(f"  FAIL empty-why fallback: {r3}")
        bad += 1

    try:
        _check_flags(["x", "--wrte"], {"--write"})
        print("  FAIL flag-check: --wrte not rejected")
        bad += 1
    except SystemExit:
        pass

    print("self-test:", "OK" if bad == 0 else f"{bad} FAILURE(S)")
    sys.exit(1 if bad else 0)


def _check_flags(argv, allowed, with_value=()):
    """Refuse an unknown --flag: a mistyped --dry-run must not fall through to a write."""
    skip = False
    bad = []
    for tok in argv[1:]:
        if skip:
            skip = False
            continue
        if tok.startswith("--"):
            name = tok.split("=", 1)[0]
            if name not in allowed:
                bad.append(tok)
            elif name in with_value and "=" not in tok:
                skip = True
    if bad:
        sys.stderr.write("unknown flag(s) %s; allowed: %s\n" % (", ".join(bad), ", ".join(sorted(allowed))))
        sys.exit(2)
def main() -> None:
    _check_flags(sys.argv, {"--self-test", "--write"})
    if "--self-test" in sys.argv:
        self_test()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    src, write = Path(args[0]), "--write" in sys.argv

    # Days that already have LINKED stories are skipped outright. From 2026-06-20 the
    # socials step existed, so those days are in digest_item with every link; loading the
    # curated subset here as well would double-count them in digest_story_all.
    linked = {r["digest_date"] for r in (req("GET", "digest_run?select=digest_date") or [])}
    print(f"{len(linked)} day(s) already carry linked stories; those are skipped")

    days, total = [], 0
    for f in sorted(src.glob("2026-*.md")):
        day = extract(f)
        if day["digest_date"] in linked:
            print(f"{day['digest_date']}: already linked, skipped")
            continue
        if not day["items"]:
            print(f"{day['digest_date']}: 0 items, skipped")
            continue
        days.append(day)
        total += len(day["items"])
        print(f"{day['digest_date']}: {len(day['items'])} items")

    print(f"\n{len(days)} day(s), {total} stories")
    if not write:
        print("(dry run, nothing written)")
        return

    for day in days:
        date = day["digest_date"]
        req("DELETE", f"digest_item_textonly?digest_date=eq.{date}")
        req("POST", "digest_item_textonly", [{
            "digest_date": date,
            "position": it["position"],
            "headline": it["headline"],
            "source_name": it.get("source_name"),
            "why": it["why"],
            "origin": "digest-newsfeed",
        } for it in day["items"]], prefer="return=minimal")
    print(f"pushed {total} stories across {len(days)} days")


if __name__ == "__main__":
    main()
