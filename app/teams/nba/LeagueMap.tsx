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


export default function LeagueMap({ franchises, playoffState }: Props) {
  const points: MapPoint[] = franchises
    .map((f) => {
      if (f.lat == null || f.lng == null) return null;
      return {
        slug: f.slug,
        name: f.display_name,
        lat: f.lat,
        lon: f.lng,
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
