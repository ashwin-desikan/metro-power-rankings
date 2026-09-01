import "server-only";

import { fetchEspnJson } from "@/lib/espnFetch";

// Live club rugby union standings: Top 14, Gallagher Premiership, Champions Cup.
//
// SOURCE: ESPN's public v2 standings endpoint -- the same shape and the same
// helper the four North American majors use (see lib/nhl-standings.ts), so
// these boards inherit the committed-snapshot fallback in lib/espnFetch.ts
// for free. Endpoints verified live on 2026-09-01; probe evidence and the
// full source assessment live in project memory under
// `standings-six-comps-sources-2026-09-01`.
//
// TWO ESPN QUIRKS. Both were measured, not assumed (2026-09-01). Do not
// "tidy" either away without re-running the check:
//
//  1. Every group's `abbreviation` field reads "2023/24" on ALL THREE
//     competitions, whatever season the entries actually describe. It is
//     stale in ESPN's own payload. Season labels therefore come from
//     `standings.seasonDisplayName`; `abbreviation` is never read.
//
//  2. The `season` integer is not comparable across competitions. Top 14
//     returns season 2026 for the 2025-26 campaign; the Premiership returns
//     season 2027 for 2026-27. Only the display name is trustworthy.
//
// NAME MAPPING: ESPN carries stale club names (Newcastle Falcons for the
// Red Bulls, Cardiff Blues for Cardiff Rugby, Bristol Rugby for the Bears)
// and anglicised French ones (Pau, La Rochelle, Clermont Auvergne). The
// crosswalk below is therefore keyed on the ESPN INTEGER TEAM ID, which is
// stable, and never on the display name. Built and audited 2026-09-01 at
// 48/48 across the three competitions, including the confirmed 24-club
// 2026-27 Champions Cup field. Regenerate with
// scripts/rugby/espn_name_crosswalk.json after any Champions Cup draw.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

export type RugbyCompKey = "top14" | "prem" | "champions-cup";

export type RugbyStandingRow = {
  espn_team_id: string;
  espn_name: string;
  /** Team List canonical club name; null when ESPN serves a club we do not carry. */
  team: string | null;
  /** What the board prints: canonical minus any disambiguating suffix. */
  display: string;
  metro_slug: string | null;
  /** Champions Cup pool label; null for a single-table league. */
  pool: string | null;
  rank: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  /** Total bonus points (try + losing), as ESPN reports them. */
  bonus: number;
  pf: number;
  pa: number;
  pd: number;
  tf: number;
  ta: number;
  /** Five-game form, oldest-to-newest for display. */
  form: string | null;
};

export type RugbyStandings = {
  key: RugbyCompKey;
  label: string;
  /** ESPN's seasonDisplayName, e.g. "2026-27". Empty when absent. */
  season_label: string;
  groups: { title: string | null; rows: RugbyStandingRow[] }[];
  fetched_at: string;
};

type CompConfig = {
  espnLeagueId: number;
  label: string;
  snapshotKey: string;
  /** Scheduled games per club, for the season-liveness check. */
  fullSeason: number;
};

export const RUGBY_COMPS: Record<RugbyCompKey, CompConfig> = {
  // 14 clubs, 26 rounds.
  top14: { espnLeagueId: 270559, label: "Top 14", snapshotKey: "rugby-top14", fullSeason: 26 },
  // 10 clubs, 18 rounds.
  prem: { espnLeagueId: 267979, label: "Premiership Rugby", snapshotKey: "rugby-prem", fullSeason: 18 },
  // 24 clubs in four pools of six; each club plays four pool games.
  "champions-cup": { espnLeagueId: 271937, label: "Champions Cup", snapshotKey: "rugby-champions-cup", fullSeason: 4 },
};

