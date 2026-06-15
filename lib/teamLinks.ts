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
// IMPORTANT (standard protocol): when you ship ANY new league/group of teams
// that has its own /teams/<league>/<slug> pages, wire it in HERE too, or its
// Top Team picks render as plain text on /top-teams (and any future cross-sport
// summary). If the new league shares a generic sport label with an existing one
// (e.g. NPB and MLB both use "Baseball"), add it as a FALLBACK inside that
// branch: try the existing league first, then the new one, then return null.
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
import {
  getIplFranchiseByTeamName,
  monogramFor as iplMonogramFor,
} from "./ipl";
import {
  getWClubByName,
  wMonogram,
} from "./wfootball";
import {
  getWnbaFranchiseByTeamName,
} from "./wnba";
import {
  getCflFranchiseByTeamName,
  monogramFor as cflMonogramFor,
} from "./cfl";
import {
  getAflFranchiseByTeamName,
  aflMonogramFor,
} from "./afl";
import {
  getNrlFranchiseByTeamName,
  nrlMonogramFor,
} from "./nrl";
import { getCfbTeamForName, cfbMonogram } from "./cfb";
import { getCbbTeamForName } from "./cbb";
import { cbbMonogram } from "./cbbShared";
import { getNpbTeamByName } from "./npb";

export type Monogram = { bg: string; fg: string; mono: string };

