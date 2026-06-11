#!/usr/bin/env python3
"""Patch: wire NationalTeamsSection into the country hub page + register the
new server-only lib in the client-import checker. Anchor-asserted and
idempotent: aborts cleanly if anchors are missing or already applied.
Run natively on Windows from the repo root:  python scripts/patches/patch_country_national_teams.py
"""
import io, sys

def patch(path, edits):
    s = io.open(path, encoding="utf-8").read()
    if any(new in s for _, new in edits):
        print(f"SKIP {path}: already applied"); return s, False
    for old, new in edits:
        n = s.count(old)
        assert n == 1, f"ABORT {path}: anchor count {n} (expected 1): {old[:60]!r}"
    for old, new in edits:
        s = s.replace(old, new)
    return s, True

PAGE = "app/countries/[slug]/page.tsx"
page_edits = [
    ('import CountryMap from "./CountryMap";',
     'import CountryMap from "./CountryMap";\nimport NationalTeamsSection from "./NationalTeamsSection";'),
    ("""          </section>

          <footer className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">""",
     """          </section>

          <NationalTeamsSection countryName={country.name} />

          <footer className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">"""),
]

CHECKER = "scripts/check-client-imports.mjs"
checker_edits = [
    ('  "@/lib/international",',
     '  "@/lib/international",\n  "@/lib/nationalTeamsForCountry",'),
]

changed = 0
for path, edits in ((PAGE, page_edits), (CHECKER, checker_edits)):
    try:
        s, did = patch(path, edits)
    except AssertionError as e:
        print(e); sys.exit(1)
    if did:
        io.open(path, "w", encoding="utf-8", newline="").write(s)
        print(f"OK   {path}")
        changed += 1
print(f"done: {changed} file(s) changed")
