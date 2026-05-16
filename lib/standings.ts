import "server-only";

// Live NFL standings layer.
//
// Source: ESPN's public /standings endpoint (the same one wrapped by the
// machina-sports/sports-skills nfl-data skill). We call it directly from the
// server during `next build`, so the static franchise pages get a "current
// season" block baked in. Next ISR refreshes every hour without a redeploy;
// the daily-rebuild.yml GH Action guarantees a fresh static build at least
// once every 24 hours regardless of traffic.
//
// Server-only because we don't want to ship the fetch into a client bundle
// or expose the upstream URL to browsers. The pre-push static scanner at
// scripts/check-client-imports.mjs lists @/lib/standings to enforce that.

export type SeasonType =
  | "preseason"
  | "regular"
  | "postseason"
  | "offseason"
  | "unknown";

export type TeamStanding = {
  // Workbook canonical (Bills, Cowboys, ...). Joined into the franchise table
  // via Franchise.canonical so the per-team page can look up its own row.
  canonical: string;
  espn_team_id: string;
  abbr: string;
  display_name: string;

  // Record + percentages.
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  games_played: number;

  // Scoring.
  points_for: number;
  points_against: number;
  point_diff: number;

  // Ranks. ESPN omits some of these in non-regular-season payloads, so each
  // is nullable. The UI hides null fields rather than rendering a dash.
  division_rank: number | null;
  conf_rank: number | null;
  playoff_seed: number | null;

  // Current streak as a display string ("W3", "L1"). Null when ESPN doesn't
  // include it (offseason snapshots, occasional partial weeks).
  streak: string | null;

  conference: "AFC" | "NFC" | "";
  division: string;
};

export type StandingsSnapshot = {
  league: "NFL";
  season_year: number;
  season_type: SeasonType;
  week: number | null;
  fetched_at: string;
  // True if no games have been played in this season payload, OR if ESPN is
  // explicitly flagging preseason/unknown. UI uses this to decide whether to
  // render the live record or the "Season opens soon" placeholder.
  is_preseason: boolean;
  by_canonical: Record<string, TeamStanding>;
  // Pretty label for the block heading: "2026 Regular Season · Week 7" or
  // "Final 2025" or "2026 Preseason". Empty string means we couldn't reach
  // ESPN — caller should hide the block.
  source_label: string;
};

// Optional override map for ESPN `team.name` -> workbook canonical. Empty
// today because the 32 active franchises align (Bills, Cowboys, 49ers,
// Commanders all match). Kept as a hook for when a future rename diverges
// from the workbook before the next refresh.
const CANONICAL_OVERRIDE: Record<string, string> = {};

const ESPN_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";

// Hourly ISR. NFL games at most 3-4x a week (Thu/Sun/Mon), so an hour gap
// between revalidations is fine. The 24h daily rebuild handles the floor.
const REVALIDATE_SECONDS = 3600;

export async function getCurrentNflStandings(): Promise<StandingsSnapshot> {
  let raw: unknown = null;
  try {
    // 5-second timeout caps the failure cost when ESPN is slow / down.
    // The existing try/catch handles AbortError identically to a 5xx.
    const res = await fetch(ESPN_STANDINGS_URL, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        "User-Agent": "rankings-citizen-of-nowhere/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`espn http ${res.status}`);
    raw = await res.json();
  } catch {
    // ESPN unreachable, blocked, or returned a non-JSON body. The franchise
    // page renders without the live block in that case.
    return emptySnapshot();
  }
  return shapeStandings(raw);
}

function emptySnapshot(): StandingsSnapshot {
  return {
    league: "NFL",
    season_year: 0,
    season_type: "unknown",
    week: null,
    fetched_at: new Date().toISOString(),
    is_preseason: true,
    by_canonical: {},
    source_label: "",
  };
}

// Defensive shaper. ESPN's standings response has shifted shape over the
// years and isn't formally documented, so every dereference is wrapped.

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
  const week = pickWeek(root);

  const byCanonical: Record<string, TeamStanding> = {};
  const children = asArr(root.children);

  for (const childRaw of children) {
    const child = asObj(childRaw);
    if (!child) continue;
    const confAbbr = asStr(child.abbreviation).toUpperCase();
    const conference: "AFC" | "NFC" | "" =
      confAbbr === "AFC" ? "AFC" : confAbbr === "NFC" ? "NFC" : "";

    // Some payloads nest division standings as `child.children[].standings`;
    // top-level conference standings live at `child.standings.entries`.
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
      const pf = statNum("pointsFor");
      const pa = statNum("pointsAgainst");

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
        points_for: pf,
        points_against: pa,
        point_diff: pf - pa,
        division_rank: statPresent("divisionRank") ? statNum("divisionRank") : null,
        conf_rank: statPresent("rank") ? statNum("rank") : null,
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
    league: "NFL",
    season_year: seasonYear,
    season_type: seasonType,
    week,
    fetched_at: new Date().toISOString(),
    is_preseason: isPreseason,
    by_canonical: byCanonical,
    source_label: buildLabel(seasonYear, seasonType, week, allZero),
  };
}

function buildLabel(
  year: number,
  type: SeasonType,
  week: number | null,
  allZero: boolean,
): string {
  if (!year) return "";
  switch (type) {
    case "regular":
      return `${year} Regular Season${week ? ` · Week ${week}` : ""}`;
    case "postseason":
      return `${year} Postseason`;
    case "preseason":
      return `${year} Preseason`;
    case "offseason":
      // ESPN serves the most-recent-completed-season's standings during
      // the offseason window. Label as "Final" so readers don't mistake it
      // for in-progress data.
      return `Final ${year}`;
    default:
      return allZero ? `${year} Season (opens soon)` : `${year} Season`;
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
  // ESPN sometimes serializes `season.type` as an integer (1-4) and other
  // times as an object with .type / .name. Cover both.
  const rawType = season?.type;
  const typeObj = asObj(rawType);
  const n = asNum(typeObj?.type ?? rawType);
  switch (n) {
    case 1: return "preseason";
    case 2: return "regular";
    case 3: return "postseason";
    case 4: return "offseason";
  }
  // Some payloads also include a string name like "Regular Season".
  const name = asStr(typeObj?.name).toLowerCase();
  if (name.includes("regular")) return "regular";
  if (name.includes("post")) return "postseason";
  if (name.includes("pre")) return "preseason";
  if (name.includes("off")) return "offseason";
  return "unknown";
}

function pickWeek(root: AnyObj): number | null {
  const candidates: unknown[] = [
    asObj(root.week)?.number,
    asObj(asObj(root.season)?.type)?.week,
    asObj(asObj(asObj(root.season)?.type)?.week)?.number,
  ];
  for (const c of candidates) {
    const n = asNum(c);
    if (n > 0) return n;
  }
  return null;
}
