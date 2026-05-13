import "server-only";

// Live MLB standings layer.
//
// Mirrors lib/standings.ts (NFL). Pulls ESPN's public /mlb/standings endpoint
// at build time so the static franchise pages get a "current season" in-
// progress row baked in once regular-season games have actually been played.
// Next ISR refreshes every hour without a redeploy; the daily-rebuild.yml
// GH Action guarantees a fresh static build at least once every 24 hours.
//
// Server-only because we don't want to ship the fetch into a client bundle
// or expose the upstream URL to browsers. scripts/check-client-imports.mjs
// lists @/lib/mlb-standings in SERVER_ONLY_MODULES.

export type SeasonType =
  | "spring"
  | "preseason"
  | "regular"
  | "postseason"
  | "offseason"
  | "unknown";

export type TeamStanding = {
  canonical: string;     // workbook canonical (Yankees, Dodgers, ...)
  espn_team_id: string;
  abbr: string;
  display_name: string;

  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  games_played: number;

  runs_for: number;
  runs_against: number;
  run_diff: number;

  division_rank: number | null;
  league_rank: number | null;
  playoff_seed: number | null;

  streak: string | null;

  league: "AL" | "NL" | "";
  division: string;
};

export type StandingsSnapshot = {
  league: "MLB";
  season_year: number;
  season_type: SeasonType;
  fetched_at: string;
  is_preseason: boolean;
  by_canonical: Record<string, TeamStanding>;
  source_label: string;
};

// ESPN uses `name` values like "Yankees" and "Diamondbacks" that align with
// the workbook canonical strings for the modern 30. Overrides kept as an
// escape hatch for any future ESPN rename.
const CANONICAL_OVERRIDE: Record<string, string> = {};

const ESPN_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings";

const REVALIDATE_SECONDS = 3600;

export async function getCurrentMlbStandings(): Promise<StandingsSnapshot> {
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
    league: "MLB",
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
    const leagueAbbr = asStr(child.abbreviation).toUpperCase();
    const league: "AL" | "NL" | "" =
      leagueAbbr === "AL" ? "AL" : leagueAbbr === "NL" ? "NL" : "";

    // Top-level league standings live at child.standings.entries; per-
    // division standings nest one level deeper at child.children[].standings.
    const directEntries = asArr(asObj(child.standings)?.entries);
    const nestedEntries = asArr(child.children).flatMap((divRaw) => {
      const div = asObj(divRaw);
      return div ? asArr(asObj(div.standings)?.entries).map((e) => ({
        entry: e,
        division: asStr(div.name),
      })) : [];
    });

    const flatEntries = directEntries.length
      ? directEntries.map((e) => ({ entry: e, division: "" }))
      : nestedEntries;

    for (const { entry: entryRaw, division } of flatEntries) {
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

      const wins = statNum("wins");
      const losses = statNum("losses");
      const ties = statNum("ties");
      const rf = statNum("pointsFor");
      const ra = statNum("pointsAgainst");

      byCanonical[canonical] = {
        canonical,
        espn_team_id: asStr(team.id),
        abbr: asStr(team.abbreviation),
        display_name: asStr(team.displayName),
        wins,
        losses,
        ties,
        win_pct: statNum("winPercent"),
        games_played: wins + losses + ties,
        runs_for: rf,
        runs_against: ra,
        run_diff: rf - ra,
        division_rank: statPresent("divisionRank") ? statNum("divisionRank") : null,
        league_rank: statPresent("leagueRank") ? statNum("leagueRank") : null,
        playoff_seed: statPresent("playoffSeed") ? statNum("playoffSeed") : null,
        streak: statStr("streak") || null,
        league,
        division,
      };
    }
  }

  const allZero =
    Object.values(byCanonical).length > 0 &&
    Object.values(byCanonical).every((s) => s.games_played === 0);

  const isPreseason =
    seasonType === "preseason" ||
    seasonType === "spring" ||
    (seasonType !== "regular" && seasonType !== "postseason" && allZero);

  return {
    league: "MLB",
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
    case "spring": return `${year} Spring Training`;
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
    // ESPN MLB type codes: 1=preseason/spring, 2=regular, 3=postseason, 4=offseason
    case 1: return "spring";
    case 2: return "regular";
    case 3: return "postseason";
    case 4: return "offseason";
  }
  const name = asStr(typeObj?.name).toLowerCase();
  if (name.includes("regular")) return "regular";
  if (name.includes("post")) return "postseason";
  if (name.includes("spring") || name.includes("pre")) return "spring";
  if (name.includes("off")) return "offseason";
  return "unknown";
}
