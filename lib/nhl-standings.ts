import "server-only";
// Live NHL standings.
//
// Mirrors lib/mlb-standings.ts. Pulls ESPN's public /hockey/nhl/standings
// endpoint with hourly ISR. The daily-rebuild.yml GH Action guarantees a
// fresh static build at least once every 24 hours.
//
// NHL has two conferences (Eastern, Western) each with two divisions
// (Atlantic + Metropolitan; Central + Pacific). This module returns
// per-team standings rows with both league (conference abbr) and
// division string attached so the widget can render four division
// mini-tables.

export type SeasonType =
  | "preseason"
  | "regular"
  | "postseason"
  | "offseason"
  | "unknown";

export type TeamStanding = {
  canonical: string;     // workbook canonical (Bruins, Oilers, ...)
  espn_team_id: string;
  abbr: string;
  display_name: string;

  wins: number;
  losses: number;
  ot_losses: number;     // OTL incl. shootout losses (workbook convention)
  points: number;
  games_played: number;
  pts_pct: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;

  regulation_wins: number | null;
  division_rank: number | null;
  conference_rank: number | null;
  playoff_seed: number | null;
  streak: string | null;

  conference: "E" | "W" | "";
  division: string;
};

export type StandingsSnapshot = {
  league: "NHL";
  season_year: number;
  season_type: SeasonType;
  fetched_at: string;
  is_preseason: boolean;
  by_canonical: Record<string, TeamStanding>;
  source_label: string;
};

// ESPN team name -> workbook canonical. Used when ESPN's `name` value
// diverges from the workbook Name column. Empty until a divergence is
// observed; current modern 32 align cleanly.
const CANONICAL_OVERRIDE: Record<string, string> = {
  "Hockey Club": "Mammoth",       // ESPN 2024-25 transitional label
};

const ESPN_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings";

const REVALIDATE_SECONDS = 3600;

