# .githooks

Per-clone hooks. Enable once per machine: `git config core.hooksPath .githooks`.

- `prepare-commit-msg` auto-appends `[vercel skip]` when a commit's staged
  diff touches nothing build-relevant (see `scripts/vercel-build-paths.txt`).
- `post-commit` independently re-checks that decision and warns loudly on
  a mismatch.
- `pre-commit` rejects a commit that adds lines to `HANDOFF.md` unless at
  least one added line starts with `Notion:` or `**Notion:**`, so a handoff
  entry can't land without saying what changed in the Notion databases (or
  explicitly saying none did). Skip HANDOFF.md deletions, renames-away and
  merge commits. Emergency override: `SKIP_NOTION_CHECK=1`, which warns
  loudly but still lets the commit through.
