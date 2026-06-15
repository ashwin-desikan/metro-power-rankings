import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rel = "lib/releases.ts"
p = os.path.join(ROOT, rel)
with io.open(p, "r", encoding="utf-8") as f:
    c = f.read()

anchor = 'export const RELEASES: Release[] = [\n  {\n    date: "2026-06-14",'
if c.count(anchor) != 1:
    sys.exit("anchor fail: %d" % c.count(anchor))

entry = (
    'export const RELEASES: Release[] = [\n'
    '  {\n'
    '    date: "2026-06-15",\n'
    '    headline: "College basketball reaches the metros",\n'
    '    items: [\n'
    '      "Men\'s college basketball now appears on metro pages: former and defunct Division I programs get cards with national titles, Final Fours and NCAA appearances, from CCNY in New York to dozens of metros.",\n'
    '      "Active NCAA programs link straight to their team pages from metro rosters and the top-teams board, and College Basketball joins the League Hubs on the United States page.",\n'
    '    ],\n'
    '  },\n'
    '  {\n    date: "2026-06-14",'
)
c = c.replace(anchor, entry, 1)
with io.open(p, "w", encoding="utf-8") as f:
    f.write(c)
print("OK releases.ts entry added; longest item:", max(len(x) for x in [
  "Men's college basketball now appears on metro pages: former and defunct Division I programs get cards with national titles, Final Fours and NCAA appearances, from CCNY in New York to dozens of metros.",
  "Active NCAA programs link straight to their team pages from metro rosters and the top-teams board, and College Basketball joins the League Hubs on the United States page.",
]))
