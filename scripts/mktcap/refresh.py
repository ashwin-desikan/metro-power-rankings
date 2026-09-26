"""Weekly orchestrator: fetch -> merge/diff -> export.

  python refresh.py --self-test     offline fixture tests, no network
  python refresh.py                 dry-run (fetch + report, no writes)
  python refresh.py --write         full weekly refresh
"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))

def _check_flags(argv, allowed, with_value=()):
    """Refuse an unknown --flag: a mistyped --dry-run must not fall through to a write."""
    skip = False
    bad = []
    for tok in argv[1:]:
        if skip:
            skip = False
            continue
        if tok.startswith("--"):
            name = tok.split("=", 1)[0]
            if name not in allowed:
                bad.append(tok)
            elif name in with_value and "=" not in tok:
                skip = True
    if bad:
        sys.stderr.write("unknown flag(s) %s; allowed: %s\n" % (", ".join(bad), ", ".join(sorted(allowed))))
        sys.exit(2)

def run(script, *args):
    r = subprocess.run([sys.executable, os.path.join(HERE, script), *args])
    if r.returncode != 0: sys.exit(r.returncode)

_check_flags(sys.argv, {"--self-test", "--write"})

if "--self-test" in sys.argv:
    run("selftest.py")
else:
    run("fetch_source.py")
    run("build_merged.py", *(["--write"] if "--write" in sys.argv else []))
    if "--write" in sys.argv:
        run("export_csv.py")
