# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "app/sports/games/page.tsx")
c = io.open(P, "r", encoding="utf-8").read()

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:70]))
    c = c.replace(old, new)

# 1) imports
sub(
    'import CfbGames from "@/app/teams/cfb/CfbGames";',
    'import CfbGames from "@/app/teams/cfb/CfbGames";\n'
    'import { getCbbTopGames, getCbbGamesByDecade, getAllCbbSlugs } from "@/lib/cbb";\n'
    'import CbbGames from "@/app/teams/cbb/CbbGames";',
)

# 2) data prep vars
sub(
    '  const cfbCards = FEATURED.filter((g) => g.leagueTag === "CFB").sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));',
    '  const cfbCards = FEATURED.filter((g) => g.leagueTag === "CFB").sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));\n'
    '  const cbbTop = getCbbTopGames();\n'
    '  const cbbByDecade = getCbbGamesByDecade();\n'
    '  const cbbSlugs = getAllCbbSlugs();\n'
    '  const cbbCards = FEATURED.filter((g) => g.leagueTag === "CBB").sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));',
)

# 3) HubNav item
sub(
    '          { label: "College Football", href: "#cfb" },',
    '          { label: "College Football", href: "#cfb" },\n'
    '          { label: "College Basketball", href: "#cbb" },',
)

# 4) render section (after CFB, before What's next)
sub(
    '        <CfbGames topOverall={cfbTop} byDecade={cfbByDecade} linkSlugs={cfbSlugs} />\n'
    '      </section>\n'
    '\n'
    '      {/* What\'s next */}',
    '        <CfbGames topOverall={cfbTop} byDecade={cfbByDecade} linkSlugs={cfbSlugs} />\n'
    '      </section>\n'
    '\n'
    '      {/* Men\'s College Basketball */}\n'
    '      <section id="cbb" className="mb-12 scroll-mt-24">\n'
    '        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">\n'
    '          <div>\n'
    '            <h2 className="text-xl font-bold tracking-tight">Men&apos;s College Basketball</h2>\n'
    '            <p className="text-sm text-[var(--text-muted)] max-w-3xl">The greatest games in NCAA tournament history, ranked by Game Score, with the round, venue and result of each. Filter to a decade.</p>\n'
    '          </div>\n'
    '          <a href="/teams/cbb#games" className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap">Full College Basketball hub &rarr;</a>\n'
    '        </div>\n'
    '        <FeaturedClips games={cbbCards} />\n'
    '        <CbbGames topOverall={cbbTop} byDecade={cbbByDecade} linkSlugs={cbbSlugs} />\n'
    '      </section>\n'
    '\n'
    '      {/* What\'s next */}',
)

# 5) "More sports" note: CBB is now live, drop it from "next"
sub(
    'Club Football, International\n'
    '            Football and Men&apos;s College Basketball are next; the game data is already in hand\n'
    '            and slots into the same model.',
    'Club Football and International\n'
    '            Football are next; the game data is already in hand\n'
    '            and slots into the same model.',
)

io.open(P, "w", encoding="utf-8").write(c)
print("OK /sports/games CBB section added")
