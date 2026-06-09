#!/usr/bin/env python3
"""
Link College Football picks on /top-teams to their /teams/cfb/[slug] pages.
Adds a CFB branch to lib/teamLinks.ts (resolveTeamLink). Run from repo root
AFTER add-cfb-frontend.py (needs getCfbTeamForName in lib/cfb):

    python scripts/add-cfb-top-teams-link.py

Idempotent; backs up lib/teamLinks.ts to *.cfb.bak. Nothing committed.
"""
import os, sys, shutil
P = os.path.join("lib", "teamLinks.ts")
EDITS = [
    ("import", '} from "./nrl";', '} from "./nrl";\nimport { getCfbTeamForName, cfbMonogram } from "./cfb";'),
    ("union",
     '  league: "nfl" | "mlb" | "nba" | "nhl" | "football" | "ipl" | "wfootball" | "wnba" | "cfl" | "afl" | "nrl";   // discriminator for future leagues',
     '  league: "nfl" | "mlb" | "nba" | "nhl" | "football" | "ipl" | "wfootball" | "wnba" | "cfl" | "afl" | "nrl" | "cfb";   // discriminator for future leagues'),
    ("isCfb",
     '''function isNrl(sport: string, leagueHint: string): boolean {
  return NRL_SPORT_LABELS.has(sport) || leagueHint === "NRL";
}''',
     '''function isNrl(sport: string, leagueHint: string): boolean {
  return NRL_SPORT_LABELS.has(sport) || leagueHint === "NRL";
}
const CFB_SPORT_LABELS = new Set(["American Football (NCAA)", "College Football", "CFB"]);
function isCfb(sport: string, leagueHint: string): boolean {
  return CFB_SPORT_LABELS.has(sport) || leagueHint === "CFB" || leagueHint === "FBS";
}'''),
    ("branch",
     '''      monogram: nrlMonogramFor(f),
      displayName: f.name,
    };
  }

  return null;''',
     '''      monogram: nrlMonogramFor(f),
      displayName: f.name,
    };
  }

  if (isCfb(sport, leagueHint)) {
    const f = getCfbTeamForName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "cfb",
      href: `/teams/cfb/${f.slug}`,
      logoUrl: null,
      monogram: { bg: f.color, fg: "#ffffff", mono: cfbMonogram(f.name) },
      displayName: f.name,
    };
  }

  return null;'''),
]
def main():
    if not os.path.isfile(P): print("ABORTED: " + P + " not found."); sys.exit(1)
    s = open(P, encoding="utf-8").read()
    if 'isCfb(' in s: print("  skip    " + P + " (already linked)"); return
    for label, old, new in EDITS:
        if old not in s: print("ABORTED: anchor not found: " + label + ". Send me the current file."); sys.exit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(P, P + ".cfb.bak")
    open(P, "w", encoding="utf-8", newline="\n").write(s)
    print("  patched " + P + " (CFB resolver added)")
    print(); print("Done. TS check, then preview /top-teams - college picks now link to /teams/cfb/[slug].")
if __name__ == "__main__": main()
