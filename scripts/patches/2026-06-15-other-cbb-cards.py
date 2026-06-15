# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "app/rankings/[slug]/page.tsx")
c = io.open(P, "r", encoding="utf-8").read()

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:75]))
    c = c.replace(old, new)

# 1) After fcsFootballCards, add non-qualifying D-I men's hoops as custom cards
#    and a combined otherCollegeCards list for the Other College Teams section.
sub(
'''        division: "FCS", conference: cf?.conference ?? "", hasStats: !!cf,
      };
    })
    .sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));''',
'''        division: "FCS", conference: cf?.conference ?? "", hasStats: !!cf,
      };
    })
    .sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));
  // D-I men's basketball programs without a Sweet 16/Elite 8/Final Four render
  // as the same college card (color circle + conference) rather than the plain
  // team card, just under Other College Teams instead of with the major teams.
  const otherCbbCards: MajorCollegeCard[] = otherTeamsRaw
    .filter((t) => isDiMensHoops(t) && !hoopsQualifies(t))
    .map((t): MajorCollegeCard => {
      const cb = cbbForName(t.team);
      return {
        key: "ob-" + t.team, sport: "basketball", name: cb?.name ?? t.team,
        href: cb ? `/teams/cbb/${cb.slug}` : null, color: cb?.color || "#444",
        mono: cbbMonogram(cb?.name ?? t.team), titles: cb?.titles ?? 0,
        secondLabel: "Final Four", secondVal: cb?.final4 ?? 0,
        seasons: cb?.seasons ?? 0, pct: cb?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "", conference: cb?.conference ?? "", hasStats: !!cb,
      };
    });
  const otherCollegeCards = [...fcsFootballCards, ...otherCbbCards]
    .sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));''',
)

# 2) Other College (plain team cards) excludes ALL D-I men's hoops now
sub(
'    (t) => isCollege(t) && !isFbsFootball(t) && !(isDiMensHoops(t) && hoopsQualifies(t)) && !(t.sport === "American Football" && t.league === "FCS")',
'    (t) => isCollege(t) && !isFbsFootball(t) && !isDiMensHoops(t) && !(t.sport === "American Football" && t.league === "FCS")',
)

# 3) Render + counts + visibility use the combined otherCollegeCards
sub('{(fcsFootballCards.length > 0 || otherCollege.length > 0) && (',
    '{(otherCollegeCards.length > 0 || otherCollege.length > 0) && (')
sub('{fcsFootballCards.length + otherCollege.length} team{fcsFootballCards.length + otherCollege.length !== 1 ? "s" : ""}',
    '{otherCollegeCards.length + otherCollege.length} team{otherCollegeCards.length + otherCollege.length !== 1 ? "s" : ""}')
sub('                  {fcsFootballCards.map(renderCollegeCard)}',
    '                  {otherCollegeCards.map(renderCollegeCard)}')

# 4) Other Teams wrapper visibility
sub('|| fcsFootballCards.length > 0 || otherMen.length > 0',
    '|| otherCollegeCards.length > 0 || otherMen.length > 0')

io.open(P, "w", encoding="utf-8").write(c)
print("OK non-qualifying D-I men's hoops now render as college cards in Other College Teams")
