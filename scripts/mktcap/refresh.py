"""Weekly orchestrator: fetch -> merge/diff -> export.

  python refresh.py --self-test     offline fixture tests, no network
  python refresh.py                 dry-run (fetch + report, no writes)
  python refresh.py --write         full weekly refresh
"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))

def run(script, *args):
    r = subprocess.run([sys.executable, os.path.join(HERE, script), *args])
    if r.returncode != 0: sys.exit(r.returncode)

if "--self-test" in sys.argv:
    run("selftest.py")
else:
    run("fetch_source.py")
    run("build_merged.py", *(["--write"] if "--write" in sys.argv else []))
    if "--write" in sys.argv:
        run("export_csv.py")
