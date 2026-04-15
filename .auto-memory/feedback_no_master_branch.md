---
name: No master branch references
description: Never reference the master branch; the remote default is main. The master branch on GitHub should be deleted.
type: feedback
originSessionId: a20660ba-67c6-48e1-843d-892ee0d186df
---
Never use or reference the `master` branch. The remote default branch is `main`. The stale `master` branch caused divergence issues and should be deleted on GitHub.

**Why:** User preference. The project uses `main` as the default branch, and `master` is a leftover that caused confusing divergence during a deploy.

**How to apply:** Always push to `origin/main`. If the local tracking is set to `origin/master`, fix it with `git branch --set-upstream-to=origin/main main`. Never include `master` in any git commands.
