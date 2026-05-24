#!/usr/bin/env bash
# Refreshment protocol for metro boundary polygons (macOS/Linux).
# Mirror of scripts/refresh-boundaries.ps1 for use on the Mac box.
#
# Why this exists
#   The boundary build cache only invalidates a metro when its (region,
#   subtype, primary) member set or anchor changes. If the build script's
#   logic itself drifts (e.g. the 2026-05-06 Tokyo build that excluded the
#   23 special wards), polygons can stay stale on disk indefinitely because
#   their input hash never changes. The age-based refresh in
#   scripts/build-metro-boundaries.py rebuilds any cached polygon older
#   than --max-age-days, catching that drift.
#
# How to use
#   Default (weekly):  ./scripts/refresh-boundaries.sh
#   Custom age:        ./scripts/refresh-boundaries.sh --max-age-days 30
#   Full force:        ./scripts/refresh-boundaries.sh --force
#
# Recommended cadence
#   Run weekly. Quarterly run with --max-age-days 1 if you want a near-total
#   refresh after a substantive script change. The build cache file is
#   gitignored, so the rebuild only writes new geojson files where outputs
#   actually changed.

set -euo pipefail

MAX_AGE_DAYS=7
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-age-days)
      MAX_AGE_DAYS="${2:-}"
      if [[ -z "$MAX_AGE_DAYS" ]]; then
        echo "ERROR: --max-age-days requires a value." >&2
        exit 64
      fi
      shift 2
      ;;
    --max-age-days=*)
      MAX_AGE_DAYS="${1#*=}"
      shift
      ;;
    --force|-f)
      FORCE=1
      shift
      ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//' | sed '$d'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Usage: $0 [--max-age-days N] [--force]" >&2
      exit 64
      ;;
  esac
done

# Resolve a python interpreter (prefer python3, fall back to python).
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "ERROR: no python interpreter found on PATH (looked for python3, python)." >&2
  exit 127
fi

# cd to project root (parent of scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ANSI colors (only if stdout is a TTY).
if [[ -t 1 ]]; then
  CYAN=$'\033[36m'
  GREEN=$'\033[32m'
  RESET=$'\033[0m'
else
  CYAN=""
  GREEN=""
  RESET=""
fi

if [[ "$FORCE" -eq 1 ]]; then
  printf "%sRunning boundary build with --force (rebuilds all)...%s\n" "$CYAN" "$RESET"
  "$PY" scripts/build-metro-boundaries.py --force
else
  printf "%sRunning boundary build with --max-age-days %s...%s\n" "$CYAN" "$MAX_AGE_DAYS" "$RESET"
  "$PY" scripts/build-metro-boundaries.py --max-age-days "$MAX_AGE_DAYS"
fi

printf "\n%sDone. Review changes:%s\n" "$GREEN" "$RESET"
printf "  git status --short public/data/metro-boundaries\n"
