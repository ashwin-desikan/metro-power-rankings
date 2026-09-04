import "server-only";

import { fetchEspnJson } from "@/lib/espnFetch";
import { emptySnapshot, shapeStandings, type StandingsSnapshot } from "@/lib/standingsShape";

export type { SeasonType, StandingsSnapshot, TeamStanding } from "@/lib/standingsShape";
export { shapeStandings } from "@/lib/standingsShape";

// 🔴 seasontype=2 IS LOAD-BEARING. Without it ESPN serves whichever season
// type its own calendar is currently in, and on 2026-09-04 that was the
// PRESEASON: this endpoint returned the Bills at 3-0 with 88 points for, and
// every surface reading this file presented those as the 2026 season --
// /sports/standings, /teams/nfl, and the live row on each franchise page.
// (The franchise page guard is `games_played > 0`, written to keep preseason
// out; it does not, because preseason rows are 3-0, not 0-0.)
//
// Measured the same day: `?seasontype=1` is byte-identical to no parameter at
// all, and `?seasontype=2` returns the real regular-season table, 0-0 until
// week 1. The payload's own `seasons[].types[]` carries the calendar --
// preseason 6 Aug to 6 Sep, regular season 6 Sep to 13 Jan -- so the default
// would have corrected itself on the Sunday. That is not a reason to leave it:
// it was wrong for the whole of August, and "it fixes itself in two days" is
// not a property to depend on in an undocumented API.
//
// Only the NFL is pinned. Checked the same day, MLB, NBA, NHL and WNBA already
// resolve their default to type 2, and their `types[]` windows come back stale
// (a 2027 season id carrying 2025-26 windows), so pinning those would be a
// guess rather than a fix. Postseason carries hasStandings=false in all five,
// so there is no January flip to guard against here.
const ESPN_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/football/nfl/standings?seasontype=2";

// Hourly ISR. NFL games at most 3-4x a week (Thu/Sun/Mon), so an hour gap
// between revalidations is fine. The 24h daily rebuild handles the floor.
const REVALIDATE_SECONDS = 1800;

export async function getCurrentNflStandings(): Promise<StandingsSnapshot> {
  // Live ESPN first, committed snapshot on failure -- see lib/espnFetch.ts.
  // A null return means both paths failed; the franchise page renders
  // without the live block in that case.
  const raw = await fetchEspnJson(ESPN_STANDINGS_URL, "nfl", REVALIDATE_SECONDS);
  if (raw == null) return emptySnapshot();
  return shapeStandings(raw);
}
