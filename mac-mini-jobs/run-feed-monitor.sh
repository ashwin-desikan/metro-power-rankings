#!/bin/bash
# Feed-shape monitor wrapper (mini-owned). feed_shape_monitor.py checks
# structural JSON shape (not just HTTP status) of the ESPN/SPAIA/Sportz/
# Substack feeds the site's parsers depend on, and sends its own consolidated
# alert via notify.py on any hard failure. A healthy run is silent.
#
# This wrapper exists only because the legacy plist ran an inline `bash -lc`
# string (source config.env, exec python) rather than a file, and the
# dispatcher requires `/bin/bash <path> [args]`. Everything below is that
# same inline string, just as a tracked file.
#
# Scheduled 07:20 UTC by mac-mini-jobs/jobs.toml (dispatcher.py), which owns
# the schedule and wraps this in hc-run.sh via hc_slug -- no ntfy/hc plumbing
# needed here beyond what feed_shape_monitor.py already does internally.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$DIR/config.env"; set +a
exec "${PYTHON_BIN:-python3}" "$DIR/feed_shape_monitor.py"