// ESPN team id -> Team List club. See the NAME MAPPING note above.
const CROSSWALK: Record<string, { team: string; display: string; metro: string | null }> = {
  "25917": { team: "ASM Clermont", display: "ASM Clermont", metro: "clermont-ferrand" },
  "25912": { team: "Aviron Bayonnais", display: "Aviron Bayonnais", metro: "bayonne" },
  "25898": { team: "Bath", display: "Bath", metro: "bath" },
  "25899": { team: "Bristol Bears", display: "Bristol Bears", metro: "bristol" },
  "25953": { team: "Bulls (rugby union)", display: "Bulls", metro: "johannesburg" },
  "25965": { team: "Cardiff Rugby", display: "Cardiff Rugby", metro: "cardiff" },
  "25916": { team: "Castres Olympique", display: "Castres Olympique", metro: "castres" },
  "25923": { team: "Connacht", display: "Connacht", metro: "galway" },
  "25951": { team: "Edinburgh Rugby", display: "Edinburgh Rugby", metro: "edinburgh" },
  "116227": { team: "Exeter Chiefs", display: "Exeter Chiefs", metro: "exeter" },
  "25952": { team: "Glasgow Warriors", display: "Glasgow Warriors", metro: "glasgow" },
  "25900": { team: "Gloucester", display: "Gloucester", metro: "gloucester" },
  "25901": { team: "Harlequins", display: "Harlequins", metro: "london" },
  "25903": { team: "Leicester Tigers", display: "Leicester Tigers", metro: "leicester" },
  "25924": { team: "Leinster", display: "Leinster", metro: "dublin" },
  "25958": { team: "Lions (URC)", display: "Lions", metro: "johannesburg" },
  "143736": { team: "Lyon OU", display: "Lyon OU", metro: "lyon" },
  "25918": { team: "Montpellier HR", display: "Montpellier HR", metro: "montpellier" },
  "25925": { team: "Munster", display: "Munster", metro: "limerick-city" },
  "25906": { team: "Newcastle Red Bulls", display: "Newcastle Red Bulls", metro: "newcastle" },
  "25907": { team: "Northampton Saints", display: "Northampton Saints", metro: "northampton" },
  "25968": { team: "Ospreys", display: "Ospreys", metro: "swansea" },
  "25986": { team: "RC Toulon", display: "RC Toulon", metro: "toulon" },
  "99855": { team: "Racing 92", display: "Racing 92", metro: "paris" },
  "25908": { team: "Sale Sharks", display: "Sale Sharks", metro: "manchester" },
  "25909": { team: "Saracens", display: "Saracens", metro: "london" },
  "25966": { team: "Scarlets", display: "Scarlets", metro: "llanelli" },
  "270567": { team: "Section Paloise", display: "Section Paloise", metro: "pau" },
  "25961": { team: "Sharks (rugby union)", display: "Sharks", metro: "durban" },
  "25921": { team: "Stade Français Paris", display: "Stade Français Paris", metro: "paris" },
  "119318": { team: "Stade Rochelais", display: "Stade Rochelais", metro: "la-rochelle" },
  "25922": { team: "Stade Toulousain", display: "Stade Toulousain", metro: "toulouse" },
  "25962": { team: "Stormers (rugby union)", display: "Stormers", metro: "cape-town" },
  "289766": { team: "US Montauban", display: "US Montauban", metro: "toulouse" },
  "25920": { team: "USA Perpignan", display: "USA Perpignan", metro: "perpignan" },
  "25926": { team: "Ulster", display: "Ulster", metro: "belfast" },
  "143737": { team: "Union Bordeaux Bègles", display: "Union Bordeaux Bègles", metro: "bordeaux" },
};

const ESPN_BASE = "https://site.api.espn.com/apis/v2/sports/rugby";
const REVALIDATE_SECONDS = 900;

type AnyObj = Record<string, unknown>;

const asObj = (v: unknown): AnyObj | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null;
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asNum = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ESPN returns the form string newest-first, the same way the api-football
// bundle does (verified on that feed 2026-09-01). Every rugby table in the
// world reads left-to-right oldest-to-newest, so reverse it for display.
function form5(v: string): string | null {
  const s = v.replace(/[^WLDT]/gi, "").toUpperCase();
  if (!s) return null;
  return s.slice(0, 5).split("").reverse().join("");
}

