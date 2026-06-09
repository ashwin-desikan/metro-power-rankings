#!/usr/bin/env python3
r"""
Metro pages: College Football (FBS) cards above Football/Soccer, with enriched
team cards (football icon, team-colors circle, # Natl Champs, # Conf Champs,
# Major Seasons). Once-major FCS schools get the same enriched card but stay in
College/University Teams.

Run from the repo root:
    python scripts/add-cfb-metro-cards.py
Backs up app/rankings/[slug]/page.tsx to *.cfbcards.bak. Idempotent.
"""
import os, sys, shutil

PAGE = os.path.join("app", "rankings", "[slug]", "page.tsx")

EDITS = [
    # 1. import CFB getter + TeamLink type
    (
        'import { resolveTeamLink } from "@/lib/teamLinks";',
        'import { resolveTeamLink, type TeamLink } from "@/lib/teamLinks";\n'
        'import { getCfbTeamForName, cfbMonogram } from "@/lib/cfb";',
    ),
    # 2. bucketing: split FBS out of college
    (
        '  const otherTeamsRaw = nonHistoricForBucketing.filter((t) => !t.major);\n'
        '  const otherCollege = otherTeamsRaw.filter((t) => isCollege(t));',
        '  const otherTeamsRaw = nonHistoricForBucketing.filter((t) => !t.major);\n'
        '  // College Football (FBS) is lifted into its own group above Football/Soccer.\n'
        '  // Everything else college (FCS, basketball, hockey, ...) stays in College/University.\n'
        '  const isFbsFootball = (t: { sport: string; league: string }) =>\n'
        '    t.sport === "American Football" && t.league === "FBS";\n'
        '  const otherFbs = otherTeamsRaw.filter((t) => isFbsFootball(t));\n'
        '  const otherCollege = otherTeamsRaw.filter((t) => isCollege(t) && !isFbsFootball(t));',
    ),
    # 3. render guard: include otherFbs
    (
        '      {(otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0 || otherWomen.length > 0 || relocations.length > 0) && (',
        '      {(otherFbs.length > 0 || otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0 || otherWomen.length > 0 || relocations.length > 0) && (',
    ),
    # 4. render FBS group above Football/Soccer
    (
        '            {otherFootball.length > 0 && collapsible("Football/Soccer Teams", otherFootball)}\n'
        '            {otherCollege.length > 0 && collapsible("College/University Teams", otherCollege)}',
        '            {otherFbs.length > 0 && collapsible("College Football (FBS)", otherFbs)}\n'
        '            {otherFootball.length > 0 && collapsible("Football/Soccer Teams", otherFootball)}\n'
        '            {otherCollege.length > 0 && collapsible("College/University Teams", otherCollege)}',
    ),
    # 5. TeamCard: resolve CFB team + build colored link
    (
        '  const link = resolveTeamLink(team.sport, team.team, team.league);',
        '  // College Football (FBS now, or once-major FCS) resolves to the CFB hub with a\n'
        '  // team-colored monogram. resolveTeamLink returns null for these (its NFL branch\n'
        '  // short-circuits on sport "American Football"), so the link is built here.\n'
        '  const cfbTeam =\n'
        '    team.sport === "American Football" && (team.league === "FBS" || team.league === "FCS")\n'
        '      ? getCfbTeamForName(team.team)\n'
        '      : undefined;\n'
        '  const link: TeamLink | null = cfbTeam\n'
        '    ? {\n'
        '        slug: cfbTeam.slug,\n'
        '        league: "cfb",\n'
        '        href: `/teams/cfb/${cfbTeam.slug}`,\n'
        '        logoUrl: null,\n'
        '        monogram: { bg: cfbTeam.color || "#444", fg: "#ffffff", mono: cfbMonogram(cfbTeam.name) },\n'
        '        displayName: cfbTeam.name,\n'
        '      }\n'
        '    : resolveTeamLink(team.sport, team.team, team.league);',
    ),
    # 6. meta line: football icon for CFB
    (
        '      <p className="text-xs text-[var(--text-muted)] mb-1">\n'
        '        {normalizeTeamSport(team.sport)}',
        '      <p className="text-xs text-[var(--text-muted)] mb-1">\n'
        '        {cfbTeam && <span aria-hidden className="mr-1">\U0001F3C8</span>}\n'
        '        {normalizeTeamSport(team.sport)}',
    ),
    # 7. CFB stat chips, appended after the women's-football block
    (
        '        return null;\n'
        '      })()}\n'
        '    </div>\n'
        '  );\n'
        '}',
        '        return null;\n'
        '      })()}\n'
        '      {cfbTeam && (\n'
        '        <div className="flex gap-1.5 mt-2 flex-wrap">\n'
        '          <span\n'
        '            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"\n'
        '            style={{ background: cfbTeam.nat_champ_count > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: cfbTeam.nat_champ_count > 0 ? "#d4af37" : "var(--text-dim)" }}\n'
        '            title="National championships"\n'
        '          >\n'
        '            {cfbTeam.nat_champ_count === 0 ? "No titles" : `${cfbTeam.nat_champ_count} Natl Champ${cfbTeam.nat_champ_count === 1 ? "" : "s"}`}\n'
        '          </span>\n'
        '          {cfbTeam.maj_conf_champ > 0 && (\n'
        '            <span\n'
        '              className="text-[10px] px-1.5 py-0.5 rounded"\n'
        '              style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }}\n'
        '              title="Conference championships"\n'
        '            >\n'
        '              {cfbTeam.maj_conf_champ} Conf\n'
        '            </span>\n'
        '          )}\n'
        '          <span\n'
        '            className="text-[10px] px-1.5 py-0.5 rounded"\n'
        '            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}\n'
        '            title="Major (top-division) seasons"\n'
        '          >\n'
        '            {cfbTeam.maj_seasons} maj season{cfbTeam.maj_seasons === 1 ? "" : "s"}\n'
        '          </span>\n'
        '        </div>\n'
        '      )}\n'
        '    </div>\n'
        '  );\n'
        '}',
    ),
]

def main():
    if not os.path.isfile(PAGE):
        print("ABORTED: run from repo root (missing " + PAGE + ").")
        raise SystemExit(1)
    s = open(PAGE, encoding="utf-8").read()
    if "getCfbTeamForName" in s and "College Football (FBS)" in s:
        print("Already patched; nothing to do.")
        return
    for old, new in EDITS:
        n = s.count(old)
        if n != 1:
            print("ABORTED: anchor matched %d times (expected 1):\n---\n%s\n---" % (n, old[:160]))
            raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(PAGE, PAGE + ".cfbcards.bak")
    open(PAGE, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + PAGE)
    print("Done. rm -rf .next, restart npm run dev; open any metro with FBS schools.")

if __name__ == "__main__":
    main()
