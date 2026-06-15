# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REL = "app/rankings/[slug]/page.tsx"
P = os.path.join(ROOT, REL)
c = io.open(P, "r", encoding="utf-8").read()

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:75]))
    c = c.replace(old, new)

FB = "\U0001F3C8"
BB = "\U0001F3C0"

# 1) bucketing: promote tournament-pedigree D-I hoops, shrink Other College
sub(
'''  const otherFbs = otherTeamsRaw.filter((t) => isFbsFootball(t));
  const otherCollege = otherTeamsRaw.filter((t) => isCollege(t) && !isFbsFootball(t));''',
'''  const otherFbs = otherTeamsRaw.filter((t) => isFbsFootball(t));
  // D-I men's basketball programs with at least one Sweet 16, Elite Eight, or
  // Final Four are promoted into "Major College Teams" alongside FBS football;
  // the rest stay in "Other College Teams". The same gate is intended for
  // women's college basketball once that data is added.
  const cbbCardCache = new Map<string, CbbTeam | null>();
  const cbbForName = (n: string): CbbTeam | null => {
    if (!cbbCardCache.has(n)) cbbCardCache.set(n, getCbbTeamForName(n));
    return cbbCardCache.get(n) ?? null;
  };
  const isDiMensHoops = (t: { sport: string; league: string }) =>
    t.sport === "Basketball" && t.league === "NCAA";
  const hoopsQualifies = (t: { team: string }) => {
    const cc = cbbForName(t.team);
    return !!cc && (cc.sweet16 > 0 || cc.elite8 > 0 || cc.final4 > 0);
  };
  const majorCollegeHoops = otherTeamsRaw.filter((t) => isDiMensHoops(t) && hoopsQualifies(t));
  const otherCollege = otherTeamsRaw.filter(
    (t) => isCollege(t) && !isFbsFootball(t) && !(isDiMensHoops(t) && hoopsQualifies(t))
  );''',
)

# 2) merged Major College Teams card list, inserted before gridClass
sub(
'  const gridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";',
'''  type MajorCollegeCard = {
    key: string; sport: "football" | "basketball"; name: string; href: string | null;
    color: string; mono: string; titles: number; secondLabel: string; secondVal: number;
    seasons: number; pct: number; isTop: boolean;
  };
  const majorCollegeCards: MajorCollegeCard[] = [
    ...otherFbs.map((t): MajorCollegeCard => {
      const cf = getCfbTeamForName(t.team);
      return {
        key: "f-" + t.team, sport: "football", name: cf?.name ?? t.team,
        href: cf ? `/teams/cfb/${cf.slug}` : null, color: cf?.color || "#444",
        mono: cfbMonogram(cf?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
      };
    }),
    ...majorCollegeHoops.map((t): MajorCollegeCard => {
      const cb = cbbForName(t.team)!;
      return {
        key: "b-" + t.team, sport: "basketball", name: cb.name,
        href: `/teams/cbb/${cb.slug}`, color: cb.color || "#444",
        mono: cbbMonogram(cb.name), titles: cb.titles,
        secondLabel: "Final Four", secondVal: cb.final4,
        seasons: cb.seasons, pct: cb.pct,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
      };
    }),
  ].sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));

  const gridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";''',
)

io.open(P, "w", encoding="utf-8").write(c)
print("PART2a ok (bucketing + card list)")
