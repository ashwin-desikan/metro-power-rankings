import "server-only";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import type { Pop2100, Pop2100Index } from "./population2100Shape";

// Population to 2100 per country: UN WPP 2024 probabilistic projections,
// built by scripts/countries/build_population_2100.py. Read at build time
// like the rest of lib/countries; one small file per country, so the path is
// spelled inline with literal directory segments and the slug as the only
// dynamic LEAF (scripts/DATA-READS-RECIPE.md): the tracer bundles the
// pop2100 directory (about 6 MB), never all of public/data.


export function getPopulation2100(slug: string): Pop2100 | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "countries", "pop2100", `${slug}.json`), "utf-8"),
    ) as Pop2100;
  } catch {
    return null;
  }
}

let _index: Pop2100Index | null | undefined;
let _indexMtime = 0;
export function getPopulation2100Index(): Pop2100Index | null {
  // In development a rebuilt index.json is picked up on the next request
  // (the module cache otherwise served a stale board for a whole session on
  // 2026-09-10); in production the file cannot change under the process.
  // Both calls spell the literal path inline for the tracer (DATA-READS-RECIPE).
  if (process.env.NODE_ENV === "development") {
    try {
      const m = statSync(join(process.cwd(), "public", "data", "countries", "pop2100", "index.json")).mtimeMs;
      if (m !== _indexMtime) { _indexMtime = m; _index = undefined; }
    } catch { /* fall through to the read below */ }
  }
  if (_index !== undefined) return _index;
  try {
    _index = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "countries", "pop2100", "index.json"), "utf-8"),
    ) as Pop2100Index;
  } catch {
    _index = null;
  }
  return _index;
}
