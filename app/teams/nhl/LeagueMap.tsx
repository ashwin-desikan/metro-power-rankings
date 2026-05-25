"use client";

// NHL league map. Renders the 32 active franchises plus Global Series
// venues (Stockholm, Helsinki, Tampere, Berlin, Prague) at their home
// arena / venue coordinates.

import { useMemo, useState } from "react";
import MetroMap, { type MapPoint } from "../../MetroMap";
import type { Franchise } from "@/lib/nhl";
import YearFilterBar from "../_shared/YearFilterBar";

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

// Marker color contract — kept inline so the legend chips below the map
// match the rendered fills exactly.
const TEAM_COLOR = "#d4af37";
const VENUE_COLOR = "#ec4899";

export default function LeagueMap({ franchises }: Props) {
  const [seasonYear, setSeasonYear] = useState<string>("");
  const { minYear, maxYear } = useMemo(() => {
    let lo = 9999, hi = 0;
    for (const f of franchises) {
      // NHL uses `founded` rather than `founding_year`.
      const fy = (f as { founded?: number | null }).founded ?? null;
      if (fy && fy < lo) lo = fy;
      if (fy && fy > hi) hi = fy;
    }
    return { minYear: lo === 9999 ? 1910 : lo, maxYear: hi === 0 ? 2026 : Math.max(hi, 2026) };
  }, [franchises]);
  const sy = seasonYear ? parseInt(seasonYear, 10) : null;

  const teamPoints: MapPoint[] = franchises
    .map((f) => {
      const fy = (f as { founded?: number | null }).founded ?? null;
      if (sy !== null && (fy ?? 9999) > sy) return null;
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

  // International venues only when ALL year (= sy null).
  const venuePoints: MapPoint[] = sy === null
    ? INTL_VENUES.map((v, i) => ({
        slug: `intl-venue-${i}`,
        name: `${v.name} — ${v.city}`,
        lat: v.lat,
        lon: v.lng,
        color: VENUE_COLOR,
      } as MapPoint))
    : [];

  return (
    <section className="mb-6 mx-auto max-w-3xl">
      <MetroMap points={[...teamPoints, ...venuePoints]} height={320} showConnections={false} />
      {/* Year filter UI temporarily disabled; see NFL LeagueMap note + BACKLOG. */}
      {/* <YearFilterBar seasonYear={seasonYear} setSeasonYear={setSeasonYear} minYear={minYear} maxYear={maxYear} /> */}
      <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: TEAM_COLOR }} />
          NHL home arenas ({teamPoints.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: VENUE_COLOR }} />
          Global Series venues
        </span>
      </div>
    </section>
  );
}
