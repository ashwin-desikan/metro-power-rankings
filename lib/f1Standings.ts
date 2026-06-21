import "server-only";
import {
  getF1CurrentStandingsFallback,
  type F1StandingRow, type F1ConstructorRow,
} from "./f1";

// Live current-season F1 standings from ESPN's server-rendered tables:
//   drivers:      https://www.espn.co.uk/f1/table
//   constructors: https://www.espn.co.uk/f1/table/_/group/constructors
// Parsed defensively from the HTML; on any failure or low-confidence parse we
// return the snapshot from public/data/f1/data.json (our Jolpica pipeline,
// refreshed the day after each race), so the table is never wrong — ESPN only
// adds intra-week freshness. Mirrors the cfl.ca live-standings pattern.
// NOTE: tune the row regex against real ESPN HTML on the dev server if `source`
// stays "snapshot" when it should be "espn".

export type F1StandingsView = {
  drivers: F1StandingRow[];
  constructors: F1ConstructorRow[];
  season: number;
  round: number | null;
  source: "espn" | "snapshot";
  asOf: string | null;
};

const UA = {
  "user-agent":
    "Mozilla/5.0 (compatible; MetroPowerRankings/1.0; +https://rankings.citizenofnowhere.org)",
};
const strip = (s: string) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, " ")
   .replace(/<style[\s\S]*?<\/style>/gi, " ")
   .replace(/<[^>]+>/g, " ")
   .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
   .replace(/\s+/g, " ").trim();

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Split a table-ish HTML blob into per-row stripped text using <tr> boundaries.
function rows(html: string): string[] {
  return html.split(/<tr[\s>]/i).map((r) => strip(r)).filter(Boolean);
}

function parseDrivers(html: string): F1StandingRow[] {
  const out: F1StandingRow[] = [];
  const seen = new Set<string>();
  for (const r of rows(html)) {
    // e.g. "1 ANT (Kimi Antonelli) Kimi Antonelli 156"
    const m = r.match(/^(\d+)\b.*?\b([A-Z]{3})\s*\(([^)]+)\).*?(\d+(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const name = m[3].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ pos: parseInt(m[1], 10), driver: name, nat: null, team: null,
               points: parseFloat(m[4]), wins: null });
  }
  return out;
}

function parseConstructors(html: string): F1ConstructorRow[] {
  const out: F1ConstructorRow[] = [];
  const seen = new Set<string>();
  for (const r of rows(html)) {
    // e.g. "1 Mercedes 244"
    const m = r.match(/^(\d+)\s+([A-Za-z][A-Za-z .&'-]+?)\s+(\d+(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const name = m[2].trim();
    if (seen.has(name) || name.length < 3) continue;
    seen.add(name);
    out.push({ pos: parseInt(m[1], 10), constructor: name, points: parseFloat(m[3]), wins: null });
  }
  return out;
}

// non-increasing points + plausible size = high confidence
function ok(points: (number | null)[], min: number): boolean {
  if (points.length < min) return false;
  for (let i = 1; i < points.length; i++) {
    if ((points[i] ?? 0) > (points[i - 1] ?? 0) + 0.001) return false;
  }
  return true;
}

export async function getLiveF1Standings(): Promise<F1StandingsView> {
  const snap = getF1CurrentStandingsFallback();
  const fallback: F1StandingsView = {
    drivers: snap.drivers, constructors: snap.constructors,
    season: snap.season, round: snap.round, source: "snapshot", asOf: null,
  };
  const [dHtml, cHtml] = await Promise.all([
    fetchHtml("https://www.espn.co.uk/f1/table"),
    fetchHtml("https://www.espn.co.uk/f1/table/_/group/constructors"),
  ]);
  if (!dHtml || !cHtml) return fallback;
  const drivers = parseDrivers(dHtml);
  const constructors = parseConstructors(cHtml);
  if (!ok(drivers.map((d) => d.points), 10) || !ok(constructors.map((c) => c.points), 5)) {
    return fallback;
  }
  return {
    drivers, constructors,
    season: snap.season, round: snap.round, source: "espn",
    asOf: new Date().toISOString().slice(0, 10),
  };
}
