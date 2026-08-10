// Data layer for /skyscrapers.
//
// THREE SOURCES, DELIBERATELY NOT MERGED.
//
//  1. The STRUCTURES board: Wikipedia's "List of tallest structures" - every
//     standing structure of any type at 350m+ measured to PINNACLE (height to
//     tip: antennas, masts and all). Carries the article's Structure type
//     column, which retired the hand-curated building/tower/industrial map an
//     earlier draft needed.
//  2. The BUILDINGS board: Wikipedia's "List of tallest buildings" - the
//     world's 100 tallest buildings by ARCHITECTURAL height, the CTBUH
//     measure (spires count, antennas do not).
//  3. The per-metro COUNTS: SKYDB via public/data/skyscrapers.json. The SKYDB
//     licence forbids republishing any name, height, id or coordinate, so
//     only aggregates may be shown.
//
// Pinnacle and architectural height measure differently - Willis Tower is
// 527.0 to tip and 442.1 architectural, an 85-metre antenna gap - so a row
// from one board must never be compared against a row from another. The page
// keeps them in separate sections for exactly this reason.
//
// Both Wikipedia lists are CC BY-SA 4.0 and the page credits and links them.
// scripts/build-supertalls.py builds public/data/supertalls.json: it parses
// both articles, drops no-longer-standing structures, and assigns metros by
// point-in-polygon over the article coordinates (attach_metros.py machinery)
// with a guarded town+country name fallback.

import { readFileSync } from "fs";
import { join } from "path";

const dataDir = join(process.cwd(), "public", "data");

export type StructureKind = "building" | "tower" | "mast" | "industrial" | "other";

export interface Supertall {
  name: string;
  heightM: number;
  heightFt: number;
  yearBuilt: number | null;
  type: string;
  kind: StructureKind;
  use: string;
  country: string;
  town: string;
  metro: string;
  metroSlug: string;
  continent: string;
  submerged?: boolean;
  lat?: number;
  lon?: number;
}

export interface TallBuilding {
  name: string;
  heightM: number;
  heightFt: number;
  floors: number | null;
  yearBuilt: number | null;
  country: string;
  town: string;
  metro: string;
  metroSlug: string;
  continent: string;
}

interface SupertallsFile {
  retrieved: string;
  licence: string;
  structures: { measure: string; thresholdM: number; source: string; sourceUrl: string; count: number; rows: Supertall[] };
  buildings: { measure: string; source: string; sourceUrl: string; count: number; rows: TallBuilding[] };
}

export interface SupertallsData {
  retrieved: string;
  structures: Supertall[];
  structuresUrl: string;
  buildings: TallBuilding[];
  buildingsUrl: string;
}

let cached: SupertallsData | null = null;

/** Both named boards, tallest first. */
export function getSupertalls(): SupertallsData {
  if (cached) return cached;
  try {
    const file = JSON.parse(readFileSync(join(dataDir, "supertalls.json"), "utf-8")) as SupertallsFile;
    cached = {
      retrieved: file.retrieved,
      structures: file.structures.rows,
      structuresUrl: file.structures.sourceUrl,
      buildings: file.buildings.rows,
      buildingsUrl: file.buildings.sourceUrl,
    };
  } catch {
    cached = { retrieved: "", structures: [], structuresUrl: "", buildings: [], buildingsUrl: "" };
  }
  return cached;
}

// ---------------------------------------------------------------- SKYDB counts

export interface SkydbMetro {
  slug: string;
  city: string;
  over150m: number;
  over200m: number;
  over300m: number;
  medianYear?: number;
  earliest?: number;
  pctSince2000?: number;
  pctSince2010?: number;
  datedCount?: number;
}

export interface SkydbTotals {
  metros: number;
  over150m: number;
  over200m: number;
  over300m: number;
}

interface SkydbFile {
  generated?: string;
  source?: string;
  totals?: SkydbTotals;
  metros?: Record<string, Omit<SkydbMetro, "slug">>;
}

let skydbCache: { rows: SkydbMetro[]; totals: SkydbTotals; generated: string } | null = null;

/** Per-metro SKYDB counts. AGGREGATES ONLY - never a name, height or coordinate.
 *  Sorted by 150m+ count, because that is the question the board answers. */
export function getSkydb(): { rows: SkydbMetro[]; totals: SkydbTotals; generated: string } {
  if (skydbCache) return skydbCache;
  const empty = { metros: 0, over150m: 0, over200m: 0, over300m: 0 };
  try {
    const file = JSON.parse(
      readFileSync(join(dataDir, "skyscrapers.json"), "utf-8"),
    ) as SkydbFile;
    const rows = Object.entries(file.metros ?? {})
      .map(([slug, m]) => ({ slug, ...m }))
      .filter((m) => typeof m.over150m === "number")
      .sort((a, b) => b.over150m - a.over150m || b.over300m - a.over300m
        || a.city.localeCompare(b.city));
    skydbCache = { rows, totals: file.totals ?? empty, generated: file.generated ?? "" };
  } catch {
    skydbCache = { rows: [], totals: empty, generated: "" };
  }
  return skydbCache;
}
