import "server-only";

import { fetchEspnJson } from "@/lib/espnFetch";

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

const REVALIDATE_SECONDS = 1800;

export async function getCurrentMlbStandings(): Promise<StandingsSnapshot> {
  // Live ESPN first, committed snapshot on failure -- see lib/espnFetch.ts.
  const raw = await fetchEspnJson(ESPN_STANDINGS_URL, "mlb", REVALIDATE_SECONDS);
  if (raw == null) return emptySnapshot();
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

    // Resolve league with multiple fallbacks. ESPN sometimes returns
    // `abbreviation` as 'AL' or 'NL' on the league child, sometimes
    // as the division abbreviation when children are flattened, and
    // sometimes only the league `name` ("American League") is populated.
    const leagueAbbr = asStr(child.abbreviation).toUpperCase();
    const childName = asStr(child.name);
    const childNameLower = childName.toLowerCase();
    const childId = asStr(child.id);
    let league: "AL" | "NL" | "" = "";
    if (leagueAbbr === "AL" || leagueAbbr.startsWith("AL ") || childNameLower.includes("american")) {
      league = "AL";
    } else if (leagueAbbr === "NL" || leagueAbbr.startsWith("NL ") || childNameLower.includes("national")) {
      league = "NL";
    } else if (childId === "8") {
      league = "AL";
    } else if (childId === "7") {
      league = "NL";
    }

    // Three shapes seen in the wild:
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

    // For shape (1): default the division to the child name only if it
    // looks like a division string ("AL East"), not the league name.
    const childNameLooksLikeDivision = /east|central|west/i.test(childName);
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

      // Resolve a useful division string. Priority: explicit hint from
      // the wrapper, then team.groups.name (ESPN sometimes drops the
      // division there), then team.groups.parent.name, then the league
      // child name only if it looks like a division.
      let division = divHint;
      if (!division) {
        const groups = asArr(team.groups);
        for (const g of groups) {
          const go = asObj(g);
          const gname = asStr(go?.name);
          if (gname && /east|central|west/i.test(gname)) { division = gname; break; }
          const parent = asObj(go?.parent);
          const pname = asStr(parent?.name);
          if (pname && /east|central|west/i.test(pname)) { division = pname; break; }
        }
      }
      if (!division && childNameLooksLikeDivision) division = childName;

      // Last-resort league inference: when ESPN's response flattens the
      // 6 divisions to the top-level children with no AL/NL wrapper, the
      // child-level detection above leaves `league` empty even though the
      // division string itself ('AL East', 'NL West') is fully specified.
      // Infer from the resolved division string before persisting so the
      // standings widget never falls back to the 'Other' bucket.
      let effectiveLeague: 'AL' | 'NL' | '' = league;
      if (!effectiveLeague && division) {
        const divLower = division.toLowerCase();
        if (divLower.startsWith('al ') || divLower.includes('american')) {
          effectiveLeague = 'AL';
        } else if (divLower.startsWith('nl ') || divLower.includes('national')) {
          effectiveLeague = 'NL';
        }
      }

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
        league: effectiveLeague,
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

// The authoritative "current season" descriptor. ESPN's top-level
// `season.year` is a FORWARD pointer — mid-2026 it already reads 2027 (the
// next season), which mislabels the in-progress standings and breaks the
// franchise-page guard that requires season_year === current calendar year.
// The `seasons[]` array instead carries each season's real [startDate,
// endDate] window, so we pick the entry whose window contains "now". Falls
// back to seasons[0], which is the safe default when no window matches
// (e.g. the dead space between postseason and the next spring training).
function pickCurrentSeason(root: AnyObj): AnyObj | null {
  const seasons = asArr(root.seasons)
    .map(asObj)
    .filter((s): s is AnyObj => s !== null);
  const now = Date.now();
  const containing = seasons.find((s) => {
    const start = Date.parse(asStr(s.startDate));
    const end = Date.parse(asStr(s.endDate));
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
  });
  return containing ?? seasons[0] ?? null;
}

function pickSeasonYear(root: AnyObj): number {
  const cur = pickCurrentSeason(root);
  const candidates: unknown[] = [
    cur?.year,
    asObj(root.season)?.year,
    asObj(asArr(root.children)[0])?.season,
  ];
  for (const c of candidates) {
    const n = asNum(c);
    if (n > 1900) return n;
  }
  return 0;
}

function pickSeasonType(root: AnyObj): SeasonType {
  // Prefer the active phase from the current season's `types` windows —
  // ESPN has begun returning the top-level `season.type` as undefined, which
  // stranded this at "unknown" and made source labels drop the phase word.
  const cur = pickCurrentSeason(root);
  const now = Date.now();
  const activeType = asArr(cur?.types)
    .map(asObj)
    .filter((t): t is AnyObj => t !== null)
    .find((t) => {
      const start = Date.parse(asStr(t.startDate));
      const end = Date.parse(asStr(t.endDate));
      return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
    });
  const activeName = asStr(activeType?.name).toLowerCase();
  if (activeName.includes("regular")) return "regular";
  if (activeName.includes("post")) return "postseason";
  if (activeName.includes("spring") || activeName.includes("pre")) return "spring";
  if (activeName.includes("off")) return "offseason";

  // Legacy fallback: ESPN's top-level season.type numeric code, kept for
  // responses where the seasons[].types date windows are absent.
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