export type TeamLink = {
  slug: string;                    // league-internal slug
  league: "nfl" | "mlb" | "nba" | "nhl" | "football" | "ipl" | "wfootball" | "wnba" | "cfl" | "afl" | "nrl" | "cfb" | "npb" | "cbb";   // discriminator for future leagues
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
const IPL_SPORT_LABELS = new Set(["T20 Cricket", "Cricket", "IPL"]);
// Women's club football markers carry the distinct "W Football" sport label.
const W_FOOTBALL_SPORT_LABELS = new Set(["W Football"]);
const W_BASKETBALL_SPORT_LABELS = new Set(["W Basketball", "WNBA"]);
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
function isIpl(sport: string, leagueHint: string): boolean {
  return IPL_SPORT_LABELS.has(sport) || leagueHint === "IPL";
}
function isWFootball(sport: string, leagueHint: string): boolean {
  return W_FOOTBALL_SPORT_LABELS.has(sport) || leagueHint === "W Football";
}
function isWnba(sport: string, leagueHint: string): boolean {
  return W_BASKETBALL_SPORT_LABELS.has(sport) || leagueHint === "WNBA";
}
function isCfl(sport: string, leagueHint: string): boolean {
  return sport === "Canadian Football" || leagueHint === "CFL";
}
const AFL_SPORT_LABELS = new Set(["Aussie Rules", "Australian Rules", "AFL"]);
const NRL_SPORT_LABELS = new Set(["Rugby League", "NRL"]);
function isAfl(sport: string, leagueHint: string): boolean {
  return AFL_SPORT_LABELS.has(sport) || leagueHint === "AFL";
}
function isNrl(sport: string, leagueHint: string): boolean {
  return NRL_SPORT_LABELS.has(sport) || leagueHint === "NRL";
}
const CFB_SPORT_LABELS = new Set(["American Football (NCAA)", "College Football", "CFB"]);
function isCfb(sport: string, leagueHint: string): boolean {
  return CFB_SPORT_LABELS.has(sport) || leagueHint === "CFB" || leagueHint === "FBS";
}

// Men's college basketball is tagged sport "Basketball" + league "NCAA" in
// the metro Team List (women's college is "NCAA W"; the NBA is "NBA"). The
// NBA matcher keys on the bare "Basketball" sport, so isCbb must be
// league-gated and checked before the NBA branch in resolveTeamLink.
const CBB_LEAGUE_LABELS = new Set(["NCAA", "NCAAM", "CBB"]);
function isCbb(sport: string, leagueHint: string): boolean {
  return (sport === "Basketball" || sport === "College Basketball") && CBB_LEAGUE_LABELS.has(leagueHint);
}

// Initials monogram fallback for leagues without a logo/color source (NPB).
function npbMonogram(name: string): Monogram {
  const mono = name.split(/\s+/).map((w) => w[0]).filter(Boolean).join("").slice(0, 3).toUpperCase();
  return { bg: "#1f2937", fg: "#ffffff", mono: mono || "NPB" };
}

export function resolveTeamLink(
  sport: string,
  teamName: string,
  leagueHint: string = "",
): TeamLink | null {
  if (!teamName) return null;
  const cleanName = teamName.trim();

  // College basketball is checked before the NBA, which matches the bare
  // "Basketball" sport label, so NCAA men's teams route to their -ncaam pages.
  if (isCbb(sport, leagueHint)) {
    const f = getCbbTeamForName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "cbb",
      href: `/teams/cbb/${f.slug}`,
      logoUrl: null,
      monogram: { bg: f.color || "#444", fg: "#ffffff", mono: cbbMonogram(f.name) },
      displayName: f.name,
    };
  }

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
    if (f) {
      return {
        slug: f.slug,
        league: "mlb",
        href: `/teams/mlb/${f.slug}`,
        logoUrl: mlbLogoUrlFor(f.slug),
        monogram: mlbMonogramFor(f.slug),
        displayName: f.display_name,
      };
    }
    // Japanese clubs share the "Baseball" sport label but live in the NPB
    // portal (/teams/baseball/npb), so fall back to NPB before giving up.
    const n = getNpbTeamByName(cleanName);
    if (n) {
      return {
        slug: n.slug,
        league: "npb",
        href: `/teams/baseball/npb/${n.slug}`,
        logoUrl: null,
        monogram: npbMonogram(n.name),
        displayName: n.name,
      };
    }
    return null;
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
      monogram: monogramForFootball(f.cur_name, f.slug),
      displayName: f.cur_name,
    };
  }

  if (isIpl(sport, leagueHint)) {
    const f = getIplFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "ipl",
      href: `/teams/ipl/${f.slug}`,
      logoUrl: null,
      monogram: iplMonogramFor(f),
      displayName: f.name,
    };
  }

  if (isWFootball(sport, leagueHint)) {
    const c = getWClubByName(cleanName);
    if (!c) return null;
    return {
      slug: c.slug,
      league: "wfootball",
      href: `/teams/wfootball/clubs/${c.slug}`,
      logoUrl: null,
      monogram: wMonogram(c),
      displayName: c.name,
    };
  }

  if (isWnba(sport, leagueHint)) {
    const f = getWnbaFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "wnba",
      href: `/teams/wnba/${f.slug}`,
      logoUrl: null,
      monogram: { bg: f.color, fg: "#FFFFFF", mono: f.abbr },
      displayName: f.name,
    };
  }

  if (isCfl(sport, leagueHint)) {
    const f = getCflFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "cfl",
      href: `/teams/cfl/${f.slug}`,
      logoUrl: null,
      monogram: cflMonogramFor(f),
      displayName: f.name,
    };
  }

  if (isAfl(sport, leagueHint)) {
    const f = getAflFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "afl",
      href: `/teams/afl/${f.slug}`,
      logoUrl: null,
      monogram: aflMonogramFor(f),
      displayName: f.name,
    };
  }

  if (isNrl(sport, leagueHint)) {
    const f = getNrlFranchiseByTeamName(cleanName);
    if (!f) return null;
    return {
      slug: f.slug,
      league: "nrl",
      href: `/teams/nrl/${f.slug}`,
      logoUrl: null,
      monogram: nrlMonogramFor(f),
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

  return null;
}

// Best-effort resolver for the co-equal case where TopTeams stores two
// names joined with " / " (e.g. "Arsenal / Chelsea