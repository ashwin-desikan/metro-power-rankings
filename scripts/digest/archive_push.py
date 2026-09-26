#!/usr/bin/env python3
"""Validate and push tagged archive feed files into digest_run / digest_item.

Checks every day against its skeleton before writing anything: same story count, same
urls in the same order, a non-empty why on every item, no em dashes, and every entity
slug present in public/data. A day that fails is not pushed and does not stop the others.

Usage:
    python archive_push.py <feeds_dir> <skeleton_dir> [--write]
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co"


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
        print(f"  Supabase {method} {path} -> {e.code}: {e.read().decode()[:300]}",
              file=sys.stderr)
        raise


def valid_slugs() -> tuple[set[str], set[str]]:
    def slugs(rel: str) -> set[str]:
        p = ROOT / "public" / "data" / rel
        if not p.exists():
            return set()
        d = json.loads(p.read_text(encoding="utf-8"))
        rows = d if isinstance(d, list) else next(
            (v for v in d.values() if isinstance(v, list)), [])
        out = set()
        for r in rows:
            if isinstance(r, dict) and isinstance(r.get("slug"), str):
                out.add(r["slug"])
            elif isinstance(r, str):
                out.add(r)
        if isinstance(d, dict) and not out:
            out = {k for k in d.keys() if isinstance(k, str)}
        return out
    return slugs("metros.json"), slugs("countries.json")


def check(day: dict, skel: dict, metros: set[str], countries: set[str]) -> list[str]:
    errs: list[str] = []
    items, sk = day.get("items", []), skel.get("items", [])
    if len(items) != len(sk):
        errs.append(f"item count {len(items)} != skeleton {len(sk)}")
        return errs
    for i, (it, s) in enumerate(zip(items, sk), start=1):
        if it.get("url") != s.get("url"):
            errs.append(f"#{i} url changed")
        if it.get("headline") != s.get("headline"):
            errs.append(f"#{i} headline changed")
        why = (it.get("why") or "").strip()
        if not why:
            errs.append(f"#{i} empty why")
        if len(why.split()) > 45:
            errs.append(f"#{i} why is {len(why.split())} words")
        if "—" in why or "–" in why:
            errs.append(f"#{i} why contains an em/en dash")
        for e in it.get("entities") or []:
            t, sl = e.get("type"), e.get("slug")
            if t == "metro" and metros and sl not in metros:
                errs.append(f"#{i} unknown metro {sl!r}")
            elif t == "country" and countries and sl not in countries:
                errs.append(f"#{i} unknown country {sl!r}")
            elif t not in ("metro", "country"):
                errs.append(f"#{i} unexpected entity type {t!r}")
    return errs


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
    _check_flags(sys.argv, {"--write"})
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    feeds, skels = Path(sys.argv[1]), Path(sys.argv[2])
    write = "--write" in sys.argv
    metros, countries = valid_slugs()
    print(f"vocab: {len(metros)} metro slugs, {len(countries)} country slugs")

    ok_days, total = [], 0
    for f in sorted(feeds.glob("*.json")):
        date = f.stem
        day = json.loads(f.read_text(encoding="utf-8"))
        skel_path = skels / f"{date}.json"
        if not skel_path.exists():
            print(f"{date}: SKIP, no skeleton")
            continue
        errs = check(day, json.loads(skel_path.read_text(encoding="utf-8")),
                     metros, countries)
        if errs:
            print(f"{date}: FAIL ({len(errs)})")
            for e in errs[:8]:
                print(f"    {e}")
            continue
        n = len(day["items"])
        total += n
        ok_days.append((date, day))
        print(f"{date}: OK, {n} stories")

    print(f"\n{len(ok_days)} day(s) clean, {total} stories")
    if not write:
        print("(dry run, nothing written)")
        return

    for date, day in ok_days:
        items = day["items"]
        req("POST", "digest_run",
            {"digest_date": date, "item_count": len(items), "built_by": "windows-backfill"},
            prefer="resolution=merge-duplicates")
        req("DELETE", f"digest_item?digest_date=eq.{date}")
        req("POST", "digest_item", [{
            "digest_date": date,
            "position": it["position"],
            "headline": it["headline"],
            "source_name": it.get("source_name") or "Unknown",
            "url": it["url"],
            "why": it["why"].strip(),
            "entities": it.get("entities") or [],
        } for it in items], prefer="return=minimal")
        print(f"  pushed {date}: {len(items)}")


if __name__ == "__main__":
    main()
