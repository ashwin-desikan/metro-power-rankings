#!/usr/bin/env python3
r"""
Surface the College Football hub in navigation:
  - Sports dropdown (desktop + mobile): a College Football item right below NFL
  - /sports League Hubs console: College Football listed in the Offseason group
    (season starts late August), promoted from the "coming soon" directory

Run from the repo root:
    python scripts/add-cfb-menu-hub.py
Backs up edited files to *.cfbnav.bak. Idempotent.
"""
import os, shutil

DESKTOP = os.path.join("app", "DesktopNav.tsx")
MOBILE = os.path.join("app", "MobileMenu.tsx")
STATUS = os.path.join("lib", "leagueStatus.tsx")
SPORTS = os.path.join("app", "sports", "page.tsx")

PLAN = {
    DESKTOP: [(
        '        <SportsNavItem href="/teams/nfl" name="NFL" sport="American Football" />',
        '        <SportsNavItem href="/teams/nfl" name="NFL" sport="American Football" />\n'
        '        <SportsNavItem href="/teams/cfb" name="College Football" sport="American Football" />',
    )],
    MOBILE: [(
        "  { href: '/teams/nfl', label: 'NFL', hint: 'All 32 active franchises; defunct franchises link from inside', group: 'Sports' },",
        "  { href: '/teams/nfl', label: 'NFL', hint: 'All 32 active franchises; defunct franchises link from inside', group: 'Sports' },\n"
        "  { href: '/teams/cfb', label: 'College Football', hint: 'FBS programs through history: national titles, conference championships, and greatest games by Game Score', group: 'Sports' },",
    )],
    STATUS: [(
        '  "/teams/nfl":        { label: "Offseason", tone: "offseason" },',
        '  "/teams/nfl":        { label: "Offseason", tone: "offseason" },\n'
        '  "/teams/cfb":        { label: "Starts late Aug", tone: "offseason" },',
    )],
    SPORTS: [
        # remove CFB from the coming-soon directory
        (
            'const INJECTED_COMING_CARDS: LeagueCard[] = [\n'
            '  {\n'
            '    league: "CFB",\n'
            '    label: "College Football",\n'
            '    sport: "American Football",\n'
            '    status: "coming",\n'
            '    page: null,\n'
            '    team_count: 0,\n'
            '  },\n'
            '  {\n'
            '    league: "CBB",',
            'const INJECTED_COMING_CARDS: LeagueCard[] = [\n'
            '  {\n'
            '    league: "CBB",',
        ),
        # add CFB as a live hub (so it enters the League Hubs console; its
        # leagueStatus tone "offseason" sorts it into the Offseason group)
        (
            '  {\n'
            '    league: "NRL",\n'
            '    label: "NRL",\n'
            '    sport: "Rugby League",\n'
            '    status: "live",\n'
            '    page: "/teams/nrl",\n'
            '    team_count: 0,\n'
            '  },\n'
            '];',
            '  {\n'
            '    league: "NRL",\n'
            '    label: "NRL",\n'
            '    sport: "Rugby League",\n'
            '    status: "live",\n'
            '    page: "/teams/nrl",\n'
            '    team_count: 0,\n'
            '  },\n'
            '  {\n'
            '    league: "CFB",\n'
            '    label: "College Football",\n'
            '    sport: "American Football",\n'
            '    status: "live",\n'
            '    page: "/teams/cfb",\n'
            '    team_count: 0,\n'
            '  },\n'
            '];',
        ),
    ],
}

def main():
    if not os.path.isfile(DESKTOP):
        print("ABORTED: run from repo root."); raise SystemExit(1)
    if '"/teams/cfb"' in open(STATUS, encoding="utf-8").read():
        print("Already patched; nothing to do."); return
    for path, edits in PLAN.items():
        s = open(path, encoding="utf-8").read()
        for old, new in edits:
            n = s.count(old)
            if n != 1:
                print("ABORTED in %s: anchor matched %d times (expected 1):\n---\n%s\n---" % (path, n, old[:120]))
                raise SystemExit(1)
            s = s.replace(old, new, 1)
        shutil.copyfile(path, path + ".cfbnav.bak")
        open(path, "w", encoding="utf-8", newline="\n").write(s)
        print("Patched " + path)
    print("Done. rm -rf .next, restart npm run dev; check the Sports menu + /sports console.")

if __name__ == "__main__":
    main()
