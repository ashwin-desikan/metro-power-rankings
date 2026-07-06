#!/bin/bash
# hc-run.sh <slug> <command...>
# Wraps a scheduled job so it reports start / success / fail to healthchecks.io as
# its OWN check — a per-job green/red dashboard viewable remotely (no login needed).
# The healthchecks project ping key lives in ~/.config/mini-hc.env (HC_PING_KEY).
# No-ops silently until that key is set, and never changes the job's own exit code.
set -uo pipefail
[ -f "$HOME/.config/mini-hc.env" ] && { set -a; . "$HOME/.config/mini-hc.env"; set +a; }
slug="$1"; shift
hcping(){ case "${HC_PING_KEY:-}" in ""|PASTE*) return 0;; esac
  curl -fsS -m 10 --retry 2 "https://hc-ping.com/${HC_PING_KEY}/${slug}${1:+/$1}" >/dev/null 2>&1 || true; }
hcping start
if "$@"; then hcping; else rc=$?; hcping fail; exit "$rc"; fi
