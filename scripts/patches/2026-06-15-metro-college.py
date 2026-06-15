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

FB = "\U0001F3C8"  # american football
BB = "\U0001F3C0"  # basketball

# 1) imports
sub(
    'import { getFormerMajorCbbForMetro, type FormerCbbCard } from "@/lib/cbb";',
    'import { getFormerMajorCbbForMetro, getCbbTeamForName, cbbMonogram, type FormerCbbCard, type CbbTeam } from "@/lib/cbb";',
)

# 2) sport-aware top-team matcher
sub(
'''  const isTopTeamFn = (teamName: string): boolean =>
    topTeamNames.some((tn) => {
      const t = teamName.toLowerCase();
      return tn === t || t.endsWith(" " + tn) || tn.endsWith(" " + t);
    });''',
'''  const topPickSport = (topTeamPick?.sport ?? "").trim();
  const topPickIsCollege = /\\(NCAA/.test(topPickSport);
  const baseSportKey = (s: string) =>
    s.toLowerCase().replace(/\\(ncaa[^)]*\\)/g, "").replace(/[^a-z]/g, "")
      .replace("soccer", "football").replace("icehockey", "hockey");
  const topPickSportKey = baseSportKey(topPickSport);
  const TOP_COLLEGE_LEAGUES = new Set(["FBS", "FCS", "NCAA", "NCAA W", "College Hockey"]);
  // Match by name, then (when sport context exists) require the card's sport to
  // match the Top Team pick's sport so e.g. Texas football is the Top Team in
  // Austin without also flagging Texas basketball/baseball.
  const isTopTeamFn = (teamName: string, teamSport?: string, teamLeague?: string): boolean => {
    const nameHit = topTeamNames.some((tn) => {
      const t = teamName.toLowerCase();
      return tn === t || t.endsWith(" " + tn) || tn.endsWith(" " + t);
    });
    if (!nameHit) return false;
    if (!topPickSport || teamSport === undefined) return true;
    if (baseSportKey(teamSport) !== topPickSportKey) return false;
    const teamIsCollege = teamLeague !== undefined && TOP_COLLEGE_LEAGUES.has(teamLeague);
    return topPickIsCollege ? teamIsCollege : !teamIsCollege;
  };''',
)

# call sites
sub('if (isTopTeamFn(t.team)) return 0;', 'if (isTopTeamFn(t.team, t.sport, t.league)) return 0;')
sub('<TeamCard key={idx} team={team} isTopTeam={isTopTeamFn(team.team)} />',
    '<TeamCard key={idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} />', n=2)

io.open(P, "w", encoding="utf-8").write(c)
print("PART1 ok (import + top-team matcher)")
