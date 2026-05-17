"use client";

// NBA league map. Renders the 30 active franchises as markers at their
// home-arena coordinates with playoff-state colored rings. Wraps the
// existing MetroMap (Leaflet) so the visual layer matches the rest of the
// site without re-implementing tile / boundary plumbing.
//
// Coordinates come from the MetroAreas.xlsx Team List sheet via the ETL.
// Each franchise carries its arena lat/lng on franchises.json; this component
// just maps those into the existing MetroMap (Leaflet) wrapper.

import MetroMap, { type MapPoint } from "../../MetroMap";
import type { Franchise, PlayoffStateRecord } from "@/lib/nba";

// Inlined from lib/nba (kept client-safe; lib/nba is server-only).
// Keep in sync with lib/nba PLAYOFF_STATE_COLORS.
const PLAYOFF_STATE_COLORS: Record<PlayoffStateRecord["state"], { bg: string; text: string; label: string }> = {
  champion:           { bg: "#d4af37", text: "#1a1408", label: "NBA Champion" },
  lost_finals:        { bg: "#a07a30", text: "#fff", label: "Lost Finals" },
  eliminated_cf:      { bg: "#5b5b5b", text: "#fff", label: "Eliminated Conf. Finals" },
  eliminated_semis:   { bg: "#5b5b5b", text: "#fff", label: "Eliminated Semifinals" },
  eliminated_qf:      { bg: "#5b5b5b", text: "#fff", label: "Eliminated First Round" },
  eliminated_play_in: { bg: "#5b5b5b", text: "#fff", label: "Eliminated Play-In" },
  active_finals:      { bg: "#d4af37", text: "#1a1408", label: "In the Finals" },
  active_cf:          { bg: "#3a5a8a", text: "#fff", label: "Conference Finals" },
  active_semis:       { bg: "#5b7aa8", text: "#fff", label: "Conference Semifinals" },
  active_qf:          { bg: "#6e8aa6", text: "#0c1320", label: "First Round" },
  active_play_in:     { bg: "#8aa1bd", text: "#0c1320", label: "Play-In" },
};


type Props = {
  franchises: Franchise[];
  playoffState: Record<string, PlayoffStateRecord>;
};

// Marker color contract. Gold for franchise home arenas mirrors the NHL
// LeagueMap pattern; pink for international venues so the two categories
// read at a glance. Both kept in sync with the legend chips below the map.
const TEAM_COLOR = "#d4af37";
const VENUE_COLOR = "#ec4899";

// NBA Global Games venues (regular-season + preseason international games),
// 1990 to present + the next scheduled slate. Coordinates either pulled from
// MetroAreas.xlsx Team List (when the venue already exists as a Notable
// Venues row) or sourced via training-data lookup and flagged for editorial
// verification. Co-op Live, The O2, Accor Arena, Uber Arena, Saitama Super
// Arena, and Tokyo Dome carry workbook coords; the remaining four are
// researched values that should land in Team List on the next workbook edit
// so the rest of the site picks them up via ETL.
const GLOBAL_GAMES_VENUES: Array<{ name: string; lat: number; lng: number; city: string }> = [
  { name: "Tokyo Dome",                   lat: 35.70564,  lng: 139.751891, city: "Tokyo, Japan" },
  { name: "Yokohama Arena",               lat: 35.5119,   lng: 139.6166,   city: "Yokohama, Japan" },
  { name: "Tokyo Metropolitan Gymnasium", lat: 35.6772,   lng: 139.7106,   city: "Tokyo, Japan" },
  { name: "Saitama Super Arena",          lat: 35.9636,   lng: 139.6306,   city: "Saitama, Japan" },
  { name: "Palacio de los Deportes",      lat: 19.4036,   lng: -99.0987,   city: "Mexico City, Mexico" },
  { name: "Arena Ciudad de México",       lat: 19.4825,   lng: -99.1907,   city: "Mexico City, Mexico" },
  { name: "The O2 Arena",                 lat: 51.5033,   lng: 0.0031,     city: "London, United Kingdom" },
  { name: "Co-op Live",                   lat: 53.483,    lng: -2.2,       city: "Manchester, United Kingdom" },
  { name: "Accor Arena",                  lat: 48.8386,   lng: 2.3786,     city: "Paris, France" },
  { name: "Uber Arena",                   lat: 52.5083,   lng: 13.4433,    city: "Berlin, Germany" },
];

export default function LeagueMap({ franchises, playoffState }: Props) {
  const teamPoints: MapPoint[] = franchises
    .map((f) => {
      if (f.lat == null || f.lng == null) return null;
      return {
        slug: f.slug,
        name: f.display_name,
        lat: f.lat,
        lon: f.lng,
        color: TEAM_COLOR,
      } as MapPoint;
    })
    .filter((p): p is MapPoint => p !== null);

  // Venue markers use a stable key prefix so they cannot collide with
  // franchise slugs in the React render key.
  const venuePoints: MapPoint[] = GLOBAL_GAMES_VENUES.map((v, i) => ({
    slug: `intl-venue-${i}`,
    name: `${v.name} — ${v.city}`,
    lat: v.lat,
    lon: v.lng,
    color: VENUE_COLOR,
  } as MapPoint));

  const points: MapPoint[] = [...teamPoints, ...venuePoints];

  // Build a quick legend of playoff-state colors actually present
  const activeStates = new Set(
    Object.values(playoffState)
      .filter((st) => st.state.startsWith("active_") || st.state === "champion")
      .map((st) => st.state)
  );
  const legendItems = Array.from(activeStates).map((state) => ({
    state,
    color: PLAYOFF_STATE_COLORS[state as keyof typeof PLAYOFF_STATE_COLORS],
  }));

  return (
    <section className="mb-6 mx-auto max-w-3xl">
      <MetroMap points={points} height={280} showConnections={false} />
      {/* Always-on category legend: gold = NBA home arena, pink = Global
          Games international venue. Sits above the playoff-state strip so
          readers parse the marker categories first, then the postseason
          state colors second. */}
      <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: TEAM_COLOR }} />
          NBA home arenas ({teamPoints.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: VENUE_COLOR }} />
          Global Games venues
        </span>
      </div>
      {legendItems.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
          {legendItems.map((item) => (
            <span key={item.state} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: item.color.bg }}
              />
              {item.color.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
