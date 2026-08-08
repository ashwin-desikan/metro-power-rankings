# -*- coding: utf-8 -*-
"""Compare the committed champions-history.json against the working copy AS SETS.

Row order is not meaningful to the site; content is. This answers the only
question that matters after a rebuild: did any championship appear, vanish or
change, or did the workbook merely get re-ordered?
"""
import collections, io, json, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

old = json.loads(subprocess.run(
    ["git", "show", "HEAD:public/data/champions-history.json"],
    capture_output=True, check=True).stdout.decode("utf-8"))
new = json.load(io.open("public/data/champions-history.json", encoding="utf-8"))
print("committed {:,}   working {:,}".format(len(old), len(new)))

def sig(r):
    return json.dumps({k: r.get(k) for k in sorted(r)}, ensure_ascii=False, sort_keys=True)

a, b = collections.Counter(map(sig, old)), collections.Counter(map(sig, new))
gone, added = a - b, b - a
print("rows only in committed: {}   rows only in working: {}".format(
    sum(gone.values()), sum(added.values())))
for s in list(gone)[:12]:
    r = json.loads(s); print("   -", r["year"], r["competition"], r["champion"], repr(r["season"]))
for s in list(added)[:12]:
    r = json.loads(s); print("   +", r["year"], r["competition"], r["champion"], repr(r["season"]))
