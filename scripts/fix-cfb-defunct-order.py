#!/usr/bin/env python3
r"""
Interleave the former-FBS college-football cards with the other defunct/relocated
cards on metro pages, ordered by last year (newest first) instead of appended
after them.

- lib/cfb.ts: FormerCfbCard gains lastYear (max season year).
- app/rankings/[slug]/page.tsx: a lastYearOf() helper parses the last 4-digit
  year from a relocation's years string; the Defunct/Relocated grid merges
  relocations + formerCfb into one list sorted by lastYear desc.

Run from repo root:  python scripts/fix-cfb-defunct-order.py
Run AFTER fix-cfb-lib.py and fix-cfb-metro-defunct.py. Idempotent; anchor-asserted.
"""
import os, sys, shutil

BASE = sys.argv[1] if len(sys.argv) > 1 else "."
LIB = os.path.join(BASE, "lib", "cfb.ts")
PAGE = os.path.join(BASE, "app", "rankings", "[slug]", "page.tsx")

LIB_EDITS = [
    (
        "  slug: string; name: string; href: string; color: string; mono: string; years: string;",
        "  slug: string; name: string; href: string; color: string; mono: string; years: string; lastYear: number;",
    ),
    (
        "        mono: monogram(t.name), years, nat_champ: t.nat_champ_count, conf: t.maj_conf_champ,",
        "        mono: monogram(t.name), years, lastYear: yrs.length ? Math.max(...yrs) : 0, nat_champ: t.nat_champ_count, conf: t.maj_conf_champ,",
    ),
]

PAGE_EDITS = [
    # helper just above TeamsSection
    (
        "function TeamsSection({",
        "function lastYearOf(years: string | null | undefined): number {\n"
        "  if (!years) return 0;\n"
        "  const m = String(years).match(/\\d{4}/g);\n"
        "  return m ? Math.max(...m.map(Number)) : 0;\n"
        "}\n"
        "\n"
        "function TeamsSection({",
    ),
    # E1: open a merged array, wrap each relocation in { y, el }
    (
        "                  {relocations.map((r, idx) => (",
        "                  {[\n"
        "                    ...relocations.map((r, idx) => ({ y: lastYearOf(r.years), el: (",
    ),
    # E2: close relocation entry, open formerCfb entries
    (
        "                    </Link>\n"
        "                  ))}\n"
        "                  {formerCfb.map((f) => (",
        "                    </Link>\n"
        "                    ) })),\n"
        "                    ...formerCfb.map((f) => ({ y: f.lastYear, el: (",
    ),
    # E3: close formerCfb entry, close+sort+render the merged array
    (
        "                          {f.pct.toFixed(3)} W%\n"
        "                        </span>\n"
        "                      </div>\n"
        "                    </Link>\n"
        "                  ))}\n"
        "                </div>\n"
        "              </details>",
        "                          {f.pct.toFixed(3)} W%\n"
        "                        </span>\n"
        "                      </div>\n"
        "                    </Link>\n"
        "                    ) })),\n"
        "                  ].sort((a, b) => b.y - a.y).map((e) => e.el)}\n"
        "                </div>\n"
        "              </details>",
    ),
]

def patch(path, edits, marker):
    if not os.path.isfile(path):
        print("ABORTED: missing " + path); raise SystemExit(1)
    s = open(path, encoding="utf-8").read()
    if marker in s:
        print("Already patched: " + path); return
    for i, (old, new) in enumerate(edits, 1):
        n = s.count(old)
        if n != 1:
            print("ABORTED %s edit %d: anchor matched %d times (expected 1):\n%s" % (path, i, n, old[:120])); raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(path, path + ".defunctorder.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + path)

def main():
    patch(LIB, LIB_EDITS, "lastYear: number;")
    patch(PAGE, PAGE_EDITS, "function lastYearOf(")

if __name__ == "__main__":
    main()
