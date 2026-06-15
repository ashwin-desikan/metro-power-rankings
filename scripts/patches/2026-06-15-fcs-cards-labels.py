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

# 1) MajorCollegeCard type: add division + conference
sub(
'    seasons: number; pct: number; isTop: boolean;\n  };',
'    seasons: number; pct: number; isTop: boolean; division: string; conference: string;\n  };',
)

# 2) FBS card builder: division + conference
sub(
'''        mono: cfbMonogram(cf?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
      };''',
'''        mono: cfbMonogram(cf?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "FBS", conference: cf?.conference ?? "",
      };''',
)

# 3) basketball card builder: division + conference
sub(
'''        mono: cbbMonogram(cb.name), titles: cb.titles,
        secondLabel: "Final Four", secondVal: cb.final4,
        seasons: cb.seasons, pct: cb.pct,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
      };''',
'''        mono: cbbMonogram(cb.name), titles: cb.titles,
        secondLabel: "Final Four", secondVal: cb.final4,
        seasons: cb.seasons, pct: cb.pct,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "", conference: cb.conference ?? "",
      };''',
)

# 4) exclude FCS football from Other College (it gets its own custom cards)
sub(
'''  const otherCollege = otherTeamsRaw.filter(
    (t) => isCollege(t) && !isFbsFootball(t) && !(isDiMensHoops(t) && hoopsQualifies(t))
  );''',
'''  const otherCollege = otherTeamsRaw.filter(
    (t) => isCollege(t) && !isFbsFootball(t) && !(isDiMensHoops(t) && hoopsQualifies(t)) && !(t.sport === "American Football" && t.league === "FCS")
  );''',
)

# 5) label: College Football (FBS/FCS) + conference; basketball + conference
sub(
'{m.sport === "football" ? "College Football" : "College Basketball"}',
'{m.sport === "football" ? `College Football${m.division ? ` (${m.division})` : ""}` : "College Basketball"}{m.conference ? ` (${m.conference})` : ""}',
)

# 6) FCS football custom-card list (rendered in Other College Teams)
sub(
'  const restCollegeCards = majorCollegeCards.filter((m) => !m.isTop);',
'''  const restCollegeCards = majorCollegeCards.filter((m) => !m.isTop);
  const fcsFootballCards: MajorCollegeCard[] = otherTeamsRaw
    .filter((t) => t.sport === "American Football" && t.league === "FCS")
    .map((t): MajorCollegeCard => {
      const cf = getCfbTeamForName(t.team);
      return {
        key: "fcs-" + t.team, sport: "football", name: cf?.name ?? t.team,
        href: cf ? `/teams/cfb/${cf.slug}` : null, color: cf?.color || "#444",
        mono: cfbMonogram(cf?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "FCS", conference: cf?.conference ?? "",
      };
    })
    .sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));''',
)

# 7) render: Other College Teams shows FCS custom cards + the rest as TeamCards
sub(
'            {otherCollege.length > 0 && collapsible("Other College Teams", otherCollege)}',
'''            {(fcsFootballCards.length > 0 || otherCollege.length > 0) && (
              <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
                  <span className="font-semibold text-[var(--text)]">Other College Teams</span>
                  <span className="text-sm text-[var(--text-muted)]">{fcsFootballCards.length + otherCollege.length} team{fcsFootballCards.length + otherCollege.length !== 1 ? "s" : ""}</span>
                </summary>
                <div className={`border-t border-[var(--border)] px-4 py-3 ${gridClass}`}>
                  {fcsFootballCards.map(renderCollegeCard)}
                  {otherCollege.map((team, idx) => (
                    <TeamCard key={"oc" + idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} />
                  ))}
                </div>
              </details>
            )}''',
)

# 8) Other Teams wrapper visibility includes FCS cards
sub(
'      {(otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0',
'      {(otherFootball.length > 0 || otherCollege.length > 0 || fcsFootballCards.length > 0 || otherMen.length > 0',
)

io.open(P, "w", encoding="utf-8").write(c)
print("OK FCS custom cards + unified College Football (FBS/FCS) (Conference) labels")
