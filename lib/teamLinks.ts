import "server-only";
// Generic resolver from (sport, team name) -> a deep link plus optional
// SVG logo URL. Used by /top-teams (and future cross-sport summary pages)
// so a single TOP_TEAMS sheet can power links into the per-league team
// pages as new leagues come online.
//
// Adding a league:
//   1. Add a `getXxxFranchiseByTeamName(name)` + `logoUrlFor(slug)` pair
//      in lib/<league>.ts, mirroring lib/nfl.ts.
//   2. Add a case branch below that maps the league's sport label(s) to
//      that pair and to the /teams/<league>/<slug> URL shape.
//   3. The Top Teams sheet doesn't need to change — it already carries a
//      `sport` column whose value drives the routing.
//
// This file is server-only because it transitively imports lib/nfl, which
// reads from disk at module load. The `import "server-only"` directive
// gives a clear, early error if a client component ever tries to pull it
// in. The pre-push check at scripts/check-client-imports.mjs also lists
// @/lib/teamLinks as a server-only module.

import {
  getNflFranchiseByTeamName,
  logoUrlFor as nflLogoUrlFor,
} from "./nfl";

export type TeamLink = {
  slug: string;        // league-internal slug, e.g. "pittsburgh-steelers"
  league: "nfl";       // discriminator for future leagues
  href: string;        // /teams/<league>/<slug>
  logoUrl: string | null; // /data/<league>/logos/<slug>.svg or null
  displayName: string; // canonical display name from the league source
};

// Sport-label values that route to the NFL franchise table.
const NFL_SPORT_LABELS = new Set(["American Football", "NFL"]);

export function resolveTeamLink(sport: string, teamName: string): TeamLink | null {
  if (!teamName) return null;
  const cleanName = teamName.trim();

  if (NFL_SPORT_LABELS.has(sport)) {
    const f = getNflFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "nfl",
      href: `/teams/nfl/${f.slug}`,
      logoUrl: nflLogoUrlFor(f.slug),
      displayName: f.name,
    };
  }

  // Future leagues drop in here.
  // if (NBA_SPORT_LABELS.has(sport)) { ... }
  // if (MLB_SPORT_LABELS.has(sport)) { ... }
  // if (NHL_SPORT_LABELS.has(sport)) { ... }

  return null;
}

// Best-effort resolver for the co-equal case where TopTeams stores two
// names joined with " / " (e.g. "Arsenal / Chelsea"). Returns one link
// per name that resolves; names with no match are dropped. Currently
// useful only when both halves point to the same league; for soccer
// today this returns nothing because no soccer resolver is wired in.
export function resolveTeamLinksFromString(
  sport: string,
  teamString: string,
): TeamLink[] {
  if (!teamString) return [];
  const parts = teamString.split("/").map((p) => p.trim()).filter(Boolean);
  const out: TeamLink[] = [];
  for (const p of parts) {
    const link = resolveTeamLink(sport, p);
    if (link) out.push(link);
  }
  return out;
}
