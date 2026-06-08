#!/usr/bin/env python3
"""Host-side (Windows) patch: render NHL "OTH" non-Stanley-Cup championships
(WHA Avco Cups, pre-NHL league titles) as WINS instead of lost finals. Pairs
with the build-nhl-data.py change that emits a per-season `other_champ` flag.
Idempotent, newline-preserving. Run from repo root, then rebuild NHL data:

    python scripts/build-nhl-data.py      (or your workbook-sync)
    python scripts/patch-nhl-other-champ.py
    npx tsc --noEmit
"""
import os, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def patch(rel, marker, old_lines, new_lines):
    path = os.path.join(ROOT, rel)
    with open(path, "r", encoding="utf-8", newline="") as f:
        content = f.read()
    nl = "\r\n" if "\r\n" in content else "\n"
    if marker in content:
        print(f"SKIP {rel}: already patched ({marker!r})"); return
    old = nl.join(old_lines); new = nl.join(new_lines)
    n = content.count(old)
    if n != 1:
        sys.exit(f"FAIL {rel}: anchor matched {n} times (need 1).")
    expect = len(content) + (len(new) - len(old))
    content2 = content.replace(old, new, 1)
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".patch-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(content2)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        raise
    with open(path, "r", encoding="utf-8", newline="") as f:
        v = f.read()
    if marker not in v or len(v) != expect:
        sys.exit(f"FAIL {rel}: post-write verification failed.")
    print(f"OK {rel}")

NHL_SEASONS = os.path.join("app", "teams", "nhl", "[slug]", "SeasonsByTeamTable.tsx")

# 1) NHL Season type gains other_champ
patch("lib/nhl.ts", "other_champ?: boolean",
    ["  champ_app: boolean;", "  champ: boolean;", "  playoff_seed: string | null;"],
    ["  champ_app: boolean;", "  champ: boolean;",
     "  other_champ?: boolean;        // non-SC title won (WHA Avco Cup / pre-NHL league title), col Champs = \"OTH\"",
     "  playoff_seed: string | null;"])

# 2) postseasonResult() label helper treats OTH as a win
patch("lib/nhl.ts", '(s.champ ? "Stanley Cup" : "League Title")',
    ['  if (s.champ) return s.league === "WHA" ? "Avco Cup" : "Stanley Cup";'],
    ['  if (s.champ || s.other_champ) return s.league === "WHA" ? "Avco Cup" : (s.champ ? "Stanley Cup" : "League Title");'])

# 3) season table chip: OTH renders as a championship win (Avco Cup / League Title)
patch(NHL_SEASONS, "s.champ || s.other_champ",
    ["  if (s.champ) {",
     '    if (s.league === "WHA") {',
     '      return { label: "Avco Cup", color: "#0c1320", bg: "#6e8aa6" };',
     "    }",
     '    return { label: "Stanley Cup", color: "#1a1408", bg: "#d4af37" };',
     "  }"],
    ["  if (s.champ || s.other_champ) {",
     '    if (s.league === "WHA") {',
     '      return { label: "Avco Cup", color: "#0c1320", bg: "#6e8aa6" };',
     "    }",
     "    if (s.champ) {",
     '      return { label: "Stanley Cup", color: "#1a1408", bg: "#d4af37" };',
     "    }",
     '    return { label: "League Title", color: "#0c1320", bg: "#6e8aa6" };',
     "  }"])

print("Done.")
