import "server-only";

// ICC World Test Championship standings, live from ICC's data provider Sportz
// (assets-icc.sportz.io), the JSON feed that powers icc-cricket.com's own
// standings page. Runtime-ISR, fail-soft (returns null on any error). Posture
// matches the site's other hidden-API loaders.
//
// MAINTENANCE: championship_id=8 is the 2025-27 cycle; it increments when a new
// cycle starts (~mid-2027). client_id is the static token the ICC page ships
// with and could rotate. Logo path uses ICC's team badges (team_id 1-9). If any
// of these break the loader just returns null and the section hides.

const API =
  "https://assets-icc.sportz.io/cricket/v1/championship_standing?championship_id=8&client_id=tPZJbRgIub3Vua93%2FDWtyQ%3D%3D&feed_format=json&lang=en";
const teamLogo = (id: string) =>
  id ? `https://assets-icc.sportz.io/static-assets/buildv3-stg/images/teams/${id}.png?v=21` : null;

export type WtcRow = {
  position: number;
  name: string;
  shortName: string;
  logoUrl: string | null;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
  penalty: number;
  pct: string;
};
export type WtcStandings = { title: string; rows: WtcRow[] };

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const asNum = (v: unknown, f = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : f; };

export async function getWtcStandings(): Promise<WtcStandings | null> {
  let root: AnyObj | null;
  try {
    const res = await fetch(API, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0)", Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    root = asObj(await res.json());
  } catch {
    return null;
  }
  if (!root) return null;

  const data = asObj(root.data);
  const standingsRaw = data?.standings;
  const standings = asObj(Array.isArray(standingsRaw) ? standingsRaw[0] : standingsRaw);
  const teamsArr = asArr(asObj(standings?.teams)?.team);
  if (teamsArr.length === 0) return null;

  const rows: WtcRow[] = teamsArr
    .map(asObj)
    .filter((t): t is AnyObj => !!t)
    .map((t) => ({
      position: asNum(t.position),
      name: asStr(t.team_name),
      shortName: asStr(t.team_short_name),
      logoUrl: teamLogo(asStr(t.team_id)),
      played: asNum(t.matches_played),
      won: asNum(t.matches_won),
      lost: asNum(t.matches_lost),
      drawn: asNum(t.matches_drawn),
      points: asNum(t.points),
      penalty: asNum(t.penalty),
      pct: asStr(t.points_contested_and_total_points_ratio) || "—",
    }))
    .sort((a, b) => a.position - b.position);

  const title = asStr(data?.championship_display_name) || asStr(data?.championship_name) || "ICC World Test Championship";
  return { title, rows };
}
