import "server-only";
import type { CflStandingsView, CflStandingRow } from "./cfl";

// Live CFL standings scraped from the official site. cfl.ca/standings/<year>/ is
// server-rendered (WordPress), so the division tables are present in the HTML —
// unlike ESPN, which no longer carries a live CFL feed. We fetch with hourly ISR,
// strip tags, and parse the West/East tables. Any failure returns null so the
// caller falls back to the workbook. TSN is a client-rendered SPA and is not usable
// this way.

// cfl.ca uppercase team label -> our franchise slug + display name.
const TEAMS: Record<string, { slug: string; name: string; division: string }> = {
  WINNIPEG:     { slug: "winnipeg-blue-bombers",   name: "Winnipeg Blue Bombers",   division: "West" },
  EDMONTON:     { slug: "edmonton-elks",           name: "Edmonton Elks",           division: "West" },
  BC:           { slug: "bc-lions",                name: "BC Lions",                division: "West" },
  SASKATCHEWAN: { slug: "saskatchewan-roughriders",name: "Saskatchewan Roughriders",division: "West" },
  CALGARY:      { slug: "calgary-stampeders",      name: "Calgary Stampeders",      division: "West" },
  MONTREAL:     { slug: "montreal-alouettes",      name: "Montreal Alouettes",      division: "East" },
  TORONTO:      { slug: "toronto-argonauts",       name: "Toronto Argonauts",       division: "East" },
  OTTAWA:       { slug: "ottawa-redblacks",        name: "Ottawa RedBlacks",        division: "East" },
  HAMILTON:     { slug: "hamilton-tiger-cats",     name: "Hamilton Tiger-Cats",     division: "East" },
};

// rank TEAM gp w l t pts f a home away div  (records dropped)
const ROW = /(\d+)\s+([A-Z]{2,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+-\d+-\d+\s+\d+-\d+-\d+\s+\d+-\d+-\d+/g;

function parseDivision(text: string, header: string): CflStandingRow[] {
  const start = text.indexOf(header);
  if (start < 0) return [];
  const rest = text.slice(start + header.length);
  const ends = ["Division", "Crossover"].map(h => rest.indexOf(h)).filter(i => i >= 0);
  const block = rest.slice(0, ends.length ? Math.min(...ends) : rest.length);
  const seen = new Set<string>();
  const rows: CflStandingRow[] = [];
  for (const m of block.matchAll(ROW)) {
    const meta = TEAMS[m[2]];
    if (!meta || seen.has(meta.slug)) continue;
    seen.add(meta.slug);
    const gp = +m[3], w = +m[4], l = +m[5], t = +m[6], pts = +m[7], pf = +m[8], pa = +m[9];
    rows.push({
      slug: meta.slug, name: meta.name, team: meta.name, division: meta.division,
      gp, w, l, t, pts, pf, pa,
      pct: gp > 0 ? Math.round(((w + 0.5 * t) / gp) * 1000) / 1000 : 0,
      play_app: false, gc_final: false, grey_cup: false,
    });
  }
  return rows;
}

export async function getLiveCflStandings(year: number): Promise<CflStandingsView | null> {
  try {
    const res = await fetch(`https://www.cfl.ca/standings/${year}/`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; MetroPowerRankings/1.0; +https://rankings.citizenofnowhere.org)" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ");
    const west = parseDivision(text, "West Division");
    const east = parseDivision(text, "East Division");
    if (west.length === 0 && east.length === 0) return null;
    const divisions = [
      { division: "East", rows: east.sort((a, b) => b.pts - a.pts || b.pct - a.pct) },
      { division: "West", rows: west.sort((a, b) => b.pts - a.pts || b.pct - a.pct) },
    ].filter(d => d.rows.length > 0);
    return { year, source: "cfl.ca", fetched_at: new Date().toISOString(), divisions };
  } catch {
    return null;
  }
}
