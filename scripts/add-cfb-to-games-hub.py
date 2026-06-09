#!/usr/bin/env python3
"""
Add a College Football section to the Deep Dives Greatest Games hub
(/sports/games), reusing the CFB games component. Run from the repo root AFTER
add-cfb-frontend.py (needs app/teams/cfb/CfbGames + lib/cfb):

    python scripts/add-cfb-to-games-hub.py

Idempotent; backs up app/sports/games/page.tsx to *.cfbgames.bak. Nothing committed.
"""
import os, sys, shutil

P = os.path.join("app", "sports", "games", "page.tsx")
EDITS = [
    ("import",
     'import type { GameVideo } from "@/app/teams/_shared/GameVideo";',
     'import type { GameVideo } from "@/app/teams/_shared/GameVideo";\nimport { getCfbTopGames, getCfbGamesByDecade, getAllCfbSlugs } from "@/lib/cfb";\nimport CfbGames from "@/app/teams/cfb/CfbGames";'),
    ("data",
     'const nhlCards = FEATURED.filter((g) => g.leagueTag === "NHL");',
     'const nhlCards = FEATURED.filter((g) => g.leagueTag === "NHL");\n  const cfbTop = getCfbTopGames();\n  const cfbByDecade = getCfbGamesByDecade();\n  const cfbSlugs = getAllCfbSlugs();'),
    ("hubnav",
     '          { label: "NHL", href: "#nhl" },',
     '          { label: "NHL", href: "#nhl" },\n          { label: "College Football", href: "#cfb" },'),
    ("section",
     '      {/* What\'s next */}',
     '''      {/* College Football */}
      <section id="cfb" className="mb-12 scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">College Football</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">The greatest games in college football history, ranked by Game Score, with the bowl, stage and rivalry of each. Filter to a decade.</p>
          </div>
          <a href="/teams/cfb#games" className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap">Full College Football hub &rarr;</a>
        </div>
        <CfbGames topOverall={cfbTop} byDecade={cfbByDecade} linkSlugs={cfbSlugs} />
      </section>

      {/* What\'s next */}'''),
    ("nextbullet",
     'Football, College Football and Men&apos;s College Basketball are next',
     'Football and Men&apos;s College Basketball are next'),
]

def main():
    if not os.path.isfile(P): print("ABORTED: " + P + " not found."); sys.exit(1)
    src = open(P, encoding="utf-8").read()
    if "getCfbTopGames" in src: print("  skip    " + P + " (already added)"); return
    for label, old, new in EDITS:
        if old not in src: print("ABORTED: anchor not found: " + label + ". Send me the current file."); sys.exit(1)
        src = src.replace(old, new, 1)
    shutil.copyfile(P, P + ".cfbgames.bak")
    open(P, "w", encoding="utf-8", newline="\n").write(src)
    print("  patched " + P + " (College Football section added)")
    print(); print("Done. TS check, then preview /sports/games#cfb.")

if __name__ == "__main__": main()
