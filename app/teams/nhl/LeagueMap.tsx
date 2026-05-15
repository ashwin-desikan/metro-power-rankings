"use client";

// NHL league map. Renders the 32 active franchises plus Global Series
// venues (Stockholm, Helsinki, Tampere, Berlin, Prague) at their home
// arena / venue coordinates.

import MetroMap, { type MapPoint } from "../../MetroMap";
import type { Franchise } from "@/lib/nhl";

// International venues that have hosted NHL regular-season or preseason
// games (Global Series + NHL Premiere). Rendered as pink "venue" markers
// to mirror the NFL international-venues treatment.
const INTL_VENUES: Array<{ name: string; lat: number; lng: number; city: string }> = [
  { name: "Avicii Arena",                lat: 59.2934, lng: 18.0838, city: "Stockholm, Sweden" },
  { name: "Helsinki Halli",              lat: 60.2050, lng: 24.9258, city: "Helsinki, Finland" },
  { name: "Nokia Arena",                 lat: 61.4943, lng: 23.7700, city: "Tampere, Finland" },
  { name: "Uber Arena",                  lat: 52.5050, lng: 13.4435, city: "Berlin, Germany" },
  { name: "O2 Arena",                    lat: 50.1031, lng: 14.4944, city: "Prague, Czechia" },
];

type Props = {
  franchises: Franchise[];
};

export default function LeagueMap({ franchises }: Props) {
  const teamPoints: MapPoint[] = franchises
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

  // International venues use a stable key prefixed to avoid collision
  // with franchise slugs.
  const venuePoints: MapPoint[] = INTL_VENUES.map((v, i) => ({
    slug: `intl-venue-${i}`,
    name: `${v.name} — ${v.city}`,
    lat: v.lat,
    lon: v.lng,
    category: "venue",
  } as MapPoint));

  return (
    <section className="mb-6 mx-auto max-w-3xl">
      <MetroMap points={[...teamPoints, ...venuePoints]} height={320} showConnections={false} />
      <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#d4af37" }} />
          NHL home arenas (32)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#ec4899" }} />
          Global Series venues
        </span>
      </div>
    </section>
  );
}
