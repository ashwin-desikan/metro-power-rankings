#!/usr/bin/env python3
"""Host-side (Windows) patch: render per-tile stats for WNBA and club-football
(incl. MLS) defunct/relocated tiles, mirroring each league's current-team card.
Idempotent, newline-preserving. Run from repo root AFTER patch-reloc-stats-ui.py
(order vs patch-stolen-championship.py does not matter):

    python scripts/patch-other-leagues-stats.py
"""
import os, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _write(path, content2, marker, expect):
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
    _write(path, content.replace(old, new, 1), marker, expect)
    print(f"OK {rel}")

def patch_first(rel, marker, variants):
    # Apply the first variant whose `old` occurs exactly once. Lets us tolerate
    # whether patch-stolen-championship.py has already added `stolen?` to the type.
    path = os.path.join(ROOT, rel)
    with open(path, "r", encoding="utf-8", newline="") as f:
        content = f.read()
    if marker in content:
        print(f"SKIP {rel}: already patched ({marker!r})"); return
    for old, new in variants:
        if content.count(old) == 1:
            expect = len(content) + (len(new) - len(old))
            _write(path, content.replace(old, new, 1), marker, expect)
            print(f"OK {rel}"); return
    sys.exit(f"FAIL {rel}: no known variant of the stats type line matched.")

PAGE = os.path.join("app", "rankings", "[slug]", "page.tsx")

# 1) RelocationCard.stats gains football fields (and stolen if not already there).
FULL = "  stats?: { champ: number; div: number; finals: number; pct: number; stolen?: number; is_mls?: boolean; mls_cups?: number; supporters_shields?: number; cont_trophies?: number; titles?: number; major_cups?: number; top_flight_seasons?: number };"
patch_first("lib/data.ts", "is_mls?: boolean", [
    ("  stats?: { champ: number; div: number; finals: number; pct: number; stolen?: number };", FULL),
    ("  stats?: { champ: number; div: number; finals: number; pct: number };", FULL),
])

# 2) Append WNBA + football chip blocks after the BIG4 block in the relocations tile.
patch(PAGE, 'r.league === "wnba"',
    ['                          {r.league !== "mlb" && r.stats.div > 0 && (',
     '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Division titles won in this metro">',
     '                              {r.stats.div} div',
     '                            </span>',
     '                          )}',
     '                        </div>',
     '                      )}'],
    ['                          {r.league !== "mlb" && r.stats.div > 0 && (',
     '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Division titles won in this metro">',
     '                              {r.stats.div} div',
     '                            </span>',
     '                          )}',
     '                        </div>',
     '                      )}',
     '                      {r.stats && r.league === "wnba" && (',
     '                        <div className="flex gap-1.5 mt-2 flex-wrap">',
     '                          <span',
     '                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"',
     '                            style={{ background: r.stats.champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: r.stats.champ > 0 ? "#d4af37" : "var(--text-dim)" }}',
     '                            title="WNBA championships won while in this metro"',
     '                          >',
     '                            {r.stats.champ === 0 ? "No titles" : r.stats.champ === 1 ? "1 title" : `${r.stats.champ} titles`}',
     '                          </span>',
     '                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="All-time regular-season win percentage in this metro">',
     '                            {r.stats.pct.toFixed(3)} W%',
     '                          </span>',
     '                          {r.stats.div > 0 && (',
     '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Conference titles">',
     '                              {r.stats.div} div',
     '                            </span>',
     '                          )}',
     '                        </div>',
     '                      )}',
     '                      {r.stats && r.league === "football" && (',
     '                        <div className="flex gap-1.5 mt-2 flex-wrap">',
     '                          {r.stats.is_mls ? (',
     '                            <>',
     '                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: (r.stats.mls_cups ?? 0) > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: (r.stats.mls_cups ?? 0) > 0 ? "#d4af37" : "var(--text-dim)" }} title="MLS Cup titles">',
     '                                {(r.stats.mls_cups ?? 0)} {(r.stats.mls_cups ?? 0) === 1 ? "Cup" : "Cups"}',
     '                              </span>',
     '                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(99,102,241,0.16)", color: "#818cf8" }} title="Supporters’ Shields (best regular-season record)">',
     '                                {(r.stats.supporters_shields ?? 0)} Sup. Shield{(r.stats.supporters_shields ?? 0) === 1 ? "" : "s"}',
     '                              </span>',
     '                            </>',
     '                          ) : (',
     '                            <>',
     '                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: (r.stats.titles ?? 0) > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: (r.stats.titles ?? 0) > 0 ? "#d4af37" : "var(--text-dim)" }} title="Top-flight league titles">',
     '                                {(r.stats.titles ?? 0) === 0 ? "No titles" : (r.stats.titles ?? 0) === 1 ? "1 title" : `${r.stats.titles} titles`}',
     '                              </span>',
     '                              {(r.stats.major_cups ?? 0) > 0 && (',
     '                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Major trophies (domestic cups + continental)">',
     '                                  {r.stats.major_cups} maj. trophies',
     '                                </span>',
     '                              )}',
     '                            </>',
     '                          )}',
     '                          {(r.stats.cont_trophies ?? 0) > 0 && (',
     '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Continental trophies">',
     '                              {r.stats.cont_trophies} Cont.',
     '                            </span>',
     '                          )}',
     '                        </div>',
     '                      )}'])

print("Done. Now run:  python scripts/build-relocations.py   then  npx tsc --noEmit")
