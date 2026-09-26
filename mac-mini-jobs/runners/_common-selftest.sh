#!/usr/bin/env bash
# Self-test for the git-write guards in _common.sh. Run it by hand after
# touching require_expected_branch, mini_sync, _mini_sync_flush_unpushed or
# commit_paths:
#
#   bash mac-mini-jobs/runners/_common-selftest.sh [_common.sh] [branch-guard.sh]
#
# Run it after touching branch-guard.sh too: since 2026-09-25 require_expected_branch
# is a wrapper round require_main_branch in that file, so this is its test as well.
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
# _common.sh sources $MINI_DIR/branch-guard.sh, so the temp MINI_DIR needs it too.
# The guard honours $MINI_DIR, which is what keeps this test's stamp and alerts in
# $T: the "stamp records the branch" check below fails if it ever stops doing so.
GUARD="${2:-$(cd "$(dirname "$SRC")/.." && pwd)/branch-guard.sh}"
[ -r "$GUARD" ] || { echo "no such file: $GUARD"; exit 2; }
cp "$GUARD" "$T/mini/branch-guard.sh"
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

# commit_paths' push retry (HANDOFF BI). A second clone plays "another machine"
# that pushes between our commit and our push, so the first push is rejected.
# The retry must rebase WITHOUT stashing: on 2026-09-24 an autostash re-apply
# left an unmerged index that stopped the fleet. Each retry sleeps 5s.
git clone -q -b main "$RM" "$T/other" >/dev/null 2>&1
git -C "$T/other" config user.email other@example.com; git -C "$T/other" config user.name other
other_push() { ( cd "$T/other" && git pull -q origin main && printf "$2" > "$1" && git add "$1" \
  && git commit -qm "$3" && git push -q origin main ) >/dev/null 2>&1 || { echo "HARNESS BROKEN: other_push"; exit 3; }; }
unmerged() { git -C "$T/repo" ls-files -u | wc -l | tr -d ' '; }
stashes()  { git -C "$T/repo" stash list | wc -l | tr -d ' '; }
dirty()    { git -C "$T/repo" status --porcelain | tr '\n' ' ' | sed 's/ $//'; }
# Start clean: an earlier case leaves an untracked b.txt, and _mini_sync_rebase_local
# counts untracked files as dirty (as mini_sync always has), so it would refuse.
rm -f "$T/repo/b.txt"
git -C "$T/repo" fetch -q origin && git -C "$T/repo" merge -q --ff-only origin/main
printf 'x1\nx2\nx3\n' > "$T/repo/x.txt"; git -C "$T/repo" add x.txt; git -C "$T/repo" commit -qm "x [vercel skip]"; git -C "$T/repo" push -q origin main

other_push o1.txt 'o\n' "other: o1 [vercel skip]"
echo d1 > "$T/repo/d1.txt"
check "rejected push, clean tree: pushes"   "$(rc_of "commit_paths 'Auto: d1 [vercel skip]' d1.txt")" 0
check "  origin has both commits"           "$(git --git-dir="$RM" log --format=%s -2 main | tr '\n' '|')" "Auto: d1 [vercel skip]|other: o1 [vercel skip]|"
check "  no stash, tree clean"              "$(stashes):$(dirty)" "0:"

other_push x.txt 'x1\nORIGIN\nx3\n' "other: x [vercel skip]"
printf 'x1\nLOCAL\nx3\n' > "$T/repo/x.txt"; echo d2 > "$T/repo/d2.txt"; a0="$(alerts)"; tip0="$(remote)"
check "the 09-24 class: dirty file origin also changed, refuses" "$(rc_of "commit_paths 'Auto: d2 [vercel skip]' d2.txt")" 1
check "  NO unmerged entries"               "$(unmerged)" 0
check "  no stash left"                     "$(stashes)" 0
check "  local edit intact"                 "$(sed -n 2p "$T/repo/x.txt")" "LOCAL"
check "  our commit kept locally"           "$(git -C "$T/repo" log -1 --format=%s)" "Auto: d2 [vercel skip]"
check "  origin untouched by us"            "$(remote)" "$tip0"
check "  it alerted"                        "$([ "$(alerts)" -gt "$a0" ] && echo yes || echo no)" "yes"
git -C "$T/repo" checkout -q -- x.txt
check "  once clean, mini_sync carries it"  "$(rc_of mini_sync)" 0
check "  and it reached origin"             "$(git --git-dir="$RM" log -1 --format=%s main)" "Auto: d2 [vercel skip]"

other_push c.txt 'origin-c\n' "other: c [vercel skip]"
echo mine-c > "$T/repo/c.txt"; head0=""
check "rebase conflict: refuses"            "$(rc_of "commit_paths 'Auto: c [vercel skip]' c.txt")" 1
check "  not left mid-rebase"               "$([ -d "$T/repo/.git/rebase-merge" ] || [ -d "$T/repo/.git/rebase-apply" ] && echo MID-REBASE || echo clean)" "clean"
check "  no unmerged, our commit on top"    "$(unmerged):$(git -C "$T/repo" log -1 --format=%s)" "0:Auto: c [vercel skip]"
git -C "$T/repo" reset -q --hard origin/main

other_push o2.txt 'o\n' "other: o2 [vercel skip]"
echo u > "$T/repo/u.txt"; a0="$(alerts)"
check "untagged commit, rejected push: still pushes" "$(rc_of "commit_paths 'rankings: weekly metro recalculation' u.txt")" 0
check "  it is origin's tip"                "$(git --git-dir="$RM" log -1 --format=%s main)" "rankings: weekly metro recalculation"
check "  and no untagged-commit alert"      "$(alerts)" "$a0"

# Fails CLOSED: a runner whose _common.sh cannot load the guard must not run.
mv "$T/mini/branch-guard.sh" "$T/mini/branch-guard.sh.off"
check "without branch-guard.sh, sourcing refuses" "$(bash -c "cd '$T/repo'; . '$C' >/dev/null 2>&1; echo survived")" ""
mv "$T/mini/branch-guard.sh.off" "$T/mini/branch-guard.sh"

echo "_common-selftest: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
