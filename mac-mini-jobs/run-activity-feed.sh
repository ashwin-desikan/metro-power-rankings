#!/bin/bash
# Regenerate the Site Activity feed (public/data/activity-feed.json) from git
# history and commit it [vercel skip]. The /activity page + home "Latest updates"
# rail read it via ISR-from-raw (lib/activity.ts), so no Vercel build is needed.
#
# Runs early each morning (03:30) so it captures the previous day's data-job +
# manual commits. Its own "chore(activity)" commits are skipped by the generator,
# so the feed never lists itself.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"
cd "$REPO" || { echo "repo not found at $REPO"; exit 1; }

# Pull every machine's latest commits first so the feed is complete.
git pull --rebase --autostash -q origin main || { echo "git pull failed"; exit 1; }

python3 scripts/build-activity-feed.py || { echo "generator failed"; exit 1; }

if git diff --quiet -- public/data/activity-feed.json; then
  echo "activity feed unchanged — nothing to commit"
  exit 0
fi

git add public/data/activity-feed.json
git commit -q -m "chore(activity): refresh site activity feed [vercel skip]" \
  || { echo "commit failed"; exit 1; }

# Push with a short retry: a data job may push concurrently (non-fast-forward).
for attempt in 1 2 3; do
  if git push -q origin main 2>/dev/null; then echo "pushed"; exit 0; fi
  echo "push rejected (attempt $attempt) — rebasing and retrying"
  git pull --rebase --autostash -q origin main || true
done
echo "push failed after retries"; exit 1
