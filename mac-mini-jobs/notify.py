#!/usr/bin/env python3
"""
notify.py - one push notifier shared by the Mac mini jobs.

Supports Pushover and ntfy, selected by NOTIFY_PROVIDER. Importable
(`from notify import notify`) and runnable as a CLI:

    python3 notify.py "Title" "Body text" [priority]

Config (env, usually sourced from config.env):
    NOTIFY_PROVIDER   pushover | ntfy        (default: ntfy)
    # Pushover:
    PUSHOVER_TOKEN    application API token
    PUSHOVER_USER     user/group key
    # ntfy:
    NTFY_TOPIC        topic name (required for ntfy)
    NTFY_SERVER       base URL (default: https://ntfy.sh)
    NTFY_TOKEN        optional bearer token for protected topics

Fails soft: a notifier that is misconfigured prints to stderr and returns
False rather than throwing, so a monitoring run is never lost to a bad token.
"""
import os
import sys
import json
import urllib.request
import urllib.parse


def _post(url, data=None, headers=None, timeout=15):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status


def notify(title: str, message: str, priority: int = 0) -> bool:
    provider = (os.environ.get("NOTIFY_PROVIDER") or "ntfy").strip().lower()
    try:
        if provider == "pushover":
            token = os.environ.get("PUSHOVER_TOKEN", "").strip()
            user = os.environ.get("PUSHOVER_USER", "").strip()
            if not token or not user:
                print("notify: PUSHOVER_TOKEN / PUSHOVER_USER not set", file=sys.stderr)
                return False
            payload = urllib.parse.urlencode({
                "token": token, "user": user,
                "title": title, "message": message,
                "priority": str(priority),
            }).encode()
            _post("https://api.pushover.net/1/messages.json", data=payload)
            return True

        # default: ntfy
        topic = os.environ.get("NTFY_TOPIC", "").strip()
        if not topic:
            print("notify: NTFY_TOPIC not set", file=sys.stderr)
            return False
        server = (os.environ.get("NTFY_SERVER") or "https://ntfy.sh").rstrip("/")
        headers = {
            "Title": title,
            # ntfy priority: 1..5 (3 = default). Map our 0/1/2 -> 3/4/5.
            "Priority": str(min(5, 3 + max(0, int(priority)))),
        }
        tok = os.environ.get("NTFY_TOKEN", "").strip()
        if tok:
            headers["Authorization"] = f"Bearer {tok}"
        _post(f"{server}/{topic}", data=message.encode("utf-8"), headers=headers)
        return True
    except Exception as e:  # fail soft
        print(f"notify: send failed ({provider}): {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: notify.py TITLE MESSAGE [priority]", file=sys.stderr)
        sys.exit(2)
    t, m = sys.argv[1], sys.argv[2]
    p = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    ok = notify(t, m, p)
    sys.exit(0 if ok else 1)
