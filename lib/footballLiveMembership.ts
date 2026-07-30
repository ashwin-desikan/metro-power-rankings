// Shared 2026-27 membership derived from the LIVE api feed (live-standings-2026.json,
// via getClubStandings). Both the /teams/football index map and each per-country league-hub
// map inject this so they reflect the current season from the SAME source and update together.
// The OneDrive workbook's 2027 rows are still pre-season placeholders, so the map takes the
// current season from the live feed instead (workbook-sourced tables stay clamped until
// season end via lib/football MAX_DISPLAYED_YEAR).

import { getFootballClubByName } from "./football";
import type { LiveLeague, LiveRow } from "./clubFootballLive";

// The eight tracked European top flights are autumn-spring, so their 2026-27 season ends in
// 2027 — the season-end year the maps' per-year tier data is keyed on.
export const LIVE_SEASON_END_YEAR = 2027;

// Map scope, mirrored from the two map components (England full pyramid L1-5, Scotland L1-4,
// the other six L1-only in v0). Kept here so injected live membership never exceeds the tiers
// the maps actually colour.
const IN_SCOPE_LEVELS: Record<string, Set<number>> = {
  England: new Set([1, 2, 3, 4, 5]),
  Scotland: new Set([1, 2, 3, 4]),
  Spain: new Set([1]),
  Italy: new Set([1]),
  Germany: new Set([1]),
  France: new Set([1]),
  Netherlands: new Set([1]),
  Portugal: new Set([1]),
};

export const LIVE_MAP_COUNTRIES = new Set(Object.keys(IN_SCOPE_LEVELS));

// slug -> { level, country } for the current live season, restricted to the given countries and
// each country's in-scope tiers. First writer wins (top division listed first per league).
export function liveMembershipBySlug(
  clubStandings: LiveLeague[],
  countries: Set<string>,
): Map<string, { level: number; country: string }> {
  const out = new Map<string, { level: number; country: string }>();
  for (const lg of clubStandings) {
    const country = lg.country ?? "";
    if (!countries.has(country)) continue;
    const level = lg.level ?? 1;
    if (!(IN_SCOPE_LEVELS[country]?.has(level))) continue;
    for (const g of lg.groups) {
      for (const r of g.rows) {
        const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
        if (c?.slug && !out.has(c.slug)) out.set(c.slug, { level, country });
      }
    }
  }
  return out;
}

// The single live league row for a club this season (its current in-scope tier), used to inject a
// live 2026-27 season row on the club page from the SAME feed the maps and hub standings use.
export function liveSeasonForClub(
  clubStandings: LiveLeague[],
  slug: string,
): { league: LiveLeague; row: LiveRow } | null {
  for (const lg of clubStandings) {
    const country = lg.country ?? "";
    const level = lg.level ?? 1;
    if (!(IN_SCOPE_LEVELS[country]?.has(level))) continue;
    for (const g of lg.groups) {
      for (const r of g.rows) {
        const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
        if (c?.slug === slug) return { league: lg, row: r };
      }
    }
  }
  return null;
}
