"use client";

// NBA league map. Renders the 30 active franchises as markers at their
// home-arena coordinates with playoff-state colored rings. Wraps the
// existing MetroMap (Leaflet) so the visual layer matches the rest of the
// site without re-implementing tile / boundary plumbing.
//
// Coordinates are hardcoded for the 30 active arenas as of 2025-26. They
// rarely change; rebuild this list if a franchise relocates or opens a
// new venue. v2 should pull these from the workbook's Team List / Arenas
// lat-lng columns so the ETL keeps them fresh automatically.

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

const ARENA_COORDS: Record<string, { lat: number; lon: number }> = {
  // Atlantic
  "celtics":      { lat: 42.3662, lon: -71.0621 }, // TD Garden
  "nets":         { lat: 40.6826, lon: -73.9754 }, // Barclays Center
  "knicks":       { lat: 40.7505, lon: -73.9934 }, // Madison Square Garden IV
  "76ers":        { lat: 39.9012, lon: -75.1719 }, // Xfinity Mobile Arena
  "raptors":      { lat: 43.6435, lon: -79.3791 }, // Scotiabank Arena
  // Central
  "bulls":        { lat: 41.8807, lon: -87.6742 }, // United Center
  "cavaliers":    { lat: 41.4965, lon: -81.6882 }, // Rocket Mortgage Fieldhouse
  "pistons":      { lat: 42.3411, lon: -83.0553 }, // Little Caesars Arena
  "pacers":       { lat: 39.7640, lon: -86.1555 }, // Gainbridge Fieldhouse
  "bucks":        { lat: 43.0451, lon: -87.9171 }, // Fiserv Forum
  // Southeast
  "hawks":        { lat: 33.7573, lon: -84.3963 }, // State Farm Arena
  "hornets":      { lat: 35.2251, lon: -80.8392 }, // Spectrum Center
  "heat":         { lat: 25.7814, lon: -80.1870 }, // Kaseya Center
  "magic":        { lat: 28.5392, lon: -81.3839 }, // Kia Center
  "wizards":      { lat: 38.8981, lon: -77.0209 }, // Capital One Arena
  // Northwest
  "nuggets":      { lat: 39.7487, lon: -105.0077 }, // Ball Arena
  "timberwolves": { lat: 44.9795, lon: -93.2761 },  // Target Center
  "thunder":      { lat: 35.4634, lon: -97.5151 },  // Paycom Center
  "trail-blazers":{ lat: 45.5316, lon: -122.6668 }, // Moda Center
  "jazz":         { lat: 40.7683, lon: -111.9011 }, // Delta Center
  // Pacific
  "warriors":     { lat: 37.7680, lon: -122.3878 }, // Chase Center (SF)
  "clippers":     { lat: 34.0430, lon: -118.2673 }, // Crypto.com Arena (shared)
  "lakers":       { lat: 34.0430, lon: -118.2673 }, // Crypto.com Arena
  "suns":         { lat: 33.4457, lon: -112.0712 }, // Mortgage Matchup Center
  "kings":        { lat: 38.5802, lon: -121.4998 }, // Golden 1 Center
  // Southwest
  "mavericks":    { lat: 32.7905, lon: -96.8104 }, // American Airlines Center
  "rockets":      { lat: 29.7508, lon: -95.3621 }, // Toyota Center
  "grizzlies":    { lat: 35.1380, lon: -90.0506 }, // FedExForum
  "pelicans":     { lat: 29.9489, lon: -90.0820 }, // Smoothie King Center
  "spurs":        { lat: 29.4270, lon: -98.4375 }, // Frost Bank Center
};

export default function LeagueMap({ franchises, playoffState }: Props) {
  const points: MapPoint[] = franchises
    .map((f) => {
      const coords = ARENA_COORDS[f.slug];
      if (!coords) return null;
      return {
        slug: f.slug,
        name: f.display_name,
        lat: coords.lat,
        lon: coords.lon,
      } as MapPoint;
    })
    .filter((p): p is MapPoint => p !== null);

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
    <section className="mb-6">
      <MetroMap points={points} height={420} showConnections={false} />
      {legendItems.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
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
