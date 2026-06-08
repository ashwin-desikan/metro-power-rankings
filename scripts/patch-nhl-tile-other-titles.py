#!/usr/bin/env python3
"""Host-side (Windows) patch: show an "N other titles" chip on NHL and MLB
defunct/relocated tiles for non-flagship titles, kept distinct from the
Cups/WS chip:
  - NHL: WHA Avco Cups + pre-NHL league championships (Champs col == "OTH")
  - MLB: pre-1903 championships / 19th-century World's Series (col 30)
Pairs with build-relocations.py emitting stats.other. Idempotent and
newline-preserving; safely upgrades an earlier NHL-only version of this chip.
Run from repo root AFTER patch-reloc-stats-ui.py:

    python scripts/patch-nhl-tile-other-titles.py
"""
import os, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _atomic_write(path, content2, marker, expect):
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
        sys.exit(f"FAIL {path}: post-write verification failed.")

def patch_first(rel, marker, variants):
    path = os.path.join(ROOT, rel)
    with open(path, "r", encoding="utf-8", newline="") as f:
        content = f.read()
    nl = "\r\n" if "\r\n" in content else "\n"
    if marker in content:
        print(f"SKIP {rel}: already patched ({marker!r})"); return
    for old_lines, new_lines in variants:
        old = nl.join(old_lines); new = nl.join(new_lines)
        if content.count(old) == 1:
            _atomic_write(path, content.replace(old, new, 1), marker, len(content) + (len(new) - len(old)))
            print(f"OK {rel}"); return
    sys.exit(f"FAIL {rel}: no known variant matched.")

PAGE = os.path.join("app", "rankings", "[slug]", "page.tsx")

# 1) RelocationCard.stats gains `other`. Tolerates whichever earlier patches ran.
FULL = "  stats?: { champ: number; div: number; finals: number; pct: number; stolen?: number; other?: number; is_mls?: boolean; mls_cups?: number; supporters_shields?: number; cont_trophies?: number; titles?: number; major_cups?: number; top_flight_seasons?: number };"
patch_first("lib/data.ts", "other?: number", [
    (["  stats?: { champ: number; div: number; finals: number; pct: number; stolen?: number; is_mls?: boolean; mls_cups?: number; supporters_shields?: number; cont_trophies?: number; titles?: number; major_cups?: number; top_flight_seasons?: number };"], [FULL]),
    (["  stats?: { champ: number; div: number; finals: number; pct: number; stolen?: number };"], [FULL]),
    (["  stats?: { champ: number; div: number; finals: number; pct: number };"], [FULL]),
])

# League-aware "other titles" chip (NHL + MLB).
CHIP = [
 '                          {(r.league === "nhl" || r.league === "mlb") && (r.stats.other ?? 0) > 0 && (',
 '                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(110,138,166,0.30)", color: "#a9b8cc" }} title={r.league === "mlb" ? "Other major titles won in this metro (pre-1903 championships / 19th-century World’s Series)" : "Non-Stanley-Cup major titles won in this metro (WHA Avco Cups / pre-NHL league championships)"}>',
 '                              {r.stats.other ?? 0} other title{(r.stats.other ?? 0) === 1 ? "" : "s"}',
 '                            </span>',
 '                          )}']

PCT = [
 '                          <span',
 '                            className="text-[10px] px-1.5 py-0.5 rounded"',
 '                            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}',
 '                            title={r.league === "nhl" ? "Points percentage during the years in this metro" : "Regular-season win percentage during the years in this metro"}',
 '                          >',
 '                            {r.stats.pct.toFixed(3)} {r.league === "nhl" ? "Pts%" : "W%"}',
 '                          </span>']

NHL_ONLY = [
 '                          {r.league === "nhl" && (r.stats.other ?? 0) > 0 && (',
 '                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(110,138,166,0.30)", color: "#a9b8cc" }} title="Non-Stanley-Cup major titles won in this metro (WHA Avco Cups / pre-NHL league championships)">',
 '                              {r.stats.other ?? 0} other title{(r.stats.other ?? 0) === 1 ? "" : "s"}',
 '                            </span>',
 '                          )}']

# 2) Variant B: upgrade an already-applied NHL-only chip to league-aware.
#    Variant A: fresh insert after the win%/pts% chip. (B first so we never double-insert.)
patch_first(PAGE, '(r.league === "nhl" || r.league === "mlb") && (r.stats.other ?? 0) > 0', [
    (NHL_ONLY, CHIP),
    (PCT, PCT + CHIP),
])

print("Done. Now run:  python scripts/build-relocations.py   then  npx tsc --noEmit")
