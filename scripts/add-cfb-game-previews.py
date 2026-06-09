#!/usr/bin/env python3
r"""
Greatest Games page (/sports/games): add the three College Football clips as
embedded video previews, matching the NFL/NBA/MLB "Featured games" cards.

Run from the repo root:
    python scripts/add-cfb-game-previews.py
Backs up edited files to *.cfbprev.bak. Idempotent.
"""
import os, shutil

FEATURED_TS = os.path.join("app", "sports", "games", "featured.ts")
GAMES_PAGE = os.path.join("app", "sports", "games", "page.tsx")

FEATURED_EDIT = (
    '    clipLabel: "Official - NHL",\n'
    '  },\n'
    '];',
    '    clipLabel: "Official - NHL",\n'
    '  },\n'
    '  // College Football (clips supplied for the top Game Score entries)\n'
    '  {\n'
    '    leagueTag: "CFB",\n'
    '    videoId: "WitAjwWY6EQ",\n'
    '    title: "2006 Rose Bowl",\n'
    '    matchup: "Texas 41-38 USC",\n'
    '    note: "Vince Young runs in the title on fourth down.",\n'
    '    clipLabel: "Game video",\n'
    '    rank: 1,\n'
    '  },\n'
    '  {\n'
    '    leagueTag: "CFB",\n'
    '    videoId: "TvSXwaNCJKs",\n'
    '    title: "2003 Fiesta Bowl",\n'
    '    matchup: "Ohio State 31-24 (2OT) Miami (FL)",\n'
    '    note: "A double-overtime upset ends the Hurricanes\' reign.",\n'
    '    clipLabel: "Game video",\n'
    '    rank: 2,\n'
    '  },\n'
    '  {\n'
    '    leagueTag: "CFB",\n'
    '    videoId: "saOJL6m70G0",\n'
    '    title: "1987 Fiesta Bowl",\n'
    '    matchup: "Penn State 14-10 Miami (FL)",\n'
    '    note: "A goal-line stand seals the national championship.",\n'
    '    clipLabel: "Game video",\n'
    '    rank: 6,\n'
    '  },\n'
    '];',
)

PAGE_EDIT_CONST = (
    '  const cfbSlugs = getAllCfbSlugs();',
    '  const cfbSlugs = getAllCfbSlugs();\n'
    '  const cfbCards = FEATURED.filter((g) => g.leagueTag === "CFB").sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));',
)

PAGE_EDIT_RENDER = (
    '        <CfbGames topOverall={cfbTop} byDecade={cfbByDecade} linkSlugs={cfbSlugs} />',
    '        <FeaturedClips games={cfbCards} />\n'
    '        <CfbGames topOverall={cfbTop} byDecade={cfbByDecade} linkSlugs={cfbSlugs} />',
)

def apply(path, edits):
    s = open(path, encoding="utf-8").read()
    for old, new in edits:
        if new.split("\n")[0] in s and old not in s:
            # crude idempotency: assume already applied
            pass
        n = s.count(old)
        if n != 1:
            print("ABORTED in %s: anchor matched %d times (expected 1):\n---\n%s\n---" % (path, n, old[:120]))
            raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(path, path + ".cfbprev.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + path)

def main():
    if not os.path.isfile(GAMES_PAGE):
        print("ABORTED: run from repo root."); raise SystemExit(1)
    if 'leagueTag: "CFB"' in open(FEATURED_TS, encoding="utf-8").read():
        print("Already patched; nothing to do."); return
    apply(FEATURED_TS, [FEATURED_EDIT])
    apply(GAMES_PAGE, [PAGE_EDIT_CONST, PAGE_EDIT_RENDER])
    print("Done. rm -rf .next, restart npm run dev; open /sports/games#cfb.")

if __name__ == "__main__":
    main()
