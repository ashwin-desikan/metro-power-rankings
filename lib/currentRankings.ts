import "server-only";
import { getWorldRanking } from "./worldRankings";

// Current-world-ranking lookups for the sports whose ranking lives in a
// standalone federation file (IIHF ice hockey, WBSC baseball, FIFA women's
// football) rather than on the sport's own nation record. Keyed by the
// countries.json slug, which is what every ranking row carries.

const maps: Record<string, Map<string, number> | undefined> = {};

function slugMap(key: string): Map<string, number> {
  let m = maps[key];
  if (!m) {
    m = new Map<string, number>();
    for (const r of getWorldRanking(key).rows) {
      if (r.slug) m.set(r.slug, r.rank);
    }
    maps[key] = m;
  }
  return m;
}

/** Current world rank for a ranking file, by countries.json slug, or null. */
export function currentRank(key: string, countrySlug: string | null | undefined): number | null {
  if (!countrySlug) return null;
  return slugMap(key).get(countrySlug) ?? null;
}
