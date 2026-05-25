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
  monogramFor as nflMonogramFor,
} from "./nfl";
import {
  getMlbFranchiseByTeamName,
  logoUrlFor as mlbLogoUrlFor,
  monogramFor as mlbMonogramFor,
} from "./mlb";
import {
  getNbaFranchiseByTeamName,
  logoUrlFor as nbaLogoUrlFor,
  monogramFor as nbaMonogramFor,
} from "./nba";
import {
  getNhlFranchiseByTeamName,
  logoUrlFor as nhlLogoUrlFor,
  monogramFor as nhlMonogramFor,
} from "./nhl";
import {
  getFootballClubByName,
  monogramForFootball,
} from "./football";

export type Monogram = { bg: string; fg: string; mono: string };

export type TeamLink = {
  slug: string;                    // league-internal slug
  league: "nfl" | "mlb" | "nba" | "nhl" | "football";   // discriminator for future leagues
  href: string;                    // /teams/<league>/<slug>
  logoUrl: string | null;          // /data/<league>/logos/<slug>.svg or null
  monogram: Monogram;              // colored monogram fallback when logoUrl is null
  displayName: string;             // canonical display name from the league source
};

// Sport-label and league-label values that route to each league's franchise
// table. The metro-side workbook stores both a `sport` and a `league` field;
// resolveTeamLink accepts either via the second `leagueHint` parameter so we
// can match either column when convenient.
const NFL_SPORT_LABELS = new Set(["American Football", "NFL"]);
const MLB_SPORT_LABELS = new Set(["Baseball", "MLB"]);
const NBA_SPORT_LABELS = new Set(["Basketball", "NBA"]);
const NHL_SPORT_LABELS = new Set(["Hockey", "NHL"]);
// Workbook stores football as both "Football" (Team List, /sports markers)
// and "Soccer" (FootballClub_Data merge in extract.py for metro detail).
const FOOTBALL_SPORT_LABELS = new Set(["Football", "Soccer", "Football/Soccer"]);

function isNfl(sport: string, leagueHint: string): boolean {
  return NFL_SPORT_LABELS.has(sport) || leagueHint === "NFL";
}
function isMlb(sport: string, leagueHint: string): boolean {
  return MLB_SPORT_LABELS.has(sport) || leagueHint === "MLB";
}
function isNba(sport: string, leagueHint: string): boolean {
  return NBA_SPORT_LABELS.has(sport) || leagueHint === "NBA";
}
function isNhl(sport: string, leagueHint: string): boolean {
  return NHL_SPORT_LABELS.has(sport) || leagueHint === "NHL";
}
function isFootball(sport: string): boolean {
  return FOOTBALL_SPORT_LABELS.has(sport);
}

export function resolveTeamLink(
  sport: string,
  teamName: string,
  leagueHint: string = "",
): TeamLink | null {
  if (!teamName) return null;
  const cleanName = teamName.trim();

  if (isNfl(sport, leagueHint)) {
    const f = getNflFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "nfl",
      href: `/teams/nfl/${f.slug}`,
      logoUrl: nflLogoUrlFor(f.slug),
      monogram: nflMonogramFor(f.slug),
      displayName: f.name,
    };
  }

  if (isMlb(sport, leagueHint)) {
    const f = getMlbFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "mlb",
      href: `/teams/mlb/${f.slug}`,
      logoUrl: mlbLogoUrlFor(f.slug),
      monogram: mlbMonogramFor(f.slug),
      displayName: f.display_name,
    };
  }

  if (isNba(sport, leagueHint)) {
    const f = getNbaFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "nba",
      href: `/teams/nba/${f.slug}`,
      logoUrl: nbaLogoUrlFor(f.slug),
      monogram: nbaMonogramFor(f.slug),
      displayName: f.display_name,
    };
  }

  if (isNhl(sport, leagueHint)) {
    const f = getNhlFranchiseByTeamName(cleanName);
    if (!f) return null;
    const mono = nhlMonogramFor(f.slug);
    if (!mono) return null;
    return {
      slug: f.slug,
      league: "nhl",
      href: `/teams/nhl/${f.slug}`,
      logoUrl: nhlLogoUrlFor(f.slug),
      monogram: mono,
      displayName: f.display_name,
    };
  }

  if (isFootball(sport)) {
    const f = getFootballClubByName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "football",
      href: `/teams/football/${f.slug}`,
      logoUrl: null,
      monogram: monogramForFootball(f.cur_name),
      displayName: f.cur_name,
    };
  }

  return null;
}

// Best-effort resolver for the co-equal case where TopTeams stores two
// names joined with " / " (e.g. "Arsenal / Chelsea