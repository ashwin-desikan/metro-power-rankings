#!/bin/bash
# Dead-man's-switch heartbeat. Pings an external monitor (healthchecks.io or
# similar) on a schedule so THAT service alerts if the mini stops checking in.
# This covers total-machine failure (power/internet/hardware/OS) — the one gap
# the mini's own ntfy alerts can't cover, since a dead machine can't alert you.
# No-ops silently until HEALTHCHECK_URL is set in the env.
set -uo pipefail
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
[ -n "${HEALTHCHECK_URL:-}" ] || exit 0
# --retry rides out brief network blips so a 10-second outage doesn't page you.
curl -fsS -m 15 --retry 3 --retry-delay 5 "$HEALTHCHECK_URL" >/dev/null 2>&1 || true
