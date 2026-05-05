// Classifies Team List + FootballClub_Data entries into the three
// marker categories used on the metro detail page map. Mirrors the
// logic that drives the written sections in app/rankings/[slug]/page.tsx
// (TeamsSection plus the annual-events lift into EventsSection):
//
//   - "venue"      → League === "Notable Venues" or "Historic Venues"
//                    (Notable Venues stay in the venue bucket regardless
//                    of the major-league flag, matching how the page
//                    renders Beaver Stadium, Cotton Bowl, etc.)
//                    Also catches Annual Event rows (F1 GPs, NASCAR,
//                    sailing regattas) since those are venue-anchored
//                    recurring events on the live site.
//   - "majorLeague"→ major === true and not a venue or annual entry
//   - "otherTeam"  → everything else (minor leagues, college, women's,
//                    international, foreign top flights via FootballClub_Data)
//
// The map renders only entries with valid lat/lng. Entries without
// coordinates fall back to the written sections only.

export type MarkerCategory = "majorLeague" | "otherTeam" | "venue";

export type TeamMarker = {
  lat: number;
  lng: number;
  name: string;
  sport: string;
  league: string;
  category: MarkerCategory;
};

type TeamLike = {
  sport: string;
  league: string;
  team: string;
  major: boolean;
  annual?: boolean;
  lat?: number;
  lng?: number;
};

export function classifyTeam(t: TeamLike): MarkerCategory {
  if (t.league === "Notable Venues" || t.league === "Historic Venues") return "venue";
  if (t.annual === true) return "venue";
  if (t.major) return "majorLeague";
  return "otherTeam";
}

export function buildMarkers(teams: readonly TeamLike[] | undefined): TeamMarker[] {
  if (!teams) return [];
  const out: TeamMarker[] = [];
  for (const t of teams) {
    if (typeof t.lat !== "number" || typeof t.lng !== "number") continue;
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
    if (t.lat === 0 && t.lng === 0) continue;
    out.push({
      lat: t.lat,
      lng: t.lng,
      name: t.team,
      sport: t.sport,
      league: t.league,
      category: classifyTeam(t),
    });
  }
  return out;
}

// Visual palette. Picked to read against the dark CARTO basemap and to
// stay distinct from the polygon fill (#4ECDC4) and tier accents in
// MetroMapInner. Major league = bright emerald, venues = warm amber,
// other teams = muted slate so dense metros don't flood the eye.
export const MARKER_COLORS: Record<MarkerCategory, string> = {
  majorLeague: "#10b981", // emerald-500
  venue: "#f59e0b",       // amber-500
  otherTeam: "#94a3b8",   // slate-400
};

export const MARKER_LABELS: Record<MarkerCategory, string> = {
  majorLeague: "Major League",
  otherTeam: "Other teams",
  venue: "Venues",
};
