#!/usr/bin/env python3
"""Snapshot ESPN standings endpoints into public/data/espn-snapshots/.

WHY (2026-08-05): Vercel's egress IPs get refused by ESPN (on the night of
04 Aug every render-time ESPN fetch failed for 7+ hours and MLB/WNBA/MLS/
NFL/CFB vanished from /sports/standings), while GitHub runners reach ESPN
fine (wnba-refresh.yml has pulled from ESPN daily since 2026-08-02). This
script runs in .github/workflows/espn-standings-snapshot.yml and commits
the raw endpoint bodies; lib/espnFetch.ts falls back to these snapshots via
GitHub raw + ISR whenever its live fetch fails.

Wrapper shape per file:
    {"fetched_at": <iso-utc>, "url": <endpoint>, "body": <raw ESPN JSON>}

Failure policy: fail-soft per endpoint (a failed endpoint keeps the previous
snapshot on disk so the site's fallback never regresses to nothing); fail
LOUD (exit 1) only when EVERY endpoint fails, which means a real outage the
workflow should surface instead of silently committing no change.

Change detection: a file is rewritten only when the body differs from the
existing snapshot, so quiet windows produce no commit (wnba-refresh pattern).

--self-test exercises the wrapper/diff logic on stubs, no network.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "public" / "data" / "espn-snapshots"

# Keys MUST match the snapshotKey each lib passes to fetchEspnJson().
ENDPOINTS: dict[str, str] = {
    "nfl": "https://site.api.espn.com/apis/v2/sports/football/nfl/standings",
    "mlb": "https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings",
    "nba": "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings",
    "wnba": "https://site.api.espn.com/apis/v2/sports/basketball/wnba/standings",
    "nhl": "https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings",
    "mls": "https://site.api.espn.com/apis/v2/sports/soccer/usa.1/standings",
    "cfb-standings": "https://site.api.espn.com/apis/v2/sports/football/college-football/standings",
    "cfb-rankings": "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings",
}

# NOT a browser UA on purpose: ESPN 403s bare browser-UA requests that lack
# real browser fingerprints (verified 2026-08-05); plain tool UAs pass.
UA = "rankings-citizen-of-nowhere/1.0 (espn-standings-snapshot)"


def fetch_body(url: str) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as res:
        body = json.load(res)
    if not isinstance(body, dict) or not body:
        raise ValueError("unexpected body shape (not a non-empty object)")
    return body


def write_if_changed(key: str, url: str, body: object) -> bool:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{key}.json"
    if path.exists():
        try:
            if json.loads(path.read_text(encoding="utf-8")).get("body") == body:
                return False
        except (json.JSONDecodeError, OSError):
            pass  # corrupt/unreadable old snapshot: rewrite it
    wrapper = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "url": url,
        "body": body,
    }
    path.write_text(json.dumps(wrapper, separators=(",", ":")) + "\n", encoding="utf-8")
    return True


def main() -> int:
    ok, failed, changed = [], [], []
    for key, url in ENDPOINTS.items():
        try:
            body = fetch_body(url)
        except Exception as e:  # fail-soft per endpoint
            print(f"[snapshot] {key}: FAILED ({type(e).__name__}: {e}); keeping previous snapshot")
            failed.append(key)
            continue
        ok.append(key)
        if write_if_changed(key, url, body):
            changed.append(key)
    print(f"[snapshot] ok={ok} changed={changed} failed={failed}")
    if not ok:
        print("[snapshot] every endpoint failed -- real outage, failing loud", file=sys.stderr)
        return 1
    return 0


def self_test() -> int:
    import tempfile

    global OUT_DIR
    with tempfile.TemporaryDirectory() as td:
        OUT_DIR = Path(td)
        assert write_if_changed("t", "u", {"a": 1}) is True, "first write"
        assert write_if_changed("t", "u", {"a": 1}) is False, "unchanged body must not rewrite"
        first = json.loads((OUT_DIR / "t.json").read_text(encoding="utf-8"))
        assert first["body"] == {"a": 1} and first["url"] == "u" and "fetched_at" in first
        assert write_if_changed("t", "u", {"a": 2}) is True, "changed body must rewrite"
        (OUT_DIR / "t.json").write_text("{corrupt", encoding="utf-8")
        assert write_if_changed("t", "u", {"a": 2}) is True, "corrupt old snapshot must rewrite"
    print("self-test OK (5 cases)")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
