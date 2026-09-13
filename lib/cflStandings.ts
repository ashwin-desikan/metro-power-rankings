import type { CflStandingsView, CflStandingRow } from "./cfl";

// Live CFL standings from api.stats.cfl.ca, the JSON API the league's own public
// standings page (stats.cfl.ca/standings) reads. Open, unkeyed, one document per season.
//
// 🔴 WHY THIS WAS REWRITTEN, 2026-09-13. It used to scrape cfl.ca/standings/<year>/ as
// server-rendered WordPress HTML and pick the division tables out with a regex. The
// league has since moved standings to stats.cfl.ca and retired the old path:
// /standings/2026/, /2025/ and /2024/ all return 404, so this is a site migration rather
// than a 2026 gap. The new page is client-rendered, so there is no table text in its
// HTML to scrape at all. The scraper therefore returned null on every call, and because
// cflBlock() drops the block entirely when this returns null, the CFL simply vanished
// from /sports/standings and /teams/cfl with nothing logged and nothing shown.
//
// The old file's comment said "Any failure returns null so the caller falls back to the
// workbook". No caller ever did. That gap is why a dead upstream read as a missing sport
// instead of a stale one.
//
// ESPN is still not an option: its CFL scoreboard answers 200 with a single game from
// November 2022, and both of its CFL standings endpoints return empty documents (checked
// the same day, rather than trusting the previous comment that said so).

// Two-letter API abbreviation -> our franchise slug + display name + division.
// Keyed on `abbreviation` because that is what the standings rows carry; the old map was
// keyed on the uppercase region label the scraped HTML happened to print.
const TEAMS: Record<string, { slug: string; name: string; division: string }> = {
  WPG: { slug: "winnipeg-blue-bombers", name: "Winnipeg Blue Bombers", division: "West" },
  EDM: { slug: "edmonton-elks", name: "Edmonton Elks", division: "West" },
  BC: { slug: "bc-lions", name: "BC Lions", division: "West" },
  SSK: { slug: "saskatchewan-roughriders", name: "Saskatchewan Roughriders", division: "West" },
  CGY: { slug: "calgary-stampeders", name: "Calgary Stampeders", division: "West" },
  MTL: { slug: "montreal-alouettes", name: "Montreal Alouettes", division: "East" },
  TOR: { slug: "toronto-argonauts", name: "Toronto Argonauts", division: "East" },
  OTT: { slug: "ottawa-redblacks", name: "Ottawa RedBlacks", division: "East" },
  HAM: { slug: "hamilton-tiger-cats", name: "Hamilton Tiger-Cats", division: "East" },
};

type ApiRow = {
  abbreviation?: unknown; games_played?: unknown;
  wins?: unknown; losses?: unknown; ties?: unknown; points?: unknown;
  points_for?: unknown; points_against?: unknown;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** One division's rows. Anything whose abbreviation we do not recognise is dropped
 *  rather than guessed: a renamed or expansion franchise should read as a missing row,
 *  not a mislabelled one. */
export function parseDivision(rows: unknown, want: string): CflStandingRow[] {
  if (!Array.isArray(rows)) return [];
  const out: CflStandingRow[] = [];
  const seen = new Set<string>();
  for (const raw of rows as ApiRow[]) {
    const meta = TEAMS[String(raw?.abbreviation ?? "").toUpperCase()];
    if (!meta || meta.division !== want || seen.has(meta.slug)) continue;
    seen.add(meta.slug);
    const gp = num(raw.games_played), w = num(raw.wins), l = num(raw.losses), t = num(raw.ties);
    out.push({
      slug: meta.slug, name: meta.name, team: meta.name, division: meta.division,
      gp, w, l, t,
      // `points` is the league's own two-per-win-one-per-tie total. Falls back to the
      // computation so a row missing the field still lands correctly rather than at zero.
      pts: num(raw.points) || 2 * w + t,
      pct: gp > 0 ? Math.round(((w + 0.5 * t) / gp) * 1000) / 1000 : 0,
      pf: num(raw.points_for), pa: num(raw.points_against),
      play_app: false, gc_final: false, grey_cup: false,
    });
  }
  return out;
}

export async function getLiveCflStandings(year: number): Promise<CflStandingsView | null> {
  try {
    const res = await fetch(`https://api.stats.cfl.ca/standings/${year}`, {
      // Identifies the project and links to the site. Not a browser impersonation.
      headers: {
        accept: "application/json",
        "user-agent": "MetroPowerRankings/1.0 (+https://rankings.citizenofnowhere.org)",
      },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as { data?: { divisions?: Record<string, { standings?: unknown }> } };
    // The document carries east, west AND a `unified` table of all nine teams. Read the
    // two division tables only; the unified one would list every team a second time.
    const divs = doc?.data?.divisions;
    const east = parseDivision(divs?.east?.standings, "East");
    const west = parseDivision(divs?.west?.standings, "West");
    if (east.length === 0 && west.length === 0) return null;
    const divisions = [
      { division: "East", rows: east.sort((a, b) => b.pts - a.pts || b.pct - a.pct) },
      { division: "West", rows: west.sort((a, b) => b.pts - a.pts || b.pct - a.pct) },
    ].filter((d) => d.rows.length > 0);
    return { year, source: "cfl.ca", fetched_at: new Date().toISOString(), divisions };
  } catch {
    return null;
  }
}
