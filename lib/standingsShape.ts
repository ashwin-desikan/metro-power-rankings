// The pure half of lib/standings.ts: types, the defensive shaper and its
// helpers. Split out on 2026-09-04 so it can be unit-tested -- lib/standings.ts
// imports "server-only", which a vitest run cannot resolve, and the bug that
// prompted this (ESPN's standings payload losing `season.type`, so a 3-0
// PRESEASON table was presented as the 2026 season for the whole of August)
// lived entirely in this half and was invisible to every other kind of check.
// Nothing here fetches. lib/standings.ts owns the network and re-exports this.
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
  // Pretty label for the block heading: "2026 Regular Season · Week 7",
  // "2026 Regular Season · opens 6 Sep", or "Final 2025". Empty string means we
  // couldn't reach ESPN — caller should hide the block.
  source_label: string;
  // ISO date the regular season opens, read from the payload's own calendar
  // when that calendar belongs to the season being read. Null when ESPN sent
  // no usable one, which is the normal case for the other leagues.
  regular_season_start: string | null;
};

// Optional override map for ESPN `team.name` -> workbook canonical. Empty
// today because the 32 active franchises align (Bills, Cowboys, 49ers,
// Commanders all match). Kept as a hook for when a future rename diverges
// from the workbook before the next refresh.
const CANONICAL_OVERRIDE: Record<string, string> = {};


/** The shape returned when ESPN and the committed snapshot both failed.
 *  Exported because lib/standings.ts is the only caller and it lives across
 *  the server-only boundary. */
export function emptySnapshot(): StandingsSnapshot {
  return {
    league: "NFL",
    season_year: 0,
    season_type: "unknown",
    week: null,
    fetched_at: new Date().toISOString(),
    is_preseason: true,
    by_canonical: {},
    source_label: "",
    regular_season_start: null,
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

/** Exported for lib/standings.test.ts. Pure: a payload in, a snapshot out.
 *  It is exported because the 2026-09-04 preseason bug lived entirely in
 *  here and was invisible to every other kind of check. */
export function shapeStandings(raw: unknown): StandingsSnapshot {
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

  const regularStart = seasonWindows(root, seasonYear).find((w) => w.id === 2);

  return {
    league: "NFL",
    season_year: seasonYear,
    season_type: seasonType,
    week,
    fetched_at: new Date().toISOString(),
    is_preseason: isPreseason,
    by_canonical: byCanonical,
    source_label: buildLabel(seasonYear, seasonType, week, allZero,
                             regularStart ? regularStart.start : null),
    regular_season_start: regularStart ? new Date(regularStart.start).toISOString() : null,
  };
}

function buildLabel(
  year: number,
  type: SeasonType,
  week: number | null,
  allZero: boolean,
  regularStartMs: number | null,
): string {
  if (!year) return "";
  // The table itself is ALWAYS the regular season now (seasontype=2 is pinned
  // on the request), so the label describes that table and where the calendar
  // has got to, not which table came back. Those were the same thing while the
  // request was unpinned, and conflating them is how a preseason board ended up
  // under a "2026 Season" heading.
  const opens = regularStartMs
    ? new Date(regularStartMs).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : null;
  switch (type) {
    case "regular":
      return `${year} Regular Season${week ? ` · Week ${week}` : ""}`;
    case "postseason":
      // ESPN reports hasStandings=false for postseason, so what we are holding
      // is the completed regular-season table, and saying "Postseason" over it
      // would be describing the calendar rather than the numbers.
      return `${year} Regular Season · final`;
    case "preseason":
      return opens
        ? `${year} Regular Season · opens ${opens}`
        : `${year} Regular Season · not started`;
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

/** The season's own type calendar, from `seasons[].types[]`, but ONLY when it
 *  belongs to the year we are reading. ESPN sends a `seasons` array on every
 *  standings response and it is frequently stale: on 2026-09-04 the NBA, NHL
 *  and MLB payloads carried a 2027 season id with 2025-26 windows. Matching on
 *  the year is what makes this safe to rely on rather than a second guess.
 */
type SeasonWindow = { id: number; start: number; end: number };

function seasonWindows(root: AnyObj, year: number): SeasonWindow[] {
  if (!year) return [];
  for (const sRaw of asArr(root.seasons)) {
    const s = asObj(sRaw);
    if (!s || asNum(s.year) !== year) continue;
    const out: SeasonWindow[] = [];
    for (const tRaw of asArr(s.types)) {
      const t = asObj(tRaw);
      if (!t) continue;
      const id = asNum(t.id);
      const start = Date.parse(asStr(t.startDate));
      const end = Date.parse(asStr(t.endDate));
      if (id && Number.isFinite(start) && Number.isFinite(end)) {
        out.push({ id, start, end });
      }
    }
    return out;
  }
  return [];
}

function typeFromCalendar(windows: SeasonWindow[], now: number): SeasonType {
  for (const w of windows) {
    if (now >= w.start && now < w.end) {
      switch (w.id) {
        case 1: return "preseason";
        case 2: return "regular";
        case 3: return "postseason";
        case 4: return "offseason";
      }
    }
  }
  return "unknown";
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
  // 🔴 And as of 2026 the standings payload carries no `season.type` AT ALL --
  // just {year, startDate, endDate, displayName} -- so every branch above
  // misses and this used to return "unknown" every time, which made
  // `is_preseason` fall back to "are all the records zero". Preseason records
  // are not zero, so the fallback said "regular season" all through August.
  // The payload does still carry its own type calendar; read that.
  return typeFromCalendar(seasonWindows(root, pickSeasonYear(root)), Date.now());
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
