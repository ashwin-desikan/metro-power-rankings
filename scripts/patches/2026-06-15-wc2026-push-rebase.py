# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, ".github/workflows/wc2026-daily.yml")
c = io.open(P, "r", encoding="utf-8").read()

old = (
    '          git commit -m "Auto: refresh WC2026 projections from latest results"\n'
    '          git push\n'
)
new = (
    '          git commit -m "Auto: refresh WC2026 projections from latest results"\n'
    '          # Integrate anything that landed on main during the run, then push.\n'
    '          # Retry so a concurrent push (e.g. a human commit) cannot fail the job.\n'
    '          for attempt in 1 2 3 4 5; do\n'
    '            if git pull --rebase --autostash origin main && git push; then\n'
    '              echo "Pushed on attempt $attempt."; exit 0\n'
    '            fi\n'
    '            echo "Push race on attempt $attempt; retrying after fetch/rebase..."; sleep $((attempt * 5))\n'
    '          done\n'
    '          echo "Failed to push after retries." >&2; exit 1\n'
)

if c.count(old) != 1:
    sys.exit("ANCHOR FAIL: %d" % c.count(old))
io.open(P, "w", encoding="utf-8").write(c.replace(old, new))
print("OK wc2026-daily.yml push step now rebases + retries")
