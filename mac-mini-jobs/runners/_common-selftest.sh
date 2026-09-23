#!/usr/bin/env bash
# Self-test for the git-write guards in _common.sh. Run it by hand after
# touching require_expected_branch, mini_sync, _mini_sync_flush_unpushed or
# commit_paths:
#
#   bash mac-mini-jobs/runners/_common-selftest.sh
#
# Exists because require_expected_branch can fail in two opposite directions and
# both are expensive. Too strict and every job on the mini stops; too loose and
# the fleet publishes whatever branch happens to be checked out, which is what
# happened on 2026-09-23 (HANDOFF section AG). An empirical test is the only way
# to know which, since the dangerous path only appears when HEAD is not
# $GIT_BRANCH and nobody wants to arrange that on the live clone.
#
# Builds its own throwaway repo, remote and MINI_DIR in a temp dir and NEVER
# touches the real clone: REPO_DIR is overridden through a generated config.env,
# and notify.py is replaced by a stub that appends to a file so alerts can be
# counted instead of sent.
#
# 🔴 RUN IT WITH bash, NOT sh OR zsh. _common.sh reads BASH_SOURCE under
# `set -u`, so under zsh the source aborts and every assertion "passes" by
# doing nothing. That is exactly how the first run of this test lied.
set -uo pipefail

SRC="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh}"
[ -r "$SRC" ] || { echo "no such file: $SRC"; exit 2; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/mini/runners" "$T/repo"
cp "$SRC" "$T/mini/runners/_common.sh"
C="$T/mini/runners/_common.sh"
A="$T/mini/alerts.log"
S="$T/mini/.mini-wrong-branch"
RM="$T/remote.git"

cat > "$T/mini/config.env" <<EOF
REPO_DIR="$T/repo"
GIT_REMOTE="origin"
GIT_BRANCH="main"
EOF
cat > "$T/mini/notify.py" <<'PY'
import sys, pathlib
pathlib.Path(__file__).with_name("alerts.log").open("a").write(sys.argv[2] + "\n")
PY

(
  cd "$T/repo"
  git init -q -b main .
  git config user.email selftest@example.com
  git config user.name selftest
  echo one > a.txt; git add a.txt; git commit -qm "one [vercel skip]"
  git init -q --bare "$RM"; git remote add origin "$RM"; git push -q origin main
) >/dev/null

pass=0; fail=0
ok()   { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

# Each call runs in its own bash: the guard EXITS, so it must not take the test
# process with it.
inrepo() { bash -c "cd '$T/repo'; . '$C' >/dev/null 2>&1; $1" 2>&1; }
rc_of()  { bash -c "cd '$T/repo'; . '$C' >/dev/null 2>&1; $1 >/dev/null 2>&1"; echo $?; }
alerts() { if [ -f "$A" ]; then wc -l < "$A" | tr -d ' '; else echo 0; fi; }
remote() { git --git-dir="$RM" rev-parse main; }

echo "_common-selftest: guards in $SRC"

check "on main the guard passes"            "$(rc_of 'require_expected_branch x')" 0
check "on main it sends no alert"           "$(alerts)" 0

git -C "$T/repo" switch -q -c a-feature-branch
git -C "$T/repo" commit -q --allow-empty -m "branch work [vercel skip]"

check "on a branch the guard refuses"       "$(rc_of 'require_expected_branch x')" 1
case "$(inrepo 'require_expected_branch "a sync"')" in
  *"REFUSING a sync"*"on a-feature-branch, not main"*) ok "it names the branch and the refusal" ;;
  *) bad "it names the branch and the refusal" ;;
esac
check "it alerts once"                      "$(alerts)" 1
check "the stamp records the branch"        "$(cat "$S" 2>/dev/null)" "a-feature-branch"
rc_of 'require_expected_branch x' >/dev/null
check "a second run does not alert again"   "$(alerts)" 1

before="$(remote)"
check "mini_sync refuses from a branch"     "$(rc_of mini_sync)" 1
check "mini_sync pushed nothing"            "$(remote)" "$before"

echo new > "$T/repo/b.txt"
check "commit_paths refuses from a branch"  "$(rc_of "commit_paths 'Auto: t [vercel skip]' b.txt")" 1
check "commit_paths pushed nothing"         "$(remote)" "$before"
check "commit_paths committed nothing"      "$(git -C "$T/repo" log --oneline --all -- b.txt | wc -l | tr -d ' ')" 0

# DRY_RUN must still work anywhere: it stages, prints a stat and resets, and has
# no push to protect. The guard sits after that early return for this reason.
check "DRY_RUN on a branch does not exit"   "$(bash -c "cd '$T/repo'; export DRY_RUN=1; . '$C' >/dev/null 2>&1; commit_paths 'Auto: t [vercel skip]' b.txt >/dev/null 2>&1; echo survived")" "survived"

git -C "$T/repo" checkout -q --detach HEAD
case "$(inrepo 'require_expected_branch x')" in
  *"on a detached HEAD at "*) ok "a detached HEAD is refused by name" ;;
  *) bad "a detached HEAD is refused by name" ;;
esac

git -C "$T/repo" switch -q main
check "back on main the guard passes"       "$(rc_of 'require_expected_branch x')" 0
check "the stamp is cleared, so it re-arms" "$([ -f "$S" ] && echo present || echo gone)" "gone"

# The other half of the contract: nothing about normal operation changed.
echo new > "$T/repo/c.txt"
check "on main commit_paths still pushes"   "$(rc_of "commit_paths 'Auto: real [vercel skip]' c.txt")" 0
check "the remote moved"                    "$([ "$(remote)" != "$before" ] && echo moved || echo stuck)" "moved"

was="$(remote)"
git -C "$T/repo" commit -q --allow-empty -m "stranded [vercel skip]"
check "on main mini_sync still flushes"     "$(rc_of mini_sync)" 0
check "the stranded commit reached origin"  "$([ "$(remote)" != "$was" ] && echo moved || echo stuck)" "moved"

echo "_common-selftest: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