export async function getCurrentNhlStandings(): Promise<StandingsSnapshot> {
  let raw: unknown = null;
  try {
    const res = await fetch(ESPN_STANDINGS_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        "User-Agent": "rankings-citizen-of-nowhere/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`espn http ${res.status}`);
    raw = await res.json();
  } catch {
    return emptySnapshot();
  }
  return shapeStandings(raw);
}

function emptySnapshot(): StandingsSnapshot {
  return {
    league: "NHL",
    season_year: 0,
    season_type: "unknown",
    fetched_at: new Date().toISOString(),
    is_preseason: true,
    by_canonical: {},
    source_label: "",
  };
}

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function shapeStandings(raw: unknown): StandingsSnapshot {
  const root = asObj(raw);
  if (!root) return emptySnapshot();

  const seasonYear = pickSeasonYear(root);
  const seasonType = pickSeasonType(root);

  const byCanonical: Record<string, TeamStanding> = {};
  const children = asArr(root.children);

  for (const childRaw of children) {
    const child = asObj(childRaw);
    if (!child) continue;

    const childAbbr = asStr(child.abbreviation).toUpperCase();
    const childName = asStr(child.name);
    const childNameLower = childName.toLowerCase();
    let conference: "E" | "W" | "" = "";
    if (childAbbr === "E" || childAbbr.startsWith("E ") || childNameLower.includes("eastern")) {
      conference = "E";
    } else if (childAbbr === "W" || childAbbr.startsWith("W ") || childNameLower.includes("western")) {
      conference = "W";
    }

    // Three shapes seen in the wild (mirrors MLB):
    //   (1) child.standings.entries flat (no division grouping)
    //   (2) child.children[].standings.entries nested by division
    //   (3) child IS the division (children flattened at top level)
    const directEntries = asArr(asObj(child.standings)?.entries);
    const nestedEntries = asArr(child.children).flatMap((divRaw) => {
      const div = asObj(divRaw);
      return div ? asArr(asObj(div.standings)?.entries).map((e) => ({
        entry: e,
        division: asStr(div.name) || asStr(div.abbreviation),
      })) : [];
    });

    const childNameLooksLikeDivision = /atlantic|metropolitan|central|pacific/i.test(childName);
    const flatDivisionDefault = childNameLooksLikeDivision ? childName : "";

    const flatEntries = directEntries.length
      ? directEntries.map((e) => ({ entry: e, division: flatDivisionDefault }))
      : nestedEntries;

    for (const { entry: entryRaw, division: divHint } of flatEntries) {
      const entry = asObj(entryRaw);
      if (!entry) continue;
      const team = asObj(entry.team) || {};
      const teamName = asStr(team.name) || asStr(team.shortDisplayName);
      if (!teamName) continue;
      const canonical = CANONICAL_OVERRIDE[teamName] || teamName;

      const stats = asArr(entry.stats);
      const findStat = (name: string) =>
        stats.map(asObj).find((s) => s && asStr(s.name) === name);
      const statNum = (name: string, fallback = 0) =>
        asNum(findStat(name)?.value, fallback);
      const statStr = (name: string) => asStr(findStat(name)?.displayValue);
      const statPresent = (name: string) => findStat(name) !== undefined;

      let division = divHint;
      if (!division) {
        const groups = asArr(team.groups);
        for (const g of groups) {
          const go = asObj(g);
          const gname = asStr(go?.name);
          if (gname && /atlantic|metropolitan|central|pacific/i.test(gname)) {
            division = gname;
            break;
          }
          const parent = asObj(go?.parent);
          const pname = asStr(parent?.name);
          if (pname && /atlantic|metropolitan|central|pacific/i.test(pname)) {
            division = pname;
            break;
          }
        }
      }
      if (!division && childNameLooksLikeDivision) division = childName;

      const wins = statNum("wins");
      const losses = statNum("losses");
      const otLosses = statNum("otLosses") || statNum("overtimeLosses");
      const points = statNum("points");
      const gp = wins + losses + otLosses;
      const gf = statNum("pointsFor") || statNum("goalsFor");
      const ga = statNum("pointsAgainst") || statNum("goalsAgainst");

      byCanonical[canonical] = {
        canonical,
        espn_team_id: asStr(team.id),
        abbr: asStr(team.abbreviation),
        display_name: asStr(team.displayName),
        wins,
        losses,
        ot_losses: otLosses,
        points,
        games_played: gp,
        pts_pct: gp > 0 ? points / (2 * gp) : 0,
        goals_for: gf,
        goals_against: ga,
        goal_diff: gf - ga,
        regulation_wins: statPresent("regulationWins") ? statNum("regulationWins") : null,
        division_rank: statPresent("divisionRank") ? statNum("divisionRank") : null,
        conference_rank: statPresent("leagueRank") ? statNum("leagueRank") : null,
        playoff_seed: statPresent("playoffSeed") ? statNum("playoffSeed") : null,
        streak: statStr("streak") || null,
        conference,
        division,
      };
    }
  }

  const allZero =
    Object.values(byCanonical).length > 0 &&
    Object.values(byCanonical).every((s) => s.games_played === 0);

  const isPreseason =
    seasonType === "preseason" ||
    (seasonType !== "regular" && seasonType !== "postseason" && allZero);

  return {
    league: "NHL",
    season_year: seasonYear,
    season_type: seasonType,
    fetched_at: new Date().toISOString(),
    is_preseason: isPreseason,
    by_canonical: byCanonical,
    source_label: buildLabel(seasonYear, seasonType, allZero),
  };
}

function buildLabel(year: number, type: SeasonType, allZero: boolean): string {
  if (!year) return "";
  switch (type) {
    case "regular": return `${year} Regular Season`;
    case "postseason": return `${year} Postseason`;
    case "preseason": return `${year} Preseason`;
    case "offseason": return `Final ${year}`;
    default: return allZero ? `${year} Season (opens soon)` : `${year} Season`;
  }
}

function pickSeasonYear(root: AnyObj): number {
  const season = asObj(root.season);
  const seasons = asArr(root.seasons);
  const candidates: unknown[] = [
    season?.year,
    asObj(seasons[0])?.year,
    asObj(asArr(root.children)[0])?.season,
  ];
  for (const c of candidates) {
    const n = asNum(c);
    if (n > 1900) return n;
  }
  return 0;
}

function pickSeasonType(root: AnyObj): SeasonType {
  const season = asObj(root.season);
  const rawType = season?.type;
  const typeObj = asObj(rawType);
  const n = asNum(typeObj?.type ?? rawType);
  switch (n) {
    case 1: return "preseason";
    case 2: return "regular";
    case 3: return "postseason";
    case 4: return "offseason";
  }
  const name = asStr(typeObj?.name).toLowerCase();
  if (name.includes("regular")) return "regular";
  if (name.includes("post")) return "postseason";
  if (name.includes("pre")) return "preseason";
  if (name.includes("off")) return "offseason";
  return "unknown";
}
