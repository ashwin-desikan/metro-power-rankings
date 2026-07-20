#!/usr/bin/env python3
"""One-time patch: adds episode auto-pruning to ~/newsletter-podcast/daily.py.

Spotify enforces a hard cap on episodes per show (confirmed 2026-07-19: exactly
60 episodes, new uploads 429 with RATE_LIMIT_EXCEEDED/capacity). daily.py had no
pruning, so the daily upload started failing once the cap was hit. This inserts
a prune_old_episodes() helper (deletes the single oldest episode via `save-to-spotify
episodes delete` when at/over MAX_EPISODES) and calls it right before the upload,
for both the --show-id and the existing-show-by-name paths. A brand-new show has
no episodes yet, so that branch is left alone.

Idempotent: does nothing (prints SKIP) if the file is already patched. Backs up
to daily.py.bak before writing, and refuses to write if either anchor doesn't
match exactly once (so it never silently patches the wrong thing).

Usage (from the repo root on the mini):
    python3 mac-mini-jobs/patch-daily-episode-prune.py [path/to/daily.py]
Default path: ~/newsletter-podcast/daily.py
"""
import sys
from pathlib import Path

DEFAULT_PATH = Path.home() / "newsletter-podcast" / "daily.py"

OLD1 = '''def run(cmd, **kw):
    log(f'$ {" ".join(str(c) for c in cmd[:3])}...')
    return subprocess.check_output(cmd, encoding='utf-8', **kw)

# ---------- main ----------'''

NEW1 = '''def run(cmd, **kw):
    log(f'$ {" ".join(str(c) for c in cmd[:3])}...')
    return subprocess.check_output(cmd, encoding='utf-8', **kw)

MAX_EPISODES = 60  # Spotify's hard cap on this show; without pruning, uploads
                    # 429 with RATE_LIMIT_EXCEEDED/capacity once hit (2026-07-19).

def prune_old_episodes(show_uri):
    """Delete the single oldest episode if the show is at/over the cap, so the
    upload below doesn't 429 on capacity. Best-effort: a prune failure logs a
    warning and falls through to the upload attempt rather than aborting the
    whole run."""
    try:
        episodes = json.loads(run([SAVE_TO_SPOTIFY, '--json', 'episodes',
                                    '--show-id', show_uri]))['episodes']
    except Exception as e:
        log(f'WARN: could not list episodes for pruning ({e}); skipping prune')
        return
    if len(episodes) < MAX_EPISODES:
        return
    oldest = min(episodes, key=lambda e: e['created_at'])
    log(f'== At episode cap ({len(episodes)}/{MAX_EPISODES}); deleting oldest: '
        f'{oldest["title"]!r} ({oldest["created_at"]})')
    try:
        run([SAVE_TO_SPOTIFY, '--json', 'episodes', 'delete', oldest['episode_uri']])
    except Exception as e:
        log(f'WARN: failed to delete oldest episode {oldest["episode_uri"]} ({e}); upload may still 429')

# ---------- main ----------'''

OLD2 = '''    if args.show_id:
        upload_args += ['--show-id', args.show_id]
    else:
        # Find an existing show with the right name; create only if missing.
        shows = json.loads(run([SAVE_TO_SPOTIFY, '--json', 'shows']))['shows']
        match = next((s for s in shows if s.get('title') == args.show_name), None)
        if match:
            upload_args += ['--show-id', match['show_uri']]
            log(f'  using existing show {match["show_uri"]}')
        else:
            upload_args += ['--new-show', args.show_name]
            log(f'  creating new show "{args.show_name}"')'''

NEW2 = '''    if args.show_id:
        upload_args += ['--show-id', args.show_id]
        prune_old_episodes(args.show_id)
    else:
        # Find an existing show with the right name; create only if missing.
        shows = json.loads(run([SAVE_TO_SPOTIFY, '--json', 'shows']))['shows']
        match = next((s for s in shows if s.get('title') == args.show_name), None)
        if match:
            upload_args += ['--show-id', match['show_uri']]
            log(f'  using existing show {match["show_uri"]}')
            prune_old_episodes(match['show_uri'])
        else:
            upload_args += ['--new-show', args.show_name]
            log(f'  creating new show "{args.show_name}"')'''


def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not target.exists():
        sys.exit(f"ERROR: {target} not found")

    src = target.read_text(encoding="utf-8")

    if NEW1 in src and NEW2 in src:
        print(f"SKIP: {target} already patched")
        return

    c1, c2 = src.count(OLD1), src.count(OLD2)
    if c1 != 1 or c2 != 1:
        sys.exit(f"ERROR: anchor mismatch (anchor1 x{c1}, anchor2 x{c2}), "
                  f"expected 1 each -- daily.py has likely changed since this patch "
                  f"was written; refusing to touch it. Paste the file back for a new patch.")

    backup = target.with_suffix(target.suffix + ".bak")
    backup.write_text(src, encoding="utf-8")

    patched = src.replace(OLD1, NEW1, 1).replace(OLD2, NEW2, 1)
    target.write_text(patched, encoding="utf-8")

    import py_compile
    py_compile.compile(str(target), doraise=True)

    print(f"OK: patched {target} (backup at {backup})")


if __name__ == "__main__":
    main()
