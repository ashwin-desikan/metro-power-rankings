#!/usr/bin/env python3
"""Safe in-place edit helper. Bypasses the Claude Code Edit/Write tools
which trigger bindfs propagation failures on this project's mount.

Usage:
  python3 scripts/safe-edit.py FILE OLD_FILE NEW_FILE
  python3 scripts/safe-edit.py FILE --stdin  # reads JSON {old, new} from stdin

Atomic: writes via a tempfile + os.replace so partial states aren't visible.
"""

import json
import os
import sys
import tempfile


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: safe-edit.py FILE [OLD NEW | --stdin]")
    target = sys.argv[1]

    if len(sys.argv) >= 3 and sys.argv[2] == "--stdin":
        payload = json.load(sys.stdin)
        old = payload["old"]
        new = payload["new"]
    elif len(sys.argv) >= 4:
        with open(sys.argv[2]) as f:
            old = f.read()
        with open(sys.argv[3]) as f:
            new = f.read()
    else:
        sys.exit("usage: safe-edit.py FILE OLD_FILE NEW_FILE  (or --stdin)")

    with open(target, "r") as f:
        content = f.read()

    occurrences = content.count(old)
    if occurrences == 0:
        sys.exit(f"FAIL: old string not found in {target}")
    if occurrences > 1:
        sys.exit(f"FAIL: old string matches {occurrences} times in {target}; make it unique")

    new_content = content.replace(old, new)

    # Atomic write
    dir_name = os.path.dirname(os.path.abspath(target)) or "."
    fd, tmp = tempfile.mkstemp(dir=dir_name, prefix=".safe-edit-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(new_content)
        os.replace(tmp, target)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise

    # Verify via fresh read
    with open(target, "r") as f:
        verify = f.read()
    if old in verify:
        sys.exit(f"FAIL: write succeeded but old string still present in {target}")
    if new not in verify:
        sys.exit(f"FAIL: write succeeded but new string not present in {target}")

    print(f"OK {target} ({len(content)} -> {len(verify)} bytes)")


if __name__ == "__main__":
    main()
