#!/usr/bin/env python3
"""scripts/fans/push_to_supabase.py

Pushes the Fan Attention Index's full dataset to Supabase, which is now the
system of record for it (2026-09-24: the repo is public, so a 770-team
dataset with franchise valuations can no longer live in git even
server-only under data/fans/ -- see data/fans/ in .gitignore and
scripts/fans/README.md). Two tables, one upsert each, both created by
supabase/migrations/20260924171144_fan_attention.sql:

  public.fan_attention_teams    one row per version, the WHOLE
                                 data/fans/fan-attention.json payload as
                                 jsonb (version is the primary key).
  public.fan_attention_history  one row per data/fans/history/
                                 fan-attention-YYYY-MM.json file, keyed on
                                 "YYYY-MM" (month is the primary key, so a
                                 re-run of the same month overwrites it
                                 rather than duplicating).

Auth: service_role key only (same idiom as scripts/business/
load_market_series.py's service_key(), copied below almost verbatim so this
script has no import dependency on that one). Reads SUPABASE_SERVICE_KEY,
falling back to SUPABASE_SERVICE_ROLE_KEY, from the environment or
.env.local -- NEVER prints the key, and only ever logs whether one was
found. Fails open (matches load_market_series.py / the RATES-CONTRACT
loaders elsewhere in this repo): no key configured means "skip the
Supabase push, log why, exit 0", not a hard failure that would block
monthly_refresh.py's JSON regeneration from completing.

Usage:
    python3 scripts/fans/push_to_supabase.py
    python3 scripts/fans/push_to_supabase.py --dry-run
"""
import base64
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "data", "fans")
FAN_JSON = os.path.join(DATA_DIR, "fan-attention.json")
HISTORY_DIR = os.path.join(DATA_DIR, "history")

SB_URL = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"


def log(m):
    print(m, flush=True)


def service_key():
    """service_role key only, read from the environment or .env.local. Never
    logs or returns the key itself in any printed message -- callers must not
    print this return value."""
    k = (os.environ.get("SUPABASE_SERVICE_KEY")
         or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not k:
        for fn in (".env.local", ".env"):
            p = os.path.join(ROOT, fn)
            if not os.path.exists(p):
                continue
            for line in open(p, encoding="utf-8"):
                for name in ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
                    if line.strip().startswith(name + "="):
                        k = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    if not k:
        return None
    if k.count(".") == 2:  # legacy JWT; the new sb_secret_ keys are opaque
        try:
            role = json.loads(base64.urlsafe_b64decode(k.split(".")[1] + "==")).get("role")
            if role != "service_role":
                log(f"WARNING: key role is '{role}', not 'service_role'. Writes would 401; skipping push.")
                return None
        except (ValueError, KeyError):
            pass
    return k


def rest(method, path, body, key, prefer="resolution=merge-duplicates,return=minimal", timeout=120):
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "User-Agent": UA}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{SB_URL}{path}", data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def main():
    dry_run = "--dry-run" in sys.argv

    if not os.path.exists(FAN_JSON):
        log(f"SKIP: {FAN_JSON} does not exist. Run csv_to_json.py first.")
        return 0

    payload = json.load(open(FAN_JSON, encoding="utf-8"))
    version = payload.get("version")
    generated = payload.get("generated")
    if not version or not generated:
        log("FATAL: fan-attention.json has no version/generated field; refusing to push a malformed row.")
        return 1
    log(f"fan_attention_teams row: version={version}, generated={generated}, "
        f"{len(payload.get('teams', []))} teams, {os.path.getsize(FAN_JSON) / 1024:.1f} KB")

    history_rows = []
    if os.path.isdir(HISTORY_DIR):
        for fn in sorted(os.listdir(HISTORY_DIR)):
            if fn == "index.json" or not fn.startswith("fan-attention-") or not fn.endswith(".json"):
                continue
            hp = json.load(open(os.path.join(HISTORY_DIR, fn), encoding="utf-8"))
            month = hp.get("year_month")
            if not month:
                log(f"SKIP {fn}: no year_month field")
                continue
            history_rows.append({"month": month, "payload": hp})
    log(f"fan_attention_history rows: {len(history_rows)} month file(s) found in {HISTORY_DIR}")

    if dry_run:
        log("DRY_RUN: not writing to Supabase")
        return 0

    key = service_key()
    if not key:
        log("SKIP: no Supabase service key found (SUPABASE_SERVICE_KEY / "
            "SUPABASE_SERVICE_ROLE_KEY, env or .env.local). This push is fail-open: "
            "the local JSON is correct, only the Supabase copy was not updated.")
        return 0
    log("service key found (not printed)")

    try:
        rest("POST", "/rest/v1/fan_attention_teams",
             [{"version": version, "generated_at": generated, "payload": payload}], key)
        log("fan_attention_teams: upserted")
    except Exception as e:  # noqa: BLE001 - fail-open, log and move on
        log(f"WARNING: fan_attention_teams upsert failed: {e}")
        return 1

    if history_rows:
        try:
            CHUNK = 3
            for i in range(0, len(history_rows), CHUNK):
                rest("POST", "/rest/v1/fan_attention_history", history_rows[i:i + CHUNK], key)
            log(f"fan_attention_history: upserted {len(history_rows)} row(s)")
        except Exception as e:  # noqa: BLE001
            log(f"WARNING: fan_attention_history upsert failed: {e}")
            return 1

    log("push_to_supabase: done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
