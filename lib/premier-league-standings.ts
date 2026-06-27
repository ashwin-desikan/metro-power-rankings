import "server-only";

// Live Premier League standings from ESPN's public soccer API (eng.1).
// ISR-cached at 30-minute intervals; returns null on any failure so the
// league hub falls back to the static workbook standings.

export type PlLiveRow = {
  name: string;       // ESPN displayName
  abbr: string;       // ESPN abbreviation (ARS, CHE, …)
  slug: string | null; // our football slug, or null if unmapped
  zone: string;       // e.g. "Champions League", "Europa League", "Relegation", ""
  zoneColor: string | null; // hex from ESPN note (#81D6AC etc.)
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

export type PlStandingsSnapshot = {
  season_year: number;
  rows: PlLiveRow[];
} | null;

const ESPN_URL = "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings";
const REVALIDATE = 1800; // 30 min

// ESPN displayName → our football slug.
// Update when promoted/relegated clubs change; names here reflect the
// current ESPN display names.
const DISPLAY_TO_SLUG: Record<string, string> = {
  "Arsenal": "arsenal",
  "Manchester City": "manchester-city",
  "Manchester United": "manchester-united",
  "Aston Villa": "aston-villa",
  "Liverpool": "liverpool",
  "Bournemouth": "afc-bournemouth",
  "AFC Bournemouth": "afc-bournemouth",
  "Sunderland": "sunderland",
  "Brighton & Hove Albion": "brighton-hove-albion",
  "Brighton and Hove Albion": "brighton-hove-albion",
  "Brentford": "brentford",
  "Chelsea": "chelsea",
  "Fulham": "fulham",
  "Newcastle United": "newcastle-united",
  "Everton": "everton",
  "Leeds United": "leeds-united",
  "Crystal Palace": "crystal-palace",
  "Nottingham Forest": "nottingham-forest",
  "Tottenham Hotspur": "tottenham-hotspur",
  "West Ham United": "west-ham-united",
  "Burnley": "burnley",
  "Wolverhampton Wanderers": "wolverhampton-wanderers",
  // 2025-26 relegated / 2026-27 promoted candidates
  "Ipswich Town": "ipswich-town",
  "Leicester City": "leicester-city",
  "Southampton": "southampton",
  "Sheffield United": "sheffield-united",
  "Luton Town": "luton-town",
  "Burnley FC": "burnley",
  "Watford": "watford",
  "Norwich City": "norwich-city",
  "Middlesbrough": "middlesbrough",
  "Coventry City": "coventry-city",
};

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null;
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

export async function getPlLiveStandings(): Promise<PlStandingsSnapshot> {
  try {
    const res = await fetch(ESPN_URL, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: REVALIDATE },
      headers: { "User-Agent": "rankings-citizen-of-nowhere/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = asObj(await res.json());
    if (!data) return null;

    const child = asObj(asArr(data.children)[0]);
    const standings = asObj(child?.standings);
    const entries = asArr(standings?.entries);
    if (!entries.length) return null;

    const season = asNum(standings?.season) || new Date().getFullYear();

    const rows: PlLiveRow[] = entries.map((raw, i) => {
      const e = asObj(raw)!;
      const team = asObj(e.team) ?? {};
      const note = asObj(e.note) ?? {};
      const statsArr = asArr(e.stats);
      const stats: Record<string, number> = {};
      for (const s of statsArr) {
        const so = asObj(s);
        if (so && typeof so.name === "string" && typeof so.value === "number") {
          stats[so.name] = so.value;
        }
      }
      const name = asStr(team.displayName);
      return {
        name,
        abbr: asStr(team.abbreviation),
        slug: DISPLAY_TO_SLUG[name] ?? null,
        zone: asStr(note.description),
        zoneColor: asStr(note.color) || null,
        rank: i + 1,
        played: asNum(stats.gamesPlayed),
        wins: asNum(stats.wins),
        draws: asNum(stats.ties),
        losses: asNum(stats.losses),
        gf: asNum(stats.pointsFor ?? stats.goalsFor),
        ga: asNum(stats.pointsAgainst ?? stats.goalsAgainst),
        gd: asNum(stats.pointsDifference ?? stats.goalDifference),
        points: asNum(stats.points),
      };
    });

    return { season_year: Number(season), rows };
  } catch {
    return null;
  }
}