function shapeEntry(entryRaw: unknown, pool: string | null): RugbyStandingRow | null {
  const entry = asObj(entryRaw);
  if (!entry) return null;
  const team = asObj(entry.team) || {};
  const espnId = asStr(team.id);
  const espnName = asStr(team.displayName) || asStr(team.shortDisplayName);
  if (!espnId || !espnName) return null;

  const stats = asArr(entry.stats).map(asObj);
  const find = (name: string) => stats.find((s) => s && asStr(s.name) === name);
  const num = (name: string, fallback = 0) => asNum(find(name)?.value, fallback);
  const has = (name: string) => find(name) !== undefined;
  const str = (name: string) => asStr(find(name)?.displayValue);

  const mapped = CROSSWALK[espnId] ?? null;

  return {
    espn_team_id: espnId,
    espn_name: espnName,
    team: mapped?.team ?? null,
    // An unmapped club still renders, under ESPN's own name, rather than
    // vanishing from the table. A missing crosswalk row is a mapping gap to
    // fix, never a reason to publish an incomplete league table.
    display: mapped?.display ?? espnName,
    metro_slug: mapped?.metro ?? null,
    pool,
    rank: has("rank") ? num("rank") : null,
    played: num("gamesPlayed"),
    won: num("gamesWon"),
    drawn: num("gamesDrawn"),
    lost: num("gamesLost"),
    points: num("points"),
    bonus: num("bonusPoints"),
    pf: num("pointsFor"),
    pa: num("pointsAgainst"),
    pd: num("pointsFor") - num("pointsAgainst"),
    tf: num("triesFor"),
    ta: num("triesAgainst"),
    form: form5(str("overall")),
  };
}

function shape(key: RugbyCompKey, raw: unknown): RugbyStandings {
  const cfg = RUGBY_COMPS[key];
  const empty: RugbyStandings = {
    key, label: cfg.label, season_label: "", groups: [], fetched_at: new Date().toISOString(),
  };
  const root = asObj(raw);
  if (!root) return empty;

  let seasonLabel = "";
  const groups: RugbyStandings["groups"] = [];

  // One `children` entry per group: a single entry for a league table, four
  // pools for the Champions Cup. A pool title is only meaningful when there
  // is more than one, so a single-group competition carries a null title and
  // renders as one table.
  const children = asArr(root.children);
  const multi = children.length > 1;

  for (const childRaw of children) {
    const child = asObj(childRaw);
    if (!child) continue;
    const standings = asObj(child.standings);
    if (!standings) continue;
    // seasonDisplayName, never `abbreviation` -- see the quirks note above.
    if (!seasonLabel) seasonLabel = asStr(standings.seasonDisplayName);
    const title = multi ? asStr(child.name) || null : null;
    const rows = asArr(standings.entries)
      .map((e) => shapeEntry(e, title))
      .filter((r): r is RugbyStandingRow => r !== null);
    if (rows.length > 0) groups.push({ title, rows });
  }

  return { ...empty, season_label: seasonLabel, groups };
}

/**
 * One competition's current table. Fail-soft: any fetch or parse failure
 * returns an empty `groups`, which the caller drops from the board rather
 * than rendering half a table.
 */
export async function getRugbyStandings(key: RugbyCompKey): Promise<RugbyStandings> {
  const cfg = RUGBY_COMPS[key];
  const raw = await fetchEspnJson(
    `${ESPN_BASE}/${cfg.espnLeagueId}/standings`,
    cfg.snapshotKey,
    REVALIDATE_SECONDS,
  );
  if (raw == null) {
    return { key, label: cfg.label, season_label: "", groups: [], fetched_at: new Date().toISOString() };
  }
  return shape(key, raw);
}

/** Every club row across the groups, for liveness checks and hub consumers. */
export function rugbyAllRows(s: RugbyStandings): RugbyStandingRow[] {
  return s.groups.flatMap((g) => g.rows);
}
